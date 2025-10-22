import { defineConfig } from 'vite'
import { resolve } from 'path'
import commonjs from '@rollup/plugin-commonjs'

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: false, // clean old build files
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        select: resolve(__dirname, 'select.html'),
        saves: resolve(__dirname, 'saves.html'),
        load: resolve(__dirname, 'load.html')
      },
      external: ['plist', 'plist-parse', 'pend', 'fd-slicer']
    },
  },
  resolve: {
    alias: {
      three: resolve('./node_modules/three')
    }
  },
  optimizeDeps: {
    include: ['three']
  }
})