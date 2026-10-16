import { test, expect } from "@playwright/test";

test("Google and Telegram signup buttons fit mobile screens without requesting email", async ({
  page,
}) => {
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      json: {
        googleEnabled: true,
        telegramEnabled: true,
        emailEnabled: false,
        signupEnabled: false,
        socialSignupEnabled: true,
      },
    }),
  );
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/register");
    await expect(
      page.getByRole("link", { name: "Google orqali davom etish" }),
    ).toHaveAttribute("href", "/api/auth/google");
    await expect(
      page.getByRole("link", { name: "Telegram orqali davom etish" }),
    ).toHaveAttribute("href", "/api/auth/telegram");
    await expect(
      page.getByText("Sayt uchun alohida parol kerak emas.", { exact: false }),
    ).toBeVisible();
    await expect(page.getByLabel("Email", { exact: true })).toHaveCount(0);
    if (width === 390)
      await page.screenshot({
        path: "test-results/social-auth-mobile.png",
        fullPage: true,
      });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  }
  await page.goto("/login?error=telegram_failed");
  await expect(page.getByRole("alert")).toContainText(
    "Telegram orqali kirish yakunlanmadi",
  );
  await expect(
    page.getByRole("link", { name: "Telegram orqali davom etish" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Parolni unutdingizmi?" }),
  ).toHaveCount(0);
});

test("profile account linking starts through an authenticated POST and preserves the legacy login", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/auth/config", (route) =>
    route.fulfill({
      json: {
        googleEnabled: true,
        telegramEnabled: true,
        emailEnabled: false,
        signupEnabled: false,
        socialSignupEnabled: true,
      },
    }),
  );
  await page.goto("/login");
  await page.getByLabel("Email yoki foydalanuvchi nomi").fill("demo_student");
  await page.getByLabel("Parol", { exact: true }).fill(process.env.TUBE_DEMO_STUDENT_PASSWORD!);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
  await page.goto("/profile");
  await expect(
    page.getByRole("heading", { name: "Kirish hisoblari" }),
  ).toBeVisible();
  const link = page.getByRole("button", { name: "Telegram hisobini ulash" });
  await expect(link).toBeEnabled();
  await page.screenshot({
    path: "test-results/linked-accounts-mobile.png",
    fullPage: true,
  });
  await page.route("**/api/auth/accounts/telegram/link", async (route) => {
    expect(route.request().method()).toBe("POST");
    await route.fulfill({
      status: 503,
      json: { message: "Telegram hali sozlanmagan" },
    });
  });
  await link.click();
  await expect(page.getByRole("alert")).toContainText(
    "Telegram hali sozlanmagan",
  );
  await expect(link).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
