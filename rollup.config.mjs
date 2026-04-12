import typescript from '@rollup/plugin-typescript';
import terser from '@rollup/plugin-terser';
import postcss from 'rollup-plugin-postcss';

const input = 'src/index.ts';

export default {
  input,
  output: [
    {
      file: 'dist/index.mjs',
      format: 'esm',
      sourcemap: true,
    },
    {
      file: 'dist/index.cjs',
      format: 'cjs',
      sourcemap: true,
      exports: 'named',
    },
  ],
  plugins: [
    postcss({
      extract: 'location-picker.css',
      minimize: true,
    }),
    typescript({
      tsconfig: './tsconfig.json',
      declaration: true,
      declarationDir: 'dist',
      rootDir: 'src',
      sourceMap: true,
      exclude: ['**/__tests__/**', '**/*.test.ts'],
    }),
    terser(),
  ],
};
