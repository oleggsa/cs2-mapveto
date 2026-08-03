import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages project sites are served from https://<user>.github.io/<repo>/,
  // so the build needs to know that subpath. Set via the deploy workflow.
  base: process.env.VITE_BASE_PATH || '/',
})
