# Folio verification map

This directory is the maintained source for verifying Folio's user-facing behavior. Read it before driving the app,
then use the matching feature file as the recipe.

## Baseline preconditions

- `npm run build` has run at the HEAD under test, and `folio-verify.mjs start` printed `doctor: ok`.
- The run is fresh, so the library shows `Try a sample document` and no document is open. A journey that needs that
  state checks for it and fails with a pointer to `stop` and `start`.
- Every command runs from the worktree root as `node .claude/skills/verify-folio/scripts/folio-verify.mjs …`.

## Driving conventions

- Prefer roles and accessible names (`getByRole`, `getByLabel`, `getByTitle`) over CSS. Use CSS only where Folio has
  no accessible handle (`.doc-title`, `.textLayer`).
- Wrap each user action in `step(title, fn)` so the evidence pairs the action with its resulting state.
- Wait on state, never on time. Search debounces by 160 ms, and the status text is the signal that a search ended.
- Open documents as a user does: `Try a sample document`, or `openFile(path)`, which goes through `ControlOrMeta+o`.

## Proof and skip reporting

- Report the run name, the HEAD Doctor printed, the journey, and the evidence dir.
- A step that cannot run gets `FAIL` with the unmet precondition. Never weaken the journey to pass.
- Do not report an entry point as verified through a different entry point.

## Feature entry contract

Each feature file has an H1, one paragraph on the user-visible behavior, then exactly these H2s in order:
`Sub-features`, `How to get to it (user POV)`, `Driving it with folio-verify`, `Gotchas`. Journeys live in
`../journeys/<feature>.mjs`.

## Features

- [Search a document](./search.md): toolbar and keyboard entry, match counts, stepping, match case, whole words, no
  results, jumping to a matching page, closing.
