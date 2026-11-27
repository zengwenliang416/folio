---
name: verify-folio
description: Launch this checkout's Folio desktop app (the Electron PDF reader) hidden on macOS with its own empty data dir, check it is worth driving, drive a feature through the real UI with Playwright over CDP, keep screenshots, ARIA snapshots and saved files as evidence, and end only the processes the run started. Use to prove a Folio change works in the running app, to reproduce a UI bug, or to collect evidence for a pull request, including when several agents verify in parallel worktrees on one Mac.
---

# Verify Folio

One script, `.claude/skills/verify-folio/scripts/folio-verify.mjs`, starts a hidden Folio that keeps running between
commands. Each `drive` attaches over CDP, runs Playwright code against the active document, and detaches, so you can
read the evidence and decide the next step. Run every command from the checkout root. The script runs only on macOS.
On Windows and Linux, use `npm run smoke`.

## Launch

1. If `node_modules` is missing, run `npm ci`.
2. Download the Electron binary once with `node -e 'require("electron")'`. Electron 45 downloads it on the first
   `require`, not during install. Behind an HTTP proxy, prefix the command with `ELECTRON_GET_USE_PROXY=1`, because
   Node's fetch ignores `HTTPS_PROXY`.
3. Run `npm run build`. Folio serves `dist/` over `app://folio/`, so a change in `src/`, `public/`, `index.html` or
   `vite.config.ts` needs a new build. `electron/*.cjs` loads as is, so a change there needs only a new `start`.
4. Run `node .claude/skills/verify-folio/scripts/folio-verify.mjs start`.

