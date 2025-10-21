import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'), 
        select: resolve(__dirname, 'select.html'), 
        saves: resolve(__dirname, 'saves.html'),
        load: resolve(__dirname, 'load.html')
      },
    },
  },
})
