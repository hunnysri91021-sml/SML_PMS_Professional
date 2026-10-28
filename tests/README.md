# Tests

Playwright (headless Chromium) tests, run against `../SML_PMS_v14.html` via `file://`.

    node tests/run-all.js        # or: node tests/<name>.test.js

Requires `playwright` resolvable from Node (preinstalled in the cloud environment).
New tests: `tests/<feature>.test.js` using `helpers.js` (`open`, `ok`, `done`).

## หมายเหตุ
ชุดทดสอบ ad-hoc (`test_*.js`) จากเซสชันก่อนหน้าเก็บไว้ใน scratchpad ของแต่ละเซสชันและไม่เคยถูก commit จึงกู้คืนไม่ได้
ไฟล์ `scoring/roles/calibration/workflow/kpi.test.js` เขียนใหม่จากสถานการณ์ใน CLAUDE.md (#72/#78/#90/#99/#103/#117/#124/#134/#155/#160/#161/#170/#176/#180/#184-#189/#197-#206/#224)
