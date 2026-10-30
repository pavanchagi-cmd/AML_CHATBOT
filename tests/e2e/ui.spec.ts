import { expect, test } from "@playwright/test";
import { mockApi } from "./fixtures";

// The screens with canned API responses (no external services needed).

test("asks a question, shows cited answer and opens the right passage", async ({ page }) => {
  const { feedback } = await mockApi(page);
  await page.goto("/ask");
  await page.getByRole("button", { name: "What are the red flags of a money mule account?" }).click();

  await expect(page.getByRole("button", { name: "Copy answer" })).toBeVisible();
  // Valid citations become chips; [7] has no source and is dropped.
  await expect(page.getByRole("button", { name: /^Source \d$/ })).toHaveCount(3);
  await expect(page.getByRole("button", { name: "Source 7" })).toHaveCount(0);

  await page.getByRole("button", { name: "Source 2" }).first().click();
  const panel = page.getByRole("complementary", { name: "Sources" });
  await expect(panel.getByRole("heading", { name: "Sources for this answer" })).toBeVisible();
  await expect(panel.getByText("4.6 Dormant account reactivation, Internal SOP")).toBeVisible();
  await expect(panel.locator("mark", { hasText: "money" }).first()).toBeVisible();

  await page.getByRole("button", { name: "Not helpful" }).click();
  await expect(page.getByRole("button", { name: "Not helpful" })).toHaveAttribute("aria-pressed", "true");
  expect(feedback).toEqual([{ questionId: "00000000-0000-4000-8000-000000000001", rating: "down" }]);
});

test("shows the not-found card for questions the library can't answer", async ({ page }) => {
  await mockApi(page);
  await page.goto("/ask");
  await page.getByLabel("Your question").fill("What is the capital of France?");
  await page.keyboard.press("Enter");
  await expect(page.getByText("Not found in your library")).toBeVisible();
  await expect(page.getByText("This question is logged under Insights as a training gap.")).toBeVisible();
});

test("composer: Shift+Enter adds a line, Enter sends, New chat clears", async ({ page }) => {
  await mockApi(page);
  await page.goto("/ask");
  const box = page.getByLabel("Your question");
  await box.fill("line one");
  await page.keyboard.press("Shift+Enter");
  await page.keyboard.type("line two");
  await expect(box).toHaveValue("line one\nline two");
  await page.keyboard.press("Enter");
  await expect(box).toHaveValue("");
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(page.getByRole("heading", { name: "What do you need to check?" })).toBeVisible();
});

test("tells analysts when the library is empty", async ({ page }) => {
  await mockApi(page, { documents: [] });
  await page.goto("/ask");
  await expect(page.getByRole("link", { name: "Add documents in the Library" })).toBeVisible();
});