`start` refuses a stale build with `FAIL build`. Otherwise it makes an empty data dir under the system temp dir and
launches the copy of Electron from `scripts/electron-path.mjs`, which macOS treats as an agent app with no Dock icon.
The process runs detached in its own process group with `FOLIO_TEST_USER_DATA` and `FOLIO_TEST_HIDDEN=1` (both read by
`electron/main.cjs`), `--user-data-dir=<data dir>`, `--inspect=0`, `--remote-debugging-port=0` and `--mute-audio`.
Once the library shows **Try a sample document**, `start` installs the native guard described in [Drive](#drive)
through the main process's inspector. It then prints the pid, port, data dir and evidence dir, and runs Doctor. Exit 0 means the app is ready to drive. If a step fails, `start` ends what it launched, keeps
`app.log`, and prints `FAIL <step>`, where the step is `build`, `electron`, `spawn`, `devtools`, `renderer` or `guard`.

`start` takes about 3 s and leaves Folio running. If your instructions route long jobs through a queue, run
`npm run build` and `start` through it.

**Runs.** Each run has a name, `default` unless you pass `--run <name>` to every command, and keeps its state in
`release/verify-folio/<run>/` inside the checkout. Its data dir is a new `mkdtemp` path, and the OS picks its two
ports, so parallel worktrees never share a run, a data dir or a port. A second agent in the same checkout passes its
own `--run <name>`. `start` refuses a run whose processes are still alive. Never drive or stop a run you did not start.

**Operator data.** Folio's own data dir, `~/Library/Application Support/Folio`, is never used. `main.cjs` honors
`FOLIO_TEST_USER_DATA` only in an unpackaged app, and this script always runs the checkout unpackaged. Doctor fails if
a process of the run has a file open under `~/Library/Application Support`.

**Hidden.** On macOS the window is never shown. Chromium still paints it, so screenshots work. The app type is
`UIElement`, so it cannot come to the front. Never use `npm run app`, `electron .` or `FOLIO_SMOKE_SHOW=1`.

## Doctor

`node .claude/skills/verify-folio/scripts/folio-verify.mjs doctor` is read-only. Run it first whenever anything looks
off. Each line is `ok` or `FAIL`, and the exit code is 1 if any check fails.

| Check | Passes when |
|---|---|
| `build` | `dist/index.html` exists and is newer than every tracked or new file in `src/`, `public/`, `index.html` and `vite.config.ts` |
| `electron` | `node_modules/electron/path.txt` and the binary it names exist |
| `run` | `release/verify-folio/<run>/run.json` exists and the run was not stopped |
| `process` | The recorded pid runs from the launched Electron bundle with this run's `--user-data-dir` and this checkout as the app. The line shows the run's pids and the HEAD at start next to the current HEAD |
| `fresh` | Nothing in `dist/` or `electron/` changed after the run started |
| `data-dir` | `SingletonLock` names the recorded pid, the run has files open in its data dir, and none under `~/Library/Application Support` |
| `port` | `DevToolsActivePort` matches the recorded port, and the main pid listens on it and on the inspector port |
| `guard` | The main process reports the guard as installed, the run's data dir as `userData`, and the `package.json` version |
| `renderer` | CDP reaches `app://folio/index.html`, which shows the library or a document |
| `hidden` | CoreGraphics lists 0 on-screen windows for the run's pids, `lsappinfo` reports `UIElement`, and another app is frontmost |

Troubleshooting order:

1. `FAIL build`: run `npm run build` and fix its first error. `tsc --noEmit` runs before Vite.
2. `FAIL electron`: run step 2 of [Launch](#launch). If the download still fails, delete `node_modules/electron` and
   run `npm ci`.
3. `FAIL spawn`, `devtools`, `guard` or `renderer` from `start`: read `app.log` in the evidence dir, then run `start`
   again. A `renderer` failure with a clean log usually means a broken `dist/`, so rebuild.
4. `FAIL process`, `fresh`, `port`, `guard` or `renderer` on a running app: run `stop`, then `start`.
5. `FAIL hidden`: run `stop` at once and report the failure.
6. Still failing: run `npm run smoke`, the repo's own end-to-end check. If it fails on the base commit too, report that
   instead of the change.

## Drive

- Journey file: `node .claude/skills/verify-folio/scripts/folio-verify.mjs drive .claude/skills/verify-folio/journeys/search.mjs`
- One step inline: `node .claude/skills/verify-folio/scripts/folio-verify.mjs drive -e 'await page.getByRole("button", { name: /Try a sample/ }).click(); return await window.title()'`

A journey is an ESM module whose default export is `async (ctx) => {}`. Code after `-e` sees the same names, and the
value it returns is printed. A drive fails with exit 1 on a thrown error or an uncaught page error, and saves
`failure.png` and `failure.aria.txt`.

| Name | What it is |
|---|---|
| `page` | `readerPage(window)` from `scripts/reader-page.mjs`. Its locators target `iframe.document-reader.active`, the active document's frame, where all of Folio's UI lives |
| `window` | The Playwright page for `app://folio/index.html`. Use it for `screenshot`, `keyboard`, and `title()`, which names the active document |
| `step(title, fn)` | Runs one user action with its waits and asserts, then saves `NN-<title>.png` and `NN-<title>.aria.txt` |
| `shot(label)` | Saves a screenshot and an ARIA snapshot now |
| `openFile(files, trigger)` | Queues the files for the next file chooser, then runs `trigger`, which defaults to pressing `ControlOrMeta+o`. Paths are relative to the checkout |
| `native()` | Every call Folio made to the guard, returned once no download is still in progress |
| `downloads(count)` | The guard's download records, returned once at least `count` downloads have finished. Each has `file`, `state` and `bytes` |
| `answer(button)` | Sets the button index that the next message box gets |
| `readPdf(file)` | The text of each page of a PDF, read with `pdfjs-dist` outside Folio |
| `assert`, `root`, `evidence`, `log` | `node:assert/strict`, the checkout root, this drive's evidence dir, and a logger that also writes `steps.log` |

**The guard.** `start` replaces everything Folio hands to macOS, so nothing reaches the screen or another app:

- Message boxes (`dialog.showMessageBox`, `showMessageBoxSync` and `showErrorBox`) get their cancel button, or the
  button set with `answer`. Folio asks this way before it opens a link from a PDF, before it opens a local or LAN
  address, before it uses the camera, and when it quits with unsaved changes.
- `shell.openExternal` and `shell.openPath` are recorded and not performed, so no browser or Finder window opens.
- `webContents.print` is recorded and reports a cancelled print.
- Every download (**Save copy**, **Save organized copy**, a Notes export) is saved as `downloads/<n>-<name>` in the
  evidence dir.
- A page's file chooser is intercepted inside the app, so it never opens. `openFile` answers it. A chooser opened any
  other way stays unanswered and shows in `native()` as `fileChooser` with `files: null`.

Each drive prints the guard calls it caused as `native {...}` lines and keeps them in `steps.log`.

The guard does not cover the page's own `window.confirm`. Folio uses it before it closes a tab with unsaved changes
and for **Clear all** in **Recent**. A drive that opens one dismisses it and fails. Whether Electron shows it on screen
before the dismissal is unverified, so do not drive those paths here. `scripts/smoke-test.mjs` stubs `confirm` for
them.

Stable handles, all inside `page`, from `scripts/smoke-test.mjs` and `scripts/smoke-reader-tools.mjs`:

- Library: buttons `Try a sample document` (opens `public/sample.pdf`, 4 pages), `Open a PDF` and `Open from URL`.
- Header: buttons `Toggle sidebar (⌘\)`, `Ask AI`, `Search (⌘F)` (match `/^Search/`) and `More`, whose menu holds
  `About Folio` and `New tab`. Toolbar `Tools` holds `Select`, `Highlight`, `Draw`, `Text`, `Sign` and `Edit mode`.
- Sidebar (`aside.sidebar`): tabs `Pages`, `Outline` and `Notes`; buttons `Page N`, `Bookmark page N`, `Bookmarked`
  and `Organize pages`; thumbnails `.thumb[data-page="N"]`.
- Page bar: textbox `Page number`. With two or more documents open, tablist `Open documents` names each tab, and
  `.doc-title` is gone.
- Fixtures: `public/sample.pdf`, `scripts/fixtures/arabic-editing.pdf` and `scripts/fixtures/scanned-sample.pdf`.

Wait on state with `locator.waitFor`, `filter({ hasText })` or `waitForFunction`, never with a sleep. Leave the
system clipboard alone: **Copy** writes it, and the smoke test checks it only in CI for that reason. Ask AI against a
real provider, the camera picture itself, auto-update, and opening a file from Finder are out of reach here.
`scripts/smoke-test.mjs` stubs those in the main process, so extend it for such a change.

The feature map in [features/README.md](features/README.md) lists the mapped features, their user entry points, and
how each is proven.

## Evidence

Everything for one `start` goes under `release/verify-folio/<run>/<start time>/`, which git ignores. `start`, `drive`
and `stop` print the path.

- `app.log`: Electron's stdout and stderr for the whole run.
- `<journey>/NN-<step>.png` and `.aria.txt`: the window and the active document's accessibility tree after each step.
  `drive -e` writes to `eval/`.
- `<journey>/steps.log`: timestamped steps, `PASS` or `FAIL`, the error, and the `native` calls.
- `<journey>/failure.png` and `failure.aria.txt` when a drive fails.
- `downloads/`: every file Folio saved.
- `release/verify-folio/<run>/run.json`: the HEAD at start, pid, data dir, ports, and after `stop` the pids it ended.

Proof standards:

- Drive the user's path: buttons, menus, keys, and the file chooser through `openFile`. Do not set state through
  `page.evaluate`, `localStorage` or IPC. Use them only to read.
- Pair each action with its resulting state, one `step` per action.
- Check side effects in a second view. Read a saved file with `readPdf`. Reopen a document to prove that a setting or a
  bookmark persisted. **Open organized copy** appearing does not prove that a file was written.
- In your report, name the run, the HEAD that Doctor printed, the journey, the evidence dir, and the guard calls the
  proof relied on.
- Attach screenshots to the pull request. Never commit them.

## Cleanup

Run `node .claude/skills/verify-folio/scripts/folio-verify.mjs stop`, with `--run <name>` if you started with one.

`stop` finds the run's processes by observation. A process belongs to the run when it was started from the Electron
bundle recorded in `run.json` and its command line carries this run's `--user-data-dir`, or when it is in the main
pid's process group. `stop` sends those processes SIGKILL rather than asking Folio to quit, because a quit with
unsaved changes asks "One or more tabs have unsaved changes." and the data dir is thrown away anyway. It then checks
that none remain, deletes the data dir, and marks `run.json` stopped. It never matches a process name, so other runs,
`npm run smoke` and other Electron apps keep running. The evidence stays, and `stop` prints its path.

`stop` is safe to repeat and safe after a crash. Run it after every failed attempt and before you finish. A run you
forget keeps a hidden Folio alive with a CDP port and a Node inspector port open on 127.0.0.1, where any local process
can attach to them.

## Helpers

| Script | Invocation |
|---|---|
| `scripts/folio-verify.mjs` | `node .claude/skills/verify-folio/scripts/folio-verify.mjs [--run <name>] start \| doctor \| drive <journey.mjs> \| drive -e '<code>' \| stop` |
| `scripts/onscreen-windows.js` | Used by `doctor`. By hand: `.claude/skills/verify-folio/scripts/onscreen-windows.js <pid>...` prints `{"total":N,"mine":M}`, the count of on-screen windows and how many of them those pids own |
| `journeys/<feature>.mjs` | One per mapped feature, run with `drive`. Each feature file names its journey |

A full verification is `npm run build`, `start`, `drive <journey>`, reading the evidence, and `stop`.
