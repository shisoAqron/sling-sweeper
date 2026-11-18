import { defineConfig } from 'vitest/config';

// GitHub Pages のサブパス配信（/sling-sweeper/）でも動くよう、アセットは相対パスで参照する。
export default defineConfig({
  base: './',
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
