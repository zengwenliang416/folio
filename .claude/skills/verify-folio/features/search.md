# Search a document

Search finds words in the open document as the user types. It shows `N of M` for the current match, lists matching
pages with a snippet, steps through matches, narrows by case or whole words, says `No results` when nothing matches,
and jumps to a page chosen from the list.

## Sub-features

- `search-open-toolbar` opens an empty, focused search from the header button.
- `search-open-key` opens it with `⌘F` (`Ctrl+F` elsewhere).
- `search-count` shows `1 of 4` for `lighthouse` in the sample and one result `Go to page 2, 4 matches`.
- `search-step` moves with `Enter` and back with `Shift+Enter`.
- `search-case` uses `Match case` to drop `Lighthouse` (the sample has only lowercase).
- `search-word` uses `Whole words` to cut `light` from several matches to `1 of 1`.
- `search-empty` shows `No results` and an empty list for `volcano`.
- `search-jump` goes to a page when its result is chosen.
- `search-close` closes with `Escape`. Reopening starts with an empty box.

## How to get to it (user POV)

- With a document open, choose the magnifier button `Search (⌘F)` in the header.
- Press `⌘F` while the document has focus.
- Close with `Escape` in the box, the `Close (Esc)` button, or the header button again.

## Driving it with folio-verify

Preconditions:

- A fresh `start` (library visible), `doctor: ok`.
- `public/sample.pdf` as shipped: `lighthouse` four times, all on page 2, all lowercase; `light` as a whole word once (page 3).

Run the whole feature with
`node .claude/skills/verify-folio/scripts/folio-verify.mjs drive .claude/skills/verify-folio/journeys/search.mjs`.
It prints one `step` line per action and `PASS search evidence <dir>`. Each step:

- **Open the sample.** Choose `Try a sample document`. `.doc-title` reads `Folio sample.pdf` and a `.textLayer` span renders.
- **Toolbar entry.** `page.getByRole("button", { name: /^Search/ }).click()`. Textbox `Find in document` has focus,
  and complementary `Search results` shows `Search above to see matching pages…`.
- **Count.** `fill("lighthouse")`. The status in `getByRole("search")` reads `1 of 4`, and `Search results` holds one
  button `Go to page 2, 4 matches` whose `mark` is `lighthouse`.
- **Step.** `press("Enter")` gives `2 of 4`, and `press("Shift+Enter")` gives `1 of 4`.
- **Match case.** `getByTitle("Match case").click()`, then `fill("Lighthouse")`. The status reads `No results` with
  no result buttons. Toggling it off gives `1 of 4`.
- **Whole words.** `fill("light")` gives `1 of N` with N > 1. `getByTitle("Whole words").click()` gives `1 of 1`.
- **No results.** `fill("volcano")`. The status reads `No results`, with no result buttons.
- **Jump.** `fill("lighthouse")`, set textbox `Page number` to `1` with Enter, then choose `Go to page 2, 4 matches`.
  `Page number` reads `2`.
- **Close.** `press("Escape")` in the box removes the `search` landmark.
- **Keyboard entry.** `page.keyboard.press("ControlOrMeta+f")`. `Find in document` is back, focused and empty.
- **Proof.** `<evidence>/search/03-typing-a-word-counts-matches-and-lists-the-page.png` shows the highlighted matches
  and the `Matching pages 1` panel. Each `.aria.txt` holds the matching accessibility tree.

## Gotchas

- Typing a query already scrolls to the first match, which is on page 2. Prove `search-jump` from page 1 first, or the
  jump proves nothing.
- The status updates after a 160 ms debounce and can read `Searching…` first. Wait for the final text, never sleep.
- `Match case` and `Whole words` are icon chips named `Aa` and `ab`. Find them by title, not by name, and turn them off
  after a step, because they persist while the bar stays open.
- `getByRole("search").getByRole("status")` can match two elements while OCR runs on a scanned PDF, because
  `Results may be incomplete…` is also a status. Filter by text.
- Search only exists with a document open. In the library there is no `Search` button.
- `F` without `⌘` toggles focus mode, not search.
