import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
export default defineConfig({resolve:{dedupe:['react','react-dom']},plugins:[react()],base:'./',server:{fs:{allow:[fileURLToPath(new URL('..',import.meta.url))]}}});
