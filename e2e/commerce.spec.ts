import { test, expect, type Page, type APIRequestContext } from "@playwright/test";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jhN8AAAAASUVORK5CYII=", "base64");
async function apiLogin(request: APIRequestContext, username: string, password: string) {
  const response = await request.post("/api/auth/login", { data: { username, password } });
  expect(response.status()).toBe(200);
}
async function login(page: Page, username = "demo_other", password = "DemoStudent2026!") {
  await page.goto("/login");
  await page.getByLabel("Email yoki foydalanuvchi nomi").fill(username);
  await page.getByLabel("Parol", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Kirish", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/);
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

test("welcome coins open a lesson once and receipt approval adds the purchased package", async ({ page, playwright, browser }) => {
  test.setTimeout(180000);
  const admin = await playwright.request.newContext({ baseURL: "http://127.0.0.1:5010" });
  await apiLogin(admin, "demo_admin", "DemoAdmin2026!");
  const catalog = await (await page.request.get("/api/learn/catalog")).json();
  const demo = catalog.lessons.find((l: any) => l.access === "demo");
  const paid = catalog.lessons.find((l: any) => l.access === "locked");
  expect(demo).toBeTruthy();
  expect(paid).toBeTruthy();
  const newPackage = await admin.post("/api/admin/commerce/packages", { data: { name: "Browser sinov paketi", coins: 100, priceUzs: 100000, isActive: true } });
  expect(newPackage.status()).toBe(201);
  const settings = await admin.put("/api/admin/commerce/settings", { data: {
    demoLessonId: demo.id, paymentsEnabled: true, recipientName: "Mahalliy sinov", cardNumber: "8600123456789012",
    paymeUrl: "", paymentInstructions: "Haqiqiy pul yubormang: bu mahalliy test.", reviewHours: "09:00–18:00",
  } });
  expect(settings.status()).toBe(200);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/learn/${paid.id}`);
  await expect(page.getByRole("link", { name: "Kirish va darsni ochish", exact: true })).toBeVisible();
  await login(page);
  await page.goto("/wallet");
  await expect(page.locator(".wallet-balance").first()).toHaveText("30 coin");
  await page.goto(`/learn/${paid.id}`);
  await page.getByRole("button", { name: "10 coin bilan ochish", exact: true }).click();
  await page.getByRole("button", { name: "Tasdiqlash va darsni ochish", exact: true }).click();
  await expect(page.getByRole("button", { name: "Videoni boshlash" })).toBeVisible();
  await page.goto("/wallet");
  await expect(page.locator(".wallet-balance").first()).toHaveText("20 coin");
  await page.goto(`/learn/${paid.id}`);
  await page.reload();
  await expect(page.getByRole("button", { name: "Videoni boshlash" })).toBeVisible();
  expect((await (await page.request.get("/api/commerce/wallet")).json()).balance).toBe(20);
  await page.goto("/my-lessons");
  await expect(page.getByRole("heading", { name: paid.title, exact: true })).toBeVisible();
  await page.goto("/wallet");
  await page.getByRole("button", { name: "Browser sinov paketi — tanlash", exact: true }).click();
  await expect(page).toHaveURL(/\/payments\/[0-9a-f-]{36}$/);
  const orderId = page.url().split("/").at(-1)!;
  await expect(page.getByText("To‘lov kutilmoqda", { exact: true })).toBeVisible();
  await page.getByLabel("Chek rasmi").setInputFiles({ name: "browser-chek.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Chekni yuborish", exact: true }).click();
  await expect(page.getByText("Chek yuborildi", { exact: true })).toBeVisible();
  await expect(page.getByRole("img", { name: "Yuborilgan to‘lov cheki" })).toBeVisible();
  const order = await (await page.request.get(`/api/commerce/orders/${orderId}`)).json();
  const guest = await playwright.request.newContext({ baseURL: "http://127.0.0.1:5010" });
  expect((await guest.get(order.receipts[0].url)).status()).toBe(401);
  await guest.dispose();
  await noOverflow(page);
  await page.screenshot({ path: "test-results/payment-order-mobile.png", fullPage: true });
  const adminContext = await browser.newContext({ baseURL: "http://127.0.0.1:5010", viewport: { width: 390, height: 844 } });
  await apiLogin(adminContext.request, "demo_admin", "DemoAdmin2026!");
  const adminPage = await adminContext.newPage();
  await adminPage.goto(`/admin/payments/${orderId}`);
  await adminPage.getByRole("button", { name: "Tasdiqlash", exact: true }).click();
  await adminPage.getByLabel("Bank tranzaksiya raqami", { exact: true }).fill(`BROWSER-${Date.now()}`);
  await adminPage.getByLabel("Haqiqiy bank tushumi, summa va qabul qiluvchini tekshirdim.").check();
  await adminPage.getByRole("button", { name: "To‘lovni tasdiqlash", exact: true }).click();
  await expect(adminPage.getByText("Tasdiqlandi", { exact: true })).toBeVisible();
  await noOverflow(adminPage);
  await adminPage.screenshot({ path: "test-results/admin-payment-mobile.png", fullPage: true });
  for (const width of [320, 390, 768, 1280]) {
    await adminPage.setViewportSize({ width, height: 900 });
    for (const path of ["/admin/commerce", "/admin/payments", `/admin/payments/${orderId}`, "/admin/packages", "/admin/commerce-settings"]) {
      await adminPage.goto(path);
      await expect(adminPage.locator("h1").first()).toBeVisible();
      await noOverflow(adminPage);
    }
  }
  await page.getByRole("button", { name: "Holatni yangilash", exact: true }).click();
  await expect(page.getByText("Tasdiqlandi", { exact: true })).toBeVisible();
  await expect(page.getByText("Hozirgi balans: 120 coin.", { exact: true })).toBeVisible();
  await page.goto("/wallet");
  await expect(page.locator(".wallet-balance").first()).toHaveText("120 coin");
  await page.goto(`/payments/${orderId}`);
  await page.getByRole("link", { name: "Qaytarish bo‘yicha murojaat", exact: true }).click();
  await expect(page.getByLabel("Murojaat turi")).toHaveValue("refund");
  await page.getByLabel("Mavzu", { exact: true }).fill("Browser qaytarish bo‘yicha savol");
  await page.getByLabel("Xabaringiz", { exact: true }).fill("Sarflanmagan coinlar bo‘yicha qaytarish tartibini tushuntiring.");
  await page.getByRole("button", { name: "Murojaatni yuborish", exact: true }).click();
  await expect(page).toHaveURL(/\/support\/[0-9a-f-]{36}$/);
  const ticketId = page.url().split("/").at(-1)!;
  const adminReply = "To‘lovni bankda tekshirib, qaytarish tartibini sizga tushuntiramiz.";
  await adminPage.goto(`/admin/support/${ticketId}`);
  await adminPage.getByLabel("Javob matni", { exact: true }).fill(adminReply);
  await adminPage.getByLabel("Javobdan keyingi holat", { exact: true }).selectOption("answered");
  await adminPage.getByRole("button", { name: "Javobni saqlash", exact: true }).click();
  await expect(adminPage.getByText(adminReply, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Javoblarni yangilash", exact: true }).click();
  await expect(page.getByText(adminReply, { exact: true })).toBeVisible();
  await page.getByLabel("Javobingiz", { exact: true }).fill("Rahmat, javobingizni kutaman.");
  await page.getByRole("button", { name: "Javobni yuborish", exact: true }).click();
  await expect(page.getByText("Rahmat, javobingizni kutaman.", { exact: true })).toBeVisible();
  expect((await (await page.request.get("/api/commerce/wallet")).json()).balance).toBe(120);
  for (const width of [320, 390, 768, 1280]) {
    await adminPage.setViewportSize({ width, height: 900 });
    for (const path of ["/admin/support", `/admin/support/${ticketId}`]) {
      await adminPage.goto(path);
      await expect(adminPage.locator("h1").first()).toBeVisible();
      await noOverflow(adminPage);
    }
  }
  await adminContext.close();
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/wallet", "/my-lessons", `/payments/${orderId}`, "/support", `/support/${ticketId}`]) {
      await page.goto(path);
      await expect(page.locator("h1").first()).toBeVisible();
      await noOverflow(page);
    }
  }
  await admin.dispose();
});
