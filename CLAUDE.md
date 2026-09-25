# SML PMS — Project Notes for Claude

Single-file HTML/CSS/vanilla-JS Performance Management System (`SML_PMS_v14.html`).
No build step, no framework. Deployed via GitHub Pages from `main`
(`index.html` redirects to `SML_PMS_v14.html`). Feature work also mirrors
onto `claude/sharp-wozniak-03hehj` — keep both branches in sync after every
push (`git checkout main && git merge <feature-branch> --no-edit && git push`,
then switch back).

## Recurring mistakes found in this codebase — check for these before shipping

Every item below was a real bug found and fixed in production code, not a
hypothetical. Re-check for the same shape of mistake in any new feature that
touches employee/attendance/evaluation data.

1. **Never trust a name/label that came from a file, form, or another
   record — always resolve identity by code against `MASTER_USERS`.**
   `importHrgoFile()` used to store whatever name was in the uploaded CSV's
   `full_name` column, and `renderAttendanceList()` then preferred that
   stored name over a live `MASTER_USERS` lookup. Fix: always look up
   `MASTER_USERS.find(u => u[0] === code)` and use `emp[1]` as the name;
   only fall back to a stored/file name if no matching employee exists at
   all, and even then treat it as a warning-worthy edge case, not silently.
   Apply this same rule to any future field that "denormalizes" employee
   data into another record (position, department, etc.) — resolve from
   the master record at render/save time, don't trust a copy.

2. **A code that doesn't exist in `MASTER_USERS` should be rejected/skipped
   and reported, never silently accepted.** `importHrgoFile()` and
   `saveManualAttendance()` both now check `MASTER_USERS.find(...)` before
   writing to `ATTENDANCE` and refuse (with a clear toast, and for bulk
   import, a list of skipped codes) rather than creating a record for a
   nonexistent employee.

3. **Any filter/dropdown of real data must be populated from the actual
   dataset, never hand-written as static `<option>`s.** Found twice: the
   user-list filters (`filterGroup`/`filterSection`) and the org-chart page
   filter all had 2-3 hardcoded options that happened to match the demo
   data by coincidence — a new group/department added via the UI or an
   MS365 sync would be unfilterable. Fix pattern: a `populate*Filters()`
   function that rebuilds `<option>`s from `[...new Set(MASTER_USERS.map(u
   => u[idx]))]`, called on initial load AND after every place that can
   change `MASTER_USERS` (`saveUserFromModal()`, `loadEmployeesFromMs365()`).
   When adding a new filterable field, wire it into the same populate
   function rather than writing static options.

4. **Every `<select>`/`<input>` that's meant to filter or act on something
   needs a real `id` and a real event handler.** The org-chart page's
   department filter and search box had neither — clicking/typing did
   nothing. When adding a control, verify with a headless-browser click
   test that it actually changes rendered output, not just that it exists
   in the DOM.

5. **Positional array indices are load-bearing — double check them, and
   only ever append new fields at the end.** `MASTER_USERS` rows and
   `SML_FORMS[level].factors` are plain arrays indexed positionally
   (`u[6]` = department, `f[2]` = weight, etc.). A prior bug read `f[1]`
   instead of `f[2]` for weight and broke scoring silently. When adding a
   new field to any of these arrays, append at the end (see how `startDate`
   was added as index 14) — never insert in the middle, and grep for every
   place that reads that array by index before changing its shape.

