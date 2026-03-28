type AsyncFactory<T> = () => T | Promise<T>;

/**
 * SingleFlight deduplicates concurrent async operations by key.
 *
 * For the same key:
 * - The first caller executes the factory function.
 * - Subsequent callers receive the same in-flight Promise.
 *
 * Once the Promise settles (resolve/reject), the entry is removed,
 * so future calls will execute again.
 *
 * Important:
 * - This is NOT a cache. Results are not stored after completion.
 * - This does NOT cancel ongoing operations.
 */
export class SingleFlight<K extends PropertyKey = string> {
  private inFlight = new Map<K, Promise<unknown>>();

  /**
   * Executes the given function in a single-flight manner.
   *
   * If another call with the same key is already in progress,
   * this method returns the same Promise instead of calling `fn` again.
   *
   * @param key - Identifier for the operation
   * @param fn - Function to execute
   * @returns The resolved value of the shared Promise
   */
  async do<T>(key: K, fn: AsyncFactory<T>): Promise<T> {
    const existing = this.inFlight.get(key) as Promise<T> | undefined;

    if (existing) {
      return existing;
    }

    const promise = Promise.resolve()
      .then(fn)
      .finally(() => {
        this.inFlight.delete(key);
      });

    this.inFlight.set(key, promise);

    return promise;
  }

  /**
   * Wraps an async function with single-flight behavior
   *
   * The returned function:
   * - derives a key from arguments using `keyGetter`
   * - ensures only one in-flight execution per key
   * - shared the same Promise for concurrent calls
   *
   * @param fn - Original function
   * @param keyGetter - Function to derive key from arguments
   */
  wrap<Args extends unknown[], Result>(
    fn: (...args: Args) => Result | Promise<Result>,
    keyGetter: (...args: Args) => K,
  ) {
    return (...args: Args): Promise<Result> => {
      const key = keyGetter(...args);
      return this.do(key, () => fn(...args));
    };
  }

  /**
   * Clears all in-flight entries.
   *
   * Important:
   * - This does NOT cancel any ongoing operations.
   * - It only clears the internal tracking map.
   */
  clear(): void {
    this.inFlight.clear();
  }

  /**
   * Removes the in-flight entry for a specific key.
   *
   * Important:
   * - This does NOT cancel the underlying async operation.
   * - It only removes tracking from the registry.
   * - A subsequent call with the same key will trigger a new execution.
   */
  forget(key: K): void {
    this.inFlight.delete(key);
  }

  /**
   * Checks whether there is an in-flight operation for the given key.
   */
  has(key: K): boolean {
    return this.inFlight.has(key);
  }
}
