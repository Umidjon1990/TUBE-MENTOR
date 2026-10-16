import { defineConfig, devices } from "@playwright/test";
import { randomBytes } from "node:crypto";
// Random per-run demo credentials are shared only with workers and the local server.
for (const role of ["ADMIN", "TEACHER", "STUDENT"]) {
  process.env[`TUBE_DEMO_${role}_PASSWORD`] ||= randomBytes(32).toString("hex");
}
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60000,
  expect: { timeout: 10000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:5010",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      args: [
        "--no-sandbox",
        "--use-fake-ui-for-media-stream",
        "--use-fake-device-for-media-stream",
      ],
      ...(process.env.PLAYWRIGHT_EXECUTABLE_PATH
        ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH }
        : {}),
    },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run demo",
    url: "http://127.0.0.1:5010/api/health",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      PORT: "5010",
      DEMO_DB_PORT: "55433",
      DEMO_EPHEMERAL: "true",
      TUBE_DEMO_ADMIN_PASSWORD: process.env.TUBE_DEMO_ADMIN_PASSWORD!,
      TUBE_DEMO_TEACHER_PASSWORD: process.env.TUBE_DEMO_TEACHER_PASSWORD!,
      TUBE_DEMO_STUDENT_PASSWORD: process.env.TUBE_DEMO_STUDENT_PASSWORD!,
      APP_URL: "http://127.0.0.1:5010",
      ALLOW_SIGNUP: "false",
      RESEND_API_KEY: "",
      GOOGLE_CLIENT_ID: "",
      TELEGRAM_CLIENT_ID: "",
      TELEGRAM_CLIENT_SECRET: "",
    },
  },
});
