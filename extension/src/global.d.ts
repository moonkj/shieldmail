// Build-time constants injected by Vite's `define` config.
declare const __SHIELDMAIL_DEV__: boolean;

// Vite ?inline CSS imports return the CSS source as a string.
declare module "*.css?inline" {
  const css: string;
  export default css;
}
declare module "*.css" {
  const css: string;
  export default css;
}
