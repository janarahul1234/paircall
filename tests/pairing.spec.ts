import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The one flow that unit-level review cannot cover: two real browser contexts
 * pairing over WebRTC, plus a third being turned away by the 2-person cap.
 *
 * Each context is a separate tab-equivalent, so sessionStorage (display name +
 * "am I the host") is isolated per participant, exactly like two windows.
 * Camera and microphone come from Chromium's fake devices, so the media leg is
 * genuine peer-to-peer WebRTC without needing hardware.
 */

const HOST_NAME = "Aarav";
const GUEST_NAME = "Bela";
const OUTSIDER_NAME = "Chen";

/** Signalling goes through the public PeerJS cloud, so pairing can be slow. */
const CONNECT_TIMEOUT_MS = 60_000;

const CONTEXT_OPTIONS = {
  baseURL: "http://localhost:3000",
  permissions: ["camera", "microphone"],
  viewport: { width: 1280, height: 800 },
};

type VideoInfo = { width: number; height: number; muted: boolean };

/** Console errors + uncaught exceptions, so a green test also means a clean run. */
function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`console: ${message.text()}`);
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
  return errors;
}

async function enterName(page: Page, name: string): Promise<void> {
  await page.goto("/");
  await page.getByLabel("Your name").fill(name);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("heading", { name: `Hi ${name}, what would you like to do?` })
  ).toBeVisible();
}

/**
 * Walks the host flow up to the pre-join screen and returns the minted code.
 *
 * Headlines are matched by role rather than bare text because Next's route
 * announcer mirrors the current title into a `role="alert"` live region, which
 * would make a plain text locator ambiguous.
 */
async function createCall(page: Page): Promise<string> {
  await page.getByRole("button", { name: /Create new call/ }).click();
  await expect(page).toHaveURL(/\/call\/[A-Z2-9]{7}$/);
  await expect(page.getByRole("heading", { name: "Your call is ready" })).toBeVisible({
    timeout: 30_000,
  });
  const code = new URL(page.url()).pathname.split("/").pop() ?? "";
  expect(code).toMatch(/^[A-Z2-9]{7}$/);
  return code;
}

