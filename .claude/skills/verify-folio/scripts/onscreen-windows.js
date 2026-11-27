#!/usr/bin/osascript -l JavaScript
ObjC.import("CoreGraphics");
ObjC.import("Foundation");
function run(argv) {
  const pids = new Set(argv.map(Number));
  const list = ObjC.deepUnwrap(ObjC.castRefToObject($.CGWindowListCopyWindowInfo($.kCGWindowListOptionOnScreenOnly, $.kCGNullWindowID)));
  return JSON.stringify({ total: list.length, mine: list.filter(w => pids.has(w.kCGWindowOwnerPID)).length });
}
