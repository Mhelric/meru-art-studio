import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (/node_modules[\\/]react(-dom)?[\\/]/.test(id)) {
              return 'vendor-react';
            }
            if (/node_modules[\\/]framer-motion[\\/]/.test(id)) {
              return 'vendor-motion';
            }
            if (/node_modules[\\/]@tanstack[\\/]react-query[\\/]/.test(id)) {
              return 'vendor-query';
            }
            if (/node_modules[\\/]@supabase[\\/]supabase-js[\\/]/.test(id)) {
              return 'vendor-supabase';
            }
            if (/node_modules[\\/](lucide-react|simple-icons)[\\/]/.test(id)) {
              return 'vendor-icons';
            }
            return 'vendor-misc';
          }
        },
      },
    },
  },
});