async function joinByCode(page: Page, code: string): Promise<void> {
  await page.getByLabel("Enter call code").fill(code);
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/call/${code}$`));
  await expect(page.getByRole("heading", { name: `Joining ${code}` })).toBeVisible({
    timeout: 30_000,
  });
}

/** Presses the pre-join CTA once the fake camera is actually live. */
async function pressJoin(page: Page, label: "Start call" | "Join call"): Promise<void> {
  const cta = page.getByRole("button", { name: label, exact: true });
  await expect(cta).toBeEnabled({ timeout: 30_000 });
  await cta.click();
}

/** `00:12` or `1:05:12`. Anchored so nothing else on the stage matches. */
const CLOCK_PATTERN = /^(\d{1,2}:)?\d{2}:\d{2}$/;

/** The running duration. Only rendered once `startedAt` is set, i.e. paired. */
function callClock(page: Page): Locator {
  return page.getByText(CLOCK_PATTERN);
}

async function readClock(page: Page): Promise<string | null> {
  return callClock(page).first().textContent();
}

async function expectConnected(page: Page, peerName: string): Promise<void> {
  await expect(page.getByRole("status")).toContainText(`Connected with ${peerName}`, {
    timeout: CONNECT_TIMEOUT_MS,
  });
  // Name of the partner, on/over the main video.
  await expect(page.getByText(peerName, { exact: true })).toBeVisible();
  await expect(page.getByText("Connected", { exact: true })).toBeVisible();
}

/** Any unmuted <video> with real dimensions is the incoming remote stream. */
async function remotePicture(page: Page): Promise<VideoInfo | undefined> {
  return page.evaluate(() => {
    const found = Array.from(document.querySelectorAll("video")).find(
      (element) => !element.muted && element.videoWidth > 0
    );
    if (!found) return undefined;
    return { width: found.videoWidth, height: found.videoHeight, muted: found.muted };
  });
}

test("two people pair, see each other's names, and a third is refused", async ({ browser }) => {
  test.setTimeout(180_000);

  const host = await browser.newContext(CONTEXT_OPTIONS);
  const guest = await browser.newContext(CONTEXT_OPTIONS);
  const outsider = await browser.newContext(CONTEXT_OPTIONS);
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();
  const outsiderPage = await outsider.newPage();
  const hostErrors = collectErrors(hostPage);
  const guestErrors = collectErrors(guestPage);
  const outsiderErrors = collectErrors(outsiderPage);

  /* ------------------------------------------------------------ 1. host -- */

  await enterName(hostPage, HOST_NAME);
  const code = await createCall(hostPage);
  await pressJoin(hostPage, "Start call");

  await expect(
    hostPage.getByRole("heading", { name: "Waiting for someone to join" })
  ).toBeVisible({ timeout: 30_000 });
  await expect(hostPage.getByText("Waiting for participant", { exact: true })).toBeVisible();
  // The clock is deliberately absent while nobody has paired.
  await expect(callClock(hostPage)).toHaveCount(0);

  /* ------------------------------------------------------------ 2. guest -- */

  await enterName(guestPage, GUEST_NAME);
  await joinByCode(guestPage, code);
  await pressJoin(guestPage, "Join call");

  await expectConnected(hostPage, GUEST_NAME);
  await expectConnected(guestPage, HOST_NAME);

  // Waiting screen gives way to the stage, and the local name stays visible.
  await expect(
    hostPage.getByRole("heading", { name: "Waiting for someone to join" })
  ).toHaveCount(0);
  await expect(hostPage.getByText(`${HOST_NAME} (you)`, { exact: true })).toBeVisible();
  await expect(guestPage.getByText(`${GUEST_NAME} (you)`, { exact: true })).toBeVisible();

  /* ---------------------------------------------------- 3. clock advances -- */

  const firstTick = await readClock(hostPage);
  expect(firstTick).toMatch(CLOCK_PATTERN);
  await hostPage.waitForTimeout(2_500);
  const secondTick = await readClock(hostPage);
  expect(secondTick).not.toBe(firstTick);

  // A healthy first connect gets one stream event per track. That must not be
  // mistaken for a recovery: the announcement has to still name the partner.
  await expect(hostPage.getByRole("status")).toContainText(`Connected with ${GUEST_NAME}`);
  await expect(guestPage.getByRole("status")).toContainText(`Connected with ${HOST_NAME}`);

  /* ------------------------------------------------------- 4. real media --- */

  await expect
    .poll(() => remotePicture(hostPage), { timeout: CONNECT_TIMEOUT_MS })
    .toBeTruthy();
  await expect.poll(() => remotePicture(guestPage), { timeout: CONNECT_TIMEOUT_MS }).toBeTruthy();

  /* ------------------------------------------- 5. a third person is refused -- */

  await enterName(outsiderPage, OUTSIDER_NAME);
  await joinByCode(outsiderPage, code);
  await pressJoin(outsiderPage, "Join call");

  await expect(
    outsiderPage.getByRole("heading", { name: "This call already has two people" })
  ).toBeVisible({ timeout: CONNECT_TIMEOUT_MS });

  // The existing pair must survive a refused join untouched.
  await expect(hostPage.getByText("Connected", { exact: true })).toBeVisible();
  await expect(guestPage.getByText("Connected", { exact: true })).toBeVisible();

  /* --------------------------------------------------------------- clean -- */

  expect(hostErrors, hostErrors.join("\n")).toEqual([]);
  expect(guestErrors, guestErrors.join("\n")).toEqual([]);
  expect(outsiderErrors, outsiderErrors.join("\n")).toEqual([]);

  await host.close();
  await guest.close();
  await outsider.close();
});
