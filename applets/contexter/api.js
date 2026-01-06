/**
 * TypeScript Applet Bridge
 *
 * This file bridges the compiled TypeScript API to the qoom2 applet system.
 *
 * How it works:
 * 1. Server discovers this api.js file in the applet root
 * 2. This file re-exports the compiled API from dist/api.js
 * 3. Compiled API follows standard qoom2 route definition format
 *
 * Build process:
 * - TypeScript source in src/ is compiled to dist/
 * - This wrapper remains static (no build-time generation)
 * - Server loads this wrapper, which loads compiled code
 */

export { default } from './dist/api.js';
