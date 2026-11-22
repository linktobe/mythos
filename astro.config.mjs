// @ts-check
import { defineConfig } from 'astro/config';

// 纯静态输出：构建产物 dist/ 直接丢给 Cloudflare Pages，不需要 adapter。
export default defineConfig({
  site: 'https://mythos.pages.dev',
  output: 'static',
  compressHTML: true,
  build: {
    // 小站不需要把 CSS 拆得太碎
    inlineStylesheets: 'auto',
  },
});
