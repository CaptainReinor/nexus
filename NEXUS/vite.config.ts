import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({ resolve: {dedupe:['react','react-dom']}, plugins: [react()], base: './', build: { outDir: 'dist' }, test: { environment: 'jsdom' } });
