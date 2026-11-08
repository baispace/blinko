import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import { rename } from 'node:fs/promises';

function publicBlogBoundary(): Plugin {
  return {
    name: 'public-blog-boundary',
    async writeBundle(options) {
      if (!options.dir) return;
      await rename(path.join(options.dir, 'blog.html'), path.join(options.dir, 'index.html'));
    },
    generateBundle(_options, bundle) {
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const moduleId of Object.keys(output.modules)) {
          if (/\/src\/(?:store\/|components\/Common\/Editor\/|components\/BlinkoEditor\/)/.test(moduleId)) {
            this.error(`Public blog unexpectedly imports workspace code: ${moduleId}`);
          }
        }
      }

    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), publicBlogBoundary()],
  define: { 'import.meta.env.VITE_BLOG_BASE_PATH': JSON.stringify(process.env.VITE_BLOG_BASE_PATH || '/') },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  preview: {
    host: "127.0.0.1",
    port: 4174,
    proxy: { "/api": "http://127.0.0.1:1111" },
  },
  build: {
    outDir: '../dist/blog',
    emptyOutDir: true,
    rollupOptions: { input: path.resolve(__dirname, 'blog.html') },
  },
});
