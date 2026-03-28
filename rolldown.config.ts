import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';

export default defineConfig([
  {
    input: { index: 'src/index.ts' },
    output: {
      dir: 'dist/esm',
      format: 'esm',
      entryFileNames: '[name].js',
    },
  },
  {
    input: { index: 'src/index.ts' },
    output: {
      dir: 'dist/cjs',
      format: 'cjs',
      entryFileNames: '[name].cjs',
      exports: 'named',
    },
  },
  {
    input: { index: 'src/index.ts' },
    plugins: [dts()],
    output: {
      dir: 'dist',
      format: 'esm',
    },
  },
]);
