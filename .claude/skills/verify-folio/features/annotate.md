# Annotate a document

The `Tools` toolbar marks up the open document: `Highlight` marks the text the user selects, `Draw` adds pen strokes
and shapes, and `Text` adds a typed text box. Folio keeps the marks on its own, and `Save a copy` writes them into a
new PDF as real annotations that other PDF readers show.

## Sub-features

- `annotate-highlight` highlights the text dragged across while `Highlight` is on, when the mouse is released.
- `annotate-draw` adds a pen stroke while `Draw` is on.
- `annotate-text` adds a text box where the page is clicked while `Text` is on, and clicking away finishes it.
- `annotate-done` turns a tool off with `Done` in toolbar `Annotation options`, which leaves `Select` on.
- `annotate-save` saves `Folio sample.pdf` with one `Highlight`, one `Ink` and one `FreeText` annotation on page 1,
  from `More` > `Save a copy` and from `⌘S`.

## How to get to it (user POV)

- With a document open, choose `Highlight`, `Draw` or `Text` in the header's `Tools` toolbar, or press `H`, `D` or `T`
  while the page has focus. `V` or `Select` turns them off.
- While a tool is on, toolbar `Annotation options` shows its colors, `Undo` and `Done`, plus `Drawing tool` and
  `Pen width` for `Draw`.
- Choose `More` and then `Save a copy`, or press `⌘S`, to save the marked-up copy.

## Driving it with folio-verify

Preconditions:

- A fresh `start` (library visible), `doctor: ok`.
- `public/sample.pdf` as shipped: page 1 starts with the line `A short tour of Folio`, and no page has annotations.
- `tools` is `page.getByRole("toolbar", { name: "Tools" })`, and `sheet` is
  `page.locator('.page[data-page-number="1"]')`.

Run the whole feature with
`node .claude/skills/verify-folio/scripts/folio-verify.mjs drive .claude/skills/verify-folio/journeys/annotate.mjs`.
It prints one `step` line per action and `PASS annotate evidence <dir>`. Each step:

- **Open the sample.** Choose `Try a sample document`. `tools` holds `Select`, `Highlight`, `Draw` and `Text`.
- **Highlight.** `tools.getByRole("button", { name: "Highlight", exact: true }).click()`, then drag across
  `sheet.locator(".textLayer").getByText("A short tour of Folio")` with `page.mouse.down()`, `move` in steps and
  `up()`. One `.highlightEditor` appears on release. `Done` in `Annotation options` leaves `Select` pressed.
- **Draw.** `tools.getByRole("button", { name: "Draw", exact: true }).click()`. `Drawing tool` reads `Pen`. A
  `page.mouse` stroke over `sheet`'s `.annotationEditorLayer` draws a line. `Done` leaves `Select` pressed, and one
  `.inkEditor` holds the stroke.
- **Text.** `tools.getByRole("button", { name: "Text", exact: true }).click()`, `page.mouse.click` on the middle of
  the page, then `sheet.locator('.freeTextEditor .internal[contenteditable="true"]').fill("Checked by verify-folio")`
  and a click elsewhere on `sheet`. One `.freeTextEditor` holds the text and `Select` is pressed.
- **Save a copy.** `More`, then `page.getByRole("menuitem", { name: /Save a copy/ }).click()`. The toast reads
  `Saved a copy with your highlights and notes`. `native()` holds a completed `download` of
  `downloads/<n>-Folio sample.pdf` in the run's evidence dir, and `pdfjs-dist`'s `getAnnotations` on it gives page 1
  the subtypes `FreeText`, `Highlight` and `Ink`, the `FreeText` reading `Checked by verify-folio`, and no other
  page any annotation.
- **Save shortcut.** `page.keyboard.press("ControlOrMeta+s")`. A second completed download holds the same three
  annotations.
- **Proof.** `<evidence>/annotate/04-text-adds-a-typed-text-box.png` shows the three marks on page 1. The `download`
  lines in `steps.log` name the files that were read.

## Gotchas

- The toolbar's own `Save copy` button appears only once text or images were changed in `Edit mode`. To save
  annotations, use `More` > `Save a copy` or `⌘S`.
- In `Highlight` mode the highlight is made when the mouse is released, not while dragging. Drag with `page.mouse`
  as a user does, and wait for the selection text before `up()`.
- Clicking away from a text box finishes it and returns to `Select`. An empty box is removed, so fill it before
  clicking away. Fill it in one go: typing key by key can land out of order while pdf.js focuses the box.
- Pen strokes made while `Draw` stays on become one ink mark when the drawing ends, with `Done` or another tool.
  Until then there is no `.inkEditor` to wait for.
- `Annotation options` and the page pill float over the page, so a click or stroke can land on them. The journey
  checks with `document.elementFromPoint` that its spots are on the page's editor layer.
- `readPdf` returns only text, and a text box is not part of a page's text. Read annotations with `pdfjs-dist`'s
  `getAnnotations` in the journey.
- The download can register after the toast. Wait for the `download` call in `native()`, not for the toast.
- `Sign` uses a drawn, typed or camera signature in a dialog, and the camera path asks through the guard. The journey
  leaves `Sign` and `Edit mode` out, since they are features of their own.
