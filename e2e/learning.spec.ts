import { test, expect, type Page } from "@playwright/test";
// A test-only YouTube API fixture makes playback deterministic without external video requests.
async function playerFixture(page: Page) {
  await page.addInitScript(() => {
    class Player {
      time = 0;
      playing = false;
      started = 0;
      events: any;
      frame: HTMLIFrameElement;
      constructor(id: string, options: any) {
        this.events = options.events;
        this.frame = document.createElement("iframe");
        this.frame.title = "Test video player";
        this.frame.srcdoc =
          '<body style="margin:0;background:#162c24;color:#fff;display:grid;place-content:center;height:100vh;font:18px system-ui">Video namunasi</body>';
        document.getElementById(id)?.replaceWith(this.frame);
        setTimeout(() => this.events.onReady(), 50);
      }
      getCurrentTime() {
        return (
          this.time + (this.playing ? (Date.now() - this.started) / 1000 : 0)
        );
      }
      getPlayerState() {
        return this.playing ? 1 : 2;
      }
      playVideo() {
        if (!this.playing) {
          this.started = Date.now();
          this.playing = true;
          this.events.onStateChange({ data: 1 });
        }
      }
      pauseVideo() {
        this.time = this.getCurrentTime();
        this.playing = false;
        this.events.onStateChange({ data: 2 });
      }
      seekTo(t: number) {
        this.time = t;
        this.started = Date.now();
      }
      setPlaybackRate() {}
      destroy() {
        this.frame.remove();
      }
    }
    (window as any).YT = { Player };
  });
}
async function login(page: Page, role = "student") {
  await page.goto("/login");
  await page.getByLabel("Email yoki foydalanuvchi nomi").fill(`demo_${role}`);
  await page
    .getByLabel("Parol", { exact: true })
    .fill(
      role === "admin"
        ? process.env.TUBE_DEMO_ADMIN_PASSWORD!
        : role === "teacher"
          ? process.env.TUBE_DEMO_TEACHER_PASSWORD!
          : process.env.TUBE_DEMO_STUDENT_PASSWORD!,
    );
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(
    role === "student"
      ? /\/today$/
      : role === "teacher"
        ? /\/studio$/
        : /\/admin$/,
  );
}
async function noOverflow(page: Page) {
  const size = await page.evaluate(() => ({
    url: location.pathname + location.search,
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
    overflowing: Array.from(document.querySelectorAll<HTMLElement>("body *"))
      .map((element) => ({
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === "string" ? element.className : "",
        right: Math.round(element.getBoundingClientRect().right),
        width: Math.round(element.getBoundingClientRect().width),
      }))
      .filter((element) => element.right > window.innerWidth + 1)
      .sort((a, b) => b.right - a.right)
      .slice(0, 15),
  }));
  expect(size.document, JSON.stringify(size, null, 2)).toBeLessThanOrEqual(size.viewport + 1);
}

