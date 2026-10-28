import path from "node:path";
import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

// The spec's end-to-end smoke test against real services (section 11). It needs a deployed
// (or locally configured) app and the admin passcode:
//   E2E_BASE_URL=https://<app>.vercel.app E2E_ADMIN_PASSCODE=... npm run test:e2e -- smoke
const passcode = process.env.E2E_ADMIN_PASSCODE;
test.skip(!passcode, "Set E2E_ADMIN_PASSCODE (and E2E_BASE_URL) to run the smoke test against real services.");

test.describe.configure({ mode: "serial" });

const fileName = `e2e-pattern-sop-${Date.now()}.pdf`;
const title = fileName.replace(/\.pdf$/, "");

test("upload, ask, open citation, not found, gap, delete", async ({ page }) => {
  test.setTimeout(6 * 60_000);

  // 1. Upload the fixture PDF and wait for Ready.
  await page.goto("/library");
  await page.getByRole("button", { name: "Admin sign-in" }).click();
  await page.getByLabel("Admin passcode").fill(passcode!);
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByRole("button", { name: "Lock admin actions" })).toBeVisible();
  await page.getByLabel("Document category").selectOption("Internal SOP");
  await page.locator('input[type="file"]').setInputFiles({
    name: fileName,
    mimeType: "application/pdf",
    buffer: readFileSync(path.join(__dirname, "../fixtures/pattern-sop.pdf")),
  });
  await expect(page.getByText(/^Ready\. \d+ chunks? from 3 pages can now be searched\.$/)).toBeVisible({
    timeout: 5 * 60_000,
  });
  const row = page.getByRole("row", { name: new RegExp(title) });
  await expect(row).toContainText("Ready");
  await expect(row.getByRole("cell").nth(2)).toHaveText("3");

  // 2. Ask a question the document answers; open the first citation.
  await page.goto("/ask");
  await page.getByLabel("Search in").selectOption("Internal SOP");
  await page.getByLabel("Your question").fill("What are the red flags of a money mule account?");
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Copy answer" })).toBeVisible({ timeout: 60_000 });
  const chip = page.getByRole("button", { name: /^Source \d+$/ }).first();
  await chip.click();
  const panel = page.getByRole("complementary", { name: "Sources" });
  await expect(panel.getByText(/5\.1 Money mule account, page 2/)).toBeVisible();

  // 3. An unrelated question gets the not-found card and shows up in Insights gaps.
  await page.getByLabel("Your question").fill("What is the capital of France?");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Not found in your library")).toBeVisible({ timeout: 60_000 });
  await page.goto("/insights");
  await expect(page.getByRole("cell", { name: "What is the capital of France?" }).first()).toBeVisible();

  // 4. Clean up: delete the uploaded document.
  await page.goto("/library");
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("row", { name: new RegExp(title) })
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByRole("row", { name: new RegExp(title) })).toHaveCount(0);
});