6. **`localStorage`-backed "override merged over hardcoded default" values
   need a reset path**, because a value saved once by a user persists
   forever and will silently keep overriding a later code fix (this is
   exactly what happened after the MS365 Tenant ID/Client ID swap was
   fixed in code but stayed wrong in anyone's already-saved config).
   Every such store (`MS365_CONFIG_KEY`, `NAV_PERMS_KEY`,
   `SML_FORMS_STORAGE_KEY`, ...) has a `reset*ToDefault()` function and a
   visible button — add both for any new persisted-override value.

7. **A local queue that's pushed to an external system (Excel via Graph)
   must actually shrink after a successful push.** `ms365PushAppraisals()`
   used to leave every draft in `MS365_LOCAL_DRAFT_KEY` forever after
   pushing, so a repeat push would re-send the same rows to Excel
   indefinitely. Any "queue → push to remote → done" flow must persist the
   queue with successfully-pushed items removed (keep only failures) as
   part of the same operation, not as an afterthought.

8. **This app has no real backend — `localStorage` is per-browser/device.**
   Anything that looks like "notify other users" or "everyone sees the
   same status" needs to go through the one channel that actually is
   shared: the MS365/SharePoint Excel file via Graph API. A `localStorage`
   value can only ever describe "what happened on this device." When
   asked for cross-device visibility, either (a) write it to a real Excel
   table via `graphAddTableRow` and read it back with a **silent-only**
   token acquisition (never `loginPopup`/`acquireTokenPopup` in a read
   path — that would interrupt people who never asked to log in), or (b)
   be explicit that the feature is local-only.

9. **An "✏️ แก้ไข" (edit) button must actually load the record's current
   data into the form — never just open the same blank Add modal.** Found
   on the employee list and employee detail view: `openM('mAddUser')`
   opened an empty form regardless of which row was clicked, so editing
   (and using any newly-added field) was impossible for existing records.
   Fix pattern: a dedicated `openEditRecord(id)` that looks the record up,
   sets every field's `.value` explicitly (including re-running any
   cascading dropdowns and converting stored date formats back to the
   `<input type="date">` format), and disables the identity/key field so
   it can't accidentally be edited into a different record. Any "+ เพิ่ม"
   (add-new) entry point must call a `clear*Form()` first so leftover
   edit-mode state (a disabled ID field, a stale value) can't leak in.

10. **A button that closes a modal and shows an `alert()`/toast claiming
    success, with no underlying data or transport backing it, is not a
    feature — it's a placeholder that will eventually be reported as
    broken.** The "ส่ง Reminder" modal had a hardcoded "47 คน" target
    count and channel checkboxes with no wiring at all behind them. When
    building something like this in a static, backend-less app: compute
    the target list live from `MASTER_USERS` (or whatever real store
    applies), and for the action itself, only offer channels that can
    actually work without a server — e.g. a `mailto:` link is honest and
    works; a fake "sent via LINE/in-app notification" is not, and should
    be visibly disabled with a one-line reason instead.

11. **A multi-stage approval/workflow page (Review → Calibration → Approve,
    or anything shaped like it) needs one real status field driving all of
    them — never separate hardcoded tables per stage.** All three pages
    were static sample HTML with independent fake counts that could never
    agree with each other. Fix pattern: one shared store (here, the
    evaluation draft queue, `MS365_LOCAL_DRAFT_KEY`) carries a `status`
    field with an explicit linear set of values; each stage's page is a
    filtered view of that same store (`d[status]==='Submitted'`, etc.),
    and its actions (`getCheckedKeys` + `updateDraftStatus`) mutate that
    one field. This also means: before adding a new terminal state (like
    `Approved`), re-check every place that already reads that store
    unconditionally (e.g. `ms365PushAppraisals()` used to push every
    draft regardless of stage — it must filter to the terminal status) and
    every place computing "has this person submitted yet" (`
    getReminderTargets()` — must treat every non-`Draft` status as
    submitted, not just the literal string `'Submitted'`).
12. **A "queue key" (`empCode|cycle|level` here) must be deduplicated on
    write, not just on push.** `saveEvaluationLocal()` used to `unshift` a
    new entry on every save, so re-saving the same person/cycle/level
    silently piled up duplicate rows instead of updating the existing one
    — the same shape of bug as CLAUDE.md #7, just one step earlier in the
    pipeline. Any "save/submit this record" function needs to filter out
    the existing entry with the same natural key before adding the new one.
13. **A modal whose select/input options are hardcoded sample values not
    drawn from any real store (a KPI dropdown, an employee dropdown) will
    eventually go stale or, worse, list options that were never real to
    begin with** — the IDP modal's employee list was 3 names that didn't
    even exist in `MASTER_USERS`. Populate on `openM()` (see the
    `id==='mCascadeKpi'`/`id==='mAddIdp'` branches) from the live store,
    the same way `populateOrgSelects()` already does for Add/Edit
    Employee.
14. **Don't fabricate a value the app has no way to know for real** — a
    client-side static page cannot know the visitor's real IP address
    without an external network call, so the Audit Log's old "IP: SML-NET"
    column was pure invention. When a field can't be sourced honestly,
    drop the column rather than inventing a plausible-looking value.
