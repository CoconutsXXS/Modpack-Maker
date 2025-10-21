import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  root: path.join(__dirname),
  base: '',
  build: {
    outDir: path.join(__dirname),
    emptyOutDir: false
  },
  server: {
    port: 5173
  }
});
