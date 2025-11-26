import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../internal/server/static/dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      // In dev: run `./cerebro start --port 3000` then `pnpm dev`
      '/api': 'http://127.0.0.1:3000',
    },
  },
})
