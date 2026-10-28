import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures";

// WCAG 2.1 AA checks (including colour contrast) in both themes, and layout at phone widths.

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`${colorScheme} theme`, () => {
    test.use({ colorScheme });

    for (const path of ["/ask", "/library", "/insights"]) {
      test(`${path} has no WCAG AA violations`, async ({ page }) => {
        await mockApi(page);
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        if (path === "/ask") {
          await page.getByRole("button", { name: "What are the red flags of a money mule account?" }).click();
          await expect(page.getByRole("button", { name: "Copy answer" })).toBeVisible();
        }
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual(
          [],
        );
      });
    }

    test("setup check panel has no WCAG AA violations", async ({ page }) => {
      await mockApi(page);
      await page.goto("/library");
      await page.getByRole("button", { name: "Admin sign-in" }).click();
      await page.getByLabel("Admin passcode").fill("anything");
      await page.getByRole("button", { name: "Unlock" }).click();
      await page.getByRole("button", { name: "Run setup check" }).click();
      await expect(page.getByText("3 items need attention.", { exact: false })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  });
}

for (const width of [360, 768, 1440]) {
  test(`no horizontal scrolling at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await mockApi(page);
    for (const path of ["/ask", "/library", "/insights"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });
}

test("keyboard users can reach and see focus on the main controls", async ({ page }) => {
  await mockApi(page);
  await page.goto("/ask");
  await page.keyboard.press("Tab");
  const focused = page.locator(":focus");
  await expect(focused).toBeVisible();
  const outline = await focused.evaluate((el) => getComputedStyle(el).outlineStyle);
  expect(outline).not.toBe("none");
});

test("respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await mockApi(page);
  await page.goto("/library");
  const duration = await page.evaluate(() => {
    const el = document.createElement("div");
    el.className = "animate-dot";
    document.body.appendChild(el);
    return getComputedStyle(el).animationName;
  });
  expect(duration).toBe("none");
});
