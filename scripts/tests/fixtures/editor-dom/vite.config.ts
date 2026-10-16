import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  root:new URL('.',import.meta.url).pathname,
  plugins:[react()],
  server:{host:'127.0.0.1',port:4176,strictPort:true,fs:{allow:[new URL('../../../../',import.meta.url).pathname]}},
});
