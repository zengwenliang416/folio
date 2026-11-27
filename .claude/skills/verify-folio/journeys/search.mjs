export default async function search({ page, step, assert }) {
  const box = page.getByRole("textbox", { name: "Find in document" });
  const status = (text) => page.getByRole("search").getByRole("status").filter({ hasText: text }).waitFor();
  const results = page.getByRole("complementary", { name: "Search results" });
  const pageNumber = page.getByRole("textbox", { name: "Page number" });
  const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
  const onPage = (n) => page.waitForFunction((n) => document.querySelector('input[aria-label="Page number"]')?.value === n, String(n));

  await step("open the sample", async () => {
    assert.ok(await page.getByRole("button", { name: /Try a sample/ }).isVisible(), "the journey starts from the library; run stop and start first");
    await page.getByRole("button", { name: /Try a sample/ }).click();
    await page.locator(".doc-title", { hasText: "Folio sample.pdf" }).waitFor();
    await page.locator(".textLayer span:not(.markedContent)").first().waitFor({ timeout: 30_000 });
  });

  await step("toolbar search button opens an empty search", async () => {
    await page.getByRole("button", { name: /^Search/ }).click();
    await box.waitFor();
    assert.equal(await focused(), "Find in document");
    await results.getByText(/Search above to see matching pages/).waitFor();
  });

  await step("typing a word counts matches and lists the page", async () => {
    await box.fill("lighthouse");
    await status(/^1 of 4$/);
    await results.getByRole("button", { name: "Go to page 2, 4 matches", exact: true }).waitFor();
    assert.equal(await results.getByRole("button").count(), 1);
    assert.deepEqual((await results.locator("mark").allTextContents()).map((t) => t.toLowerCase()), ["lighthouse"]);
  });

  await step("enter and shift enter step through matches", async () => {
    await box.press("Enter");
    await status(/^2 of 4$/);
    await box.press("Shift+Enter");
    await status(/^1 of 4$/);
  });

  await step("match case finds no Lighthouse in the all-lowercase sample", async () => {
    await page.getByTitle("Match case").click();
    await box.fill("Lighthouse");
    await status(/^No results$/);
    assert.equal(await results.getByRole("button").count(), 0);
    await page.getByTitle("Match case").click();
    await status(/^1 of 4$/);
  });

  await step("whole words skips words that contain the query", async () => {
    await box.fill("light");
    await status(/^1 of \d+$/);
    const partial = Number(/of (\d+)/.exec(await page.getByRole("search").getByRole("status").first().innerText())[1]);
    await page.getByTitle("Whole words").click();
    await status(/^(1 of 1|No results)$/);
    const whole = await page.getByRole("search").getByRole("status").first().innerText();
    assert.ok(partial > 1, `"light" should match inside highlight and lighthouse, got ${partial}`);
    assert.equal(whole, "1 of 1");
    await page.getByTitle("Whole words").click();
  });

  await step("a word that is not there says no results", async () => {
    await box.fill("volcano");
    await status(/^No results$/);
    assert.equal(await results.getByRole("button").count(), 0);
  });

  await step("choosing a matching page jumps to it", async () => {
    await box.fill("lighthouse");
    await status(/^1 of 4$/);
    await pageNumber.fill("1");
    await pageNumber.press("Enter");
    await onPage(1);
    await results.getByRole("button", { name: "Go to page 2, 4 matches", exact: true }).click();
    await onPage(2);
  });

  await step("escape closes search", async () => {
    await box.press("Escape");
    await page.getByRole("search").waitFor({ state: "detached" });
  });

  await step("command f reopens search with an empty box", async () => {
    await page.keyboard.press("ControlOrMeta+f");
    await box.waitFor();
    assert.equal(await box.inputValue(), "");
    assert.equal(await focused(), "Find in document");
  });
}
