# Folio verification map

This directory is the maintained source for verifying Folio's user-facing behavior. Read it before driving the app,
then use the matching feature file as the recipe.

## Baseline preconditions

- `npm run build` has run at the HEAD under test, and `folio-verify.mjs start` printed `doctor: ok`.
- The run is fresh, so the library shows `Try a sample document`, `Recent` is empty, and no document is open. Each
  journey checks for that state and fails with a pointer to `stop` and `start`, so give each journey its own `start`.
- Every command runs from the checkout root as `node .claude/skills/verify-folio/scripts/folio-verify.mjs …`, with the
  same `--run <name>` on each command when the run is not `default`.
- Evidence for one `start` goes under `release/verify-folio/<run>/<start time>/`: one folder per journey with its
  `NN-<step>.png`, `.aria.txt` and `steps.log`, and `downloads/` with every file Folio saved.

## Driving conventions

- Prefer roles and accessible names (`getByRole`, `getByLabel`, `getByTitle`) over CSS. Use CSS only where Folio has
  no accessible handle (`.doc-title`, `.textLayer`, `.thumb[data-page="N"]`, the pdf.js editors).
- Wrap each user action in `step(title, fn)` so the evidence pairs the action with its resulting state.
- Wait on state, never on time. Search debounces by 160 ms, and the status text is the signal that a search ended.
- Open documents as a user does: `Try a sample document`, a `Recent` card, or `openFile(files, trigger)`, which answers
  the file chooser that `ControlOrMeta+o` or `Open a PDF` opens.
- Use `page.evaluate` only to read. Drag, click and type with `page.mouse`, locators and `page.keyboard`.
- The native guard answers message boxes with their cancel button or the one set with `answer`, records
  `shell.openExternal`, `shell.openPath` and printing, saves every download under `downloads/`, and answers the file
  chooser through `openFile`. It does not answer the page's own `window.confirm`, which Folio uses before it closes a
  tab with unsaved changes and before `Clear all` in `Recent`. A drive that opens one dismisses it and fails, so
  journeys never trigger one.

## Proof and skip reporting

- Report the run name, the HEAD Doctor printed, the journey, the evidence dir, and the guard calls the proof relied on.
- Prove a saved file outside Folio. Take its path from `downloads(count)`, which waits, because a download can
  register after the UI says it saved. Read it with `readPdf` for page text or `pdfjs-dist` for annotations.
- A step that cannot run gets `FAIL` with the unmet precondition. Never weaken the journey to pass.
- A path the harness cannot drive stays out of the journey and is named in its feature's `Gotchas`. Do not report an
  entry point as verified through a different entry point.

## Feature entry contract

Each feature file has an H1, one paragraph on the user-visible behavior, then exactly these H2s in order:
`Sub-features`, `How to get to it (user POV)`, `Driving it with folio-verify`, `Gotchas`. The Driving section starts
with `Preconditions:`, names its journey and the command that runs it, and pairs each user action with its Playwright
call and observable result. Journeys live in `../journeys/<feature>.mjs`.

## Features

- [Open a document](./open-document.md): the sample, `Open a PDF` and `⌘O` with the file chooser, `Recent`, and
  document tabs (`New tab`, `⌘T` and `+`, switching, closing back to one).
- [Search a document](./search.md): toolbar and keyboard entry, match counts, stepping, match case, whole words, no
  results, jumping to a matching page, closing.
- [Organize pages](./organize-pages.md): sidebar and thumbnail-menu entry, delete, undo, move by position and by drag,
  keeping one page, saving the organized copy by button and `⌘S` with its page order read back, opening the copy.
- [Annotate a document](./annotate.md): `Highlight` on selected text, `Draw`, `Text`, and `Save a copy` or `⌘S`
  with the saved annotations read back.