15. **A generic, short CSS class name can collide with an unrelated
    component elsewhere in this single 7000+ line file — always grep for
    the class before reusing it.** `.up` was used both for an "upward
    trend" text style (`.stat .up{color:...;font-weight:700}`) and, quite
    separately, the file-upload dropzone box
    (`.up{border:2px dashed ...;padding:34px}`). Both rules matched the
    same `<span class="up">`, and CSS merges non-conflicting declarations
    from every matching rule — so the trend span silently inherited the
    dropzone's dashed border and padding, rendering as a broken dashed
    box instead of plain text (visible on the Dashboard's "เสร็จสมบูรณ์"
    tile once its value was empty enough to expose the empty box). Fixed
    by renaming to `.trend-up`. Before adding or reusing a one-word class
    like this, `grep -n 'class="X"'` and check every existing CSS rule
    for that class name first, in a file this large a coincidental reuse
    is more likely than it looks. When in doubt, verify styling with an
    actual rendered screenshot, not just a DOM/HTML read — this exact bug
    was invisible in the HTML source and only showed up in the browser.
16. **Any grid/table that always exactly reproduces a fixed target
    quota or shows numbers inconsistent with the real dataset size is
    a giveaway of hardcoded mock data — check the actual counts against
    a known real total.** The Dashboard's grade-distribution chart
    always showed exactly 10/20/40/20/10 (the SML quota percentages,
    never actual counts), and its 9-Box grid showed a cell of "688"
    people in a dataset of 15 real participants. Look for this pattern
    (a source array literally named `const rep=`/`const audit=`/etc.,
    or a code comment like `/* MOCK DATA RENDER */`) elsewhere in the
    file before assuming a chart or grid is real just because it
    renders from a `document.getElementById(...).innerHTML=` call.
