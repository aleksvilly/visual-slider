import { defineConfig } from 'astro/config';
import vue from '@astrojs/vue';

const isGitHubPages = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  site: isGitHubPages ? 'https://aleksvilly.github.io' : undefined,
  base: isGitHubPages ? '/visual-slider/' : '/',
  integrations: [vue()],
});
