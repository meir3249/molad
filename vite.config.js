import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative base so the built bundle works from any URL prefix.
  //
  // GitHub Pages serves a project site from https://<user>.github.io/<repo>/,
  // not from the domain root, so the default base ('/') would make
  // index.html request /assets/index-*.js and 404. './' makes every
  // generated asset URL relative to index.html instead, which keeps the
  // build correct whether it is served from the root, from /<repo>/, or
  // from a renamed repository - no rebuild needed, and no repo name
  // hardcoded anywhere.
  //
  // Vite resolves a relative base to '/' during `vite dev`, so the dev
  // server is unaffected.
  base: './',
  plugins: [react(), tailwindcss()],
})
