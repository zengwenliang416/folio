#!/usr/bin/env node
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { electronPath } from "../../../../scripts/electron-path.mjs";
import { readerPage } from "../../../../scripts/reader-page.mjs";

const root = path.resolve(import.meta.dirname, "../../../..");
const args = process.argv.slice(2);
const runAt = args.indexOf("--run");
const run = runAt >= 0 ? args.splice(runAt, 2)[1] : "default";
if (!/^[\w.-]+$/.test(run ?? "")) throw new Error(`bad --run name: ${run}`);
const runDir = path.join(root, "release", "verify-folio", run);
const stateFile = path.join(runDir, "run.json");
const operatorDir = path.join(homedir(), "Library", "Application Support");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class StepError extends Error {
  constructor(step, message) { super(message); this.step = step; }
}

function readState() {
  try { return JSON.parse(readFileSync(stateFile, "utf8")); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}
function writeState(state) {
  writeFileSync(stateFile + ".tmp", JSON.stringify(state, null, 2));
  renameSync(stateFile + ".tmp", stateFile);
}

function processes() {
  return execFileSync("ps", ["-axww", "-o", "pid=,pgid=,command="], { encoding: "utf8" }).split("\n").filter(Boolean).map((line) => {
    const [, pid, pgid, command] = /^\s*(\d+)\s+(\d+)\s(.*)$/.exec(line);
    return { pid: +pid, pgid: +pgid, command };
  });
}

// Chromium copies --user-data-dir onto every helper's command line.
function runProcesses(state) {
  const list = processes();
  const bundle = state.exe.slice(0, state.exe.lastIndexOf(".app/") + ".app/".length);
  const flag = `--user-data-dir=${state.dataDir}`;
  const inBundleWithDataDir = list.filter((p) => p.command.startsWith(bundle) && (p.command.includes(flag + " ") || p.command.endsWith(flag)));
  const leader = inBundleWithDataDir.find((p) => p.pid === state.pid) ?? null;
  const members = list.filter((p) => inBundleWithDataDir.includes(p) || (leader && p.pgid === leader.pid));
  return { leader, members };
}

const newest = (...paths) => Math.max(...git("ls-files", "--cached", "--others", "--exclude-standard", "--", ...paths).split("\n")
  .map((f) => path.join(root, f)).filter((f) => f !== root && existsSync(f)).map((f) => statSync(f).mtimeMs));

function staleBuild() {
  const built = path.join(root, "dist", "index.html");
  if (!existsSync(built)) return "dist/index.html is missing";
  return newest("src", "public", "index.html", "vite.config.ts") > statSync(built).mtimeMs ? "a file in src/, public/, index.html or vite.config.ts is newer than dist" : null;
}

function electronBinary() {
  const pkg = path.join(root, "node_modules", "electron");
  const pathTxt = path.join(pkg, "path.txt");
  if (!existsSync(pathTxt)) return { problem: "node_modules/electron/path.txt is missing (binary never downloaded)" };
  const bin = path.join(pkg, "dist", readFileSync(pathTxt, "utf8").trim());
  return existsSync(bin) ? { bin } : { problem: `${bin} is missing` };
}

async function evaluateInMain(state, fn, arg) {
  const socket = new WebSocket(state.inspector);
  let timer;
  try {
    const { result, exceptionDetails } = await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error("the main process did not answer within 15 s")), 15_000);
      socket.onerror = () => reject(new Error("the main process inspector did not answer"));
      socket.onopen = () => socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { awaitPromise: true, returnByValue: true,
        expression: `(${fn})(process.mainModule.require("electron"), ${JSON.stringify(arg ?? null)})` } }));
      socket.onmessage = (event) => { const message = JSON.parse(event.data); if (message.id === 1) resolve(message.result); };
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  } finally {
    clearTimeout(timer);
    socket.close();
  }
}

