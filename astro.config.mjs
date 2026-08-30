import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

export default defineConfig({
  site: 'https://aleksvilly.github.io',
  base: '/visual-slider/',
  integrations: [vue()],
});
