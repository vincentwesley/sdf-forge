import { defineConfig, devices } from '@playwright/test';

// Software WebGL (SwiftShader) so tests run on machines without a GPU, like CI.
const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: process.env.CI ? 2 : 3,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:4173/sdf-forge/',
    trace: 'off',
    launchOptions: { args },
    viewport: { width: 1366, height: 820 },
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: /(perf|heavy)\.spec/,
      use: { ...devices['Desktop Chrome'], launchOptions: { args } },
    },
    // frame-rate checks and the slow video export run last, one project at a time, so nothing steals the CPU
    {
      name: 'perf',
      testMatch: /perf\.spec/,
      dependencies: ['chromium'],
      use: { ...devices['Desktop Chrome'], launchOptions: { args } },
    },
    {
      name: 'heavy',
      testMatch: /heavy\.spec/,
      dependencies: ['perf'],
      use: { ...devices['Desktop Chrome'], launchOptions: { args } },
    },
  ],
  webServer: {
    command: 'node scripts/serve-dist.mjs',
    url: 'http://localhost:4173/sdf-forge/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
