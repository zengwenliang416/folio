// features/organize-pages.md as one journey. Starts from the library of a fresh `start`; public/sample.pdf has four
// pages whose text starts as below.
const starts = { 1: "A short tour of Folio", 2: "Finding text", 3: "Asking AI", 4: "Save a copy" };

export default async function organizePages({ page, window, step, native, readPdf, assert }) {
  const sidebar = page.locator("aside.sidebar");
  const organizer = page.getByRole("complementary", { name: "Organize pages" });
  const docs = page.getByRole("tablist", { name: "Open documents" });
  const thumb = (n, position) => organizer.getByRole("button", { name: `Page ${n}, position ${position}`, exact: true });
  const order = async () => (await organizer.locator(".thumb").evaluateAll((all) => all.map((t) => t.getAttribute("aria-label"))))
    .map((label) => Number(/^Page (\d+),/.exec(label)[1]));
  const saved = async (count) => {
    let downloads = [];
    for (const t0 = Date.now(); downloads.length < count && Date.now() - t0 < 30_000; await new Promise((r) => setTimeout(r, 200)))
      downloads = (await native()).filter((c) => c.call === "download");
    assert.equal(downloads.length, count);
    assert.equal(downloads.at(-1).state, "completed");
    assert.match(downloads.at(-1).file, /Folio sample \(organized\)\.pdf$/);
    return readPdf(downloads.at(-1).file);
  };
  const which = (text) => Number(Object.keys(starts).find((n) => text.startsWith(starts[n])) ?? 0);

  await step("open the sample", async () => {
    assert.ok(await page.getByRole("button", { name: /Try a sample/ }).isVisible(), "the journey starts from the library; run stop and start first");
    await page.getByRole("button", { name: /Try a sample/ }).click();
    await page.locator(".doc-title", { hasText: "Folio sample.pdf" }).waitFor();
    await page.locator(".textLayer span:not(.markedContent)").first().waitFor({ timeout: 30_000 });
    for (const n of [1, 2, 3, 4]) await sidebar.getByRole("button", { name: `Page ${n}`, exact: true }).waitFor();
  });

  await step("organize pages opens the organizer", async () => {
    await sidebar.getByRole("button", { name: "Organize pages" }).click();
    for (const n of [1, 2, 3, 4]) await thumb(n, n).waitFor();
    assert.ok(await organizer.getByRole("button", { name: "Undo", exact: true }).isDisabled());
    assert.ok(await organizer.getByRole("button", { name: "Save organized copy" }).isDisabled());
  });

  await step("delete page removes the selected page", async () => {
    await thumb(2, 2).click();
    await organizer.getByRole("button", { name: "Delete page", exact: true }).click();
    await thumb(3, 2).waitFor();
    assert.deepEqual(await order(), [1, 3, 4]);
  });

  await step("undo brings the page back selected", async () => {
    await organizer.getByRole("button", { name: "Undo", exact: true }).click();
    await organizer.getByRole("button", { name: "Page 2, position 2", exact: true, pressed: true }).waitFor();
    assert.deepEqual(await order(), [1, 2, 3, 4]);
  });

  await step("the delete key removes the selected page", async () => {
    await page.keyboard.press("Delete");
    await thumb(3, 2).waitFor();
    assert.deepEqual(await order(), [1, 3, 4]);
  });

  await step("move sends the selected page to a typed position", async () => {
    await thumb(4, 3).click();
    await organizer.getByLabel("Move page 4 to").fill("1");
    await organizer.getByRole("button", { name: "Move", exact: true }).click();
    await thumb(4, 1).waitFor();
    assert.deepEqual(await order(), [4, 1, 3]);
  });

  await step("dragging a thumbnail onto another moves it there", async () => {
    await thumb(1, 2).dragTo(thumb(3, 3));
    await thumb(1, 3).waitFor();
    assert.deepEqual(await order(), [4, 3, 1]);
  });

  await step("the last page cannot be deleted", async () => {
    await thumb(4, 1).click();
    await thumb(1, 3).click({ modifiers: ["Shift"] });
    const remove = organizer.getByRole("button", { name: "Delete 3 pages", exact: true });
    await remove.waitFor();
    assert.ok(await remove.isDisabled());
    await page.keyboard.press("Delete");
    assert.deepEqual(await order(), [4, 3, 1]);
  });

  await step("save organized copy writes the pages in draft order", async () => {
    await organizer.getByRole("button", { name: "Save organized copy" }).click();
    await organizer.getByRole("button", { name: "Open organized copy" }).waitFor();
    await organizer.getByRole("button", { name: "Done", exact: true }).waitFor();
    assert.deepEqual((await saved(1)).map(which), [4, 3, 1]);
  });

  await step("open organized copy opens it in a new tab", async () => {
    await organizer.getByRole("button", { name: "Open organized copy" }).click();
    await docs.getByRole("tab", { name: "Folio sample (organized).pdf", exact: true, selected: true }).waitFor();
    await window.waitForFunction(() => document.title === "Folio sample (organized).pdf — Folio");
    await page.locator(".textLayer span:not(.markedContent)").first().waitFor({ timeout: 30_000 });
  });

  await step("the original's tab still holds the organizer", async () => {
    await docs.getByRole("tab", { name: "Folio sample.pdf", exact: true }).click();
    await docs.getByRole("tab", { name: "Folio sample.pdf", exact: true, selected: true }).waitFor();
    await organizer.getByRole("button", { name: "Open organized copy" }).waitFor();
  });

  await step("done leaves the original document unchanged", async () => {
    await organizer.getByRole("button", { name: "Done", exact: true }).click();
    await organizer.waitFor({ state: "detached" });
    for (const n of [1, 2, 3, 4]) await sidebar.getByRole("button", { name: `Page ${n}`, exact: true }).waitFor();
  });

  await step("a thumbnail's delete page opens the organizer without that page", async () => {
    await sidebar.locator('.thumb[data-page="3"]').click({ button: "right" });
    await page.getByRole("menu", { name: "Page actions" }).getByRole("menuitem", { name: "Delete page" }).click();
    await thumb(4, 3).waitFor();
    assert.deepEqual(await order(), [1, 2, 4]);
    assert.ok(await organizer.getByRole("button", { name: "Undo", exact: true }).isEnabled());
    await organizer.getByRole("button", { name: "Cancel", exact: true }).waitFor();
  });

  await step("the save shortcut saves the organized copy", async () => {
    await page.keyboard.press("ControlOrMeta+s");
    await organizer.getByRole("button", { name: "Open organized copy" }).waitFor();
    assert.deepEqual((await saved(2)).map(which), [1, 2, 4]);
  });
}
