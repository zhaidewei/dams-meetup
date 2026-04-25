import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // server-only 主入口 throw 拦截 client import；node 测试里 stub 成空
      'server-only': resolve(__dirname, 'tests/stubs/server-only.ts'),
    },
  },
})