17. **This app has no server, so any "login"/"password" feature is identity
    convenience, not real access control — never let it be presented or
    built as if it were.** A dead placeholder field (`mu_pass`, "รหัสผ่าน
    เริ่มต้น", never wired to anything) was replaced with a real PIN gate
    (`loginGate`/`doLogin()`/`applySession()`), explicitly scoped and
    labeled in the UI as "ยืนยันตัวตนเบื้องต้น...ไม่ใช่ระบบความปลอดภัย
    ระดับสูง". Concretely: PINs are stored only as a SHA-256 hash
    (`MASTER_USERS[17]`, `sha256Hex()`), the raw PIN is shown to HR exactly
    once at generation time (`resetUserPin()`'s `alert()`) and never again,
    the check happens entirely client-side so it cannot stop someone
    reading the page's JS/network — the UI says so rather than implying
    otherwise. Anywhere an app like this needs "who is using it right now"
    (audit log attribution, default `evalCode`, auto-selected role), derive
    it from the real logged-in record (`CURRENT_SESSION_USER`), not from a
    manually-switched demo selector — the `#roleSel` "มุมมอง (Demo UI)"
    dropdown stays, but login now drives its initial value instead of a
    hardcoded default. Any store rebuilt wholesale from an external source
    (`loadEmployeesFromMs365()`'s `MASTER_USERS.splice(0, length,
    ...normalized)`) must explicitly re-merge fields that only exist
    locally and never come from that source (PIN hash isn't and shouldn't
    be in the Excel employee table) — or the next sync silently deletes
    every employee's PIN, the same shape of bug as CLAUDE.md #6/#1.
18. **"Supervisor"/"approver" fields (หัวหน้า L1, ผจก.ส่วน L2, ผู้อนุมัติ) are
    a special case of #1/#3 worth calling out on its own: they look like
    free text (a person's name) so it's tempting to leave them as
    `<input>`, but they are really a reference to another `MASTER_USERS`
    row and must be a `<select>` populated from it, never hand-typed.**
    `mu_l1`/`mu_l2`/`mu_approver` in the Add/Edit Employee modal were
    plain text inputs — HR could type any string, including a typo or a
    person who doesn't exist, silently breaking every downstream
    consumer that resolves these by exact name match (team scoping,
    evaluation assignment, notification/reminder targeting). Fixed with
    `populateSupervisorSelects(excludeId)`: options are every non-resigned
    `MASTER_USERS` row (label shows name + position + code to disambiguate
    duplicate names) plus one explicit `"—"` = "ไม่มี (สูงสุดในองค์กร)"
    option for the top of the hierarchy (MD/AGM has no one above them —
    that's real, not a missing value, so give it a real selectable option
    rather than leaving the field blank or forcing free text). `excludeId`
    keeps a person from being selectable as their own supervisor. Called
    fresh every time the modal opens (`populateOrgSelects()`) so the list
    always reflects current `MASTER_USERS`, and `openEditUser()` explicitly
    pre-selects the row's real stored value after populating.
19. **A "Sync from Excel" function that reads rows via Graph and reports a
    count is not the same as one that writes those rows into the real
    store — check both halves independently.** `ms365SyncAttendance()`
    called `graphListTableRows('Attendance')`, displayed the row count,
    and toasted "นำเข้าเวลาทำงานจาก Excel แล้ว N แถว" (imported N rows) —
    but never parsed a single row or wrote to `ATTENDANCE`/called
    `saveAttendance()`. It looked identical to a working sync (real
    network call, real count, success toast) while doing nothing
    persistent, so Excel could have real attendance data forever and the
    web app would never actually have it — exactly the shape of bug
    CLAUDE.md #10 warns about, just one layer deeper (the "action" here
    is a real API call, not a no-op button, which made it easier to miss
    in review). Compare this function against a working sibling doing the
    same job on different data (`loadEmployeesFromMs365()` for the
    Employees table) before trusting a sync function's toast message —
    trace whether the local store it claims to update actually changed.
    Fixed by giving `ms365SyncAttendance()` the same column parsing as
    `importHrgoFile()` (same `HRGO_TEMPLATE_HEADERS` order, since the
    Excel "Attendance" table is expected to mirror the HRGO template),
    the same never-trust-the-file-name rule (resolve `emp[1]` from
    `MASTER_USERS` by code), and the same skip-and-report for codes with
    no matching employee, then actually calling `saveAttendance()`,
    `renderAttendanceList()`, `recalc()`, and `renderCycleStats()`.
20. **A duplicate-write guard should not just refuse the second write —
    it should offer the real edit path, or it just breaks legitimate
    updates.** The first version of the manual attendance "don't allow
    duplicate save" fix (`saveManualAttendance()`) hard-blocked saving
    over an existing `ATTENDANCE[code]` and told HR to delete the old
    record first — technically prevented the accidental-overwrite bug,
    but also removed the ability to correct a typo or update someone's
    leave count, which is a real, expected operation. Fixed the same way
    as the CLAUDE.md #9 edit-button pattern: `onManualEmpChange()` now
    detects an existing record and loads its real values into the form
    fields (so the person sees and edits real current data, never a
    blank form that would silently replace it), the save button's label
    switches to "✏️ บันทึกการแก้ไข", and `saveManualAttendance()` keeps a
    single write path for both create and update (`isEdit = !!ATTENDANCE[code]`
    only changes the toast/audit-log wording, not the logic) rather than
    forking into two functions that could drift apart. The general rule:
    when guarding against an accidental duplicate/overwrite, ask "does
    this block a legitimate edit too?" — if yes, the fix is load-real-
    data-into-the-form, not refuse-and-redirect-to-delete.
21. **`graphAddTableRow()` always appends — it's only correct for data that
    is genuinely a new event every time (one evaluation submission, one
    audit log line). For data that represents "the current state of one
    entity" (one employee's attendance), repeated adds pile up duplicate
    rows in Excel forever.** Added `graphUpsertTableRow(tableName,
    keyColIndex, keyValue, rowValues)` for this second case: it lists the
    table's rows, finds one whose `keyColIndex` cell matches `keyValue`,
    and `PATCH`es that specific row (`/rows/itemAt(index=N)`) if found,
    or falls back to `rows/add` only when no match exists. Used by
    `ms365PushAttendance()`, keyed on employee code — pushing the same
    person's attendance twice updates one Excel row, never creates a
    second. Before adding a new "push local data to Excel" function,
    decide which shape the data has and pick the matching primitive.

## Verification checklist for any change to this file

Before considering a change to `SML_PMS_v14.html` done:

- `node --check` / `new Function(scriptBlock)` syntax validation (see any
  recent commit for the one-liner).
- Serve locally (`python3 -m http.server 8794`) and drive it with headless
  Chromium (Playwright, `executablePath: '/opt/pw-browsers/chromium'`).
- Run a full click-sweep of every nav page's `button[onclick]` and confirm
  zero `pageerror`s and no `onclick` handler references a function that
  doesn't exist on `window`.
- For any change touching `MASTER_USERS`/`ATTENDANCE`/evaluation data,
  write a targeted test that adds/imports data through the real UI flow
  (not by mutating the array directly) and asserts the displayed values
  match the real source of truth.
- Commit to the feature branch, merge fast-forward into `main`, push both.
