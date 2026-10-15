import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/app-v12.js',
        chunkFileNames: 'assets/[name]-v12.js',
        assetFileNames: 'assets/[name]-v12.[ext]',
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-storage': ['dexie', 'dexie-react-hooks'],
          'vendor-icons': ['lucide-react'],
        },
      },
    },
  },
});
