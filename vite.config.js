import { defineConfig } from 'vite'
import { resolve } from 'path'
import commonjs from '@rollup/plugin-commonjs'
import wasm from 'vite-plugin-wasm'
import topLevelAwait from 'vite-plugin-top-level-await'

import NodeGlobalsPolyfillPlugin from '@esbuild-plugins/node-globals-polyfill';
import NodeModulesPolyfillPlugin from '@esbuild-plugins/node-modules-polyfill';
import rollupNodePolyFill from 'rollup-plugin-polyfill-node';

export default defineConfig({
  root: '.',
  base: './',
  publicDir: 'public',
  plugins: [
    wasm(),
    topLevelAwait(),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: false, // clean old build files
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        select: resolve(__dirname, 'select.html'),
        saves: resolve(__dirname, 'saves.html'),
        load: resolve(__dirname, 'load.html'),
        "game-launcher": resolve(__dirname, 'game-launcher', 'main.html')
      },
      external: ['plist', 'plist-parse', 'pend', 'fd-slicer'],
      plugins: [
        rollupNodePolyFill()
      ]
    },
    target: 'esnext',
    commonjsOptions: {
      transformMixedEsModules: true // helps with some CJS/ESM interop
    }
  },
  resolve: {
    alias: {
      three: resolve('./node_modules/three'),
      buffer: 'buffer',
      process: 'process/browser',
      util: 'util',
      assert: 'assert',
    }
  },
  optimizeDeps: {
    include: [
      // force pre-bundling for libraries that might use Node features
      'three',
      'antlr4ts',
      'java-ast'
    ],
    esbuildOptions: {
      define: {
        global: 'globalThis'
      },
      plugins: [
        NodeGlobalsPolyfillPlugin({ process: true, buffer: true }),
        NodeModulesPolyfillPlugin()
      ]
    }
  }
})