test("navigation, theme toggle and Insights", async ({ page }) => {
  await mockApi(page);
  await page.goto("/");
  await expect(page).toHaveURL(/\/ask$/);

  await page.getByRole("link", { name: "Insights" }).click();
  await expect(page.getByRole("link", { name: "Insights" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByText("Answered from library")).toBeVisible();
  await expect(page.getByRole("cell", { name: "What is the capital of France?" })).toBeVisible();

  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  await page.getByRole("button", { name: /mode$/ }).click();
  await expect(html).not.toHaveAttribute("data-theme", before ?? "");
  await page.reload();
  await expect(html).toHaveAttribute("data-theme", /light|dark/);
});

test("security headers are set", async ({ page }) => {
  const res = await page.goto("/ask");
  const headers = res!.headers();
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-powered-by"]).toBeUndefined();
});

test("admins can run the setup check from the Library", async ({ page }) => {
  await mockApi(page);
  await page.goto("/library");
  await expect(page.getByRole("button", { name: "Run setup check" })).toHaveCount(0);
  await page.getByRole("button", { name: "Admin sign-in" }).click();
  await page.getByLabel("Admin passcode").fill("anything");
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.getByRole("button", { name: "Run setup check" }).click();
  await expect(page.getByText(/4 items need attention/)).toBeVisible();
  await expect(page.getByText('Key works, but there is no index named "aml-compass" yet.')).toBeVisible();
  await expect(page.getByText("Environment: preview.")).toBeVisible();
});

test("setup check offers one-click fixes for tables and the Pinecone index", async ({ page }) => {
  const { setupCalls } = await mockApi(page);
  await page.goto("/library");
  await page.getByRole("button", { name: "Admin sign-in" }).click();
  await page.getByLabel("Admin passcode").fill("anything");
  await page.getByRole("button", { name: "Unlock" }).click();
  await page.getByRole("button", { name: "Run setup check" }).click();

  await page.getByRole("button", { name: "Create database tables" }).click();
  await expect(page.getByText("Database tables are ready.")).toBeVisible();

  await page.getByLabel("Region").fill("us-west-2");
  await page.getByRole("button", { name: "Create Pinecone index" }).click();
  await expect(page.getByText('Index "aml-compass" created in aws us-west-2 and ready.')).toBeVisible();
  expect(setupCalls).toEqual([{ action: "migrate" }, { action: "create-index", cloud: "aws", region: "us-west-2" }]);
});

test("source tabs show brief points for passages 1..n from one background request", async ({ page }) => {
  const { chatCalls } = await mockApi(page);
  await page.goto("/ask");
  await page.getByRole("button", { name: "What are the red flags of a money mule account?" }).click();
  await expect(page.getByRole("button", { name: "Copy answer" })).toBeVisible();
  // The breakdown for all passages is fetched once, in the background, right after the answer.
  await expect.poll(() => chatCalls.filter((c) => c.upTo).length).toBe(1);
  expect(chatCalls.find((c) => c.upTo)?.upTo).toBe(3);
  const tabs = page.locator("button[title]").filter({ hasText: "AML Pattern Analysis SOP" });

  await tabs.nth(1).click();
  await expect(page.getByText("Brief answer from passages 1–2.")).toBeVisible();
  await expect(page.getByText(": brief point")).toHaveCount(2);
  await expect(tabs.nth(0)).toHaveAttribute("aria-pressed", "true");
  await expect(tabs.nth(1)).toHaveAttribute("aria-pressed", "true");
  await expect(tabs.nth(2)).toHaveAttribute("aria-pressed", "false");

  await tabs.nth(2).click();
  await expect(page.getByText("Brief answer from passages 1–3.")).toBeVisible();
  await expect(page.getByText(": brief point")).toHaveCount(3);
  await expect(page.getByText("5.4 Account takeover").first()).toBeVisible();

  await page.getByRole("button", { name: "Show the original answer" }).click();
  await expect(page.getByText("Brief answer from passages")).toHaveCount(0);

  // Still only one breakdown request for this answer.
  expect(chatCalls.filter((c) => c.upTo)).toHaveLength(1);
});

test("Remove is always visible and asks for the passcode before removing a document", async ({ page }) => {
  await mockApi(page);
  const deletes: { url: string; passcode: string | null }[] = [];
  await page.route("**/api/documents/*", (r) => {
    deletes.push({ url: r.request().url(), passcode: r.request().headers()["x-admin-passcode"] ?? null });
    return r.fulfill({ status: 204 });
  });
  await page.goto("/library");
  const remove = page.getByRole("button", { name: "Remove AML Pattern Analysis SOP" });
  await expect(remove).toBeVisible();
  await expect(page.getByRole("button", { name: "Re-index AML Pattern Analysis SOP" })).toBeVisible();

  await remove.click();
  await expect(page.getByLabel("Admin passcode")).toBeVisible();
  page.once("dialog", (d) => d.accept());
  await page.getByLabel("Admin passcode").fill("s3cret");
  await page.getByRole("button", { name: "Unlock" }).click();

  await expect(page.getByText("Document removed")).toBeVisible();
  expect(deletes).toEqual([{ url: expect.stringContaining("/api/documents/d_1"), passcode: "s3cret" }]);
});
