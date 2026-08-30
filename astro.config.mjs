import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';
import vue from '@astrojs/vue';

export default defineConfig({
  output: 'server',
  adapter: vercel(),
  integrations: [vue()],
});
