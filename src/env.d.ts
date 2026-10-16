// CSS imported as a string (`import css from './x.css?inline'`): handled by @tsdown/css in builds and Vite in tests.
declare module '*.css?inline' {
  const css: string;
  export default css;
}
