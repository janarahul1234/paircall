import { defineConfig, devices } from "@playwright/test";

/**
 * Config for the end-to-end pairing test in `tests/` only — it is deliberately
 * not part of `npm run build` or the app bundle.
 *
 * One worker: every test needs several live contexts at the same time against a
 * single dev server, and call codes are shared state between them.
 *
 * The browser is launched with fake camera/microphone devices so the media path
 * is real WebRTC without needing hardware, and audio is muted to stay silent.
 */
export default defineConfig({
  testDir: "./tests",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 180_000,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:3000",
    permissions: ["camera", "microphone"],
    screenshot: "only-on-failure",
    video: "off",
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-fake-ui-for-media-stream",
            "--use-fake-device-for-media-stream",
            "--autoplay-policy=no-user-gesture-required",
            "--mute-audio",
          ],
        },
      },
    },
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    // Reuse a `npm run dev` you already have open instead of failing on the port.
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
