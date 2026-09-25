import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: ["password-recovery.spec.ts", "auth.spec.ts"],
  timeout: 30_000,
  workers: 2,
  use: { baseURL: "http://127.0.0.1:3100", ...devices["Desktop Chrome"] },
  webServer: [
    {
      command: "node tests/fixtures/recovery-server.mjs",
      url: "http://127.0.0.1:54331/health",
      reuseExistingServer: false,
    },
    {
      command: "npm run build && npm run start -- --port 3100",
      url: "http://127.0.0.1:3100",
      timeout: 180_000,
      reuseExistingServer: false,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54331",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test-public-key",
        SUPABASE_SERVICE_ROLE_KEY: "test-service-key",
      },
    },
  ],
});