// Chromium opens a page's file chooser below Electron's dialog module, so it is intercepted over the window's debugger.
function guard({ dialog, shell, session, BrowserWindow }, downloads) {
  const win = BrowserWindow.getAllWindows()[0];
  const seen = globalThis.verifyFolio = { calls: [], answers: [], files: [] };
  const note = (call, detail) => seen.calls[seen.calls.push({ call, ...detail }) - 1];
  const ask = (call, args) => {
    const { message, buttons, cancelId, defaultId } = args.find((a) => a && !(a instanceof BrowserWindow)) ?? {};
    return note(call, { message, buttons, response: seen.answers.length ? seen.answers.shift() : cancelId ?? defaultId ?? 0 }).response;
  };
  dialog.showMessageBoxSync = (...args) => ask("showMessageBoxSync", args);
  dialog.showMessageBox = async (...args) => ({ response: ask("showMessageBox", args), checkboxChecked: false });
  dialog.showErrorBox = (title, content) => { note("showErrorBox", { title, content }); };
  shell.openExternal = async (url) => { note("openExternal", { url }); };
  shell.openPath = async (target) => { note("openPath", { target }); return ""; };
  Object.getPrototypeOf(win.webContents).print = (options, callback) => { note("print", { options }); callback?.(false, "verify-folio records a print instead of sending it"); };
  session.defaultSession.on("will-download", (_event, item) => {
    const entry = note("download", { file: `${downloads}/${seen.calls.length + 1}-${item.getFilename()}`, state: "progressing" });
    item.setSavePath(entry.file);
    item.once("done", (_done, state) => Object.assign(entry, { state, bytes: item.getReceivedBytes() }));
  });
  const cdp = win.webContents.debugger;
  cdp.attach("1.3");
  cdp.on("message", (_event, method, params) => {
    if (method !== "Page.fileChooserOpened") return;
    const { files } = note("fileChooser", { files: seen.files.shift() ?? null });
    if (files) void cdp.sendCommand("DOM.setFileInputFiles", { files, backendNodeId: params.backendNodeId });
  });
  return cdp.sendCommand("Page.enable").then(() => cdp.sendCommand("Page.setInterceptFileChooserDialog", { enabled: true })).then(() => true);
}

