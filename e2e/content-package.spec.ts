import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
test("admin imports and publishes JSON; aligned subtitles pause video and highlight both languages", async ({
  page,
}) => {
  await page.request.post("/api/auth/login", {
    data: { username: "demo_admin", password: process.env.TUBE_DEMO_ADMIN_PASSWORD! },
  });
  await page.addInitScript(() => {
    (window as any).__pauses = 0;
    (window as any).YT = {
      Player: class {
        constructor(_id: any, options: any) {
          setTimeout(() => options.events.onReady(), 0);
        }
        pauseVideo() {
          (window as any).__pauses++;
        }
        playVideo() {}
        seekTo() {}
        destroy() {}
        getCurrentTime() {
          return 0.5;
        }
        getPlayerState() {
          return 2;
        }
      },
    };
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/admin/lessons/new");
  await page
    .getByLabel("JSON matni", { exact: true })
    .fill(await readFile("client/public/lesson-package-example.json", "utf8"));
  await page
    .getByLabel("Ko‘rinishni ko‘rdim, qoralama sifatida saqlayman")
    .check();
  await page
    .getByRole("button", { name: "Qoralama yaratish", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/lessons\/\d+$/);
  const id = page.url().split("/").pop();
  await page.getByRole("button", { name: "Tekshiruv", exact: true }).click();
  for (const label of [
    "Arabcha/inglizcha matn va yozuv to‘g‘ri",
    "Tarjimalar va grammatik izohlar tekshirildi",
    "Videodagi gaplar subtitr vaqtlariga mos",
    "Mashqlar, javoblar va lug‘at testi tekshirildi",
  ])
    await page.getByLabel(label, { exact: true }).check();
  await page
    .getByRole("button", { name: "Tekshirdim — nashr qilish", exact: true })
    .click();
  await expect(page.locator(".status-pill").first()).toHaveText(
    "Nashr qilingan",
  );
  await page.goto(`/learn/${id}?preview=1`);
  await expect(
    page.getByRole("button", { name: "Videoni boshlash" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Tarjima", exact: true }).click();
  await page.locator(".aligned-part").first().click();
  await expect
    .poll(() => page.evaluate(() => (window as any).__pauses))
    .toBeGreaterThan(0);
  await expect(page.locator(".aligned-part.is-selected")).toHaveCount(2);
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/aligned-subtitles-mobile.png",
    fullPage: true,
  });
});
