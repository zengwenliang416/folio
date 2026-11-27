# Organize pages

Organize pages turns the sidebar into a draft of the document's page order. The user deletes and moves pages there,
then saves the draft as a new PDF named `<name> (organized).pdf`. The open document itself never changes.

## Sub-features

- `organize-open` opens the organizer from the sidebar's `Organize pages` button.
- `organize-open-menu` opens it from a thumbnail's `Delete page` menu item, with that page already removed.
- `organize-delete` removes the selected pages with `Delete page` or the `Delete` key.
- `organize-undo` brings deleted pages back, selected.
- `organize-move` moves the selected page to a typed position.
- `organize-drag` moves a page by dragging its thumbnail onto another.
- `organize-keep-one` never deletes the last page: `Delete N pages` is disabled with every page selected.
- `organize-save` saves the draft with the kept pages in draft order, by `Save organized copy` or `⌘S`.
- `organize-open-copy` opens the saved copy in a new tab.
- `organize-done` leaves the organizer with the original document's pages unchanged.

## How to get to it (user POV)

- Open a document with more than one page, show the sidebar's `Pages` or `Outline` tab, and choose `Organize pages` at
  its bottom.
- Right-click a page thumbnail in the sidebar and choose `Delete page`. The organizer opens with that page removed.
- In the organizer, select a page by clicking it, and several with Shift-click or `⌘`-click.

## Driving it with folio-verify

Preconditions:

- A fresh `start` (library visible), `doctor: ok`.
- `public/sample.pdf` as shipped: 4 pages whose text starts `A short tour of Folio`, `Finding text`, `Asking AI` and
  `Save a copy`.
- `organizer` is `page.getByRole("complementary", { name: "Organize pages" })`, and `sidebar` is
  `page.locator("aside.sidebar")`.

Run the whole feature with
`node .claude/skills/verify-folio/scripts/folio-verify.mjs drive .claude/skills/verify-folio/journeys/organize-pages.mjs`.
It prints one `step` line per action and `PASS organize-pages evidence <dir>`. Each step:

- **Open the sample.** Choose `Try a sample document`. The sidebar lists buttons `Page 1` to `Page 4`.
- **Sidebar entry.** `sidebar.getByRole("button", { name: "Organize pages" }).click()`. The organizer lists
  `Page 1, position 1` to `Page 4, position 4`, and `Undo` and `Save organized copy` are disabled.
- **Delete with the button.** Click `Page 2, position 2`, then
  `organizer.getByRole("button", { name: "Delete page", exact: true }).click()`.
  `Page 3, position 2` appears and the order is 1, 3, 4.
- **Undo.** `organizer.getByRole("button", { name: "Undo", exact: true }).click()`. `Page 2, position 2` is back and
  pressed.
- **Delete with the key.** `page.keyboard.press("Delete")`. The order is 1, 3, 4 again.
- **Move by position.** Click `Page 4, position 3`, `organizer.getByLabel("Move page 4 to").fill("1")`, then choose
  `Move`. `Page 4, position 1` appears and the order is 4, 1, 3.
- **Drag.** `thumb(1, 2).dragTo(thumb(3, 3))`. `Page 1, position 3` appears and the order is 4, 3, 1.
- **Keep one page.** Click `Page 4, position 1`, then Shift-click `Page 1, position 3`. `Delete 3 pages` is disabled,
  and `Delete` leaves the order at 4, 3, 1.
- **Save.** Choose `Save organized copy`. `Open organized copy` appears and `Cancel` reads `Done`. `downloads(1)` returns a
  completed download of `downloads/<n>-Folio sample (organized).pdf` in the run's evidence dir, and `readPdf` of it
  gives 3 pages starting `Save a copy`, `Asking AI`, `A short tour of Folio`.
- **Open the copy.** Choose `Open organized copy`. Tab `Folio sample (organized).pdf` is selected in tablist
  `Open documents`, the window title names it, and its text renders.
- **Back to the original.** Choose tab `Folio sample.pdf`. Its organizer is still open with `Open organized copy`.
- **Done.** Choose `Done`. The organizer is gone and the sidebar lists `Page 1` to `Page 4`.
- **Thumbnail menu entry.** `sidebar.locator('.thumb[data-page="3"]').click({ button: "right" })`, then menuitem
  `Delete page` in menu `Page actions`. The organizer opens with order 1, 2, 4, `Undo` enabled, and `Cancel`.
- **Save shortcut.** `page.keyboard.press("ControlOrMeta+s")`. A second completed download reads as 3 pages starting
  `A short tour of Folio`, `Finding text`, `Save a copy`.
- **Proof.** `<evidence>/organize-pages/09-save-organized-copy-writes-the-pages-in-draft-order.png` shows the saved
  draft, and the two `download` lines in `steps.log` name the files that `readPdf` read.

## Gotchas

- The `Organize pages` button is absent for a one-page document and on the sidebar's `Notes` tab.
- Thumbnails are named `Page N` outside the organizer and `Page N, position P` inside it. N is the page's number in
  the original, so it survives moves. Read the order from the thumbnails' names in DOM order. The list is virtual,
  so in a long document only the rows near the view exist.
- The delete button is named `Delete page` with one page selected and `Delete N pages` with several.
- `Delete`, `Backspace` and `⌘Z` act on the draft only while focus is inside the organizer, but not in its
  `Move page N to` box, or on no control at all. Clicking a thumbnail first is enough.
- `Save organized copy` is disabled until the draft differs from the original.
- `Open organized copy` appearing does not prove a file was written, and the download can finish after it appears.
  Wait with `downloads(count)` and read the file with `readPdf`.
- An unsaved draft marks the tab as unsaved, so its close button reads `Close <name>, unsaved changes` and closing it
  asks with `window.confirm`, which the guard does not answer. Leave such a tab open; `stop` ends the app anyway.