// Playwright takes over downloads when it connects; handing them back to Electron lets the guard save them as evidence.
async function connect(port) {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`);
  const window = browser.contexts().flatMap((c) => c.pages()).find((p) => p.url().startsWith("app://folio/"));
  if (!window) { await browser.close(); throw new Error("no app://folio/ page"); }
  await (await browser.newBrowserCDPSession()).send("Browser.setDownloadBehavior", { behavior: "default" });
  return { browser, window, page: readerPage(window) };
}

async function readerState(window, page) {
  if (await page.getByRole("button", { name: /Try a sample/ }).isVisible()) return "library";
  const title = await window.title();
  return title ? `document "${title}"` : null;
}

function git(...a) {
  return spawnSync("git", ["-C", root, ...a], { encoding: "utf8" }).stdout.trim();
}

async function start() {
  const prior = readState();
  if (prior && !prior.stoppedAt) {
    const { members } = runProcesses(prior);
    if (members.length) throw new StepError("start", `run ${run} still has processes ${members.map((p) => p.pid).join(" ")}; run stop first, or pass --run <other-name>`);
    await stop();
  }
  const stale = staleBuild();
  if (stale) throw new StepError("build", `${stale}; run npm run build`);
  mkdirSync(runDir, { recursive: true });
  const evidence = path.join(runDir, new Date().toISOString().replace(/[:.]/g, "-"));
  mkdirSync(path.join(evidence, "downloads"), { recursive: true });
  const dataDir = mkdtempSync(path.join(realpathSync(tmpdir()), `folio-verify-${run}-`));
  const env = { ...process.env, FOLIO_TEST_USER_DATA: dataDir, FOLIO_TEST_HIDDEN: "1" };
  for (const key of ["ELECTRON_RUN_AS_NODE", "FOLIO_DEV_URL", "FOLIO_UPDATE_TEST"]) delete env[key];
  let exe;
  try { exe = electronPath(env); }
  catch (error) { throw new StepError("electron", `${error.message}; see Doctor troubleshooting step 2`); }

  const logFile = path.join(evidence, "app.log");
  const child = spawn(exe, [`--user-data-dir=${dataDir}`, "--inspect=0", "--remote-debugging-port=0", "--mute-audio", root],
    { env, detached: true, stdio: ["ignore", openSync(logFile, "a"), openSync(logFile, "a")] });
  await new Promise((resolve, reject) => { child.once("spawn", resolve); child.once("error", (e) => reject(new StepError("spawn", e.message))); });
  child.unref();
  const state = { run, root, head: git("rev-parse", "HEAD"), pid: child.pid, exe, dataDir, evidence, startedAt: new Date().toISOString() };
  writeState(state);

  try {
    const until = async (step, ms, probe) => {
      for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(200)) {
        if (child.exitCode !== null || child.signalCode) throw new StepError(step, `Electron exited (${child.exitCode ?? child.signalCode}); see ${logFile}`);
        const value = await probe();
        if (value) return value;
      }
      throw new StepError(step, `not ready after ${ms} ms; see ${logFile}`);
    };
    Object.assign(state, await until("devtools", 30_000, () => {
      const inspector = /Debugger listening on (ws:\/\/\S+)/.exec(readFileSync(logFile, "utf8"))?.[1];
      try { return inspector && { inspector, port: Number(readFileSync(path.join(dataDir, "DevToolsActivePort"), "utf8").split("\n")[0]) || null }; }
      catch { return null; }
    }));
    writeState(state);
    const { browser, page } = await until("renderer", 30_000, () => connect(state.port).catch(() => null));
    try { await page.getByRole("button", { name: /Try a sample/ }).waitFor({ timeout: 30_000 }); }
    catch (error) { throw new StepError("renderer", `library never showed "Try a sample document": ${error.message.split("\n")[0]}`); }
    finally { await browser.close(); }
    try { await evaluateInMain(state, guard, path.join(evidence, "downloads")); }
    catch (error) { throw new StepError("guard", error.message); }
  } catch (error) {
    await stop();
    throw error;
  }
  console.log(`started run ${run}: pid ${state.pid}, port ${state.port}\n  data dir ${dataDir}\n  evidence ${evidence}`);
  return doctor();
}

async function doctor() {
  let failed = false;
  const check = (name, ok, detail) => { console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${detail}`); if (!ok) failed = true; return ok; };
  const finish = () => {
    console.log(failed ? "doctor: FAIL" : "doctor: ok");
    if (failed) process.exitCode = 1;
  };
  const stale = staleBuild();
  check("build", !stale, stale ? `${stale}; run npm run build` : "dist is newer than src and public");
  const { bin, problem } = electronBinary();
  check("electron", !problem, problem ?? bin);
  const state = readState();
  if (!check("run", state && !state.stoppedAt, !state ? `no run ${run}; run start` : state.stoppedAt ? `run ${run} was stopped at ${state.stoppedAt}; run start` : `${run} (${stateFile})`)) return finish();

  const { leader, members } = runProcesses(state);
  if (!check("process", leader && leader.command.startsWith(state.exe) && leader.command.endsWith(` ${root}`),
    leader ? `pid ${leader.pid}, processes ${members.map((p) => p.pid).join(" ")}, app ${root} at ${state.head.slice(0, 8)} (worktree HEAD ${git("rev-parse", "HEAD").slice(0, 8)})`
      : `pid ${state.pid} is gone; run stop, then start`)) return finish();
  const built = path.join(root, "dist", "index.html");
  const changed = !existsSync(built) || Math.max(newest("electron"), statSync(built).mtimeMs) > Date.parse(state.startedAt);
  check("fresh", !changed, changed ? "dist or electron/ changed after this run started; run stop, then start" : `nothing in dist or electron/ changed since ${state.startedAt}`);

  let lock = null;
  try { lock = readlinkSync(path.join(state.dataDir, "SingletonLock")); } catch {}
  const open = spawnSync("lsof", ["-nP", "-Fn", "-p", members.map((p) => p.pid).join(",")], { encoding: "utf8" }).stdout
    .split("\n").filter((l) => l.startsWith("n/")).map((l) => l.slice(1));
  const inData = open.filter((f) => f.startsWith(state.dataDir + "/")).length;
  const outside = open.filter((f) => f.startsWith(realpathSync(operatorDir) + "/"));
  check("data-dir", lock?.endsWith(`-${state.pid}`) && inData > 0 && outside.length === 0,
    `SingletonLock -> ${lock}; ${inData} open file(s) in ${state.dataDir}; ${outside.length} under ${operatorDir}${outside.length ? ": " + outside.slice(0, 3).join(", ") : ""}`);

  let port = null;
  try { port = Number(readFileSync(path.join(state.dataDir, "DevToolsActivePort"), "utf8").split("\n")[0]); } catch {}
  const inspectorPort = Number(new URL(state.inspector).port);
  const listens = (p) => spawnSync("lsof", ["-nP", "-a", "-p", String(state.pid), `-iTCP:${p}`, "-sTCP:LISTEN"]).status === 0;
  if (!check("port", port === state.port && listens(port) && listens(inspectorPort),
    `DevToolsActivePort ${port} (recorded ${state.port}) and inspector ${inspectorPort} ${listens(port) && listens(inspectorPort) ? "both listened on by" : "NOT both listened on by"} pid ${state.pid}`)) return finish();

  try {
    const seen = await evaluateInMain(state, ({ app, BrowserWindow }) => ({ userData: app.getPath("userData"), version: app.getVersion(),
      guarded: !!globalThis.verifyFolio && BrowserWindow.getAllWindows()[0]?.webContents.debugger.isAttached() }));
    const version = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
    check("guard", seen.guarded && seen.userData === state.dataDir && seen.version === version,
      `native dialogs ${seen.guarded ? "guarded" : "NOT guarded"}, userData ${seen.userData}, version ${seen.version}`);
  } catch (error) { check("guard", false, error.message); }

  try {
    const { browser, window, page } = await connect(state.port);
    try { const where = await readerState(window, page); check("renderer", !!where, `${window.url()} shows ${where ?? "neither the library nor a document"}`); }
    finally { await browser.close(); }
  } catch (error) { check("renderer", false, error.message.split("\n")[0]); }

  const windows = JSON.parse(execFileSync("osascript", ["-l", "JavaScript", path.join(import.meta.dirname, "onscreen-windows.js"), ...members.map((p) => String(p.pid))], { encoding: "utf8" }));
  const type = /type="([^"]*)"/.exec(execFileSync("lsappinfo", ["info", "-app", String(state.pid)], { encoding: "utf8" }))?.[1];
  const front = /pid = (\d+)/.exec(execFileSync("lsappinfo", ["info", "-only", "pid", execFileSync("lsappinfo", ["front"], { encoding: "utf8" }).trim()], { encoding: "utf8" }))?.[1];
  check("hidden", windows.mine === 0 && type === "UIElement" && !members.some((p) => String(p.pid) === front),
    `${windows.mine} on-screen window(s) of ${windows.total}, app type ${type}, frontmost pid ${front}`);
  return finish();
}

