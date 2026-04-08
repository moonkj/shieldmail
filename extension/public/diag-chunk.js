// Sibling module imported by diag-module.js to test module-to-module static import
export const chunkValue = 'chunk-loaded-' + Date.now();
export function chunkPing() {
  return 'pong';
}
