const fixture = "scripts/fixtures/arabic-editing.pdf";

export default async function openDocument({ page, window, step, openFile, native, assert }) {
  const docs = page.getByRole("tablist", { name: "Open documents" });
  const tab = (name) => docs.getByRole("tab", { name, exact: true });
  const selected = (name) => docs.getByRole("tab", { name, exact: true, selected: true }).waitFor();
  const recent = page.getByRole("heading", { name: "Recent" });
  const card = (name) => page.getByRole("button", { name: new RegExp(`^${name} `) });
  const title = (name) => window.waitForFunction((t) => document.title === t, `${name} — Mnemark`);
  const rendered = () => page.locator(".textLayer span:not(.markedContent)").first().waitFor({ timeout: 30_000 });
  const newTab = async () => {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: /New tab/ }).click();
    await selected("Library");
    await page.getByRole("button", { name: /Try a sample/ }).waitFor();
  };
  const chooser = async (count) => {
    const calls = (await native()).filter((c) => c.call === "fileChooser");
    assert.equal(calls.length, count);
    assert.match(calls.at(-1).files?.[0] ?? "", /arabic-editing\.pdf$/);
  };

  await step("library shows the entry points and no recent files", async () => {
    assert.ok(await page.getByRole("button", { name: /Try a sample/ }).isVisible(), "the journey starts from the library; run stop and start first");
    await page.getByRole("button", { name: /Open a PDF/ }).waitFor();
    await page.getByRole("button", { name: /Open from URL/ }).waitFor();
    assert.equal(await recent.count(), 0, "a fresh run has no Recent list; run stop and start first");
  });

  await step("try a sample document opens the sample", async () => {
    await page.getByRole("button", { name: /Try a sample/ }).click();
    await page.locator(".doc-title", { hasText: "Folio sample.pdf" }).waitFor();
    await rendered();
    await title("Folio sample.pdf");
    assert.equal(await docs.count(), 0);
  });

  await step("more new tab adds a library tab that lists the sample as recent", async () => {
    await newTab();
    assert.deepEqual(await docs.getByRole("tab").allTextContents(), ["Folio sample.pdf", "Library"]);
    await recent.waitFor();
    await card("Folio sample").filter({ hasText: "4 pages" }).waitFor();
  });

  await step("open a pdf opens the chosen file in the library tab", async () => {
    await openFile(fixture, () => page.getByRole("button", { name: /Open a PDF/ }).click());
    await selected("arabic-editing.pdf");
    await rendered();
    await title("arabic-editing.pdf");
    assert.deepEqual(await docs.getByRole("tab").allTextContents(), ["Folio sample.pdf", "arabic-editing.pdf"]);
    await chooser(1);
  });

  await step("choosing a tab switches the document", async () => {
    await tab("Folio sample.pdf").click();
    await selected("Folio sample.pdf");
    await title("Folio sample.pdf");
    await page.getByRole("textbox", { name: "Page number" }).waitFor();
  });

  await step("closing the other tab leaves one document without a tab strip", async () => {
    await docs.getByRole("button", { name: "Close arabic-editing.pdf", exact: true }).click();
    await docs.waitFor({ state: "detached" });
    await page.locator(".doc-title", { hasText: "Folio sample.pdf" }).waitFor();
    await title("Folio sample.pdf");
  });

  await step("a recent card reopens a closed document", async () => {
    await newTab();
    await card("arabic-editing").filter({ hasText: "1 page" }).waitFor();
    await card("Folio sample").waitFor();
    await card("arabic-editing").click();
    await selected("arabic-editing.pdf");
    await rendered();
    await title("arabic-editing.pdf");
  });

  await step("closing it leaves one document again", async () => {
    await docs.getByRole("button", { name: "Close arabic-editing.pdf", exact: true }).click();
    await docs.waitFor({ state: "detached" });
    await page.locator(".doc-title", { hasText: "Folio sample.pdf" }).waitFor();
  });

  await step("command o in a document opens the chosen file in a new tab", async () => {
    await openFile(fixture);
    await selected("arabic-editing.pdf");
    await rendered();
    await title("arabic-editing.pdf");
    assert.deepEqual(await docs.getByRole("tab").allTextContents(), ["Folio sample.pdf", "arabic-editing.pdf"]);
    await chooser(2);
  });

  await step("command t adds a library tab", async () => {
    await page.keyboard.press("ControlOrMeta+t");
    await selected("Library");
    assert.deepEqual(await docs.getByRole("tab").allTextContents(), ["Folio sample.pdf", "arabic-editing.pdf", "Library"]);
  });

  await step("closing the selected tab selects the one beside it", async () => {
    await docs.getByRole("button", { name: "Close Library", exact: true }).click();
    await selected("arabic-editing.pdf");
    await title("arabic-editing.pdf");
  });

  await step("the tab strip's new tab button adds a library tab", async () => {
    await page.getByRole("navigation", { name: "Documents" }).getByRole("button", { name: "New tab", exact: true }).click();
    await selected("Library");
    await page.getByRole("button", { name: /Try a sample/ }).waitFor();
    assert.equal(await docs.getByRole("tab").count(), 3);
  });
}