async function drive(rest) {
  const state = readState();
  if (!state || state.stoppedAt || !runProcesses(state).leader) throw new StepError("drive", `run ${run} is not running; run doctor`);
  const inline = rest[0] === "-e";
  if (!rest[inline ? 1 : 0]) throw new StepError("drive", "usage: drive <journey.mjs> | drive -e '<code>'");
  const name = inline ? "eval" : path.basename(rest[0], ".mjs");
  const dir = path.join(state.evidence, name);
  mkdirSync(dir, { recursive: true });
  const lines = [];
  const log = (...a) => { const line = a.join(" "); lines.push(`${new Date().toISOString()} ${line}`); console.log(line); };
  const { browser, window, page } = await connect(state.port);
  const errors = [];
  const dialogs = [];
  window.on("pageerror", (error) => errors.push(error.stack ?? String(error)));
  window.on("dialog", (dialog) => { dialogs.push(`${dialog.type()} "${dialog.message()}"`); void dialog.dismiss(); });
  const shot = async (label) => {
    const base = path.join(dir, label);
    await window.screenshot({ path: base + ".png" });
    writeFileSync(base + ".aria.txt", await page.locator("body").ariaSnapshot() + "\n");
    return base;
  };
  let n = 0;
  const step = async (title, action) => {
    const label = `${String(++n).padStart(2, "0")}-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    log("step", label);
    const value = await action();
    await shot(label);
    return value;
  };
  const openFile = async (files, trigger = () => page.keyboard.press("ControlOrMeta+o")) => {
    await evaluateInMain(state, (_electron, files) => { globalThis.verifyFolio.files.push(files); }, [files].flat().map((f) => path.resolve(root, f)));
    await trigger();
  };
  const native = async () => {
    for (const t0 = Date.now(); Date.now() - t0 < 30_000; await sleep(200)) {
      const calls = await evaluateInMain(state, () => globalThis.verifyFolio.calls);
      if (calls.every((c) => c.state !== "progressing")) return calls;
    }
    throw new Error("a download was still in progress after 30 s");
  };
  const downloads = async (count) => {
    for (const t0 = Date.now(); Date.now() - t0 < 30_000; await sleep(200)) {
      const saved = (await evaluateInMain(state, () => globalThis.verifyFolio.calls)).filter((c) => c.call === "download");
      if (saved.length >= count && saved.every((c) => c.state !== "progressing")) return saved;
    }
    throw new Error(`fewer than ${count} downloads finished within 30 s`);
  };
  const answer = (button) => evaluateInMain(state, (_electron, button) => { globalThis.verifyFolio.answers.push(button); }, button);
  const readPdf = async (file) => {
    const { getDocument } = await import(pathToFileURL(createRequire(import.meta.url).resolve("pdfjs-dist/legacy/build/pdf.mjs")));
    const task = getDocument({ data: new Uint8Array(readFileSync(file)), verbosity: 0 });
    const pdf = await task.promise;
    const pages = [];
    for (let i = 1; i <= pdf.numPages; i++) pages.push((await (await pdf.getPage(i)).getTextContent()).items.map((item) => item.str).join(" ").replace(/\s+/g, " ").trim());
    await task.destroy();
    return pages;
  };
  const nativeBefore = (await evaluateInMain(state, () => globalThis.verifyFolio.calls)).length;
  const ctx = { page, window, root, evidence: dir, step, shot, openFile, native, downloads, answer, readPdf, assert, log };
  try {
    const journey = inline
      ? new (async () => {}).constructor("ctx", `const { ${Object.keys(ctx).join(", ")} } = ctx;\n${rest[1]}`)
      : (await import(pathToFileURL(path.resolve(rest[0])))).default;
    const value = await journey(ctx);
    if (value !== undefined) log("result", JSON.stringify(value));
    assert.deepEqual(errors, [], "the page threw while driving");
    assert.deepEqual(dialogs, [], "the page opened a JavaScript dialog, which the guard does not cover; see Drive in SKILL.md");
    log("PASS", name, "evidence", dir);
  } catch (error) {
    log("FAIL", name, error.stack ?? String(error));
    await shot("failure").catch((e) => log("failure capture failed:", e.message));
    process.exitCode = 1;
  } finally {
    for (const call of (await native().catch(() => [])).slice(nativeBefore)) log("native", JSON.stringify(call));
    writeFileSync(path.join(dir, "steps.log"), lines.join("\n") + "\n");
    await browser.close();
  }
}

// SIGKILL, not a quit: a graceful quit with an unsaved document asks "Unsaved changes" (electron/main.cjs), and the
// data dir is thrown away anyway.
async function stop() {
  const state = readState();
  if (!state) return console.log(`no run ${run}; nothing to stop`);
  const { members } = runProcesses(state);
  const alive = (p) => { try { process.kill(p.pid, 0); return true; } catch (e) { if (e.code === "ESRCH") return false; throw e; } };
  for (const p of members) { try { process.kill(p.pid, "SIGKILL"); } catch (e) { if (e.code !== "ESRCH") throw e; } }
  for (const t0 = Date.now(); members.some(alive) && Date.now() - t0 < 5_000;) await sleep(100);
  const left = runProcesses(state).members;
  if (left.length) throw new StepError("stop", `still running: ${left.map((p) => p.pid).join(" ")}`);
  rmSync(state.dataDir, { recursive: true, force: true });
  writeState({ ...state, stoppedAt: state.stoppedAt ?? new Date().toISOString(), ended: state.ended ?? members.map((p) => p.pid) });
  console.log(`stopped run ${run}: ended ${members.length ? members.map((p) => p.pid).join(" ") : "nothing (no live process)"}; removed ${state.dataDir}`);
  console.log(`  evidence kept at ${state.evidence}`);
}

if (process.platform !== "darwin") {
  console.error("folio-verify supports macOS only; use npm run smoke on Windows and Linux");
  process.exit(1);
}
const [command, ...rest] = args;
const commands = { start, doctor, stop, drive: () => drive(rest) };
if (!commands[command]) {
  console.error("usage: folio-verify.mjs [--run <name>] start | doctor | drive <journey.mjs> | drive -e '<code>' | stop");
  process.exit(2);
}
try { await commands[command](); }
catch (error) {
  if (!(error instanceof StepError)) throw error;
  console.error(`FAIL ${error.step}: ${error.message}`);
  process.exitCode = 1;
}
