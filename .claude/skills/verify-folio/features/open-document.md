# Open a document

The library is where a user opens documents: the sample, a PDF from disk with the button or `⌘O`, or a card from
`Recent`, which lists what was opened before. With two or more documents open, a tab strip names each one, switches
between them, and closes them. It disappears again when one document is left.

## Sub-features

- `open-sample` opens `Try a sample document` as `Folio sample.pdf`, 4 pages.
- `open-button` opens a chosen file from `Open a PDF`.
- `open-key` opens a chosen file with `⌘O` (`Ctrl+O` elsewhere). With a document open, the file gets a new tab.
- `open-recent` lists each opened document under `Recent` with its page count, and reopens it from its card.
- `tabs-new` adds a `Library` tab from `More` > `New tab`, `⌘T`, or the tab strip's `+` button, and brings up tablist
  `Open documents`.
- `tabs-switch` shows the chosen tab's document and names it in the window title.
- `tabs-close` closes a tab and selects the one beside it. With one tab left the tablist is gone and `.doc-title`
  names the document.

## How to get to it (user POV)

- In the library, choose `Try a sample document` or `Open a PDF`. Anywhere, press `⌘O`.
- In the library, choose a card under `Recent`. Each card is a button named after the file without `.pdf`.
- With a document open, choose `More` (the `⋯` button in the header) and then `New tab`, or press `⌘T`. With two or
  more tabs, the `+` button (`New tab`) at the end of the tab strip does the same.
- With two or more tabs, choose a tab to switch to it, and its `Close <name>` button to close it.

## Driving it with folio-verify

Preconditions:

- A fresh `start` (library visible, `Recent` empty), `doctor: ok`.
- `public/sample.pdf` (4 pages) and `scripts/fixtures/arabic-editing.pdf` (1 page) as shipped.
- `docs` is `page.getByRole("tablist", { name: "Open documents" })`.

Run the whole feature with
`node .claude/skills/verify-folio/scripts/folio-verify.mjs drive .claude/skills/verify-folio/journeys/open-document.mjs`.
It prints one `step` line per action and `PASS open-document evidence <dir>`. Each step:

- **Library.** Buttons `Try a sample document`, `Open a PDF` and `Open from URL` show, and there is no heading
  `Recent`.
- **Sample.** `page.getByRole("button", { name: /Try a sample/ }).click()`. `.doc-title` reads `Folio sample.pdf`, a
  `.textLayer` span renders, `window.title()` is `Folio sample.pdf — Folio`, and there is no tablist.
- **New tab.** `page.getByRole("button", { name: "More", exact: true }).click()`, then
  `page.getByRole("menuitem", { name: /New tab/ }).click()`. Tablist `Open documents` holds tabs `Folio sample.pdf` and
  `Library`, with `Library` selected. Heading `Recent` shows a button named `/^Folio sample /` that reads `4 pages`.
- **Open a PDF.** `openFile("scripts/fixtures/arabic-editing.pdf", () => page.getByRole("button", { name: /Open a PDF/ }).click())`.
  The `Library` tab becomes the selected tab `arabic-editing.pdf`, the title follows, and `native()` holds one
  `fileChooser` call with that path.
- **Switch.** `docs.getByRole("tab", { name: "Folio sample.pdf", exact: true }).click()`. That tab is selected and the
  title is `Folio sample.pdf — Folio`.
- **Close.** `docs.getByRole("button", { name: "Close arabic-editing.pdf", exact: true }).click()`. The tablist is gone
  and `.doc-title` reads `Folio sample.pdf`.
- **Recent.** `New tab` again. `Recent` lists `arabic-editing` (`1 page`) and `Folio sample`.
  `page.getByRole("button", { name: /^arabic-editing / }).click()` reopens it as the selected tab `arabic-editing.pdf`.
- **Close again.** Its `Close arabic-editing.pdf` button leaves `Folio sample.pdf` alone, with no tablist.
- **Keyboard.** With `Folio sample.pdf` open, `openFile("scripts/fixtures/arabic-editing.pdf")`, which presses
  `ControlOrMeta+o`. A new tab `arabic-editing.pdf` is selected, the tabs read `Folio sample.pdf`,
  `arabic-editing.pdf`, and `native()` holds a second `fileChooser` call.
- **⌘T.** `page.keyboard.press("ControlOrMeta+t")`. A third tab `Library` is selected.
- **Close the selected tab.** `docs.getByRole("button", { name: "Close Library", exact: true }).click()`. The tab
  beside it, `arabic-editing.pdf`, is selected.
- **Tab strip `+`.** `page.getByRole("navigation", { name: "Documents" }).getByRole("button", { name: "New tab", exact: true }).click()`.
  A third tab `Library` is selected and shows `Try a sample document`.
- **Proof.** `<evidence>/open-document/03-more-new-tab-adds-a-library-tab-that-lists-the-sample-as-recent.png` shows
  the tab strip and the `Recent` card. The `native` lines in `steps.log` show both answered choosers.

## Gotchas

- The tab strip exists only with two or more tabs. With one, the tablist is gone and `.doc-title` names the document;
  with several, `.doc-title` is gone. Assert the one the step expects.
- A new tab is the library, so `page` follows it. `Try a sample document` and `Open a PDF` there replace the `Library`
  tab instead of adding one. `New tab` and `⌘T` select an existing `Library` tab instead of adding a second.
- Documents are keyed by content. Opening a file whose bytes are already open, such as `public/sample.pdf` while
  `Folio sample.pdf` is open, selects the open tab and drops the new one. Open the sample and the fixture, not both
  copies of the sample.
- `Recent` is read when the library tab becomes active. It lists what was saved by then, newest first, and names each
  card after the file without `.pdf`.
- Closing a tab with unsaved changes, and `Clear all` under `Recent`, ask with the page's `window.confirm`, which the
  guard does not answer, so a real dialog would wait for a person. The journey closes only unchanged tabs and never
  chooses `Clear all`.
- Drag and drop of a file, opening a file from Finder, and `Open from URL` are out of reach: the first two start
  outside the window, and the third needs the internet. The journey leaves them out.
- `scripts/fixtures/scanned-sample.pdf` starts text recognition when opened. Use `arabic-editing.pdf` to prove opening.
