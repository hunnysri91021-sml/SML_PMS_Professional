# Tests

Playwright (headless Chromium) tests, run against `../SML_PMS_v14.html` via `file://`.

    node tests/run-all.js        # or: node tests/<name>.test.js

Requires `playwright` resolvable from Node (preinstalled in the cloud environment).
New tests: `tests/<feature>.test.js` using `helpers.js` (`open`, `ok`, `done`).
