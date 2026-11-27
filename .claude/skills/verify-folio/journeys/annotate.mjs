// features/annotate.md as one journey. Starts from the library of a fresh `start`; public/sample.pdf has no
// annotations of its own.
import { readFileSync } from "node:fs";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const typed = "Checked by verify-folio";

async function annotations(file) {
  const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 });
  try {
    const pdf = await task.promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) pages.push((await (await pdf.getPage(n)).getAnnotations()).map((a) => ({ subtype: a.subtype, text: a.contentsObj?.str ?? "" })));
    return pages;
  } finally { await task.destroy(); }
}

export default async function annotate({ page, step, downloads, assert }) {
  const tools = page.getByRole("toolbar", { name: "Tools" });
  const tool = (name) => tools.getByRole("button", { name, exact: true });
  const options = page.getByRole("toolbar", { name: "Annotation options" });
  const sheet = page.locator('.page[data-page-number="1"]');
  const layer = sheet.locator(".annotationEditorLayer");
  const selectTool = async () => {
    await page.waitForFunction(() => document.querySelector(".app")?.getAttribute("data-tool") === "select");
    await page.getByRole("button", { name: "Select", exact: true, pressed: true }).waitFor();
  };
  const at = async (fx, fy) => {
    const box = await layer.boundingBox();
    return { x: box.x + box.width * fx, y: box.y + box.height * fy };
  };
  const onLayer = ({ x, y }) => page.evaluate(({ x, y }) =>
    document.elementFromPoint(x, y) === document.querySelector('.page[data-page-number="1"] .annotationEditorLayer'), { x, y });
  const saved = async (count) => {
    const files = await downloads(count);
    assert.equal(files.length, count);
    assert.equal(files.at(-1).state, "completed");
    assert.match(files.at(-1).file, /Folio sample\.pdf$/);
    const [first, ...rest] = await annotations(files.at(-1).file);
    assert.deepEqual(first.map((a) => a.subtype).sort(), ["FreeText", "Highlight", "Ink"]);
    assert.equal(first.find((a) => a.subtype === "FreeText").text, typed);
    assert.deepEqual(rest.flat(), []);
  };

  await step("open the sample", async () => {
    assert.ok(await page.getByRole("button", { name: /Try a sample/ }).isVisible(), "the journey starts from the library; run stop and start first");
    await page.getByRole("button", { name: /Try a sample/ }).click();
    await page.locator(".doc-title", { hasText: "Folio sample.pdf" }).waitFor();
    await sheet.locator(".textLayer span:not(.markedContent)").first().waitFor({ timeout: 30_000 });
    for (const name of ["Select", "Highlight", "Draw", "Text"]) await tool(name).waitFor();
  });

  await step("highlight marks the text selected with the mouse", async () => {
    await tool("Highlight").click();
    await sheet.locator(".textLayer.highlighting").waitFor();
    const line = sheet.locator(".textLayer").getByText("A short tour of Folio");
    const box = await line.boundingBox();
    await page.mouse.move(box.x + 1, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 1, box.y + box.height / 2, { steps: 8 });
    await page.waitForFunction(() => getSelection().toString().includes("A short tour of Folio"));
    await page.mouse.up();
    await sheet.locator(".highlightEditor").waitFor();
    assert.equal(await page.locator(".highlightEditor").count(), 1);
    await options.getByRole("button", { name: "Done", exact: true }).click();
    await selectTool();
  });

  await step("draw adds a pen stroke", async () => {
    await tool("Draw").click();
    await sheet.locator(".annotationEditorLayer.inkEditing").waitFor();
    assert.equal(await page.getByLabel("Drawing tool").inputValue(), "Pen");
    const from = await at(0.25, 0.4);
    assert.ok(await onLayer(from), "the stroke's start is covered; the window is smaller than the journey expects");
    await page.mouse.move(from.x, from.y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(from.x + i * 12, from.y + (i % 2) * 20);
    await page.mouse.up();
    await options.getByRole("button", { name: "Done", exact: true }).click();
    await selectTool();
    await sheet.locator(".inkEditor").waitFor();
    assert.equal(await page.locator(".inkEditor").count(), 1);
  });

  await step("text adds a typed text box", async () => {
    await tool("Text").click();
    const spot = await at(0.5, 0.55);
    assert.ok(await onLayer(spot), "the text box spot is covered; the window is smaller than the journey expects");
    await page.mouse.click(spot.x, spot.y);
    const box = sheet.locator('.freeTextEditor .internal[contenteditable="true"]');
    await box.fill(typed);
    await sheet.click({ position: { x: 30, y: 150 } });
    await selectTool();
    await sheet.locator(".freeTextEditor", { hasText: typed }).waitFor();
    assert.equal(await page.locator(".freeTextEditor").count(), 1);
  });

  await step("more save a copy saves the marks into the pdf", async () => {
    await page.getByRole("button", { name: "More", exact: true }).click();
    await page.getByRole("menuitem", { name: /Save a copy/ }).click();
    await page.getByText("Saved a copy with your highlights and notes").waitFor();
    await saved(1);
  });

  await step("command s saves the same marks again", async () => {
    await page.keyboard.press("ControlOrMeta+s");
    await saved(2);
  });
}
