import { describe, expect, it, vi } from 'vitest';
import { SingleFlight } from '.';

describe('SingleFlight', () => {
  it('deduplicates concurrent calls with the same key', async () => {
    const sf = new SingleFlight();

    const fn = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'ok';
    });

    const [a, b, c] = await Promise.all([sf.do('user:1', fn), sf.do('user:1', fn), sf.do('user:1', fn)]);

    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(c).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('executes separately for different keys', async () => {
    const sf = new SingleFlight();

    const fn = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'ok';
    });

    const [a, b, c] = await Promise.all([sf.do('user:1', fn), sf.do('user:1', fn), sf.do('user:2', fn)]);

    expect(a).toBe('ok');
    expect(b).toBe('ok');
    expect(c).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('removes entry from inFlight after success', async () => {
    const sf = new SingleFlight();

    const fn = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'ok';
    });

    await expect(sf.do('user:1', fn)).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sf.has('user:1')).toBeFalsy();
  });

  it('removes entry from inFlight after failure', async () => {
    const sf = new SingleFlight();

    const fn = vi.fn(async () => {
      await new Promise((_, reject) => setTimeout(() => reject(new Error('rejected')), 10));
      return 'ok';
    });

    await expect(sf.do('user:1', fn)).rejects.toThrow('rejected');
    expect(sf.has('user:1')).toBeFalsy();
  });

  it('re-executes after failure on the same key', async () => {
    const sf = new SingleFlight<string>();

    const fn = vi.fn<() => Promise<string>>().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('ok');

    await expect(sf.do('user:1', fn)).rejects.toThrow('boom');
    await expect(sf.do('user:1', fn)).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('forget removes tracking but does not cancel the original operation', async () => {
    const sf = new SingleFlight<string>();

    let resolveFirst!: (value: string) => void;
    let notifyReady!: () => void;

    const ready = new Promise<void>(resolve => {
      notifyReady = resolve;
    });

    const first = sf.do(
      'user:1',
      () =>
        new Promise<string>(resolve => {
          resolveFirst = resolve;
          notifyReady();
        }),
    );

    expect(sf.has('user:1')).toBe(true);

    sf.forget('user:1');

    expect(sf.has('user:1')).toBe(false);

    await ready;

    const fn = vi.fn(async () => 'second');
    const second = sf.do('user:1', fn);

    resolveFirst('first');

    await expect(first).resolves.toBe('first');
    await expect(second).resolves.toBe('second');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('clear removes all inFlight tracking', async () => {
    const sf = new SingleFlight<string>();

    let resolveA!: (value: string) => void;
    let notifyReadyA!: () => void;
    let resolveB!: (value: string) => void;
    let notifyReadyB!: () => void;

    const readyA = new Promise<void>(resolve => {
      notifyReadyA = resolve;
    });
    const readyB = new Promise<void>(resolve => {
      notifyReadyB = resolve;
    });

    sf.do(
      'a',
      () =>
        new Promise<string>(r => {
          resolveA = r;
          notifyReadyA();
        }),
    );

    sf.do(
      'b',
      () =>
        new Promise<string>(r => {
          resolveB = r;
          notifyReadyB();
        }),
    );

    expect(sf.has('a')).toBe(true);
    expect(sf.has('b')).toBe(true);

    sf.clear();

    expect(sf.has('a')).toBe(false);
    expect(sf.has('b')).toBe(false);

    await readyA;
    await readyB;

    resolveA('A');
    resolveB('B');
  });

  it('wrap deduplicates calls based on derived key', async () => {
    const sf = new SingleFlight<`user:${string}`>();

    const fn = vi.fn(async (id: string) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return { id };
    });

    const wrapped = sf.wrap(fn, id => `user:${id}` as const);

    const [a, b, c] = await Promise.all([wrapped('1'), wrapped('1'), wrapped('1')]);

    expect(a).toEqual({ id: '1' });
    expect(b).toEqual({ id: '1' });
    expect(c).toEqual({ id: '1' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('wrap executes separately for different keys', async () => {
    const sf = new SingleFlight<`user:${string}`>();

    const fn = vi.fn(async (id: string) => ({ id }));
    const wrapped = sf.wrap(fn, id => `user:${id}` as const);

    const [a, b] = await Promise.all([wrapped('1'), wrapped('2')]);

    expect(a).toEqual({ id: '1' });
    expect(b).toEqual({ id: '2' });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('wrap supports sync functions', async () => {
    const sf = new SingleFlight<string>();
    const fn = vi.fn((id: string) => ({ id }));
    const wrapped = sf.wrap(fn, id => id);

    const [a, b] = await Promise.all([wrapped('1'), wrapped('1')]);

    expect(a).toEqual({ id: '1' });
    expect(b).toEqual({ id: '1' });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('cleans up after synchronous throw', async () => {
    const sf = new SingleFlight<string>();
    const fn = vi.fn(() => {
      throw new Error('boom');
    });

    await expect(sf.do('x', fn)).rejects.toThrow('boom');
    expect(sf.has('x')).toBe(false);
  });
});