test("public pages and authenticated learner pages fit 320, 390, 768 and 1280 pixels", async ({
  page,
}) => {
  await playerFixture(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/login",
      "/register",
      "/forgot-password",
      "/courses",
      "/courses/1",
      "/learn/1",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      await noOverflow(page);
      if (width === 390 && path === "/") await page.screenshot({path: "test-results/landing-mobile.png", fullPage: true});
      if (width === 1280 && path === "/") await page.screenshot({path: "test-results/landing-desktop.png", fullPage: true});
    }
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  for (const path of [
    "/today",
    "/courses",
    "/words",
    "/review",
    "/profile",
    "/notes",
    "/flashcards/archive",
    "/learn/1",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1").first()).toBeVisible();
    await noOverflow(page);
  }
  await page.screenshot({
    path: "test-results/learner-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("word sheet, recording, stage completion, tests and saved results work together", async ({
  page,
}) => {
  await playerFixture(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page);
  await page.goto("/learn/1");
  await expect(
    page.getByRole("button", { name: "Videoni boshlash" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Videoni boshlash" }).click();
  await page.waitForTimeout(6100);
  await page.getByRole("button", { name: "Videoni to‘xtatish" }).click();
  await page.locator(".sentence-word").first().click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Lug‘atimga saqlash" }).click();
  await expect(
    page.getByRole("button", { name: "Lug‘atda saqlangan" }),
  ).toBeDisabled();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".sentence-word").first()).toBeFocused();
  await page.getByRole("button", { name: "Bosqichni yakunlash" }).click();
  await expect(page.getByRole("heading", { name: "2. Tushun" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "2. Tushun" })).toBeVisible();
  await page.getByRole("button", { name: "Bosqichni yakunlash" }).click();
  await expect(
    page.getByRole("heading", { name: "3. Eshit va takrorla" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Ovozimni yozish" }).click();
  await expect(
    page.getByRole("button", { name: /To‘xtatish ·/ }),
  ).toBeVisible();
  await page.waitForTimeout(1200);
  await page.getByRole("button", { name: /To‘xtatish ·/ }).click();
  await expect(page.locator("audio")).toHaveAttribute("src", /^blob:/);
  await page.getByRole("button", { name: "Bosqichni yakunlash" }).click();
  // Submit intentionally wrong responses, including ordered tokens, to exercise correction and review queues.
  for (const kind of ["practice", "vocabulary"]) {
    await expect(
      page.getByRole("heading", {
        name: kind === "practice" ? "Mustahkamlash" : "Dars lug‘ati testi",
        exact: true,
      }),
    ).toBeVisible();
    while (await page.locator(".exercise-panel").count()) {
      if (await page.locator(".answer-choices").count())
        await page.locator(".answer-choices button").last().click();
      else if (await page.locator(".token-pool").count()) {
        const buttons = page.locator(".token-pool button");
        const count = await buttons.count();
        for (let i = count - 1; i >= 0; i--) await buttons.nth(i).click();
      } else await page.getByLabel("Javobingiz").fill("wrong");
      await page.getByRole("button", { name: "Javobni tekshirish" }).click();
      await expect(page.locator(".answer-feedback")).toBeVisible();
      const next = page.getByRole("button", {
        name: /^(Keyingi savol|Lug‘at testiga o‘tish|Natijani ko‘rish)$/,
      });
      const last = (await next.innerText()) !== "Keyingi savol";
      await next.click();
      if (last) break;
    }
  }
  await expect(
    page.getByRole("heading", { name: "Dars yakunlandi!" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Dars yakunlandi!" }),
  ).toBeVisible();
  await noOverflow(page);
  await page.screenshot({
    path: "test-results/lesson-result-mobile.png",
    fullPage: true,
  });
  await page.goto("/words");
  await expect(page.locator(".word-card").first()).toBeVisible();
  await page.goto("/review");
  await page.getByRole("button", { name: "Javobni ko‘rsatish" }).click();
  await page.getByRole("button", { name: "Oson", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Javobni ko‘rsatish" }),
  ).toBeVisible();
});
test("admin creates and edits a draft; learner cannot access content management", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "admin");
  await page.goto("/admin/lessons/new");
  await page.getByLabel("Dars nomi").fill("Browser sinov darsi");
  await page
    .getByLabel("YouTube havolasi")
    .fill("https://youtu.be/jNQXAC9IVRw");
  await page
    .getByRole("button", { name: "Dars yaratish", exact: true })
    .click();
  await expect(page).toHaveURL(/\/admin\/lessons\/\d+$/);
  await page.getByRole("button", {name: "Matn", exact: true}).click();
  await page
    .getByLabel("Transkript")
    .fill(
      "00:00:01.000 --> 00:00:04.000\nأَنَا طَالِبٌ.\n\n00:00:04.000 --> 00:00:08.000\nهَذَا كِتَابٌ.\n",
    );
  await page.getByRole("button", { name: "Matnni saqlash" }).click();
  await expect(
    page.getByText("O‘zgarish saqlandi", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Tekshiruv", exact: true }).click();
  await expect(page.locator(".validation-problems")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tekshirdim — nashr qilish" }),
  ).toBeDisabled();
  await noOverflow(page);
  await page.context().clearCookies();
  await login(page, "admin");
  await page.getByRole("button", { name: "Admin menyusi" }).click();
  await page
    .getByRole("link", { name: "Kontent tekshiruvi", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Kontent tekshiruvi", exact: true }),
  ).toBeVisible();
  await noOverflow(page);
  await page.context().clearCookies();
  await login(page);
  await page.goto("/studio/new");
  await expect(page).toHaveURL(/\/today$/);
  await page.goto("/profile");
  await page.getByRole("button", { name: "Hisobdan chiqish" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
