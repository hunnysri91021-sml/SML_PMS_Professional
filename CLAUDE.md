# SML PMS — Project Notes for Claude

Single-file HTML/CSS/vanilla-JS Performance Management System (`SML_PMS_v14.html`).
No build step, no framework. Deployed via GitHub Pages from `main`
(`index.html` redirects to `SML_PMS_v14.html`). Feature work also mirrors
onto `claude/sharp-wozniak-03hehj` — keep both branches in sync after every
push (`git checkout main && git merge <feature-branch> --no-edit && git push`,
then switch back).

`tools/sml-pms-proxy-worker.js` is a separate, optional Cloudflare Worker
(deployed independently, not part of the GitHub Pages site) — see #25 below.
It is the one piece of this project that is not client-side-only by design,
and it exists specifically so employees never have to sign into Microsoft
individually.

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
22. **A "who reviews whom" chain check must be role-aware, not a single
    blanket rule.** `getEvaluationAssignments()` only ever checked
    `role==='emp' || role==='l1'` need `l1[9]` set, so a real department
    head (`l1`) or division manager (`l2`) being evaluated was flagged
    "ขาดหัวหน้า L1" (missing L1 supervisor) even when they had a
    perfectly real L2/approver above them — because someone who already
    *is* the L1 doesn't have another L1 over them, that field being empty
    is correct, not missing. Fixed by branching what "complete" means by
    the evaluatee's own role: `emp` needs `l1`; `l1` needs `l2` OR
    `approver` (either is a valid next reviewer); `l2` needs `approver`;
    `exec`/`admin` (top of org) need nothing. Same shape of mistake as
    CLAUDE.md #1/#18 (a supervisor-chain field's meaning changes with
    context, don't apply one rule to every role) — when a workflow
    depends on org hierarchy, list every role that participates and ask
    "what does 'complete' mean for *this* role" instead of writing one
    condition and assuming it generalizes.
23. **"Which form does this person use" must be an admin-assigned fact on
    the employee record, not a free choice made at evaluation time.** The
    "ประเมินตนเอง" page let anyone click any of the 4 level buttons
    (`lv-op`/`lv-of`/`lv-ldr`/`lv-mgr`) regardless of their real role —
    nothing tied a person to the one form they should use, so the wrong
    form could be filled and scored under the wrong Y/Z weighting.
    Added `MASTER_USERS[18]` (`evalLevel`, admin-set, append-only per
    CLAUDE.md #5) with a `mu_evallevel` dropdown in the Add/Edit Employee
    modal (reachable only from admin-gated pages, matching "กำหนดโดย
    Admin ระบบ/Admin HR"), `getAssignedEvalLevel(emp)` (uses the explicit
    assignment first, falls back to a role-based guess only for `l1`→ldr
    and `l2`/`admin`/`exec`→mgr — role `emp` is genuinely ambiguous
    between op/of and is never guessed, it must be assigned), and
    `onEvalCodeGateChange()` wired to a new code-entry field that
    auto-applies the assigned level and disables the other three level
    buttons so a regular user can't pick the wrong one (an
    `admin`/`sysadmin` viewer keeps all buttons enabled, since they
    legitimately need to check other people's forms). Preserved across
    an MS365 employee sync the same way PIN hashes are (re-merged by
    code before the array replace) since it isn't and shouldn't be a
    column in the Excel Employee Master.
24. **PIN hash and assigned evaluation level (`MASTER_USERS[17]`/`[18]`)
    were device-local only — set on one browser, invisible everywhere
    else, including the employee's own phone.** Added a real Excel
    round-trip via a new `EmployeeSettings` table (columns: EmpCode,
    PinHash, EvalLevel, UpdatedAt), reusing `graphUpsertTableRow()` so
    repeated pushes update one row per employee rather than piling up
    duplicates (same reasoning as CLAUDE.md #21 for attendance).
    `ms365PushEmployeeSettings()`/`ms365SyncEmployeeSettings()` are the
    interactive (button-triggered, popup-login allowed) pair;
    `pushSingleEmployeeSettings(code)` fires automatically after
    `resetUserPin()` and after saving an employee with an `evalLevel`
    set, so Admin doesn't have to remember a separate push step.
    **Important architectural limit, not a bug:** `doLogin()` also calls
    `ms365SyncEmployeeSettingsSilent()` before checking the PIN, but it
    uses `getGraphTokenSilent()` (per CLAUDE.md #8 — never
    `loginPopup`/`acquireTokenPopup` on a read path nobody asked to
    trigger) and returns `0` immediately if the device has no cached
    MSAL session. A device that has *never* done an interactive MS365
    login (a personal phone opening the app for the first time) cannot
    silently pull protected Excel data — there is no way around this in
    a pure client-side SPA using delegated user auth without either an
    interactive login on that device or a backend holding app-level
    credentials (which this project deliberately doesn't have, since a
    client-secret embedded in public JS is not a secret). State this
    limit plainly to the user rather than implying "any device, always,
    automatically" — the honest scope is "any device that has logged
    into MS365 at least once, or after Admin pushes/commits the data."
25. **When "no device-local login, ever" is a hard requirement (many
    employees, IT confirmed they can grant Application permission), the
    honest fix is a small server-side proxy, not another client-side
    trick.** #24's limit is real and unavoidable for a pure static page
    using delegated (per-user) Graph auth. Added `tools/sml-pms-proxy-
    worker.js`: a standalone Cloudflare Worker (deployed separately from
    GitHub Pages, holding `CLIENT_SECRET`/`TENANT_ID`/etc. as Worker
    secrets, never in the HTML) that authenticates to Graph via the
    OAuth2 **client credentials flow** (Application permission,
    `Files.ReadWrite.All` + `Sites.Read.All`, needs Azure AD admin
    consent) and exposes three plain endpoints (`GET /rows`,
    `POST /rows/add`, `POST /rows/upsert`) guarded by a shared
    `X-Api-Key` header. On the client, `workerFetch()` + a `workerUrl`/
    `workerApiKey` pair in `MS365_CONFIG` (`isWorkerConfigured(cfg)`)
    make `graphListTableRows()`/`graphAddTableRow()`/
    `graphUpsertTableRow()` route through the Worker instead of MSAL+
    Graph when configured, and fall back to the original delegated flow
    when the two fields are empty — every existing feature built on
    those three functions (Employees, Attendance, EmployeeSettings,
    Appraisals push) gets the "no login needed" behavior for free, with
    zero changes to the call sites. `ms365SyncEmployeeSettingsSilent()`
    (used at login) also prefers the Worker when configured, since a
    Worker call can never trigger a popup — true zero-login sync for
    every device once the Worker exists, including a phone that has
    never touched Microsoft before. Be explicit that the shared API key
    is a low-grade gate, not real security (visible in DevTools network
    tab on any device that has it configured) — the real protection is
    telling IT to scope the Azure AD app via a SharePoint Application
    Access Policy to the one site, not the whole tenant, so a leaked key
    can't reach unrelated company data.
26. **`resetUserPin()`'s `alert()` is HR's only backup if an automated
    delivery channel fails — never let the automated channel's success
    be assumed.** Added real PIN-by-email: `tryEmailPin(emp, pin)`
    calls the Worker's new `/send-mail` (Graph `/users/{mailbox}/
    sendMail`, app-only, sends in the name of a real mailbox set as
    `SEND_AS_EMAIL`) only when `isWorkerConfigured(cfg)` is true and the
    employee has a real email on file; any other case — Worker not set
    up, no email on record, or the send itself failing — returns
    `{sent:false, reason}` with the real reason, never silently. The
    `alert()` still always shows the raw PIN to HR regardless of
    whether the email went out, and its wording changes based on the
    real outcome ("✅ ส่งอีเมล...แล้ว" vs "⚠️ ไม่ได้ส่งอีเมลอัตโนมัติ
    (เหตุผลจริง)") — this is the same shape of care as CLAUDE.md #10:
    an automated action that might silently not happen must never be
    assumed to have happened. Mail.Send (Application) permission is
    tenant-wide by default (can email as *anyone* in the org) — the
    Worker file documents the `New-ApplicationAccessPolicy` Exchange
    Online command IT should run to restrict it to just the one
    `SEND_AS_EMAIL` mailbox, same reasoning as the SharePoint
    Application Access Policy for #25.

27. **A field editable in the app's own Add/Edit form (not just admin-only
    fields like PIN/evalLevel) still needs a push-back path to Excel, or
    "saved in the web" quietly means "saved on this one device/browser
    only."** HR could type a real email into `mu_email` and save it —
    `saveUserFromModal()` wrote it into `MASTER_USERS[15]` and the toast
    said "อัปเดตข้อมูล...เรียบร้อย," which read exactly like a real save,
    but nothing pushed it to the shared Excel `Employees` table, so any
    other device (including the one used for a later "ดึงข้อมูลพนักงานจาก
    Excel" sync) would never see it — the same shape of bug as #19/#26,
    just for a plain data field instead of a settings/notification one.
    Fixed with `pushSingleEmployeeToExcel(code)`: builds the row in the
    *exact* column order `normalizeMs365Employee()` expects (id, name,
    role, group, section, division, dept, position, grade, l1, l2,
    approver, status, lastLogin, startDate, email, potential — 17
    columns, deliberately excluding `pinHash`/`evalLevel`, which are not
    real columns in that sheet per #17/#23) and `graphUpsertTableRow()`s
    it into `cfg.employeeTable` keyed by EmpID, so repeat saves update
    one Excel row rather than piling up duplicates (#21). Called from
    `saveUserFromModal()` on every add/edit, same best-effort/no-blocking
    pattern as `pushSingleEmployeeSettings()`. When adding any other
    field to the Add/Edit Employee form, check whether it's meant to be
    shared across devices (if so, it must round-trip to Excel the same
    way) or genuinely local-only (if so, say so in the UI) — never leave
    it ambiguous.

28. **Every plain-text "employee code" input across the app should let HR
    type the code and see the real name/position resolve — not just the
    admin-only supervisor selects (#18).** `loginCode`, `evalCodeGate`, and
    `mu_id` (Add/Edit Employee) were plain `<input>`s with only a
    placeholder hint ("เช่น SML-001") — no way to browse or confirm you
    typed the right code until submitting. `mn_emp` (manual attendance)
    already had this via its own `<datalist>`; generalized it into one
    shared `<datalist id="empCodeList">` (`populateEmpCodeDatalist()`,
    excludes resigned employees, one option per employee formatted
    `code — name — position`) that every code-entry field now points at
    via `list="empCodeList"`. Same rule as #3: must be re-populated
    everywhere `MASTER_USERS` changes (init bootstrap, `saveUserFromModal()`,
    `loadEmployeesFromMs365()`), not just once at page load, or it goes
    stale the moment someone's added/edited/synced.

29. **A live `<select>` populated from `MASTER_USERS` (#18) is still slow
    to use once the org has enough people that HR has to scroll/search
    a long list by eye.** For "หัวหน้า L1"/"ผจก.ส่วน L2"/"ผู้อนุมัติ" in
    Add/Edit Employee, added a code-entry `<input list="empCodeList">`
    (reusing the shared datalist from #28) in front of each existing
    `<select>`: `onSupervisorCodeInput(which)` looks the typed code up in
    `MASTER_USERS`, shows a real confirm/warn note (`✅ name — position
    (code)` or `⚠️ ไม่พบรหัสนี้ในระบบ`, never a silent no-op), and sets the
    `<select>`'s value to that person's real name if found. Storage
    format is deliberately unchanged — `MASTER_USERS[9]/[10]/[11]` still
    hold the supervisor's *name*, exactly as #18 established, so every
    downstream name-matching consumer keeps working; the code input is
    purely a faster way to drive the same `<select>`, not a new data
    path. `onSupervisorSelectChange(which)` keeps the two in sync the
    other direction too (picking straight from the dropdown, the old
    way, back-fills the code box + note), and `fillUserFormFields()`
    calls it after prefilling each select so opening an existing
    employee for edit shows the resolved code+note immediately, not just
    an empty code box next to a filled dropdown. The old `<select>`
    itself is left fully intact and usable on its own — satisfies "if
    this person isn't in Excel yet, let HR pick manually" without a
    separate code path.

30. **Never hardcode "the real column order of an external Excel table" as
    inline indices scattered across multiple functions — an HR-managed
    sheet's actual column order is a fact from the field, not something
    to assume from a "sounds reasonable" order.** `normalizeMs365Employee()`
    assumed the `Employees` table's columns matched `MASTER_USERS`'s own
    field order (Grade before L1/L2/Approver, StartDate/Email at the
    end). The real sheet HR uses has them in a different real order —
    `วันเริ่มงาน`/`Email` come right after `ตำแหน่ง`, *before* `Grade`.
    Reading with the wrong assumed order silently shifted every field
    from `grade` onward — visible in production as the employee detail
    page showing "วันเริ่มงาน: active" (the literal value of the `Status`
    column, landed in the wrong slot). Same shape of bug as CLAUDE.md #5
    (positional indices are load-bearing) but one layer further out: the
    external system's layout, not just this app's own arrays. Fixed by
    centralizing the real order in one array, `EXCEL_EMPLOYEE_COLS`
    (verified against HR's actual header row screenshot, not guessed),
    and having *both* `normalizeMs365Employee()` (read) and
    `pushSingleEmployeeToExcel()` (write, #27) map through it by field
    name (`EXCEL_EMPLOYEE_COLS.indexOf('grade')`) instead of a bare
    numeric index — so read and write can never drift apart from each
    other again, and the one place to fix if HR ever reorders Excel
    columns again is this one array. Before trusting *any* fixed-position
    parsing of an external spreadsheet this app doesn't fully control,
    ask for (or verify against) a real screenshot of its header row —
    never assume the order "should" match this app's internal shape.

31. **The Worker's whole point (#25) — "zero setup on any device, even one
    that's never touched Microsoft" — only holds if the Worker's own
    `workerUrl`/`workerApiKey` are themselves zero-setup.** They were left
    blank in `DEFAULT_MS365_CONFIG` (only `tenantId`/`clientId`/`siteUrl`
    were baked in), so only the one admin device where someone had
    manually typed them into the MS365 setup form actually routed through
    the Worker — every other device (a fresh phone opening the app for
    the first time) had `isWorkerConfigured(cfg)` false and silently fell
    back to the old delegated MSAL path, which calls `loginPopup()` with
    no cached account. That popup call, several `await`s deep inside a
    background push like `pushSingleEmployeeToExcel()`, loses the
    original click's "user gesture" context by the time it fires, so
    mobile browsers block it — the field-reported symptom was "the save
    button does nothing." Fixed by baking the real `workerUrl`/
    `workerApiKey` into `DEFAULT_MS365_CONFIG` itself, same as
    `tenantId`/`clientId` already were — `loadMs365Config()`'s existing
    merge logic (`stored[k] || DEFAULT_MS365_CONFIG[k]`, from CLAUDE.md
    #6) picks this up automatically with zero other code changes, on
    every device, new or old. This doesn't change the key's real security
    posture (#25 already treats it as a low-grade gate visible in
    DevTools on any configured device) — it just makes "configured"
    universal instead of per-device. If the Worker URL/key ever need to
    rotate, update them here (and redeploy) rather than asking every
    device to reconfigure itself.

32. **A silent "sync PIN/evalLevel from Excel at login" (#24) is not the
    same as syncing the *rest* of the employee record — and `MASTER_USERS`
    resets to the file's hardcoded demo baseline on every page load/reload
    regardless, since this app has no persistent client-side cache of its
    own.** `doLogin()` already called `ms365SyncEmployeeSettingsSilent()`
    (PIN + evalLevel only, from the small `EmployeeSettings` table)
    before checking the login code, but never the full `Employees` table
    — so Grade, org fields, etc. that HR had just saved (and which #27
    now correctly pushes to Excel) looked like they "reverted" on every
    normal page reload, until someone manually clicked "📥 ดึงข้อมูล
    พนักงานจาก Excel." Worse, `tryRestoreSession()` (fires on every page
    load when a session is already active in `sessionStorage`, which is
    the common case — most reloads during a work session, not fresh
    logins) restored the session using whatever stale data was in the
    freshly-reloaded `MASTER_USERS` and never synced at all. Fixed by
    calling `ms365SyncEmployees(true)` (silent — added a `silent` param
    all the way through `loadEmployeesFromMs365()` too, since its own
    success/failure toasts weren't actually gated by the outer function's
    `silent` flag before this) in both `doLogin()` and the async
    `tryRestoreSession()` (which now also re-applies the session with the
    freshly-synced record once the sync completes, after an immediate
    first `applySession()` with the stale-but-available data so the UI
    isn't blank while waiting). This only became viable as an "always
    silent, every load" sync once the Worker URL/key were baked in as
    defaults (#31) — before that, a device without local Worker config
    would have hit the same blocked-popup problem #31 fixed, just
    triggered on every reload instead of only on save.

33. **The silent-sync-on-every-load fix (#32) only covered `Employees` +
    `EmployeeSettings` — `Attendance` had the same "only syncs on a manual
    button click, or an interval that only runs while the MS365 tab is
    open" gap, so leave/lateness data edited in Excel looked stale on
    every other page (Z-score, cycle stats) until someone happened to
    visit that one tab. Extended the exact same treatment:
    `ms365SyncAttendance()` gained the same `silent` param as
    `ms365SyncEmployees()`/`loadEmployeesFromMs365()` (gates its
    success/failure `smlToast`s only — `appendSyncLog()` still records
    silently every time, same convention as the others), and both
    `doLogin()` and `tryRestoreSession()` now call
    `ms365SyncAttendance(true)` alongside the other two. **`Appraisals`
    (evaluation submissions) is deliberately NOT part of this — don't
    add a pull-sync for it without being asked.** Unlike `Employees`/
    `Attendance`/`EmployeeSettings` (each row = "current state of one
    entity," meant to be kept in sync both ways), `Appraisals` only ever
    receives rows through `ms365PushAppraisals()`, which explicitly
    filters to `status==='Approved'` only (CLAUDE.md #11) — the
    Draft→Submitted→Calibrated workflow stages are intentionally
    per-device local state (`MS365_LOCAL_DRAFT_KEY`) until final
    approval, and the Excel table is a one-way archive of finished
    results, not a live mirror of in-progress review state. Pulling it
    back down would not fix "another reviewer's device doesn't see this
    submission" (that's a real, separate architectural limit worth
    surfacing honestly if asked about, not silently working around) and
    risks reintroducing a stale-overwrite bug into the local draft
    queue. When a request says "not everything syncs," enumerate the
    real tables and check each against what it's *supposed* to mean
    (current-state vs. append-only-archive) before assuming they should
    all get the same auto-pull treatment.

34. **A "โครงสร้าง Sheets" documentation table listing every Excel table's
    sync status can itself be exactly the kind of unbacked claim CLAUDE.md
    #10/#19 warns about — check each row against real code, don't trust
    the ✅ marks.** The Sheets tab claimed `AuditLog` pushed "ทุก action"
    and `Approvals` pushed "✅ อนุมัติ", but grepping the whole file found
    zero `graphAddTableRow`/`graphUpsertTableRow` calls for either table
    — `appendAuditLog()` only ever wrote to `localStorage`, and none of
    the 5 real approval/reject actions (L2 review, calibration, final
    approve, and their two reject counterparts) touched Excel at all.
    `KPI_Goals` and `Cycles` were worse: **`goalKpiData` had no
    persistence at all** — not even `localStorage` — so it reset to
    empty on every page reload; only `loadSampleKpi()` (a manual demo-
    data button) ever populated it. Fixed all four:
    - `appendAuditLog()` now calls `pushAuditLogEntryToExcel(entry)`
      (fire-and-forget, `graphAddTableRow`, never awaited/never blocks —
      this function fires on nearly every action in the app) after every
      write, same append-only reasoning as `Appraisals` (#21).
    - `pushApprovalRecordToExcel(empCode, cycle, step, comment)` is
      called from `approveReviewSelected()`/`rejectReviewSelected()`/
      `confirmCalibration()`/`approveAllFinal()`/`rejectApproveAll()` —
      one row per person per step, also append-only (a re-approval is a
      new historical event, not a state update).
    - `goalKpiData` got real `localStorage` persistence
      (`KPI_LOCAL_KEY`/`loadKpiData()`/`saveKpiData()`, loaded at script
      init like `loadAttendance()`) as a *prerequisite* for sync — you
      can't usefully sync data that doesn't survive a reload. Each KPI
      is upserted (`pushKpiToExcel`, keyed by `KPI_ID`, since a KPI is
      "current state of one goal," not an event — CLAUDE.md #21 logic
      applies) on create/activate, and `ms365SyncKpiGoals(silent)`
      pulls + replaces `goalKpiData` wholesale (mirroring
      `loadEmployeesFromMs365()`) as part of the same silent-sync group
      from #32/#33. Deliberately did *not* fix `editGoalKpi(id)` (still
      opens a blank modal, the CLAUDE.md #9 bug) — that's a separate,
      pre-existing gap not required to make sync itself work; noted here
      so it isn't mistaken for done.
    - `Cycles` is a single "current cycle" settings object
      (`smlPmsCycleSetup`), not a real multi-cycle history — upserted
      with a **fixed** key `'CURRENT'` (not the cycle's name, which is
      editable and would otherwise fork a new row every rename) via
      `pushCycleSetupToExcel()`/`ms365SyncCycleSetup(silent)`. Its real
      columns (`Cycle_ID·Name·Start·End·Status·SavedAt`) were adapted
      from — not forced to match — the doc table's original idealized
      schema (`Cycle_ID·Year·Start·End·YZMode·Status`), since the app
      has no real `Year`/`YZMode` fields to source honestly (#14).
    - Updated the Sheets tab's table itself to describe what each sync
      path actually does now, instead of leaving stale/aspirational
      claims next to the real behavior.
    General rule this confirms: a docs/status table asserting "this
    syncs" is a claim to verify against the code, not a spec to assume
    is already implemented — and before extending sync to a new table,
    check whether its *local* data even persists across a reload first.

35. **`editGoalKpi(id)` was the same CLAUDE.md #9 bug found and fixed
    elsewhere (employee edit, manual attendance edit) — clicking "✏️" on
    a KPI opened the exact same blank "+ เพิ่ม KPI" modal, discarding
    whatever you typed as a brand-new KPI instead of updating the one
    you clicked.** Fixed with the same pattern: `editGoalKpi(id)` now
    sets every field's `.value` from the real `goalKpiData` record
    (`name`/`unit`/`pct`/`target`/`type`/`scope`/`year`/`note` — `note`
    and `year` were sitting unused in the modal's HTML the whole time,
    never read *or* written by `addKpiFromModal()`; wired both up while
    touching this, since leaving them silently ignored right next to a
    "real" edit form would just be the same bug in a new shape) and
    remembers which KPI is being edited in `editingKpiId`.
    `addKpiFromModal()` branches on `editingKpiId`: set →
    `Object.assign()` onto the existing object in place (upsert to
    Excel via the same `pushKpiToExcel()` from #34, keyed by the same
    `id` — never a new row); unset → create as before. The two
    "+ เพิ่ม KPI" entry points now call a new `openAddKpiModal()` (the
    `clearUserModalForm()` pattern from #9) that explicitly resets
    `editingKpiId = null` and blanks every field — skipping this step
    is exactly how a stale edit target would silently overwrite the
    wrong KPI the next time someone clicked "+ เพิ่ม" instead of "✏️".

36. **The "รอบการประเมิน" (Cycle) page's "รอบทั้งหมด" table was pure mock
    HTML — 4 hardcoded `<tr>`s with fabricated "ผู้เข้าร่วม"/"ความคืบหน้า"
    numbers (99/96/91 people, 71.5%/100%/100%/0%, CLAUDE.md #16) and
    "ดู"/"แก้ไข" buttons with no `onclick` at all (#10) — and the
    "+ สร้างรอบใหม่" modal's save button was `onclick="closeM()"`, a
    pure no-op; none of its inputs even had `id`s to read from. This is
    a *different* feature from the single-row "ตั้งค่ารอบประเมิน" Settings
    panel (`cycleNameSetup` et al., wired to Excel in #34) — that one
    edits "the current cycle," this one is a real multi-cycle list/
    history page, and both happened to be named "Cycle" things on the
    same nav page. Fixed with a real `cyclesList` array
    (`CYCLES_LIST_KEY`, `localStorage`, seeded once from the mock rows'
    *structural* fields only — id/name/year/dates — never their
    fabricated participant/progress numbers, since those are now
    computed live every render from real `getEvalParticipants()` +
    `getDrafts().filter(d => d[2]===cycle.year)`, so they can never be
    hardcoded-stale again). `editCycleFromList(id)` loads the real
    record (CLAUDE.md #9 pattern, locks the id field as the key while
    editing), `openAddCycleModal()` clears it + re-enables the id field
    (rejects a duplicate id on save rather than silently overwriting),
    and `saveCycleFromModal()` branches update-in-place vs. create like
    every other modal in this file now does. Pushed to Excel via the
    *same* `Cycles` table as #34's single-row settings, but keyed by
    each cycle's own id instead of the fixed `'CURRENT'` sentinel — the
    two mechanisms write different rows and don't collide.
    `ms365SyncCyclesList(silent)` pulls + replaces `cyclesList` wholesale
    (filtering out any `'CURRENT'` row, which belongs to the other
    mechanism) as part of the same silent-sync group from #32/#33.
    `renderCyclesTable()` is called on page nav (`p==='cycle'`) and at
    init, same as every other page-specific render function in this
    file's nav dispatcher.

37. **The "ตั้งค่าผู้ใช้ & บทบาท" page's 6 role cards were pure mock HTML,
    and their "ดูสิทธิ์"/"แก้ไข" buttons routed through `actionByText()`
    (a generic text-matching dispatcher built to make demo buttons show
    *some* plausible toast) into the same `mEditRole` modal every time,
    hardcoded to "หัวหน้าแผนก / Leader (L1)" regardless of which card was
    clicked — editing the Employee card showed Leader's name and
    checkboxes, and the save button was `closeM();alert('บันทึกบทบาท
    เรียบร้อย')` with zero real inputs behind it (ids didn't even exist
    on the fields).** Same shape of bug as #9 (edit opens the wrong/
    blank data) stacked with #10 (fake success alert). Fixed with a real
    per-role store, `ROLE_PERMS` (`ROLE_PERMS_KEY`, `ROLE_DEFS` for the
    6 real role keys already used everywhere else in this file —
    `sysadmin`/`admin`/`exec`/`l2`/`l1`/`emp`, never a new custom role
    key), following the exact same load/merge/reset pattern as
    `NAV_PERMS`/`loadNavPerms()` immediately above it in the file.
    `editRole(key)` populates the modal from that role's real stored
    name/description/10 permission checkboxes; `saveRoleFromModal()`
    writes them back keyed by role, re-renders the cards
    (`renderRoleCards()`, replacing the static `<div class="role-card">`
    markup), and persists — verified a renamed role survives a real
    page reload. `resetRolePermsToDefault()` mirrors
    `resetNavPerms()`. Left "+ เพิ่มบทบาทใหม่" *not* wired to fake-create
    a new role: dozens of places in this file (nav permissions,
    evaluation-assignment logic, role badges) switch on these exact 6
    role-key strings, so a genuinely new role wouldn't function anywhere
    else in the app even if the modal "succeeded" — replaced its fake
    `alert('สร้างบทบาทใหม่เรียบร้อย')` with an honest explanation of why
    (CLAUDE.md #10's "visibly disable it with a one-line reason" rule),
    rather than building a create-flow whose result would silently not
    work anywhere.

38. **`printEvalForm()` hardcoded `const u = MASTER_USERS[0]`** — literally
    "whichever employee happens to be first in the array" — and used
    `u[3]/u[5]/u[6]/u[14]/u[9]/u[10]/u[11]` (Group/Division/Department/
    StartDate/L1/L2/Exec) directly with **no fallback to the actual
    employee being printed at all**, unlike `empName`/`empCode`/`empPos`
    which at least fell back to `u` only when the DOM field was empty.
    So every printed evaluation form showed the *first* MASTER_USERS
    row's org/supervisor/start-date fields, correct only by coincidence
    if that happened to be the same person as the form — reported in
    production as "รหัสพนักงานไม่ตรง" (a real employee's printed form
    showing another employee's group/dept/L1/L2, e.g. sysadmin's, since
    row order can change after any Excel sync per CLAUDE.md #30). Same
    class of bug as CLAUDE.md #1 (never trust a positional/first-match
    guess — resolve identity by the real code) except here there wasn't
    even an attempt to use the actual `empCode` for these 7 fields.
    Fixed by resolving `u` from `MASTER_USERS.find(x=>x[0]===empCode)`
    (with `empCode` itself sourced from the real `evalCode` field first,
    `MASTER_USERS[0]` only as the last-resort fallback when nothing is
    set at all — e.g. opening the form completely fresh) before reading
    any of these 7 fields, so the whole employee-info block on the
    printed form is now for the same one real person throughout.

39. **A full audit ("check every tab, does it relate to Excel, does web-
    saved data show up on other devices") found 3 more real gaps beyond
    what had already been fixed — two of them data-integrity issues, not
    just cross-device visibility ones:**
    - **Form factor weights (`SML_FORMS`)** — `saveFormOverrides()` only
      wrote `localStorage`. This isn't merely "another device doesn't see
      it" (CLAUDE.md #8's usual framing) — the weights determine every
      employee's Y score calculation, so if Admin edits them on one
      device, employees self-evaluating from other devices/phones score
      against *stale* weights in the same cycle, silently producing
      non-comparable results. Fixed with `pushFormWeightsToExcel()`
      (one row per form level `op`/`of`/`ldr`/`mgr`, factors serialized
      as JSON since their count/content isn't fixed-column like most
      other tables) called from `saveFormOverrides()` itself, and
      `ms365SyncFormWeights(silent)` in the usual silent-sync group.
    - **IDP (`idpData`)** — had *zero* persistence, not even
      `localStorage` (same shape as `goalKpiData` before #34) — lost on
      every reload. Also had no dedup-on-save (CLAUDE.md #12): saving
      the same person's IDP twice appended a second row instead of
      updating. Fixed with `IDP_LOCAL_KEY` persistence + a dedup filter
      in `saveIdp()`, plus `pushIdpToExcel()`/`ms365SyncIdp(silent)`
      (upsert keyed by employee code — one active IDP per person).
      `deleteIdp()` only removes locally — there's no
      `graphDeleteTableRow()` anywhere in this codebase yet for any
      table, so a deleted IDP's Excel row is untouched until manually
      removed in Excel or overwritten by a later push with the same key;
      said so in the confirm dialog rather than implying full deletion.
    - **Approval e-signatures (`APPROVAL_SIGNATURE_KEY`)** — set only on
      the device that clicked "อนุมัติทั้งหมด," so `printBatchApproved()`
      run from a different device always showed "—" for the signer.
      Rather than a new Excel table, `ms365SyncApprovalSignatures()`
      reads it back out of the `Approvals` table already populated by
      #34 (`step==='Approved'` rows, signer parsed from the `Comment`
      field's `"ลงนามโดย {name}"` text, falling back to the `ApprovedBy`
      column). Changed the signature store's key from the full
      `draftKey` (`empCode|cycle|level`) to `empCode|cycle`, since the
      `Approvals` table has no level column to match back against and
      level doesn't change who legitimately signed. **Real limit that
      remains, stated plainly rather than implied fixed**: this only
      fixes the *signer's name*. `printBatchApproved()` still iterates
      `getDrafts()`, which is local-only by design (#33) — a device
      with no local `Approved` draft for that person has nothing to
      print at all, signature sync or not.
    General lesson: when auditing "does X sync," check not just
    *visibility* but whether the local-only gap can silently corrupt a
    cross-device computation (weights feeding into scores) — that's a
    correctness bug, not just a convenience one, and worth calling out
    as higher priority than a plain data-visibility gap.

40. **When someone submits an evaluation, Admin on a different device has
    no way to know — Draft/Submitted/Calibrated stages are intentionally
    local-only per device (#33), and even though `saveEvaluationToMs365()`
    already pushed every save (Draft *and* Submitted) to the `Appraisals`
    Excel table via `graphAddTableRow()`, nobody was notified it had
    happened.** Added `notifyAdminOfEvalSubmission(payload)`, sending a
    real email (via the same Worker `/send-mail` used for PIN delivery,
    #26) to *every* `admin`/`sysadmin` role in `MASTER_USERS` that has a
    real email on file — not just the first match, since who's actually
    handling this cycle isn't knowable — only when `status==='Submitted'`
    (a Draft save is not a real submission and must never trigger it).
    Same honesty rules as #26's PIN email: best-effort per recipient (one
    admin's send failing must not block the others or the submit itself),
    `isWorkerConfigured()` gates it (silently skipped otherwise, since
    Draft/Submitted saves must never *feel* blocked by a missing email
    setup), and the toast only claims "แจ้งเตือน Admin ทางอีเมลแล้ว N คน"
    when a send actually succeeded. **This is a notification, not a sync
    mechanism** — it doesn't change the fact that Draft/Submitted/
    Calibrated are still per-device state; it just tells a human to go
    look, the same honest scope as #24 draws around "no way around this
    without a backend." The existing Excel push this rides on
    (`graphAddTableRow`) is append-only, so repeated Draft saves for the
    same person/cycle/level pile up rows in Excel rather than updating
    one — a pre-existing gap (not introduced here, and not fixed here —
    fixing it needs a composite-key upsert the shared `graphUpsertTableRow`
    helper doesn't support and the Worker's `/rows/upsert` endpoint would
    need extending to match, which means another live Worker redeploy;
    flagged for a future pass, not silently left implying it's fine).

41. **Fixed #40's flagged gap: `saveEvaluationToMs365()`/`ms365PushAppraisals()`
    used `graphAddTableRow()` for the `Appraisals` table, so every repeated
    "บันทึกร่าง" for the same person/cycle/level piled up a new Excel row
    instead of updating one — needed an upsert, but `graphUpsertTableRow()`
    only supported a single key column, and no single column in that
    table uniquely identifies "this person's evaluation this cycle at
    this level" (only the combination of EmpID+Cycle+Level does).**
    Extended `graphUpsertTableRow()` (client) and the Worker's `upsertRow()`
    identically — `keyColIndex`/`keyValue` now each accept either a plain
    value (existing single-column behavior, unchanged, every other caller
    keeps working with zero changes) or **parallel arrays** for a
    composite key, matched via a shared `rowMatchesUpsertKey()` helper
    duplicated in both places (client can't share code with the Worker,
    so kept the two implementations byte-for-byte identical in logic —
    if one ever changes, mirror it in the other or client/Worker will
    silently disagree on what counts as a match). `saveEvaluationToMs365()`
    and `ms365PushAppraisals()` now call it with `[0,2,3]` (EmpID/Cycle/
    Level column indices) instead of `graphAddTableRow()`. **This changes
    the Worker's own code, so it needs a real redeploy** (same
    copy-paste-into-Cloudflare step as every other Worker change this
    project has needed) — the updated file was sent to the user; this
    fix has no effect until they redeploy it, unlike every purely-client
    fix in this file which goes live the moment GitHub Pages updates.

42. **`ms365PushAppraisals()` deleted an Approved evaluation from the local
    queue the moment it successfully pushed to Excel — but that same
    queue (`MS365_LOCAL_DRAFT_KEY`, read via `getDrafts()`) is also the
    sole local data source for `getReportData()`/`departmentSummary()`/
    the Dashboard charts/`printBatchApproved()`.** So the instant a
    fully-completed evaluation was pushed, it vanished from every local
    report/print on that device — reported in production as the
    "สรุปผลรายฝ่าย" department summary showing 0/— average and 0 in
    every grade column even for departments with people who had actually
    completed the full evaluation cycle (their record was real, it just
    wasn't in `getDrafts()` anymore). This delete-after-push existed
    specifically to stop re-pushing the same Approved record as a
    duplicate Excel row (CLAUDE.md #7's shape of bug) — but #41 already
    made `ms365PushAppraisals()`'s Excel write a composite-key **upsert**,
    so re-pushing the same person/cycle/level now safely overwrites one
    Excel row instead of duplicating it, which means the delete-from-
    local-queue was no longer needed to prevent that and was actively
    breaking every local report instead. Fixed by never deleting from
    `MS365_LOCAL_DRAFT_KEY` on push; push-state is now tracked in a
    separate store, `PUSHED_APPRAISALS_KEY` (`markAppraisalPushed(key)`/
    `isAppraisalPushed(key)`, same `draftKey()` as the natural key), used
    only to compute "ค้าง Push" counts (`getPendingAppraisals()` — drafts
    that are `Approved` AND not yet marked pushed) so the UI's pending
    count and `renderPendingList()` don't re-count something already
    pushed, while `getDrafts()` itself stays the complete, permanent
    local history every report/print/dashboard function already assumes
    it is. General rule this confirms alongside #7: a "don't re-send a
    duplicate" guard belongs on the *transport* (the upsert key), not on
    deleting the local record of what happened — deleting local state to
    avoid a remote-duplicate problem will always eventually break
    whatever else reads that same local state, and once #41 made the
    remote side idempotent, the local-delete workaround had no remaining
    justification.

43. **The "รายชื่อที่มีข้อมูลเวลาแล้ว" attendance list only had a 🗑️ delete
    button per row — no way to correct a typo in someone's leave count
    without deleting and re-entering from scratch, the same gap CLAUDE.md
    #9 already found and fixed for the employee list and #20 fixed at the
    save layer.** First pass added `editAttendanceRow(code)` that filled
    the *top* "กรอกข้อมูลวันลารายบุคคล" form and scrolled to it — reused
    the existing edit-detection in `onManualEmpChange()` (#20), correct
    but required leaving the row/scrolling. User asked for the save
    button to live in the row itself instead — see #44 for the actual
    inline-edit implementation that superseded this scroll-to-form
    version. General rule either way: when a list needs an edit
    affordance and a working edit path already exists elsewhere on the
    page, wire a button to the real path — don't rebuild a second one.

44. **Follow-up to #43: HR asked for the edit to happen inline in the row
    ("ปุ่ม save ด้วย" — a save button directly in the list, not a scroll
    up to a separate form).** Rebuilding the write logic a second time
    inside the inline-edit path would have been exactly the "two places
    write `ATTENDANCE` at different times" bug CLAUDE.md #20 already
    warns about, just one layer further in — so first extracted the one
    real write path, `writeAttendanceRecord(code, vals)` (resolves the
    employee from `MASTER_USERS`, writes `ATTENDANCE[code]`, calls
    `saveAttendance()`/`recalc()`/`renderCycleStats()`/`appendAuditLog()`,
    returns `{emp,isEdit}` or `null` for an unknown code), and made both
    `saveManualAttendance()` (the top form) and the new
    `saveAttendanceRowInline(code)` call it — never two divergent copies
    of the same write. `editingAttendanceCode` (module-level, one value —
    editing two rows "at once" would make it ambiguous which 💾 saves
    which) tracks which row `renderAttendanceList()` should render as
    editable; that row gets number `<input>`s (ids `attEdit_absent` etc.,
    reused since only one row is ever in edit mode) prefilled from the
    real `ATTENDANCE[code]`, plus 💾 `saveAttendanceRowInline(code)` and
    ✖️ `cancelEditAttendanceRow()` buttons in place of ✏️/🗑️. `ใบรับรอง
    แพทย์สะสม` (`medCert`) isn't a column in this table, so the inline
    save explicitly carries the existing stored value through rather
    than defaulting it to empty and silently wiping it (would have been
    the same shape of data loss as CLAUDE.md #1's "never let a re-save
    of partial fields blank out the rest of the record"). Cancel discards
    the in-row edits without writing (verified with a test that types a
    new value, cancels, and confirms `ATTENDANCE` is unchanged) — the top
    form and its own edit-detection flow (#20/#43) are left fully intact
    as an alternate path for the same data.

45. **L1/L2 logged in could see everyone's data — every evaluation-workflow
    page, the report/dashboard, and the "ประเมินทีมงาน" manager filter
    showed the whole company, not just the viewer's own subordinates.**
    The "team" page (step 2) already filtered by `u[9]===managerName`, but
    the `<select>` of pickable managers was built from every `u[9]` value
    in the whole company (`populateTeamManagerSelect()`), so any logged-in
    L1 could pick a *different* manager's name and browse their team —
    the filter existed but nothing constrained *which* manager you could
    become. The review (step 3)/calibration (step 4)/approve (step 5)
    queues, the dashboard's participant-derived stats/9-Box/assignment
    table, and "รายงาน & Export" didn't filter by viewer at all — they
    read `getDrafts()`/`MASTER_USERS` unconditionally. Added one central
    helper, `getMyScopedEmpCodes()`, keyed off `CURRENT_SESSION_USER`
    (the real logged-in identity from the PIN gate — **not** `#roleSel`,
    which is only a Demo UI preview switch admin/sysadmin can use to look
    at other roles' screens without actually losing their own full
    access): returns a `Set` of allowed employee codes for `l1` (direct
    reports only, via `u[9]===myName`) and `l2` (the *whole* chain under
    them — every employee whose `u[10]===myName`, which already covers
    both the L1s reporting to this L2 and those L1s' own teams, since
    every employee's `u[10]` field already names their real L2 per
    CLAUDE.md #22 — not just people who report to this L2 directly), or
    `null` (unrestricted) for `admin`/`sysadmin`/`exec` — those roles
    need company-wide oversight, so they were deliberately left
    unscoped, and so was `emp` (never asked for, and scoping it would
    have broken other UI that already assumes `emp` sees org-wide
    averages for comparison). Wired into the one real chokepoint,
    `getEvalParticipants()` (already the shared base for dashboard
    stats/9-Box/`getEvaluationAssignments()`), so scoping it there
    cascaded to every consumer with no other changes needed — plus
    separately into `getReportData()` (report/export) and the review/
    calib/approve queue renderers (which read `getDrafts()` directly,
    not through `getEvalParticipants()`). One leak this missed on the
    first pass: `renderDashGradeBars(drafts)` took the *raw* unscoped
    `drafts` array straight from `renderCycleStats()` instead of the
    already-scoped `participants` list every sibling render function
    there uses — the company-wide grade distribution bars would have
    kept leaking to L1/L2 even after everything else was scoped, since
    it doesn't look anything up by employee code the way
    `renderDashboardWorkflowSteps()` does; fixed by filtering `drafts`
    through the same `getMyScopedEmpCodes()` before passing it in.
    `populateTeamManagerSelect()` also got its own fix beyond just using
    the helper: L1's `<select>` is now forced to their own name and
    disabled (not just filtered — actively locked, since a stale
    `<option>` value from a previous session could otherwise survive a
    role switch), and L2's option list is now built from real L1
    employee rows in their chain (`u[2]==='l1' && u[10]===myName`)
    instead of scanning for `u[9]` values in use — which incidentally
    also means an L2's newly-assigned L1 with zero current reports still
    shows up as selectable, closing a small pre-existing gap in the old
    "only managers who already have someone reporting to them appear"
    logic. General lesson: a page-level filter (like the team page's
    `u[9]===managerName`) is not the same as *scoping who gets to pick
    the filter value* — check both, and when several pages/widgets all
    derive from one shared base function, fixing scope at that one base
    point is far safer than patching every consumer individually, but
    still grep for consumers that bypass the base function and read the
    raw store directly (as `renderDashGradeBars()` did here).

46. **The "ผู้ใช้งานล่าสุด" (Recent Users) table on the ผู้ใช้ & สิทธิ์ page was
    the exact combination CLAUDE.md #16 + #10 warn about: 3 hardcoded
    `<tr>`s of fake people, an explicit "ตัวอย่างข้อมูล" (sample data)
    badge admitting it, and a "จัดการ" button with no `onclick` at all —
    while a fully working "รายชื่อผู้ใช้ทั้งหมด" table already existed
    right below it on the same page (`renderUsers()`/`openEditUser()`).**
    Fixed with `renderRecentUsers()`: pulls the first 5 real active
    `MASTER_USERS` rows and points "จัดการ" at the *same* `openEditUser()`
    the real table already uses — no second edit path to keep in sync
    (same reasoning as #43/#44). Deliberately did **not** claim this list
    is sorted by actual recency: `u[13]` (Login ล่าสุด) is free-text
    (`"วันนี้ 15:42"`, `"11/09/68 08:10"`, mixed formats depending on how
    the row was created), not a consistent parseable timestamp, so a
    real chronological sort can't be computed honestly from it — showing
    it in `MASTER_USERS` array order and dropping the "ตัวอย่างข้อมูล"
    badge (since the rows are now real) was the honest fix; inventing a
    plausible-looking "most recent first" order the code can't actually
    verify would have been the same shape of dishonesty CLAUDE.md #14
    warns against for the Audit Log's old fake IP column.

47. **`resetUserPin()` always generated a random 4-digit PIN — there was
    no way for Admin to set a PIN of their own choosing (e.g. one
    they'd already told an employee some other way).** Added a
    `prompt()` step before the existing random-generation path: typing
    4 digits sets that as the real PIN, leaving it blank keeps the old
    random-generate behavior, and clicking Cancel now aborts the whole
    operation with the employee's PIN left completely untouched (not
    silently regenerated anyway) rather than assuming Cancel means
    "generate a random one." A non-4-digit, non-blank entry is rejected
    outright with a toast and nothing is written — CLAUDE.md #14's "don't
    invent a value you can't be sure of" applies here too: guessing what
    the Admin "probably meant" to type would risk setting a real login
    PIN to something they didn't intend. Every other part of the
    function (SHA-256 hash storage, one-time `alert()` display, email
    delivery via `tryEmailPin()`, Excel push via
    `pushSingleEmployeeSettings()`) is unchanged — this only changes
    where the raw PIN value comes from before it's hashed.

48. **Follow-up to #46: after wiring "ผู้ใช้งานล่าสุด" up to real data, the user
    asked point-blank whether it's just a duplicate of the real
    "รายชื่อผู้ใช้ทั้งหมด" table right below it on the same page — it was.**
    Once #46 made it pull from real `MASTER_USERS` instead of 3 fake rows,
    it became a same-columns, same-source, strictly-shorter (top 5) view
    of the exact table sitting directly underneath it — the only thing it
    added was an unreliable "recency" framing (#46 already noted `u[13]`
    can't be sorted honestly). A view that duplicates another view one
    scroll away and can't even deliver on its own header's promise is
    worth deleting, not fixing further — removed the card, its
    `renderRecentUsers()` function, and all three call sites entirely
    rather than leaving a half-used function around per the project's
    "delete code you're sure is unused" convention. The user also asked
    whether this overlapped with Audit Log and whether any of it reaches
    Excel: Audit Log already logs real `'auth'` (เข้าสู่ระบบ/ออกจากระบบ)
    events with real ISO timestamps (`appendAuditLog('auth', ...)` in
    `doLogin()`/logout, since CLAUDE.md #17) and already pushes every
    entry to the Excel `AuditLog` table via `pushAuditLogEntryToExcel()`
    (#34) — so "who's been using the system" already has a real,
    Excel-backed answer, just a *better* one than the removed table ever
    was, since Audit Log's timestamps are real `Date().toISOString()`
    values instead of `u[13]`'s inconsistent free text. The one real gap
    found while checking this: `auditFilterType` had no `auth` option, so
    login/logout entries existed and were already in Excel but couldn't
    be filtered to on the Audit Log page itself — added `<option
    value="auth">เข้า/ออกระบบ</option>` to close that gap. General lesson:
    when a "recent activity" table turns out to be an unreliable
    subset of data another page already tracks more accurately (here,
    Audit Log's real timestamps vs. `MASTER_USERS`'s free-text
    `lastLogin`), the fix is pointing at — or exposing a filter into —
    the accurate source, not maintaining two competing views of the same
    fact where one is provably worse.

49. **Follow-up to #48: confirmed the honest answer to "will another
    device's login show up here?" was NO — `renderAuditLog()` only ever
    reads `getAuditLog()`, which is `localStorage` on the one device
    being looked at, even though every entry is already pushed to the
    Excel `AuditLog` table (#34).** So opening the Audit Log page on
    Device A only ever showed Device A's own history; a login on Device
    B was real, in Excel, and completely invisible in the app on any
    other device. Added `ms365SyncAuditLog(silent)`: pulls the whole
    `AuditLog` Excel table and **merges** it into the local list (never
    replaces it outright) via `auditEntryKey(e)` — a dedup key built from
    all six fields joined together, since the `AuditLog` table has no
    real id column to match on — so an entry that exists in both (this
    device's own action, already pushed) collapses to one row instead of
    showing twice, while an event from *only* the local side (pushed to
    Excel too recently for this pull to have caught it, since the push
    is fire-and-forget) is never dropped just because the remote copy
    hasn't landed yet. Wired into both silent-sync groups (`doLogin()`
    and `tryRestoreSession()`, the same group #32/#33 established) and
    into the Audit page's own nav dispatch (`p==='audit'`) so opening the
    tab always pulls fresh, plus a manual "🔄 ดึงจากทุกเครื่อง" button for
    an on-demand refresh. The page's own description text was updated
    from "เก็บในเบราว์เซอร์เครื่องนี้" (stored in this browser) to say it
    now aggregates every MS365-configured device — leaving the old
    wording would have been the exact CLAUDE.md #34 problem (a doc claim
    the code no longer backs) in the other direction, claiming something
    *worse* than what the code now actually does.

50. **HR reported "Grade ไม่ได้ดึงจากฐานข้อมูล" (Grade isn't pulled from the
    database) on the employee list/edit page. The read/write plumbing
    between `MASTER_USERS` and Excel checked out correctly (verified with
    a diagnostic test against the real header order HR re-confirmed —
    unchanged from #30) — the actual bug was one layer further down, in
    how the value gets displayed.** `mu_grade` was a `<select>` with only
    6 hardcoded `<option>`s (`G1`/`G2`/`G3`/`M1`/`M2`/`E1`) — the same
    shape of bug CLAUDE.md #3 already warns about, just easy to miss here
    because Grade *looks* like a fixed enum, not free-form data like a
    department name. `fillUserFormFields()` sets `mu_grade.value = emp[8]`
    when opening the edit form (correctly, from the real synced record),
    but if that real Grade value from Excel wasn't an exact match for one
    of the 6 hardcoded options (any other real HR grade code, a stray
    space, different casing), `<select>.value = X` for an X with no
    matching `<option>` silently fails and the browser falls back to
    showing the first option — `MASTER_USERS` still held the correct
    value in memory the whole time, but the edit form visibly showed the
    wrong grade, which is exactly what would read as "not pulled from
    the database" even though it was. Fixed with `populateGradeOptions()`
    (same `populate*Filters()` pattern as #3): rebuilds `mu_grade`'s
    options as the union of the 6 base grades and every distinct real
    `u[8]` value already in `MASTER_USERS`, so a stored value always has
    a matching option. Called at the same points `populateUserFilters()`
    already is (init, after `saveUserFromModal()`, after
    `loadEmployeesFromMs365()`) and — critically — again inside
    `fillUserFormFields()` itself right before setting the value, so even
    an employee record that predates the last populate call still gets
    its own real grade added as an option before the form tries to
    select it. Verified with a test that gives a synthetic employee a
    grade outside the base 6 (`'P7'`) and confirms the edit form now
    shows `P7`, not a silent fallback to `G1`. General lesson: a
    dropdown that *looks* like a closed, safe-to-hardcode enum (job
    grade, unlike a department name) can still silently drop real data
    if the app's assumed value set doesn't match what HR's actual sheet
    contains — the fix is the same either way: populate from what the
    data actually has, union'd with any real fixed scale, never assume.

51. **HR asked for a settings page to add/edit the master lists behind
    กลุ่มงาน/แผนก/ส่วน/ฝ่าย/เกรด/ตำแหน่งงาน, and for Add/Edit Employee to use
    dropdowns for all of them instead of free typing, "จะได้ไม่ผิดพลาด."**
    Group/Section/Division/Department already were `<select>`s, but
    `getOrgStructure()` built their options purely from *existing*
    `MASTER_USERS` rows — a real chicken-and-egg gap: there was no way to
    create a brand-new group/department ahead of hiring its first person
    into it, since nothing could offer it as an option until someone
    already had it. ตำแหน่งงาน (`mu_position`) wasn't even a dropdown —
    still a free-text `<input>`, so typos/inconsistent spellings were
    always possible there regardless. Added a real master-data layer:
    `ORG_MASTER` (`ORG_MASTER_KEY`, `localStorage`, explicitly labeled
    in the UI as local-only for now, not yet pushed to Excel — same
    "be explicit rather than imply cross-device" rule as CLAUDE.md #8b)
    holding a plain array per field (`groups`/`sections`/`divisions`/
    `departments`/`positions`/`grades`), with grades seeded from the
    same 6-value scale #50 already established. New page "รายการหลัก"
    (`pg-orgmaster`, admin-only nav) lets Admin add a new item to any of
    the 6 lists, or delete one — but `removeOrgMasterItem()` **refuses**
    to delete a value any real employee currently has (checks
    `MASTER_USERS` by the field's `empIdx`), so the master-list page
    can't be used to accidentally break an existing employee's dropdown
    out from under them. `getOrgMasterValues(fieldKey)` is the one real
    source every consumer reads: the *union* of the admin-managed list
    and whatever real values already exist in `MASTER_USERS` for that
    field — never just one or the other, for the same reason #50 fixed
    Grade this way: a real value that's never been formally added to the
    master list (e.g. synced fresh from Excel) must still show up as
    selectable, or editing that employee silently reverts their real
    field to the browser's default `<select>` fallback. `populateOrgSelects()`
    now builds all 6 fields' options from `getOrgMasterValues()`
    directly (position included) instead of the old group→section→
    division/department cascade — flattened deliberately, since forcing
    a cascade back onto admin-managed lists would reintroduce the same
    chicken-and-egg problem this fix exists to remove (a new section
    couldn't be added without first picking one of the — possibly
    nonexistent yet — groups it's supposed to cascade from).
    `getOrgStructure()`/`onOrgGroupChange()`/`onOrgSectionChange()` were
    deleted outright rather than left dead, per this project's
    delete-unused-code convention; `fillUserFormFields()` now calls
    `populateOrgSelects()` once up front (mirroring the exact
    `populateGradeOptions()`-before-`set()` pattern #50 introduced)
    before setting any of the 6 fields, so an existing employee's real
    values are always addable-if-missing before the form tries to
    select them.

52. **Follow-up to #51: HR said "sync" — the new "รายการหลัก" page's own
    notice admitted it was local-only (localStorage, not yet pushed to
    Excel), so a group/position added on one device was invisible to
    Admin on any other device, the same shape of gap CLAUDE.md #8 always
    flags.** Added a real `OrgMaster` Excel table sync, same pattern as
    #39a's `FormWeights`: one row per field (`groups`/`sections`/
    `divisions`/`departments`/`positions`/`grades`), the field's whole
    array JSON-encoded into one column since the item count isn't
    fixed-column, upserted (`graphUpsertTableRow`, keyed by field name)
    rather than appended, since each field is "current state of one
    list," not a repeatable event (#21's reasoning). `addOrgMasterItem()`/
    `removeOrgMasterItem()` now call `pushOrgMasterFieldToExcel(fieldKey)`
    — pushes only the one field that changed, not all six, after every
    edit. Pull side, `ms365SyncOrgMaster(silent)`, **merges** each
    field's remote array into the local one (union, never replaces
    wholesale) — same reasoning as #49's Audit Log merge: a value just
    added on this device via a fire-and-forget push that hasn't landed
    in Excel yet must never vanish just because a pull happened to run
    first. Wired into both silent-sync groups (`doLogin()`/
    `tryRestoreSession()`), the orgmaster page's own nav dispatch, and a
    manual "🔄 ดึงจากทุกเครื่อง" button — the exact same three hook points
    #49 established for Audit Log, since both are "local-only admitted
    gap → add push + merge-pull sync" fixes of the same shape. Updated
    the page's own notice text to describe the real synced behavior
    instead of the "ยังไม่ sync ขึ้น Excel" admission from #51, which
    would otherwise become a stale, now-false claim the moment this
    shipped (the exact CLAUDE.md #34/#49 trap: a doc/UI claim that
    stops matching the code underneath it).

53. **Follow-up to #51/#52: once a real list had dozens of items (36
    positions in the screenshot HR sent), the chip layout — wrapped
    pills each with its own × button — became hard to scan, and HR
    asked for a checkbox layout instead, applied to all 6 categories
    consistently.** Rewrote `renderOrgMasterLists()`'s per-field body
    from a flex-wrap chip row into a scrollable grid of real
    `<input type="checkbox">` rows (`.orgmaster-chk`, `data-field`/
    `value` on each), replacing the old one-`×`-button-per-chip delete
    with a single "🗑️ ลบรายการที่เลือก" button per field that acts on
    every checked box at once. Replaced `removeOrgMasterItem(fieldKey,
    value)` (single-item delete) with `deleteSelectedOrgMasterItems
    (fieldKey)` outright — deleted rather than left both around, per
    this project's standing convention, since the checkbox UI has no
    remaining caller for the old single-delete path. Kept every rule
    #51 already established: an in-use value (checked by
    `MASTER_USERS[spec.empIdx]`) is silently skipped rather than
    blocking the whole batch — the confirm/toast now reports counts
    for both halves ("ลบ N รายการแล้ว · ข้าม M รายการที่ใช้งานอยู่")
    since a bulk action can now mix removable and protected items in
    one selection, which single-item delete never had to express.
    Selecting zero items warns instead of silently no-op'ing, same
    "always give feedback" instinct as the rest of this file's actions.

54. **The "6. ผลประเมิน" (My Result) page — the screen a logged-in employee
    is supposed to see their own real result on — was pure mock HTML
    the whole time: hardcoded grade "A", score "91.25", a fabricated
    4-year history table, and 3 invented reviewer comments, identical
    regardless of who logged in (CLAUDE.md #16).** Screenshotted by the
    user logged in as "Super Admin" and reported as "ไม่ update ข้อมูล"
    (doesn't update). Rewrote `pg-myresult` with real ids and added
    `renderMyResult()`: resolves the logged-in employee's own drafts via
    `getDrafts().filter(d=>d[0]===CURRENT_SESSION_USER[0])`, takes the
    most recently Approved one (`d[d.length-1]==='Approved'`, highest
    cycle) for the headline grade/X/Y/Z, and builds real history from
    every draft this employee has across cycles — an honest empty state
    ("ยังไม่มีผลการประเมินที่อนุมัติเสร็จสิ้น") shows instead of any
    numbers when there's nothing real to show, rather than leaving the
    old mock values in place as a false "looks populated" state.
    **"ปรับเงินเดือน/โบนัส" was dropped outright, not wired to anything**
    — this app has no salary or bonus data stored anywhere at all, so
    displaying a number there would always have been invented regardless
    of source (CLAUDE.md #14); replaced with "สถานะอนุมัติ", a field this
    app can actually answer honestly. **The "ความเห็นจากผู้ประเมิน" text
    comments were dropped too, for the same reason** — nothing in this
    codebase stores free-text review comments per evaluation stage, only
    scores/grades and (per CLAUDE.md #39) a signer's *name* on final
    approval; kept only the real part (`getApprovalSignature(empCode+
    '|'+cycle)`, the same key #39 established) as a small "ผู้ลงนามอนุมัติ"
    card, hidden entirely when no real signature exists on this device
    rather than showing a placeholder name. "อันดับในฝ่าย" (department
    rank) is computed live against real peers — `getDrafts()` filtered to
    the same cycle, `Approved` status, and (critically) run through
    `getMyScopedEmpCodes()` first, so an L1/L2 viewing their own result
    only ranks against people within their own real visibility per
    CLAUDE.md #45, never leaking company-wide comparison data through a
    "personal" page that was never meant to expose it. Verified with a
    test that logs in two different employees in sequence and confirms
    neither carries over the other's grade/score — the exact
    cross-contamination risk a shared-DOM mock page invites once it's
    made to read from `CURRENT_SESSION_USER` instead of hardcoded
    literals.

55. **`resetUserPin()`'s custom-PIN path (#47) had no way to catch a typo —
    a single wrong digit in the one `prompt()` became the real login PIN
    immediately, and since PINs are stored only as a one-way SHA-256 hash
    (#17), there was no way to ever recover or even detect what was
    actually typed versus intended.** Reported in production as "เปลี่ยน
    รหัสแล้วเข้าไม่ได้" (changed the PIN, now can't log in) for one
    employee — traced the whole push/pull round-trip
    (`resetUserPin→pushSingleEmployeeSettings→EmployeeSettings` Excel
    table `→ms365SyncEmployeeSettingsSilent`/`applyEmployeeSettingsRows`
    in `doLogin()`'s silent-sync group) and confirmed it was already
    correct end-to-end (composite re-merge in `loadEmployeesFromMs365()`
    per #17 also checked out) — the real bug was one step earlier, at
    the moment of typing the new PIN itself, the same class of mistake as
    any "no confirm step for an unrecoverable action" gap. Fixed by adding
    a second `prompt()` asking Admin to retype the same 4 digits before
    `sha256Hex()` ever runs; a mismatch (or Cancel on either prompt)
    aborts with a toast and leaves `emp[17]` completely untouched — the
    employee's old PIN keeps working rather than silently becoming an
    unknown, unrecoverable one. Also changed
    `pushSingleEmployeeSettings(code)`'s call at the end of
    `resetUserPin()` from fire-and-forget to `await`ed: the previous
    version returned as soon as the confirmation `alert()` closed, so an
    Admin closing the tab or reloading right after seeing the new PIN
    could cut the Excel push off mid-flight, leaving every other
    device's copy of `EmployeeSettings` never updated — the exact
    "looks like it worked, quietly didn't reach Excel" shape CLAUDE.md
    #10/#19 already warn about, just triggered by page-lifecycle timing
    instead of a missing call. General lesson: any place that turns a
    single unconfirmed keystroke into a one-way hash with no visible
    record of the original value (a PIN, a password, an API key) needs a
    type-twice confirmation before committing — there is no "check it
    against the database and fix it" recovery path once it's hashed.

56. **The printed evaluation form's logo (`.F-logo-box`) was never a real
    logo — just a text box reading "SML" on a blue gradient, with a
    "SMG Group" caption underneath — and the batch-print path
    (`printBatchApproved()`, "พิมพ์ทั้งหมดที่อนุมัติแล้ว") didn't share
    that header at all: it used a completely separate, plainer inline-
    styled block with no logo and none of the `.F`-class sizing that
    `printEvalForm()` had already been carefully tuned to fit one A4
    page (7-9pt fonts, `@page` margins).** HR sent the company's real
    circular logo image and asked for it on the printed form, "balanced
    to fit A4," for every record. Embedded the real logo as a base64
    `data:image/png` constant (`SML_LOGO_DATA_URI`, defined once near
    the top of the main `<script>` block) — kept as an embedded data URI
    rather than a separate file, matching this project's single-file,
    no-build-step convention (an `<img src="assets/logo.png">` would work
    on `file://` but silently 404 if anyone ever split deployment, and
    there's no asset pipeline here to catch that). `.F-logo-col`'s
    background changed from the blue gradient to white with a border
    (the real logo has its own white background and full brand colors
    baked in — placing it on a colored box would show an ugly white
    square) and the redundant `.F-logo-smg` "SMG Group" caption was
    deleted outright (the real logo already spells out the full Thai +
    English company name, so the old caption was now duplicate content,
    not additive). **Never leave a second print path with its own
    hand-rolled layout when a first one already exists and is correctly
    tuned** — same shape of drift as CLAUDE.md #34/#48 (two views of the
    same fact that can silently disagree): rewrote `printBatchApproved()`
    to build each employee's page from the *same* `.F`/`.F-header`/
    `.F-logo-col`/`.F-info`/`.F-tbl`/`.F-result` classes `printEvalForm()`
    uses, with the same real logo, instead of maintaining a second,
    visually inconsistent template that could drift out of sync with the
    real one's A4-fit tuning. Verified with a Playwright test that
    measures each rendered batch page's height against the real content
    budget (297mm page − 13mm top/bottom `@page` margin ≈ 1073px @96dpi)
    and confirms every page renders well under it, plus a rendered
    screenshot of the single-print form to visually confirm the real
    logo (not a placeholder box) appears correctly sized in the header.

57. **The Login page's "รหัสพนักงาน" field, reported as "พิมพ์ไม่ได้"
    (can't type), was pointed at the same shared `empCodeList` datalist
    every other code-entry field in the app uses (#28) — which means the
    moment the field is focused/tapped with nothing typed yet, the browser
    shows every non-resigned employee as suggestions at once.** The
    screenshot the user sent showed exactly this: a fully-open dropdown
    listing SML-001 through SML-006+ while the input itself was still
    empty. On a company with a real headcount (dozens to hundreds of
    people, unlike the small demo dataset), a `<datalist>` that large
    opened instantly on focus is a known trigger for browsers (especially
    mobile) to swallow the keyboard/first keystroke while it's busy
    rendering/filtering the full list — reproducing as "typing does
    nothing." Every *other* datalist-linked field (#28/#29 — `mu_id`,
    `evalCodeGate`, supervisor code inputs, manual attendance) is used by
    HR/Admin on desktop and benefits from seeing the full list immediately,
    so the shared `empCodeList` itself was left untouched. Fixed by giving
    the Login field its own dedicated datalist, `empCodeListLogin`
    (`onLoginCodeInput()`, wired via `oninput`): it starts completely
    empty on page load/focus (no giant dropdown fires just from tapping
    an empty field) and only populates — filtered to codes containing what
    was actually typed so far, capped at 8 matches — once the person has
    typed at least one character. Verified with a Playwright test
    confirming the login datalist has zero options before typing, fills
    with a small filtered set after typing "SML-0", empties again when the
    field is cleared, and that the original shared `empCodeList` (every
    other field) is completely unaffected. General lesson: a datalist
    that's fine at demo-data scale (a dozen people) can become a genuine
    input-blocking bug at real-company scale — the *first* touchpoint of
    the app (login) is the one place this is most likely to be hit by
    every single employee, every single day, so it's worth capping/
    filtering there even where every other admin-only field can safely
    stay "show everything."

58. **User asked point-blank whether an evaluation done on one device shows
    up for everyone with permission — the honest answer, per CLAUDE.md
    #33/#40, was no: `Appraisals` was push-only, so Review/Calibration/
    Approve queues (which read `getDrafts()`, local-only per device)
    never saw a submission made elsewhere until that device's own next
    login/reload. User said add it, plus: notify whoever acted on an
    evaluation before if it's later edited.** Added the pull side —
    `ms365SyncAppraisals(silent)` — completing the round-trip #33
    deliberately left one-way. It **merges**, never replaces wholesale
    (same reasoning as #49/#52's Audit Log/OrgMaster merges): for each
    remote row it only overwrites the local copy at the same `draftKey`
    when the remote status is **strictly further along** the pipeline
    (`EVAL_STATUS_ORDER = ['Draft','Submitted','L2Reviewed','Calibrated',
    'Approved']`, extracted as one shared constant + `evalStatusRank()`
    so `renderDashboardWorkflowSteps()`'s own local copy of this same
    order couldn't drift from the sync logic's copy — the CLAUDE.md #41
    "keep dual implementations of one ordering byte-for-byte in sync"
    lesson applies to any duplicated ordering array, not just client/
    Worker code) — never on a tie. A tie is deliberately left alone: two
    same-rank copies can't be dated against each other (no timestamp
    column), and always taking Excel's copy on a tie would risk
    clobbering a same-stage edit that's sitting in this device's local
    queue but hasn't finished pushing yet. Verified with a test that
    seeds a local unpushed Draft (must survive a sync), a remote-only
    Submitted row from "another device" (must appear locally), and a
    case where local has since advanced past what a stale remote copy
    still shows (must NOT regress). Wired into both silent-sync groups
    (`doLogin()`/`tryRestoreSession()`) and the nav dispatch for every
    page that reads `getDrafts()` (review/calib/approve/team/report/
    cycle/myresult) — **deliberately excluding `dash`**: `setRole('admin')`
    at the bottom of the file synchronously `.click()`s into the
    Dashboard page while the script is still parsing, long before
    `DEFAULT_MS365_CONFIG` (declared much later in the file) finishes
    initializing — wiring `dash` into this dispatch was the first thing
    to ever call `loadMs365Config()` from that synchronous path and blew
    up with `ReferenceError: Cannot access 'DEFAULT_MS365_CONFIG' before
    initialization` on every single page load, caught only because the
    click-sweep test (required by this file's own verification
    checklist) still runs after every change — a reminder that "add this
    page to an existing dispatch list" is not risk-free just because the
    function itself is fine in isolation; the *page* matters too, and
    `dash` in particular is special-cased here as the one page reachable
    from top-level synchronous code, not just user clicks.
    For the second half of the request — notify the previous evaluator
    on edit — added `EVAL_LAST_ACTOR_KEY` (localStorage map, key
    `empCode|cycle`, same key shape as `APPROVAL_SIGNATURE_KEY` per #39
    since level doesn't change who acted): `recordEvalActor()` is called
    from the one real chokepoint every stage transition already goes
    through, `pushApprovalRecordToExcel()` (L2 review/reject,
    Calibration, final approve/reject all call it — see #34), storing
    the actor's real employee **code** (never just the display name,
    per CLAUDE.md #1) so the later email lookup resolves a real
    `MASTER_USERS` row rather than trusting a name string. In
    `saveEvaluationToMs365()`, the existing local draft and its recorded
    last actor are read **before** `saveEvaluationLocal()` overwrites
    them; if both existed, this save counts as "an edit after someone
    already acted on it" and `notifyPrevEvaluatorOfEdit()` fires — same
    honesty rules as #26/#40's email sends (best-effort, `isWorkerConfigured()`
    gates it, recipient must have a real email on file, never assumed
    sent unless the send actually succeeded). This correctly covers the
    main real scenario: L2 "ตีกลับ" (reject) resets status back to plain
    `Draft` (so a naive "status isn't Draft" check would miss it
    entirely), but `EVAL_LAST_ACTOR_KEY` still remembers the L2 who
    rejected it, so when the employee/L1 corrects and resubmits, that
    same L2 gets emailed — not the current status field, the *history*
    of who touched it. Verified a first-time submission (no prior actor
    recorded yet) sends no edit-notification, and an edit after an L2
    review does email that specific L2's real address.

59. **Follow-up to #58: user asked to confirm cross-device visibility was
    truly "the same" now, and pointed out it only refreshed on page entry
    — a page left open while someone else saved from another device
    would show stale data until the person left and came back. Asked for
    auto-refresh.** Added `startEvalAutoSync()`/`stopEvalAutoSync()`,
    the exact same pattern `startMs365AutoSync()`/`stopMs365AutoSync()`
    already established for the MS365 Excel tab (sync immediately on
    entry, then `setInterval` every N seconds while the page stays open,
    a single shared timer variable so navigating between pages in the
    same group never spawns duplicates) — 30 seconds instead of that
    page's 5 minutes, since evaluation workflow data is something a
    person is actively waiting on mid-task, not slow-changing master
    data. Replaced the one-shot `ms365SyncAppraisals(true)` call in the
    nav dispatcher (added in #58) with start/stop calls wired to the
    same page list (review/calib/approve/team/report/cycle/myresult),
    and — critically — `stopEvalAutoSync()` on every *other* page, or
    the timer would keep firing forever in the background even after
    navigating away from any page that needs it, burning a Graph/Worker
    call every 30s for no reason (the same "leaves a timer running after
    the reason for it ends" mistake `stopMs365AutoSync()` already exists
    to prevent for the MS365 tab). No new cleanup needed on logout —
    `doLogout()` already calls `location.reload()`, which clears every
    JS timer as a side effect. Verified with a test that enters an
    eval-workflow page (timer starts, sync fires immediately), leaves it
    (timer stops — confirmed by checking the timer variable is cleared,
    not just inferring from behavior), and moves between several
    eval-workflow pages in a row (must reuse one timer, not accumulate
    a new interval on every nav click, which would have silently
    multiplied the sync frequency).

60. **Three requests in one message: add an employee-acknowledgment step
    after final approval (with Excel push), add the employee's leave
    summary to every printed/exported evaluation report, and answer
    honestly whether starting a new annual cycle would mix up with the
    old one's data.** Investigating the third question surfaced a real,
    previously-undiscovered bug that made the honest answer "yes, badly"
    with the code as it stood: `collectEvaluationPayload()` — the
    function every single evaluation save goes through — had `'2569'`
    **hardcoded as a string literal** for the `cycle` field, never
    reading the "ตั้งค่ารอบประเมิน" settings page's cycle info at all.
    Since `draftKey()`/the Excel composite key are `empCode|cycle|level`,
    every evaluation ever saved — no matter what Admin typed into the
    cycle-name field or how many real years passed — was silently keyed
    to the same literal `'2569'`. Starting a real new cycle next year
    would not create new records; it would **overwrite the previous
    year's Approved/Acknowledged evaluations in place**, both locally
    and in the Excel `Appraisals` table (upsert on that same composite
    key), since nothing about "starting a new cycle" ever changed what
    got written. Fixed by adding a real `รหัสรอบ` (`cycleYearSetup`)
    field to the cycle settings page — a short code (e.g. `2569`) kept
    separate from the long display name (`cycleNameSetup`, e.g. "FY2026
    – ประจำปี 2569 …") — and `getCurrentEvalCycleYear()`, which
    `collectEvaluationPayload()` and `printEvalForm()`'s year badge
    (previously *also* hardcoded `"FY 2569"` — same bug, different
    spot) now read instead of the literal. Falls back to `'2569'` only
    when nothing has ever been configured (a fresh deployment), matching
    the old demo behavior rather than breaking it. Extended
    `pushCycleSetupToExcel()`/`ms365SyncCycleSetup()` to round-trip this
    new field too, appending it as a new trailing column (never inserted
    mid-row, per CLAUDE.md #5) so it doesn't shift any existing consumer
    of that Excel row's layout. **The honest answer to the literal
    question, once fixed**: no, cycles won't mix up *as long as Admin
    actually changes "รหัสรอบ" to the new year/code when a new cycle
    starts* — this is now a real configuration step, not automatic
    (there's no calendar-based auto-rollover), so it's worth stating
    that requirement plainly rather than implying "just works."
    For the acknowledgment step: extended `EVAL_STATUS_ORDER` (#58) with
    a final `'Acknowledged'` stage appended after `'Approved'` (append at
    the end, never insert mid-array, per #5) and centralized every place
    that used to check `status==='Approved'` by exact string match — five
    separate spots (`renderMyResult`'s latest/department-peer filters,
    `getPendingAppraisals()`, `ms365PushAppraisals()`'s push filter and
    its own pending-count re-check, the notification-bell's pending-push
    count) — into one `isFinalStatus(status)` helper, the same
    "don't compare a multi-state status by one literal string" lesson
    CLAUDE.md #11 already teaches, just newly relevant now that a second
    real final state exists. `approveAllFinal()` now emails every
    approved employee (`notifyEmployeeOfApproval()`, same best-effort/
    `isWorkerConfigured()`-gated honesty rules as #26/#40/#58's other
    emails) inviting them to the "6. ผลประเมิน" page, where a real
    `acknowledgeMyResult(empCode, cycle)` button appears only while their
    latest result is exactly `'Approved'` (not yet acknowledged) and
    flips to a plain "✓ รับทราบแล้ว" badge once clicked — advancing the
    status pushes to *both* Excel tables for the right reason each:
    `Approvals` (append-only event log, via the existing
    `pushApprovalRecordToExcel()` chokepoint, which also now correctly
    tracks the employee themselves as the "last actor" for #58's
    edit-notification feature) and `Appraisals` (upsert, so the row's
    own `status` column doesn't stay stuck on `"Approved"` forever after
    a real acknowledgment happened). `printBatchApproved()`'s filter was
    widened from literal `'Approved'` to `isFinalStatus()` too — without
    this, an acknowledged employee's evaluation would have silently
    vanished from batch printing the moment they acknowledged it, the
    exact shape of regression #42 already warns about when a status
    check doesn't account for every "still counts as done" state.
    For the leave-summary request: `printEvalForm()`'s printed form
    already showed a leave/lateness breakdown box (late count, early-
    leave count, sick days, personal days) computed from real
    `ATTENDANCE` data via `computeZScore()` — added ขาดงาน (absent days)
    to it for completeness, since it's part of the same Z-day formula
    but wasn't previously displayed. `printBatchApproved()` had **no**
    such box at all (dropped entirely during #56's rewrite, which only
    ported the score summary, not the attendance breakdown) — added the
    identical box there, computed the same way, so a batch-printed and a
    single-printed form for the same person now show consistent leave
    data instead of one having it and the other not. `exportIndividualSummary()`'s
    CSV (`สรุปผลประเมินรายบุคคล`) also had zero attendance columns —
    added late/early/sick/personal/absent columns sourced from the same
    `getAttendanceFor()` helper everything else in the file already uses,
    so the report reflects one real number per person, not a second,
    possibly-drifting computation of the same thing. Verified with tests
    covering all three: a fresh deployment falls back to `'2569'`
    honestly, saving after setting a real new cycle year uses that real
    value (not the old literal), two different cycles for the same
    employee/level coexist as separate records rather than overwriting
    each other, the acknowledge button appears/disappears/pushes
    correctly at each stage, `isFinalStatus()` correctly includes
    `Acknowledged`+`Approved` and excludes earlier stages, the employee
    email notification fires to the real address on file, and the batch
    print output contains the real leave-summary numbers.

61. **User asked to "review the approval system" against a full real
    workflow described in 5 numbered steps, ending with "if the system
    doesn't already work this way, adjust it to fit" — the real order
    was substantially different from what #58/#60 had just built: a new
    GM approval step inserted before employee acknowledgment, and
    Calibration moved from *before* acknowledgment to *after* it, with
    AMD/MD's final approval now the true last step, tied to a Payroll
    export.** Given the size of a wrong guess here (a full state-machine
    rebuild), asked 4 clarifying questions before touching code rather
    than assuming: (1) whether "L1 evaluates round one" means a second,
    separate score set or L1 editing/confirming the same self-eval score
    — confirmed the latter, so no new score-storage shape was needed;
    (2) whether "GM" is a genuinely new role distinct from L2/AMD-MD —
    confirmed yes, a real new role to add; (3) whether GM's approval and
    AMD/MD's final approval are two distinct real rounds — confirmed
    yes, GM approves first (before the employee ever sees a result),
    AMD/MD approves last (after Calibration, gating Payroll); (4) whether
    "enters the Payroll system" needs a real integration — confirmed no,
    this app has no salary data at all (CLAUDE.md #14), so a CSV export
    for HR to hand off manually is the honest scope.
    **The real pipeline is now**: `Draft → Submitted → L2Reviewed →
    GMApproved → Acknowledged → Calibrated → Approved` — `EVAL_STATUS_ORDER`
    reordered so `GMApproved`/`Acknowledged` sit *between* `L2Reviewed`
    and `Calibrated`, not appended after `Approved` the way #58 originally
    (and reasonably, at the time) placed the single `Acknowledged` stage
    it was told about. Restoring **`isFinalStatus(status)`** to mean
    literally `status==='Approved'` again (it briefly meant
    `Approved||Acknowledged` under #60's now-superseded ordering) was the
    correct fix, not a regression: with Calibration now happening *after*
    acknowledgment, only the AMD/MD sign-off is the real "done, ready for
    Excel/print/Payroll" state — printing or exporting payroll data off an
    Acknowledged-but-not-yet-Calibrated record would use a provisional
    number the same way #42 warned about a "final" push containing
    non-final data. Added a parallel **`hasVisibleResult(status)`**
    (`evalStatusRank(status) >= evalStatusRank('GMApproved')`) for the
    genuinely different question "does the employee have anything to see
    on their result page yet" — conflating these two meanings into one
    flag (the mistake #60 made, reasonably, before this reordering) is
    exactly the kind of "don't compare a multi-state status by one
    literal string for two different purposes" mistake CLAUDE.md #11
    already warns about, just one layer more subtle: here it was two
    *different concepts* hiding under one boolean, not one concept
    checked against the wrong literal.
    **New role `gm`** added everywhere role enumeration already existed
    in this file — `avMap`, `ROLE_DEFS`/`ROLE_PERM_LABELS` (new
    `gmApprove` permission), the `#roleSel` demo-view switcher, the
    `mu_role` Add/Edit Employee dropdown, `normalizeMs365Employee()`'s
    role-guess heuristic, `getAssignedEvalLevel()`'s role→form-level
    guess (`gm`→`mgr`, same tier as `l2`/`exec`/`admin`) — missing any one
    of these would have made `gm` a role that *exists* in the UI dropdown
    but silently breaks somewhere else, the same "define a role
    everywhere role logic branches" lesson #37 already encodes for the 6
    original roles. **`getMyScopedEmpCodes()` needed zero changes** — a
    role not explicitly handled there already falls through to
    `return null` (unrestricted/company-wide), which is the correct
    default for `gm` given there's no separate "GM chain" field in
    `MASTER_USERS` yet (only `l1`/`l2`/`approver`) — stated as a real,
    known limit in the new `renderGmApproveQueue()`'s comment: if the
    real org ever has multiple GMs who must each see only their own
    slice, a new hierarchy field (following the `populateSupervisorSelects()`
    pattern from #18) needs to be added and wired in, not assumed later.
    **Calibration's owner changed from L2 to HR** (`admin` role) per the
    user's step 5 — its nav `data-role` updated from `l2,exec` to
    `admin,exec` accordingly, and `l2` correspondingly lost visibility
    into that page (verified with a role-switch test: L2 no longer sees
    Calibration in the nav, Admin now does).
    **Reject targets were redesigned around "send back exactly one real
    stage," not the previous ad-hoc jumps**: `rejectGmSelected()` (new)
    sends `L2Reviewed → Submitted` (L2 must re-review); the existing
    `rejectApproveAll()` (AMD/MD's reject) changed its target from the
    old `L2Reviewed` (which used to skip backward across two stages,
    correct only under the old ordering) to `Acknowledged` — sending it
    all the way back to L2 under the new ordering would silently discard
    the employee's already-given acknowledgment for no reason; sending it
    back to Calibrated-input-stage (Acknowledged) is the minimal correct
    undo. `rejectReviewSelected()` (L2's reject, `Submitted → Draft`) was
    untouched — it's still the earliest real reject point.
    **The employee-notification email moved from `approveAllFinal()` to
    the new `approveGmSelected()`** — the whole point of GM approval in
    this workflow is "now it's ready to show the employee," so that's
    the real trigger point now, not final AMD/MD sign-off (which happens
    long after the employee has already acknowledged a provisional
    number). `approveAllFinal()` no longer emails the employee at all;
    it only signs, pushes, and reports readiness for the Payroll export.
    **Added `exportPayrollData()`** — a plain CSV of `isFinalStatus()`
    (i.e. truly `Approved`) records only, explicitly *not* wired to any
    real Payroll API or Excel table per the user's own answer that this
    app has no salary data and HR handles that hand-off outside the
    system; deliberately excludes Calibrated/Acknowledged/GMApproved
    rows since their X may still change before final sign-off, and using
    a pre-final number for pay would be a real, serious correctness bug
    — not just a display inconsistency like earlier fixes in this file.
    Verified the entire new pipeline end-to-end with one Playwright test
    that drives a single evaluation through all 7 real states in order
    (submit → L2 approve → GM approve queue shows it → GM approves →
    employee emailed → My Result shows the acknowledge button → employee
    acknowledges → HR Calibration queue shows it → HR calibrates with an
    adjusted score → AMD/MD approve queue shows it → AMD/MD approves →
    `isFinalStatus()` finally true → Payroll export fires) plus a
    separate role-permission test confirming GM/L2/Admin/exec each see
    exactly the nav pages their new real responsibilities call for.

62. **User asked point-blank where "which employees/departments are
    allowed to self-evaluate" is configured — investigated honestly and
    confirmed no such restriction existed anywhere in the codebase: any
    active employee code could open "ประเมินตนเอง" and get a form.**
    User then asked for it to be built: "ให้ admin sysmtem กำหนดว่าใคร
    หรือแผนกไหนที่ประเมินตนเองได้." Added a new admin-only settings page
    (`pg-evaleligibility`, nav item "🎯 สิทธิ์ประเมินตนเอง") and store,
    `EVAL_ELIGIBILITY` (`EVAL_ELIGIBILITY_KEY`, `localStorage`, mode
    `'all'` default so nothing changes for anyone until Admin explicitly
    switches to `'restricted'` — same default-safe-until-changed pattern
    as `NAV_PERMS`/`ROLE_PERMS`, #6). Two allow mechanisms, combined by
    OR: a checked set of แผนก/Section values (`depts[]`, populated from
    the same `getOrgMasterValues('sections')` list #51/#52 already
    established — never a separate hand-typed department list, per #3)
    and an individual employee-code allowlist (`emps[]`, for a one-off
    exception outside their department's setting) — `isEligibleForSelfEval(emp)`
    checks both. `admin`/`sysadmin` always return eligible regardless of
    mode, since they legitimately need to open any employee's form to
    check/configure it (the same reasoning `onEvalCodeGateChange()`
    already carves out for them per #23). Wired the actual enforcement
    into that same real chokepoint, `onEvalCodeGateChange()` — the one
    place every self-eval attempt already resolves the target employee
    by code before assigning a form level (#23) — checking eligibility
    immediately after resolving `emp` and, if ineligible, disabling
    every level button and showing a clear red message instead of
    silently continuing to assign a level; a settings page with no real
    caller wired in would have been exactly the CLAUDE.md #10 shape of
    bug (a feature that "looks" complete but has zero actual effect).
    **Caught and fixed a real latent bug while wiring this up**: the
    first draft of `addEvalEligibilityEmp()`/`removeEvalEligibilityEmp()`/
    `renderEvalEligibilityLists()` each called `loadEvalEligibility()`
    (which re-reads and overwrites the module-level store from
    `localStorage`) on every call — so adding one employee, then adding
    a second before clicking "บันทึกการตั้งค่า", silently discarded the
    first add: the second call's `loadEvalEligibility()` re-read the
    stale on-disk copy (still missing the first, unsaved add) and
    clobbered the in-memory object holding it. Fixed by having those
    three functions read/mutate the module-level `EVAL_ELIGIBILITY`
    variable directly instead of reloading from storage — only the page
    entry point (`renderEvalEligibilityPage()`, called once when the
    page is opened) still calls `loadEvalEligibility()`, which is the
    one place a fresh read from storage is actually correct. Verified
    with a test that stages two employee adds in a row before saving
    and confirms both survive (not just the second one overwriting the
    first). General lesson, a sharper case of CLAUDE.md #12: a "load
    from storage" helper is safe to call once when a page opens, but
    calling it again from every subsequent in-page mutation function
    silently discards whatever hasn't been explicitly saved yet — any
    multi-step "stage several changes, then one save button commits
    them all" UI must operate on one shared in-memory object between
    the load and the save, never reload from storage in between.

63. **A filter row on a list page is only real if every write path that
    re-renders that list re-applies the filter — a save/sync function
    that calls the bare `render*(MASTER_USERS)` instead of the page's own
    `filter*()` silently resets the view to "show everyone" the instant
    it runs, even though the filter `<select>`s still visibly show the
    values HR picked.** Reported as "เวลาแก้ไขพนักงานแล้วระบบไม่กรองตามที่
    เลือกไว้" (after editing an employee, the list stops respecting the
    selected filters) — `saveUserFromModal()` (and, found doing the same
    audit, `applyEmployeeSettingsRows()`'s MS365 pull and
    `loadEmployeesFromMs365()`'s wholesale employee-table sync) all
    called `renderUsers(MASTER_USERS)` directly after writing to
    `MASTER_USERS`, bypassing `filterUsers()` (the function the filter
    `<select>`s' own `onchange` already calls) entirely — so the on-screen
    filter controls kept their selected values, but the table underneath
    them silently reverted to the full unfiltered list the moment any of
    these three functions ran. Fixed by having all three call
    `filterUsers()` instead of `renderUsers(MASTER_USERS)` directly
    (`filterUsers()` itself calls `renderUsers()` with the filtered
    subset, so this is a strict superset of the old behavior, never a
    regression when no filter is set). The one call site left as
    `renderUsers(MASTER_USERS)` is deliberate: the one-time page-init
    `setTimeout` at the very top of this file, before any filter
    `<select>` could possibly have a non-default value yet. General rule
    this confirms, a sharper case of CLAUDE.md #3/#4 ("a filter needs a
    real event handler wired to real data"): a working `onchange` handler
    is not the whole story — grep every place that re-renders the same
    list after a data write (save, sync-from-Excel, bulk import) and
    confirm each one re-applies the filter function, not just the
    unfiltered render function underneath it, or the filter silently
    stops working the moment any of those other paths fires.

64. **Adding a new role (#61's `gm`) means grepping every place role logic
    branches — and the "สิทธิ์เข้าถึงเมนู (รายแถบ)" nav-permission editor
    on the Settings page turned out to be one more list #61 missed.**
    User's screenshot showed the editor's column headers as Admin/AGM-MD/
    ผจก.ส่วน/หัวหน้าแผนก/พนักงาน — no GM column at all, so sysadmin had no
    way to grant or revoke GM's menu access from this screen even though
    the `gmapprove` nav item itself already carries `data-role="gm,exec"`
    (#61) and is correctly gm-visible by default. The bug was
    `NAV_ROLES = ['admin','exec','l2','l1','emp']` (near the top of the
    NAV PERMISSIONS block) — a second, separate role-key array from
    `ROLE_DEFS`/`avMap`/etc. that #61's "add `gm` everywhere role
    enumeration exists" pass didn't catch, since it's defined much
    earlier in the file, well before the block '#61 was actively editing.
    Fixed by adding `gm` to `NAV_ROLES` and `NAV_ROLE_LABEL` (`'🏢 GM'`,
    matching the label already used in `#roleSel`/`mu_role`/`avMap`) —
    every other part of the editor (`renderNavPermEditor()`'s column
    generation, `saveNavPermsFromForm()`'s checkbox read-back) already
    iterates `NAV_ROLES` generically, so this one array was the only
    real fix needed. Verified with a test that confirms the GM column
    now renders, its checkboxes reflect `DEFAULT_NAV_PERMS` (built from
    each nav item's real `data-role`) correctly, and — the part that
    actually matters, not just that a checkbox exists — toggling GM's
    access to a page, saving, and switching the demo view to an actual
    `gm` user changes what that role can see, matching CLAUDE.md #4's
    "verify a control actually changes rendered output, not just that
    it exists in the DOM." General lesson sharper than #37/#61's own
    role-enumeration list: when a role is genuinely new, a single grep
    for one obvious constant (`ROLE_DEFS`, `avMap`) is not enough —
    search the whole file for every *independent* array of the 6-then-7
    role keys (`NAV_ROLES` here happened to predate and duplicate that
    same enumeration under a different name for a different subsystem)
    before considering a new-role rollout complete.

65. **User asked to add "หัวหน้าหน่วย" (Unit Leader) as a new role option
    in the Add/Edit Employee "บทบาท" dropdown. Asked two clarifying
    questions before touching code, since a wrong guess here means
    re-doing a role rollout twice (see #64's cost of missing even one
    array): confirmed it sits below หัวหน้าแผนก (L1), supervising a
    sub-team within the same department, and that it evaluates its own
    unit's members in round 1 the same way L1 evaluates its department.**
    That second answer is the key design fact: a unit head does exactly
    what an L1 does for round-1 team evaluation, just for a smaller
    group — so rather than inventing a new hierarchy column, the
    existing `MASTER_USERS[9]` field (documented as "หัวหน้า L1") is
    reused generically as "this person's real round-1 evaluator's name,"
    which every consumer of it (`renderTeamFromMaster()`'s
    `u[9]===managerName` filter, `getMyScopedEmpCodes()`'s `l1` branch)
    already matches purely by name, not by checking the supervisor's own
    role — so an employee whose `u[9]` holds a unit head's name, and a
    unit head whose own `u[9]` holds their real L1's name, both flow
    through the exact same code paths with zero changes to either
    function's filtering logic. Only the *lock/branch* conditions that
    explicitly checked `role==='l1'` needed a matching `role==='unit'`
    arm added alongside it: `getMyScopedEmpCodes()`, `getEvaluationAssignments()`'s
    missing-supervisor check (a unit head needs a real L1 above them,
    same requirement as a plain employee — `u[2]==='emp'` branch widened
    to `u[2]==='emp' || u[2]==='unit'`), `populateTeamManagerSelect()`'s
    lock-to-own-name branch, and `renderTeamFromMaster()`'s manager-name
    override guard. `getAssignedEvalLevel()` assigns `unit` the same
    `'ldr'` form tier as `l1` (CLAUDE.md #23), since a unit head fills
    out the same leader-level self-evaluation form.
    **Added `unit` everywhere role enumeration exists, learning directly
    from #64's miss**: `avMap`, `ROLE_DEFS`/`ROLE_PERM_LABELS` (same
    permission set as `l1`, since the responsibilities are identical at
    a smaller scope), `#roleSel` demo-view switcher, `mu_role` Add/Edit
    Employee dropdown, `U_ROLE_LABEL` (employee-list badge),
    `currentActorLabel()` (Audit Log actor display), `NAV_ROLES`/
    `NAV_ROLE_LABEL` (the nav-permission editor #64 just fixed — verified
    this time with a test that the new role's column and its real
    per-page checkboxes actually exist, not just assumed), the `team`
    nav item's `data-role` (added `unit` so a logged-in unit head can
    reach "2. ประเมินทีมงาน" at all — `myeval`/`myresult` need no change
    since those nav items carry no `data-role` attribute and are visible
    to everyone by default), and `normalizeMs365Employee()`'s role-guess
    heuristic (`roleRaw.includes('unit')`). **Also fixed a separate,
    pre-existing gap surfaced while auditing role enumeration for this
    change**: `getEvalParticipants()`'s role filter — the shared base
    for dashboard stats/9-Box/assignment counts — was still
    `['emp','l1','l2','exec','admin']`, missing `gm` entirely ever since
    #61 added that role (so GM users were invisible in every
    participant-derived count, a real gap #61's own rollout should have
    caught but didn't); widened to include both `gm` and the new `unit`
    in the same edit rather than leaving `gm`'s gap to be found as a
    seventh separate bug report later. Verified with a test that creates
    a synthetic unit head + one team member hung off a real L1, confirms
    the unit head gets the ldr-tier form, is correctly NOT flagged as
    missing a supervisor (their real L1 resolves correctly), their scope
    includes exactly their own unit member plus themselves and excludes
    unrelated employees, the team page locks their manager-select to
    their own name and shows their real report, the nav-permission
    editor's new column has a working checkbox, and the role-permission
    cards page renders the new role. General lesson combining #61/#64: a
    role added below an *existing* level rather than beside it can often
    reuse that level's existing hierarchy field and filtering logic
    entirely (no new `MASTER_USERS` column, no new Excel column) — the
    real work is finding every `role===` equality check for the level
    it's inserted next to and widening each one, plus grepping fresh for
    role-enumeration arrays rather than trusting the last rollout's list
    was complete (it wasn't, per the `gm`-in-`getEvalParticipants()` find
    here).

66. **"ใน Excel sheet AuditLog ไม่ update" (the AuditLog sheet in Excel
    isn't updating) traced to a `.catch(()=>{})` that swallowed the real
    reason completely — the same shape of silent failure CLAUDE.md
    #10/#19 already warn about, just harder to spot here because the
    call really does fire and really does hit the network; it just
    throws and nobody records it.** `pushAuditLogEntryToExcel()` (fired
    from `appendAuditLog()` on nearly every action, per #34) called
    `graphAddTableRow('AuditLog', ...).catch(()=>{})` — if the push ever
    failed for any real reason (the `AuditLog` table not actually
    existing in that Excel workbook, a Worker error, an expired token),
    the failure vanished with zero trace anywhere: no toast, no log
    entry, nothing — while every *other* action in the app (login, save,
    approve) still looked and felt completely normal, so there was no
    way for HR to even suspect something was wrong short of manually
    opening the Excel file and comparing row counts. `ms365SyncAuditLog()`
    (the pull side, #49) had the same gap one layer up: its `catch`
    block only toasted `if(!silent)`, but every *automatic* pull (login,
    page reload, opening the Audit Log tab — see #32/#33's silent-sync
    group) calls it with `silent=true`, so a broken pull failed exactly
    as invisibly as the broken push. Fixed both to call `appendSyncLog()`
    (the same sync-log panel every other MS365 push/pull function
    already writes to, on the MS365 settings page) on failure — success
    is logged too on the pull side, so a working sync and a failing one
    are now both visible in the same place instead of only the failure
    case being newly loud. Toasts are deliberately left unchanged (still
    only shown for a user-triggered, non-silent action) — the fix is
    giving the *silent* background path somewhere real to report to, not
    making every automatic sync interrupt the user with a popup.
    Verified with a test that fakes the exact real-world cause (the
    Worker throwing `"Table not found: AuditLog"`, which is what happens
    when the `AuditLog` table genuinely doesn't exist in the target
    Excel workbook) and confirms both the push failure and a *silent*
    pull failure now leave a real entry in the sync log. General lesson,
    a sharper case of #10/#19: `.catch(()=>{})` on a fire-and-forget push
    is correct for "don't let this block the main action," but it must
    never also mean "don't let this be knowable" — route every swallowed
    error to whatever diagnostic channel already exists (this file's
    sync log, in this case) rather than discarding it outright, or a
    real, fixable problem (a missing Excel table, an expired token) looks
    indistinguishable from "the code has a bug" to whoever reports it.

67. **"สายบังคับบัญชาแสดงให้ครบ" (show the full supervisor chain) —
    `supervisorChainLabel()`, the function behind the employee list's
    "สายบังคับบัญชา" column, only ever rendered `u[9]`/`u[10]` (L1/L2)
    and silently dropped `u[11]` (ผู้อนุมัติ) even though the column
    header only ever promised "L1 / L2" — every employee whose real
    chain includes a separate final approver (common for `l1`/`l2`-role
    rows per CLAUDE.md #22's own "l1 needs l2 OR approver" rule) showed
    an incomplete chain in this one list view, even though `MASTER_USERS[11]`
    held the real value the whole time and every other page in the app
    (Add/Edit Employee's `mu_approver` select, `getEvaluationAssignments()`)
    already used it correctly.** Fixed by adding the approver line to
    `supervisorChainLabel()` and updating the column header from
    "L1 / L2" to "L1 / L2 / อนุมัติ" so the header's own promise matches
    what's now actually shown (leaving the header stale here would have
    been the same CLAUDE.md #34/#49 trap — a UI label that no longer
    describes the code under it). Same shape of gap as #1/#18: a real
    field that exists and is correctly stored, just not surfaced
    everywhere it's displayed as "the chain."
    **Second half of the request — verify web-added data actually
    reaches Excel** — traced the real path (`saveUserFromModal()` →
    `pushSingleEmployeeToExcel(code)` → `EXCEL_EMPLOYEE_COLS`-mapped
    upsert, #27/#30) end-to-end with a test that intercepts the actual
    Excel-bound row: confirmed `l1`/`l2`/`approver` are read from the
    real `MASTER_USERS` values by field name (never a bare index, per
    #30) and land correctly in the pushed row, that a successful push
    is logged to the Sync Log, and — since #66 just fixed this exact
    class of silent failure for `AuditLog` — that a *failed* push here
    was already correctly visible in the Sync Log too (this function's
    `appendSyncLog()` calls on both branches predate #66 and were never
    swallowing errors to begin with, unlike `pushAuditLogEntryToExcel()`
    was). **What I could verify from code and what I could not**: the
    push mechanism itself is correct and every field (including the full
    supervisor chain) is included — but I have no access to the user's
    actual Excel workbook, so I cannot confirm a specific real employee's
    row is present there right now. Told the user plainly to check the
    Sync Log panel on the "ตั้งค่า → MS365 Excel Basic" page for any
    red/failed entries as the next real diagnostic step, rather than
    claiming "yes, it's definitely in Excel" without being able to see
    it — the same honesty rule CLAUDE.md #10/#19/#66 all apply to a
    different failure mode of the same underlying claim.

68. **User reported two things in one message: "ไม่มี sync ข้อมูลใน log"
    (nothing shows in the sync log at all) and "แก้ไขแฟ้มประวัติพนักงาน
    ไม่มี upขึ้น excel เลย" (editing an employee profile doesn't push to
    Excel at all) — then, while I was investigating, sent a screenshot
    of the real Excel "Master data" header row.** The screenshot was the
    actual fix: it showed a real "GM" column sitting between "หัวหน้า L2"
    and "ผู้อนุมัติ" that `EXCEL_EMPLOYEE_COLS` (#30's centralized column
    map) had never heard of — not a reordering this time, a genuinely
    *extra* real column the app didn't know existed at all. Every
    field read after L2 (`approver`/`status`/`potential`/`lastLogin`)
    was silently reading one column to the left of where it actually
    lives, and every push wrote one fewer column than the real table
    has — which is very plausibly why pushes were failing outright
    (a Graph/Excel table `rows/add`/`PATCH` call whose `values` array
    doesn't match the table's real column count can reasonably error),
    landing right on top of the "no sync log entries at all" report.
    Fixed by adding `'gm'` to `EXCEL_EMPLOYEE_COLS` at its real verified
    position, and adding `MASTER_USERS[19]` (`gm`) as a genuinely new,
    append-only field (CLAUDE.md #5 — never insert mid-array, since
    dozens of places already read `u[17]`/`u[18]` for pinHash/evalLevel
    directly by literal index and shifting either would silently break
    every one of them). `normalizeMs365Employee()` now sets `arr[19]`
    directly from the real Excel column on every sync (same treatment
    as `l1`/`l2`/`approver` — always read fresh, never merged from the
    old local record, unlike `pinHash`/`evalLevel` which genuinely are
    local-only and must be preserved across a sync per #17).
    `pushSingleEmployeeToExcel()`'s `byKey` now includes `gm: emp[19]||''`
    — without this, every push from the web app would have silently
    **blanked out HR's real GM column** in Excel the moment anyone
    edited any employee from the site, a real data-loss risk on top of
    the read-side corruption. `supervisorChainLabel()` (just extended in
    the previous fix to show the approver) now shows GM too, completing
    the same "show the full real chain" request with the newly-real
    field. **The separate "no sync log at all" report** was addressed by
    auditing every one of this file's 16 other `if(!isMs365Configured(cfg))
    return;` early gates (`ms365SyncKpiGoals`, `ms365SyncIdp`,
    `pushSingleEmployeeSettings`, `pushSingleEmployeeToExcel`,
    `pushOrgMasterFieldToExcel`, `ms365SyncOrgMaster`,
    `pushSystemStatusToMs365`, `pushApprovalRecordToExcel`,
    `ms365SyncApprovalSignatures`, `pushAuditLogEntryToExcel`,
    `ms365SyncAuditLog`, `pushFormWeightsToExcel`, `ms365SyncFormWeights`,
    `pushCycleSetupToExcel`, `ms365SyncCyclesList`, `ms365SyncCycleSetup`)
    — every one of them returned with zero trace anywhere if MS365
    wasn't considered configured, exactly the CLAUDE.md #66 shape of bug
    but one gate earlier than the fix #66 already applied (#66 only
    covered the *catch* block after the configured-check passed).
    Deliberately left `getGraphTokenSilent()`'s own gate alone — it's a
    low-level helper called from many read paths and logging every
    silent-read attempt would flood the sync log with noise, not signal.
    All 16 now call `appendSyncLog('<functionName>: ยังไม่ได้ตั้งค่า
    MS365', false)` before returning, so the *specific* failure reason
    (not configured, vs. a real network/Graph error, vs. success) is
    always distinguishable in one place going forward — verified with a
    test that forces `isMs365Configured` to fail and confirms the log
    entry appears (note: this could *not* be reproduced by clearing
    `MS365_CONFIG_KEY` in this test environment, since `loadMs365Config()`'s
    merge logic — #31 — always falls back to the real baked-in
    `DEFAULT_MS365_CONFIG` values, which are never empty; if this really
    is why the user saw an empty log, something in their browser's saved
    config must hold a genuinely non-empty-but-wrong override, which
    this fix makes newly diagnosable rather than fixing outright).
    General lesson combining #30/#66: a screenshot of the real external
    header row is worth more than any amount of code reasoning about
    what "should" be there — and once a silent-failure class of bug is
    found in one function (#66's `AuditLog`), grep for every sibling
    function sharing the same guard clause rather than assuming the one
    reported instance was the only one.

69. **Follow-up to #68: user confirmed "ไม่มีบันทึกขึ้น excel เลย ทุก sheet
    employee หรือ approvels" (literally nothing writes to Excel, on any
    sheet — Employee or Approvals) even after #68's fix. #68 only fixed
    the *not-configured* gate on 16 functions — it never checked whether
    each function's actual push call (the part that runs once MS365 IS
    considered configured) also logs failures, and four of them still
    had a bare `.catch(()=>{})` silently swallowing the real error,
    exactly the CLAUDE.md #66 shape of bug living one line further down
    in the same functions.** `pushApprovalRecordToExcel()` — the exact
    function behind the "Approvals" sheet the user named — pushed via
    `graphAddTableRow(...).catch(()=>{})` with zero success/failure log
    either way. `pushKpiToExcel()`/`pushIdpToExcel()`/`pushCycleToExcel()`
    had the same silent catch, *and* their not-configured gates used a
    combined condition (`if(!isMs365Configured(cfg) || !kpi || !kpi.id)
    return;`) whose exact text didn't match the literal string #68's
    fix-pass searched for (`if(!isMs365Configured(cfg)) return;`), so
    they were missed entirely by that pass — a mechanical find-and-fix
    is only as complete as the pattern it searches for, and a
    reasonable-looking extra `|| !kpi` guard was enough to hide these
    four from it. Fixed all four the same way as #66/#68's other pushes:
    log both success (`.then()`) and failure (`.catch(err=>...)`) to
    `appendSyncLog()`, and gave the three combined-condition gates their
    own explicit "ยังไม่ได้ตั้งค่า MS365" log entry, separated from the
    `!kpi`/`!p`/`!c` null-guard (which stays a silent early return — that
    case means "there's nothing to push yet," not a failure worth
    logging). Verified with a test that forces every one of these four
    push calls to throw and confirms each one now leaves a distinct,
    readable entry in the sync log — including `pushApprovalRecordToExcel`,
    directly addressing the user's named complaint. **What remains
    genuinely unverifiable from here**: if the real Excel workbook is
    still not receiving pushes after this, the sync log will now show
    the *actual* reason (a real HTTP/Graph error message from the
    Worker, not silence) — the next step is for the user to read that
    exact message off the Sync Log panel and report it back, since a
    systemic "nothing at all reaches Excel, on every table" symptom
    that survives this fix most likely points at the Worker itself
    (not deployed, deployed stale, or genuinely unreachable/misconfigured
    on the Cloudflare side) rather than anything left in this file's own
    push logic. General lesson sharper than #66/#68: when fixing a
    silent-catch bug via a mechanical multi-site pass, don't just grep
    for the exact string that reported the bug — grep for the *shape*
    (any `.catch(()=>{})` or `.catch(()=>...)` immediately following a
    `graphAddTableRow`/`graphUpsertTableRow` call) and check each one
    individually, since near-identical guard clauses with one extra
    condition tacked on are exactly the kind of near-miss an exact-string
    search silently walks past.

70. **User's screenshot of the Add/Edit Employee "สายการบังคับบัญชา" section
    showed only 3 fields labeled "หัวหน้า L1" / "ผจก.ส่วน L2" / "ผู้อนุมัติ"
    and asked for the real 4-level chain: หัวหน้าหน่วย L1, หัวหน้าแผนก L2,
    ผู้จัดการส่วน L3, GM L4 — "แก้ส่วนอื่นด้วยที่เกี่ยวข้อง" (fix the other
    related parts too).** The GM column had already been added to
    `MASTER_USERS[19]`/`EXCEL_EMPLOYEE_COLS` in #68 for the Excel
    round-trip, but — flagged as a known gap at the time — never got a
    real edit UI, so `emp[19]` was always empty in practice; every push
    to Excel was silently writing a blank GM cell regardless of what
    HR actually knew. This request is what finally closed that gap.
    Renamed the 3 existing labels to match the real 4-tier hierarchy
    (`mu_l1`→"หัวหน้าหน่วย (L1)", `mu_l2`→"หัวหน้าแผนก (L2)",
    `mu_approver`→"ผู้จัดการส่วน (L3)" — purely cosmetic, the underlying
    field ids/storage/semantics are untouched, so every consumer that
    branches on role — `getEvaluationAssignments()`'s #22 logic,
    `getMyScopedEmpCodes()`, evaluation-chain resolution — keeps working
    with zero changes) and added a real 4th field, `mu_gm`, following the
    *exact* same pattern #18/#29 already established for the other
    three: a code-entry `<input list="empCodeList">` + `<select>` pair,
    wired into `onSupervisorCodeInput('gm')`/`onSupervisorSelectChange('gm')`
    (both already generic by field-name suffix — zero changes needed
    there), `populateSupervisorSelects()`'s id list, `clearUserModalForm()`'s
    reset list, `fillUserFormFields()`'s `setSupervisor('gm', emp[19])`,
    and `saveUserFromModal()` reading `mu_gm` and appending it as the
    newly-real `gm` element of the saved row (never inserted mid-array,
    per #5 — `evalLevel` stays at 18, `gm` at 19). Also updated the two
    other places the same 3-field chain was displayed with the old
    labels and a missing GM column — the employee detail view (`udL1`/
    `udL2`/`udApprover` + new `udGM`) and the "ผังองค์กร" org chart
    table (added a `GM (L4)` column reading `u[19]`, relabeled the
    other three headers to match) — since a relabel in one place and not
    its siblings would just recreate CLAUDE.md #34's "two views of the
    same fact that disagree" trap in miniature. Left the CSV bulk-import
    template (`EMP_TEMPLATE_THAI`) and a few doc-comment/log-string
    mentions of the old 3-field names untouched for now — they're either
    plain documentation text with no functional effect, or would need a
    separate real column-count change to the import parser, which the
    user didn't ask for and is worth its own pass rather than folding in
    silently. Verified end-to-end with a test that fills all 4 fields
    on a synthetic new employee through the real form, saves, confirms
    all 4 land at their correct `MASTER_USERS` indices (9/10/11/19),
    reopening the edit form shows the saved GM value back, the detail
    view and org chart table both display it, and a (mocked) Excel push
    now actually carries the real GM value instead of the blank string
    every prior push would have sent. General lesson: when a field is
    added to a data model "for round-trip correctness" (#68's GM column)
    without also building its edit UI, treat that as an explicitly known
    half-finished feature, not a done one — the round-trip logic being
    correct doesn't help if nothing in the app can ever populate the
    field with a real value in the first place.

71. **User asked to flip #62's self-evaluation eligibility default: "default
    ทุกคนไม่มีสิทธิ์ประเมินตนเอง" — nobody can self-evaluate by default,
    the opposite of what #62 shipped ("ทุกคนประเมินได้" until Admin
    explicitly restricts).** This is a genuine exception to CLAUDE.md #6's
    usual rule that a `localStorage`-backed default must never change
    existing behavior — here the user explicitly asked for the default
    itself to change behavior immediately, opt-in instead of opt-out, so
    following #6 literally would have meant refusing the actual request.
    Flipped `EVAL_ELIGIBILITY`'s default from `{mode:'all',...}` to
    `{mode:'restricted', depts:[], emps:[]}` in all three places it's
    constructed (`let EVAL_ELIGIBILITY` module-level default,
    `loadEvalEligibility()`'s two fallback branches — no-stored-value and
    JSON-parse-failure) and swapped the `stored.mode==='restricted'?
    'restricted':'all'` merge check to `stored.mode==='all'?'all':
    'restricted'`, so an old saved config that explicitly chose `'all'`
    is still honored (never silently flipped out from under an Admin who
    deliberately opted back in), while anything else — no config, a
    corrupted value, a fresh deployment — now lands on `'restricted'`.
    `isEligibleForSelfEval()` itself needed zero changes: its
    `cfg.mode !== 'restricted'` early-return-true branch already only
    fires for the non-default `'all'` case, so the moment the default
    became `'restricted'`, the function correctly started requiring a
    real department/employee match (or `admin`/`sysadmin`, which still
    always bypasses) with no logic change at all — a case of #62's
    original design already being agnostic to which mode was "default,"
    it just happened to default the safer way this time. Relabeled the
    `<select>`'s two `<option>`s (moved "(ค่าเริ่มต้น)" from ทุกคนประเมิน
    ได้ to จำกัดเฉพาะแผนก/รายบุคคล) and the page's own description text
    so the UI's own claim about what the default is matches the code
    (the CLAUDE.md #34/#49/#67 trap in miniature — this is exactly the
    kind of label the earlier fixes taught to keep in sync). Verified
    with a test simulating a completely fresh deployment (no
    `localStorage` key at all): a regular employee is now blocked at the
    real `onEvalCodeGateChange()` chokepoint with a clear message,
    admin/sysadmin still bypass, the settings page's mode selector and
    visible options area both default to "restricted" on open, and after
    Admin explicitly checks a department and saves, that department's
    employees become eligible — the full opt-in flow working end to end,
    not just the default flag itself. **Real operational consequence
    worth stating plainly, not silently**: shipping this means every
    employee at every company using this deployment loses self-eval
    access the moment it goes live, until Admin visits "🎯 สิทธิ์ประเมิน
    ตนเอง" and grants departments/people — there is no migration step
    that "keeps everyone who could self-eval yesterday able to today,"
    because the entire point of the request was to stop assuming that.

72. **"ไม่ตรง กำหนดบทบาทแล้วยังเข้าได้หมด" (doesn't match — even after
    setting a role, they can still access everything) — the user's
    screenshot showed a real logged-in `l2` employee's "มุมมอง (Demo UI)"
    dropdown wide open, listing every role from Admin ระบบ down to
    พนักงานปฏิบัติการ, freely selectable.** This was a real, serious gap
    in every scoping fix this file has ever shipped (#45's
    `getMyScopedEmpCodes()`, #61/#64/#65's per-role nav visibility,
    #62/#71's eligibility gate) — all of them branch on
    `CURRENT_SESSION_USER`'s role or on whatever `setRole()` was last
    called with, and `#roleSel`'s `onchange="setRole(this.value)"` had
    **zero restriction on who could change it or to what** — so any
    real employee, L1, L2, or GM who happened to notice the dropdown
    could self-select "Admin ระบบ (Super Admin)" and instantly see every
    admin-only nav page and queue, completely defeating every scoping
    rule those other fixes built. The dropdown's own label already says
    "สาธิต UI เท่านั้น — สิทธิ์จริงคุมที่ SharePoint permission" (UI demo
    only, real permission is at SharePoint) and #17/#45 already
    documented the *intent* — "admin/sysadmin can use it to preview other
    roles' screens without losing their own access" — but the intent was
    never actually enforced in code; the `<select>` was simply always
    interactive for whoever was logged in. Fixed in `applySession()`
    (the one real chokepoint both `doLogin()` and `tryRestoreSession()`
    already funnel through — #32): right after setting `roleSel.value`
    to the real logged-in role, set `roleSel.disabled = !['admin',
    'sysadmin'].includes(u[2])` — every other role's dropdown is now
    genuinely `disabled` (browser blocks direct interaction with it, not
    just cosmetically greyed), while admin/sysadmin keep the free
    preview switch #45 always intended for them. **Same client-side
    caveat as PINs (#17): this is a UI convenience lock, not real
    security** — nothing stops someone from calling `setRole('admin')`
    directly from DevTools regardless of `roleSel.disabled`, exactly the
    same limit #17 already states plainly for the PIN gate; real data
    access is still and only ever controlled by SharePoint/Graph
    permissions on the Worker side, never by this dropdown. What this
    fix actually closes is the *casual* path — a real employee simply
    clicking through the dropdown's own visible options and landing on
    a page they were never supposed to reach through the normal UI, no
    developer tools required, which is exactly what the user's
    screenshot showed happening. Verified with a test logging in as a
    real `l2`/`emp` (dropdown ends up disabled, locked to their own
    role, an admin-only nav page like "รายการหลัก" stays hidden) and as
    `admin`/`sysadmin` (dropdown stays enabled, preserving the
    legitimate preview use case). General lesson: a role-based scoping
    system is only as strong as the one place that sets "which role is
    currently active" — if that control point (here, one `<select>`)
    isn't itself gated by the real logged-in identity, every downstream
    scoping check built on top of it (however many turns of careful
    per-role fixes) is decoration a curious user can walk straight past.

73. **User's screenshot showed the "ผังองค์กร & พนักงาน" page — while
    previewing as "ผู้จัดการส่วน" (L2) via the now-locked-down Demo UI
    switcher (#72, admin/sysadmin only) — listing all 51 company
    employees and a hierarchy-issue banner counting company-wide
    problems (25 items, 15 missing-L1, 10 circular refs): "เห็นข้อมูล
    กำหนดเห็นเฉพาะ ที่เตือนของหน่วยตนเองเท่านั้น" (sees [all] data;
    should be configured to see only warnings for their own unit).**
    `renderOrg()`/`checkHierarchyIssues()` were the one real page CLAUDE.md
    #45's scoping sweep never reached — every other evaluation-workflow
    page (dashboard, review/calib/approve, report, myresult) already runs
    through `getMyScopedEmpCodes()`, but the org chart page (nav-gated
    `data-role="admin"`, so unscoped company-wide access was reasonable
    when only Admin could ever open it) had zero scoping, and once #72
    made the Demo UI preview switch actually trustworthy, an admin using
    it to check "what would an L2 see here" surfaced that this specific
    page still showed everyone regardless of the previewed role. Fixed
    by filtering inside `renderOrg(data)` itself — `const scoped =
    getMyScopedEmpCodes(); if(scoped) data = data.filter(u=>scoped.has(u[0]))`
    — rather than touching each of its 3 call sites individually
    (`filterOrg()`, the nav dispatcher, an MS365 sync callback all pass
    raw `MASTER_USERS` or a locally-filtered subset through `renderOrg()`,
    so scoping once inside it covers every caller automatically, the same
    "fix scope at the one base function" lesson #45 already states).
    Also updated the page's own `#orgTotalCount` header (the "N คน" text
    directly above the table) to read from the scoped `data.length`
    instead of the unscoped `MASTER_USERS.length` a dashboard-render
    function happened to set on the same shared element id — leaving
    it unscoped would have shown "51 คน" as the header while the table
    beneath it visibly showed fewer rows, the same "two things claiming
    the same fact disagree" trap #34/#67 already warn about.
    `checkHierarchyIssues()` needed the more careful fix: `byName` (used
    to walk each employee's real supervisor chain) still indexes *all*
    of `MASTER_USERS`, never filtered — a chain legitimately passes
    through people outside the viewer's own scope on its way up to the
    org's top, and cutting `byName` down to the scoped subset would have
    broken the walk itself, silently reporting false circular-reference
    negatives. Only the two *output* lists (`noL1`, and which `start`
    values get walked for `circular`) are filtered by `scoped.has(u[0])`
    — the walk itself always has the full real org graph to traverse,
    just the *results* are scoped down to "problems belonging to people
    I can see." Verified with a test that seeds two synthetic
    missing-supervisor employees, one inside a real L2's chain and one
    outside it, and confirms the L2-scoped banner reports exactly 1 issue
    while the admin (unscoped) banner reports 2 — not just "fewer rows
    render," the actual counted numbers are provably scope-correct, not
    coincidentally smaller. General lesson combining #45/#72: a scoping
    sweep across "every evaluation-workflow page" can still miss a page
    that was reasonably left unscoped *at the time* because nav access
    already gated it to admin-only — the moment any other mechanism
    (here, a newly-trustworthy role-preview switch) can put a
    lower-privilege viewer's identity in front of that page, its
    render function needs the same scoping treatment as everything else,
    even if its nav item's `data-role` alone still looks sufficient.

74. **`doLogin()`/`tryRestoreSession()` each `await` a chain of 8-12 sequential
    silent MS365 syncs (Employees, EmployeeSettings, Attendance, KpiGoals,
    CycleSetup, CyclesList, FormWeights, Idp, AuditLog, OrgMaster,
    Appraisals, ApprovalSignatures — the same chain #32/#33/#58 built up
    piece by piece) before the dashboard is usable — with zero visible
    feedback the whole time, so clicking "เข้าสู่ระบบ" (or simply reloading
    a page with an active session) looked exactly like the app had frozen
    for several real seconds.** User asked directly: "ปรับหน้า login แล้ว
    จะเข้าระบบให้แจ้งเตือน ระบบกำลังโหลด ก่อนเข้าหน้าใช้งาน" (adjust the
    login page so entering the system shows a "system is loading"
    notice before reaching the usage page). Added a real full-screen
    loading overlay, `#loginLoadingOverlay` (siblings `.login-loading`/
    `.login-loading-box` CSS matching the existing `.login-gate` look,
    a CSS-only spinner, no extra library), toggled by one new helper,
    `setLoginLoading(show, msg)`. `doLogin()` now shows it immediately on
    click (guarded behind a real "รหัสพนักงานว่างเปล่า" check first, so an
    accidental empty-field click doesn't spin the whole overlay for
    nothing) and hides it on every real exit path — a rejected code, a
    missing/wrong PIN, and the success path after `applySession()` — so a
    login that fails partway through never leaves the overlay stuck up
    forever, the same "every exit path must undo what a happy-path
    assumes" instinct as CLAUDE.md #55's PIN double-confirm. `tryRestoreSession()`
    (the page-reload path, which already shows the dashboard immediately
    with stale data per #32 before quietly re-syncing) shows the same
    overlay right after that first `applySession()` call — so a page
    reload with an active session briefly shows the real dashboard behind
    a "กำลังโหลดข้อมูลล่าสุด..." overlay while the fresh sync completes,
    rather than either a frozen blank screen or a dashboard that silently
    updates numbers out from under the viewer mid-glance — and hides it in
    a `finally` block so a thrown error partway through the sync chain
    (already swallowed by the outer `try/catch` per the function's
    existing design) can never leave the overlay stuck on screen. Verified
    with a Playwright test that stubs out all real Graph/Worker network
    calls (none are reachable in a test environment) so each sync's own
    `catch` fires fast instead of hanging on a real network timeout, adds
    an artificial delay to the first sync call to catch the overlay
    genuinely mid-flight (not just flashing for one frame), and confirms
    it is hidden before any login attempt, visible while the sync chain is
    still running, and hidden again once login completes with the
    dashboard visible. General lesson: any user-triggered action that
    `await`s a long, invisible chain of background work before the UI
    changes needs a loading state shown for the actual duration of that
    chain, not just a spinner on the button itself (this button doesn't
    even show one) — and that loading state must be torn down on every
    real code path that can end the operation, success or failure alike,
    or it becomes a new "looks frozen" bug in its own right.

75. **User screenshotted the Dashboard while genuinely logged in (own PIN,
    not Demo UI preview) as a real `l2` employee showing all 50 company
    participants and full company-wide workflow-step counts — "เข้าแล้ว
    เห็นข้อมูลทั้ง ต้องเห็นแค่ที่ตนเองดูเท่านั้น" (logs in and sees
    everything, should see only their own).** This looked exactly like
    #73's gap (a page CLAUDE.md #45's scoping sweep missed) — but tracing
    it found the opposite: `renderCycleStats()` (the Dashboard's real
    render function) already calls `getEvalParticipants()`, which already
    runs every row through `getMyScopedEmpCodes()` (#45), and `l2`'s
    branch there (`MASTER_USERS.filter(u=>u[10]===myName)`) is exactly
    correct code — verified again with a fresh Playwright test seeding a
    synthetic second L2 with their own smaller team and confirming the
    scoping helper alone returns only that L2's own people, not the whole
    file. Before touching any code, asked the user two clarifying
    questions rather than guessing: (1) is this account truly a real L2
    login or an admin previewing via the now-locked Demo UI switcher
    (#72)? — confirmed real L2 login, ruling out the #72 preview-vs-real
    distinction entirely; (2) if the scoping code is provably correct,
    does the company genuinely have only one L2 overseeing everyone (in
    which case 50/50 would be the *correct* real answer, not a bug), or
    are there multiple real L2s who should each see only their own slice?
    — confirmed multiple real L2s exist, so 50 people all showing this
    one L2's name in their `MASTER_USERS[10]` ("หัวหน้าแผนก (L2)") field
    is itself wrong *data*, not wrong *code*. **No code change was made
    for this report** — the scoping logic (#45, re-verified here) is
    correct and already shipped; the real defect is that every employee's
    real L2-supervisor value, wherever it currently lives (manually
    entered via Add/Edit Employee's `mu_l2` field, or synced in from the
    real Excel `Employees` table's L2 column per #30/#68), needs
    correcting at the source so each employee's `u[10]` actually names
    their own real department's L2, not this one person's name company-
    wide. Told the user plainly: check the "หัวหน้าแผนก (L2)" value on a
    handful of employees who should NOT report to her (via an Admin
    account's employee list "สายบังคับบัญชา" column, #67) to confirm
    which employees are mis-tagged, and correct those either directly in
    Add/Edit Employee or in the source Excel sheet before the next sync.
    General lesson sharper than #67/#69's own "I can't see your live
    Excel" honesty rule: when a report looks identical in shape to a
    known class of bug (unscoped data leaking, #45/#73's exact symptom),
    re-verify the specific code path with a fresh test *before* assuming
    history repeats — a scoping helper that is definitely correct, fed
    genuinely wrong upstream data, produces the exact same visible symptom
    as a scoping helper that never ran; only checking both halves (code
    AND the specific data feeding it) tells you which one actually needs
    fixing, and shipping a code "fix" for a data problem would have done
    nothing while looking like it addressed the report.

76. **"แก้ไข template พนักงาน upload ด้วย ข้อมูลไม่ครบ" (fix the employee
    upload template too, data is incomplete) — `EMP_TEMPLATE_HEADERS`/
    `EMP_TEMPLATE_THAI` (the downloadable Import template, and the doc
    table inside the "📄 Template โหลดข้อมูลพนักงาน" modal) still had only
    the original 14 columns from before #68/#70 ever existed: no
    `start_date`/`email`/`potential` at all, and the supervisor chain was
    still the old 3-level `l1`/`l2`/`approver` with zero GM column —
    exactly the real, verified 17-column order `EXCEL_EMPLOYEE_COLS`
    (#30/#68) already establishes for the live Excel sheet, just never
    propagated to this template.** Concretely this meant anyone filling
    in the template had **no column to type a new hire's start date,
    email, potential rating, or GM into at all** — not a display gap,
    a genuine missing input field, so a bulk-prepared employee sheet
    could never carry that data into the app even if HR wanted it to.
    Fixed by rebuilding both arrays to the real 17-field order (`emp_code,
    full_name, role, group, section, division, department, position,
    start_date, email, grade, l1_unit_head, l2_dept_head, gm,
    approver_division_mgr, status, potential`) with the #70 hierarchy
    labels (หัวหน้าหน่วย L1 / หัวหน้าแผนก L2 / GM L4 / ผู้จัดการส่วน L3),
    the modal's own inline column-reference table (`mEmployeeTemplate`),
    and the "Import พนักงานจาก Excel" modal's short inline hint text —
    three separate places that would otherwise have drifted out of sync
    with each other and with the code the same way CLAUDE.md #34/#49/#67
    already warn a stale doc claim eventually does. Deliberately did
    **not** add `pinHash`/`evalLevel`/`lastLogin` as import columns — per
    #17/#23/#30 these are local/settings values, never real columns in
    the Employees sheet, and adding them here would just recreate the
    exact "template implies a column that doesn't really exist" trap in
    the opposite direction; added an explicit warning box saying so.
    **Also removed a dead placeholder found while fixing this**: the
    modal's "กำหนดรหัสผ่านเริ่มต้น" (set default password) dropdown
    (`employeePasswordMode`) was never read by any function at all — a
    leftover from before this app had a real PIN-based login (#17), the
    same shape of dead control `mu_pass` was in before #17 replaced it.
    Replaced it with an honest note that this app has no password
    concept, and a freshly-imported employee has no PIN until Admin
    explicitly sets one via "ตั้ง/รีเซ็ต PIN" (#47).
    **A bigger, separate gap surfaced while checking "ส่วนอื่นที่เกี่ยวข้อง"
    (other related parts) — flagged plainly here rather than silently
    fixed or silently ignored**: the "Import พนักงานจาก Excel" button's
    whole flow is itself a CLAUDE.md #10 placeholder end-to-end.
    `previewEmployeeImport()` only echoes the picked filename back with a
    generic "จะตรวจ Header, รหัสซ้ำ, ..." message — it never actually
    reads the file's contents. `validateEmployeeImport()` unconditionally
    toasts "ตรวจสอบเบื้องต้นผ่าน — พร้อม Preview / Confirm Import" the
    moment *any* file is selected, whether it's a real employee CSV, an
    unrelated PDF, or an empty file — and **there is no "Confirm Import"
    function anywhere in this file at all**: no code path ever parses an
    uploaded employee file and writes rows into `MASTER_USERS`. This is
    architecturally the same "looks like a real action, isn't" shape as
    #19's old `ms365SyncAttendance()` bug, just never fixed for this
    feature at all — fixing the *template's columns* (this request) does
    not make the *upload button* functional, since nothing downstream of
    it ever reads those columns back out of a real file. Left unbuilt
    deliberately rather than guessed at: a real bulk-import parser needs
    its own scoped pass (duplicate-code rejection per #2, org/role/grade
    validation against `getOrgMasterValues()`/`ROLE_DEFS` per #3/#51, a
    real preview table before commit per #9's "never silently overwrite"
    instinct, and a push to Excel per #27 for every imported row) — told
    the user this plainly and asked whether they want it built as a
    follow-up, rather than shipping a half-working parser under a
    "template fix" request that never asked for one.

77. **Follow-up to #76: user said "ทำได้" (go ahead) to the flagged gap —
    built the real bulk-import parser that `previewEmployeeImport()`/
    `validateEmployeeImport()` never had.** `previewEmployeeImport()` now
    actually reads the uploaded file (reusing the same encoding-detection/
    delimiter-detection helpers `importHrgoFile()` already established —
    UTF-8 with a Windows-874 fallback for Thai Excel mojibake, comma/
    semicolon/tab auto-detect, machine-header + optional Thai-label-row
    skip), parses every row against the real `EMP_TEMPLATE_HEADERS` order
    (#76), and validates each one — missing code/name, a duplicate code
    *within the same file* (CLAUDE.md #2's "reject/report, never silently
    accept" rule extended from `importHrgoFile()` to this importer too),
    an unrecognized `role`/`status` value — flagging each bad row with
    its specific reason rather than a generic failure. Renders a real
    preview table (`renderEmployeeImportPreview()`) marking every row
    ➕ เพิ่มใหม่ / 🔄 จะอัปเดต / ❌ ข้าม *before* anything is written, per
    CLAUDE.md #9's "never silently overwrite" instinct — an existing
    employee code is treated as an update-in-place (matching how
    `saveUserFromModal()`'s own edit path works), never a silent
    duplicate or a blind overwrite with no visibility into what changed.
    The "ตรวจสอบข้อมูล →" button (previously `validateEmployeeImport()`'s
    fake-success toast) is now `confirmImportEmployees()`: writes each
    non-skipped row into `MASTER_USERS` at the correct field indices
    (matching `EXCEL_EMPLOYEE_COLS`'s verified order, #30/#68 — a new
    employee's `pinHash`/`evalLevel`/`lastLogin` are left honestly empty
    rather than fabricated, since nothing about a bulk-imported row can
    know those per CLAUDE.md #14), `await`s `pushSingleEmployeeToExcel()`
    per row (#27) so every imported employee round-trips to Excel the
    same way a manual Add/Edit save already does, then refreshes every
    downstream consumer that #3/#50/#63 already established needs a
    refresh after `MASTER_USERS` changes — `populateUserFilters()`,
    `populateGradeOptions()`, `populateEmpCodeDatalist()`, and (per #63's
    own lesson) `filterUsers()` rather than a bare `renderUsers()` call,
    so the employee list's on-screen filters don't silently reset the
    moment a bulk import runs. Deliberately did **not** validate
    supervisor names (`l1`/`l2`/`gm`/`approver`) against existing
    `MASTER_USERS` rows — this matches how `normalizeMs365Employee()`
    already treats the same fields on an Excel sync (#18's real
    `<select>` validation only applies to the manual Add/Edit form, not
    a bulk data feed) and avoids rejecting a legitimate same-batch import
    where a person and their new supervisor both arrive in the same
    file. Verified with a Playwright test importing 3 rows in one file —
    an existing employee (update, confirms name/email actually change in
    place), a brand-new code (add, confirms it lands with the correct
    role and an honestly-empty PIN, not a guessed one), and a row with an
    invalid role string (confirms it's flagged in the preview with the
    specific reason and never written to `MASTER_USERS` or pushed to
    Excel) — plus the standard click-sweep. General lesson: when a #10
    "does nothing real" finding is flagged for the user rather than
    fixed outright, and they say yes, build it — the finding note itself
    (validation list, "never trust a positional guess," "must round-trip
    to Excel") is the scope specification; implement exactly that list,
    not a smaller or differently-shaped feature.

78. **User's screenshot showed "วันเริ่มงาน" (start date) rendering as a
    raw number, "41519", instead of a real date, for one employee synced
    from Excel — "เวลาดึงข้อมูลใน excel แล้วไม่แสดง" (pulling data from
    Excel, it doesn't show).** Root cause: the real Excel "Employees"
    sheet has that column formatted as an actual **Date-typed cell**, not
    plain text — and the Graph API workbook-table-rows endpoint
    `graphListTableRows()` reads from returns a Date-typed cell's raw
    value as an **Excel serial date number** (days since 1899-12-30,
    Excel's epoch), not a pre-formatted date string. `normalizeMs365Employee()`'s
    `g('startDate')` just did `String(v).trim()` on whatever came back —
    for a text-formatted date cell that's already the real string (most
    employees' rows, which is why this bug wasn't caught for everyone),
    but for a Date-formatted cell it's the literal serial number, which
    got stored into `MASTER_USERS[14]` and displayed completely raw.
    Same root shape as CLAUDE.md #30's "the external system's real
    column layout is a fact from the field, not something to assume" —
    here it's not the column *position* that was wrong, it's the column's
    *cell type*, one layer the app never accounted for. Fixed with
    `excelSerialDateToThaiString(raw)`: returns `null` for anything that
    isn't a pure numeric string (so a real "16/07/2559" text value, an
    empty cell, or a "—" placeholder all pass through untouched, never
    misread as a serial number — CLAUDE.md #14's "don't fabricate/don't
    misinterpret a value" applies to over-eager parsing too, not just
    invented values), and for a genuine serial number converts it via the
    real Excel epoch (`serial - 25569` days from Unix epoch, since Excel
    serial 25569 = 1970-01-01) into the same `D/M/YYYY` (Buddhist year)
    format `thaiDateToIso()` and every other date field in this file
    already expects — `normalizeMs365Employee()` now tries this
    conversion first and only falls back to the raw text if conversion
    doesn't apply, so a text-formatted date cell keeps working exactly as
    before while a Date-formatted one finally renders as a real date
    instead of a meaningless number. Applied the identical guarded
    conversion to the employee bulk-import parser's `startDate` field
    too (#77) — the same failure mode is just as possible if someone
    prepares the import CSV by copy-pasting out of Excel and a date cell
    gets exported as a raw serial number instead of formatted text.
    Verified with a test confirming the exact reported serial (`41519`)
    converts to the correct real date (`2/9/2556`), a value with a
    trailing `.0` (another common Excel/Graph quirk) still converts, an
    already-correct text date is never mistaken for a serial number and
    passed through unchanged, and empty/placeholder values correctly
    return `null` rather than a fabricated date. General lesson beyond
    #30: an external system's real *shape* to verify against isn't just
    column order — a spreadsheet's per-column **cell type** (text vs.
    Date vs. number) changes what an API returns for that cell, and a
    parser that only handles one shape (plain text) will work for most
    rows and silently misrender the rows where someone formatted that
    one cell differently — the fix generalizes to any other Date-typed
    Excel column this app might read in the future (never assume every
    date-looking column always arrives as pre-formatted text).

79. **User's screenshot showed the employee list's "บทบาท" (role) filter
    dropdown — "บทบาทแสดงไม่ครบ มีตำแหน่งที่เพิ่ม" (roles don't show
    completely, there are positions that were added) — missing both `gm`
    and `unit` entirely, only listing the original 6 roles.** This is
    the exact CLAUDE.md #64/#65 shape of miss happening a third time:
    `#filterRole` (the employee list's own role filter, separate from
    `#roleSel`'s Demo UI switcher, `mu_role`'s Add/Edit dropdown, and
    `NAV_ROLES`'s nav-permission editor — all of which #61/#64/#65
    already updated) was yet another independent hardcoded role-option
    list that neither rollout's "add the new role everywhere role
    enumeration exists" pass ever found, since it sits on a different
    page (`pg-settings`'s employee list toolbar) from where either
    rollout was actively working at the time. Fixed by adding `🏢 GM`
    and `🧭 หัวหน้าหน่วย` options in the same hierarchy order the other
    role lists already use (`NAV_ROLE_LABEL`'s admin→exec→gm→l2→l1→unit→emp
    ordering), and relabeling `l1`'s option from the generic "หัวหน้า" to
    "หัวหน้าแผนก" to match every other list's wording for that role.
    Verified with a test that seeds a synthetic `gm` employee and a
    synthetic `unit` employee, confirms both appear as real selectable
    options in `#filterRole`, and — matching CLAUDE.md #4's "verify a
    control actually changes rendered output" rule rather than just
    checking the option exists — confirms selecting each one actually
    filters the visible employee list down to just that role, not only
    that the `<option>` tag is present in the DOM. **General lesson
    sharper than #64's own conclusion**: "grep every independent array of
    role keys" is necessary but not sufficient when a role list is
    spelled out as inline `<option>` tags in the HTML rather than a named
    JS array/constant — a plain-text search for the *role key* (`gm`,
    `unit`) across the whole file, not just for constant-looking names
    like `ROLE_DEFS`/`NAV_ROLES`, is the only way to catch every one of
    these; after this fix, grepped `value="l1"` (a role every one of
    these lists always includes) across the whole file one more time to
    confirm no further such list remains missing `gm`/`unit` alongside it.

80. **User asked "Sync HRIS คืออะไร" (what is Sync HRIS) about the org
    chart page's toolbar button — investigated honestly and confirmed it
    was another CLAUDE.md #10 placeholder: `onclick="smlToast('Sync HRIS
    อยู่ในโหมด Demo — พร้อมเชื่อม API ภายหลัง','info')"`, no real
    integration with any HRIS system exists anywhere in this codebase
    (the app's one real external data source is MS365/SharePoint Excel,
    a completely different, already-working feature).** Told the user
    plainly, then asked whether to build a real integration, relabel it
    to say so clearly, or remove it — they chose to remove it for now.
    Deleted the button outright from the org chart page's toolbar (kept
    "📄 Template พนักงาน" / "⬆️ Import พนักงาน" / "＋ เพิ่มพนักงาน", all
    real per #76/#77) rather than leaving a fake action sitting next to
    working ones, per this project's standing convention of deleting
    code known to be unused/fake rather than leaving it as clutter (see
    #48's removal of the duplicate "ผู้ใช้งานล่าสุด" table for the same
    reasoning). Left the matching `actionByText()` dispatcher line
    (`t.includes('Sync HRIS')`) alone — it's one line inside a large
    generic text-matching fallback for demo buttons elsewhere in the
    file, harmless as dead code and not worth touching on its own since
    no button text triggers it anymore. If a real HRIS integration is
    ever wanted later, treat it as a new feature from scratch (decide
    which real HRIS system, what data it would exchange, and whether it
    needs a Worker-side integration the same way MS365 did per #25) —
    don't resurrect this placeholder's wording as if the groundwork for
    it already exists, since none of it currently does.

81. **User's screenshot of the 🔔 notification dropdown showed a warning
    item overlapping the "การแจ้งเตือน" header with the panel's body
    barely visible — "แถบแจ้งเพื่อแสดงไม่ครบมองไม่เห็น" (the notification
    bar shows incompletely, can't see it).** Traced this by reproducing
    at a narrower viewport (the original screenshot's cropped, partial
    topbar was the tell that it was a narrower window, not the full
    desktop width every other test in this file uses) — confirmed
    `#notifPanel`'s fixed `right:-10px; width:320px` CSS, anchored to the
    🔔 bell which sits near the far-right edge of the topbar, pushed the
    panel's **left edge past the left edge of the browser viewport**
    (measured `rect.left` as negative) whenever the window wasn't wide
    enough — the panel wasn't broken or empty, roughly a third of its
    real width was simply rendered off-screen and unreachable, matching
    the user's own description exactly. A pure-CSS `max-width` fix alone
    doesn't solve this shape of problem — the panel already fits *within*
    the viewport's total width, the issue is *where* it's anchored
    relative to a bell that itself sits close to the screen's edge — so
    fixed `toggleNotifPanel()` to clamp the panel's position at open time
    instead: reset to `right:0` first, then (once actually rendered, via
    `requestAnimationFrame` so `getBoundingClientRect()` reads the real
    laid-out position) check whether `rect.left` is less than an 8px
    safety margin and, if so, shift the panel rightward by exactly enough
    (`right: -(8 - rect.left)px`) to bring its left edge back on-screen.
    Verified with a test across four real viewport widths (480px/375px
    mobile-ish, 1024px/1400px desktop) confirming the panel's full
    bounding box stays within `[0, viewportWidth]` at every one of them,
    not just the widths this file's other tests happen to already use.
    Also fixed a smaller, related issue noticed while investigating:
    `.notif-item`'s text `<span>` had no `min-width:0`/`word-break`, so a
    long notification (the exact kind this panel exists to show — "พบ
    ปัญหาสายบังคับบัญชา N รายการ") could refuse to wrap inside a flex
    row and push the item wider than the panel itself; added
    `min-width:0;word-break:break-word;white-space:normal` to the text
    span so long messages wrap inside the panel's fixed width instead of
    overflowing it. General lesson: this file's whole test suite (click-
    sweep, every per-fix Playwright test) runs at a single comfortable
    desktop viewport width by convention — that's fine for confirming
    logic and data correctness, but a screenshot report of "something
    doesn't display right" is itself a signal to try reproducing at the
    viewport size the screenshot actually implies (narrow window, mobile,
    a collapsed sidebar) before assuming the bug must be in render logic
    rather than layout/positioning that only breaks at a size nobody
    tests at by default.

82. **Follow-up to #81: user confirmed a normal desktop/laptop browser at
    normal width, and that a hard refresh changed nothing — meaning
    #81's viewport-clamping fix was real but was never the actual root
    cause of the visible symptom.** Re-reproduced at full 1440px desktop
    width (not narrow) and finally pinpointed the exact element at the
    red pill's own pixel coordinates via `elementFromPoint()`: it was the
    **notification item's own text `<span>`**, with a real computed
    `background-color: rgb(199,53,53)` (`--err`/`--sml-danger`) and
    `position:absolute; top:-3px; right:-5px; font-size:9px` — none of
    which `.notif-item span:last-child` (#81's own new rule) ever sets.
    Root cause: `.bell span{position:absolute;top:-3px;right:-5px;
    background:var(--err);...}` (a much older rule, styling the small red
    unread-count badge `#notifBadge`) selects **every `<span>` anywhere
    inside `.bell`**, not just its intended one direct-child badge span —
    and since `#notifPanel` (with its `#notifList` → `.notif-item` →
    `<span>` icon/text pair) is itself nested *inside* `#notifBell`
    (`class="bell"`) in the DOM, every notification item's own two spans
    silently inherited the tiny-absolute-red-badge styling too. This is
    the exact CLAUDE.md #15 shape of bug (`.up`'s dropzone/trend-text
    collision) one layer more indirect: not two rules both explicitly
    targeting one shared class name, but one rule's descendant selector
    (`.bell span`) silently widening its reach the moment a new, larger
    subtree (the whole notif panel) was added as a *descendant* of the
    element that selector was written against, years after the selector
    itself was written for a single-purpose badge. Fixed by narrowing
    the selector to `.bell > span` (direct-child combinator) — `#notifBadge`
    is a literal direct child of `.bell` so it's unaffected, while
    `.notif-item`'s spans (several levels deeper) no longer match at
    all. Verified by re-running the exact `elementFromPoint()` probe at
    the same pixel coordinates the red pill previously occupied — it now
    resolves to the ordinary `.notif-panel-head` div with a transparent
    background, and a full-page screenshot confirms the notification
    list renders normally inside the panel with real dark text, no
    stray red pill anywhere. #81's viewport-edge clamp fix is left in
    place — it's a real, independently-valid fix for a real (if
    secondary) narrow-window issue — but it was never going to resolve
    this report on its own, which is why the user kept seeing the exact
    same thing after a hard refresh. **General lesson, a sharper case of
    #15**: when a generic descendant selector (`X span`, `.card *`, etc.)
    is written while its target element has only one simple child, it
    silently becomes a landmine the moment anything else is later nested
    inside that same ancestor — before writing `.container span{...}`-
    style rules, prefer a direct-child combinator (`.container > span`)
    or a real class on the intended target unless deliberately styling
    every descendant is the actual goal; and when a user reports the
    same visual symptom as still-present *after* a fix that looked
    correct and was verified computationally, re-derive the element at
    the reported pixel location itself (`elementFromPoint`) rather than
    trusting a `querySelector('.likely-culprit')` guess, since the guess
    can easily hit a different, coincidentally similar-looking element
    while the real offender sits one CSS specificity layer away.

83. **User asked "จะแยกยังไงถ้ามีกลุ่มบางคนไม่ต้องประเมิน" (how to separate a
    group who don't need to be evaluated) — my first answer explained the
    wrong feature entirely: `EVAL_ELIGIBILITY` (#62/#71) governs whether
    someone is *allowed to self-evaluate* (fill out their own round-1
    form), not whether they should ever *receive* an evaluation at all.
    User corrected: "หมายถึง ไม่ต้องได้รับการประเมินจากใคร เพราะเป็น
    ผู้บริหาร หรือกำหนดพิเศษ หรือบุคคลที่ลาออกไปแล้ว" — three real
    categories: executives, an individually-designated special case, and
    already-resigned staff.** Investigated `getEvalParticipants()` (the
    one real chokepoint feeding the dashboard, 9-Box,
    `getEvaluationAssignments()`, and — after adding it here —
    `getReportData()`) before writing any code: resigned staff were
    already fully excluded (`u[12]==='active'` only), but `exec`/`admin`
    roles were unconditionally counted as needing evaluation, and there
    was no mechanism anywhere for an individual "special case" exemption
    — building one from scratch was required, not a config toggle that
    already existed. Rather than hardcode "exec role is always exempt"
    (too broad — some companies do want their execs evaluated, and
    `admin`/`sysadmin` accounts are often just system/IT logins that
    were already borderline), added a single **per-employee** exemption
    flag instead, which covers all three of the user's named categories
    with one mechanism: `MASTER_USERS[20]` (`evalExempt`, `'1'`/`''`,
    append-only per CLAUDE.md #5 — the newest field after `gm` at [19]),
    a real checkbox "ยกเว้นไม่ต้องรับการประเมิน (ผู้บริหาร / กรณีพิเศษ /
    ไม่นับเป็นผู้เข้าร่วมรอบประเมิน)" in the Add/Edit Employee modal
    (wired into `saveUserFromModal()`/`clearUserModalForm()`/
    `fillUserFormFields()` the same way `mu_evallevel` already is), and
    `getEvalParticipants()`/`getReportData()` both now also filter out
    `u[20]==='1'`. HR ticks it per person (an executive, or literally
    anyone HR designates a one-off exception for) rather than the app
    guessing from role — resigned employees keep being excluded
    automatically via the pre-existing status check, so this checkbox
    only needed to cover the two categories that had no existing
    mechanism. Treated as **local-only, like `pinHash`/`evalLevel`**
    (#17) rather than a real Excel column — there's no confirmed real
    "evalExempt" column in HR's actual sheet (unlike `gm`, which #68
    only added after a real header-row screenshot, per #30's "verify
    against the field, never assume" rule) — so `loadEmployeesFromMs365()`
    re-merges `r[20] = old?.[20] || ''` from the existing local record on
    every sync, the same re-merge CLAUDE.md #17/#6 already require for
    every local-only override field, or the next Excel sync would
    silently un-exempt everyone. Added a small "🚫 ยกเว้นประเมิน" badge
    under the Status column in the employee list so an exempted person
    is visible at a glance, not just discoverable by opening their edit
    form one at a time. Verified with a test that seeds a fresh active
    `exec` employee (confirmed counted before), ticks the new checkbox
    through the real Add/Edit form and saves (confirmed no longer
    counted in `getEvalParticipants()`), reopens the edit form to confirm
    the checkbox state round-trips correctly, un-ticks it to confirm the
    person is counted again, and confirms a resigned employee is excluded
    regardless of the flag — plus the standard click-sweep. General
    lesson: when a user's own wording ("ไม่ต้องประเมิน") is genuinely
    ambiguous between two real, differently-scoped features already
    documented in this file (self-eval permission vs. being an
    evaluation subject), don't assume the first plausible match — a
    one-line follow-up from the user ("หมายถึง...") can reveal the
    intended concept has no existing mechanism at all, meaning the real
    work is designing a new field, not pointing at a settings page that
    already exists.
    **Follow-up in the same request**: user's screenshot was actually of
    the "ผังองค์กร & พนักงาน" (org chart) page, not the plain employee
    list — pointed out "คนที่ติ๊กแล้วหน้านี้ต้อง update ด้วย" (the page
    with the people I ticked needs updating too). `renderOrg()` (a
    separate render function from `renderUsers()`, #73's own scoping
    fix) hadn't gotten the same "🚫 ยกเว้นประเมิน" badge under its Status
    column — added it there too, verified with a test that seeds an
    exempted employee and confirms the badge renders in this specific
    table. General reminder from #34/#67/#73: this file has more than
    one table that displays "the employee list" (the Settings-page user
    list and the org-chart page are two separate render functions over
    the same data) — a UI change requested against a screenshot needs
    checking against every render function showing that same data, not
    just the first/most obvious one.

84. **User's screenshot of "เลือกหัวหน้า" on the "2. ประเมินทีมงาน" page
    showed "นายอาทิตย์ ภูแล่นคู่" appearing as two separate, visually
    identical options — "ทำไมมี 2 อาทิตย์" (why are there 2 Atid).**
    First hypothesis (two genuinely different real employees sharing the
    same real name) was ruled out with a test: `populateTeamManagerSelect()`
    builds its option list through `new Set(...)`, which already collapses
    two *identical* name strings into one option — confirmed with a
    seeded test (two different employee codes, same exact name, each
    with their own team) that the dropdown correctly shows only 1 option
    for that name (though it does then silently merge both people's
    teams under that one option, a separate and much rarer edge case,
    not what this report was — noted here, not fixed, since a genuine
    same-name collision needs a structural fix per #18's supervisor-by-
    code limitation, out of scope for a two-extra-options report).
    The real mechanism, confirmed with a second seeded test: `Set`
    dedup only collapses **exactly identical strings** — a manager's
    name stored with a trailing space on one employee's L1 field
    (`u[9]`, e.g. `"นายอาทิตย์ ภูแล่นคู่ "`) and without on another's is,
    character-for-character, a *different* string, so `Set` treats them
    as two distinct managers even though they render pixel-identical in
    a `<select>`. Every other place that writes this field already
    `.trim()`s (`saveUserFromModal()`'s `name` field,
    `normalizeMs365Employee()`'s `g()` helper, the bulk-import parser's
    `parseEmployeeImportRow()`), so this is very likely stale data from
    before one of those trim fixes existed, or a one-off manual Excel
    edit — not a currently-active write path. Rather than chase the
    exact historical write that produced it (unfixable without seeing
    the live sheet, per CLAUDE.md #67/#75's honesty limits), added a
    defensive `.trim()` at the one place that's cheap and permanent to
    fix regardless of root cause: `populateTeamManagerSelect()` now
    trims every name (both the `l2` branch's `u[1]` and the default
    branch's `u[9]`) before building the `Set`, and `renderTeamFromMaster()`'s
    `u[9]===managerName` filter now compares `.trim()`ed values on both
    sides — so a stray space on either the option-building side or the
    stored-report side can no longer produce a duplicate-looking option
    or, worse, silently exclude a real direct report whose `u[9]` has a
    whitespace variant of the selected name. Verified with a test that
    seeds two managers of the same name differing only by a trailing
    space and confirms the dropdown now shows exactly one option, then
    a second test selecting that option and confirming direct reports
    stored under *either* the trimmed or untrimmed spelling both appear
    in the resulting team list (not just whichever spelling happened to
    be selected). General lesson: `Set`-based dedup on user/Excel-sourced
    text is only as good as the normalization applied *before* the Set
    — even when every current write path trims, a UI list built from
    that data should defensively trim again at read time, since older
    rows written before a trim fix existed (or a manual edit outside the
    app) can still carry the untrimmed variant indefinitely.

85. **User's screenshot showed the exact CLAUDE.md #45/#73/#75 symptom in a
    place none of those passes ever reached: logged in as a real L2 with
    genuinely zero L1s under her, the "2. ประเมินทีมงาน" page correctly
    showed "— ไม่มีหัวหน้าที่มีลูกทีม —" and 0/0/0 stat tiles, but the nav
    sidebar's own red badge next to that same menu item showed "31," and
    "3. สอบทาน L2" showed "4" — two places claiming the same fact
    disagreeing, per #34/#67/#73's own trap.** Root cause: `renderNavBadges()`
    — the function driving every one of the 5 red nav badges
    (`navBadgeTeam`/`Review`/`Gm`/`Calib`/`Approve`) — counted straight
    from `MASTER_USERS`/`getDrafts()` with **zero** call to
    `getMyScopedEmpCodes()`, even though every one of the 5 pages those
    badges sit next to (`renderTeamFromMaster()`, `renderReviewQueue()`,
    `renderGmApproveQueue()`, `renderCalibQueue()`, `renderApproveQueue()`)
    has been correctly scoped since #45/#58/#61. `getMyScopedEmpCodes()`
    itself was already correct and already used everywhere else — this
    was a case of the *summary* (badge count) and the *detail* (page
    table) being computed by two independent pieces of code that only
    one of them remembered to scope, the same shape of gap #73 found for
    the org chart page (a real render path CLAUDE.md #45's original sweep
    never reached because nothing about it looked like a data table).
    Fixed by adding the identical `getMyScopedEmpCodes()` filter
    `renderNavBadges()`'s own base functions already use — an `inScope()`
    helper applied to `teamPending`'s `MASTER_USERS` filter and to
    `drafts` before any of the 4 status-count filters run — so all 5
    badges are now counted from the exact same scoped subset the pages
    themselves render from, not company-wide totals. Verified with a
    test that seeds a real L2 employee with zero real L1 reports (the
    user's own reported scenario) and confirms every badge that would
    have shown a nonzero company-wide count now correctly shows nothing
    (`display:none`, matching the 5 pages' own genuinely-empty state) —
    plus the standard click-sweep. General lesson combining #45/#73/#75:
    a scoping sweep across "every page that reads this data" is not the
    same as "every *piece of UI* that reads this data" — a badge, a
    header count, a sidebar number, or any other summary widget sitting
    next to a scoped page needs the exact same scope check independently
    checked, since it's very often computed by its own separate function
    that a page-by-page review can walk right past.

86. **User's screenshot of "3. สอบทาน L2" showed a real logged-in L2
    (นางสาวโชสิญา ดานเรื่อง) with zero rows and "ไม่มีใบประเมินรอสอบทาน" —
    "ทำไมไม่มีลูกน้องเลย ไม่ตรงกับ excel" (why is there no team at all, it
    doesn't match Excel).** #84's own investigation (found the same day,
    same dataset) already surfaced a whitespace data-quality issue on a
    name field one function over (`populateTeamManagerSelect()`'s manager
    dropdown) — the same shape of bug turned out to live in the far more
    consequential place: `getMyScopedEmpCodes()` itself, the one real
    access-control chokepoint feeding the Dashboard, Review, GM-Approve,
    Calibration, Approve queues, and the Report/Export page (#45's own
    base function). Its `l1`/`l2` branches compared `u[9]===myName`/
    `u[10]===myName` as **exact, untrimmed strings** — if the logged-in
    L2's own stored name (`CURRENT_SESSION_USER[1]`) carries a stray
    trailing space (very plausible on this exact dataset, given #84 just
    found the identical shape of stale/manually-edited name data), or if
    an L1's `u[10]` field pointing up to her has one, the comparison
    silently fails and `getMyScopedEmpCodes()` returns an **empty** Set
    instead of `null` (unrestricted) — every scoped page then correctly,
    faithfully renders "no one," which reads exactly like "the data isn't
    there" when the real employees are sitting right there in Excel, just
    matched against a name string that doesn't quite equal what's stored
    locally. Fixed by trimming both sides of both comparisons
    (`(u[9]||'').trim()===myName`, `(u[10]||'').trim()===myName`, and
    `myName` itself now computed as `(me[1]||'').trim()`) — the exact
    same defensive-trim treatment #84 just applied to
    `populateTeamManagerSelect()`, just at the one place that actually
    controls who can see what, not just a dropdown's display. Verified
    with a test that seeds an L2 whose own name has a trailing space and
    an L1 whose `u[10]` points to the clean (trimmed) spelling of that
    same name — confirming `getMyScopedEmpCodes()` now correctly includes
    that L1 instead of returning an empty scope — plus the standard
    click-sweep. **Left as a real, stated limit**: this fix only closes
    the *whitespace* variant of the mismatch; if the L2's real name in
    `MASTER_USERS` and her reports' stored supervisor name disagree on
    more than whitespace (a typo, a nickname vs. legal name, a stale
    value from before she was renamed in Excel), the scope will still
    come back wrong — that's a data-correction problem at the source
    (Add/Edit Employee or the Excel sheet itself), the same honest
    boundary #75 already drew for a similar-looking symptom, not
    something a client-side trim can paper over. General lesson sharper
    than #84's own conclusion: when one name-matching bug is found and
    fixed in one function, immediately check `getMyScopedEmpCodes()`
    itself for the identical assumption — it is the single highest-
    leverage place in this file for this exact class of bug, since an
    empty Set there doesn't just mislabel one dropdown, it makes an
    entire approval chain look like it has no data at all.

87. **Follow-up screenshot on the same "3. สอบทาน L2" report (#86): the
    page's own table now correctly showed 0 rows, but the 🔔 notification
    bell — opened in the screenshot — still said "มีใบประเมิน 4 รายการ
    รอสอบทานขั้นที่ 2," the exact company-wide number the page itself no
    longer shows.** This is the *third* independent function in one day
    found with the identical unscoped-summary shape #85 first named:
    `getNotifications()` counted straight from `getDrafts()` with zero
    call to `getMyScopedEmpCodes()`, even though `renderReviewQueue()`
    (the page under it) and `renderNavBadges()` (the sidebar badge next
    to it, #85) were both already scoped. Fixed the same way: filter
    `drafts` through `getMyScopedEmpCodes()` before counting `Submitted`/
    `L2Reviewed`/`Calibrated` for the three real notification lines.
    Left two other lines in the same function deliberately unscoped —
    the hierarchy-issues count already calls `checkHierarchyIssues(false)`,
    which scopes itself internally (#73), so re-filtering it here would
    double-apply scope incorrectly; and the "รอ Push เข้า Excel" count is
    an admin/system concern about the local→Excel sync queue, not a
    team-visibility question, so it stays company-wide (consistent with
    the `ms365` nav page itself being admin-gated). Verified with a test
    that seeds a real L2 with zero reports and a `Submitted` draft
    belonging to an employee *outside* her scope, confirming
    `getNotifications()` now returns zero items instead of surfacing that
    outsider's submission — plus the standard click-sweep. **General
    lesson, now stated three times over (#73/#85/#87): a single scoping
    sweep never actually reaches every consumer of `getDrafts()`/
    `MASTER_USERS` — this file has at minimum three independent "count
    the same drafts" implementations (the page's own render function, the
    nav badge, the notification bell), and grep for every bare
    `getDrafts()`/`MASTER_USERS.filter` call site whenever a scoping bug
    is found in one of them, since the other two are reliably still
    there** — the next time a scoping report comes in about a number
    that doesn't match a table right next to it, check all three of
    these by name before assuming the fix from #85/#86 already covered it.

88. **User asked point-blank whether `getMyScopedEmpCodes()` had been
    updated to match the real 4-tier hierarchy relabeling from #70
    (หัวหน้าหน่วย L1 / หัวหน้าแผนก L2 / ผู้จัดการส่วน L3 / GM L4) — "ส่วนนี้
    ปรับหรือยัง" (has this part been updated yet).** Checked carefully
    before answering, since #70 explicitly documented its relabeling as
    *cosmetic only* — "the underlying field ids/storage/semantics are
    untouched" — meaning the real stored meaning of `u[9]`/`u[10]`/`u[11]`
    hadn't changed just because #70 renamed their Add/Edit Employee form
    labels: `u[9]` (round-1 evaluator, shared by `unit`+`l1` roles per
    #65), `u[10]` (the `l2`-role supervisor, correctly scoped already),
    `u[11]` (the flexible "approver" chain field, not tied to one
    specific role) were all already correctly wired into
    `getMyScopedEmpCodes()`'s `l1`/`unit`/`l2` branches with no gap.
    **The real, confirmed gap was `role==='gm'`**: #61 (when the `gm`
    role was first added) deliberately left it falling through to
    `return null` (unrestricted/company-wide) with an explicit comment
    stating *why* — "no separate GM chain field in `MASTER_USERS` yet…
    if the real org ever has multiple GMs who must each see only their
    own slice, a new hierarchy field needs to be added and wired in, not
    assumed later." That was true when #61 wrote it — but #68 added the
    real `u[19]` GM field for the Excel round-trip, and #70 gave it a
    real Add/Edit Employee edit UI, so the exact missing piece #61
    flagged has existed since #70 and nobody circled back to actually
    wire the scoping. Added a `role==='gm'` branch to
    `getMyScopedEmpCodes()` — same pattern as `l1`/`unit`/`l2`, filters
    `MASTER_USERS` by `(u[19]||'').trim()===myName` (trimmed per #86's
    lesson, applied from the start this time rather than needing a
    follow-up fix) — so a GM logged in now sees only their own division
    across every scoped page/badge/notification this file has (#45's
    `getEvalParticipants()`, #85's nav badges, #87's notification bell,
    the review/GM-approve/calibration/approve queues, report/export).
    Also updated `renderGmApproveQueue()`'s own comment, which still
    literally said "getMyScopedEmpCodes() คืน null ให้ role 'gm' โดย
    อัตโนมัติ" — the exact CLAUDE.md #34/#49/#67 trap of a comment
    describing code that no longer matches, left stale right next to the
    fix that made it stale. Verified with a test that seeds two real GMs
    each with their own section-manager report (`u[19]` pointing to a
    different GM's name) and confirms `getMyScopedEmpCodes()` for GM 1
    includes only GM 1's own report and GM 1 themselves, excluding GM
    2's report entirely — plus the standard click-sweep. **What did NOT
    need changing, stated explicitly since the user's question covered
    the whole hierarchy**: `l1`(→L2 label)/`unit`(→L1 label)/`l2`(→L3
    label)'s scoping branches were already correct before this fix —
    only `gm` had a real, dormant gap. General lesson: when a comment in
    the code explicitly names *what would need to exist* for a limit to
    be lifted ("if X field is ever added"), that's a standing TODO — the
    moment a later fix (#68/#70) actually adds that named field for an
    unrelated reason (Excel round-trip, an edit form), grep back for the
    comment that named it and close the loop, rather than leaving the
    dependent fix to be found as a separate bug report later.

89. **User's screenshot of the employee list's "สายบังคับบัญชา" column
    showed the header promising "L1 / L2 / GM / อนุมัติ" but every row's
    actual lines appeared as GM *first*, then อนุมัติ — "สายบังคับบัญชา
    เรียงไม่ถูกต้อง กลับไปเช็ทุกจุด" (the chain is ordered wrong, go check
    every spot).** Root cause: `supervisorChainLabel()` pushed `gm`
    (`u[19]`, the real L4 field) into its output *before* `approver`
    (`u[11]`, the real L3/"ผู้จัดการส่วน" field) — backwards, since GM is
    the *top* of the 4-tier hierarchy #70 established (L1 หัวหน้าหน่วย →
    L2 หัวหน้าแผนก → L3 ผู้จัดการส่วน → L4 GM), not a mid-chain step
    before the section manager. This happened because `gm` was added to
    the function in #67/#68 as a straight append to the existing
    `l1`/`l2`/`approver` line-building code — correct per CLAUDE.md #5
    for the *array index* (`u[19]` appended after `u[11]`, never
    inserted mid-array), but that rule governs storage position, not
    display order, and nobody separately checked whether appending the
    new `lines.push()` call in the same relative spot also produced the
    right *reading* order. Fixed by reordering the `lines.push()` calls
    to L1 → L2 → L3(`approver`) → L4(`gm`), relabeling the approver line
    from bare "อนุมัติ" to "L3" and the GM line to "L4 (GM)" so every
    line now carries its real tier number, and fixing the column header
    from "L1 / L2 / GM / อนุมัติ" to "L1 / L2 / L3 / GM (L4)" to match.
    **Checked every other spot showing this same chain, per the user's
    "ทุกจุด" ask, before assuming this was the only one**: the employee
    detail view (`udL1`/`udL2`/`udApprover`/`udGM`, #70) and the org
    chart page's table header (`หัวหน้าหน่วย (L1)` → `หัวหน้าแผนก (L2)` →
    `ผู้จัดการส่วน (L3)` → `GM (L4)`, line 2206) were both **already
    correct** — only `supervisorChainLabel()`'s combined-line rendering
    had the bug. The bulk-import template (`EMP_TEMPLATE_HEADERS`/
    `EMP_TEMPLATE_THAI`, #76) also lists `gm` before `approver_division_
    mgr` — checked this deliberately rather than assuming it needed the
    same fix, and confirmed it's *correct as-is*: that column order
    mirrors `EXCEL_EMPLOYEE_COLS` (`...,'l1','l2','gm','approver',...`),
    the real screenshot-verified order of HR's actual Excel sheet per
    #68/#30 — a raw data-import template's column order must match the
    real external system it imports from, not an idealized hierarchy
    reading order, so reordering it to "look right" would have broken
    the real file format HR already has. `parseEmployeeImportRow()`
    (#77) reads `g(13)`=gm/`g(14)`=approver consistent with that same
    real order, so no data was ever mis-parsed — this was purely a
    *human-facing display* ordering bug, never a storage or import
    correctness one. Verified with a test that builds a synthetic
    employee with distinct L1/L2/L3/L4 names and confirms
    `supervisorChainLabel()`'s output places them in the correct
    L1→L2→L3→L4 reading order — plus the standard click-sweep. General
    lesson sharper than #5's own statement: "append-only" is a rule
    about *array index stability* (never insert mid-array, so existing
    index-based reads don't break) — it says nothing about *display
    order*, which is a separate, independent thing to get right every
    time a new tier is added to an existing chain-rendering function,
    and a raw data-interchange format (an import template mirroring a
    real external spreadsheet) is exempt from "should read in hierarchy
    order" entirely, since its job is to match what already exists
    outside this app, not to be intuitive to a human skimming it.

90. **User's screenshot of the Dashboard while logged in as a real non-admin
    "ผู้จัดการส่วน" (L2) showed a "📢 ส่ง Reminder" button sitting right next
    to the cycle selector — "หน้าแรกที่ไม่ใช่ admin ไม่ควรมี remider หรือ
    เปล่า" (shouldn't the non-admin homepage not have this Reminder
    [button]).** Investigated and confirmed: the button
    (`onclick="openM('mReminder')"`) had **zero role gating of any kind** —
    no `data-role`, no visibility check, nothing — unlike nav items which
    already use `data-role` and unlike `#roleSel`'s Demo UI switcher which
    #72 already locked to admin/sysadmin. Every logged-in role saw and
    could click it. Worse than a plain display bug: the modal's own
    `getReminderTargets()` (which powers both the preview counts and the
    actual send) reads straight from `MASTER_USERS`/the local draft
    queue with **no `getMyScopedEmpCodes()` call at all** — the exact
    unscoped-summary shape #45/#73/#85/#87 already found in four other
    places in this file — so a non-admin who opened it could see, and
    mass-email via the real `mailto:` bcc send (#10's honest email
    channel), the *entire company's* pending-evaluation list, not just
    their own team. This is a real HR/Admin action (bulk-notifying people
    to submit evaluations), not something an individual L1/L2/GM manager
    should trigger for the whole org. Fixed at the one real chokepoint,
    `applySession()` (same pattern as #72's `roleSel.disabled` line
    immediately above it): added `id="reminderBtn"` to the button and
    `reminderBtnEl.style.display = ['admin','sysadmin'].includes(u[2]) ?
    '' : 'none'` right after the `roleSel` lock, so the button is now
    genuinely hidden (not just cosmetically disabled) for every role
    except admin/sysadmin — the same two roles `getReminderTargets()`'s
    unscoped, company-wide read is actually appropriate for. Verified
    with a test logging in as a real L2, an admin, and a plain employee
    in sequence and confirming the button's computed `display` is `none`
    for L2/employee and `flex` for admin — plus the standard click-sweep.
    **Left `getReminderTargets()`'s own unscoped read unchanged** rather
    than also adding `getMyScopedEmpCodes()` scoping inside it: once the
    button itself is admin/sysadmin-only, and both those roles are
    deliberately unrestricted in `getMyScopedEmpCodes()` already (#45),
    scoping the function itself would be a no-op for its only remaining
    caller — worth stating plainly rather than leaving as an implied
    "also fixed," since a future new role gaining access to this button
    would need that scoping added at that point, not assumed already
    present. General lesson combining #72/#87: a page-header action
    button (not a nav item, so it never had a `data-role` attribute to
    check) is just as easy to leave completely unrestricted as a nav
    page or a summary badge — when a bug of this exact shape (unrestricted
    company-wide access/data) is found once in a nav item (#72) and twice
    more in summary widgets (#85/#87), the next place to check is any
    other clickable control sitting outside the nav system entirely, since
    "not a nav page" was never itself a reason it was ever safe to leave
    ungated.

91. **User's screenshot of "สอบทานขั้นที่ 3 (ผู้จัดการส่วน L2)" showed the
    header "เลือกทั้งหมด" checkbox ticked but every individual row checkbox
    below it unticked — "เลือกตีกลับแล้วไม่เกิดอะไรขึ้น เช็คปุ่มการทำงาน
    ด้วยและแถบอื่นที่เกี่ยวข้อง" (selected and clicked reject, nothing
    happened — check the button and related tabs too).** Root cause:
    `renderReviewQueue()`/`renderGmApproveQueue()` rebuild their `<tbody>`'s
    entire `innerHTML` on every call — and both pages are wired into
    `startEvalAutoSync()` (#59), which calls `ms365SyncAppraisals(true)` →
    `renderWorkflowPages()` **immediately on page entry and again every 30
    seconds** for as long as the page stays open. Rebuilding `innerHTML`
    replaces every `<input class="review-chk">`/`<input class="gm-chk">`
    with a brand-new, unchecked element — while the header "select all"
    checkbox (in `<thead>`, never touched by the rebuild) keeps whatever
    state the user last clicked it to. So the real sequence was: user
    clicks the header checkbox → every row ticks → the 30-second auto-sync
    (or, worse, the very first sync fired the instant the page was
    entered) fires and silently wipes every row checkbox back to unticked
    while the header stays visibly ticked → user clicks "ตีกลับที่เลือก"
    → `getCheckedKeys('review-chk')` correctly finds zero checked rows and
    does nothing (a small `smlToast` warning does fire, but it's easy to
    miss and reads exactly like "nothing happened"). This is a genuinely
    new failure mode, not a repeat of #85/#87's unscoped-summary shape —
    those were *missing* scope filters; this is a *live re-render*
    silently discarding in-progress user input that #59's own auto-sync
    feature introduced as a side effect nobody checked for at the time.
    Fixed with `restoreCheckedKeys(cls, checkedKeys)`: both render
    functions now capture `getCheckedKeys(cls)` into a `Set` **before**
    rebuilding `innerHTML`, then re-tick every surviving row whose
    `draftKey()` is still in that set immediately after — a row that
    disappeared from the queue entirely (already acted on from another
    device) simply isn't re-ticked, which is correct, not a bug. Checked
    every other queue page (`renderCalibQueue()`/`renderApproveQueue()`)
    for the same shape — they don't use a per-row checkbox selection
    model at all (Calibration uses a per-row number `<input>` read
    directly by `data-key` at click time, not a persisted "selected"
    boolean; Approve has no selection UI, it's "อนุมัติทั้งหมด" acting on
    the whole visible queue) so neither one was ever exposed to this
    exact failure mode — confirmed by reading both functions rather than
    assuming from the shared `startEvalAutoSync()` wiring alone. Verified
    with a test that ticks a row, force-calls the render function again
    (simulating the 30s auto-sync tick) to confirm the checkbox survives,
    then clicks the real reject button and confirms the draft's status
    actually changes — for both `review-chk` and `gm-chk` — plus the
    standard click-sweep. General lesson: any live-refreshing page
    (auto-sync interval, or any other timer/event that re-renders a table
    a user is actively interacting with) that offers row selection via
    checkboxes must explicitly preserve checked state across its own
    re-renders, or the selection silently evaporates out from under a
    user who takes even a few seconds to read the table before acting —
    this is a different, subtler case of CLAUDE.md #74's "any invisible
    background operation must not make the UI feel broken," here the
    breakage isn't a frozen screen but a UI element quietly resetting
    itself while the header control right next to it visibly doesn't.

92. **User's screenshot of the left nav (viewed as a non-admin role) asked
    "ต้องมีแถบเพิ่มไหม เพราะมีสายบังคับบัญชาเพิ่ม" (should there be an
    extra menu tab, since there's an added level in the chain of command)
    — pointing at the gap between "2. ประเมินทีมงาน (L1 รอบแรก)" (where
    หัวหน้าหน่วย/unit AND หัวหน้าแผนก/l1 both submit their own team's
    round-1 self-eval) and "3. สอบทาน L2" (which is actually role `l2`,
    "ผจก.ส่วน"/Section Manager, reviewing straight off `Submitted`).**
    Asked one clarifying question before touching code, since this was a
    real workflow-shape decision, not a display tweak: confirmed the
    department head (role `l1`) needs a genuine new REVIEW step over
    their whole department (including every unit head's team under
    them) before the section manager reviews — not just a menu label.
    **New real pipeline**: `Draft → Submitted → L1Reviewed → L2Reviewed →
    GMApproved → Acknowledged → Calibrated → Approved` — `L1Reviewed`
    inserted into `EVAL_STATUS_ORDER` between `Submitted`/`L2Reviewed`
    (append-*between*, not append-at-end, since this is a real new
    pipeline stage, not a new trailing field — CLAUDE.md #5's rule is
    about array *index* stability for data rows, not the status-order
    *list* itself, which #58/#61 have already reordered before when the
    real workflow order changed).
    **The harder problem, investigated before writing any code**: role
    `l1` (department head) had been scoped by `getMyScopedEmpCodes()`
    identically to role `unit` — `u[9]===myName` (direct reports only) —
    ever since #65 shared that branch between the two roles. That was
    correct back when `l1` had no distinct review responsibility of its
    own (both roles just did round-1 self-eval for their own direct
    team at step 2), but it meant a department head reviewing their
    *whole* department needed to also see every unit head's team below
    them, which `u[9]===myName` alone never could. Rather than adding a
    brand-new `MASTER_USERS` field (which would need HR to go re-fill a
    "department head" name on every single employee — real extra data
    entry never asked for, and risks becoming a second, driftable copy
    of the same fact `u[9]` already encodes), reused the *existing*
    chain fact #65 already established: a unit head's own record has
    `u[9]` pointing to *their* department head. So role `l1`'s new scope
    is a 2-hop walk entirely over the already-populated `u[9]` field —
    direct reports (`u[9]===myName`) plus, for every direct report who
    is themselves a `unit`-role employee, that unit head's own team
    (`u[9]===unitHead'sName`) — zero new data entry required from HR,
    since it only depends on the same `u[9]` values step 2 already needs
    filled for round-1 self-eval to work at all. `role==='unit'` keeps
    its original 1-hop-only branch unchanged (a unit head's own review
    step is still just their own direct team).
    **Reject targets, one stage back each, per #61's own established
    principle**: `rejectReviewL1Selected()` (new, dept head's reject) →
    `Draft` (first real review stage, nothing earlier to bounce to but
    the employee). `rejectReviewSelected()` (L2/section-manager's
    reject) → changed from `Draft` to `Submitted` (undoes the dept
    head's approval specifically, so the dept head must re-review — it
    used to jump the employee all the way back before this step
    existed, which would now incorrectly skip the dept head).
    `rejectGmSelected()` → changed from `Submitted` to `L1Reviewed`
    (undoes the section manager's approval specifically, landing back in
    *their* queue for re-review — not back at the dept head, who did
    nothing wrong, and not all the way to the employee).
    **Grepped every consumer of the old `'Submitted'`/`'L2Reviewed'`
    literal statuses** (the same discipline CLAUDE.md #58's `dash`-page
    special-case and #85/#87's badge/notification sweeps already
    established) rather than trusting the pipeline functions alone:
    `renderNavBadges()` gained `navBadgeReviewL1` (counts `Submitted`,
    scoped) and `navBadgeReview` now counts `L1Reviewed` instead of
    `Submitted`; `renderDashboardWorkflowSteps()` gained a "ผ่านสอบทาน
    หัวหน้าแผนก" step at `L1Reviewed`; `getNotifications()` gained an
    `L1Reviewed`-counting line pointing at the `review` page and its
    `Submitted`-counting line now points at the new `reviewl1` page
    instead. **Found and fixed one pre-existing, unrelated stale bug
    while auditing this same block** (the CLAUDE.md #34/#67 "a doc/UI
    claim that stops matching the code underneath it" shape, just inside
    a notification message rather than a doc table): the `l2reviewed`
    notification line had read "รอ Calibration" / pointed at page
    `'calib'` since before #61 moved Calibration to sit *after*
    Acknowledged — the real next step for an `L2Reviewed` item has been
    GM approval for several fixes now, not Calibration; corrected the
    text and target page to `'gmapprove'` while already touching this
    exact block, rather than leaving a second, independently-wrong
    notification message next to the one this request actually needed
    fixed.
    **UI**: new nav item "3. สอบทานหัวหน้าแผนก (L2)" (`data-pg="reviewl1"`,
    `data-role="l1,exec"`) inserted before the renumbered "4. สอบทานผู้
    จัดการส่วน (L3)" (was "3. สอบทาน L2" — relabeled to spell out the
    real tier per #70's own labeling convention, not just "L2" which
    reads ambiguously against the new step's own "(L2)" department-head
    label); every step number after it shifted down by one (Calibration
    5→6, AMD/MD 6→7, ผลประเมิน 7→8) across the nav list, `titles{}`
    object, and each page's own `<h2>` heading — grepped `ขั้นที่ [0-9]`
    across the whole file to catch every hardcoded step number, not just
    the ones in the nav list. New page `pg-reviewl1` mirrors `pg-review`'s
    existing markup/checkbox-selection pattern exactly (including #91's
    just-shipped `restoreCheckedKeys()` fix — the new page gets the
    persisted-selection behavior for free since it's the same function,
    not a copy). Wired into every existing per-page mechanism a new
    workflow page needs (`renderWorkflowPages()`, the nav-entry
    `renderWorkflowPages()`/`startEvalAutoSync()` conditionals, `titles{}`)
    — grepped for every one of these by name rather than assuming a
    single "add new workflow page" checklist already existed anywhere to
    copy from. Also extended `ROLE_DEFS`/`ROLE_PERM_LABELS` (#37) with a
    new `reviewL1` permission (true for `sysadmin`/`l1`, false elsewhere,
    mirroring the existing `reviewL2` pattern exactly including `exec`'s
    pre-existing `false` value, which was deliberately left unchanged
    rather than "corrected" to match `exec`'s real nav access — that
    inconsistency predates this fix and wasn't part of this request).
    Verified end-to-end with a Playwright test driving one evaluation
    through the real UI at every stage (a synthetic unit head → dept
    head → section manager → GM chain, all wired via real `u[9]`/`u[10]`/
    `u[19]` values, no field mutated directly outside the actual
    approve/reject button functions): confirms the dept head's 2-hop
    scope correctly includes an employee under a unit head reporting to
    them, drives Submitted→L1Reviewed→L2Reviewed, confirms a GM reject
    lands the record back in the section manager's queue specifically
    (not the dept head's), and confirms re-approval through L2 a second
    time reaches L2Reviewed again cleanly — plus a UI-level test
    confirming the new nav item and its red badge render and count
    correctly for a real logged-in `l1` session, plus the standard
    click-sweep. General lesson combining #61/#65/#70: when a chain-field
    (`u[9]`/`u[10]`/etc.) is described in this file's own history as
    "shared generically" between two roles for one purpose (#65's round-1
    self-eval), that sharing does not automatically extend to a *second*,
    later-added purpose (a review-scope query) for the same two roles —
    check what the shared field can and can't answer for the new use
    case before reusing it, and prefer deriving a wider scope by walking
    the *existing* data one hop further (here: through unit heads' own
    `u[9]`) over asking HR to fill a brand-new field that would just be
    a second, driftable copy of a fact already on file.

93. **User's screenshot of the reviewer's evaluation modal (opened from
    "สอบทานแบบฟอร์ม" on the review queues) showed "Z (20%) · HRGO: 20.00"
    with no detail behind it — "แบบประเมินให้แสดงรายละเอียดเวลาด้วย
    เท่าไรในทุกประเมิน" (the evaluation form should also show the time/
    attendance detail — how much, in every evaluation).** Traced
    `openReviewerForm()` (the function behind that modal, shared by both
    the new L1 review queue and the existing L2/section-manager queue
    per #92) and confirmed the Z value shown was **always** `cfg.zmax` —
    the form's fixed maximum (e.g. `20.00` for a leader-tier form) —
    never the specific employee's real, attendance-computed score, even
    though `computeZScore(lv, empCode)` (the real function, already used
    correctly by the self-eval page's `renderZStats()` and by
    `printEvalForm()`'s leave-summary box per CLAUDE.md #60) has existed
    in this file for many fixes already. So every reviewer, at every
    stage of the approval chain, was reviewing a score that silently
    assumed perfect attendance for everyone, regardless of their real
    late/absent/leave record — the exact CLAUDE.md #14 shape of bug
    (never fabricate a value the app can compute honestly) just
    surfacing here as "shows the max instead of the real number" rather
    than a wholly invented one. Fixed by calling the real
    `computeZScore(lv, code)` at the top of `openReviewerForm()` (the
    same call `renderZStats()` already makes) and using its real `score`
    everywhere the modal previously hardcoded `cfg.zmax` — the locked "Z"
    tile, the initial "X = Y + Z" total, and (via `currentReviewerZ`, a
    new module-level variable mirroring the existing `currentReviewerLevel`
    pattern) `clearReviewerForm()`'s reset value too, so "ล้างคะแนน"
    doesn't quietly revert to the fake max either. Added a genuinely new
    detail box — "รายละเอียดเวลาทำงาน (Z) — จาก Attendance จริงของ
    พนักงานคนนี้" — right above the factor-scoring table, showing the
    same real breakdown `renderZStats()`/`printEvalForm()` already
    display elsewhere (late count, early-leave count, their combined
    ÷8-day conversion, absent/sick/personal days, the resulting total
    leave-days-equivalent, and the real Z score itself) rather than just
    fixing the one locked number in isolation — this directly answers
    "เท่าไร" (how much) for every one of the underlying attendance
    figures feeding that score, not only the final Z total.
    `selectReviewScore()` needed **zero changes**: it already reads
    whatever number is sitting in the `.locked b` element via
    `parseFloat()` to compute `X = Y + Z` as the reviewer picks factor
    scores, so putting the real `zr.score` there instead of `cfg.zmax`
    was the entire fix for live recalculation too. Left `openTplPreview()`/
    `showTplDetail()` (the "ตั้งค่าแบบฟอร์ม" template-preview pages,
    which also print `cfg.zmax` next to "Z — คะแนนเวลาการมาปฏิบัติงาน")
    deliberately unchanged — those describe the abstract *form itself*
    (no specific employee is being reviewed there), so "สูงสุด ${cfg.zmax}
    คะแนน" is the correct, honest thing to show; only the per-employee
    reviewer modal was ever showing a specific person's card with a
    fake number. Verified with a test that seeds a synthetic employee
    with a real attendance record (4 late, 4 early-leave, 1 absent, 2
    sick, 1 personal day), confirms `computeZScore()`'s real score
    (`21.95`, not the level's `30.00` max) appears both in the detail
    box and as the modal's initial `X` total, and that the late/absent
    figures render as real text in the DOM — plus the standard
    click-sweep. General lesson, a sharper case of #14: a function that
    computes a real number correctly elsewhere in the file (here,
    `computeZScore()`, already trusted by three other consumers) is not
    automatically used everywhere that number matters — grep every place
    a *specific person's* score is displayed for a hardcoded stand-in
    (a form's max, a class default, a placeholder) before assuming "we
    already compute this for real" means every screen shows it.

94. **User's screenshot of the new "สอบทานขั้นที่ 3 (หัวหน้าแผนก L2)" page
    (#92) reported "เลือกตีกลับแต่ข้อมูลกลับมาอีก" (selected reject, but
    the data comes back again) — the row visibly disappeared from the
    queue right after clicking ตีกลับ, then reappeared on its own some
    time later.** Root cause: every approve/reject/calibrate action in
    the whole review→GM→calibration→approve chain (`updateDraftStatus()`,
    called by `approveReviewL1Selected()`/`rejectReviewL1Selected()`/
    `approveReviewSelected()`/`rejectReviewSelected()`/
    `approveGmSelected()`/`rejectGmSelected()`/`approveAllFinal()`/
    `rejectApproveAll()`, plus `confirmCalibration()`'s own direct
    mutation) only ever pushed the *event* to the `Approvals` Excel
    table via `pushApprovalRecordToExcel()` (append-only log, #34) —
    none of them pushed the draft's new *current status* to the
    `Appraisals` Excel table (the composite-key upsert table #41
    established). `acknowledgeMyResult()` was the one function in this
    whole chain that already did both halves correctly (its own comment
    explains why — Approvals for the log, Appraisals so the row's
    `status` column doesn't stay stuck), which made it the reference
    point for fixing the other eight call sites, not the pattern that
    needed fixing itself. Because the `Appraisals` row never got the new
    status, `startEvalAutoSync()`'s 30-second `ms365SyncAppraisals()`
    pull (#59) — which merges by taking whichever copy's status is
    *further along* `EVAL_STATUS_ORDER` (#58) — kept seeing the stale,
    still-`Submitted` remote row as "ahead of" the freshly-rejected
    local `Draft`/`Submitted` copy, and dutifully overwrote local back
    to the old status on the very next sync tick (immediate on page
    entry, or within 30 seconds of staying on the page) — exactly the
    "data comes back" the user watched happen with nothing else
    clicked. This is a different failure mode from #91's checkbox bug
    (which was about *selecting* rows before clicking) — here the click
    worked, the status genuinely changed for a moment, and a background
    sync silently un-did it minutes later, which reads even more like
    "the button doesn't work" since there's a real delay between the
    action and its apparent failure. Fixed by extracting one shared
    helper, `pushDraftRowToExcel(d, label)` (best-effort, fire-and-forget,
    logs both success and failure to the Sync Log per #66/#68/#69's
    established convention — never a silent `.catch(()=>{})`), and
    calling it from the one real chokepoint, `updateDraftStatus()`
    itself (covering 8 of the 9 call sites with one change), plus
    separately from `confirmCalibration()` (the one function that
    mutates status *and* X/grade directly rather than going through
    `updateDraftStatus()`). Verified with a test that mocks a fake
    "remote Excel" store behind `graphUpsertTableRow()`/
    `graphListTableRows()`: rejects a real submission through the L1
    review queue, confirms the mock remote is updated to the new status
    immediately (not just local `localStorage`), then runs
    `ms365SyncAppraisals(true)` again (simulating the next 30-second
    auto-sync tick) and confirms the status stays `Draft` instead of
    reverting — the exact scenario the user reported — plus a second
    test confirming `confirmCalibration()`'s own X/grade/status change
    now pushes too, plus the standard click-sweep. General lesson,
    sharper than #34's original statement: when a workflow has *two*
    Excel tables serving two different purposes (an append-only event
    log and a current-state upsert table), **every** function that
    changes that current state must push to *both* — finding one
    correct reference implementation elsewhere in the file
    (`acknowledgeMyResult()` here) is not the same as every other status-
    changing function actually following it; grep for every caller of
    the *event-log* push function (`pushApprovalRecordToExcel()`) and
    check each one also pushes to the *current-state* table, since a
    push to only one of the two tables will look completely fine until
    a background sync later reads the other, still-stale one back down.

95. **User asked "วินัย ให้กรอกตรงไหน" (where do I fill in "วินัย"/
    Discipline) about the "2. ประเมินทีมงาน" page's team table, which has
    a "วินัย" column next to "ตนเอง"/"คะแนน L1" — investigated and
    confirmed both `renderTeamFromMaster()`'s "ตนเอง" and "วินัย" cells
    were `<td style="color:#cbd5e1">—</td>` **hardcoded, every row,
    always**, exactly the CLAUDE.md #16 shape (a column that promises
    real per-person data but never computes it) — which directly
    explains the user's confusion: there was never a real cell to type
    into, so naturally no fill-in point could be found.** Answered the
    real question first: "วินัย" isn't its own quick-entry field at
    all — it's scored as factor **7** ("ด้านความมีวินัย (Discipline)")
    inside the same per-employee scoring form opened via the row's
    "ประเมิน"/"ดูแบบฟอร์ม" button (`openReviewerForm()`, #93) — the
    same table every other factor (1. ปริมาณงาน, 2. คุณภาพ, ... 10.
    ฯลฯ) is scored in, not a separate control on the list page.
    Verified this factor sits at the same array position (index 6 of
    the 10-slot `m[]` array, i.e. payload index `4+6=10`) across **all
    four** form levels (`op`/`of`/`ldr`/`mgr` — each one's `factors[]`
    literally lists "7. ด้านความมีวินัย (Discipline)" as its 7th item)
    before relying on that fixed position, so reading `d[10]` off any
    draft regardless of level is safe. Fixed the "วินัย" cell to show
    that real stored value (`0`/unset still renders `—`, since 0 isn't
    a real score yet — CLAUDE.md #14's "don't fabricate a value"
    extended to "don't treat an unset slot as a real zero" too) instead
    of a permanent placeholder — so once an L1 scores that factor and
    saves, the team list itself now honestly reflects it, answering
    "where did the value I entered go" the next time this comes up.
    **Left "ตนเอง" as `—`, deliberately, not silently** — this app has
    no separate self-score preserved once L1 edits/confirms the same
    record (#61's own Q1 answer: "L1 round one" edits the *same* draft
    in place, it never creates a second parallel score set), so there
    is genuinely no real self-only value this column could show without
    a real data-model change nobody asked for here; noted this limit in
    a code comment rather than quietly leaving the column looking like
    a smaller version of the same #16 bug the "วินัย" fix just closed.
    Verified with a test that seeds a real draft with a real factor-7
    score and confirms the team list row renders that exact number,
    not a dash — plus the standard click-sweep. General lesson: a
    one-line "where do I enter X" question is often the most direct
    signal that a *displayed* field for X either doesn't exist or is
    dead — check the actual render function for that exact label before
    assuming the answer is "click here" when the honest answer might be
    "that field was never wired to anything."

96. **User asked "ถ้าพนักงานมีใบเตือน หรือ comment ใส่ไว้แบบฟอร์มด้วย เพิ่ม
    แถบ หรือใส่ส่วนไหนได้ HR จะเป็นคนบันทึก" (if an employee has a
    warning letter or comment, add it to the form too — where can it
    go — HR will be the one who records it).** Asked one clarifying
    question first, since this genuinely changes how the data should be
    stored: whether a warning/comment is a standalone employee record
    independent of any cycle, tied to one specific evaluation cycle, or
    both — confirmed **tied to a specific cycle**. This matches factor 7
    ("ด้านความมีวินัย (Discipline)")'s own description text, which
    literally says "ไม่เคยได้รับการตักเตือน…" (never having received a
    warning) — a real per-cycle warning note directly supports how that
    factor should be scored that cycle.
    Storage: **deliberately not appended to the draft array** — every
    consumer in this file reads `d[d.length-1]`/`d[d.length-2]`/
    `d[d.length-3]` as status/grade/X by *position from the end*, the
    exact same reason `APPROVAL_SIGNATURE_KEY` (#39) was kept as a
    separate store instead of a trailing array field. Added
    `EVAL_HR_NOTE_KEY` (`smlPmsEvalHrNotes`, keyed `empCode|cycle` —
    same key shape as `APPROVAL_SIGNATURE_KEY`/`EVAL_LAST_ACTOR_KEY`,
    since level doesn't change whose warning this is) with
    `saveEvalHrNote()`/`getEvalHrNote()`. **UI placement**: a new
    "ใบเตือน / หมายเหตุวินัย (HR)" text column on the Calibration page
    (`renderCalibQueue()`) — the one real stage in this pipeline already
    gated to the `admin`/HR role (per #61's step-5 handoff), matching
    "HR จะเป็นคนบันทึก" exactly; pre-filled from any existing note so
    editing/correcting one doesn't start blank. `confirmCalibration()`
    now saves each row's note alongside its score/status change, and —
    following the exact #39 pattern rather than inventing a new Excel
    table — folds the note into the *same* `Approvals` push's `comment`
    field it already sends (`'X='+score+' | หมายเหตุ: '+note`), so no
    new sheet is needed; `ms365SyncHrNotes()` (new, mirrors
    `ms365SyncApprovalSignatures()` structurally) reads that same
    `Approvals` table back, parses the `| หมายเหตุ: …` suffix off
    `Calibrated`-step rows, and merges it into the local map — wired
    into both silent-sync groups (`doLogin()`/`tryRestoreSession()`)
    right next to `ms365SyncApprovalSignatures()`. Displayed on **both**
    printed forms (`printEvalForm()` and `printBatchApproved()`) as a
    small red-tinted box right after the existing Z/attendance
    breakdown — shown only when a real note exists for that
    `empCode|cycle` (CLAUDE.md #54's honest-empty-state rule: no
    placeholder box when nothing was recorded). Verified with a test
    that types a note into the Calibration row, confirms
    `confirmCalibration()` persists it under the real key, and confirms
    re-rendering the queue with a fresh draft at the same key correctly
    pre-fills the same note back into the input — plus the standard
    click-sweep. **Real limit stated plainly, not implied fixed**: like
    #39's signature sync, this only makes the *note text* itself sync
    across devices via the Approvals table's Comment column — it rides
    on Calibration specifically being a one-time-per-cycle HR action, so
    if HR needs to log something *before* Calibration is reached (e.g.
    at submission time), there is currently no earlier entry point; not
    asked for here, flagged for a future request rather than assumed
    out of scope forever.

97. **User attached the real live `SML_PMS_Master.xlsx` workbook itself and
    asked "เช็คข้อมูลสัมพันธ์กับเวบไหม ดูเหมือนข้อมูลหลายตัวไม่บันทึกขึ้น
    Excel และก็ไม่ดึงข้อมูลมาที่เวบ" (check whether the data lines up with
    the web app — several things seem to not save to Excel and don't pull
    back either).** Opened the real file with `openpyxl` and inspected
    every table's real header row and real sample data — this is a step
    up from every earlier screenshot-based fix (#30/#68/#75), since a
    screenshot can be cropped/scrolled but a full workbook read shows
    every column and every real table name at once. Two real findings:
    - **`Employees` was actually fine** — the 18-column order (`id, name,
      role, group, section, division, department, position, startDate,
      email, grade, l1, l2, gm, approver, status, potential, lastLogin`)
      matches `EXCEL_EMPLOYEE_COLS` position-for-position; the earlier
      screenshot in the same conversation just happened to be scrolled
      to hide `role`/`group`/`division`/`potential`, which do exist —
      confirmed by the user before this file arrived, and now verified
      directly rather than taken on trust.
    - **`Approvals` was genuinely broken** — the real table has **7**
      columns (`EmpID · ชื่อ-สกุล · รอบ · ขั้นตอน · ผู้อนุมัติ ·
      วันที่/เวลา · ความเห็น`), but `pushApprovalRecordToExcel()` (the one
      function every review/GM/calibration/final-approve/reject action in
      this file calls, per #34) had only ever built a **6-element** array
      (`[empCode, cycle, step, approvedBy, timestamp, comment]`) — with
      no "ชื่อ-สกุล" field at all. Every real push therefore wrote `cycle`
      into the "ชื่อ-สกุล" column, `step` into "รอบ", `approvedBy` into
      "ขั้นตอน", and so on — every column from B onward silently
      shifted one slot left of where it actually belongs, the exact
      CLAUDE.md #30 shape of bug (an external table's real layout
      assumed wrong) but with the missing column in the *middle* of the
      row instead of at the position code already checks. **Why this
      looked "fine" in the app itself despite being wrong on the real
      sheet**: both readers that pull this table back down —
      `ms365SyncApprovalSignatures()` (#39) and `ms365SyncHrNotes()`
      (#96, added just one turn earlier, inheriting the same wrong
      assumption from the sibling function it was modeled on) — used the
      *identical* wrong 6-field positional scheme, so a round-trip
      through this app's own push-then-pull cycle was internally
      self-consistent and never surfaced the bug; it only became visible
      against the real file's actual header row, or against any row a
      human typed directly into the template (like the sample data
      already in this workbook, which has real names correctly in column
      B and would have been silently misread as "the cycle is a
      person's name" by both sync functions before this fix). Fixed by
      adding `empName` (resolved from `MASTER_USERS` by `empCode`, never
      trusted as a passed-in string, per CLAUDE.md #1) as the real second
      element in the push array, and shifting every downstream index in
      both readers by one column (`cycle` now `r[2]`, `step` now `r[3]`,
      `approvedBy`/`approvedAt`/`comment` now `r[4]`/`r[5]`/`r[6]`).
      Verified with a test that pushes a real approval record, captures
      the exact array sent to `graphAddTableRow`, confirms it's 7
      elements with the real name in position 2, then feeds that same
      row back through `ms365SyncApprovalSignatures()` and confirms the
      signature round-trips correctly — not just checking the write side
      in isolation, since the whole point of this bug was that write and
      read had been silently *agreeing* with each other while both
      disagreeing with the real file. Also checked `AuditLog` (7 real
      columns, code writes/reads only 6 — but the missing 7th, `IPAddress`,
      is intentionally never populated per CLAUDE.md #14, sits at the very
      *end* of the row rather than the middle, so nothing shifts) and
      confirmed it's genuinely fine, not another instance of this bug —
      the difference between "missing column at the end" (harmless) and
      "missing column in the middle" (shifts everything after it) matters
      and is worth checking explicitly rather than assuming any column-
      count mismatch is automatically broken. **`FormWeights`/`OrgMaster`/
      `IDP` sheets were completely empty (headers only, zero data rows)**
      in the real file — told the user plainly this looks like those
      three features (factor-weight overrides, org master-list edits,
      IDP records) simply haven't been used/saved from this workbook yet
      rather than a confirmed code bug like the Approvals one; flagged as
      worth re-checking with a real save attempt from each of those pages
      if the user expects data there, rather than guessing further from
      an empty sheet alone. General lesson sharper than #30/#68/#75's own
      conclusion: when a *push* function and its *pull* counterpart are
      both wrong in the same self-consistent way (built from the same
      mistaken assumption, sometimes across two turns as #96 inherited
      #39's own error), the bug is invisible from *this app's* behavior
      alone, however thoroughly tested — it only surfaces against the
      real external file's actual shape, which is exactly why a user-
      supplied real workbook is worth opening and reading column-by-
      column rather than continuing to reason from code or from a partial
      screenshot.

98. **User's screenshot of the Settings page's "เกณฑ์ที่ใช้งานอยู่" table
    (8 rows of tiered late-arrival/absence point deductions, each with a
    "แก้ไข" button) reported "แก้หลักเกณฑ์ไม่ได้ มาสายหลักการผิด ต้อง
    คำนวนมาสาย 8 ครั้ง นับเป็น 1 วันลา ทุกๆ 8 ครั้ง" (can't edit the
    criteria, the late-arrival rule is wrong — 8 late arrivals must count
    as 1 leave day, every 8 times).** Grepped for any function reference
    to this table (`criteria-box`, the card's own class names) before
    touching anything — found **zero**: the whole table (all 8 rows —
    tiered "1–3 ครั้ง = 0.5 คะแนน/ครั้ง", "≥4 ครั้ง = 1.0 คะแนน/ครั้ง",
    "300 นาทีสะสม = 3.0 คะแนน", plus separate thresholded rows for
    ขาดงาน/ลาป่วย/ลากิจ/กลับก่อนเวลา/ลาไม่รับค่าจ้าง) was pure static
    mock HTML, and every "แก้ไข" button had no `onclick` at all — the
    exact CLAUDE.md #16 + #10 combination (fabricated tiered numbers,
    unwired edit buttons) already seen elsewhere in this file. The real
    scoring formula, `computeZDays()` (used by every actual Z score in
    the app — self-eval, reviewer forms per #93, printed forms, the
    "🧪 ทดสอบสูตร" simulator right below this same fake table) has, per
    its own existing code comment, **already implemented exactly the
    rule the user asked for since before this report**: "สาย/กลับก่อน 8
    ครั้ง = 1 วันลา" — `lateEarly/8` with no tiers, no separate minute-
    based threshold, continuous accumulation. So there was no real
    scoring bug to fix — every actual evaluation in this app has always
    used the correct 8-per-day rule — the user's confusion (and their
    literal "can't edit" complaint) came entirely from this second,
    completely disconnected fake table sitting on the same page showing
    a different, wrong, three-tier model that was never real and could
    never be edited because nothing read or wrote it. Fixed by replacing
    the fake table with one that honestly describes the real formula
    driving every score in the app — 4 real rows (late+early combined
    ÷8, absent ×3, sick 1:1, personal 1:1, matching `computeZDays()`
    line-for-line) instead of 8 fabricated tiered ones, dropped the
    dead "แก้ไข" buttons and the "สถานะ ใช้งาน/ปิดใช้งาน" column they sat
    in (nothing toggles), and added an explicit note that this table is
    a read-only description of a formula fixed in code, not a separate
    editable setting — so a future "still can't edit" report is
    forestalled by the table itself saying so, rather than silently
    implying editability the same way the old "แก้ไข" buttons did.
    Deliberately did **not** build a real editable-criteria engine that
    would actually drive `computeZDays()` — that's a materially bigger
    feature (a new settings store, wiring every score consumer to read
    from it instead of the hardcoded formula) that was never asked for
    here; the user's complaint was specifically that the *displayed*
    rule was wrong and unfixable, and the real rule turned out to
    already be correct everywhere it's actually used, so describing it
    truthfully was the right-sized fix. Verified with a Playwright test
    confirming the new table's real formula text renders correctly and
    the old fake title/rows are gone, plus the standard click-sweep.
    General lesson combining #16/#10: a static, never-referenced table
    sitting on the *same settings page* as a working simulator/formula
    for the *same metric* is easy to mistake for "the thing driving the
    real numbers" from a screenshot alone — before assuming a user-
    reported wrong number is a real scoring bug, grep whether the
    screenshotted element has any JS behind it at all, and check whether
    a sibling function on the same page already computes the metric
    correctly; the fix may be deleting/relabeling the fake display, not
    changing the real formula.

99. **Follow-up to #98: user clarified the real late-arrival rule further —
    "มาสาย ถ้าไม่ถึง 8 ครั้งไม่นับ และ เศษก็ตัดทิ้ง" (if late count doesn't
    reach 8, don't count it at all, and any remainder is truncated —
    not fractional/accumulated).** `computeZDays()` (the real formula
    #98 confirmed is already correctly wired everywhere) still computed
    `lateEarly/8` as a plain fraction — 7 ครั้ง gave 0.875 วัน (a nonzero
    partial-day penalty even though it hadn't reached a full 8), and 20
    ครั้ง gave 2.5 วัน (a fractional remainder instead of being dropped).
    Both are wrong under the real rule: below 8 must be exactly 0, and
    the remainder above the last full multiple of 8 must be discarded,
    not kept as a fraction. Fixed by wrapping the division in
    `Math.floor()` — `const lateDays = Math.floor(lateEarly/8)` — so 7
    ครั้ง → 0 วัน, 8 → 1, 15 → 1 (7 leftover dropped), 16 → 2, exactly
    matching the user's stated rule. Propagated the identical
    `Math.floor()` to every other place in the file that independently
    computed this same `lateEarly/8` figure for *display* (not just the
    one that feeds the real score) — `renderZStats()`'s `zsLateEarly`
    line, the "🧪 ทดสอบสูตร" simulator's `calcSim()`, and
    `openReviewerForm()`'s per-employee Z detail box (#93) — plus fixed
    the brand-new #98 criteria-description table's own example text
    (which still said "20 ครั้ง = 2.5 วัน," now correctly "15 ครั้ง = 1
    วัน, 16 ครั้ง = 2 วัน"), since #98's whole point was that table must
    stay an accurate mirror of the real formula and would have gone
    stale again within the same conversation otherwise. Verified with a
    Playwright test calling the real `computeZDays()` directly across
    late counts 0/1/7/8/9/15/16/20/23/24 and confirming the exact
    floor-at-every-8 sequence (0,0,0,1,1,1,2,2,2,3), plus the standard
    click-sweep. General lesson: a "divide by N for a rate" formula and
    a "floor divide by N for a threshold/bucket" formula look almost
    identical in code (`x/8` vs `Math.floor(x/8)`) but produce very
    different real-world behavior at the boundaries — when a user states
    the rule in bucket language ("ถ้าไม่ถึง...ไม่นับ", "เศษตัดทิ้ง"), that
    is a direct signal the operation is `Math.floor`, not plain division,
    and every parallel display of the same figure elsewhere in the file
    needs the identical fix, not just the one function whose output the
    user could see.

100. **User reported "ประเมินใหม่แล้วไม่มี update" (re-evaluated, but
    there's no update in Excel) — pasted real `Appraisals` sheet rows as
    evidence. Investigated the composite-key upsert mechanism (#41) and
    column order first (both checked out correct, matching the real
    header exactly), then asked two clarifying questions rather than
    guessing which of several possible causes it was: whether re-saving
    left the old value unchanged or created a second row (ruled out the
    #41/Worker-redeploy composite-key-mismatch theory — that shape of
    bug produces a *duplicate* row, not a silently-unchanged one — the
    user confirmed "ค่าเดิมเป๊ะ ไม่มีแถวใหม่เพิ่ม", exact old value, no
    new row), and asked to check the Sync Log panel per the established
    #66/#68/#69 diagnostic convention — **the Sync Log tab came back
    completely empty**, even right after triggering a fresh save.
    That emptiness was the real finding: `saveEvaluationToMs365()` —
    the function behind "บันทึกร่าง"/"ส่งแบบประเมิน," i.e. exactly the
    self-eval save/resubmit flow the user was using — had **never once
    called `appendSyncLog()`**, success or failure, in its `try/catch`
    around the `graphUpsertTableRow()` push. This is the identical
    CLAUDE.md #66/#68/#69 shape of bug (a push's outcome swallowed with
    no diagnostic trace) but in a function those three earlier audit
    passes never caught: #68's mechanical sweep searched for the exact
    string `if(!isMs365Configured(cfg)) return;` and #69's follow-up
    searched for the *shape* of a bare `.catch(()=>{})`/`.catch(()=>...)`
    chained directly after a `graphAddTableRow`/`graphUpsertTableRow`
    call — `saveEvaluationToMs365()` does neither: it uses a `try/await/
    catch` block instead of `.catch()` chaining, so it slipped past both
    prior greps even though the underlying defect is exactly the one
    those fixes exist to close. `acknowledgeMyResult()`'s own inline
    `graphUpsertTableRow()` call (added later, #60/#61) had the same
    gap — a bare `try{...}catch(e){}` with no logging at all, not even
    on the not-configured path. Fixed both: `saveEvaluationToMs365()`
    now calls `appendSyncLog()` on both the success and failure branch
    of its existing `try/catch` (mirroring `pushDraftRowToExcel()`'s
    exact wording/pattern from #94, the sibling function that already
    did this correctly for the review/GM/calibration/approve chain —
    only the self-eval save path had been missed), and
    `acknowledgeMyResult()` gained success/failure logging plus a
    not-configured log line, closing the same three-way gap #68
    originally fixed everywhere else. Verified with a test that mocks
    `graphUpsertTableRow()` to succeed, then to throw, and confirms
    `saveEvaluationToMs365('Draft')` leaves a distinct, correctly-worded
    entry in the sync log for each case — plus the standard click-sweep.
    **What this fix does and does not resolve, stated plainly**: it does
    not by itself fix "the Excel row didn't change" — it makes the
    *real reason* finally visible the next time the user re-evaluates
    and checks the Sync Log tab, whereas before this fix the log would
    stay empty regardless of whether the push succeeded, failed, or
    never ran. The user still needs to re-try and read the new log
    entry to find out which of those three it actually was (e.g. a
    genuine Graph/Worker error, confirming or ruling out the still-
    unconfirmed Worker-redeploy question from the same conversation).
    General lesson sharper than #69's own conclusion: a mechanical
    audit pass for a silent-failure bug shape is only as complete as the
    *syntactic* pattern it searches for (a literal guard string, a
    chained `.catch()`) — a function using the equivalent-but-differently-
    shaped `try/await/catch` form for the exact same kind of fire-and-
    forget push is invisible to both of those searches and needs its own
    explicit check; when a report's symptom ("the sync log shows
    nothing") points at a diagnostic channel itself being silent, treat
    that as a signal to re-run the #66/#68/#69 audit by *behavior*
    (actually trigger the save and watch the log) rather than trusting
    that a past mechanical sweep already covered every call site.

101. **User asked whether editing an individual's attendance (the HRGO
    import page's inline-edit/top-form save) and the Excel push should
    "update together" instead of needing a separate manual "📤 Push เข้า
    Excel 365" click every time — I recommended yes (same best-effort
    auto-push pattern #27 already uses for employee saves) and the user
    agreed.** Extracted the per-row shape `ms365PushAttendance()` already
    builds (15-column `Attendance` row) into a shared
    `buildAttendanceExcelRow(code, a)` so the new single-row path and the
    existing push-everything-at-once button can never silently diverge
    on column order again (the same "one function builds the row, every
    caller goes through it" discipline CLAUDE.md #30/#97 already
    establishes for Excel row shapes). Added `pushAttendanceRowToExcel(code)` —
    best-effort, fire-and-forget (never blocks the save itself), logging
    both success and failure to the Sync Log (the exact convention #100
    just re-established: a `.then()/.catch()` pair, not a silent
    `.catch(()=>{})`) — and call it from `writeAttendanceRecord()`
    (the one real write chokepoint both the top form and inline-edit
    save already share per CLAUDE.md #20/#44), right after the local
    `ATTENDANCE[code]` write. The existing "📤 Push เข้า Excel 365" button
    (`ms365PushAttendance()`, pushes every row in the table) is left
    fully intact as a bulk re-sync path — useful right after a file
    import that touches many people at once — it now just shares
    `buildAttendanceExcelRow()` instead of its own inline row-building
    code. Verified with a test that edits one employee's attendance
    through the real `writeAttendanceRecord()` call and confirms the
    Excel push fires automatically with the correct 15-column row and a
    real Sync Log entry, for both the success case and a forced-failure
    case (distinct log message, no silent swallow) — plus the standard
    click-sweep. General lesson: when a user asks "should these two
    actions happen together" about a manual two-step flow this file has
    shipped before (local save, then a separate explicit Excel push),
    the answer is usually yes per #27's own precedent — unless the
    second step is genuinely expensive/bulk (a reason to keep a manual
    "sync everything" button too), auto-triggering the best-effort push
    from the one real write chokepoint removes an entire class of "I
    edited it but forgot to also click Push" reports before they happen.

102. **Follow-up to #100's fix: with the Sync Log finally logging real
    outcomes, the user pasted the real result — "Push AuditLog เข้า
    Excel ไม่สำเร็จ: จำนวนของแถวหรือคอลัมน์ในอาร์เรย์ป้อนข้อมูลไม่ตรงกับ
    ขนาดหรือมิติของช่วง" (array row/column count doesn't match the
    range's size/dimension), firing on nearly every action — the real,
    previously-invisible reason `AuditLog` was "not updating" all
    along.** This directly contradicts #97's own conclusion that
    `AuditLog`'s missing 7th column (`IPAddress`, never populated per
    CLAUDE.md #14) was "genuinely fine… the missing column sits at the
    very end of the row rather than the middle, so nothing shifts" —
    that reasoning only holds for a column *read* (reading fewer fields
    than exist just leaves the rest unread) or for a `PATCH`-style
    update (which can target a subset of cells). For a Graph **"add
    row"** call (`rows/add`), the API requires the submitted array's
    length to match the table's real column count exactly, trailing or
    not — a 6-element array against a real 7-column table fails outright
    with precisely this dimension-mismatch error, every single time,
    which is exactly why `pushAuditLogEntryToExcel()` (called from
    `appendAuditLog()` on nearly every action in the app) had never
    once actually written a row, even though #66/#68/#69's earlier
    fixes correctly made the *failure itself* loggable — #100 is what
    finally let this real error surface instead of staying silent.
    Fixed by appending `''` as the 7th element of the array
    (`[entry.at, entry.user, entry.type, entry.action, entry.target,
    entry.detail, '']`) so the push always matches the real table's full
    width — `ms365SyncAuditLog()`'s own reader needed zero changes, since
    it only ever reads the first 6 known indices back out of each row,
    same as before. Verified with a test that calls the real
    `appendAuditLog()` and confirms the array sent to `graphAddTableRow`
    is now 7 elements long, matching the real table — plus the standard
    click-sweep. **What this means for #97's own general lesson,
    corrected**: "missing column at the end is harmless, missing column
    in the middle shifts everything" is true for *reads* and for
    `PATCH`/upsert-style *updates*, but false for a plain **add-row**
    call — an add must always supply a value for every real column,
    regardless of position, or the Graph API rejects the whole row. Any
    future `graphAddTableRow()` call (as opposed to `graphUpsertTableRow()`,
    which goes through the same add-when-no-match path internally) needs
    its array length checked against the real table's full column count,
    not just "are the known fields in the right order." General lesson
    sharper than #100's own conclusion: #100 made the *symptom* visible
    (an error now appears in the Sync Log instead of silence) but #100
    itself didn't diagnose the *cause* — the very next message after a
    silent-failure diagnostic fix ships is often the real error text
    coming back for the first time, and it can overturn an earlier,
    reasonably-argued conclusion (#97's "end-column-is-harmless" rule)
    that was never actually tested against a real `rows/add` call,
    only reasoned about from first principles.

103. **User attached the company's real reference `.doc` file — "เกณฑ์การ
    คำนวณสถิติทำงาน" (attendance-statistics scoring criteria), full score
    30 points, with a day-count → score rank table for all three tiers
    (ลา 30% / หัวหน้า-ผจก 20% / ผู้บริหาร 10%) — and asked to verify the
    app's real logic against it.** Converting the legacy `.doc` via
    LibreOffice failed outright ("source file could not be loaded"), so
    extracted the real text with `antiword` instead (Thai glyphs render
    as `?` under antiword's default Latin-1 mapping, but the numeric
    rank table — the only part this comparison needed — came through
    perfectly intact). Compared the document's real table against
    `Z_TABLE.emp`/`.ldr`/`.mgr` (the three score-by-leave-days lookup
    tables `computeZScore()` already uses for every real Z score in the
    app — self-eval, reviewer forms per #93, printed forms) and found a
    genuine, confirmed mismatch: the real document specifies a **flat
    full-score band for 0–5 days** (0,1,2,3,4,5 all = 30.00/20.00/10.00),
    with score reduction only starting at day 6 — but the app's tables
    started reducing the score immediately from day 1 (`[30,28.85,
    27.70,...]`), with no flat band at all. Every employee with 1–5 real
    leave/lateness-days-equivalent was being scored *lower* than the real
    policy entitles them to — a genuine, consequential correctness bug
    (it changes real evaluation scores), not a display-only issue like
    most of #93–#99's attendance-formula fixes. Fixed by rebuilding all
    three `Z_TABLE` arrays (and the simulator's parallel `zTableEmp`,
    #98/#99's own "keep every parallel display of the same figure in
    sync" lesson) with the real flat 0–5 band prepended, so index 0–5 =
    the tier's max score and index 6 onward carries the exact same
    stepped values that were already correct from day 6 onward — only
    the first 6 slots were ever wrong; everything from day 6 through day
    30 already matched the document exactly, which is presumably why
    this was never caught by any earlier attendance-formula review. The
    array length changed from 31/32 (with the old day-1 start) to a
    clean 31 entries (index 0–30, matching `zDaysIdx`'s own existing cap
    at 30) — `computeZScore()`/`renderZStats()`/`openReviewerForm()`/
    `printEvalForm()`/`printBatchApproved()` needed **zero code changes**,
    since every one of them already indexes `Z_TABLE[tier][zDaysIdx]`
    generically; fixing the three data arrays in place was the entire
    fix. **This is unrelated to #99's floor-division fix** — #99 governs
    how raw late/early-leave *counts* convert into a leave-*days*
    number; this fix governs how that resulting days number maps to a
    *score* — both were real, independent bugs found in two different
    layers of the same overall Z-score pipeline, on two different
    reports. Verified with a test that checks every one of the document's
    31 real table values (days 0–30, all three tiers) against the live
    `Z_TABLE` object in the running app and confirms zero mismatches —
    plus the standard click-sweep. General lesson, sharper than #68/#97's
    own "verify against the real external file" rule: a user-supplied
    reference *document* (not just a spreadsheet) describing a scoring
    policy is worth extracting and diffing value-by-value against the
    exact in-code table driving real scores — even when a legacy `.doc`
    won't convert via LibreOffice, a plain-text extractor (`antiword`)
    that only gets the numbers right (Thai labels garbled is fine, the
    policy's real content here is entirely numeric) is good enough to
    catch a genuine scoring-table bug no amount of in-app testing alone
    would ever surface, since the app was perfectly internally
    consistent — every "repeat" of the wrong table agreed with every other
    repeat — right up until compared against the real outside policy.

104. **User's screenshot of the attendance list after an Excel sync showed
    every field wrong (e.g. "วันลารวม" column stuck at 30.00 for people
    whose real leave total was nowhere near that) — "ข้อมูลไม่เปลี่ยนตาม
    excel ที่นำเข้า" (data doesn't change according to the imported
    Excel).** Investigated `ms365SyncAttendance()` (the function behind
    "ดึงเวลาทำงานจาก Excel") against the real `SML_PMS_Master_2.xlsx`
    workbook the user had just sent (same file opened directly with
    `openpyxl` to fix the Z-score lookup table in #103) and found a
    second, independent, more serious bug in the same sheet: the
    function parses `graphListTableRows('Attendance')`'s rows using
    `HRGO_TEMPLATE_HEADERS`' column positions (`emp_code, full_name,
    absent_day, late_count, late_min, personal_day, personal_hr,
    personal_min, sick_day, ...` — 15 columns, the shape of the
    *HRGO CSV import* template from `importHrgoFile()`), but the REAL
    Excel "Attendance" table has a **completely different, 11-column
    shape**: `EmpID, ชื่อ-สกุล, รอบ(Period), มาสาย, กลับก่อน, ลาป่วย,
    ลากิจ, ขาดงาน, วันลารวม(Auto), Z Score(Auto), หมายเหตุ`. These are
    two genuinely different file formats that happen to share a function
    name's assumption — `ms365SyncAttendance()` was built reusing
    `HRGO_TEMPLATE_HEADERS`' index comments verbatim without ever
    verifying the real MS365 Excel table used that same layout (the
    exact CLAUDE.md #30 mistake — assume an external column order
    without checking the real file — but this time committed inside a
    *sync* function built to intentionally mirror a *different file's*
    template, which is how it slipped past every earlier review).
    Concretely: the real `รอบ`/Period column (a year number like 2569)
    was being read as `absentDay`, the real `ลาป่วย` column was read as
    `personalDay`, the real `ลากิจ` as nothing, the real `ขาดงาน` was
    read as `sickDay`, and the real auto-formula `วันลารวม`/`Z Score`
    columns were read as minute-level HRGO fields that don't exist in
    this sheet at all — every single field landed in the wrong slot,
    which is exactly why the displayed numbers bore no relationship to
    the real imported file. Fixed `ms365SyncAttendance()`'s column
    indices to the real verified order (`c[3]`=late, `c[4]`=early,
    `c[5]`=sick, `c[6]`=personal, `c[7]`=absent, `c[10]`=note) — verified
    with a test that feeds the exact real header+row shape through the
    function and confirms every field lands correctly — plus the
    standard click-sweep. **Flagged, not yet fixed, to the user**:
    `buildAttendanceExcelRow()`/`ms365PushAttendance()`/
    `pushAttendanceRowToExcel()` (the *write* direction, #101) have the
    identical wrong-column assumption, but fixing the write side isn't a
    simple mirror of the read fix — the real sheet's `วันลารวม`/`Z Score`
    columns are **live Excel formulas** (`=F+G+H*3+INT((D+E)/8)` and an
    `INDEX/MATCH` into a lookup table, confirmed directly in #103's file
    read), and `graphUpsertTableRow()`'s underlying Worker call
    (`PATCH .../itemAt(index=N)` with `values:[[...]]`) replaces the
    **entire row**, including those two formula cells, with whatever
    plain values the app supplies — so a naive same-shape fix to the
    push side would silently convert every pushed row's live formulas
    into frozen static numbers the moment anyone saves attendance from
    the web app, which is a real, hard-to-reverse data-integrity risk to
    HR's own spreadsheet, not just a display bug. Left unfixed pending
    the user's explicit choice (write matching static mirror values into
    those two columns on every push, which is functionally fine today
    since the app's own formula now matches #103's fixed Z_TABLE but
    permanently loses the "auto-formula" nature of those cells; or stop
    pushing into this specific table from the web app and treat it as
    Excel-authoritative with the app only ever pulling) rather than
    guessing — this is exactly the kind of irreversible-to-the-user's-
    real-file decision CLAUDE.md's own cautious-action guidance says to
    surface rather than silently resolve. General lesson sharper than
    #30/#97's own conclusion: a sync function's column-index comments
    citing *a* template constant is not proof it was ever checked
    against *this* table's real columns — when two different file
    formats exist in the same codebase (an HRGO CSV template and a
    separate MS365 Excel table) and a function's job is to bridge one
    into the shape the other already handles, grep whether that function
    ever actually confirmed the two shapes match, or whether it just
    borrowed working code's index numbers on the assumption they would.

105. **Follow-up to #104: user chose option 2 — stop pushing into the real
    Attendance Excel table at all, treat it as Excel-authoritative, and
    let the web app only ever pull from it.** Disabled both write paths
    (`pushAttendanceRowToExcel()`, the auto-push from #101's
    `writeAttendanceRecord()` chokepoint, and `ms365PushAttendance()`,
    the manual "📤 Push เข้า Excel 365" button) — neither calls
    `graphUpsertTableRow()` anymore; both now only log a clear reason to
    the Sync Log (and the manual button also toasts it) explaining that
    the real sheet's "วันลารวม"/"Z Score" columns are live formulas the
    web app's row-replacing push would destroy. Relabeled both buttons
    (`🔒 Push เข้า Excel (ปิดใช้งาน)`) with a `title` tooltip stating the
    same reason, rather than silently removing them — a vanished button
    with no explanation reads as a bug report waiting to happen, per
    CLAUDE.md #10's "visibly disable with a one-line reason" rule, not a
    reason to delete the control outright. Left `buildAttendanceExcelRow()`
    defined but now dead (no remaining caller) rather than deleting it —
    unlike this project's usual "delete code known to be unused"
    convention (#48/#51/#80), this one specific function's real,
    verified column mapping (#104's fix) is worth keeping on file as the
    reference shape if a future redesign ever wants to re-enable a
    formula-safe push (e.g. a Worker endpoint that PATCHes only columns
    D-H, leaving I/J untouched — not built here, since it wasn't asked
    for). Verified with a test that stubs `graphUpsertTableRow()` to
    detect any call and confirms neither function ever invokes it, while
    both still leave a real Sync Log entry explaining why — plus the
    standard click-sweep. General lesson: when a prior fix (#101) added
    an automatic best-effort push specifically to remove the "forgot to
    also click Push" class of report, and a later finding (#104) reveals
    that same push is actually unsafe for one specific table, disabling
    it needs to happen at the *same chokepoint* the auto-push was wired
    into (here, both the manual button and the automatic per-save call),
    not just the one path that was most recently discussed — grep every
    caller of the push function being disabled, not just the one the
    user's screenshot happened to show.

106. **Follow-up to #105: user asked for editing-via-web to keep saving to
    Excel like before ("ใหม้มีการแก้ไขผ่าน web แล้วบันทึกใน excel ได้
    เหมือนเดิม") — i.e. re-enable the push #105 just disabled, without
    re-introducing #104's formula-destroying risk.** Built a genuinely
    formula-safe partial upsert instead of the previous "PATCH the whole
    row" mechanism: `graphUpsertTableRow()` (and the Worker's
    `upsertRow()`) always sends `values:[[...]]` to `/itemAt(index=N)`,
    which Graph applies as a literal PATCH over the row's **entire**
    range — there's no way to tell it "skip these two cells" through
    that endpoint. Added a new pair, `graphUpsertTableRowPartial()`
    (client, mirrors `graphUpsertTableRow()`'s Worker/delegated branching)
    and `upsertRowPartial()` (Worker, new `/rows/upsert-partial`
    endpoint) that — on an **existing** row only — first reads the row's
    real `range` address (`itemAt(index=N)/range`, which Graph returns as
    a sheet-qualified address like `"Attendance!A5:K5"`), parses out the
    sheet name/row number/starting column letter, groups every column
    index *not* in a caller-supplied `protectedCols` list into contiguous
    runs, and issues one `workbook/worksheets('Sheet')/range(address=...)`
    PATCH per run — so columns 8/9 (`วันลารวม`/`Z Score`, the live-formula
    columns #104 verified directly from the real file) are never named in
    any PATCH call at all, leaving whatever formula is already sitting in
    those cells completely untouched. **Real, stated limit, not hidden**:
    this only protects an *existing* row's formulas — a brand-new
    employee code with no row yet still falls through to a plain
    `rows/add` (the same as before), and a fresh row has no formula to
    preserve in the first place, so its `วันลารวม`/`Z Score` cells land
    blank until HR types or drags the formula in from the row above once,
    same as adding any new row manually in Excel — not attempted to
    auto-inject formula text on add, since that needs locating the
    brand-new row's real row number *after* the add (a second round-trip)
    and Graph's table-row `values` property writes literal text, not a
    live formula, for a cell that has no earlier formula to inherit from
    a fill-down; flagged as a known edge case rather than silently
    assumed solved. `buildAttendanceExcelRow()` was rewritten to the
    real 11-column order #104 already verified (code/name/cycle/late/
    early/sick/personal/absent/blank/blank/note — the two blanks are
    the protected positions, their value is irrelevant on update since
    `graphUpsertTableRowPartial()` never sends them for an existing row)
    and now also reads `a.earlyCount` for real instead of the old
    hardcoded `0` it carried from before #104's read-side fix, since the
    real sheet genuinely has a separate กลับก่อน column. Re-enabled both
    push entry points (`pushAttendanceRowToExcel()`'s auto-push from
    #101's `writeAttendanceRecord()` chokepoint, and the manual
    "📤 Push เข้า Excel 365"/"Push ข้อมูลเวลา → Excel" buttons #105 had
    disabled) to call the new partial function instead of the old
    whole-row one — same Sync Log success/failure convention as every
    other push in this file (#66/#68/#69/#100/#101). **This changes the
    Worker's own code** (the new `/rows/upsert-partial` endpoint and its
    `upsertRowPartial`/`colIndexToLetter`/`colLetterToIndex`/
    `groupContiguous` helpers), so — same as CLAUDE.md #41's own
    precedent — **it needs a real redeploy** (copy-paste the updated
    `tools/sml-pms-proxy-worker.js` into Cloudflare) before this fix has
    any effect; every purely-client fix in this file goes live the
    moment GitHub Pages updates, but this one specifically does not
    until the Worker is redeployed. Verified with a test that mocks the
    full range-address/PATCH chain and confirms pushing attendance for
    an existing row sends exactly two PATCH calls — `A5:H5` and `K5:K5`
    — and never once names `I5`/`J5` in any request URL, plus the
    standard click-sweep. General lesson: when a prior fix disabled a
    feature because the only available primitive (`graphUpsertTableRow`'s
    whole-row PATCH) was unsafe for the specific table, and the user then
    asks for the feature back, the right move is building the safer
    primitive the task actually needed (a column-scoped partial update)
    rather than either re-enabling the unsafe one or leaving it disabled
    indefinitely — Microsoft Graph's workbook API supports range-level
    addressing for exactly this reason, even though the table-row
    convenience endpoints this file had used everywhere up to now don't
    expose it directly.

107. **User reported "sheet Appraisals บันทึกข้อมูล รหัสกับชื่อคนไม่ถูกต้อง"
    (the Appraisals sheet records the wrong employee code/name) — asked for
    a real screenshot of the sheet's header row first, per the #30/#97
    convention, before guessing. The screenshot confirmed the real column
    order (`EmpID, ชื่อ-สกุล, รอบ, ระดับ, m0..m9, l01..l04, Y, Z, X, เกรด,
    Status` — 23 columns, A–W) matches `collectEvaluationPayload()`'s push
    order exactly, so this was NOT another #97/#104-shaped column-mapping
    bug.** The real defect was one step earlier, at the self-eval page's
    own form: `#evalCode` (รหัสพนักงาน) is correctly auto-filled from the
    real logged-in/gate-entered code via `onEvalCodeGateChange()`, but
    `#evalName` (ชื่อ-สกุล) was a completely free `<input>` that **nothing
    in the entire file ever auto-filled from `MASTER_USERS`** — the exact
    CLAUDE.md #1 violation ("never trust a name/label that came from a
    form — always resolve identity by code") sitting in the one place
    #1's own original fix (HRGO import) never had to cover, since this
    field is typed by a human directly rather than parsed from a file.
    In practice this meant: a stale name left in the field from a
    previous person who used the same device/browser session, or a
    simple typo, got pushed straight into column B of `Appraisals` with
    zero cross-check against the real `empCode` sitting right next to it
    in column A — so a row could easily end up with a real, correct code
    and a real, but *wrong person's*, name. Fixed at both layers, per
    this project's usual defense-in-depth pattern: (1) `onEvalCodeGateChange()`
    now sets `evalName.value = emp[1]` (the real resolved name) and locks
    it `readOnly = true` the moment a real code is resolved — covering
    both the "found + eligible" and "found but not eligible" branches, so
    the field always shows the truth and can't be hand-edited into a
    mismatch; (2) `collectEvaluationPayload()` (the function that actually
    builds the pushed row) now resolves `empName` from
    `MASTER_USERS.find(u=>u[0]===empCode)?.[1]` first, falling back to the
    DOM field's value only when the code genuinely isn't in `MASTER_USERS`
    at all (e.g. a not-yet-synced new hire) — so even if some other code
    path ever makes the field editable again, the actual Excel push still
    can't carry a mismatched name as long as the code resolves. Also found
    and fixed the identical backwards-priority bug in `printEvalForm()`
    (line ~5010) while touching this: it already resolves `u` correctly
    from `MASTER_USERS` by `empCode` (CLAUDE.md #38's own fix), but then
    still preferred the raw `evalName` field's value over `u[1]` when
    building the printed form's header — swapped the priority to match
    #38's own stated principle (resolved data first, typed field only as
    last-resort fallback). Verified with a test that seeds a stale/wrong
    name into `#evalName`, calls `onEvalCodeGateChange()` with a real
    code and confirms the field is corrected + locked, then forces the
    field back open and types a wrong name anyway, confirming
    `collectEvaluationPayload()` still returns the real resolved name
    rather than the forced-in wrong one — plus the standard click-sweep.
    General lesson sharper than #1's own statement: "never trust a name
    that came from a file, form, or another record" applies just as much
    to a human typing directly into a live `<input>` as it does to a
    parsed CSV column — any field whose real identity is already pinned
    by a code field sitting next to it (here, `evalCode`/`evalCodeGate`)
    should never also be independently user-editable free text; auto-fill
    it from the resolved record and lock it, the same way #18's
    supervisor fields and #28's code-entry datalists already do for every
    other such pairing in this file.

108. **User reported "บันทึกผลการประเมินแล้ว จะดูแบบ ไม่มีข้อมูลที่เลือกเกรดไว้"
    (saved the evaluation, but viewing the form shows no selected-grade
    data).** Traced `setEvalLevel(lv)` (called every time the "ประเมิน
    ตนเอง" form opens, including re-opening a person who already has a
    saved Draft/Submitted record) and confirmed it unconditionally does
    `evalScores = {}` and rebuilds every factor row fresh — there was
    **no function anywhere in the file** that read a previously-saved
    draft back out of `getDrafts()` and re-ticked its grade buttons. So
    every re-open of the form (after a page reload, a re-login, or just
    navigating away and back) looked completely blank — no grade button
    highlighted, every "คะแนน" cell showing "—" — even though the real
    scores were sitting safely in the saved draft the whole time; only
    the numeric sum (`collectEvaluationPayload()`'s `m0..m9`/`l0..l3`)
    was ever persisted, never *which grade* produced it, and nothing
    read even that sum back into the UI. This is the self-eval analogue
    of CLAUDE.md #9's edit-button bug (opening something that already
    has real data but showing it as if it were brand new) — just without
    a dedicated "edit" entry point to miss, since re-opening the same
    form *is* the only entry point here.
    Fixed with `restoreEvalFormFromDraft(lv, empCode, cycle)`, called
    from `onEvalCodeGateChange()` right after `setEvalLevel(assigned)`
    rebuilds the rows: looks up the matching draft via the same
    `empCode|cycle|level` key `draftKey()`/#41's upsert already use,
    then for each of the 10 main factors (and the 4 leadership ones when
    `cfg.leaderShow`) reverse-looks-up which grade produced the saved
    numeric value (`Object.keys(SCORES[w]).find(g=>SCORES[w][g]===val)`,
    since each factor's weight `w` maps grade→a unique score) and calls
    the real `setScore(key, grade, w, btn)` on the matching button —
    never writes `evalScores` directly, so the button's active styling,
    the "คะแนน" cell, and `recalc()`'s running total all update exactly
    as if the person had just clicked it themselves, through the one
    real code path instead of a second parallel one that could drift
    (the same "don't rebuild a second write/render path" discipline
    CLAUDE.md #20/#44 already established for attendance). A factor with
    no saved value (`val` falsy — never happens for a real Draft since
    every factor must be scored to save, but defensive regardless) is
    simply left unticked, not defaulted to anything. Verified with a
    test that scores all 10 factors as grade "A", saves a Draft, resets
    the in-memory `evalScores` and re-opens the same employee's code
    (simulating a fresh page load), and confirms both the DOM (the "A"
    button shows `.active`, the score cell shows the real number instead
    of "—") and `evalScores` itself end up correctly repopulated from the
    saved draft, not just visually appearing to — plus the standard
    click-sweep. General lesson: a form that computes and saves a
    numeric total from several discrete selections (grade buttons here)
    needs a real "load this total back into its original selections" path
    the moment the form can ever be re-opened against existing data — not
    just a save path — or every re-open looks like data loss even when
    nothing was actually lost.

109. **User asked point-blank "แก้ทุกจุดแล้วใช่ไหม ทั้ง L1 L2 L3 L4" (did you fix
    every point — L1/L2/L3/L4) right after #108 shipped. The honest
    answer was no — #108 only fixed the self-eval page's own form; the
    separate `openReviewerForm()` modal (shared by the "2. ประเมินทีมงาน"
    page's "ประเมิน" button and the L1/L2 review queues' "สอบทานแบบฟอร์ม"
    button) had the identical blank-on-reopen gap, plus something worse
    found while checking: its own "✓ บันทึกและส่งต่อ"/"↩️ ตีกลับ" footer
    buttons were pure CLAUDE.md #10 placeholders —
    `onclick="smlToast('บันทึกผลการประเมินของผู้ประเมินแล้ว','ok');closeM()"`
    and the equivalent for ตีกลับ — a fake success toast with zero
    underlying write, while the *real* approve/reject pipeline
    (`approveReviewL1Selected()`/`rejectReviewL1Selected()`/
    `approveReviewSelected()`/`rejectReviewSelected()`/`approveGmSelected()`/
    `rejectGmSelected()`, #92/#94) only ever ran from the checkbox +
    bulk-action buttons on the queue **list page itself**, completely
    outside this modal. Anyone who opened the form, scored it, and
    clicked its own "บันทึกและส่งต่อ" expecting that to actually approve
    it would see a success message and a closed modal — and nothing
    would have moved; the record stayed exactly where it was until
    someone separately went back, ticked the checkbox, and used the
    real page button. Asked the user two clarifying questions before
    touching this (given it intersects the whole approval pipeline from
    #61/#92): (1) should the modal's own buttons be wired to really work,
    confirmed yes; (2) does scoring someone's team member from "2.
    ประเมินทีมงาน" need to actually save, confirmed yes.
    **Fixed both gaps together, since they share the same underlying
    state** (`currentReviewerCode`/`currentReviewerCycle` added
    alongside the existing `currentReviewerLevel`/`currentReviewerZ`
    module vars, `openReviewerForm()` now takes a `cycle` parameter from
    every call site — previously never passed at all, defaulting
    silently to nothing): `restoreReviewerFormFromDraft(lv, empCode,
    cycle)` mirrors #108's `restoreEvalFormFromDraft()` exactly (same
    reverse-lookup-grade-from-saved-score approach, just against
    `smlScoreByWeight()`'s `Aplus/A/B/Cplus/C` key names instead of
    self-eval's `Ap/A/B/Cp/C` — same numeric values, different label
    strings for the two parallel score-tables in this file) — called
    right after `openM('mReview')` so reopening a review queue's form
    shows the scores already given, not a blank slate.
    **The real submit/reject wiring** (`submitReviewerForm()`/
    `rejectReviewerForm()`) had to solve a genuine ambiguity: the same
    modal is opened from three different real contexts (team page with
    no existing record, L1 review queue on a `Submitted` record, L2
    review queue on an `L1Reviewed` record), and clicking the *same*
    "✓ บันทึกและส่งต่อ" button in each must do something different —
    solved by branching on the record's **real current status**, looked
    up fresh via `getDrafts()` at submit time, not on which page opened
    it: `Draft`/no-record → build a brand-new payload (same shape as
    `collectEvaluationPayload()`) and set status `Submitted` (this *is*
    the L1/unit round-1 scoring entry point per #61's own answer — not a
    second parallel score set, the one real score, entered by the
    supervisor on the team member's behalf); `Submitted` → advance to
    `L1Reviewed`; `L1Reviewed` → advance to `L2Reviewed` — any other
    status (already past L2Reviewed) refuses with an honest toast
    pointing back at the real list-page buttons rather than silently
    doing the wrong thing. Each transition calls the exact same
    `pushDraftRowToExcel()`/`pushApprovalRecordToExcel()`/
    `appendAuditLog()`/`renderWorkflowPages()` calls the real per-stage
    bulk functions already use (CLAUDE.md #94's established "push to
    both the append-only log and the upsert current-state table" rule),
    so a record approved through this modal is indistinguishable in
    Excel/Audit Log from one approved via the checkbox row — never a
    second, divergent write path. `rejectReviewerForm()` mirrors this
    with the exact one-stage-back targets #92 already established
    (`Submitted→Draft`, `L1Reviewed→Submitted`, `L2Reviewed→L1Reviewed`),
    reusing the shared `updateDraftStatus()` helper directly rather than
    re-implementing it. Verified end-to-end with a test that opens the
    form for a brand-new employee with no record (team page scenario),
    scores all 10 factors and submits — confirms a real `Submitted`
    draft now exists — reopens the same form and confirms all 10 grade
    buttons restore as selected, submits again — confirms the real
    status advances to `L1Reviewed` — reopens once more and rejects —
    confirms it correctly lands back on `Submitted`, not further back —
    plus the standard click-sweep. General lesson sharper than #10's own
    statement: a modal's own action buttons sitting right next to a
    *separately working* bulk-action mechanism for the same real action
    (here, the queue page's checkbox+button) is a specific, easy-to-miss
    shape of the #10 placeholder problem — the real mechanism existing
    and working elsewhere makes the fake one look harmless in a cursory
    pass, since "the feature works" is true somewhere in the file; always
    check whether *every* visible entry point for an action (not just
    the one that happens to be wired) actually reaches that one real
    mechanism, especially when a user asks "did you get every point"
    after a related fix — that phrasing is itself a signal to re-walk
    every sibling control, not just confirm the one already fixed.

110. **Follow-up to #109: user's screenshot of the reviewer form (opened
    from "2. ประเมินทีมงาน") showed every factor's "คะแนน" cell as "—"
    with zero selected grade buttons, for someone confirmed to have a
    real previously-saved draft — #109's own `restoreReviewerFormFromDraft()`
    fix appeared not to be working.** Traced the real cause: the team
    page's "ประเมิน"/"ดูแบบฟอร์ม" button call site (`renderTeamFromMaster()`)
    still opened the form with `inferLevelFromPosition(u[7])` — a rough
    keyword guess at the form level from the employee's job-title text
    (`'ผู้จัดการ'`→`mgr`, `'หัวหน้า'`→`ldr`, etc.) — instead of the real
    admin-assigned level (`getAssignedEvalLevel(emp)`, CLAUDE.md #23's
    own established function, already used correctly everywhere else a
    form is opened, including #109's own three fixed call sites). If an
    employee's real assigned level (`emp[18]`, set explicitly by Admin)
    doesn't match what the title-keyword guess would produce — exactly
    the case for a generic title like "พนักงาน" that matches none of
    `inferLevelFromPosition()`'s keywords and falls through to `'op'`,
    while Admin had actually assigned `'ldr'` — the form opens under the
    *wrong* level string. `restoreReviewerFormFromDraft(lv, empCode,
    cycle)` then looks for a draft matching `d[3]===lv`, finds none
    (the real saved draft is keyed to `'ldr'`, not the guessed `'op'`),
    and silently shows a blank form — reading exactly like #108/#109
    never restored anything, when the real draft and the restore
    function were both completely correct; only the *level fed into the
    lookup* was wrong. This is the one call site #109's "add `cycle` to
    every `openReviewerForm()` call" sweep touched without also
    questioning whether its *level* argument was trustworthy — #109
    fixed the missing cycle but inherited this pre-existing level-guess
    bug unexamined. Fixed by computing the real level the same way every
    other form-opening path in this file already does —
    `getAssignedEvalLevel(u) || inferLevelFromPosition(u[7])` — inside
    `renderTeamFromMaster()`'s own `.map()` (where the real `MASTER_USERS`
    row `u` is already in scope, so no second lookup by code is needed)
    before building the row's `onclick`, falling back to the title-guess
    only when Admin genuinely never assigned a level (the same fallback
    `getAssignedEvalLevel()` itself already documents for a fresh
    employee). Verified with a test that seeds an employee whose real
    assigned level (`'ldr'`) provably differs from what
    `inferLevelFromPosition()` would guess from their generic title
    (`'op'`), saves a real draft under the correct level via the form
    itself, confirms the team page's own level-resolution logic now
    matches the real assigned level (not the guess), and confirms
    reopening the form restores all 14 previously-given scores — plus
    the standard click-sweep. General lesson sharper than #109's own
    conclusion: when a restore/lookup function depends on a composite
    key (`empCode|cycle|level` here), a "nothing restored" report can
    come from the restore function itself being broken, *or* from any
    one of the key's components being wrong at the call site that invokes
    it — #108/#109 already taught to check the restore function itself
    first, but the real culprit this time was one layer upstream, in
    how the *level* argument got computed before the restore function
    ever ran; grep every caller of a newly-fixed restore path for
    whether each of its key arguments is sourced from a trustworthy
    place (an admin-assigned fact) rather than a heuristic guess.

111. **Follow-up to #110: user's screenshot of a real employee's "ประเมินตนเอง"
    page (code 90040, real assigned level set to "พนักงานสำนักงาน"/`of` in
    Add/Edit Employee) showed the form rendering as "พนักงานปฏิบัติการ"
    (`op`) instead — with "ตำแหน่ง"/"แผนก" also sitting empty — and
    separately reported "ยังไม่เห็นผลการประเมิน ที่คนก่อนประเมิน" (still
    can't see the result the previous evaluator gave).** Investigated by
    reproducing the exact chain end-to-end with Playwright (set evalLevel
    via the real Add/Edit Employee form → `onEvalCodeGateChange()`) and
    found both reports traced to **one** real mechanism, not a level-
    resolution bug: `isEligibleForSelfEval()` — the self-eval access gate
    #71 defaulted to `'restricted'` — returns `false` for this employee
    (not on the admin-managed allow-list), and `onEvalCodeGateChange()`'s
    ineligible branch disables the level buttons, shows the real "⛔ …
    ไม่อยู่ในรายชื่อ/แผนกที่กำหนด" warning, and `return`s **before ever
    calling `setEvalLevel()`**. `#formArea` (the whole scoring-form block)
    starts `display:none` on page load and is only ever shown by
    `setEvalLevel()` (line ~6186) — so on a *fresh* page load this is
    invisible and harmless, but if the viewer had just looked at a
    *different*, eligible employee's form moments earlier (very plausible
    on the admin/HR account used to spot-check several people in a row),
    `#formArea` is still sitting visible from that prior call, and the
    ineligible branch never hides it again — so the *previous* employee's
    form (wrong level, wrong name fields blank since `evalPos`/`evalDept`
    are only populated inside `setEvalLevel()`) stays fully on screen,
    reading exactly like "the system pulled the wrong form" when the
    real story is "this person is blocked from self-eval entirely, and a
    stale leftover form from someone else never got cleared." This also
    directly explains "ยังไม่เห็นผลการประเมิน" — there is no previous
    evaluator's data to see here at all; the account is blocked before
    ever reaching a real form, so nothing related to that employee was
    ever rendered — the visible table belonged to whoever was checked
    right before. Fixed by hiding `#formArea` (`style.display='none'`)
    inside the ineligible branch itself, so a blocked employee's code
    always shows *only* the red warning, never a leftover form from
    someone else. Verified with a test that opens the form for a real
    eligible employee first (confirms `#formArea` becomes visible, as
    expected), then switches to a blocked employee's code and confirms
    `#formArea` goes back to `display:none` with the correct warning
    text — the exact two-step sequence that reproduces what the
    screenshot showed. **Told the user plainly that the real, separate
    fix needed on their end is at the data-configuration layer, not
    code**: this specific employee needs to either be added to "🎯
    สิทธิ์ประเมินตนเอง"'s department/individual allow-list, or the
    eligibility mode switched back to "ทุกคนประเมินได้," before they can
    self-evaluate at all — the UI fix here only stops it from
    *misleadingly showing someone else's form*, it does not and should
    not grant access on its own. General lesson sharper than #108/#109/
    #110's own conclusions: when a UI element is conditionally shown by
    one code path (`setEvalLevel()` → `formArea.style.display=''`) but
    an *early-return guard* added later (`isEligibleForSelfEval()`, #62/
    #71) sits in front of that path without itself clearing the element,
    the guard's "return early" is not actually airtight — it blocks the
    *new* state from being set, but never erases *leftover* state from
    before the guard ran; any early-return branch added to a function
    that conditionally reveals UI must also explicitly hide/reset that
    UI, not just skip past the code that would normally show it.

112. **Follow-up to #111: user's second screenshot (same employee, 90040)
    showed the red ineligibility warning AND a fully-completed, fully-
    interactive score form side by side — "ทำแล้ว แบบฟอร์มผิด และ เวลากด
    ส่งแบบประเมิน รายละเอียดไม่ตรงและ แบบฟอร์มพิมพ์ ก็ไม่ข้อมูลไม่ครบ
    ไม่มีปีประเมิน" (did it [granted eligibility], form still wrong,
    submit-confirmation details don't match, printed form also incomplete,
    no eval year).** Two genuinely separate, previously-undiscovered bugs
    surfaced while investigating, both independent of #111's stale-form-
    visibility fix:
    - **"ตำแหน่ง"/"แผนก (Section)/ส่วน (Division)/ฝ่าย (Dept)" on the
      self-eval page were plain `<input>`s that `onEvalCodeGateChange()`
      never auto-filled** — the one field #107's "resolve by code, lock
      it" treatment (applied to `evalName`) never got extended to when
      #107 was written. So these two fields sat permanently blank on
      *every* real self-eval, for every employee, not just this one —
      exactly what "ข้อมูลไม่ครบ" (data incomplete) describes. Fixed by
      populating and locking them the same way `evalName` already is
      (`emp[7]` for position; `[emp[4],emp[5],emp[6]].join(' — ')` for
      the Section/Division/Dept chain), right next to that existing code.
    - **The "📤 ยืนยันส่งแบบประเมิน" (submit confirmation) modal's three
      summary values — "คะแนนตนเองรวม 88.00", "ส่งถึง วิชัย กล้าหาญ
      (หัวหน้า L1)", "กำหนดส่ง 20 ก.ย. 2569" — were pure hardcoded HTML,
      never populated from any real data at all**, since the feature was
      first built: every single submission by every employee, in every
      real deployment of this file, has always shown this exact same
      demo text regardless of their real score, their real supervisor,
      or any real due date — the precise CLAUDE.md #10 placeholder shape
      (looks like a real confirmation dialog, nothing behind the
      numbers), just never caught because nobody had reason to compare
      two different people's submit dialogs side by side until now.
      "เวลากดส่งแบบประเมิน รายละเอียดไม่ตรง" is explained in full by this
      alone — of course the details don't match, they were never the
      real employee's details to begin with. Fixed with
      `openSubmitConfirmModal()` (replacing the bare `openM('mSubmit')`
      call on the "📤 ส่งแบบประเมิน" button): computes the real total via
      `calcCurrentEvalSummary()` (the *same* function
      `collectEvaluationPayload()` itself uses to build the saved
      payload, never a second parallel calculation that could drift),
      resolves the real "ส่งถึง" recipient from `MASTER_USERS` by the
      real `empCode` — L1 first (`emp[9]`), falling up the chain to
      L2/approver (`emp[10]`/`emp[11]`) only if L1 is genuinely unset,
      same chain-fallback principle as CLAUDE.md #22, never a hardcoded
      name — and reads the real "กำหนดส่ง" due date from
      `getCycleSetupData().end` (the actual cycle-end date Admin set on
      the "ตั้งค่ารอบประเมิน" page), showing an honest "—" rather than a
      fabricated date when nothing has been configured yet (CLAUDE.md
      #14). Verified with a Playwright test that seeds a real employee
      with a real supervisor name and a real saved cycle-end date, scores
      all 10 factors, opens the real submit modal, and confirms all
      three values are the genuine computed/resolved numbers — plus a
      second check confirming the due date correctly falls back to "—"
      when the cycle-end setting was only typed into the DOM but never
      actually saved (`saveCycleSetup()` never called) — distinguishing
      "not yet configured" from "configured but not read," since
      `getCycleSetupData()` reads from `localStorage`, not the live form
      input — plus the standard click-sweep. **What remains unconfirmed
      as a distinct bug**: the printed form's own "ไม่มีปีประเมิน" — code
      inspection shows `printEvalForm()` already prints a real
      `FY ${getCurrentEvalCycleYear()}` badge (never truly blank, falls
      back to `'2569'`) and already resolves position/department from
      the real `MASTER_USERS` record via `u[7]`/`u[4]` (CLAUDE.md #38),
      so this complaint is most likely the same stale-form symptom #111
      already fixed (the printed form mirroring whatever was on-screen
      at the time, which was the wrong leftover form) rather than a
      separate print-specific bug — told the user to retest printing
      once eligibility is granted and the page is refreshed, and to
      report back with a fresh screenshot if the missing year still
      shows up after that, rather than guessing at a third fix blind.
    General lesson sharper than #10's own statement: a demo-data
    placeholder that happens to "look plausible" (a real-looking Thai
    name, a real-looking near-future date) is exactly the shape most
    likely to survive years of testing unnoticed — nobody double-checks
    a confirmation dialog's numbers against the record they just
    personally filled in, since the numbers *look* like they could be
    real; the way this one surfaced was a user directly comparing what
    they entered against what the dialog echoed back, which is worth
    treating as a standing check (does every confirmation dialog in this
    file actually reflect the specific record being acted on, or could
    it be the same static text for everyone) whenever a "the numbers
    don't match" report comes in, not just re-deriving the number once
    and assuming the display path is trustworthy.

113. **User asked for a delete button on the L1/L2/L3/L4 review/approval
    queue pages — clarified via two questions first (since no delete
    mechanism of any kind existed yet for evaluation records in this
    codebase, and deleting one is genuinely irreversible-ish): confirmed
    it means deleting the whole evaluation record outright (for a
    wrong-person/wrong-data entry mistake, not a one-stage "ตีกลับ"),
    and that only Admin/HR should ever see or use it.** Added one shared
    `deleteDraftByKey(key)` — `confirm()`s with the real resolved name/
    cycle/level before acting (never a silent delete), checks
    `isAdminOrSysadmin()` (new small helper, `CURRENT_SESSION_USER[2]`
    against `['admin','sysadmin']`) and refuses with a toast for every
    other role, then filters the matching record out of `getDrafts()`/
    `saveDrafts()`, logs to Audit Log, and re-renders via
    `renderWorkflowPages()`. Wired a 🗑️ button into all 5 real queue
    render functions (`renderReviewL1Queue`/`renderReviewQueue`/
    `renderGmApproveQueue`/`renderCalibQueue`/`renderApproveQueue`) —
    the two that already had a per-row action button column
    (`สอบทานแบบฟอร์ม`) got the delete button appended next to it with no
    `<thead>`/colspan change; the three that never had one
    (`gmapprove`/`calib`/`approve`, whose rows previously ended at
    grade/note with no action cell at all) got a new trailing `<th></th>`
    column and their "no rows" placeholder `colspan` bumped by 1 to
    match. The button itself is only emitted into the row HTML at all
    when `isAdminOrSysadmin()` is true — **hidden entirely for every
    other role, not just disabled**, matching the established #72/#90
    pattern (a cosmetically-disabled control is still discoverable and
    clickable via DevTools; an admin-only feature with real consequences
    should not even render in another role's DOM). **Stated honestly,
    per CLAUDE.md #39's own precedent for `deleteIdp()`**: this can only
    ever delete the **local** `localStorage` record
    (`MS365_LOCAL_DRAFT_KEY`) — there is no `graphDeleteTableRow()`
    anywhere in this codebase, so a record that was already pushed to
    the `Appraisals`/`Approvals` Excel tables leaves its Excel row(s)
    untouched; the confirm dialog itself says this plainly rather than
    implying a full delete. Verified with a test that creates a real
    `Submitted` draft via the reviewer form, confirms a non-admin
    session is refused (draft survives, real warning toast fires), then
    confirms an admin session successfully removes it and the queue
    re-renders with zero matching rows — plus the standard click-sweep.
    **Separately answered, from code with no change needed**, the user's
    accompanying verification question about concurrent edits: the real
    draft key is `empCode|cycle|level` (`draftKey()`) — not per-reviewer
    — so there is genuinely only one record per person/cycle/level; if
    two different supervisors both save for the same employee code,
    whichever save happens last silently overwrites the earlier one with
    no conflict warning (a real, already-existing limitation, not newly
    introduced here). Confirmed yes to the GM-handoff question: once a
    record reaches `GMApproved`, the real pipeline (#61) proceeds
    Acknowledge (employee) → Calibration (HR) → Final Approve (AMD/MD) →
    `Approved`, with HR genuinely driving the Calibration stage onward
    exactly as the user described.

114. **Follow-up to #109: user asked to verify the real review order
    (self → L1 → L2 → L3 → L4) and, specifically, whether an edit by one
    reviewer that overwrites a previous reviewer's work gets logged/
    notified — confirmed the pipeline is correct (Submitted → L1Reviewed
    → L2Reviewed → GMApproved → …, per #92/#61) but found a real gap:
    `submitReviewerForm()` (#109, the modal shared by the team page and
    the L1/L2 review queues) could silently overwrite a previous
    reviewer's scores with no notification and no diff log at all — only
    the self-eval save path (`saveEvaluationToMs365()`, #58) had the
    "notify the previous actor their work was edited" mechanism.**
    Asked the user exactly which direction they wanted this closed
    (notify every edit, or only specific ones) rather than guessing,
    since the wrong scope here either spams people with irrelevant
    emails or still leaves the real complaint unaddressed — confirmed:
    **"L1 แก้ไข ไม่ต้องแจ้ง ถ้า L2 แก้ ให้แจ้งมา L1"** — when the
    department head (L1) reviews/edits the employee's own self-eval
    scores (`Submitted → L1Reviewed`), that's expected and needs no
    notification; only when the section manager (L2) then
    reviews/edits those same scores (`L1Reviewed → L2Reviewed`,
    potentially overwriting what L1 just confirmed) does L1 need to
    know. Fixed inside `submitReviewerForm()` itself: captures
    `prevActor = getEvalLastActor(code, cycle)` **before**
    `pushApprovalRecordToExcel()` runs (that call immediately
    overwrites `EVAL_LAST_ACTOR_KEY` with the new actor, so reading it
    after would always return the person doing the current edit, never
    the person being notified about) — and only when `step.next ===
    'L2Reviewed'`, so an L1 edit (`step.next==='L1Reviewed'`) never
    triggers it. Reuses the exact `notifyPrevEvaluatorOfEdit()` email
    function #58 already built (best-effort, `isWorkerConfigured()`-
    gated, real email required) rather than writing a second one — the
    only gap was that nothing in the reviewer-form path ever called it.
    Added `L1Reviewed` to that function's own `stepLabel` map too (it
    predates #92's `L1Reviewed` stage and was missing it, so the email
    body would have shown the raw status string instead of a real Thai
    label). Also closed the requested diff-log half: captures `oldX`/
    `oldGrade` from the existing draft before overwriting, and appends
    "(คะแนนเดิม X=… เกรด … → ใหม่ X=… เกรด …)" to the Audit Log entry
    whenever the score/grade actually changed — visible in the existing
    Audit Log page (already real-timestamped and Excel-synced per #49),
    not a new log mechanism. Verified with a test that drives one
    evaluation through employee→L1→L2 via the real `submitReviewerForm()`
    calls: confirms L1's review sends **no** email, and L2's review
    correctly emails L1's real address — plus the standard click-sweep.
    General lesson sharper than #58's own scope: an "notify the person
    whose prior work got overwritten" mechanism built for one save path
    (self-eval) does not automatically cover every other path that can
    also overwrite the same underlying draft record — grep every
    function that calls `saveEvaluationLocal()`/mutates a draft's score
    fields directly for the same gap, and when a business rule like
    this has an asymmetric trigger (notify on L2's edit, not L1's), ask
    the user to confirm the exact direction rather than assuming
    "notify on every edit" is obviously correct.

115. **Follow-up to #114: user said "L3 กับ L4 ก็เช่นกันนะ" (L3 and L4
    too) — the #114 fix only covered the one modal path
    (`submitReviewerForm()`) and only the single L1Reviewed→L2Reviewed
    transition. Clarified via two rounds of questions (the file uses
    "L1/L2/L3/L4" in at least three different, easily-conflated senses
    — #70's hierarchy tiers, #92's nav-label numbering, and the STEP-map
    status key names in code — so guessing which one the user meant
    risked building the wrong thing twice) and confirmed the real rule
    against #70's tier definitions (L1=หัวหน้าหน่วย/role `unit`,
    L2=หัวหน้าแผนก/role `l1`, L3=ผจก.ส่วน/role `l2`, L4=GM/role `gm`):
    **"แจ้งตามลำดับ ยกเว้น L1 ไม่ต้องแจ้งใคร"** — notify the previous
    tier whenever any tier above them advances/overwrites a record, for
    every tier, **except** when the acting role is `unit` (tier L1,
    the base of the chain — nothing meaningful before them to protect).
    This reverses part of #113b/#114's narrower scoping (which exempted
    role `l1`'s own edit from notifying) — the user's final, precise
    tier definitions made clear the exemption belongs to role `unit`,
    not role `l1`.
    Extracted the shared logic into one helper, `notifyPrevTierOnAdvance(empCode,
    cycle, prevActorSnapshot)`: skips with a reason when the current
    actor's role is `unit`, skips when there's no real prior actor or
    the prior actor is the same person acting now (no self-notify), and
    otherwise reuses `notifyPrevEvaluatorOfEdit()` (#58) plus an Audit
    Log entry — never a second parallel email-sending implementation.
    Wired it into **every real chokepoint that advances the chain**,
    not just the modal: `approveReviewL1Selected()` (tier L2/role `l1`
    bulk-approving over tier L1/`unit`'s work), `approveReviewSelected()`
    (tier L3/role `l2` bulk-approving over tier L2/`l1`'s work),
    `approveGmSelected()` (tier L4/role `gm` bulk-approving over tier
    L3/`l2`'s work — the real, only way GM currently advances a record,
    since the GM queue has no score-editing modal at all), and
    `submitReviewerForm()` itself (generalized from the single
    `step.next==='L2Reviewed'` special-case to call the same shared
    helper for every transition, so Submitted→L1Reviewed now correctly
    notifies tier L1/`unit` too, not just L1Reviewed→L2Reviewed). Each
    bulk function captures every selected key's `prevActor` snapshot
    (via `getEvalLastActor()`) **before** its own `pushApprovalRecordToExcel()`
    loop runs — that call immediately overwrites `EVAL_LAST_ACTOR_KEY`
    with the new actor, so reading it after would always return the
    person who just acted, never the person being notified about (the
    same ordering care #114 already established, just needed repeating
    at every new call site rather than assumed obvious). Deliberately
    left `rejectReviewL1Selected()`/`rejectReviewSelected()`/
    `rejectGmSelected()` untouched — a reject sends the record *backward*
    to the rejected tier's own queue, which is itself the real,
    sufficient signal to that tier (they'll see it waiting there), not
    a case of "someone further up silently overwrote your work without
    you knowing." Verified end-to-end with a test driving one real
    evaluation through all 4 tiers via their actual UI mechanisms (team
    page submit → L1 queue approve → L2 queue approve → GM queue
    approve, no field ever mutated directly): confirms tier `unit`'s
    submission sends zero emails, tier `l1`'s edit emails `unit`, tier
    `l2`'s edit emails `l1`, and GM's real bulk-approve action emails
    `l2` (alongside the pre-existing, unrelated "notify the employee
    GM approved" email from #61 — confirmed both fire independently,
    not one clobbering the other) — plus the standard click-sweep.
    General lesson sharper than #114's own conclusion: when a user says
    "the same for L3 and L4," first nail down whether their L1-L4 means
    the same thing as the last fix's L1-L2 did — this file has multiple
    independent L1-L4-shaped numbering schemes already on record (#70,
    #92), and silently assuming continuity between two uses of
    "L1/L2/L3/L4" two messages apart is exactly how a clarifying
    question avoids rebuilding the wrong scope from scratch.

116. **User reported "GM ดูรายละเอียดประเมินไม่ได้ ไม่มีให้ดู" (GM can't
    view the evaluation details — there's nothing to view).** Confirmed
    from code: `renderGmApproveQueue()` (the "อนุมัติ GM" page) was the
    one real queue in the whole chain with no form-view button at all —
    `renderReviewL1Queue()`/`renderReviewQueue()` both have a
    "สอบทานแบบฟอร์ม" button opening `openReviewerForm()` (#93's real
    per-employee detail view, with the attendance/Z breakdown and all
    factor scores), but the GM queue's row only ever showed name/dept/
    X/grade plus (since #113) a delete button — GM genuinely had no way
    to see *why* a record scored what it did before approving it, only
    the bare final number. Fixed by adding a "ดูแบบฟอร์ม" button to each
    GM-queue row, calling the same real `openReviewerForm()` every other
    queue already uses — no new view, no second code path to drift out
    of sync with the real one (same "point at the existing real
    mechanism, don't build a second one" discipline as #43/#48).
    **Deliberately left the modal's own footer buttons as-is for this
    context** rather than adding a separate read-only mode: GM opening
    this form and clicking "✓ บันทึกและส่งต่อ" already correctly refuses
    with an honest toast ("ขั้นตอนนี้ไม่รองรับการบันทึกจากหน้าต่างนี้ —
    ใช้ปุ่มที่หน้ารายการแทน") since `submitReviewerForm()`'s own `STEP`
    map has no `L2Reviewed` entry (GM never advances a record through
    this modal, only through the real queue's checkbox+button per #115)
    — so nothing silently "looks saved" when it wasn't; "↩️ ตีกลับ" does
    work from here too (`rejectReviewerForm()`'s own `STEP` map already
    includes `L2Reviewed→L1Reviewed`, #109), which is a real, correct
    reject path, not a gap. Verified with a test that seeds a real
    `L2Reviewed` draft, confirms the new button renders in the GM
    queue, and confirms clicking it opens the real modal with the real
    employee's name/code in the title — plus the standard click-sweep.

117. **User's screenshot of a GM queue entry, with a caption "หน้า GM ดู
    ผลการประเมินในแบบฟอร์มไม่แสดงข้อมูลว่าเลือกอะไรบ้าง" (the GM form-
    view page doesn't show what grades were selected) — opening the new
    #116 view button showed the factor table with every row empty, no
    grade button highlighted.** First reproduced the restore chain
    end-to-end entirely in-memory (self-eval → L1 bulk-approve → L2
    bulk-approve → GM view) and it worked perfectly, which ruled out the
    restore logic itself (`restoreReviewerFormFromDraft()`, #109) being
    broken in general. The real cause only appeared when simulating the
    one extra step every record genuinely goes through for real before
    GM ever sees it: a round-trip through `ms365SyncAppraisals()` (#58)
    pulling the row back from the real `Appraisals` Excel table. Graph
    API returns a text-formatted cell's numeric-looking value as a
    **string**, not a number (the same class of type-mismatch #78
    already found for Date cells returning serial numbers instead of
    formatted text — here it's the reverse direction, a number-looking
    value arriving as the wrong JS type) — and `ms365SyncAppraisals()`
    stored the row from `graphListTableRows()` straight into
    `getDrafts()` with **zero type coercion**. The moment a draft's
    `m0..m9`/`Y`/`Z`/`X` fields became strings like `"14"` instead of
    the number `14`, `restoreReviewerFormFromDraft()`'s/
    `restoreEvalFormFromDraft()`'s reverse-lookup — `Object.keys(sc)
    .find(g => sc[g] === val)`, a **strict** `===` against a real
    `number` — could never match, so every grade button silently stayed
    unselected even though the real score data was sitting right there
    in the draft, completely intact. This explains why the bug is most
    visible specifically at the *GM* stage: by the time a record reaches
    `GMApproved`-eligibility (`L2Reviewed`), it has almost certainly been
    pulled down from Excel at least once via the 30-second auto-sync
    (#59) or a login/reload sync, while a record scored and reviewed
    entirely on one device without ever syncing (what every earlier
    #108/#109/#110 test happened to exercise) never hits this path.
    Fixed at the real ingestion point, `normalizeAppraisalRow(r)`
    (coerces array positions 4–20 — every `m`/`l`/`Y`/`Z`/`X` numeric
    field — to `Number()`, skipping `null`/`undefined`/`''` so a
    genuinely-unset leadership factor stays unset, not `0`), called on
    every row `ms365SyncAppraisals()` pulls before merging into
    `getDrafts()` — fixes this for every consumer of synced draft data,
    not just the two restore functions. Also added a defensive
    `Number(draft[payloadIdx])` coercion directly inside both restore
    functions themselves, as a second layer — if any other future
    ingestion path (a bulk import, a manual `localStorage` edit, a
    different sync source) ever writes string-typed numbers into a
    draft again, the restore still won't silently fail. Verified with a
    test that feeds `ms365SyncAppraisals()` a mocked Excel row with
    every numeric field as a string (reproducing the exact real-world
    shape), confirms the merged draft's fields are real `number`s
    afterward, and confirms GM's "ดูแบบฟอร์ม" button now shows all 10
    factors correctly selected — plus the standard click-sweep. General
    lesson sharper than #78's own conclusion: #78 fixed one specific
    external-type mismatch (a Date cell returning a serial number); this
    is the general-case version of that same risk — **any** value
    pulled from `graphListTableRows()` can arrive as a different JS type
    than the code that later reads it assumes, and a `===` strict
    comparison against that value is a silent-failure trap waiting to
    happen the moment the real data takes the "other" type. When merging
    *any* external-table row into local state that later gets compared
    by strict equality (not just string-concatenated or displayed), add
    an explicit type-coercion step at the one ingestion point rather
    than trusting whatever type Graph happened to hand back.

118. **User reported "ผลการประเมินที่ประเมินพนักงานในสังกัดไปแล้วหายไป
    ต้องแสดงให้ด้วยทุกสายบังคับบัญชา" (results already evaluated for
    subordinate employees have disappeared — must show for every level
    of the chain of command).** Traced to `renderTeamFromMaster()` (the
    "2. ประเมินทีมงาน" page) — even though it already locks `managerName`
    to the logged-in user's own name for `l1`/`unit` roles (so they only
    ever see their own team, correctly), the row list itself was still
    built from a plain 1-hop filter, `u[9]===managerName`, completely
    independent of `getMyScopedEmpCodes()` — the same shared scoping
    helper #92 had *already* extended for role `l1` to a real 2-hop walk
    (direct reports **plus** every unit head's own team reporting under
    them), specifically so a department head reviewing their whole
    department would see everyone in it. That 2-hop scope has been
    correctly driving the Dashboard/review queues/badges/notifications
    since #92 — but nobody had gone back and pointed *this* page at the
    same real scope, so a department head's team page only ever showed
    people reporting *directly* to them; anyone a unit head under them
    had already evaluated was invisible here, reading exactly like "the
    results disappeared" even though the real drafts were sitting
    correctly in `getDrafts()` the whole time. Fixed by building
    `allDirectReports` from `getMyScopedEmpCodes()` instead of the raw
    `u[9]` filter, specifically when `managerName` is locked to the
    viewer's own name (`l1`/`unit` viewing their own team) — `unit`'s
    real scope is 1-hop-only already, so this is a pure no-op for that
    role; only `l1` actually gains the second tier. Left the *other*
    mode of this same page — an L2/admin/exec picking a specific other
    manager from the `teamManagerSelect` dropdown to drill into their
    team one at a time — on its original `u[9]`-filter logic
    deliberately: that's a genuinely different use case (browsing one
    named manager's own direct team), not the "show my whole real scope
    at once" case the report was about, and changing it wasn't asked
    for. Verified with a test that seeds a real 3-tier chain (L1 →
    unit head reporting to that L1 → an employee reporting to the unit
    head) with real `Submitted` drafts for both the L1's direct report
    and the unit head's own team member, logs in as the L1, and confirms
    the team page now shows **both** — the direct report (already
    worked before) and the unit head's team member (the one that was
    genuinely missing) — plus the standard click-sweep. General lesson
    sharper than #85/#87's own conclusion ("a scoping sweep across every
    *page* is not the same as every *piece of UI*"): here the scoping
    sweep (#92) was real and correct, and even reached the *right*
    conceptual scope (`getMyScopedEmpCodes()` for `l1`) — but one
    specific page's row-building logic simply never got pointed at it,
    continuing to run its own older, narrower, hand-written filter
    sitting right next to a call to the very same scoping function
    elsewhere in the page (`populateTeamManagerSelect()` already uses
    scope-aware logic for the dropdown). Whenever a shared scoping
    helper is deliberately widened for one purpose, grep every other
    *independent* filter expression touching the same relationship
    (`u[9]===`/`u[10]===` by hand) in the same file, not just the
    functions that already call the helper — a widened helper does
    nothing for a caller that was never updated to use it.

119. **User asked: "ถ้าสาถนะอยู่ที่ดูแบบฟอร์มให้ดูอย่างเดียวไม่ต้องมีแถบ ลบ
    แก้ไข บันทึกแล้ว เพราะถือว่าส่งไปแล้ว" (if the status is at 'view
    form,' make it view-only — no delete/edit/save bar, since it's
    considered already sent).** The shared `openReviewerForm()` modal
    (`#mReview`) — used by the team page's own "ประเมิน"/"ดูแบบฟอร์ม"
    button, the L1/L2 review queues' "สอบทานแบบฟอร์ม" button, and the GM
    queue's "ดูแบบฟอร์ม" button (#116) — always showed all 4 footer
    buttons ("ปิด"/"🗑️ ล้างคะแนน"/"↩️ ตีกลับ"/"✓ บันทึกและส่งต่อ")
    regardless of which button opened it, even though the button *label*
    itself already distinguishes a real action context ("สอบทานแบบฟอร์ม"
    — L1/L2 actively reviewing, per #109) from a pure viewing context
    ("ดูแบบฟอร์ม" — the team page's already-`done` rows, and the GM
    queue, which never edits scores through this modal at all, only
    through its own real checkbox+bulk-approve button per #115).
    `submitReviewerForm()`/`rejectReviewerForm()`'s own `STEP` maps
    already refused to corrupt data in a context they don't support
    (e.g. GM's own click on "✓ บันทึกและส่งต่อ" already honestly no-ops
    with a toast, since no `STEP` entry exists for advancing past
    `L2Reviewed` from this modal) — so this was purely a UI-affordance
    gap, not a data-safety one: showing action buttons that look
    clickable but either shouldn't be used in a "just viewing an
    already-sent record" context, or genuinely do nothing when clicked.
    Added a `viewOnly` parameter to `openReviewerForm(lv,name,code,
    position,cycle,viewOnly)` — when true, hides (`style.display='none'`)
    every `.md-f` button except "ปิด" (selected via `.btn-dg`/`.btn-ok`
    class, never touching the plain `.btn` close button), and explicitly
    resets them visible (`style.display=''`) when false/omitted, so
    reopening the same modal from a different context (e.g. an admin
    checking a "done" row right after reviewing an active one) never
    leaves a stale hidden/shown state from the previous open. Wired
    `true` into exactly the two already-`ดูแบบฟอร์ม`-labeled call sites —
    `renderTeamFromMaster()`'s row button (`wf==='done'`, i.e. the exact
    same condition that already picks the "ดูแบบฟอร์ม" label) and
    `renderGmApproveQueue()`'s row button (always, since GM's label is
    always "ดูแบบฟอร์ม") — and left every `สอบทานแบบฟอร์ม`-labeled call
    site (`renderReviewL1Queue()`/`renderReviewQueue()`) with the
    parameter omitted, since those remain genuine active-review entry
    points where approving/rejecting through this exact modal is the
    real job (#109). Verified with a test opening the modal once with
    `viewOnly=true` (confirms all 3 action buttons hidden, "ปิด" still
    visible), once with it omitted (confirms all 3 visible, matching the
    L1/L2 review-queue behavior unchanged), and a third time back to
    `viewOnly=true` (confirms no leftover hidden/shown state survives
    between opens) — plus the standard click-sweep. General lesson: a
    shared modal opened from several different button labels in the same
    file is a signal to check whether its own action affordances should
    track which label opened it — the label text itself (`ดูแบบฟอร์ม` vs
    `สอบทานแบบฟอร์ม`/`ประเมิน`) had already encoded the right distinction
    as a human-facing word; the fix was teaching the modal to read that
    same distinction as a real parameter instead of showing identical
    controls under both words.

120. **User asked for an export-to-PDF button at each review/approval level
    (L1-L4 queues), and for a comment showing who last edited a record,
    with date and time, whenever an edit happened.** The single-person
    print (`printEvalForm()`) and batch print (`printBatchApproved()`)
    already existed, but there was no way to export *one specific
    record* straight from a review/approval queue row (L1/L2/GM/
    Calibration/Approve) without going through the self-eval page or
    waiting for the whole batch to reach final `Approved` status.
    Extracted `printBatchApproved()`'s per-record page-building logic
    (header/logo, employee info, factor table, Z/attendance box, HR
    note box, signature footer — all already correct and A4-tuned per
    CLAUDE.md #56) into one shared `buildEvalPrintPage(d, printDate)`,
    so the new single-record path and the existing batch path can never
    drift into two different-looking templates again (the same "one
    function builds it, every caller goes through it" discipline #30/
    #97/#101 already establish for Excel rows, now applied to a print
    template). Added `printSingleDraft(code, cycle, level)` — looks the
    record up by its real composite key (`draftKey()`'s own fields),
    builds one page via the shared function, and prints it — unlike
    `printBatchApproved()`, it does **not** require `isFinalStatus()`,
    since the whole point is exporting a record that's still mid-
    pipeline (Submitted/L1Reviewed/L2Reviewed/Acknowledged/Calibrated),
    right from the queue that's currently handling it. Added a "🖨️ PDF"
    button to all 5 real queue render functions
    (`renderReviewL1Queue`/`renderReviewQueue`/`renderGmApproveQueue`/
    `renderCalibQueue`/`renderApproveQueue`) — the two that already had
    a status badge in the header show it dynamically now too
    (`buildEvalPrintPage()` shows "⏳ {status}" instead of a hardcoded
    "✓ อนุมัติแล้ว" when the record isn't finally Approved, since #14
    says never claim something is approved when it isn't).
    For the edit-comment half: `EVAL_LAST_ACTOR_KEY` (`getEvalLastActor()`,
    #58/#114/#115) already records who performed the most recent real
    action on a record — any review/reject/calibrate/approve step,
    since every one of them goes through `pushApprovalRecordToExcel()`
    which calls `recordEvalActor()` unconditionally — with their real
    name, code, and a real ISO timestamp. `buildEvalPrintPage()` now
    shows a "แก้ไข/ดำเนินการล่าสุดโดย: {name} ({code}) · วันที่ … เวลา …
    น." box on every printed page (single or batch) whenever that
    record has at least one such action recorded — shown on both
    `printEvalForm()`'s path (via `printBatchApproved`/`printSingleDraft`
    sharing the same builder) and never fabricated or shown as an empty
    placeholder for a record nobody has touched yet (still sitting at
    `Draft`/freshly `Submitted` by the employee themselves, per #14's
    honest-empty-state rule). Verified with a test that drives a real
    record through employee-submit → L1-review via the real UI
    (`submitReviewerForm()`, never mutating a draft field directly),
    calls `printSingleDraft()` after each stage, and confirms the
    printed page's last-actor box correctly shows the L1 reviewer's
    real name after their review (not the employee's, and not stale
    from before) — plus the standard click-sweep. General lesson
    combining #56/#58: once a "who last touched this" fact is already
    tracked for one purpose (an edit-notification email, #114/#115), the
    same fact is often exactly what a "show it on the printed record"
    request needs too — check for an existing tracker before building a
    new one, and route a new print entry point through the one shared
    page-builder rather than copy-pasting the batch version's template.

121. **Follow-up to #120: user asked for the exported PDF to look like
    "พิมพ์ร่าง" (the self-eval page's own print button) and to re-verify
    all 5 L1-L4 queues actually have the export button.** Confirmed via
    grep that all 5 real queue render functions
    (`renderReviewL1Queue`/`renderReviewQueue`/`renderGmApproveQueue`/
    `renderCalibQueue`/`renderApproveQueue`, covering every real review/
    approval stage from dept-head review through AMD/MD final approve)
    already call `printSingleDraft()` from #120 — no gap there. The
    format request was real, though: `buildEvalPrintPage()` (#120) only
    reused `printEvalForm()`'s *header* (logo/company name/F-classes)
    but built a simplified 3-column factor table (factor/weight/score)
    and a plain result block — visually a different, shorter document
    than what "พิมพ์ร่าง"/"พิมพ์ใบประเมิน (PDF)" on the self-eval page
    actually produce (both call the same `printEvalForm()`, which has
    the full real SML form: an 8-column factor table with A+/A/B/C+/C
    tick-box columns via `_levelCells()`, a leadership-skill section
    heading for ldr/mgr forms, a "ส่วนที่ 3 สรุปคะแนนรวม" breakdown box,
    and a "ส่วนที่ 4 ลงนามผลการประเมิน" 4-person signature grid). Rewrote
    `buildEvalPrintPage()` to reuse `printEvalForm()`'s real section
    structure and helpers directly (`_levelCells()` for the same tick-
    box table, `_gc()` for the grade-circle color) instead of a
    simplified clone, reading every value from the stored draft `d`
    (append-position fields, `getEvalLastActor`/`getEvalHrNote`/
    `getApprovalSignature`) rather than live self-eval page state
    (`evalScores`/`currentLevel`/live `<textarea>`s), since those only
    exist for the record currently open on the self-eval page, not for
    an arbitrary past draft pulled from a queue. **Deliberately did NOT
    copy `printEvalForm()`'s "ความคิดเห็นเพิ่มเติม/Training Needs" free-
    text boxes** — those read live `<textarea>` values on the self-eval
    page and have no storage anywhere per draft record (CLAUDE.md #14 —
    would have had to fabricate blank/fake text to "match" visually).
    **Found and deliberately did NOT reuse a genuinely fake section
    while doing this comparison**: `printEvalForm()`'s own ส่วนที่ 4
    signature grid is driven by `EVAL_STS`, a module-level constant
    whose own code comment admits it outright — "ข้อมูลสถานะการประเมิน
    (จำลอง — เชื่อม workflow จริงในอนาคต)" (simulated status data —
    connect the real workflow in the future) — hardcoding 4 fake names/
    dates (`สมชาย วงศ์ดี`, `สุดา มีสุข`, `อรุณ ศิริ`, `คุณเชิดชัย`) that
    have never been real, exactly the CLAUDE.md #16 shape. This has
    been invisible in practice because `allApproved = window.
    __smlEvalApproved === true` is read from a flag nothing in the
    whole file ever sets to `true`, so `_sign()`'s `ok` branch (the one
    that would show the fake name) never fires — the grid always falls
    through to the honest branch showing each role's real resolved
    supervisor name (`empL1`/`empL2`/`empExec`, genuinely pulled from
    `MASTER_USERS`) with an "⏳ กำลังประเมิน" chip. Rather than import
    this latent landmine into the newly-rewritten `buildEvalPrintPage()`,
    added a new `_signReal(roleTh, officialTitle, ok, signedName,
    signedDate)` that takes real values as parameters instead of reading
    the fake global, with `ok` driven by the record's real
    `evalStatusRank()` (self signed once `Submitted`, L1 once past
    `L1Reviewed`, L2 once past `L2Reviewed`, final signer from the real
    `getApprovalSignature()` #39 record once `isFinalStatus()`) — so
    this new path is honest by construction and never inherits
    `EVAL_STS`'s dormant fake-data bug at all; `printEvalForm()`'s own
    `EVAL_STS` bug is left exactly as found, flagged here rather than
    fixed, since fixing it (replacing a module constant with a real per-
    stage signer lookup) is a separate task nobody asked for in this
    request. Verified with a test that submits a real record through
    the reviewer form and exports it, confirming the printed page has
    the full 8-column tick-box factor table, the leadership-section
    conditional, the Z/result/signature section structure, the real L1/
    L2/exec names resolved from `MASTER_USERS`, and — explicitly —
    none of `EVAL_STS`'s 3 fake names anywhere in the output — plus the
    standard click-sweep and a re-run of #120's own test to confirm the
    rewrite didn't regress the last-actor box. General lesson: "make X
    look like Y" is worth checking literally — a shared header class
    name (`.F`) can make two templates *feel* related while actually
    differing in every section below it; and reusing a reference
    template is also the moment to notice if that reference secretly
    still carries an old CLAUDE.md #16 mock-data bug of its own, so it
    doesn't get silently duplicated into the new code too.

122. **Follow-up to #121: user said "แก้ให้ใช้ได้จริง" (fix it so it
    actually works) — the real target was the `EVAL_STS` mock-data bug
    #121 flagged but deliberately left alone in `printEvalForm()` itself
    (the self-eval page's own "พิมพ์ร่าง"/"พิมพ์ใบประเมิน (PDF)"
    button).** Deleted `EVAL_STS` outright (per this project's "delete
    code known to be unused/fake" convention, #48/#51/#80) — it was a
    module-level constant of 4 hardcoded fake names/dates that could
    never actually render anyway, since the `approved` flag gating it
    (`window.__smlEvalApproved === true`) has no code path anywhere in
    this file that ever sets it to `true`. Replaced `_sign(key, roleTh,
    officialTitle, approved)` (which read `EVAL_STS[key]`) with a real
    `_sign(roleTh, officialTitle, ok, signedName, signedDate)` that
    takes the actual signer/date as parameters — the exact same
    function `buildEvalPrintPage()` (#121) had already built as a
    separate `_signReal()` to avoid inheriting this bug; **deleted that
    duplicate too** and pointed both callers at the one real `_sign()`,
    so there's only ever one signature-box renderer in the file now.
    `printEvalForm()` itself now resolves the real signing state before
    building its signature grid: looks up the actual saved draft via
    `getDrafts().find(d=>d[0]===empCode && d[2]===printCycle &&
    d[3]===lv)` (the same composite key `draftKey()` uses elsewhere),
    computes `liveRank = evalStatusRank(liveStatus)` and
    `allApproved = isFinalStatus(liveStatus)` from that real record
    instead of the dead window flag, and reads the real final signer
    from `getApprovalSignature()` (#39) — the same real-data sourcing
    `buildEvalPrintPage()` already used, now shared by both functions
    through the one `_sign()`. Signing thresholds mirror the real
    4-slot template both functions have always had (self/L1/L2/final —
    this form predates the later GM/Acknowledge/Calibrate stages #61/
    #92 added, so those stages still have no dedicated signature line
    in either function; a pre-existing template limitation, not
    something this fix changes): self signed once `liveRank>=1`
    (Submitted), L1 once `liveRank>=2` (L1Reviewed), L2 once
    `liveRank>=3` (L2Reviewed), final signer only once `isFinalStatus()`
    is true, using the real `getApprovalSignature()` name/date rather
    than the employee's supervisor name as a stand-in. Before any real
    submission exists at all (`liveDraft` not found, `liveRank=-1`),
    every row correctly falls back to "⏳ กำลังประเมิน" with the real
    resolved supervisor/exec names shown unsigned — the same honest
    default the dead flag accidentally produced before, just now for a
    real reason instead of a flag nothing sets. Verified with a test
    that prints the self-eval page's draft for an employee with no
    saved record yet (every row unsigned, zero fake names), then
    submits a real record through the reviewer form and reprints —
    confirms the employee's own signature line now shows
    "✓ ยืนยันแล้ว" with their real name while L1/L2/exec correctly stay
    pending (matching the record's real `Submitted` stage, not further)
    — plus the standard click-sweep and re-runs of #120/#121's own
    tests to confirm neither regressed. General lesson: when a flagged-
    but-not-fixed issue from one request ("this is also fake, but out
    of scope here") gets asked about again as "make it actually work,"
    the fix usually isn't a new feature — it's locating the one real
    data source that was already built for the sibling function (here,
    `buildEvalPrintPage()`'s own real signer logic from #121, written
    just one turn earlier) and routing the original function through
    the exact same path, deleting whichever of the two duplicate helpers
    was built on the fake data rather than keeping both around.

123. **Follow-up to #122: user said "แก้ จะลงชื่อพนักงานก็ต่อเมื่อ ส่งไปให้
    พนักงานรับทราบแล้ว" (fix it — only sign the employee once it's been
    sent to them for acknowledgment).** #122 had made the employee's
    signature line real (no longer fake `EVAL_STS`), but used the wrong
    threshold: `liveRank>=1` (`Submitted`) — true the instant the
    employee submits their *own* self-score, before anyone has reviewed
    it and long before the employee has actually seen a real result to
    acknowledge. The signature label itself says "ลงนามรับทราบผล**การ
    ประเมิน**" (sign to acknowledge the *evaluation result*) — but at
    `Submitted` there is no result yet, only the employee's own input.
    The real point the employee is shown a result and asked to
    acknowledge it is `GMApproved` (`notifyEmployeeOfApproval()` emails
    them then, per #61), and they actually sign by clicking "รับทราบผล
    การประเมิน" on the "6. ผลประเมิน" page, which calls
    `acknowledgeMyResult()` and advances the real status to
    `Acknowledged` (#60/#61). Fixed both `printEvalForm()` and
    `buildEvalPrintPage()`'s employee signature line to require
    `liveRank>=evalStatusRank('Acknowledged')` / `rank>=evalStatusRank(
    'Acknowledged')` instead of `>=1` — so the signature only shows
    "✓ ยืนยันแล้ว" once the employee has genuinely clicked acknowledge,
    matching the label's own real meaning; every earlier stage
    (Draft/Submitted/L1Reviewed/L2Reviewed/GMApproved — sent but not yet
    acknowledged) now correctly shows "⏳ กำลังประเมิน" with the
    employee's own real name as the unsigned placeholder. L1/L2/final
    signer thresholds were already correct (tied to their own real
    review/approval stage, not the employee's) and were left unchanged.
    Verified end-to-end with a test driving one real record through
    the full real UI chain (self-submit → L1 review → L2 review → GM
    approve queue's real checkbox+button → employee's own
    `acknowledgeMyResult()`), reprinting after each stage: unsigned at
    Submitted, still unsigned right after GM approves (sent but not yet
    acknowledged), and only shows the real "✓ ยืนยันแล้ว" signature with
    the employee's real name after they actually acknowledge — plus the
    standard click-sweep and re-runs of #120/#121's own tests (one of
    #121's own assertions, which expected the employee to sign at
    `Submitted`, now correctly reports `false` — that's this fix working
    as intended, not a regression, since `Submitted` was always the
    wrong stage to call "signed"). General lesson: a label like "ลงนาม
    รับทราบ**ผลการประเมิน**" describes what the signature is *for*, not
    just *that* a signature exists — when wiring a fake/placeholder
    signature up to real data, re-read the label's own wording against
    the real pipeline stage it actually corresponds to, rather than
    picking the first available real status value that happens to make
    the "ok" branch render something.

124. **User asked: "ในทุกแบบประเมิน ใส่เครื่องหมายเลือก ✓ ไม่ใช่ o" (in
    every evaluation form, use a ✓ mark for the selected grade, not an
    "o").** `_levelCells()` — the one function rendering the A+/A/B/C+/
    C tick-box cells on every printed evaluation form (self-eval
    "พิมพ์ร่าง", every per-record queue export via `buildEvalPrintPage()`
    #121, and batch print, since all three share this one helper) —
    showed `✔` only once `allApproved` (final `Approved` status) was
    true, and a plain `○` (hollow circle) for the exact same selected
    cell at every earlier stage (Draft/Submitted/L1Reviewed/L2Reviewed/
    GMApproved/Acknowledged/Calibrated — i.e. nearly every real printed
    form, since most prints happen mid-pipeline, not after final
    approval). The hollow circle read as "not yet chosen" even though
    the grade genuinely was chosen — exactly the user's complaint.
    Fixed by always rendering `✓` for the chosen cell regardless of
    `allApproved` — the function still keeps the `chk`/`chk-draft` CSS
    class distinction (approved vs. still-in-progress) so a future style
    tweak could still color them differently, but the *symbol* itself is
    now the same ✓ everywhere, matching what the user actually asked
    for. Since `_levelCells()` is the one shared function behind every
    printed form in this file, this single fix covers all of them —
    no other call site needed touching. Verified with a test that
    prints a never-submitted self-eval draft and a real `Submitted`
    (not yet approved) record exported from a review queue, confirming
    both show `✓` for the selected cell and neither contains the `○`
    character anywhere — plus the standard click-sweep.

125. **User's screenshot of a printed evaluation form's header showed the
    title line reading "แบบประเมินผลการปฏิบัติงานประจำปี ............"
    (literal dots instead of a real year) — "ไม่มีปี" (no year).**
    Grepped for this exact string and found it hardcoded, byte-for-byte
    identically, in **two** separate places: `printEvalForm()` (line
    5112, the self-eval page's own "พิมพ์ร่าง"/"พิมพ์ใบประเมิน (PDF)"
    button) and `buildEvalPrintPage()` (line 8514, the shared builder
    behind every L1-L4 queue's "🖨️ PDF" export and batch print, #120/
    #121) — a dead, literal placeholder that had never once been
    replaced with a real year in either function, even though both
    functions sit right next to code that already computes the real
    year correctly: `printEvalForm()`'s own `F-year-badge` span a few
    lines below it already calls `getCurrentEvalCycleYear()` (#60), and
    `buildEvalPrintPage()` already has a real `cycle` variable
    (destructured from the stored draft `d[2]`) in scope and uses it for
    its own `F-year-badge`. So the exact information needed to fix this
    was sitting one line away in both functions — the title line itself
    had simply never been wired to either. Fixed by interpolating
    `getCurrentEvalCycleYear()` into `printEvalForm()`'s title (matching
    its own `F-year-badge`'s fallback-to-`'2569'` pattern exactly) and
    the existing `cycle` variable into `buildEvalPrintPage()`'s title —
    deliberately using two *different* real sources, not the same call
    in both places: `printEvalForm()` reflects the self-eval page's
    *live* admin-configured "current" cycle (there is no specific
    stored record yet when this page first opens for a fresh
    self-eval), while `buildEvalPrintPage()` must reflect the *specific
    historical/in-progress record's own stored cycle* (`d[2]`), per this
    function's whole design philosophy (#120/#121) of always reading
    from the stored draft, never live "current cycle" state that could
    differ from what that one record actually belongs to.
    **Also found and fixed a related, not-separately-reported bug while
    investigating**: the self-eval page's own *on-screen* (not printed)
    header had a parallel issue — `<span>รอบ FY2026</span>`, with no
    `id` and never read or written by any JS in the file, permanently
    stuck showing the literal text "รอบ FY2026" regardless of the real
    configured cycle. Gave it `id="evalDocCycle"` and changed its
    default text to an honest `รอบ FY —` (CLAUDE.md #14's "don't
    fabricate" convention — `—` until a level is actually selected,
    not a guessed year), then wired `setEvalLevel()` (called every time
    the form opens/changes level) to set it from the same real
    `getCurrentEvalCycleYear()` call. Verified with a test that selects
    a level and confirms the on-screen span now shows the real
    configured year (not the old hardcoded "2026"), then prints both
    via `printEvalForm()` (fresh, no draft) and via `buildEvalPrintPage()`
    (through `printSingleDraft()` after a real submission) and confirms
    neither printed output contains the literal `............` string
    anywhere, and both contain the real year text `ประจำปี {cycle}` —
    plus the standard click-sweep (`nav pages clicked: 22 errors: []`).
    General lesson sharper than #60/#120's own conclusion: when a
    "year/cycle" display bug is reported against one specific element
    (a printed title), grep for the *exact same dead-placeholder string*
    across the whole file rather than assuming the report describes a
    single bug — the identical "............" sat in two independent
    functions that already had the real year available one line away,
    and a cosmetic on-screen twin of the same unwired-placeholder shape
    was sitting on the very page that opens the print function, easy to
    find once looking for "what else near this never got wired to the
    real value" rather than stopping at the one line the screenshot
    pointed at.

126. **User's screenshot of "2. ประเมินทีมงาน (L1 รอบแรก)" — logged in as
    a real `l2` (ผู้จัดการส่วน) — showed the nav badge next to that menu
    item reading "5" while the page itself showed the "เลือกหัวหน้า"
    dropdown stuck on "— ไม่มีหัวหน้าที่มีลูกทีม —" (no supervisor with
    a team) and every stat tile at 0 — "ไม่มีรายชื่อแสดง มีแต่ขึ้นว่ามี
    5 คน" (no names show, it just says there are 5 people).** This is
    the exact #73/#85/#87/#118 shape (a summary number and the detail
    view under it disagreeing) but in a new spot: `populateTeamManagerSelect()`'s
    `role==='l2'` branch — the function that builds this specific
    dropdown's options — was an **entirely independent query** from
    both `getMyScopedEmpCodes()` (which the "5" badge is correctly
    computed from, per #85) and from #86's own fix: it compared
    `u[10]===me[1]` as **raw, untrimmed strings**, the identical shape
    of bug #86 already found and fixed inside `getMyScopedEmpCodes()`
    itself — but #86 only touched that one function, not this
    *separate* dropdown-building query that happens to check the same
    relationship. It also required `u[2]==='l1'` exactly, excluding
    `unit`-role supervisors entirely — so an L2 whose direct reports
    are `unit` heads (not `l1`) rather than department heads would see
    an empty dropdown even with perfectly clean, trimmed data. Either
    gap alone reproduces exactly what the screenshot showed: `getMyScopedEmpCodes()`
    (trimmed, counts any role under the L2 by `u[10]`) correctly found
    5 scoped `emp`-role people for the badge, while this dropdown's own
    untrimmed-and-role-restricted query found zero real supervisor
    options to list, leaving nothing for the page to show no matter
    which (nonexistent) option got selected. Fixed by trimming both
    sides (`(u[10]||'').trim()===(me[1]||'').trim()`, the identical
    pattern #86 already established) and widening the role match from
    `u[2]==='l1'` to `u[2]==='l1'||u[2]==='unit'` — a unit head is a
    legitimate "pick this supervisor to view their team" option here
    too, the same as it already is for role `l1`/`unit` themselves per
    #65. Verified with a test that seeds an L2 with a clean name and
    two real supervisors (one `l1`, one `unit`) whose own `u[10]` both
    point to her, confirms `getMyScopedEmpCodes()`-driven badge shows
    the real scoped count, and confirms the dropdown now lists **both**
    supervisors as real selectable options instead of the empty
    placeholder — plus the standard click-sweep. General lesson, a
    sharper case of #86's own conclusion: fixing a name-trim bug inside
    `getMyScopedEmpCodes()` does not fix every *other* independent
    query in the file that happens to compare the same `u[9]`/`u[10]`
    relationship by hand — grep for every other raw `u[10]===`/`u[9]===`
    comparison against a session user's name whenever a trim bug like
    this is found and fixed in one place, since each one is a separate,
    equally-reachable landmine until it's fixed too.

127. **Follow-up to #126: user said "ทุกจุดที่เกี่ยวข้องปรับให้เชื่อมกัน"
    (adjust every related point so they connect/agree with each other)
    — the exact general lesson #126 closed with, acted on immediately
    rather than waiting for the next bug report to surface one at a
    time.** Grepped the whole file for every remaining raw `u[9]`/
    `u[10]`/`u[11]`/`u[19]` comparison and found two more real,
    previously-unfixed instances of the identical untrimmed-name shape,
    both inside `checkHierarchyIssues()` (the org-chart page's
    hierarchy-problem banner, #73):
    - `byName[u[1]] = u` indexed every employee by their **raw,
      untrimmed** name, and the circular-reference walk looked up
      `cur = byName[supName]` using `supName = cur[9]` — also raw,
      untrimmed. If any supervisor's own stored name (`MASTER_USERS[1]`)
      or any employee's `u[9]` pointing to them carried stray
      whitespace (the exact same real-world data shape #84/#86 already
      found twice in this file), the lookup would silently miss and the
      walk would stop early, thinking the chain simply ended — a false
      negative that would hide a *real* circular reference rather than
      reporting it, the opposite failure direction from #86's "empty
      scope" bug but the identical root cause. Fixed by trimming both
      the `byName` keys and every name read during the walk (`supName`,
      the seed value put into `seen`) before comparing or looking up.
    - `getEvaluationAssignments()`'s `l1`/`l2`/`approver` presence
      checks (`u[9] && u[9]!=='—' ? u[9] : ''`) treated a whitespace-only
      field (`" "`) as "a real supervisor is set," since a non-empty
      string of pure spaces is truthy and isn't the literal `'—'`
      sentinel — so a blank-looking but non-empty cell from a manual
      Excel edit would silently pass the "do they have a supervisor"
      check this function exists to enforce, the same `#1`/`#22` shape
      of bug just one layer more subtle (trimming matters for presence
      checks, not only identity-equality checks). Fixed by trimming
      before both the truthiness test and the `'—'` comparison.
    Verified with three targeted tests: a non-circular chain where one
    supervisor's own name carries a trailing space doesn't get
    false-flagged as circular (confirms the trim fix didn't introduce a
    new false positive), a genuine circular reference between two
    supervisors whose names also carry trailing-space variants is now
    correctly detected (confirms the previously-possible false
    negative is closed), and an employee whose L1 field is a
    whitespace-only string is now correctly flagged as "missing a
    supervisor" instead of silently passing — plus the standard
    click-sweep. **What was checked and found already consistent, so
    left untouched**: every other identity comparison against
    `u[9]`/`u[10]`/`u[19]` in the file (`getMyScopedEmpCodes()`,
    `populateTeamManagerSelect()`, `renderTeamFromMaster()`'s
    `managerName` filter, `getNotifications()`/`renderNavBadges()`'s
    scoping) was already trimmed as of #86/#88/#126; the remaining
    `u[9]`/`u[10]`/`u[11]`/`u[19]` reads in the file (`supervisorChainLabel()`,
    the employee detail view's `udL1`/`udL2`/`udApprover`/`udGM`,
    `normalizeMs365Employee()`'s sync assignment) are pure *display* or
    *write* paths, not identity comparisons a stray space can silently
    break, so they were correctly left alone rather than trimmed for no
    functional reason. General lesson: when a user explicitly asks to
    "connect every related point" right after a narrowly-scoped fix,
    treat it as a direct instruction to run the fixed bug's own stated
    general lesson across the whole file immediately — grep for the
    exact pattern that broke, categorize every hit as a real instance,
    an already-fixed instance, or a non-comparison read that doesn't
    need trimming, and fix every real instance in one pass rather than
    waiting for each one to surface as its own separate future report.

128. **User asked: "ปรับสายการบังคับบัญชา ให้เป็นไปตามที่กำหนดในข้อมูล
    พนักงาน ว่าใครประเมินบ้าง ถ้าไม่มีในตำแหน่งไหนให้ข้าม ต้องมีคนประเมิน
    อย่างน้อย 1 คน" (adjust the review chain to follow what's set in each
    employee's own record — if a tier has nobody assigned, skip it; there
    must be at least 1 real reviewer).** Asked two clarifying questions
    first, given the size of a wrong guess here (this touches the core
    approval state machine): confirmed the scope is the real 4-level
    review/approval sequence (L1Reviewed=หัวหน้าแผนก role `l1`,
    L2Reviewed=ผจก.ส่วน role `l2`, GMApproved=GM role `gm` — #92/#115's
    status-stage naming, not #70's tier-label naming, which are two
    different things per #115's own warning), and confirmed the "at
    least 1" rule means blocking submission outright + emailing Admin,
    rather than silently auto-assigning a fallback reviewer.
    **The real gap this closes**: before this fix, every evaluation
    always marched through all 3 review stages in a fixed order
    regardless of whether the specific employee being evaluated actually
    had a real person assigned at each tier. `getEvaluationAssignments()`
    (#22) already *flagged* a missing supervisor as a dashboard warning,
    but never stopped a record from being submitted or getting stuck —
    if an employee's `u[9]` (round-1 reviewer field) was empty, the
    record would sit at `Submitted` forever, since the L1 queue's scope
    (`getMyScopedEmpCodes()`'s `l1` branch, walked via `u[9]`) would
    never include them — nobody's queue would ever show it, with no
    error, no warning, nothing — a genuinely silent stuck-record bug
    that had never been reported yet only because it hadn't been hit.
    Added three resolver functions — `resolveL1Reviewer(emp)`/
    `resolveL2Reviewer(emp)`/`resolveGmReviewer(emp)` — each answering
    "does *this specific employee* have a real person at this tier,"
    the mirror-image question of what `getMyScopedEmpCodes()` already
    answers ("who does *this reviewer* see"), which nothing in this file
    computed before. `resolveL1Reviewer()` correctly handles the 2-hop
    chain `getMyScopedEmpCodes()`'s own `l1` branch already established
    (#92): if `emp[9]` names a `unit`-role person, climb one more hop
    through *that* person's own `u[9]` to find the real department
    head, matching the exact same walk logic rather than inventing a
    different one. Each resolver also returns `null` (no review needed
    at that tier) when the evaluee's own role is already at or above
    that tier (`l1` role skips needing an `L1Reviewed`-tier reviewer,
    `l2` skips L1+L2, `gm`/`exec`/`admin`/`sysadmin` skip all three) —
    mirroring CLAUDE.md #22's own "a role doesn't need a reviewer above
    a level it already occupies" rule. **Explicitly exempted `gm`/`exec`/
    `admin`/`sysadmin` from the new "must have ≥1 reviewer" block
    entirely** (`hasAnyRealReviewer()`'s own early-return) — without
    this, a GM's own self-evaluation would always compute zero possible
    reviewers (since all three resolvers correctly return `null` for a
    `gm`-role evaluee) and the new block would have permanently
    prevented every GM from ever submitting their own self-eval, which
    is clearly not what "block when nobody's assigned" was meant to
    catch — caught by a test specifically checking a GM's submission is
    never blocked, written *because* the first draft of this logic
    would have failed it.
    `skipEmptyReviewStages(empCode, cycle, level)` is the actual
    "skip forward" mechanism: walks `Submitted → L1Reviewed → L2Reviewed
    → GMApproved` one step at a time, and at each step checks whether
    the *next* stage has a real resolver — if not, the status jumps
    straight to that stage's name (meaning "treated as if that tier's
    review already happened," landing the record in whichever next
    tier's real queue, since every queue already filters purely by
    status string) and the loop keeps walking until it reaches a stage
    that *does* have a real reviewer waiting, or runs out of stages.
    Wired into the three real chokepoints that ever set a draft's status
    into this range: `updateDraftStatus()` (covers every bulk approve
    function — `approveReviewL1Selected()`/`approveReviewSelected()`/
    `approveGmSelected()` — with one change, the same single-chokepoint
    discipline CLAUDE.md #94 already established), `saveEvaluationToMs365()`
    (the self-eval page's own "ส่งแบบประเมิน," called right after the
    local save so it works even when MS365 isn't configured — the skip
    logic operates purely on local `getDrafts()`/`saveDrafts()`, no
    network dependency), and `submitReviewerForm()` (the modal shared by
    the team page and L1/L2 review queues, #109) — the three places a
    status can ever land on `Submitted`/`L1Reviewed`/`L2Reviewed`.
    The **submission-blocking half** is wired into the same two real
    "first submission" chokepoints: `saveEvaluationToMs365('Submitted')`
    checks `hasAnyRealReviewer(emp)` before saving anything at all and
    returns `{blocked:true}` (which `submitEvalOnline()` now checks to
    keep the confirm modal open instead of closing it, so the warning
    toast stays visible rather than vanishing with the modal), and
    `submitReviewerForm()`'s `Draft→Submitted` branch does the identical
    check before writing anything. Both call a new
    `notifyAdminOfMissingReviewChain(payload)` — same best-effort/
    `isWorkerConfigured()`-gated honesty rules as every other admin
    email in this file (#26/#40/#58) — telling Admin exactly which
    employee is blocked and why, so the person stuck can't submit *and*
    someone who can actually fix it (adding a supervisor via Add/Edit
    Employee) gets told automatically, rather than the employee having
    to separately go report "I can't submit" through some other channel.
    Verified with four targeted tests: an employee with all three tiers
    genuinely empty is blocked outright (no draft record created at
    all, not even a stuck local one), an employee with only a real L2
    reviewer (no L1, no GM) auto-skips straight past the L1 stage on
    submission and lands correctly in the L2 queue, a GM submitting
    their own self-eval is never blocked despite having zero resolver
    matches, and a normal employee with a genuinely complete chain
    submits exactly as before with no skip at all (regression check) —
    plus a second test confirming the skip also fires correctly mid-
    pipeline through the real bulk-approve chokepoint (`updateDraftStatus`)
    when an L1 reviewer exists but the L2 tier is empty: after the real
    L1 approval, the record auto-skips `L2Reviewed` straight to the GM
    queue — plus the standard click-sweep. **What was deliberately left
    unchanged**: `getEvaluationAssignments()` (#22) still computes its
    own separate "missing supervisor" dashboard warning independently —
    it answers a different question (assignment *completeness* for
    display) than the new submission-blocking check (can this specific
    record actually be submitted right now), and the two were already
    allowed to disagree in principle (e.g. an `l1`-role employee missing
    both L2 and approver shows as incomplete there, while under the new
    rule they'd still be blocked from self-eval since GM is their only
    remaining real tier and it might also be empty) — not worth merging
    into one check for this request. General lesson: a workflow-shape
    change this size ("skip missing tiers, block on zero") is worth
    building as a small set of named, independently-testable resolver
    functions answering "does this specific record have what it needs"
    rather than threading ad-hoc empty-checks through every approve
    function by hand — the same discipline #94 already established for
    "one shared status-transition chokepoint," applied one layer deeper
    to "one shared reviewer-resolution chokepoint" feeding it.

129. **Follow-up to #128: user's screenshot of the org-chart page showed
    the red "พบปัญหาสายบังคับบัญชา 10 รายการ" banner (and a "35" nav
    badge next to it) still appearing after #128 shipped — "ยังไมีแจ้ง
    เตือนอยู่" (there's still an alert showing), which I read on first
    glance as "did #128 not actually work." Asked a clarifying question
    before touching anything, since the honest answer could easily be
    "this is a different, unrelated feature, not a regression of #128."**
    The user's own follow-up confirmed exactly that question: "ทำไม
    แบนเนอร์นี้ยังขึ้นอยู่ หลังจากที่เพิ่งแก้ให้ข้ามระดับที่ไม่มีหัวหน้า
    ได้แล้ว" (why does this banner still show, after we just fixed
    skipping levels with no supervisor). Traced both features and
    confirmed they are genuinely independent, by design, not a missed
    spot: `checkHierarchyIssues()` (#73/#127) answers "is the employee
    master data complete" (does every active employee have a real L1
    name, is any supervisor chain circular) — a pure data-quality
    diagnostic over `MASTER_USERS` that has nothing to do with whether
    an evaluation can be submitted. #128's `hasAnyRealReviewer()`/
    `skipEmptyReviewStages()` answer a completely different question —
    "can *this specific evaluation record* still move through the real
    approval pipeline despite a missing tier" — and #128 explicitly
    does NOT touch `MASTER_USERS` or `checkHierarchyIssues()`'s own
    counting logic at all; it only changes how a draft's *status*
    advances. So an employee missing a real L1 name correctly still
    shows up in this banner (the data genuinely is incomplete — that
    fact didn't change), while that same employee's evaluation now
    correctly auto-skips the empty tier and keeps moving instead of
    getting stuck (#128's real fix). Both are true and correct at once
    — the banner was never a symptom of #128's bug, and #128 was never
    meant to make this banner stop firing. The *real* problem, once this
    was clear, was the banner's own wording: it reads exactly like an
    urgent blocking error ("พบปัญหา," a red `al-e` severity class,
    identical styling to a real blocking alert elsewhere in this file)
    with zero indication that, as of #128, this condition no longer
    blocks anything — so Admin reading it has every reason to panic
    about an evaluation being stuck, when the real, current behavior is
    "the evaluation already kept moving on its own; this is purely a
    'please go complete this data when you get a chance' housekeeping
    note." Offered the user 3 options (soften the wording in place;
    leave wording as-is but add a one-line note the skip already
    happened; or remove the banner's sense of urgency and demote its
    visual severity) — user picked softening the wording specifically
    so Admin doesn't mistake it for an urgent blocker.
    Fixed in `checkHierarchyIssues()` (line ~2207 for the container,
    ~9040 for the function): downgraded the banner's own CSS class from
    `al-e` (red/error — `background:#fef2f2;color:#b91c1c`, the same
    severity as a genuine blocking error banner elsewhere in this file)
    to the real existing `al-w` (amber/warning —
    `background:#fffbeb;color:#b45309`, already used by e.g.
    `#dashDeadlineBanner`) — a data-completeness reminder that no longer
    blocks anything is a warning, not an error, and the file already has
    a real warning severity class rather than needing a new one invented
    for this. Reworded the banner text itself from "พบปัญหาสายบังคับบัญชา
    N รายการ — ..." to "พบข้อมูลสายบังคับบัญชาไม่ครบ N รายการ — ... (ไม่
    กระทบการส่ง/สอบทานแบบประเมิน — ระบบจะข้ามขั้นตอนที่ไม่มีผู้สอบทานให้
    อัตโนมัติ แต่ควรกรอกข้อมูลให้ครบเพื่อความถูกต้องของผังองค์กรและสาย
    อนุมัติ)" — swapping "ปัญหา" (problem) for "ไม่ครบ" (incomplete) and
    stating plainly, in the user's own words, that it does not affect
    evaluation submission/review (since #128 already handles that),
    while still giving a real, honest reason to complete it anyway (an
    accurate org chart and approval chain) rather than implying the
    banner itself is now pointless and should be ignored outright —
    CLAUDE.md #14's "don't let a UI claim something false" cuts both
    ways: it must not overstate severity, but also must not understate
    why the data still matters. **Checked every other place this same
    fact is displayed**, per the established #34/#49/#67/#73/#85/#87
    discipline of "grep every independent spot a shared fact is shown,
    not just the one in the screenshot" — found two more: the manual
    "ตรวจสอบอีกครั้ง" button's `smlToast` (line ~9079) and the
    notification bell's own line (`getNotifications()`, line ~9107,
    itself already independently flagged in #87 for a *different*
    scoping bug). Both reworded to the same shorter clarifying phrase,
    "(ไม่กระทบการส่งแบบประเมิน)" — kept deliberately terser than the
    persistent banner's full explanation **on purpose, not as an
    oversight**: a toast is transient (a few seconds on screen) and the
    notification-bell line sits in a tightly-packed list of several
    other real alerts, so neither has the visual room for the banner's
    full "ระบบจะข้ามขั้นตอนอัตโนมัติ...ความถูกต้องของผังองค์กร..."
    explanation — the short form carries the one fact that actually
    prevents the panic (this doesn't block anything) and defers the
    full "why it still matters" explanation to the one place (the
    banner itself, reached by clicking either of these) that has room
    for it. Deliberately did **not** touch `checkHierarchyIssues()`'s
    actual `noL1`/`circular` computation, its `getMyScopedEmpCodes()`
    scoping (#127), or #128's resolver/skip functions at all — this was
    purely a severity/wording fix on an already-correct diagnostic, not
    a logic change, and conflating the two in one pass would have risked
    silently changing *what counts* as a hierarchy issue while only
    being asked to change *how alarming it sounds*. Verified with a test
    that seeds an employee with no real L1 and confirms: the banner's
    container now carries `al al-w` (not `al-e`), its text contains the
    new "ไม่กระทบการส่งแบบประเมิน" clarification, and `getNotifications()`'s
    own hierarchy-count line carries the matching shorter clarification
    too — plus the standard click-sweep (`nav pages clicked: 22 errors:
    []`). General lesson sharper than #73's own conclusion: when a user
    reports "this alert is still showing" right after a fix that changed
    *behavior* (not the alert's own underlying data), first check
    whether the alert and the fix are actually answering the same
    question at all — #128 fixed "can the evaluation still proceed,"
    this banner has always answered "is the master data complete," and
    both can be simultaneously, correctly true; the real fix the report
    was pointing at wasn't logic, it was that a now-non-blocking
    condition was still dressed in blocking-error styling and wording
    with no indication the underlying risk it used to represent had
    already been defused by a separate, more recent fix.

130. **User's screenshot of "2. ประเมินทีมงาน (L1 รอบแรก)" — logged in as
    a real `l2` (ผู้จัดการส่วน, นางสาวโชสิญา ดานเรื่อง) — showed the nav
    badge reading "5" while the "เลือกหัวหน้า" dropdown was stuck on
    "— ไม่มีหัวหน้าที่มีลูกทีม —" and every stat tile at 0, with
    "ต้องปรับหมวดของการประเมินให้สอดคล้องด้วย ยังไม่เห็นใบประเมิน"
    (the evaluation category needs to be made consistent too — still
    don't see the evaluation form). Asked a clarifying question before
    touching code, since the honest diagnosis could point to two very
    different real causes: either the 5 pending employees genuinely have
    no real L1/unit supervisor at all (which would make the empty
    dropdown *correct*, not a bug), or something else.** Confirmed from
    code first: `navBadgeTeam` (#85) counts every `role==='emp'` within
    this L2's scope (`getMyScopedEmpCodes()`, which resolves via `u[10]`
    per #86/#88) still sitting at Draft/no-draft — a broad "round-1
    pending" count with no requirement that a real L1/unit tier exists
    for them. `populateTeamManagerSelect()`'s `l2` branch (#126), by
    contrast, only lists *real* `l1`/`unit`-role supervisors whose own
    `u[10]` points to this L2 — so if these 5 employees' `u[9]` (round-1
    reviewer field) is empty, skipping the L1 tier entirely and
    reporting straight to this L2 via `u[10]`, the dropdown is correctly
    empty: there is no real supervisor to pick, even though the badge
    (counting raw emp-role people, not "people with a real L1 tier")
    still shows 5. Asked the user to confirm this exact shape and offered
    3 directions; **user chose "ให้ L2 ดู/ประเมินแทนในหน้านี้ได้เลยถ้า
    ไม่มี L1"** (let L2 view/evaluate directly on this page when there's
    no L1) — not a badge-only fix, a real new capability on this page.
    This maps directly onto #128's own resolver functions:
    `resolveL1Reviewer(emp)` already answers "does this specific employee
    have a real L1-tier reviewer" (used to decide whether their status
    auto-skips `L1Reviewed`), so "no real L1" here is defined as
    `!resolveL1Reviewer(u)` — the *same* test #128's skip logic already
    uses, not a fourth independent query that could drift from it later
    (the #126/#127 lesson, applied proactively this time instead of
    found as a bug afterward).
    Added a virtual dropdown option, `__noL1__` ("👤 พนักงานไม่มีหัวหน้า
    L1 (ขึ้นตรงกับฉัน) — N คน"), shown only for role `l2` and only when
    at least one such employee exists (`sel.dataset.noL1Count`, computed
    in `populateTeamManagerSelect()` as `MASTER_USERS` filtered to
    active, role `emp`/`unit` only, `!resolveL1Reviewer(u)`, and
    `resolveL2Reviewer(u)` resolving back to this exact L2 by code —
    never by name string, avoiding yet another untrimmed-name landmine
    per #86/#127's own lesson, since `resolveL2Reviewer()` already does
    its own trimmed lookup internally and returns the real row). **Role
    restricted to `emp`/`unit` only, found and fixed during testing**:
    a first draft filtered purely by `!resolveL1Reviewer(u)` and matched
    L2 by `u[10]`, which also pulled in real `l1`-role department heads
    themselves — `resolveL1Reviewer()` correctly returns `null` for role
    `l1` too (CLAUDE.md #22's "a role doesn't need a reviewer above a
    level it already occupies" rule), but that answers a *submission-
    pipeline* question, not "should this person appear as a team-page
    row L2 fills in for" — an `l1` department head submits their own
    self-eval via "1. ประเมินตนเอง" like everyone else, they are never a
    row someone else scores on their behalf. A Playwright test caught
    this exact miss (a synthetic `l1` row appeared in the no-L1 list
    alongside 5 real `emp` rows) before it shipped, which is why the
    role filter is explicit and commented rather than reusing the bare
    resolver check. `renderTeamFromMaster()` branches on
    `managerName==='__noL1__'`: subtitle reads "พนักงานที่ไม่มีหัวหน้า L1
    ตัวจริง — ขึ้นตรงกับคุณ (ผจก.ส่วน) โดยตรง ประเมินแทนหัวหน้า L1 ได้ที่
    นี่" (directly answering "หมวดของการประเมิน" — the category of this
    group is now named honestly instead of silently falling into the
    generic "เลือกหัวหน้าเพื่อดูทีมงาน" placeholder), and `allDirectReports`
    is built from the identical resolver-based filter, not a separate
    name-matching query — every row then flows through the exact same
    `openReviewerForm()`/`submitReviewerForm()` path every other team-
    page row already uses (#109), so scoring one of these employees
    creates a real `Submitted` draft, which #128's `skipEmptyReviewStages()`
    (already wired into `submitReviewerForm()`) immediately advances to
    `L1Reviewed` — landing the record directly in this same L2's own
    real review queue ("4. สอบทานผู้จัดการส่วน (L3)"), exactly mirroring
    what a real L1 supervisor's round-1 entry + the employee's own L1
    review would have produced, just compressed into one person doing
    both roles since there's genuinely nobody else in the chain. Verified
    with two tests: one seeding an L2 with 5 real no-L1 employees plus
    one normal L1-backed employee, confirming the dropdown shows both
    the special option (labeled with the real count, 5 — not 6, after
    the role-filter fix) and the real supervisor option, and that
    selecting each produces the correct, non-overlapping row set; a
    second test driving one no-L1 employee through the real UI
    (click "ประเมิน" → score all 10 factors → `submitReviewerForm()`)
    and confirming the draft's real status lands on `L1Reviewed` exactly
    as the skip logic promises — plus the standard click-sweep. General
    lesson sharper than #126's own conclusion: when a user approves
    building a genuinely new capability (not just a bug fix) that needs
    to answer "does this specific person have a real reviewer at this
    tier," reach for the resolver functions a prior fix (#128) already
    built for that exact question rather than writing a fresh ad-hoc
    filter — and when reusing a resolver whose `null` return covers
    multiple distinct real reasons (a role already past that tier, vs. a
    role that genuinely has nobody assigned), re-derive which of those
    reasons actually belongs in the new UI before shipping, since a
    quick test that scores every visible row is often the fastest way to
    catch a resolver answering a *different* question than the feature
    actually needs.

131. **User's screenshot of the reviewer form's "ส่วนที่ 2 — ความคิดเห็นและ
    แผนพัฒนา" section (จุดเด่น/ผลงาน · สิ่งที่ควรพัฒนา) asked: "ใบประเมิน
    ให้ดึง comment มากคนประเมินคนก่อนมาด้วย" (the evaluation form should
    also pull in the comment from the previous evaluator).** Investigated
    before writing any code: these two `<textarea>`s inside
    `openReviewerForm()` (line ~9748) had **no `id`, were never read by
    `submitReviewerForm()`, and were never restored on reopen** — exactly
    the CLAUDE.md #16/#10 placeholder shape #121 had already flagged for
    the *self-eval page's* equivalent boxes ("ความคิดเห็นเพิ่มเติม" —
    deliberately left unwired then since nobody had asked). So the real
    starting point was worse than "doesn't carry forward" — these
    comments were never saved anywhere at all, by any reviewer, ever;
    there was no "previous evaluator's comment" in existence yet for any
    real record. Fixing "pull in the previous comment" required first
    making the comment itself a real, persisted thing.
    Added `EVAL_COMMENTS_KEY` (`smlPmsEvalComments`), following the exact
    `EVAL_HR_NOTE_KEY`/`EVAL_LAST_ACTOR_KEY` (#39/#58/#96) key shape —
    keyed `empCode|cycle`, but one layer deeper than those: a **map of
    stage → entry** (`{by, byCode, byRole, at, strength, dev}`), since
    unlike a single HR note or a single last-actor, a comment history
    genuinely has one real entry *per pipeline stage* (employee's own
    round-1 → หัวหน้าแผนก's L1Reviewed → ผจก.ส่วน's L2Reviewed → GM's
    GMApproved) — using the exact same `EVAL_STATUS_ORDER` stage names
    already used throughout the file (not a new L1-L4 numbering scheme,
    per #115's own warning about this file having multiple conflicting
    "L1-L4" senses). `saveEvalCommentStage()` **overwrites** the one
    entry for a given stage on each save (not append) — so re-saving a
    Draft before actually submitting never piles up duplicate history
    entries (CLAUDE.md #12's dedup-on-write rule) — but a *different*
    stage's entry, once written, is never touched again by a later
    stage's save. Silently skips writing anything when both fields are
    blank (CLAUDE.md #14/#54's honest-empty-state rule — no placeholder
    row for a reviewer who wrote nothing).
    Wired into the two real places a comment can originate: (1)
    `saveEvaluationToMs365()` — the self-eval page's own "ส่งแบบประเมิน" —
    reads `evalStrengths`/`evalDevelopment` (the existing, previously-
    dead ids from #121) and saves them at stage `'Submitted'`, **only**
    when actually submitting (not on every "บันทึกร่าง" draft save, so an
    unfinished draft's half-typed comment can't clobber a stage that's
    meant to represent "what the employee finally said when they
    submitted"); (2) `submitReviewerForm()` — now reads the newly-`id`'d
    `#reviewStrength`/`#reviewDev` and saves them at stage `step.next`
    (whichever status this exact submit produces — `Submitted`/
    `L1Reviewed`/`L2Reviewed`), resolving the writer's real name/code/
    role from `CURRENT_SESSION_USER` (never a free-typed string, per
    CLAUDE.md #1/#107's own precedent for this exact modal). Both call
    sites resolve identity from the real logged-in session, matching
    every other "who did this" field already in this file (#58's
    `EVAL_LAST_ACTOR_KEY`, #96's calibration note).
    Added `buildPrevCommentsHtml(empCode, cycle)` — one shared renderer
    (not two independent copies, matching #30/#97's "one function builds
    it, every caller goes through it" discipline) producing a read-only
    history block, one card per stage that actually has a saved entry
    (skips stages with nothing written, same honest-empty-state rule),
    showing who wrote it, when, and both fields. Wired into **both** real
    places a reviewer/employee opens a form against an existing record:
    `openReviewerForm()` (reviewer modal, shown above the current
    reviewer's own blank "ส่วนที่ 2" input boxes — deliberately read-only
    history, never pre-filled into the editable boxes themselves, so one
    person's words can never silently become attributed to the next
    person who edits that box) and `onEvalCodeGateChange()` (the self-
    eval page, into a new `#evalPrevCommentsBox` container right above
    `evalStrengths`/`evalDevelopment` — covers the real case of an
    employee reopening their own form after a reject with a comment
    attached, so they can see what the reviewer actually said before
    trying again, not just a bare "ตีกลับ" status with no context).
    Verified end-to-end with a test driving one real record through the
    actual UI (self-submit with real comments → confirm saved at stage
    `Submitted` → L1 opens the reviewer form and confirms the employee's
    own comment is visible in the history block → L1 scores, writes their
    own comment, and submits → confirms their comment is saved at stage
    `L1Reviewed` under their real name → reopening the form again
    confirms **both** the employee's and L1's comments now show together
    in the history) — plus the standard click-sweep. **Deliberately not
    built, flagged rather than assumed out of scope**: this is local-only
    (like `pinHash`/`evalLevel`/`EVAL_HR_NOTE_KEY` before its own Excel
    round-trip was separately requested, #17/#39/#96) — a comment written
    on one device won't appear on another device's copy of the same
    record until a real `Appraisals`/`Approvals`-style Excel column is
    added for it; not built here since it wasn't asked for, and doing so
    blind risks the same #97-shaped "guessed column order" bug this file
    has hit more than once. General lesson combining #96/#107/#121: when
    a request says "pull forward the previous X," check first whether X
    is actually being saved anywhere at all — a chain of "the next step
    should see what came before" is often the signal that reveals the
    first step was never real to begin with, and the honest fix is
    building the one shared persist+display path both ends need, not
    patching the display side onto data that doesn't exist yet.

132. **Follow-up to #131: user asked "ทำ syny ขั้น excel และ คนใหม่ที่
    comment ก็เก็บไว้ และ ลงชื่อไว้ด้วยว่าใคร" (do the Excel sync step
    too, and if a new person comments also keep it, and sign who wrote
    it).** Two real gaps in #131's own design, both fixed together:
    - **"เก็บไว้" (keep it) meant #131's storage shape was wrong, not
      just missing sync.** `saveEvalCommentStage()` stored exactly *one*
      entry per stage and **overwrote** it on every save — correct for
      "the same person edits their own comment again before moving on"
      (CLAUDE.md #12's dedup-on-write rule), but wrong the moment a
      *different* person later writes at the same stage (e.g. a record
      rejected back to `Submitted` and re-reviewed by a different
      department head than the first time) — the second person's save
      would silently discard the first person's real comment with no
      trace. Changed the store from one-entry-per-stage to an
      **array-per-stage**: `mergeEvalCommentEntry()` only replaces an
      existing entry when its `byCode` matches the new one (same person
      editing their own prior entry at that stage); a different
      `byCode` is appended, never overwritten. "ลงชื่อ" (sign who wrote
      it) was already true for the single-entry version (#131 already
      resolved `by`/`byCode`/`byRole` from `CURRENT_SESSION_USER`, never
      a free-typed string, per CLAUDE.md #1) — carried forward
      unchanged into every array entry, so a stage with 2 comments now
      shows both authors' real names, not one overwriting the other's
      byline. `buildPrevCommentsHtml()` updated to loop every entry per
      stage instead of assuming exactly one.
    - **"sync ขั้น excel"**: reused the *same* `Approvals` table #39/#96
      already read/write (no new Excel table, same reasoning both of
      those established — a comment/note is naturally "current state
      attached to an existing approval event," not a new kind of row).
      `saveEvalCommentStage()` now returns the formatted comment text
      (`formatEvalCommentText()`, `"จุดเด่น: … / พัฒนา: …"`) instead of
      void, and both real write call sites — `submitReviewerForm()` and
      `saveEvaluationToMs365()` — fold that text into the **same**
      `pushApprovalRecordToExcel()` call that already logs the step
      transition (prefixed `"| ความเห็นผู้ประเมิน: …"`, a distinct marker
      from #96's `"| หมายเหตุ: …"` and #39's `"ลงนามโดย …"`, so the three
      never collide when parsed back) — never a second, duplicate
      Approvals row for the same action (the #97/#42-shaped mistake of
      pushing two rows where one event happened). **One new wrinkle
      found and handled**: `saveEvaluationToMs365()` (the self-eval
      page's own "ส่งแบบประเมิน") had **never once** called
      `pushApprovalRecordToExcel()` for the `'Submitted'` step at all
      (#58 only wires that function into review/reject/calibrate/
      approve actions) — so there was no existing push to fold a comment
      into. Added a push for this one step, but **only when the
      formatted comment text is non-empty** — a plain submission with no
      comment written produces exactly the same (zero) Excel/audit
      footprint as before this fix; only a submission that actually
      carries real comment text starts a new `Approvals` row (and, as a
      side effect of `pushApprovalRecordToExcel()`'s own existing
      `recordEvalActor()` call, starts populating `EVAL_LAST_ACTOR_KEY`
      for a plain self-submit too, which it never did before — a small,
      arguably-correct side effect, called out here rather than left
      silently discovered later).
      `ms365SyncEvalComments(silent)` — the pull side, mirroring
      `ms365SyncHrNotes()`/`ms365SyncApprovalSignatures()` structurally
      — reads the whole `Approvals` table, filters rows whose step is
      one of the four real comment stages, parses the `"| ความเห็น
      ผู้ประเมิน: …"` suffix back into strength/dev, **resolves the
      writer's `byCode` from `MASTER_USERS` by the stored name** (the
      Comment column has no code column, only the name #97's fix
      already writes there — same CLAUDE.md #1 "resolve by code, never
      trust the string" principle applied on the *read* side this time,
      since without this the same-person dedup in
      `mergeEvalCommentEntry()` couldn't recognize "this is the same
      author's edit" against a locally-saved entry that does have a real
      code), and merges each row through the exact same
      `mergeEvalCommentEntry()` the local save path uses (never a
      second, parallel merge implementation that could drift). On a
      genuine same-author tie between a local and a synced copy, keeps
      whichever has the later `at` timestamp — never assumes the synced
      copy is newer just because the sync ran (same caution #58's own
      Appraisals merge already applies). Wired into both silent-sync
      groups (`doLogin()`/`tryRestoreSession()`), right next to
      `ms365SyncHrNotes()`. Verified with a 6-assertion test driving a
      real multi-reviewer scenario end-to-end: employee self-submits
      with a comment → L1-A reviews with their own comment (stored
      correctly, 1 entry) → record rejected back to `Submitted` → a
      **different** L1-B reviews the same `L1Reviewed` stage with a
      different comment → confirms **both** L1-A's and L1-B's comments
      survive side by side (2 entries, not 1 overwriting the other) →
      L1-B edits their own comment again at the same stage → confirms
      their own entry is replaced in place (still 2 entries total, not
      3) → a mocked `Approvals` row in the real 7-column shape (#97) is
      fed through `ms365SyncEvalComments()` and confirms it merges in
      correctly with the real author resolved by name — plus the
      standard click-sweep. General lesson sharper than #131's own
      conclusion: "pull in the previous evaluator's comment" sounds like
      a read-side feature, but a user's very next follow-up ("keep the
      new person's comment too, and sign it") revealed the *write-side*
      storage shape itself was still wrong — a single-slot-per-stage
      store silently loses history the moment more than one real person
      ever writes at the same stage, which a single first-pass test
      (one employee, one reviewer, one pass through the pipeline) will
      never catch; a comment-history feature needs a multi-author test
      from the start, not just a two-stage happy path.

133. **User reported "ถ้ามีการตีกลับแบบฟอร์ม คนที่รับต่อจะต้องประเมินใหม่
    โดยข้อมูลยังแสดงผลเดิม" (if a form is rejected, the person who
    receives it next must re-evaluate, while the data still shows the
    previous result). Asked two clarifying questions before touching
    code, since the real UI mechanics needed confirming first: (1)
    confirmed the exact bug — `restoreReviewerFormFromDraft()` (#109)
    re-ticks the old, already-rejected scores every time the reviewer
    modal reopens, and clicking "✓ บันทึกและส่งต่อ" with zero changes
    silently resubmits that same rejected set; (2) confirmed what
    "ข้อมูลยังแสดงผลเดิม" should mean — keep the old scores visibly
    ticked (don't blank them, which would lose the real reference data),
    but require an explicit confirm or a real edit before the submit
    button works.** Added `EVAL_NEEDS_RECONFIRM_KEY` (a `localStorage`
    `Set` of `draftKey()` strings — `empCode|cycle|level`, the exact
    key shape every status/comment store in this file already uses) —
    `markNeedsReconfirm(key)` is called from all four real reject
    functions (`rejectReviewerForm()`, `rejectReviewL1Selected()`,
    `rejectReviewSelected()`, `rejectGmSelected()`), each using the same
    `draftKey`/checkbox-`value` string already in scope at that call
    site rather than reconstructing it, so this can never drift from
    what the status-change itself already used as its key.
    `openReviewerForm()` — right after `restoreReviewerFormFromDraft()`
    re-ticks the old scores — now checks `needsReconfirm(empCode|cycle|
    level)`: if true, a new `#reviewerReconfirmNote` warning banner
    (`al al-w`, matching #129's established severity-class convention)
    is inserted above the factor table explaining the scores are the
    pre-reject values, the real "✓ บันทึกและส่งต่อ" button
    (`#reviewerSubmitBtn`) is `disabled`, and a new, visible-only-then
    "✓ ยืนยันว่าตรวจสอบแล้ว" button (`#reviewerConfirmBtn`) appears as
    the explicit "I looked at this" action. **Two ways to clear the
    pending state, both funneling through one shared `unlockReviewerSubmit()`**:
    clicking the explicit confirm button, or genuinely editing any
    factor's grade — `selectReviewScore()` gained a 4th `isRestore`
    parameter so it can tell the difference between "the restore
    function re-ticking old scores on open" (the HTML's own
    `onclick="selectReviewScore(this,'${g}',${sc[g]})"` never passes a
    4th arg, so a *real* user click is naturally `isRestore=undefined`/
    falsy) and "a genuine new click" — only the latter calls
    `unlockReviewerSubmit()`, while `restoreReviewerFormFromDraft()`'s
    own internal call now explicitly passes `isRestore=true` so ticking
    the old scores back on open can never accidentally self-clear the
    very flag it's supposed to respect. `submitReviewerForm()` itself
    also re-checks `needsReconfirm()` as defense-in-depth (CLAUDE.md
    #55's "the UI-level lock is not the only place that must enforce
    this" instinct) — a disabled button is a UI convenience, not a real
    guarantee, so the function that actually writes the record refuses
    independently with its own toast if the flag is somehow still set.
    Verified with two end-to-end tests driving the real UI (no field
    ever mutated directly): one confirms the full "reject → reopen →
    scores restored but submit disabled + banner shown → blocked submit
    attempt stays blocked → click confirm → submit now succeeds" chain;
    a second confirms the alternate path — reject → reopen → edit one
    factor's grade directly (never clicking confirm) → submit button
    unlocks on its own and the real submission succeeds — plus re-runs
    of #131/#132's own comment-history tests (unaffected) and the
    standard click-sweep. **Deliberately scoped to the reviewer modal
    only, not the self-eval page's own re-submission flow** — the
    user's own clarifying answer described this exact modal/button by
    name ("เปิดฟอร์มมา...กด บันทึกและส่งต่อ"), and while the self-eval
    page's `restoreEvalFormFromDraft()` (#108) has the identical shape
    of gap for an employee re-submitting after their own self-eval was
    rejected back to `Draft`, building that too without being asked
    would have doubled the scope on a guess; flagged here as a related,
    not-yet-built gap rather than silently assumed out of scope forever.
    General lesson: a "don't let someone resubmit unchanged data after
    a reject" request is really two separate asks that must both be
    satisfied at once — keep showing the old data (so context isn't
    lost) *and* make the control that re-sends it genuinely require a
    real touch first — and distinguishing "the system restoring old
    state programmatically" from "the user genuinely interacting with
    that same UI control" needs an explicit parameter/flag at the one
    function both paths call through, not an assumption that only real
    clicks ever reach it.

134. **User reported "ตีกลับแล้ว แต่แบบฟอร์มยังอยู่ และ ไม่ไปหน้าคนประเมิน
    ก่อนหน้า" (rejected it, but the record is still there, and it doesn't
    go to the previous evaluator's page) — directly contradicting my own
    just-given explanation of reject timing (same-device instant,
    cross-device up to 30s/#59 or next login/#58).** Wrote targeted
    Playwright tests driving all four real reject entry points
    (`rejectReviewerForm()`'s modal path, and the three bulk-checkbox
    functions `rejectReviewL1Selected()`/`rejectReviewSelected()`/
    `rejectGmSelected()`) purely in-memory (`isWorkerConfigured=false`) —
    every one worked perfectly: status changed, the row left the current
    queue's DOM, appeared in the correct prior queue, and survived a
    manual `ms365SyncAppraisals()` call. This ruled out a logic bug in
    the reject functions or `updateDraftStatus()`/`renderWorkflowPages()`
    themselves — but a pure in-memory test can never exercise the one
    thing that's different in the user's real deployment: `pushDraftRowToExcel()`
    (CLAUDE.md #94's own fix) is fire-and-forget, never `await`ed, so a
    real network call to the Cloudflare Worker/Graph API takes real,
    non-zero time to land. Re-read `startEvalAutoSync()` (#59) and found
    it does **not** only sync on the 30-second interval — it also calls
    `ms365SyncAppraisals(true)` **immediately** every single time a
    workflow page is entered (`if(evalAutoSyncTimer) return;` guards the
    interval setup, not this first call). So the exact real-world
    sequence that reproduces the report: L2 rejects a record (local
    status changes instantly, `pushDraftRowToExcel()` starts a real but
    not-yet-finished network push) → L2 (or anyone) navigates away and
    back to a workflow page within the next few seconds, which is an
    extremely ordinary thing to do right after rejecting something to go
    double-check it → `startEvalAutoSync()` fires its immediate sync →
    pulls the `Appraisals` Excel row, which **still shows the pre-reject
    status** because the push hasn't landed in Excel yet → `ms365SyncAppraisals()`'s
    own merge rule ("only overwrite local when remote is strictly further
    along `evalStatusRank()`, never on a tie," #58) sees the stale-but-
    still-ahead remote status and faithfully overwrites the just-rejected
    local draft right back to where it was — silently, with no error,
    exactly matching "the form is still there" and "it doesn't go to the
    previous evaluator's page" (since the status visibly snapped back
    before anyone else's queue could show it there to stay). This is a
    **different** root cause from #94's own report despite the nearly
    identical user wording ("ตีกลับแล้วข้อมูลกลับมาอีก" then vs. "ตีกลับ
    แล้วแบบฟอร์มยังอยู่" now) — #94 was "never pushes to Appraisals at
    all, so the next sync always wins"; this is "pushes correctly, but a
    sync landing inside the real network latency window can still beat
    it to the local draft," a timing race that only exists because #94's
    own fix (a real, un-awaited push) was never also guarded against a
    concurrent pull. Reproduced deterministically with a Playwright test
    that mocks `graphUpsertTableRow()` to resolve after an artificial
    300ms delay (standing in for real Worker/Graph latency) and
    `graphListTableRows()` to return the pre-reject row until that mock
    push actually resolves — confirmed a sync at the 50ms mark (well
    before the mocked 300ms push lands) reverted the local reject back to
    `L1Reviewed`, precisely reproducing the report, when the fix below
    was temporarily disabled; restored, the same test holds the rejected
    `Submitted` status through the race window and remains correct once
    the push actually completes and a later sync re-checks it. Fixed with
    a small in-memory guard, `pendingPushKeys` (a plain `Set`, not
    persisted — it only needs to describe "is a push for this key
    currently in flight in this tab," which is meaningless across a
    reload anyway since the in-flight promise itself wouldn't survive
    one): `pushDraftRowToExcel()` adds the draft's key before starting
    the real `graphUpsertTableRow()` call and removes it in a `.finally()`
    once that promise settles (success or failure, either way the push is
    no longer "in flight"); `ms365SyncAppraisals()`'s own merge loop skips
    any remote row whose key is currently in `pendingPushKeys` instead of
    comparing its rank at all — deferring that specific key's merge to
    whichever sync runs *after* the in-flight push actually lands, at
    which point the remote row genuinely reflects the new status and the
    normal rank-based merge is correct again with nothing further needed.
    This needed no change to `updateDraftStatus()`, `renderWorkflowPages()`,
    or any of the four reject functions — the fix lives entirely inside
    the one push/pull pair that race against each other. Verified with
    the new race test, re-ran every existing reject-path test (#109/#133's
    `test_reconfirm.js`/`test_reconfirm2.js`, the modal path; new bulk-
    checkbox tests covering all three bulk reject functions end-to-end
    through their real UI checkboxes) to confirm zero regressions — plus
    the standard click-sweep (`nav pages clicked: 22 errors: []`). General
    lesson sharper than #94's own conclusion: making a fire-and-forget
    push real (awaited eventually, logged, upserting correctly) closes
    the "never pushed at all" failure mode, but a push that is still
    un-awaited at its call site remains racing against anything else that
    reads the same remote table in the meantime — any function that pulls
    from a table another function pushes to, where the push isn't
    guaranteed to finish before the pull can run, needs an explicit
    "this key is mid-flight, don't let a pull undo it" guard; "the push
    now happens" and "the push can never be outrun by a pull" are two
    different guarantees, and shipping the first is not evidence the
    second was ever checked.

135. **User sent a real screenshot of the Excel "Master data" header row and
    asked to check for mismatches with the app. Column *positions* still
    matched the code exactly (L=`l1`, M=`l2`, N=`gm`, O=`approver`, per
    #30/#97's verified `EXCEL_EMPLOYEE_COLS` order — no re-shift bug), but
    the real header *text* on columns N/O directly contradicted what the
    app's own L3/L4 hierarchy labeling (#70/#88/#89) had assumed: the real
    sheet calls column N "ผู้ตรวจ GM **L3**" and column O "ผู้อนุมัติ GM
    **L4**" — i.e. both are GM-related, review-then-approve, with the
    code's `gm` field (u[19]) sitting at the real sheet's L3 tier and the
    code's `approver` field (u[11]) sitting at the real L4 tier — exactly
    backwards from #70's own labeling (`gm`=L4 "GM", `approver`=L3
    "ผู้จัดการส่วน").** Confirmed with the user before touching anything
    which fix they wanted (full workflow-structure change — a genuine
    second GM review step driving real approval logic — vs. the easy,
    low-risk fix); user asked which was easiest and I recommended, then
    built, the **cosmetic-only** one: relabel every L3/L4 display text to
    match the real sheet's wording and reading order, **without** touching
    which `MASTER_USERS` index backs which field, which Excel column it
    maps to, or any approval/scoping logic — the exact same "field ids/
    storage/semantics untouched, only the human-facing label changes"
    scope #70 itself used for its own original relabeling. Verified first,
    via `resolveGmReviewer()`/`getMyScopedEmpCodes()`'s `gm` branch (#88/
    #128), that the `gm` field (u[19]) is the one actually driving every
    real GM-approval mechanism (scoping, the GM approve queue, the GM
    reviewer resolver) — the `approver` field (u[11]) is not wired into
    any of that, only into #22's chain-completeness check and display —
    so relabeling alone is honest: the field that the real sheet now calls
    "L3 ผู้ตรวจ GM" is indeed the one the app's approval logic already
    treats as "the GM," just previously mislabeled "L4." Updated, in one
    pass, every place that pairs an L-number with these two fields
    specifically (not the *separate* #92/#115 workflow-stage L-numbering,
    which is about which role reviews at which pipeline status and was
    correctly left untouched — see #115's own warning that this file uses
    "L1-L4" in several unrelated senses): `supervisorChainLabel()`'s
    line-building order/labels (now L1→L2→L3(`gm`)→L4(`approver`), with a
    code comment explaining the swap and that it's display-only), the org
    chart table's header cells *and* its row-rendering cell order (`renderOrg()`
    — swapped which `<td>` prints `u[19]` vs `u[11]` to match the new
    header order, not just the header text alone, which would have been
    the exact #34 "label says one thing, code renders another" trap),
    the employee list's chain-column subtitle, the employee detail view
    (`udGM`/`udApprover` — swapped both the `setId()` assignment order's
    comment and the two HTML blocks' display order/labels so the field
    shown first is genuinely L3), the Add/Edit Employee modal's two field
    labels (`mu_gm`/`mu_approver` — reordered the two `<div class="fg">`
    blocks in the markup too, not just their `<label>` text, so the form
    reads L1→L2→L3→L4 top to bottom same as every other L-numbered list
    in the file), the bulk-import template's reference table and
    `EMP_TEMPLATE_THAI` display labels, and the Import-modal's inline
    hint text. **Deliberately left `EMP_TEMPLATE_HEADERS`'s field *order*
    unchanged** (`...,'l1','l2','gm','approver',...`) — per CLAUDE.md
    #89's own established reasoning, a raw data-interchange column order
    must mirror the real external file's actual column order, not a
    human-reading hierarchy order, so only its Thai *label* text (in
    `EMP_TEMPLATE_THAI`, a separate parallel array) was updated, never the
    `EMP_TEMPLATE_HEADERS` machine-parsed field-name order itself.
    Verified with a test that seeds a synthetic employee with distinct L1-
    L4 names, confirms `supervisorChainLabel()`'s HTML reads L1→L2→
    L3(ผู้ตรวจ GM, the real `gm` value)→L4(ผู้อนุมัติ GM, the real
    `approver` value) in that exact order, confirms the org chart's
    rendered row puts the `gm` value under the "L3" header cell and the
    `approver` value under the "L4" header cell (not just checking the
    header text in isolation), and confirms the employee detail view's
    `udGM`/`udApprover` elements show the correct values — plus the
    standard click-sweep (`nav pages clicked: 22 errors: []`). General
    lesson sharper than #89's own conclusion: #89 fixed *one* function's
    L3/L4 display order to match a hierarchy the app had already defined
    correctly; this time the app's own definition of which field is "L3"
    vs "L4" was itself wrong against the real external sheet — when a
    user-supplied screenshot of a real system contradicts this file's own
    established labeling scheme (not just a column-position bug), always
    confirm which of the two is authoritative and how deep the intended
    fix should go (cosmetic relabel vs. a genuine second approval-stage
    rebuild) before touching anything, since the two fixes have wildly
    different blast radii and the user may only want the cheap one today.

136. **User reported "ไม่เห็นพนักงานในสังกัดแล้ว และเมื่อ L3 อนุมัติไป L4
    ไม่เห็นแบบประเมิน" — investigated with same-device Playwright
    reproductions of the real reported scenario (L1 approves → switch
    session to L2 → check scoping/queue) before touching any code, since
    #135's own diff touched zero scoping/pipeline logic (verified via
    `git diff`) and the report could easily have been a cross-device sync
    issue, not a code bug (per #75's own precedent). Both tests passed
    cleanly — status advanced correctly, `getMyScopedEmpCodes()` included
    the right people, the queue rendered the row — confirming the core
    logic was sound and pointing at Excel sync as the likely real cause.
    The user's *next* message reframed the actual ask entirely: "ให้แต่ละ
    ระดับเห็นพนักงานที่ตนเองต้องประเมิน หากผลการประเมินยังไม่ได้ ให้ขึ้น
    รอผลประเมิน ทุก L" (let each level see the employees it must evaluate;
    if the result isn't in yet, show "awaiting result" — for every
    level). This revealed the real design gap behind the confusion: every
    one of the 5 review/approval queues (`renderReviewL1Queue`/
    `renderReviewQueue`/`renderGmApproveQueue`/`renderCalibQueue`/
    `renderApproveQueue`) had **always** filtered to rows whose status
    matched that queue's exact input status — anyone who hadn't reached
    that stage yet (or had no draft at all) simply didn't appear, with no
    distinction between "genuinely nothing to do" and "your people exist,
    they just haven't gotten here yet." A real L2 logging in to an
    honestly-empty queue (because nobody had been approved up to that
    stage yet) had no way to tell that apart from a scoping bug — which
    is exactly what made the earlier same-device tests pass while the
    *human* report still felt like something was broken.
    Confirmed scope with 2 clarifying questions before the rewrite (this
    touches all 5 queue pages at once): (1) show the full scoped roster
    always, not just people who've reached that queue's stage — confirmed
    yes; (2) employees with zero draft at all (never even self-submitted)
    should also show as "รอผลประเมิน" rather than being omitted —
    confirmed yes.
    Added `buildTierRoster(resolverFn, myCode, inputStatus, cycle)`: for
    each person in `getEvalParticipants()` (the real eligible-for-
    evaluation universe, already scope-filtered and resigned/exempt-
    excluded per #45/#83), optionally filters to only those whose real
    reviewer at this tier resolves to `myCode` (`resolverFn` —
    `resolveL1Reviewer`/`resolveL2Reviewer`/`resolveGmReviewer` from
    #128, the exact functions that already answer "does this specific
    employee have a real person at this tier" — reused rather than
    re-derived, so this can never drift from #128's own skip/resolve
    logic), then classifies each person into one of 3 states by comparing
    their current-cycle draft's status rank against the queue's own
    `inputStatus` rank (`evalStatusRank()`, #58): `'ready'` (exactly at
    this stage — the original actionable row, checkbox/inputs and all,
    unchanged), `'pending'` (earlier than this stage, or no draft at
    all — new "⏳ รอผลประเมิน" row, no action controls since there's
    nothing yet to act on), `'done'` (already past this stage — new row
    showing the real score/grade with a view-only "ดูแบบฟอร์ม"/PDF/delete
    button, per #119's existing `viewOnly` modal parameter, so the person
    never just vanishes from their reviewer's own roster the instant
    they're approved). **Calibration/AMD-MD approve pass `resolverFn=null`**
    deliberately — HR/exec roles are unrestricted company-wide via
    `getMyScopedEmpCodes()` already (#45), with no per-employee chain
    field naming "the HR calibrator" or "the final approver" the way
    `resolveL1Reviewer()` etc. do for the other three tiers, so their
    roster is simply every eligible participant in scope. Each queue's
    "count" display was split into a ready-count (what the header used to
    show — "how many can I act on right now") plus a parenthetical
    pending-count, so the header itself now also communicates "there are
    N more coming, not nothing at all." **Explicitly chose per-tier real
    resolvers over `getMyScopedEmpCodes()` directly** — the scoped set is
    *wider* than "who this specific tier is responsible for" (it's the
    whole downward chain for l1/l2/gm), so using it bare would have shown
    people in, say, the department head's queue who are actually the
    section manager's responsibility at this stage, not theirs; this also
    means a queue page is now correctly empty under a role it was never
    meant to be viewed by, even if that role's `getMyScopedEmpCodes()`
    happens to include the same people (confirmed via one old test from
    this session's own earlier work, `test_bulk_reject.js`, whose DOM
    check of `renderReviewL1Queue()` while still logged in as L2 — a
    pre-existing test quirk, not a real UI path since nav `data-role`
    already prevents L2 from reaching that page — correctly started
    returning empty under the new resolver-based roster; the actual
    status-transition assertions in that same test, the only part that
    matters, were unaffected and still pass). None of the 9 real bulk
    approve/reject functions (`approveReviewL1Selected()` etc.) or
    `confirmCalibration()`/`approveAllFinal()` needed any change — they
    already only ever read real checked keys / real `.calib-adj` inputs,
    which now simply don't exist on `pending`/`done` rows, so they
    continue to operate correctly on exactly the `ready` subset with zero
    logic changes. Verified with a Playwright test driving three
    synthetic employees through a real L1→L2 handoff (one never
    submitted, one submitted-and-approved-by-L1, one exempted via
    CLAUDE.md #83's `evalExempt` flag): confirms the never-submitted
    person shows "pending" in L1's queue and stays pending in L2's queue
    too (since their record hasn't reached L1Reviewed yet), confirms the
    submitted person is `ready` in L1's queue before approval and flips
    to `done` (view-only, no checkbox) in that *same* queue immediately
    after L1 approves — while simultaneously becoming `ready` in L2's own
    queue — and confirms the exempted employee is excluded from the
    roster entirely at every tier — plus re-ran all 10 other Playwright
    tests touching these 5 render functions from this session's earlier
    work (bulk reject ×2, reconfirm ×2, L2 queue/team, the reject-race
    test, both comment tests, the L3/L4 relabel test) with zero
    regressions, plus the standard click-sweep (`nav pages clicked: 22
    errors: []`). General lesson sharper than #75's own conclusion: when
    a same-device reproduction proves the scoping/pipeline code is
    correct, the next step isn't always "the data must be wrong, go check
    Excel" — it can also mean the *design* itself (show only exact-match
    rows, nothing else) is what's producing an empty screen that reads
    as broken even when it's technically accurate; the user's own
    follow-up request, read carefully, is sometimes the real root-cause
    diagnosis arriving one message late.

137. **Follow-up to #135: user sent a screenshot of the "ผู้ตรวจ GM (L3)"
    label on the employee list's "สายบังคับบัญชา" column and asked
    "เปี่นเป็น ผู้ตรวจ MGR (L3) แทน" (change it to "ผู้ตรวจ MGR (L3)"
    instead).** A pure wording change to the label text #135 itself
    introduced — not a new field, not a new tier, not a scope/semantics
    question like #135 was. `grep`ped for the exact string "ผู้ตรวจ GM"
    across the whole file (rather than touching only the one element the
    screenshot showed) and found it in 10 places: the org chart table
    header (`renderOrg()`), the employee list's "สายบังคับบัญชา" column
    subtitle, `supervisorChainLabel()`'s own code comment *and* its
    actual `lines.push()` HTML output, the employee detail view's `udGM`
    comment, the Add/Edit Employee modal's field `<label>`, the bulk-
    import template reference table and `EMP_TEMPLATE_THAI` display
    array, and the employee detail view's own inline label text — the
    same 7 spots #135's own relabeling pass had just touched together as
    one unit, since they all exist to describe the same one field
    (`u[19]`/`gm`) consistently. A single `sed -i 's/ผู้ตรวจ GM/ผู้ตรวจ
    MGR/g'` replaced all 10 at once, leaving every underlying identifier
    (`u[19]`, the `gm` field name, `EXCEL_EMPLOYEE_COLS`'s column
    mapping, `resolveGmReviewer()`, `getMyScopedEmpCodes()`'s `gm`
    branch) completely untouched — purely cosmetic, exactly #135's own
    established scope for this specific field's labeling. Verified with
    syntax check + the standard click-sweep (`nav pages clicked: 22
    errors: []`) rather than a dedicated Playwright test, since this is
    a string-literal swap with zero logic surface to regress — the same
    "cosmetic relabel needs no new test, just confirm nothing broke"
    judgment #135 itself used. General lesson, a direct continuation of
    #89/#135's own: when a user asks to rename a label that a *previous*
    fix in this same file introduced across several places at once,
    assume the rename needs to hit every one of those same places again,
    not just the one in the new screenshot — grep the exact old string
    file-wide before editing, since a relabeling pass is only ever
    "done" when every sibling spot agrees.

138. **User asked "ตรวจดู ว่าทุกจุด เห็นพนักงานในสังกัดของตนเอง" (check that
    every point correctly shows the employees in one's own scope) —
    audited every `MASTER_USERS.filter`/`getDrafts().filter` call site
    in the file (46 of them) against whether it's deliberately company-
    wide (admin/exec-only pages, where `getMyScopedEmpCodes()` already
    returns `null`) or should be scoped, and whether scoped ones agree
    with the real roster the matching page shows.** Most checked out —
    `getReportData()`/`getNineBoxData()`/`exportPayrollData()`/
    `getReminderTargets()` (#90) etc. were already correct, either
    properly scoped or correctly left unscoped for admin/exec-only
    pages. Found a real gap in two of the three "summary" functions
    #136's roster rewrite never touched: `renderNavBadges()` and
    `getNotifications()` still counted straight from `getDrafts()`
    filtered only by `getMyScopedEmpCodes()`, not through
    `buildTierRoster()`/`getEvalParticipants()` the way the real queue
    pages (`renderReviewL1Queue()` etc.) do since #136. Two real
    differences between "in scope" and "in the actual roster":
    1. `getEvalParticipants()` (and therefore `buildTierRoster()`)
       excludes resigned employees (`u[12]!=='active'`) and anyone
       flagged `evalExempt` (`u[20]==='1'`, CLAUDE.md #83) — the badge/
       notification counters checked neither, so a stray draft record
       belonging to someone HR later exempted mid-cycle (or a resigned
       employee's old record) would still be counted in the badge/bell
       even though it would never appear as a real row on the actual
       queue page.
    2. For the three per-tier queues (L1/L2/GM review), the real roster
       only counts people whose `resolveL1Reviewer()`/`resolveL2Reviewer()`/
       `resolveGmReviewer()` (#128) resolves to *this specific viewer* —
       `getMyScopedEmpCodes()` alone is the *wider* whole-downward-chain
       scope (#136's own general lesson already states this explicitly),
       so counting straight off scope is only coincidentally correct
       when the two happen to agree, not guaranteed to.
    Both are the same shape of bug as #73/#85/#87/#126/#130 — a summary
    widget (sidebar badge, notification bell) computed by its own
    separate logic that a page-level fix doesn't automatically reach,
    just one layer more subtle this time since #136 was the exact fix
    that introduced the new, stricter roster model these two functions
    were never updated to match. Fixed both by reusing `buildTierRoster()`
    itself (never a fourth independent counting implementation, per
    #126/#127's own lesson) — `renderNavBadges()`/`getNotifications()`
    now compute each tier's badge/notification count as
    `buildTierRoster(resolverFn, me[0], inputStatus, cycle).filter(r=>
    r.state==='ready').length`, the exact same expression the real page
    uses for its own header count, so the two can never drift apart
    again. `teamPending` (the "2. ประเมินทีมงาน" badge) was checked and
    left unchanged — it already matches `renderTeamFromMaster()`'s own
    roster logic exactly (neither filters `evalExempt`, a separate,
    pre-existing gap on the team page itself worth a future look but not
    what this request was about, since an exempt employee is still a
    real part of their own supervisor's team regardless of evaluation
    eligibility — not a cross-scope leak). Verified with a test that
    seeds a real submission plus a second employee flagged `evalExempt`
    with a stray `Submitted` draft still sitting in the same reviewer's
    scope, confirming the badge, the notification bell, and the real
    queue row count all now agree (1, not 2) and the exempt employee
    never appears in the DOM — plus re-ran every existing roster/queue
    test from #136 onward and the standard click-sweep
    (`nav pages clicked: 22 errors: []`) with zero regressions. General
    lesson sharper than #136's own conclusion: whenever a page's roster-
    building logic changes shape (exact-match filter → full roster with
    3 states, #136), every *other* function that independently counts
    the same underlying data for a summary widget needs the identical
    audit — a "did we get every point" request after a structural
    rewrite is exactly the moment to re-run #85/#87's "grep every bare
    `getDrafts()`/`MASTER_USERS.filter` call site" check, not just
    confirm the one page that was directly asked about.

139. **User's screenshot of "2. ประเมินทีมงาน (L1 รอบแรก)" showed the sidebar
    badge reading "32" while the page's own table/stat tiles showed only
    5 people — "จำนวนคนที่แสดงรวมแล้วไม่เท่ากับตัวเลข 32" (the total shown
    doesn't equal 32).** Traced both numbers to confirm which was wrong,
    rather than guessing: `renderTeamFromMaster()` has two deliberately
    different modes (#118) — when an L2/admin/exec picks one specific
    manager from the `teamManagerSelect` dropdown ("drill-down" mode,
    the subtitle literally says "ผู้ใต้บังคับบัญชา**ทางตรง**ของ {name}"),
    the table and its "ทีมทั้งหมด" stat correctly show only *that one
    manager's* direct reports (5, matching the screenshot) — while
    `navBadgeTeam` (`renderNavBadges()`'s `teamPending`) counts pending
    round-1 self-evals across the **logged-in viewer's entire scope**
    (`getMyScopedEmpCodes()`, every manager under them combined), which
    is a different, legitimately wider number by design. Both were
    correct under their own definition — this is the same "two numbers
    disagree but both answer different questions" shape #129 already
    found for the hierarchy-issues banner, not a scoping bug like
    #73/#85/#87/#126/#130. While verifying this, also found and closed
    the one real gap #138 had explicitly deferred: `teamPending` never
    excluded `evalExempt` employees (`u[20]==='1'`, CLAUDE.md #83) the
    way every other badge/notification count already does — a stray
    pending draft for someone HR later exempted mid-cycle would still
    have inflated this one badge.
    Fixed by extracting `countTeamPending(scopedCodes)` — the exact
    `teamPending` expression, now also excluding `evalExempt`, taking
    the scope `Set` (or `null` for unrestricted) as a parameter — and
    pointing both `renderNavBadges()`'s badge count *and* a new
    same-page clarification note at this one shared function, so the
    two numbers can never independently drift apart again (the
    #126/#127/#138 "reuse one counting function, don't recompute
    independently" discipline). Added `#teamScopeWideNote` (an `al-w`
    warning-style banner, right under the existing "หน้านี้แสดงเฉพาะ...
    ไม่เห็นทีมของหัวหน้าคนอื่น" info banner) that `renderTeamFromMaster()`
    now populates whenever the viewer's real scope-wide pending count
    (`countTeamPending(getMyScopedEmpCodes())`) differs from what the
    table currently shows (`pendingCount`, the selected manager's own
    count) — spelling out both numbers and stating plainly that they
    are different, correct scopes, not conflicting data, rather than
    silently changing either number's meaning to make them match.
    Verified with a test that seeds a real L2 overseeing two L1
    managers (one with 5 direct reports, one with 20), selects the
    5-person manager in the drill-down dropdown, and confirms the badge
    shows 25 (both managers' pending combined, under the viewer's full
    scope), the table/stat tile shows 5 (the selected manager only), and
    the new note renders with both real numbers and the clarifying
    sentence — plus the standard click-sweep (`nav pages clicked: 22
    errors: []`). General lesson sharper than #129's own conclusion:
    when a summary number (sidebar badge) and a detail view (a page
    filtered to one specific sub-selection the summary doesn't know
    about) are compared, "do they count different scopes by design" is
    a real third explanation beyond "the summary is wrong" or "the
    detail is wrong" — confirm which of the three it is from the actual
    code before changing anything, and when it's genuinely the third
    case, surface both real numbers together on the page itself so the
    difference explains itself rather than reading as unexplained data
    loss.

140. **User's screenshot, logged in as the real "Admin ระบบ (Super Admin)"
    account, showed "3. สอบทานหัวหน้าแผนก (L2)" — and the user confirmed
    L3 and L4's queues too — rendering completely empty ("ไม่มีพนักงานใน
    สังกัดที่ต้องสอบทาน") even though the "2. ประเมินทีมงาน" badge right
    above it showed a real 32 pending — "L2 ทำไม่มีรายชื่อแสดง L3 กับ L4
    ก็ด้วย" (L2's queue shows no names, L3 and L4 too).** Traced
    `buildTierRoster()` (#136): for the three per-tier queues
    (`renderReviewL1Queue`/`renderReviewQueue`/`renderGmApproveQueue`),
    its `resolverFn` parameter (`resolveL1Reviewer`/`resolveL2Reviewer`/
    `resolveGmReviewer`, #128) checks — correctly, for a *real* L1/L2/GM
    — whether this specific employee's real chain-field reviewer
    resolves to exactly `myCode`. But Admin/sysadmin (and `exec`) are
    never anyone's real L1/L2/GM in `MASTER_USERS` — they're company-
    wide oversight roles with no chain-field pointing at them at all —
    so the resolver check always failed for an Admin session and the
    roster came back empty at every one of the three tiers, regardless
    of how much real pending work existed. This is the mirror image of
    #73/#85/#87's own bug shape: those were data *leaking* to a role
    that should only see its own team; this is data *hidden* from a
    role that's supposed to see everything. The file already has the
    exact right precedent for this: Calibration/AMD-MD approve (#61,
    `renderCalibQueue`/`renderApproveQueue`) already pass
    `resolverFn=null` to `buildTierRoster()` for this very reason — HR/
    exec aren't anyone's chain-field reviewer either, so those two
    queues were built unrestricted from the start. The three *earlier*
    tiers (L1/L2/GM review) were never given the same unrestricted
    fallback when #136 first built them, since every test case that
    shipped with #136 happened to log in as a real L1/L2/GM, never as
    Admin checking the same queue for oversight.
    Added one shared helper, `effectiveResolver(resolverFn, role)` —
    returns `null` (unrestricted, same mechanism Calibration/Approve
    already use) when `role` is `admin`/`sysadmin`/`exec`, otherwise
    passes the real resolver through unchanged — and wrapped every one
    of the 5 real `buildTierRoster()` call sites with it:
    `renderReviewL1Queue()`/`renderReviewQueue()`/`renderGmApproveQueue()`
    (the 3 queue pages themselves) *and* `renderNavBadges()`/
    `getNotifications()`'s own `readyCount()` wrappers (#138's badge/
    notification-bell counters, which reuse the same resolver functions
    and would have shown the identical "0 for Admin" mismatch against
    the team-page badge otherwise). One shared helper rather than four
    independent `['admin','sysadmin','exec'].includes(...)` checks,
    following the #126/#127/#138 "reuse one function, don't recompute
    the same condition independently" discipline. `getMyScopedEmpCodes()`
    itself needed zero changes — it already correctly returns `null`
    (unrestricted) for these three roles (#45); this fix brings the
    per-tier resolver mechanism into agreement with that same existing
    convention, not a new rule. Verified with a test that seeds a real
    L1/L2/GM chain plus one employee with a real `Submitted` draft,
    logs in as the real Admin account (`90230`, not set as anyone's
    chain-field reviewer), and confirms `renderReviewL1Queue()` now
    shows the real pending row (previously empty) and
    `navBadgeReviewL1` matches it (`"1"`) — plus re-ran every existing
    bulk-reject/L2-queue/team-badge test from this session's earlier
    work with zero regressions, plus the standard click-sweep
    (`nav pages clicked: 22 errors: []`). General lesson sharper than
    #61's own precedent: when a new per-tier resolver mechanism is
    built to replace a blanket `getMyScopedEmpCodes()` scope check
    (#136's `resolverFn`), it's easy to forget that the file's own
    unrestricted-oversight-role convention (`admin`/`sysadmin`/`exec`
    see everything, #45) has to be re-implemented at the *new*
    mechanism's level too — `getMyScopedEmpCodes()` being correct for
    these roles doesn't help if a sibling, more specific mechanism
    built later doesn't consult it or its own role list at all.

141. **User's screenshot (same "2. ประเมินทีมงาน" page while investigating
    #140's bigger field-mapping question) asked: "ให้ L2,L3,L4 มีกรองเลือก
    ชื่อ ด้วยจะได้รู้ว่าใครมีลูกทีมใครบ้าง เพราะ ลองดู L3 กับ L4 แล้วมีชื่อ
    คุณเชิดชัย ซึ่งน่าจะตัดออกเพราะไม่ต้องเมิน" (add a name filter to the
    L2/L3/L4 queue pages so it's clear whose team is whose — I noticed
    "คุณเชิดชัย" showing up at L3 and L4 even though he probably shouldn't
    need evaluating).** The three queue pages (`renderReviewL1Queue`/
    `renderReviewQueue`/`renderGmApproveQueue`) show every scoped person
    in one flat table since #136's roster rewrite — with no way to see
    which specific subordinate manager's team a given row belongs to,
    exactly what the user asked for.
    Added a shared `populateReviewManagerFilter(selectId, roster,
    resolverFn)`/`filterRosterByManager()` pair and a `<select>` dropdown
    on each of the 3 pages, reusing a real resolver function (never a
    fourth independent query, per #126/#127/#138's own discipline) to
    label each row with its real immediate manager. **The one subtlety
    that needed getting right**: the filter on each page must use the
    resolver for the *previous* tier, not the page's own tier — using
    e.g. `resolveL2Reviewer` to filter the L3 (ผจก.ส่วน) queue would
    resolve every row to the viewer themself (useless as a filter, since
    everyone in that queue already reports to the one person viewing
    it). So "L3 (review)" filters by `resolveL1Reviewer` (which dept
    head owns this row), "L4 (gmapprove)" filters by `resolveL2Reviewer`
    (which ผจก.ส่วน owns this row), and "L2 (reviewl1)" — which has no
    ready-made resolver for "direct unit head" since `resolveL1Reviewer`
    itself climbs through a unit head to the real dept head — got a new
    small helper, `resolveUnitHeadFor(emp)`, reading the raw `u[9]`
    value only when it resolves to a real `unit`-role person (blank for
    an employee reporting straight to the dept head, which is correct —
    nothing to sub-filter by there). A first draft used the *current*
    tier's own resolver on all three pages and the test caught it
    immediately (every option on the L3 test page showed one single
    option labeled with the viewer's own name, "4 คน" — a real but
    useless filter), which is why the final version routes through the
    three different functions above. Verified with tests seeding two
    real department heads under one ผจก.ส่วน (confirms the L3 filter
    lists both dept heads separately with correct counts, and selecting
    one hides the other's rows) and two real unit heads under one dept
    head (confirms the same for the L2 page) — plus the standard
    click-sweep (`nav pages clicked: 22 errors: []`) and a re-run of
    #140's own admin-oversight test to confirm it still passes unaffected.
    **On "คุณเชิดชัย" showing up needing no evaluation**: this app already
    has the exact mechanism for this — the "ยกเว้นไม่ต้องรับการประเมิน"
    checkbox in Add/Edit Employee (`MASTER_USERS[20]`, CLAUDE.md #83),
    which `getEvalParticipants()`/`buildTierRoster()` already both
    exclude. Admin/sysadmin and exec roles are deliberately **not**
    auto-excluded by role alone (#83's own stated reasoning — some
    companies do want execs evaluated) — told the user plainly to tick
    that checkbox on his real employee record rather than guessing he
    should be excluded by role, since this is a real per-person HR
    decision the app was built to let HR make explicitly, not infer.
    **Separately, a much bigger architectural question was raised and
    left open, not resolved in this fix**: while investigating the
    original "no team members" report for a different L2 user, the real
    Excel/Admin screenshots showed her name as "ผู้จัดการส่วน" appearing
    under the "L3 (ผู้ตรวจ MGR)" column (the `gm` field, u[19]) rather
    than under the field the code's `resolveL2Reviewer()`/
    `getMyScopedEmpCodes()`'s `l2` branch actually reads (u[10]) — which
    would mean the code's L2/GM field assignments (`resolveL2Reviewer`
    reading u[10], `resolveGmReviewer`/`getMyScopedEmpCodes()`'s `gm`
    branch reading u[19], per #88) are swapped relative to how HR is
    actually filling in the real sheet today, company-wide. This is a
    different, much larger fix than today's filter-dropdown request (it
    would mean editing `resolveL2Reviewer()`, `resolveGmReviewer()`, and
    `getMyScopedEmpCodes()`'s `l2`/`gm` branches together) and was
    explicitly NOT made — the user said "ไม่แน่ใจ / ขอเช็คก่อน" (not sure,
    want to check first) on the confirming question of where the real
    GM's own name appears in the chain, and the conversation moved to
    this narrower, independently-useful filter request instead. **Left
    open, to be resumed once confirmed**: if the user later confirms a
    real employee's actual GM reviewer's name appears under "L4 (ผู้อนุมัติ
    GM)" (u[11]/`approver`) rather than "L3 (ผู้ตรวจ MGR)" (u[19]/`gm`),
    that confirms the swap and the three functions above need to trade
    which field they read — a change with company-wide blast radius
    across every L2/GM scoping, badge, and queue in the file, so it
    must not be guessed at from one person's data alone. General lesson:
    a narrower, clearly-scoped request ("add a filter") that surfaces
    mid-investigation of a much bigger, still-unconfirmed one ("are two
    core chain fields swapped") should be shipped on its own merits
    without either blocking on the bigger question or quietly folding
    a guess about it into the smaller fix — the filter here was built to
    work correctly under the *current* field assignment, so it costs
    nothing if the bigger swap is confirmed later (the resolvers it
    calls will simply start returning different names, with no change
    needed to the filter mechanism itself).

142. **Immediately after #141 shipped, user's screenshot of the L3
    ("สอบทานขั้นที่ 4 (ผู้จัดการส่วน L3)") page's new filter dropdown
    showed only "ทุกหัวหน้า (46 คน)" — zero individual manager names —
    while the table itself showed real pending employees. Asked
    "ควรมีชื่อ ผู้จัดการ5คนไหม" (should there be 5 manager names).**
    This meant `resolveL1Reviewer(emp)` (#128) returned `null` for every
    single one of the 46 real people in this queue's roster — the exact
    symptom the still-paused field-swap investigation (flagged at the
    end of #141) would also produce, but also explainable by something
    far more mundane: these specific 46 people simply don't have a real,
    resolvable "หัวหน้าหน่วย (L1)" value on file yet (blank field, a
    typo'd name, or a name that resolves to a real person whose own role
    isn't set to `l1`/`unit`) — three completely different real causes
    that all look identical from the outside ("no names in the
    dropdown"), and I have no access to the user's live Excel-synced
    `MASTER_USERS` data to tell which one it is. Per this file's own
    "don't guess at a company-wide-blast-radius fix from one person's
    data" discipline (already applied twice for the paused swap
    question), the right move was not to guess which of the three it is,
    nor to re-ask the user to manually go check 3 named employees' raw
    field values one at a time — instead, built the diagnosis *into the
    page itself* so HR can see the real breakdown without needing to be
    walked through it by hand.
    Added `diagnoseResolverGaps(roster, resolverFn, fieldIdx)` — for
    every roster member the resolver already says has no real reviewer,
    classifies *why* into exactly the three mutually-exclusive causes
    above (`noField`: the raw field is blank/`'—'`; `notFound`: a name is
    there but no active `MASTER_USERS` row matches it; `foundNoChain`: a
    real person matches, but `resolverFn` still rejected them — almost
    always a role mismatch, e.g. the named person's role isn't `l1`/
    `unit`/`l2` as that tier requires) — and `renderReviewerFilterDiagNote()`,
    which renders a real `al-w` warning banner (CLAUDE.md #129's
    established non-alarming severity class) stating the real counts in
    plain Thai and pointing HR at "ตั้งค่า → ผังองค์กร & พนักงาน" to fix
    it, shown only when the filter dropdown has zero manager names but
    the roster is non-empty (never shown when there's genuinely nothing
    in the queue, and never shown once at least one real name resolves).
    Wired into all three queue pages (`renderReviewL1Queue`/
    `renderReviewQueue`/`renderGmApproveQueue`), each passing its own
    filter's real resolver + the matching raw field index
    (`resolveUnitHeadFor`/`resolveL1Reviewer`→field 9, `resolveL2Reviewer`
    →field 10 — the exact same resolver+field pairs #141 already
    established for the filter dropdowns themselves, so this can never
    disagree with what the filter is actually computing). Verified with
    a test seeding 3 real employees under one real L2, one with each of
    the 3 gap causes deliberately engineered (blank L1 field, a
    nonexistent name typed into it, and a real person whose role is
    `emp` not `l1`/`unit`), confirming the banner renders with the
    correct count for each of the three (1/1/1) — plus re-ran #141's own
    two filter tests, #140's admin-oversight test, and #139's team-badge
    test to confirm zero regressions, plus the standard click-sweep
    (`nav pages clicked: 22 errors: []`). **This does not resolve the
    paused field-swap investigation** — it only turns "the dropdown is
    empty, why" from an unanswerable question into a self-service
    diagnostic HR can read directly off the page; the user's next report
    (whichever of the three real causes the banner actually shows for
    their 46 people) is the next real data point toward answering it,
    not a guess made here. General lesson: when a report could stem from
    any of several distinct real causes a screenshot can't distinguish,
    and asking the user to manually inspect raw data field-by-field is
    both slow and error-prone for a non-technical user, build the
    diagnosis as a feature on the page itself — the same instinct
    CLAUDE.md #129 already applied to a banner's *wording*, extended
    here to actually computing and displaying *which* of several root
    causes applies, so the next report arrives with the real answer
    already attached instead of another round of guessing.

143. **User's screenshot of the "ยกเว้นไม่ต้องรับการประเมิน" checkbox
    (Add/Edit Employee, CLAUDE.md #83) asked "เวลาเปิดใหม่ ต้องเลือกทุก
    ครั้งเลย" (every time [the app/page] opens anew, I have to tick it
    again).** Traced the in-session save/reopen path first
    (`saveUserFromModal()`→`MASTER_USERS[existing]=newUser`→
    `fillUserFormFields()`'s `emp[20]==='1'` read) and confirmed it was
    already correct — re-opening the same edit modal without reloading
    the page shows the right state. The real cause was one layer out:
    per CLAUDE.md #32, `MASTER_USERS` has **zero `localStorage` of its
    own** — it resets to the file's hardcoded demo baseline on every
    page load and is then silently rebuilt from the real MS365
    `Employees` Excel table via `loadEmployeesFromMs365()`. `evalExempt`
    (`u[20]`) was deliberately scoped as local-only in #83 (no confirmed
    real column in HR's actual sheet) with a re-merge
    (`r[20]=old?.[20]||''`) that only protects it *within the same
    already-loaded session* — it does nothing for a genuine page reload
    or fresh login, since `old` is read from the in-memory array that
    itself just got wiped. So "เวลาเปิดใหม่" was describing exactly
    that: every fresh page load/login silently reset every employee's
    exemption flag back to unticked, with nothing to restore it from —
    the same shape of gap #39 originally found for IDP/FormWeights
    (local-only field with **zero** persistence of any kind), just one
    tier more hidden since #83's own re-merge code *looked* like a real
    persistence mechanism at a glance.
    The file already has the exact right real mechanism for this class
    of field — `EmployeeSettings` (#24), the small Excel table that
    already round-trips `pinHash`/`evalLevel` (two other local-only
    `MASTER_USERS` fields) via `ms365SyncEmployeeSettingsSilent()`,
    called from both `doLogin()`/`tryRestoreSession()`'s silent-sync
    groups (#32/#33) — so extending that *existing* table was the right
    fix, not inventing a new one. Added `EvalExempt` as the table's 5th
    column (`EmpCode, PinHash, EvalLevel, UpdatedAt, EvalExempt`),
    written explicitly as `'1'`/`'0'` on every push (never left blank,
    unlike `pinHash`/`evalLevel`'s "only write if truthy" convention) —
    an unticked exemption is a real, meaningful value that must also
    sync, not just the ticked one; `applyEmployeeSettingsRows()` only
    applies it back when the pulled value is exactly `'1'` or `'0'`
    (never a bare truthy check), so a row pushed by *older* client code
    before this fix — or a real Excel table HR hasn't added the new
    column to yet — reads as "column not present" and correctly leaves
    the local value untouched rather than silently un-exempting
    everyone, the same CLAUDE.md #102 caution about an "add row" call's
    real column-count being load-bearing, applied here on the *read*
    side instead. `pushSingleEmployeeSettings(code)` (the per-person
    auto-push, previously only triggered after a PIN reset) and
    `ms365PushEmployeeSettings()` (the manual bulk button) both now
    include the 5th value; `saveUserFromModal()`'s auto-push call was
    widened from `if(evalLevel && ...)` to an unconditional call on
    every save — the old truthy-gated version would never have pushed
    the moment HR *unticked* the box (an empty string is falsy), so the
    "un-exempt" direction would have silently stayed local-only forever
    even after this fix if left as a truthy check. Updated the MS365
    settings page's own hint text/button labels to name the real 5
    columns and the real 3 things that now sync through this table,
    per the CLAUDE.md #34/#49/#67 "keep the UI's own claim in sync with
    what the code actually does" discipline. Verified with a test that
    pushes a real `evalExempt='1'` value, captures the exact 5-element
    array sent to `graphUpsertTableRow`, simulates a fresh page load by
    resetting the employee's in-memory record to have no exemption set,
    feeds the captured row back through `applyEmployeeSettingsRows()`
    (the same function the real silent sync calls), and confirms the
    exemption is correctly restored — then repeats the same round-trip
    for the un-exempt (`'0'`) direction and confirms it correctly
    clears a stale local `'1'` rather than being mistaken for "no
    column" — plus the standard click-sweep (`nav pages clicked: 22
    errors: []`). **Real operational step the user still needs to
    take, stated plainly**: this only takes effect once the real Excel
    "EmployeeSettings" table has the `EvalExempt` column added (the
    same per-table setup #24 always required) and at least one save/
    push has happened for each employee who should stay exempt across
    a reload — a push to a table that doesn't yet have the column will
    fail with a real, visible Sync Log error (per #68/#69's established
    "never silently swallow a push failure" convention), not pretend to
    have worked. General lesson sharper than #83's own conclusion: a
    `localStorage`-style "re-merge the old value so a sync doesn't wipe
    it" guard (the same pattern #17/#6 establish for `pinHash`) only
    protects a field *within* an already-loaded session — it is not
    itself a persistence mechanism, and a local-only field with no real
    Excel round-trip at all (as #83 explicitly scoped `evalExempt` to
    be) is *always* one page reload away from reverting, no matter how
    careful the re-merge code looks; the actual fix is routing it
    through whichever round-trip table the file already has for fields
    of that same shape, not writing a better re-merge guard.

144. **User asked: "พนักงานที่ไม่มี L1 หรือ L2 ให้แสดงชื่อ ผู้บังคับบัญชา
    ลำดับถัดไปประเมินเลย ปัจจุบันมองไม่เห็นรายชื่อ" (for employees missing
    both L1 and L2, show them to the next supervisor in the chain so that
    person can evaluate them directly — currently the names are nowhere
    to be seen). Confirmed via one clarifying question that this is about
    the "2. ประเมินทีมงาน" page specifically** — the exact same page
    #130 already solved for the *single-tier* case (an employee with no
    real L1, reporting straight to their L2 via `u[10]`): a virtual
    `__noL1__` dropdown option appears only for role `l2`, backed by
    `resolveL1Reviewer()`/`resolveL2Reviewer()` (#128) so "who's in this
    bucket" can never drift from "who the pipeline will actually skip
    straight to L2 for." This request is the *two-tier* version of the
    exact same gap: an employee missing **both** a real L1 and a real L2
    has no page anywhere that shows them to the person who should score
    them — per #128's `skipEmptyReviewStages()`, that's whoever
    `resolveGmReviewer()` resolves to (the real GM field, `u[19]`), but
    nothing on the team page ever surfaced that bucket to GM, and worse,
    **the team page's own nav item didn't even list `gm` in its
    `data-role`** (`data-role="l1,unit,l2,exec"` — #92's original nav
    item, written before role `gm` needed a reason to reach this page at
    all), so a real GM couldn't open "2. ประเมินทีมงาน" through the UI
    in the first place, nav permissions or not.
    Fixed by mirroring #130's exact mechanism one tier wider, reusing
    the same three resolver functions rather than writing a fourth
    independent query (the #126/#127/#130 discipline): added a
    `role==='gm'` branch to `populateTeamManagerSelect()` that computes
    `noL1L2Count` — active `emp`/`unit`-role employees (same role filter
    #130 already established, since an `l1`-role person always resolves
    `resolveL1Reviewer()` to `null` trivially per #22/#128 and would
    otherwise falsely show up here) where `!resolveL1Reviewer(u) &&
    !resolveL2Reviewer(u)` **and** `resolveGmReviewer(u)` resolves back
    to this exact GM — and surfaces it as a new `__noL1L2__` virtual
    option ("👤 พนักงานไม่มีหัวหน้า L1/L2 (ขึ้นตรงกับฉัน) — N คน"),
    alongside (not replacing) the existing `__noL1__` option so both
    buckets can coexist in the same dropdown for whichever role needs
    each one. `renderTeamFromMaster()` got the matching `isNoL1L2Mode`
    branch building `allDirectReports` with the identical resolver
    triple, plus its own subtitle text explaining the bucket — every row
    then flows through the exact same `openReviewerForm()`/
    `submitReviewerForm()` path every other team-page row already uses
    (#109), so GM scoring one of these employees creates a real
    `Submitted` draft that #128's `skipEmptyReviewStages()` (already
    wired into `submitReviewerForm()`) immediately walks forward to
    `GMApproved` directly — correctly skipping both missing tiers in one
    step, mirroring what a real L1+L2 chain would have produced two
    stages later. Added `gm` to the `team` nav item's `data-role` so a
    real GM session can reach the page at all — the dropdown fix alone
    would have been unreachable without this. Deliberately did **not**
    build a "browse by manager" drill-down list for role `gm` (left
    `managerNames = []` for that branch) — `getMyScopedEmpCodes()`'s own
    `gm` branch (#88) only walks one hop from `u[19]`, not the full
    multi-tier chain beneath an L2, so a correct drill-down list would
    need real chain-walking logic nobody asked for here; the one bucket
    the user actually reported missing (`__noL1L2__`) doesn't depend on
    that at all. Verified with a test seeding two GMs and three
    employees — one with neither L1 nor L2, reporting straight to GM 1
    (must appear, count 1); one with a real L1 (must be excluded even
    though it also points at GM 1 for u[19]); and one with neither L1
    nor L2 but reporting to GM **2** (must be excluded from GM 1's
    bucket, confirming no scope leak across GMs) — confirms the dropdown
    shows exactly "1 คน," the subtitle names the right bucket, and the
    rendered row list contains only the one correct employee — plus
    re-ran #139's team-badge-note test and #140's admin-oversight test
    to confirm zero regressions, plus the standard click-sweep (`nav
    pages clicked: 22 errors: []`). **Caught during testing, not
    guessed**: the chain fields (`u[9]`/`u[10]`/`u[19]`) all store the
    supervisor's real *name*, never their employee code, per every
    earlier fix in this file (#18 onward) — a first draft of the test
    seeded `u[19]` with the GM's employee *code* instead of their name
    and got a silently-empty bucket (`resolveGmReviewer()` found no
    matching active row), which is exactly the kind of "no names show"
    symptom a real HR data-entry mistake could also produce; worth
    remembering as a diagnostic path if a future report says this exact
    bucket is empty when it shouldn't be — check whether the chain field
    was accidentally filled with a code instead of the person's name.
    General lesson combining #126/#128/#130: when a user names a two-
    tier version of a gap a prior fix only closed for one tier (`L1 or
    L2` here, vs. #130's `L1` alone), the fix is almost always "apply
    the same resolver-reuse pattern one level further," not a new
    mechanism — but always re-check the *reachability* path too (nav
    `data-role`, page dispatch) for the new role involved, since a
    feature can be built perfectly correctly and still be invisible if
    the role that needs it was never granted a door to the page at all.

145. **User asked to remember the real 4-tier hierarchy order (L1=หัวหน้า
    หน่วย, L2=หัวหน้าแผนก, L3=ผู้จัดการส่วน, L4=GM — the exact #70/#88
    convention) and to check whether the system enforces it consistently
    everywhere. This reopened the field/resolver question #135/#141 had
    deliberately paused rather than guessed at.** Audited the two chain
    fields directly against their own real UI labels (Add/Edit Employee,
    confirmed unchanged since #70/#137): `mu_l2`(u[10])="หัวหน้าแผนก (L2)",
    `mu_gm`(u[19])="ผู้ตรวจ MGR (L3)", `mu_approver`(u[11])="ผู้อนุมัติ GM
    (L4)". But the *resolver* functions driving every real scoping/
    queue/approval mechanism disagreed with those labels: `resolveL2Reviewer()`
    read **u[10]** (the field labeled L2/หัวหน้าแผนก) while requiring the
    matched person's role to be `'l2'` (ผจก.ส่วน, the real L3 tier) —
    and `resolveGmReviewer()` read **u[19]** (the field labeled L3/
    ผู้ตรวจ MGR) while requiring role `'gm'` (the real L4 tier). So the
    field a reviewer function actually consulted and the field HR would
    naturally fill in based on what the screen calls it were two
    different columns — exactly the mismatch #135's own code comment had
    already flagged as a live possibility, and exactly what made #141/
    #142's "the filter dropdown shows zero names" reports unexplainable
    by a data problem alone, since HR filling in the field the *label*
    told them to use would never populate the field the *code* was
    actually reading.
    Presented the two fix directions (relabel the screen to match the
    code, or fix the code to match the screen) rather than guessing;
    user chose **"แก้โค้ดให้ตรงกับป้ายหน้าจอ (แนะนำ)"** — fix the code,
    since the screen labels are what HR has been reading and filling in
    against this whole time, and are far more expensive to have been
    silently wrong for. Swapped both resolvers to match their own
    labeled field: `resolveL2Reviewer(emp)` now reads **u[19]** (ผู้ตรวจ
    MGR (L3)) and still requires the matched person's role to be `'l2'`;
    `resolveGmReviewer(emp)` now reads **u[11]** (ผู้อนุมัติ GM (L4)) and
    still requires role `'gm'` — the role requirement was always correct
    (it matches the real tier the field's label describes), only the
    field index was swapped. Propagated the identical swap to every
    other place that read these two fields by raw index for the same
    *identity* purpose (not a display/Excel-column purpose, which must
    stay as-is per #30's own established rule): `getMyScopedEmpCodes()`'s
    `l2` branch (`u[10]===myName`→`u[19]===myName`) and `gm` branch
    (`u[19]===myName`→`u[11]===myName`), `populateTeamManagerSelect()`'s
    raw `l2` query (independent of `getMyScopedEmpCodes()`, same #126
    reasoning for why it needed its own fix), `getEvaluationAssignments()`'s
    (#22) `l2` chain-completeness variable, and `openSubmitConfirmModal()`'s
    (#112) "ส่งถึง" recipient fallback chain. Also caught, while auditing
    every consumer rather than stopping at the two resolvers themselves,
    that `renderGmApproveQueue()`'s own diagnostic note
    (`renderReviewerFilterDiagNote('gmApproveFilterDiag', fullRoster,
    resolveL2Reviewer, 10, 'หัวหน้าแผนก (L2)')`, #142) still passed the
    OLD field index (`10`) and OLD label as its diagnostic parameters —
    left unfixed, this note would have checked the wrong raw field and
    told HR to look for a missing "หัวหน้าแผนก (L2)" value when the real
    gap (per the now-corrected resolver) would be a missing "ผู้ตรวจ MGR
    (L3)" value; fixed to `(..., 19, 'ผู้ตรวจ MGR (L3)')` to match.
    **Explicitly left untouched, confirmed correct as-is**:
    `pushSingleEmployeeToExcel()`'s `EXCEL_EMPLOYEE_COLS`-keyed `byKey`
    mapping (#27/#30/#68 — Excel push/pull must always map by field
    *name*, never a tier-semantic guess, so `gm:emp[19]` and
    `approver:emp[11]` stay exactly as they already correctly were —
    this fix never changed which `MASTER_USERS` index backs which Excel
    column, only which index a *resolver* reads to answer "who evaluates
    this person"), `supervisorChainLabel()`'s display logic, the org
    chart table, the employee detail view, the Add/Edit Employee
    modal's own field markup/labels, `normalizeMs365Employee()`, and the
    bulk-import template — none of these describe *who reviews whom*,
    only *which value is stored where and what it's called*, which #137's
    labels already got right and this fix never needed to touch.
    `getEvaluationAssignments()`'s `u[2]==='l2'` branch's own "missing
    approver" check (`missing = !approver`, where `approver` already read
    `u[11]`) needed no change — it was, by lucky accident, already
    reading the field this fix confirms is the real L4/GM field.
    Verified by re-running every existing Playwright test touching either
    resolver and fixing each one's seed data to the corrected field
    positions (the stale seed data itself, written under the old field
    assumption, was the only reason any test result changed — not a new
    logic bug): `test_review_filter.js`/`test_review_filter2.js` (moved
    each test employee's ผจก.ส่วน/GM name from the old index to the new
    one), `test_nol1l2_gm.js` (#144's own test — moved the GM's name from
    u[19] to u[11] in each employee record), `test_team_badge_note.js`
    (#139's own test — moved the L2's name from u[10] to u[19] for the
    L1-manager records), and `test_review_filter_diag.js` (#142's own
    test — same u[10]→u[19] move) — all five now pass with the real
    resolver behavior confirmed correct, plus `test_admin_oversight_queues.js`
    and `test_evalexempt_sync.js` re-run unaffected, plus the standard
    click-sweep (`nav pages clicked: 22 errors: []`). General lesson
    sharper than #135's own conclusion: #135 fixed a *display-order*
    mismatch (which field prints under which header); this time the
    screen's field *labels* and the code's own *identity-resolution*
    logic had drifted apart on which raw column answers "who is this
    person's L3/L4 reviewer" — when a user asks to audit a whole
    hierarchy for consistency, grep every resolver/scoping function that
    reads a chain field by raw index and compare each one's required
    role against the field's own displayed label, not just whether the
    column position used for *Excel/display* purposes is correct; the
    two kinds of "correct" (which Excel column, vs. which column a
    reviewer-identity check trusts) can diverge silently and only the
    second one explains a "the filter dropdown has nobody in it" report.

146. **User asked for the "รอบประเมิน" (Cycle History) page's "ผู้เข้าร่วม"
    column to "update ข้อมูลและเรียงลำดับหัวหน้าด้วย," confirmed via a
    clarifying question to mean: the real list of names participating in
    that cycle, sorted by chain-of-command order (L1→L2→L3→L4 per #70/
    #88's convention), not the bare number already there.** Investigated
    first: `renderCyclesTable()`'s "ผู้เข้าร่วม" column already computed a
    real, live count from `getEvalParticipants()` (correct, never
    hardcoded) — but there was no way anywhere on this page to see *who*
    those people actually are, only the count. Added a "👥 รายชื่อ"
    button per cycle row opening a new `mCycleParticipants` modal
    (`openCycleParticipantsModal(cycleId)`/`renderCycleParticipantsList(c)`):
    pulls from the exact same `getEvalParticipants()` call the count
    itself is computed from (never a second, independent query that
    could silently disagree with the number right next to it — the
    #126/#127/#138 discipline), looks up each participant's real draft
    for that cycle's year via `getDrafts().find(d=>d[0]===u[0] &&
    d[2]===c.year)` (the same `draftKey()` fields every other lookup in
    this file uses) to show their actual real status in this cycle
    (`CYCLE_PARTICIPANT_STATUS_TH`, an honest "ยังไม่ส่งแบบประเมิน" when
    no draft exists yet — never a guessed status, per CLAUDE.md #14),
    and sorts by `CYCLE_PARTICIPANT_ROLE_RANK` (`emp:0, unit:1, l1:2,
    l2:3, gm:4, exec:5, admin/sysadmin:6`) ascending — emp(no tier)
    first, then หัวหน้าหน่วย(L1)→หัวหน้าแผนก(L2)→ผจก.ส่วน(L3)→GM(L4),
    matching the user's own stated reading order rather than the
    reverse top-down order `NAV_ROLE_LABEL` happens to use elsewhere
    (#79) — then alphabetically by real name within the same rank.
    Reused `NAV_ROLE_LABEL` for the role column text (never a new label
    set) and left the page's own nav gating (`data-role="admin"`)
    unscoped inside the modal, same as the rest of this admin-only page
    — `getEvalParticipants()` already returns `null`-scope/company-wide
    for admin per #45, so no additional filtering was needed or added.
    **Deliberately did NOT touch** the separate "กำหนดการขั้นตอน —
    FY2026-ANNUAL" table on the same page — noticed while reading this
    section that it's itself a pure CLAUDE.md #16 mock table (hardcoded
    step statuses/responsible-person text, a literally hardcoded
    "FY2026-ANNUAL" title that never reflects the real selected cycle),
    but the user's request was specifically about the participant list,
    not that table — flagging it here rather than fixing or silently
    leaving it implying it's fine, since a future "the step timeline
    doesn't update either" report would be this exact table. Verified
    with a test that seeds a real 4-tier chain (unit→l1→l2→gm) plus one
    employee with a real `Approved` draft this cycle, confirms the
    rendered row order matches `emp→unit→l1→l2→gm` exactly (not just
    "roughly sorted"), and confirms the employee's real `Approved`
    status renders as "อนุมัติเสร็จสิ้น" rather than a placeholder — plus
    the standard click-sweep (`nav pages clicked: 22 errors: []`).
    **Second half of the same message — "การตั้งการแจ้งเตือนทำยังไง"
    (how do you set up notifications) — confirmed via the same
    clarifying round to mean the existing "📢 ส่ง Reminder" button
    (#10/#90) — answered directly, no code change needed**: this button
    (Dashboard header, admin/sysadmin-only per #90's role gate) is a
    manual, one-shot send, not a recurring/scheduled notification —
    there is no "set up" step beyond clicking it each time reminders are
    needed, because this app has no server to run a schedule on (the
    same honest architectural limit CLAUDE.md #8/#33 already state).
    Clicking it opens `mReminder`, where Admin picks a real target group
    (`getReminderTargets()`: "ยังไม่ส่งแบบประเมิน" / "หัวหน้าระดับ 1
    ทั้งหมด" / "ทุกคนที่ Active," each a real live count/list from
    `MASTER_USERS`/`getDrafts()`, never hardcoded), optionally edits the
    message text, and clicks "ส่งทันที" — `sendReminder()` opens a real
    `mailto:` link BCC'ing every real email address on file for that
    target group (the honest, server-less channel CLAUDE.md #10
    established — the in-system/LINE checkboxes next to it are visibly
    `disabled` with the real reason printed beside them, never a fake
    "sent" claim), which hands off to the Admin's own email client to
    actually send. Told the user this plainly rather than building an
    unasked-for scheduling feature on a guess.

147. **Follow-up to #146: user asked "ต้องการแจ้งผ่าน line ได้ไหม" (can we
    notify via LINE?) — explained honestly what it would take (a real
    LINE Official Account + Messaging API channel, a token that must go
    through the Worker since it can never be embedded in the page per
    #25's own reasoning, and each employee's LINE User ID — which the
    app has no way to invent or guess) and asked two clarifying
    questions before building anything.** Confirmed: the company has or
    can get a real LINE OA/Messaging API channel, but nobody currently
    knows employees' real LINE User IDs or where they're stored — and
    the user explicitly chose to start preparing the data structure now
    (a new field + Add/Edit Employee UI) even with no channel token set
    yet, rather than wait.
    **Built the real send mechanism, token-ready but not yet live**:
    added a `/send-line` endpoint to `tools/sml-pms-proxy-worker.js`
    (LINE Messaging API `/v2/bot/message/multicast`, chunked at 500
    recipients per call per LINE's own limit) using a brand-new Worker
    secret, `LINE_CHANNEL_ACCESS_TOKEN` — deliberately a **separate**
    secret from every MS365 one, since LINE's channel access token is a
    static long-lived string with its own completely different auth
    flow, not an OAuth client-credentials token like `getAppToken()`'s.
    Placed the `/send-line` route check **before** `getAppToken(env)` is
    ever called in the Worker's request handler — sending LINE messages
    has nothing to do with Microsoft Graph at all, so it must not fail
    just because `TENANT_ID`/`CLIENT_ID`/`CLIENT_SECRET` are missing or
    wrong (the same "don't let one channel's setup block another
    channel" reasoning #58's `#dash`-page special-case already
    establishes for a different kind of ordering hazard). **This changes
    the Worker's own code, so per CLAUDE.md #41/#106's own precedent it
    needs a real redeploy** before this fix has any live effect — every
    purely-client change in this file goes live the moment GitHub Pages
    updates, this one specifically does not.
    Added `MASTER_USERS[21]` (`lineUserId`, append-only per CLAUDE.md
    #5) with a real `mu_lineid` text field in Add/Edit Employee (wired
    into `saveUserFromModal()`/`clearUserModalForm()`/
    `fillUserFormFields()` the same three-point pattern every other
    field in this modal already follows) — its own help text states
    plainly that this is **not** a LINE ID/phone number the employee
    picks, it's the opaque string LINE itself assigns, and the *only*
    real way to obtain it honestly is for the employee to add the
    company's LINE OA as a friend and send it any message once (so a
    LINE webhook event carrying their real `userId` fires) — this app
    has no webhook receiver to capture that automatically (a materially
    bigger feature nobody asked for in this request, flagged in the
    Worker file's own doc comment rather than built on a guess, same
    "flag, don't build the bigger thing" discipline as #76), so for now
    IT/Admin must read the real value off LINE's own chat log/Developers
    Console and type it in by hand. Round-tripped the new field through
    Excel the same `EmployeeSettings` table that already carries
    `pinHash`/`evalLevel`/`evalExempt` (#24/#83/#143) — extended to a 6th
    column, `LineUserId` — rather than the main `Employees` table, since
    there's no confirmed real column for it there (#30's "verify against
    the field, never assume" rule) and it's exactly the same
    local-admin-set-fact shape as the other three fields already in that
    table. `applyEmployeeSettingsRows()`/`pushSingleEmployeeSettings()`/
    `ms365PushEmployeeSettings()` all updated together, same discipline
    #143 just established for adding `EvalExempt` as that table's 5th
    column — never update one without the other two, or read and write
    silently disagree on the table's shape.
    **Wired the real send into the existing "📢 ส่ง Reminder" modal**
    (#10/#90) rather than building a second, parallel notification
    screen: the LINE checkbox (previously permanently `disabled` with
    "ยังไม่รองรับ") is now a real, checked-by-default channel —
    `sendLineReminder(targets, message)` filters to only the people who
    actually have a real `lineUserId` on file, calls the new Worker
    endpoint via the existing `workerFetch()` helper (never a second,
    parallel HTTP-calling path), and returns an honest `{sent, failed,
    reason}` result rather than ever assuming success — the same
    best-effort/never-silently-fail rules #26/#40/#58's other emails
    already follow. `sendReminder()` itself now sends through **both**
    channels independently in one click when both are checked (email via
    the existing `mailto:` flow, LINE via the new Worker call) and
    reports each channel's real outcome separately in one toast — one
    channel failing (e.g. the Worker not yet configured) never silently
    swallows or blocks the other succeeding. `renderReminderPreview()`'s
    recipient list now shows a "💬 LINE" tag next to anyone with a real
    `lineUserId`, the same honest-presence-check pattern the email
    column next to it already used. Verified with a test that mocks
    `workerFetch`/`isWorkerConfigured` (no real network reachable from a
    test environment) and confirms: the preview correctly tags only the
    employee with a real LINE User ID; `sendReminder()`'s real `/send-
    line` call carries exactly that one employee's ID and the real
    message text; and with the Worker reported as not configured,
    `sendLineReminder()` returns the honest "ยังไม่ได้ตั้งค่า Proxy"
    reason rather than a fake success — plus a second test driving the
    real Add/Edit Employee UI end-to-end (not direct array mutation):
    saves a real LINE User ID, confirms it round-trips on reopening the
    edit form, confirms editing it updates in place rather than
    duplicating the row, and confirms leaving the field blank on a later
    edit preserves the previously-saved value rather than wiping it
    (matching the existing `mu_email` field's own established
    convention) — plus the standard click-sweep (`nav pages clicked: 22
    errors: []`). **Found and deliberately left alone, not a regression
    from this fix**: a pre-existing scratchpad test from earlier in this
    session (`test_reminder.js`) failed when re-run — traced to the test
    itself assigning a free-text string to `mu_position`, which has been
    a real `<select>` (populated from `ORG_MASTER`) since CLAUDE.md #51,
    several fixes before this one; setting `.value` to a string with no
    matching `<option>` silently fails exactly as #50 already documents,
    so the test's own seed data (written before #51, never updated since)
    is stale, not a sign this fix broke employee saving — confirmed by
    building a fresh equivalent test using a real option value, which
    passed cleanly. General lesson combining #25/#76: when a user asks
    for a new notification channel, the real blocker is almost never
    "can the code call that platform's API" (that part is usually
    small, as the Worker endpoint here was) — it's "where does the
    per-recipient identifier the API needs actually come from," and if
    the honest answer is "nowhere yet, and this app has no way to
    capture it automatically," say so plainly and build the data
    structure + send mechanism ready to receive that identifier, rather
    than quietly building a webhook receiver nobody asked for just to
    make the feature feel more "finished."

148. **Follow-up to #147: user said "เพิ่ม webhook" (add a webhook) —
    directly asking to close the exact gap #147 itself flagged as not
    built: a real way to capture an employee's LINE User ID
    automatically instead of IT/Admin typing it in by hand.** Added a
    `/webhook/line` route to `tools/sml-pms-proxy-worker.js`, checked
    **before** the existing `X-Api-Key` gate (line ~72) rather than
    after it — LINE's own platform calls this endpoint directly, and it
    will never carry our `X-Api-Key` header; its own `x-line-signature`
    header (an HMAC-SHA256 of the raw request body, keyed with a new
    Worker secret `LINE_CHANNEL_SECRET` — deliberately a **different**
    secret from `LINE_CHANNEL_ACCESS_TOKEN`, since one proves "this
    request really came from LINE" and the other authorizes "send a
    message as this OA," two unrelated LINE credentials) is the real
    auth mechanism for this one route, computed via Cloudflare's native
    Web Crypto API (`crypto.subtle.importKey`/`sign`, no library needed)
    and compared byte-for-byte against the header, never a prefix/length
    check. **Real flow built**: an employee adds the company's LINE OA
    as a friend and sends their own employee code (e.g. "SML-001") as a
    plain text message → `handleLineWebhook()` verifies the signature →
    for each event, `handleLineEvent()` filters to real text messages
    only (ignores stickers/images/follow events), looks up the typed
    code against the real `Employees` Excel table (trimmed, case-
    insensitive — never trusted blindly, per CLAUDE.md #1's "resolve by
    code, never guess" rule) → if found, reads the employee's *existing*
    `EmployeeSettings` row (if any) and carries `PinHash`/`EvalLevel`/
    `EvalExempt` through unchanged, writing only the real `userId` from
    `event.source.userId` into the new 6th column — never blanking the
    other three local-only fields a LINE registration has no business
    touching (the same "re-merge, don't wipe" discipline #17/#6/#143
    already established for this exact table) → upserts via the
    existing `upsertRow()` helper (never a second write path) → replies
    in the same chat (LINE's `/v2/bot/message/reply`, using the event's
    one-time `replyToken`) confirming the real matched name+code. **If
    the code doesn't match any real employee, replies honestly saying
    so** rather than silently doing nothing or guessing — the same
    CLAUDE.md #10/#14 "never look like it worked when it didn't" rule.
    `handleLineWebhook()` itself always returns a real `200 OK` to LINE
    once past signature verification (even if the Graph/MS365 side
    throws — caught and swallowed only at that outer layer, never inside
    `handleLineEvent()` itself, so one event's write failure can't crash
    the loop for the rest of a batch) since LINE aggressively retries any
    endpoint that doesn't return 200, but a genuinely invalid signature
    or a missing `LINE_CHANNEL_SECRET` still returns a real 403/500 —
    "always ack LINE" and "never pretend a security check passed" are
    different rules and this keeps them separate. Rewrote the Worker's
    own top doc comment (the secrets list, now 9 — added
    `LINE_CHANNEL_SECRET` with real deploy steps: set the Webhook URL in
    LINE Developers Console to `<worker-url>/webhook/line`, click
    "Verify," turn "Use webhook" on, and turn the OA's own auto-reply/
    greeting off so employees don't see two conflicting responses) and
    replaced the paragraph #147 had explicitly left admitting "ยังไม่ได้
    ทำ" (not yet done) with one describing the real, now-built self-
    registration flow — per this project's own #34/#49/#67/#97
    discipline, a doc claim that goes stale the moment the gap it
    described gets closed must be rewritten in the same change, not
    left to drift. Updated the client-side `mu_lineid` help text (Add/
    Edit Employee) to lead with the new real self-registration path
    (message your code to the OA) while keeping manual entry as the
    documented fallback — never silently making the fallback instructions
    sound like the only option once a better one exists.
    **Verified with a standalone Node script** (not Playwright — this is
    server-only Worker code LINE calls directly over HTTP, with no
    browser UI path to click through) that `import()`s the Worker module
    and calls its real `fetch()` handler with a hand-built `Request`
    (a real HMAC-SHA256 signature computed with the same test
    `LINE_CHANNEL_SECRET`) against a mocked `global.fetch` intercepting
    every downstream Graph/LINE call: (1) a valid-signature request with
    a real matching employee code correctly upserts `EmployeeSettings`
    with the new `userId`, preserves the existing `PinHash`/`EvalExempt`
    untouched, and sends a reply naming the real matched employee; (2) an
    invalid signature is rejected with 403 and makes **zero** downstream
    Graph/LINE calls at all (confirmed by asserting the mock's call log
    is empty, not just checking the response code); (3) a code matching
    no real employee writes nothing and replies with the honest "not
    found" message; (4) a Worker with no `LINE_CHANNEL_SECRET` configured
    at all fails closed with a real 500, never silently accepting an
    unverifiable request. One mock-shape bug was caught and fixed during
    this process, not a real Worker bug: the first draft of the test's
    mocked Graph `/rows` GET response omitted the `index` field each row
    object needs (the real Graph API always includes it) — `upsertRow()`'s
    own `rows[idx].index !== undefined` check then correctly fell through
    to "no match, add a new row" instead of "match found, PATCH it,"
    which is exactly the defensive behavior CLAUDE.md #30/#97 already
    established (an ambiguous/incomplete match should never risk
    corrupting an existing row) — worth remembering as the first thing to
    check if a future Worker-mocking test shows an unexpected "added"
    instead of "updated" result. **Real remaining deploy steps, stated
    plainly rather than implied automatic**: none of this takes effect
    until the Worker is redeployed (same as every other Worker-side fix
    in this file, #41/#106 et al.) with the new `LINE_CHANNEL_SECRET`
    secret added, and until the company's real LINE Developers Console
    is pointed at the real deployed Worker URL with webhooks turned on —
    told the user this directly rather than claiming the feature is live
    the moment the code is pushed. General lesson combining #76/#147: a
    gap explicitly flagged as "a separate, bigger task" in one fix is
    exactly the kind of thing a user will come back and ask for by name
    once they've had time to feel the manual workaround's real cost — when
    they do, the earlier flag's own write-up is usually most of the real
    design already done, so implementing it is a matter of building
    exactly what was already described, not re-deriving scope from
    scratch.

149. **Follow-up to #148: user tested the real webhook end-to-end — typing a
    fake code ("SML-001") correctly got the honest "ไม่พบรหัสพนักงาน" reply
    (confirming signature verification, the Employees lookup, and the reply
    mechanism all genuinely work), but typing two real codes ("91021",
    "90230") produced **zero reply at all** — "เงียบไม่มีอะไร".** Traced
    `handleLineEvent()` (#148): once a real employee is found, it calls
    `listRows(...,'EmployeeSettings')`/`upsertRow(...,'EmployeeSettings',...)`
    and only then the success `replyLine()` — but this whole block was
    wrapped by `handleLineWebhook()`'s outer loop as
    `handleLineEvent(ev,...).catch(()=>{})`, exactly the CLAUDE.md #66/#68/
    #69 shape of bug (a fire-and-forget call whose failure is silently
    swallowed with zero trace) — just reached for the first time in this
    file via a LINE webhook instead of an Excel push/pull. Since the
    "not found" reply (which fires *before* ever touching
    `EmployeeSettings`) worked correctly, the failure is provably
    somewhere after that point — most plausibly the real Excel workbook's
    `EmployeeSettings` table doesn't exist yet or is named differently
    (the same "Table not found" shape #66 already diagnosed for
    `AuditLog`), though this can't be confirmed without seeing the actual
    Cloudflare Logs output. Fixed by wrapping the
    `EmployeeSettings`-read/upsert/success-reply block in its own
    `try/catch` inside `handleLineEvent()`: on failure, it now (1) calls
    `console.error()` with the real error message (so Cloudflare's Logs
    panel shows the actual cause instead of nothing) and (2) sends an
    honest in-chat reply via the same already-proven-working `replyLine()`
    — "⚠️ พบรหัสพนักงาน … แล้ว แต่บันทึกข้อมูลไม่สำเร็จ … กรุณาแจ้ง Admin
    ให้ตรวจสอบ Log" — rather than the employee typing a correct code and
    getting total silence with no way to tell whether it worked. Also
    added the same `console.error()` to `handleLineWebhook()`'s outer
    catch (covers `getAppToken()`/`resolveSite()` failing before any
    employee lookup even starts — a case that would currently reply to
    nobody at all, not even with the "not found" message, since the loop
    never runs). Verified with a 5th test case added to the existing
    webhook test suite: mocks the `EmployeeSettings` GET call to fail with
    a real "Table not found" error (the most likely real cause), confirms
    the webhook still returns `200` to LINE (so LINE doesn't retry-storm
    it), confirms a real honest error reply is sent in chat instead of
    silence, confirms `EmployeeSettings` itself is left untouched (no
    partial/corrupt write), and confirms the real error text is captured
    via `console.error` — plus re-ran all 4 of #148's original test cases
    with zero regressions. **This fix makes the failure visible — it does
    not by itself fix whatever the real underlying Excel problem is.**
    Told the user plainly: after redeploying this fix, send a real
    employee code again — now either a real in-chat warning will appear
    (telling them it failed, not just silence), or (if they also open
    Cloudflare's Logs panel while testing) the exact error text will show
    up, which is the next real diagnostic step rather than guessing
    further; most likely next finding is that the real Excel workbook
    needs an `EmployeeSettings` table created (same per-table setup #24
    always required for every Excel-backed feature in this file).
    General lesson sharper than #66/#68/#69's own conclusion: those three
    fixes closed every silent `.catch(()=>{})` reachable from the *web
    app's* own sync/push functions, but a brand-new entry point added
    later (#148's LINE webhook) is a fresh place for the identical mistake
    to reappear, since it's a different file section built at a different
    time — "never let a fire-and-forget call swallow its own failure with
    zero trace" is a standing rule for *any* new async call in this
    codebase, not a one-time sweep that's ever fully "done"; grep for
    `.catch(() => {})`/bare `catch(e){}` in any newly-added function
    before considering it finished, the same way #69's own mechanical
    pass should have been re-run here from the start.

150. **Follow-up to #149: user applied the fix (and presumably created the
    real `EmployeeSettings` table in Excel per the earlier diagnosis) and
    reported "เพิ่มแล้วไม่มีอะไรเกิดขึ้น" (added it, nothing happened) —
    still zero reply from LINE for a real employee code.** Re-read
    `handleLineWebhook()`'s own structure rather than guessing a second
    time: #149 only wrapped the `EmployeeSettings` read/upsert/reply
    block inside `handleLineEvent()` with a try/catch that replies
    honestly on failure — but `handleLineEvent()` is only ever reached
    from *inside* the outer `try { const token = await getAppToken(env);
    const {driveId,itemId} = await resolveSite(env,token); for (const ev
    of events) ... }` block. If `getAppToken()`/`resolveSite()` itself
    throws (wrong `TENANT_ID`/`CLIENT_ID`/`CLIENT_SECRET`, an expired/
    misconfigured app registration, `SITE_URL`/`FILE_PATH` not matching
    the real SharePoint site) — the exact same class of failure #68/#69
    already found breaks pushes elsewhere in this file — the whole `for`
    loop never runs at all, so `handleLineEvent()` (and therefore #149's
    own new error-reply) never even gets called. The outer `catch` block
    at that point only had `console.error()`, with **zero reply to
    LINE** — a different, one-layer-earlier instance of the exact same
    #149/#66/#68/#69 shape of bug: a real failure path with no honest
    user-facing signal, just silence, living one function higher up than
    the one #149 just fixed. This explains why the symptom looked
    identical before and after #149's fix — the user's real failure
    point was never inside `handleLineEvent()` at all, it was in the
    Graph token/site setup one level above it, which #149's fix never
    touched. Fixed by replying to every real text-message event in the
    outer `catch` too — `env.LINE_CHANNEL_ACCESS_TOKEN`-based
    `replyLine()` calls need zero Microsoft Graph connectivity at all,
    so they work independently of whatever broke `getAppToken()`/
    `resolveSite()` — with an honest "⚠️ ระบบเชื่อมต่อข้อมูลขัดข้องชั่วคราว
    ไม่สามารถตรวจสอบรหัสพนักงานได้ในขณะนี้ ... หรือแจ้ง Admin ให้ตรวจสอบ
    Log" message, plus the existing `console.error()` kept for Cloudflare
    Logs visibility. Verified with a 6th test case added to the webhook
    suite — deliberately imported the Worker module **fresh** via a
    cache-busting query string (`...worker.js?case6`) rather than reusing
    the same module instance every other test case shares, since
    `getAppToken()`/`resolveSite()` memoize their results in module-level
    `cachedToken`/`cachedSite` variables; reusing the already-successful
    worker instance from case 1 onward would have silently skipped this
    whole failure path (the cached token/site from an earlier case's
    success would just be returned, never hitting the mocked failing
    `fetch` at all) and the test would have falsely passed without
    actually exercising the bug. The fresh-import test mocks
    `login.microsoftonline.com` to fail with a realistic
    `invalid_client` error and confirms: the webhook still returns `200`
    to LINE, a real honest error reply is sent in chat (not silence),
    and the real error text is captured via `console.error` — plus
    re-ran all 5 of #148/#149's existing cases with zero regressions.
    **Told the user plainly, since this fix alone may still not resolve
    their report**: if the real underlying cause is genuinely a Graph/
    MS365 connectivity problem (wrong secret, misconfigured site), the
    user will now at minimum *see* a real error message in LINE chat
    instead of silence, which is a different, better failure mode but
    not a fix for the connectivity problem itself — the next real
    diagnostic step is the same as #149 already stated: check Cloudflare
    Logs after redeploying and resending a real code, and report back
    the exact error text that appears (now guaranteed to appear in *two*
    places — chat and Logs — however deep in the request the real
    failure happens to be). General lesson sharper than #149's own
    conclusion: when a silent-failure fix is applied to one function and
    the symptom doesn't change, don't assume the fix itself is broken —
    check whether the *call site* that was supposed to reach the fixed
    code is actually guaranteed to run; a `try/catch` wrapped a few
    layers further out, wrapping the exact call path that leads to the
    newly-fixed code, can just as easily swallow the failure before it
    ever gets there — the "never let a fire-and-forget call go silent"
    rule from #149 applies recursively to every layer of a nested
    try/catch chain, not just the innermost one that happened to be
    fixed first.

151. **Follow-up to #150: after both silent-failure fixes, real Cloudflare
    Logs finally showed up (`POST /webhook/line`, "0 Errors") — but the
    employee still received zero reply in LINE chat.** Confirmed via
    screenshots this was *not* a reachability problem: Webhook toggle ON,
    Chat mode OFF (correct bot routing), the registered Webhook URL
    matched the Worker's real route exactly, and Cloudflare Logs showed
    the POST actually arriving and completing with no error. That
    combination — request logged, zero errors, no reply sent — pointed at
    one specific remaining gap: `replyLine()` (the function that actually
    sends the reply message back to LINE) called `fetch()` to LINE's
    `/v2/bot/message/reply` endpoint and **never checked the response**
    at all — unlike its sibling `sendLineMulticast()` a few lines above
    it, which already correctly checks `res.ok` and throws. If LINE
    rejected the reply for any real reason (an expired or already-used
    `replyToken` — very plausible after several rounds of repeated manual
    testing in this exact conversation, since a reply token is single-use
    and short-lived; or a bad/expired `LINE_CHANNEL_ACCESS_TOKEN`), the
    fetch would "succeed" as a JS promise (no network error) while LINE's
    own API response said no — and the code, never reading that response,
    carried on as if the message had gone out. This is the identical
    CLAUDE.md #66/#68/#69/#149/#150 shape of bug (a fire-and-forget call
    whose real outcome is never checked) found for a *third* time in the
    same LINE webhook feature, one layer deeper again: #149 fixed the
    Excel-write step going silent, #150 fixed the Graph-auth step going
    silent, and this is the reply-send step itself going silent — the
    exact kind of step CLAUDE.md #149/#150 already worried might still be
    hiding one level further in, now confirmed.
    Fixed `replyLine()` to check `res.ok` and throw a real `Error` (with
    the actual HTTP status and LINE's own error body text) on failure —
    matching `sendLineMulticast()`'s existing pattern exactly, so the two
    sibling functions can no longer disagree on whether an unchecked LINE
    API response is safe to ignore. **Also restructured `handleLineEvent()`
    to separate the EmployeeSettings write from the reply send into two
    independent try/catch blocks** rather than one shared block: the old
    code wrapped both the real data write (`upsertRow`) and the
    confirmation `replyLine()` call in a single try/catch, so if the
    write succeeded but only the *reply* failed (exactly this bug), the
    catch block would have wrongly logged "บันทึกข้อมูลไม่สำเร็จ" (save
    failed) and sent a second, misleading reply telling the employee to
    try again — even though their LINE User ID had already been written
    correctly. Now `saveOk` tracks the write's real outcome independently,
    the success/failure reply text is chosen from that real flag, and the
    reply-send itself has its own try/catch logging a distinct
    `'replyLine failed'` error — so a future Sync-Log-style read of
    Cloudflare Logs can always tell which of the two genuinely different
    failures happened, never conflating one for the other.
    Verified with a new test case (case 7) added to the existing LINE
    webhook test suite: mocks the LINE reply API to fail with a realistic
    `400 Invalid reply token` while every other call (Employees lookup,
    EmployeeSettings upsert) succeeds normally — confirms the employee's
    real LINE User ID **is** correctly saved to `EmployeeSettings` despite
    the failure, confirms no reply is ever actually sent (matching the
    real-world symptom exactly), confirms a distinct `'replyLine failed'`
    + the real `'Invalid reply token'` text is logged, and explicitly
    confirms the old misleading `'EmployeeSettings save failed'` message
    is **not** logged for this case — plus re-ran all 6 of #148/#149/
    #150's existing cases with zero regressions (their mocked LINE reply
    responses already returned `ok: true`, so the new check doesn't
    affect them). **Told the user the real next step is operational, not
    code**: since this bug most plausibly explains every "zero reply"
    test so far in this exact debugging session (each retest reused a
    `replyToken` value from LINE's real single-use, short-lived tokens —
    though a single click in the real LINE app always generates a fresh
    one, so this diagnosis will be confirmed or ruled out by the *next*
    genuinely fresh message after redeploying this fix, not by replaying
    an old test) — redeploy the Worker, then send one brand-new message
    (not a repeat/retry of an old one) and check both LINE chat for a
    reply and Cloudflare Logs for either a success or a newly-specific
    `'replyLine failed: ...'` error naming the real reason if it still
    fails. General lesson sharper than #150's own conclusion: when a
    "never let a fire-and-forget call go silent" audit has already fixed
    two layers of the same call chain (#149's Excel write, #150's Graph
    auth) and the symptom still doesn't change even after logs start
    showing real traffic with "0 errors," the next place to check is not
    another layer of try/catch around the same calls — it's whether the
    *terminal* action itself (the actual external API call whose success
    is the whole point, here `fetch()` to LINE's reply endpoint) ever
    checks its own response at all; "0 Errors" in a logging dashboard
    only means nothing *thrown* was caught — a bare, unchecked `fetch()`
    call that resolves normally even on a non-2xx HTTP response (true of
    the Fetch API by design) will never throw on its own, so it can sit
    at the very end of an otherwise fully-logged chain and still fail
    completely invisibly unless its `response.ok` is explicitly checked.

152. **Follow-up to #151: even after `replyLine()` started checking its
    own response, real tests still produced zero reply in LINE — the
    `/webhook/line` request in Cloudflare Logs itself held the real
    answer, buried in a field nobody had looked at yet.** Expanding one
    real request's full JSON (`$workers.event.outcome`) showed
    `"outcome": "canceled"` with `"wallTimeMs": 1960` against
    `"cpuTimeMs": 11` — the request was *cancelled mid-flight*, not
    errored, and nearly all 2 seconds of wall time was spent waiting on
    network, not computing. `handleLineWebhook()` had always `await`ed
    the *entire* real chain — `getAppToken()` → `resolveSite()` →
    `listRows('Employees')` → `listRows('EmployeeSettings')` →
    `upsertRow()` → `replyLine()` — before ever sending LINE its 200 OK
    response. LINE's platform expects a webhook to acknowledge within a
    short window; a chain of 5+ sequential Microsoft Graph round-trips
    plus a LINE API call comfortably exceeds that, so LINE gave up and
    closed the connection before our response ever left the Worker —
    which is exactly what Cloudflare's `"canceled"` outcome records.
    This explains every earlier observation at once: LINE's own
    "Verify" button sends an empty `events: []` array (no Graph calls
    at all, trivially fast) so it always succeeded; a real employee's
    message always needed the full chain, so it never got a chance to
    finish before being cut off — and because nothing in that chain
    actually *threw*, there was nothing for #149/#150/#151's new
    `console.error()` calls to ever catch, which is why Cloudflare kept
    showing "0 Errors" even once logging was fixed for every failure
    *that could occur*. The real failure mode here isn't a JS exception
    at all — it's an external cancellation of the whole execution
    before the code ever got a chance to fail or succeed on its own
    terms, which no amount of try/catch inside the handler can detect
    or log, since the runtime tears the invocation down from outside.
    Fixed by restructuring `handleLineWebhook()` to **answer LINE
    immediately** (`200 OK`) the moment the signature is verified and
    the body is parsed, and run the real work — the whole Graph chain,
    the Excel write, and the reply send — in the background via
    `ctx.waitUntil(processEvents())`, the standard Cloudflare Workers
    mechanism for continuing async work after a response has already
    been returned (this is also LINE's own documented recommendation
    for webhooks that can't finish instantly). `fetch(request, env)` was
    widened to `fetch(request, env, ctx)` to receive the real
    `ExecutionContext`, threaded through to `handleLineWebhook(request,
    env, ctx)`. A guard (`if (ctx && typeof ctx.waitUntil ===
    'function')`) falls back to a plain `await processEvents()` when no
    `ctx` is supplied — the exact case every existing Node test in
    `test_line_webhook.js` hits, since they call `worker.fetch(req,
    ENV)` with only two arguments — so none of #148/#149/#150/#151's
    existing test cases needed any change at all; they keep exercising
    the sequential-await path with identical observable results.
    Verified with a new test case (case 8) that mocks a slow (gated,
    never-resolving-until-released) `login.microsoftonline.com` call
    and a fake `ctx` object capturing whatever promise is passed to
    `waitUntil()`: confirms the HTTP response comes back in well under
    500ms *while the mocked Graph call is still deliberately hanging*
    (proving the response genuinely doesn't wait on it), then releases
    the gate and explicitly awaits the captured background promise,
    confirming the real `EmployeeSettings` write and the real LINE
    reply both still complete correctly once given the chance to finish
    — so the fix provably trades "blocks the response" for "still does
    the real work," not for "silently drops the real work." Re-ran all
    7 of #148–#151's existing cases with zero regressions. **Told the
    user the next step is the same redeploy-and-send-a-fresh-message
    test as before** — this is a genuine architecture-level fix (an
    `ExecutionContext` is something only the real Cloudflare Workers
    runtime provides, impossible to exercise end-to-end outside a real
    deployment), so while the Node test suite proves the *logic* is
    correct, only a real redeploy and a real LINE message can confirm
    LINE itself now receives the 200 fast enough to stop disconnecting
    early. General lesson sharper than #150's own conclusion: once a
    "never let a fire-and-forget call go silent" audit has closed every
    reachable `try/catch`/`.catch()` gap in a call chain and the real
    Cloudflare Logs entry for the failing request still shows "0
    Errors," the next place to look is not inside the handler's own
    control flow at all — it's the platform-level `outcome` field
    Cloudflare itself records for that invocation (`ok` vs `canceled`
    vs `exceededCpu` etc.), which can reveal the execution was cut off
    from *outside* the code, a failure mode no amount of internal
    error-checking can ever catch or log, and whose real fix is
    architectural (ack fast, defer the slow work) rather than another
    layer of exception handling.

153. **User's screenshot of Outlook, opened by clicking "📢 ส่ง Reminder"'s
    "ส่งทันที" button, showed the real `mailto:` compose window with no
    "To" field filled in at all — "ไม่มีอยู่ช่อง to" (there's no address
    in the To field).** Traced `sendReminder()` (#90/#146/#147): the
    generated link was `mailto:?bcc=${bcc}&subject=...&body=...` — every
    real recipient was deliberately put in Bcc only (so recipients can't
    see each other's addresses), leaving the `mailto:` scheme's own
    address slot completely empty. Many mail clients, Outlook among them,
    refuse to enable Send with an empty "To" field even when Bcc is
    populated — the feature wasn't a placeholder (CLAUDE.md #10's usual
    shape), it genuinely opened a real compose window with the real
    recipient list already in Bcc, it just couldn't actually be sent
    without the sender manually typing something into To first, which
    defeats the "เปิดโปรแกรมอีเมลแล้ว พร้อมส่งถึง N คน" toast's own claim.
    Fixed by putting the sending Admin's own real email
    (`CURRENT_SESSION_USER[15]`, falling back to the first real recipient
    only in the unlikely case the admin's own record has no email on
    file) into the `mailto:` link's address slot — `mailto:${toSelf}?
    bcc=${bcc}&...` — so there is always a real, pre-filled "To" address
    satisfying Outlook's send gate, while every actual recipient stays
    exactly where #90 originally put them (Bcc), preserving the original
    privacy intent unchanged. Verified the fix at the string-construction
    level (Chromium's `window.location`/`Location.prototype.href` setter
    could not be safely intercepted in headless Playwright to test a real
    click-through, since `location` is non-configurable on both the
    window object and its prototype in this engine) — confirmed the
    generated URL decodes to a real `name@domain` address before the `?`
    and still carries every recipient in `&bcc=`, matching exactly what
    Outlook's screenshot was missing. General lesson: a `mailto:` link
    built entirely from `bcc=` with no address portion is syntactically
    valid per the URI scheme, but several real mail clients (Outlook
    among the most common in a corporate setting like this one) treat an
    empty "To" as a hard block on sending regardless of how many Bcc
    addresses are present — any future `mailto:` construction in this
    file should always put a real address in the scheme's own slot (the
    sender's own address is the natural choice when every real recipient
    must stay private in Bcc), not just trust that Bcc alone is enough to
    make a compose window actually sendable.

154. **User reported "ระบบยังไม่ดึงข้อมูล Line ID มาที่เวบ" (the system
    still isn't pulling the LINE ID into the web app) — the pull side
    itself (`applyEmployeeSettingsRows()`, `ms365SyncEmployeeSettings()`/
    `...Silent()`) checked out completely correct on inspection, reading
    `r[5]` and applying it to `emp[21]` exactly as #147 built it. The
    real bug was one function over, and only visible by reading the
    *other* sync that always runs first in the same chain.** `doLogin()`
    and `tryRestoreSession()` both call `ms365SyncEmployees(true)` (pulls
    the whole `Employees` Excel table and wholesale-replaces
    `MASTER_USERS`) immediately **before**
    `ms365SyncEmployeeSettingsSilent()` (pulls `lineUserId` back from
    `EmployeeSettings`) — the same ordering #32/#33 established. The
    first sync's own re-merge step (`loadEmployeesFromMs365()`'s
    `normalized.forEach(...)`, the mechanism CLAUDE.md #17 built
    specifically to stop a wholesale Employees-table replace from wiping
    local-only fields like `pinHash`/`evalLevel`/`evalExempt`) carried
    forward `r[17]`/`r[18]`/`r[20]` but **never `r[21]`** — `lineUserId`
    (#147's field) was simply never added to this re-merge list when it
    was introduced, so every `MASTER_USERS.splice(0, MASTER_USERS.length,
    ...normalized)` silently reset every employee's LINE User ID to
    `undefined` first, and only the *subsequent* `EmployeeSettingsSilent`
    sync could put it back — and only for an employee whose real Excel
    `EmployeeSettings` row happened to already exist with a non-empty
    `LineUserId` at that exact moment. The manual "📥 ดึงข้อมูลพนักงานจาก
    Excel" button (calling `ms365SyncEmployees()` directly, with no
    guaranteed follow-up settings sync right after) hit this gap even
    harder — a real click there could wipe a webhook-captured LINE ID
    with nothing to restore it until the next full login/reload. This is
    the exact same shape of bug CLAUDE.md #17 already names and #83/#143
    already fixed twice for `evalExempt`/other local-only fields — just
    missed for this one newest field (#147), since it was added to
    `MASTER_USERS` and to the *pull* side of `EmployeeSettings` without
    anyone separately checking whether the *Employees* sync's own
    re-merge list had been updated to match.
    Fixed by adding `r[21] = old?.[21] || '';` to the same `forEach`
    block, directly alongside `r[17]`/`r[18]`/`r[20]` — identical
    pattern, identical reasoning, nothing else needed changing since
    `applyEmployeeSettingsRows()`'s own pull logic was already correct.
    Verified with a test that seeds a real employee with a locally-known
    `lineUserId` (as the LINE webhook would have set it), mocks a real
    `ms365SyncEmployees(true)` pull (Employees table only, no
    `LineUserId` column — that field genuinely doesn't live there) with
    an *empty* `EmployeeSettings` table response (the worst real case —
    the webhook's write hasn't landed in Excel yet, or this device has
    never pulled it down before), and confirms the LINE User ID survives
    the Employees sync intact instead of being silently reset to blank
    — plus the standard click-sweep (`nav pages clicked: 17 errors: []`).
    General lesson sharper than #83's own conclusion: every time a new
    local-only field is added alongside `pinHash`/`evalLevel`/
    `evalExempt` in the same `EmployeeSettings` round-trip pattern (#24/
    #83/#143/#147), the checklist isn't just "add it to the pull
    function and the push function" — it's a *third* place too: the
    wholesale `Employees`-table sync's own re-merge `forEach`, which
    runs on a completely different schedule (every login/reload, plus a
    manual button) and will silently erase any local-only field that
    forEach doesn't explicitly know to carry forward, regardless of how
    correct the field's own dedicated pull/push functions are.

155. **User asked "วินัยคืออะไร เกรดจะเปลี่ยนไหม" then sent the company's
    real `.doc` ระเบียบปฏิบัติ "การประเมินผลการปฏิบัติงานประจำปี" and
    confirmed: the real policy (ข้อ 6.7) grades A/B/C/D/E by **relative
    rank within the same org unit** (10/20/40/20/10%), not the flat
    absolute-threshold `gradeFromX()` (x≥90→A, x≥80→B, …) this file had
    used since its very first version — the Dashboard's old fixed
    10/20/40/20/10 mock chart (CLAUDE.md #16) happened to show the same
    numbers as a *display* bug years before this real forced-distribution
    *grading* requirement ever came up; the two were coincidentally
    identical digits describing two completely different things, worth
    noting since re-reading #16 could easily be mistaken for "this was
    already built." Asked 4 clarifying questions before touching any
    grading code, given the blast radius (every employee's final grade):
    which org field is the smallest comparison unit (confirmed: `group`,
    `MASTER_USERS[3]`, with `section`[4]/`division`[5]/`department`[6]
    available to escalate to), when to escalate (confirmed: a real
    `<select>` the HR doing Calibration picks per run — never an
    automatic size threshold), whether to rank mixed roles together or
    split by form level first (confirmed: split by `getAssignedEvalLevel()`
    first, #23/#110's own function, reused rather than re-derived), and
    what a non-Bell-Curve "ปรับใหม่" case should mean (confirmed: a
    **per-person Admin override with a mandatory reason**, not a toggle
    to disable Bell Curve for a whole unit).
    Implemented entirely at the one real point in the pipeline where HR
    already sees every eligible employee at once — Calibration
    (`renderCalibQueue()`/`confirmCalibration()`, #61/#96) — since every
    earlier stage (self-eval, L1/L2/GM review) only ever sees one person
    at a time and literally cannot rank anyone against peers. Added
    `computeBellCurveGrades()`: groups the ready-for-Calibration roster
    by `(real org-field value chosen via a new `<select id="calibBellCurveField">`,
    assigned form level)`, sorts each group descending by the **live**
    `.calib-adj` input value (not the stale draft X — so Bell Curve
    always ranks against whatever score HR is about to actually save,
    the same "compute from what will really be committed" discipline
    CLAUDE.md #101 already established for attendance pushes), and
    assigns grades via cumulative-percentage boundaries
    (`Math.round(cumPct/100*n)` per grade, `BELL_CURVE_PCT =
    [['A',10],['B',20],['C',40],['D',20],['E',10]]`) — pure math with no
    special-casing for tiny groups (verified: n=1 lands in the middle
    grade C, n=2 splits B/D, never forcing an A or E that wouldn't be
    real), matching the user's own choice not to auto-escalate by size.
    Ties are broken per the real document's ข้อ 6.8 order — Y (nearest
    available proxy for "คะแนนดิบก่อนแปลงอัตราส่วน," since this app
    never stored the pre-weighted raw factor sum separately from Y;
    stated as a known, honest limitation in the code comment rather than
    implied exact) → Z → seniority via `thaiDateToIso(emp[14])` → start
    date again → employee code ascending for a final deterministic order.
    **Never auto-runs** — `renderCalibQueue()` explicitly sets
    `bellCurveResult = null` on every render (page entry, auto-sync tick,
    any edit to a `.calib-adj` input via a new `oninput="onCalibScoreInput()"`
    handler) and `confirmCalibration()`/the "🔒 ยืนยันผล Calibration"
    button stay disabled until HR explicitly clicks "📊 คำนวณ Bell Curve"
    against the exact current scores — the identical "must re-confirm
    after any edit" discipline CLAUDE.md #133 already established for
    the reviewer-reject-reconfirm flow, applied here to a bulk grading
    action instead of a single reject. `confirmCalibration()` now writes
    `bc.grade` (the Bell Curve result) instead of `gradeFromX(newX)` —
    per the user's explicit "Bell Curve แทนแบบเก่า," the old function is
    left in the file only as the *provisional* grade shown at every
    earlier pipeline stage (self-eval save, L1/L2/GM review all still
    compute `gradeFromX(summary.X)` so there's something to display
    before Calibration), never as what actually gets saved as final.
    **Caught by the feature's own Playwright test, not guessed**: the
    first draft of `confirmCalibration()` called `renderWorkflowPages()`
    (which re-renders Calibration and immediately nulls the global
    `bellCurveResult`) *before* finishing a second loop that still read
    `bellCurveResult.byKey` to build each row's Excel comment — crashed
    on the real commit path every time. Fixed by snapshotting
    `bellCurveResult.byKey` into a local `const bcByKey` before calling
    `renderWorkflowPages()`, the same "don't read a global after
    something else already invalidated it" lesson as CLAUDE.md #134's
    push/pull race, just inside one function instead of across two.
    **Admin override** (`overrideEmployeeGrade(code, cycle)`, new ✏️
    button next to 🖨️ PDF/🗑️ delete on every Calibration row,
    `isAdminOrSysadmin()`-gated): two `prompt()`s — grade (validated
    against A-E, silently aborts with nothing written on an invalid
    non-blank value) then a **mandatory** reason (aborts if blank,
    CLAUDE.md #47's "don't guess what wasn't typed" discipline) — writes
    the grade directly, bumps status to `Calibrated` only if it wasn't
    already that far, and pushes both to `Appraisals`
    (`pushDraftRowToExcel`) and `Approvals`
    (`pushApprovalRecordToExcel`, comment explicitly says "ปรับเกรดเอง
    (ไม่ใช่ Bell Curve): old → new | เหตุผล: …") plus a distinctly-worded
    Audit Log entry — so a manual override is always traceable as a
    deliberate exception, never confused with a normal Bell Curve result
    in either the Excel history or the Audit Log. Verified end-to-end
    with a Playwright test seeding 6 synthetic employees in one real
    `group`, scoring them 95/88/82/75/65/40, confirming the computed
    ranks land exactly 10/20/40/20/10 (A/B/C/C/D/E for n=6), confirming
    the confirm button locks after editing a score and unlocks only
    after recomputing, confirming the real commit writes the Bell Curve
    grade (not `gradeFromX`) into every draft, and confirming the Admin
    override correctly overwrites one person's grade with a logged
    reason — plus the standard click-sweep (`nav pages clicked: 22
    errors: []`). General lesson: a user-supplied real policy document
    (even a legacy `.doc` that needs `antiword -x db` instead of
    LibreOffice to extract readable Thai, per #103's own precedent) can
    reveal that a long-standing, never-questioned function
    (`gradeFromX()`, present since this file's first version) was never
    actually the real grading rule — always re-verify a core calculation
    against the company's own written policy when a user asks "is this
    really how it's supposed to work," rather than assuming code that
    has survived many bug-fix passes unscathed must be correct by virtue
    of never having been flagged before.

156. **Follow-up to #155: user asked "พนักงานจะไม่รู้ว่าตนเองได้เกรดอะไร?"
    after I explained Bell Curve runs at Calibration, after the employee
    already acknowledges a provisional grade — then asked for three real
    changes in one message: hide the grade (not the score) from the
    employee until MD's final approval, add a proper "แจ้งผลประเมิน"
    notification Admin triggers manually (mail/LINE, like Reminder), and
    add an Excel export of a manager's own team on "2. ประเมินทีมงาน" for
    L3 (role `l2`).** Asked 4 clarifying questions first, since each of
    the three had more than one reasonable shape: confirmed hide **only**
    the grade letter, not X/Y/Z (so the employee still sees real progress,
    just not the still-provisional letter); confirmed a genuinely new
    target ("Approved-but-not-yet-notified"), not folded into the
    existing Reminder mechanism (different purpose — Reminder nags people
    to *act*, this *announces a finished result*); confirmed the
    recipient set is exactly that new target (not "anyone Admin picks
    freely," which would have needed a different UI); confirmed the
    export belongs on the team page itself, exporting the currently
    -displayed name/department/evaluation-status columns.
    **Grade-hiding**: traced where an employee's grade is actually shown
    and found `printEvalForm()`/`buildEvalPrintPage()` (#121-123) already
    gate the grade circle behind `isFinalStatus()` — the only real gap
    was `renderMyResult()` (the "6. ผลประเมิน" page itself), which showed
    `latest[latest.length-2]` (the live, possibly-still-provisional
    grade) unconditionally once `hasVisibleResult()` was true. Fixed by
    showing `🔒` + "จะแสดงหลัง MD อนุมัติขั้นสุดท้าย" instead of the real
    letter whenever `isFinalStatus(latestStatus)` is false, and applying
    the identical per-row check to the history table (each past cycle's
    grade cell is independently gated by that *row's own* status, not
    the latest one — an older, already-`Approved` cycle must still show
    its real grade even while the newest cycle is still mid-pipeline).
    X/Y/Z stayed untouched, exactly as asked.
    **Notification**: new `RESULT_NOTIFIED_KEY` (localStorage `Set` of
    `draftKey()` strings — the exact #42 `PUSHED_APPRAISALS_KEY` pattern:
    "has this been handled" tracked separately from the record's real
    workflow `status`, never conflated into it) backs
    `getResultNotifyTargets()` (`isFinalStatus()` rows not yet in the
    set). New modal `mResultNotify` (own HTML, own preview function,
    deliberately **not** a second mode bolted onto `mReminder` — #90's
    button, `getReminderTargets()`, and `sendReminder()` are left
    completely untouched) with the same real email/LINE channel pattern
    #147 already established (`sendLineReminder()` reused directly,
    never re-implemented) and the same honest "To" fix from #153 (own
    email in `mailto:`'s address slot, every real recipient in Bcc).
    `sendResultNotification()` marks every target notified **the moment
    Admin clicks send**, regardless of per-channel delivery confirmation
    — the same accepted limitation every `mailto:` send in this file
    already has (#10/#153: opening the compose window is the only thing
    the app can ever verify for email), stated in a code comment rather
    than implied as more reliable than it is. New "📬 แจ้งผลประเมิน"
    button next to "📢 ส่ง Reminder" on the Dashboard, gated
    admin/sysadmin-only via the exact same `applySession()` chokepoint
    #90 already uses for its sibling button (`resultNotifyBtnEl.style.
    display`), never a nav-level `data-role` (this is a page-header
    action button, not a nav item, the same shape #90 already warns is
    easy to leave ungated).
    **Export**: new `exportTeamListToExcel()` reusing the file's one
    real CSV-download helper, `downloadCsv()` (#60's established
    pattern — this file has no real `.xlsx` writer, a UTF-8-BOM CSV that
    Excel opens natively is the honest equivalent, same as
    `exportIndividualSummary()`/`exportPayrollData()`). Rather than
    building a second query for "this manager's team," captures the
    exact `filtered` array `renderTeamFromMaster()` already computes
    (after its own status/search filters) into a module-level
    `_teamExportRows` at the end of that function — the #126/#127/#138
    "don't build a fourth independent query that can drift from what's
    on screen" discipline, so exporting always matches exactly what's
    currently rendered, filters and all. New "📊 Export Excel" button on
    the team page (`#teamExportBtn`), gated to `role==='l2'` (the real
    L3/ผจก.ส่วน tier per #70/#145's hierarchy) plus `admin`/`sysadmin`
    (the standing #45 convention — those two roles always get to preview/
    verify any per-role feature) — set inside `renderTeamFromMaster()`
    itself rather than `applySession()`, since visibility here legitimately
    depends on which page/manager context is active, not just login role.
    **Caught and fixed by this feature's own click-sweep test, not
    guessed**: the first draft closed a new HTML comment (right before
    the `mResultNotify` modal markup) with the JS-style `*/` instead of
    the real HTML `-->` — the browser's HTML parser then treated
    *everything after that point in the file* as still inside one open
    comment, silently swallowing the entire next `<script>` block
    (540KB+, containing `MASTER_USERS`, `saveDrafts()`, and nearly every
    function in this file) as inert comment text. `document.scripts`
    confirmed the huge script element never existed in the DOM at all —
    no `pageerror` fired (a malformed comment is valid-enough HTML, not
    a JS exception), so this was invisible to every `node --check`
    syntax pass already run; only `typeof MASTER_USERS === 'undefined'`
    in a live browser check surfaced it. Fixed by closing the comment
    with the real `-->`. General lesson sharper than any prior syntax-
    check discipline in this file: a hand-written HTML comment mixing
    conventions from two languages (`<!-- ... */`) is a real, silent
    failure mode that **no JS syntax checker can ever catch**, since the
    JS is never malformed — the HTML parser simply never creates the
    `<script>` element in the first place; when introducing a new raw
    HTML comment near a `<script>` boundary, always close it with `-->`
    and verify with a live `document.scripts` count in a real (headless)
    browser, not just `node --check` on extracted script text, since the
    extraction itself can share the exact same blind spot the browser
    has for comment/tag boundaries.

157. **Follow-up to #156: user asked "ที่ Export excel หน้ารายงาน ให้เพิ่ม
    คะแนนดิบผลประเมิน กับ คะแนน attendance ด้วย" (on the Report page's
    Excel export, also add the raw evaluation score and the attendance
    score) — a different export than #156's new team-page one.**
    `getReportData()` (the shared base for the "รายงาน" page's table and
    its `exportIndividualSummary()` CSV) already resolved `X`/`grade`/
    `status` from each employee's matching draft by the same positional
    convention every other function in this file uses
    (`d[d.length-3]`/`d[d.length-2]`/`d[d.length-1]`), but never read
    `Y` (`d[d.length-5]`, the real performance/factor-score sum) or `Z`
    (`d[d.length-4]`, the real attendance-derived score) — so the export
    already had attendance *input counts* (late/early/sick/personal/
    absent days, via `getAttendanceFor()`) but never the actual computed
    Z score those counts produce, and never Y at all. Added `Y`/`Z` to
    `getReportData()`'s returned object (reading the same two positional
    fields `renderMyResult()`/`openReviewerForm()`/`buildEvalPrintPage()`
    already read for the identical purpose, never a new derivation) and
    two new CSV columns — "คะแนนผลงาน (Y)"/"คะแนนเวลาทำงาน (Z)" — inserted
    right before the existing "คะแนนรวม (X)" column in
    `exportIndividualSummary()`, matching the natural Y+Z=X reading order
    used everywhere else in the file (`renderMyResult()`'s own tile
    order, `openReviewerForm()`'s locked tiles). Purely additive to
    `getReportData()`'s return shape — the two other real callers
    (`renderReportRows()`, the dashboard 9-Box data at line ~9665) both
    destructure only the specific fields they use, so adding two new
    keys needed no changes there. Verified with a test that seeds a real
    `Approved` draft with distinct Y/Z/X values, intercepts the real
    array passed to `downloadCsv()` by `exportIndividualSummary()`, and
    confirms both new columns contain the exact real numbers at the
    correct header-matched index — plus the standard click-sweep (`nav
    pages clicked: 22 errors: []`). General lesson, a smaller case of
    #60's own established pattern: when an export already has a
    *related* number (attendance day-counts) but a request asks for the
    actual *score* derived from it, check whether the draft record
    already stores that computed value positionally (nearly everything
    in this file's evaluation pipeline does, per the Y/Z/X/grade/status
    convention stated at the top of every recent fix) before computing
    it again — reading `d[d.length-5]`/`d[d.length-4]` directly is
    always preferable to re-deriving Y/Z from attendance counts a second
    time, which would risk disagreeing with whatever score the real
    workflow actually saved.

158. **User's screenshot of a real logged-in account viewing "4. สอบทาน
    ผู้จัดการส่วน (L3)" asked "หน้าของผู้ประเมินตามที่ admin กำหนด มีแถบ
    ไม่ครบ เช่น ตำแหน่ง MGR เป็น สามารถประเมินในระดับ GM ได้" — asked two
    clarifying questions given the blast radius (this touches the core
    resolver/scoping chain #128/#145 already built): confirmed via Q1
    this was a real PIN login, not an admin Demo-UI preview (ruling out
    #72's distinction); confirmed via Q2 the precise rule — a person
    whose real `MASTER_USERS` role is `l2` (ผจก.ส่วน) but who is named
    in another employee's "ผู้อนุมัติ GM (L4)" field (u[11]) should see/
    approve at the GM level for that specific person, **regardless of
    their own role actually being `'gm'`**.
    `resolveGmReviewer(emp)` (#128/#145) required the matched person's
    own `MASTER_USERS[2]` to literally equal `'gm'` — so when HR, per
    #145's own established real-world pattern, assigns a `l2`-role
    section manager as a specific employee's u[11] GM approver (a
    small-org "one person wears two hats" case), the resolver silently
    rejected the match purely on role, even though the real chain field
    named them correctly. Fixed by dropping the `u[2]==='gm'` requirement
    entirely — any active employee whose name matches u[11] is now
    accepted as a real GM reviewer, the same way the field's own label
    already promises ("ผู้อนุมัติ GM") without a hidden role prerequisite.
    `getMyScopedEmpCodes()` needed the matching generalization: its
    `unit`/`l1`/`l2` branches (the ones that return a real restricted
    `Set`, as opposed to `admin`/`sysadmin`/`exec`/`emp` which correctly
    stay `null`/unrestricted per #45) now additionally union in every
    employee whose u[11] names the viewer — via one shared
    `addGmNamedScope()` helper, not four separate copies of the same
    `MASTER_USERS.filter` — so a real `l2` named as someone's GM approver
    sees that person in every scoped page/badge/notification (#136-#140's
    `buildTierRoster()` chain reuses `getMyScopedEmpCodes()`/the resolver
    functions directly, so this one fix cascades correctly). **The nav
    item itself still needed a separate, explicit fix**: `setRole()`
    (#64) gates every `.nav-item[data-role]` purely by the viewer's own
    `role` string against `NAV_PERMS[pg]` (admin-configurable, but
    company-wide per role, never per individual) — "5. อนุมัติ GM"'s
    default permission is `gm,exec`, so a real `l2`-role person would
    still never see the menu item even once the underlying resolver/
    scope correctly granted them the data. Added a small per-person
    override in `applySession()`, right after the existing `setRole()`
    call (the same chokepoint #72/#90 already use for per-person
    overrides): checks whether `CURRENT_SESSION_USER` is named in
    *anyone's* u[11] field, and if so, forces the gmapprove nav item's
    `display` back to `'flex'` regardless of what `setRole()` just set
    it to — a real, data-driven exception layered on top of the
    role-based gate, not a change to the gate's own default behavior for
    everyone else. Verified with a test that seeds a real `l2`-role
    "section manager" employee and a second employee whose u[11] names
    that section manager by name (not role): confirms
    `resolveGmReviewer()` now returns the `l2`-role person (not null),
    confirms `getMyScopedEmpCodes()` includes the named employee after
    logging in as the section manager, confirms the "5. อนุมัติ GM" nav
    item is forced visible for this specific account, confirms the real
    queue page renders the actual pending row once clicked, and confirms
    a plain employee not named anywhere in any u[11] still correctly
    never sees the nav item — plus re-ran all 6 of #138-#145's own
    resolver/scoping/filter tests (admin-oversight, no-L1/L2 bucket, both
    review-filter tests, the filter diagnostic note, the team-badge note)
    with zero regressions, plus the standard click-sweep (`nav pages
    clicked: 22 errors: []`). General lesson sharper than #145's own
    conclusion: #145 fixed *which raw field* a resolver reads to answer
    "who is this person's L3/L4 reviewer" — this time the *role
    requirement layered on top of the matched field* was itself too
    strict for how HR actually assigns people in a real small
    organization (one real person can hold more than one functional
    tier); when a resolver function pairs a chain-field match with an
    extra `&& role===X` condition, that condition is a second, separate
    claim about the matched person beyond "their name is in this field"
    — confirm with the user whether the field itself is the sole source
    of truth, or whether the role check is a real additional requirement,
    before assuming the stricter check was intentional. Also worth
    remembering: fixing a resolver/scoping function alone is not enough
    when a *static*, role-based nav gate (`setRole()`/`NAV_PERMS`) sits
    in front of the same page — a per-person exception to a per-role
    gate needs its own explicit override at the one real session
    chokepoint, the same pattern #72/#90 already established for other
    per-person nav/button visibility exceptions.

159. **User asked "ทำไมพอเข้าระบบใหม่ แล้ว ไม่ดึงข้อมูลที่ประเมินผลแล้วจาก
    Excel" (why, on a fresh login, doesn't it pull the already-evaluated
    data from Excel) — confirmed via two clarifying questions that this
    was the same previously-used device/browser (not a brand-new one),
    and that the Sync Log panel itself already showed a real success
    entry: "[...] ✓ Sync คิวประเมิน: ดึงข้อมูล 10 แถวจาก Excel (auto)."**
    Read `ms365SyncAppraisals()`'s full body, `doLogin()`'s sync-chain
    ordering, and `DEFAULT_MS365_CONFIG.evaluationTable` — all correct,
    ruling out a silent-failure/mis-wiring bug of the #66/#68/#69 shape;
    the sync genuinely ran and genuinely pulled 10 rows. The suspiciously
    round number pointed at the one thing never checked: whether
    `graphListTableRows()` (client, delegated path) and the Worker's own
    `listRows()` (used whenever the Worker is configured, which per #31
    is the default for every device) ever follow Microsoft Graph's
    `@odata.nextLink` for a collection response. **Confirmed they never
    did** — both made exactly one GET request to the table's `/rows`
    endpoint and returned whatever came back in that single response,
    with no loop and no check for `@odata.nextLink` anywhere in the file
    (grepped for `nextLink`/`\$top` file-wide — zero matches other than
    the function declaration itself). Microsoft Graph's workbook-table-
    rows endpoint, like most Graph collection endpoints, pages a large
    result set across multiple responses — so a real `Appraisals` table
    with more real evaluation rows than fit in one page would silently
    hand back only its first page, forever, on every sync — exactly
    explaining "already-evaluated data doesn't show up" for whichever
    employees' rows happened to land past page 1, while the Sync Log
    kept reporting a false "success" every time (it only ever logged
    `rows.length` of whatever it was actually given, never knowing a
    `@odata.nextLink` existed). This is the same general shape as every
    `.catch(()=>{})` silent-failure bug this file has repeatedly found
    (#66/#68/#69/#149-#152), just one layer further out: not a *thrown*
    error being swallowed, but a *successful, correctly-shaped* Graph
    response being accepted as complete when it explicitly said (via its
    own `@odata.nextLink` field) that it wasn't.
    Fixed both `graphListTableRows()` (client) and `listRows()` (Worker)
    identically: loop fetching the current page, concatenate its rows,
    and follow `data['@odata.nextLink']` to the next page until the
    field is absent — capped at a 200-page safety guard (a table would
    need tens of thousands of rows to ever hit that, purely defensive
    against an unexpected infinite-pagination response). This is the
    one function every single Excel pull in the whole file funnels
    through (`ms365SyncEmployees`/`...Attendance`/`...KpiGoals`/
    `...CycleSetup`/`...CyclesList`/`...FormWeights`/`...Idp`/
    `...AuditLog`/`...OrgMaster`/`...Appraisals`/`...ApprovalSignatures`/
    `...HrNotes`/`...EvalComments`/`EmployeeSettings` — every one of
    them calls `graphListTableRows()`, never a second parallel reader),
    so this single fix closes the identical "only ever get page 1" risk
    for every one of those tables at once, not just `Appraisals` — any
    one of them could in principle have grown past a single page's size
    as this deployment's real data accumulates over time, even if
    `Appraisals` happened to be the one that hit it first and got
    reported. **This changes the Worker's own code** (`listRows()`), so
    per CLAUDE.md #41/#106/#147's own precedent it needs a real redeploy
    before this fix has any live effect for any device routing through
    the Worker (which, per #31, is every device by default) — the
    client-side `graphListTableRows()` fix goes live the moment GitHub
    Pages updates, same as any other purely-client fix in this file.
    Verified with two separate tests mirroring each other: a Playwright
    test mocking `graphFetch()` to return 3 chained pages (2+2+1 rows,
    `@odata.nextLink` on the first two, none on the last) and confirming
    `graphListTableRows()` makes exactly 3 calls and returns all 5 rows,
    not just the first page's 2; and a Node-only test importing the real
    Worker module, mocking `global.fetch` for the full real auth/site-
    resolution chain plus the same 3-page `/rows` response shape, and
    confirming the Worker's `/rows` HTTP endpoint itself returns all 5
    rows in one JSON response to the client — plus the standard click-
    sweep (`nav pages clicked: 22 errors: []`). General lesson sharper
    than #66/#68/#69's own conclusion: those fixes closed every place a
    *failed* Graph/Worker call went silent; this is the case where the
    call *succeeds* exactly as asked and is still incomplete, because a
    paginated collection response says so in a field nothing ever read —
    any function that calls a Microsoft Graph (or any other paginated
    REST API) collection endpoint and returns `data.value` directly,
    without checking for a continuation token/link field, is reporting
    "fewer rows than are actually there" as a quiet, successful result
    rather than an error — and a suspiciously round row count in a
    success log (10, 20, 50 — common default page sizes) is a strong
    diagnostic signal for exactly this, worth checking before assuming
    the sync's own merge/scoping logic must be where a "missing data"
    report's real cause lives.

160. **Follow-up to #159: user reported the identical "ไม่ดึงข้อมูล Excel
    มาแสดง" symptom again — this time a specific review queue page
    showing all 5 scoped employees as "⏳ รอผลประเมิน" even though their
    real Appraisals Excel rows (confirmed via the user's own screenshot
    one turn earlier) already carried real, advanced statuses like
    `L2Reviewed`/`GMApproved`. Ruled out #159's own pagination fix as the
    cause first — confirmed via 3 targeted clarifying questions that the
    Worker had genuinely been redeployed with the pagination code, the
    real cycle code (`cycleYearSetup`) matched the Excel data's "2569"
    exactly, and the Sync Log's latest "Sync คิวประเมิน" entry still
    showed a real success — "✓ ... ดึงข้อมูล 10 แถวจาก Excel (auto)" —
    confirming the pull itself was genuinely complete this time (the
    real table turned out to be exactly 10 rows: 5 employees × 2
    duplicate rows each, matching the earlier screenshot).**
    With the pull side fully exonerated, read `buildTierRoster()` (#136)
    directly: `const draft = getDrafts().find(d=>d[0]===emp[0] &&
    d[2]===cycle) || null;` — a **strict** `===` comparison between the
    draft's stored cycle field (`d[2]`) and the queried cycle
    (`getCurrentEvalCycleYear()`, which always returns a real `string`
    per its own `String(data.year).trim()`/`'2569'` fallback). Traced
    `normalizeAppraisalRow()` (#117) — the one real ingestion point every
    pulled `Appraisals` row passes through before merging into local
    `getDrafts()` — and found it **only** coerces array positions 4–20
    (the `m`/`l`/`Y`/`Z`/`X` numeric score fields) to `Number()`; position
    2 (รอบ/cycle) and position 3 (ระดับ/level) were never touched, on the
    unstated assumption they'd always already be text. If the real Excel
    "รอบ" column is formatted as a **Number** cell (extremely plausible —
    "2569" reads exactly like a year, which Excel defaults to numeric
    formatting for unless someone deliberately sets it to Text, unlike
    "ระดับ"'s clearly non-numeric values like "of"), Graph returns that
    cell's value as a real JS `number` (`2569`), not the string
    `"2569"` — so every synced draft's `d[2]` silently became a number
    while every query site's `cycle` argument stayed a string, and
    `d[2]===cycle` failed on every single comparison, everywhere in the
    file, even though both sides "looked" identical when printed. This
    is the exact #117 shape of bug (an external-table value surviving as
    the wrong JS type past a strict-equality comparison) recurring in the
    two fields #117's own fix deliberately left untouched — grepped
    `\[2\]===cycle` and `d\[2\]===` across the whole file and found this
    single comparison pattern repeated at **12 separate call sites**
    (`buildTierRoster()` itself, `printEvalForm()`'s live-draft lookup,
    `openReviewerForm()`'s restore lookup, `acknowledgeMyResult()`,
    `confirmCalibration()`'s dup-check, `saveEvaluationToMs365()`'s
    existing-draft check, `renderMyResult()`, `submitReviewerForm()`
    ×2, `openSubmitConfirmModal()`, and the Cycle History page's
    participant-count/status lookups) — every one of them would have
    silently found "no draft" for any employee whose Excel-synced record
    carried a numeric cycle, system-wide, not just on the one queue page
    the screenshot happened to show.
    Fixed at the single real ingestion point rather than patching all 12
    read sites individually (the same "fix the one place data enters,
    not every place it's read" discipline #117 itself already
    established): `normalizeAppraisalRow()` now also does
    `out[2]=String(out[2]).trim(); out[3]=String(out[3]).trim();`
    whenever each is non-null/non-undefined — forcing both fields to a
    real string the instant a row is pulled, so every one of the 12
    downstream `===` comparisons becomes correct automatically with zero
    changes needed at any of them. Verified with a Playwright test that
    mocks `workerFetch`'s `/rows?table=Appraisals` response to return the
    cycle field as a real JS **number** `2569` (reproducing the exact
    real-world Excel-cell-type shape, not a string literal that would
    hide the bug), runs it through the real `ms365SyncAppraisals()` →
    `normalizeAppraisalRow()` chain, confirms the merged local draft's
    `d[2]` is now `typeof === 'string'`, and confirms `buildTierRoster()`
    — called with the real string `getCurrentEvalCycleYear()` — correctly
    finds and classifies that employee's row as `'ready'` (matching the
    draft's real status) instead of silently treating them as having no
    draft at all — plus the standard click-sweep (`nav pages clicked: 22
    errors: []`). General lesson sharper than #117's own conclusion:
    when a type-coercion fix is applied to "the numeric fields" of an
    ingested external row, explicitly audit every *other* field in that
    same row for the identical risk before considering the ingestion
    point fully hardened — a field that "looks like it should always be
    text" (a cycle/year code, a level string) can still arrive as a
    number if the external spreadsheet's own cell formatting disagrees,
    and the only way to know for certain is to check the real external
    file's cell types (per #78's own established "verify the real shape,
    don't assume" discipline) rather than inferring from the field's
    human meaning; a report that looks identical to a bug already fixed
    one turn earlier is worth re-deriving from scratch via the Sync Log
    before assuming the previous fix simply didn't take effect.

161. **Follow-up to #160: user sent another screenshot — the "2.
    ประเมินทีมงาน (L1 รอบแรก)" page's "พนักงานไม่มีหัวหน้า L1" bucket (#130)
    still showed the same 5 employees as "⏳ รอประเมิน" with a plain
    "ประเมิน" button (not "ดูแบบฟอร์ม"), even though their real Excel
    `Appraisals` rows already carried advanced statuses and the #160 fix
    was already deployed and confirmed working by the Sync Log. User
    asked directly: "ต้องประเมินใหม่เหรอ" (do I need to evaluate them
    again?).** Read `getDrafts()` (line 8132) itself — confirmed it was a
    bare `JSON.parse(localStorage.getItem(MS365_LOCAL_DRAFT_KEY)||'[]')`
    with **zero** normalization — and re-read `ms365SyncAppraisals()`'s
    merge condition: `if(!existing || evalStatusRank(r[...]) >
    evalStatusRank(existing[...])){ byKey.set(key,r); }` — overwrites a
    local draft only when the **remote rank is strictly greater**, never
    on a tie. #160 fixed `normalizeAppraisalRow()` so every *newly*
    pulled row gets a real string `d[2]`/`d[3]` — but any draft that was
    already sitting in `localStorage` from a sync that ran *before* #160
    shipped, whose real-world status simply hasn't advanced any further
    since, would never hit the "remote rank > local rank" branch — it
    would tie, `existing` would be kept untouched, and its numeric
    `d[2]` would persist in `localStorage` indefinitely. Every `d[2]===
    cycle` strict comparison reading that stale entry (`buildTierRoster()`
    at minimum, which the `__noL1__` bucket is built from) would then
    silently find "no draft this cycle" and classify the person as
    never-evaluated — exactly the screenshot. (`byKey`/`draftKey()`'s own
    matching was never broken by this, since both build their key via
    `+` string concatenation, which coerces a number to its string form
    automatically — only *strict* `===` reads downstream of `getDrafts()`
    were ever at risk, the same distinction #117/#160 already drew.)
    Fixed at the one real read boundary — `getDrafts()` itself — rather
    than patching every downstream `===` site again: after the existing
    `JSON.parse`, loop every returned draft and coerce `d[2]`/`d[3]` to
    `String(...).trim()` in place before returning, so **every** draft is
    normalized on **every** read regardless of when it was originally
    cached — a draft written before #160 existed, one written by #160's
    own fixed ingestion path, and one written by a completely different
    local save path (`saveEvaluationLocal()`, `confirmCalibration()`,
    etc., none of which ever had the type bug in the first place since
    they build the cycle from `getCurrentEvalCycleYear()`, always a
    string) all come out normalized the same way, with zero data loss
    and no forced resync required. Verified with a Playwright test that
    writes a stale draft **directly into `localStorage`** under the real
    `MS365_LOCAL_DRAFT_KEY` with `cycle` as a real JS number — simulating
    exactly what a pre-#160 sync would have left behind, never going
    through any sync function at all — then calls the real `getDrafts()`
    and confirms the returned entry's cycle is now a `string`, and that
    `buildTierRoster()` correctly classifies it as `'ready'` (not
    `'pending'`/not-found) — plus the standard click-sweep (`nav pages
    clicked: 22 errors: []`). **Answered the user's actual question
    plainly**: no, the real evaluation data was never lost — the 5
    people's real scores/statuses have been sitting correctly in Excel
    the whole time; this was purely a local-device display bug reading
    an old cached copy with the wrong field type, now fixed with no
    re-work needed on their part — a page reload (which re-reads
    `localStorage` through the now-fixed `getDrafts()`) is all that's
    required, not re-evaluating anyone. General lesson sharper than
    #160's own conclusion: fixing a type-coercion bug at the *ingestion*
    point (where new data enters) stops the bug from recurring, but does
    **not** retroactively repair data that was already written to
    persistent local storage by the *old*, buggy code — especially when
    the data store in question has a merge rule that only overwrites on
    improvement, never on a tie, which is exactly the shape of rule that
    lets stale, incorrectly-typed entries survive indefinitely with no
    further sync ever correcting them. When a persistent local cache
    (`localStorage`, here) can hold data written by several different
    versions of the same ingestion code over time, normalize defensively
    at the **read** function itself (`getDrafts()`), not only at the
    write/ingestion point — a read-side normalization self-heals every
    already-cached record the moment it's next loaded, with no explicit
    migration step and no risk of a "did the migration run" question
    ever coming up again.

162. **Follow-up to #161: user reported the identical "ไม่ดึงข้อมูลที่
    ประเมินแล้วมาแสดง" symptom again, on the exact same page (#161's own
    screenshot — the "2. ประเมินทีมงาน" page's `__noL1__` bucket, real L2
    login, all 5 people still showing "⏳ รอประเมิน") even after the #161
    fix, a hard refresh, and a confirmed-successful Sync Log entry.**
    Asked for the real Appraisals Excel data for one named employee
    (90526) before touching code again — the screenshot showed **two
    rows per employee**, same EmpID/รอบ(2569)/ระดับ(of), but two
    different statuses each (e.g. "L2Reviewed" + "Submitted" for 90526,
    "GMApproved" + "L1Reviewed" for 90354) — leftover duplicate rows from
    before #41's composite-key upsert existed, never cleaned up since
    there's no `graphDeleteTableRow()` anywhere in this file (#39's own
    stated limit). Built a faithful Playwright reproduction seeding this
    *exact* real data shape (two Excel rows, same composite key, through
    the real `ms365SyncAppraisals()` → `getDrafts()` → `renderTeamFromMaster()`
    chain) — it rendered correctly ("✓ ส่งแล้ว ดูแบบฟอร์ม"), proving the
    *data layer* (merge, dedup-by-composite-key, status rank comparison)
    was already fully correct. (Caught two of my own test-authoring
    mistakes along the way, both worth remembering: seeding a
    `MASTER_USERS` row with a value at the wrong array index — `u[19]`
    is the L2-field the real resolver reads per #145, not `u[17]` — and
    assigning `window.CURRENT_SESSION_USER = …` instead of the bare
    `CURRENT_SESSION_USER = …`, since the variable is declared with
    `let` at module scope and therefore never becomes a `window`
    property — assigning through `window.` silently creates an unrelated
    global that the real lexically-scoped functions never read. Both are
    exactly the kind of mistake CLAUDE.md #130/#144 already warn a test's
    own seed data can introduce — re-verify a reproduction actually
    reaches the real code path before trusting its result either way.)
    With the merge logic exonerated a second time, the real remaining
    suspect was `renderTeamFromMaster()`'s own lookup:
    `drafts.find(x=>x[0]===u[0])` — picks the **first** `getDrafts()`
    entry matching only the employee code, with **zero regard for cycle
    or level**. This is safe only if `getDrafts()` genuinely holds at
    most one entry per employee — true after a clean merge, but **not**
    guaranteed to stay true forever: any draft written under a different
    composite key for the *same real evaluation* (e.g. a stale local
    entry cached under the wrong `level` from before #110's
    `getAssignedEvalLevel()` fix, when the team page still guessed the
    level from job-title keywords and could save a draft under `'op'`
    instead of the real `'of'`) would never collide with — and therefore
    never get overwritten by — the correctly-keyed entry `ms365SyncAppraisals()`
    later merges in; both would coexist in `getDrafts()` forever, and
    `.find()`'s first-match-wins behavior could silently return the old,
    low-rank one depending on array insertion order. Built a second
    Playwright test seeding exactly this scenario — a stale local
    `['90526',...,'2569','op',...,'Draft']` entry already in
    `localStorage`, then a real sync pulling the correct
    `['90526',...,'2569','of',...,'L2Reviewed']` row — and confirmed it
    reproduced the user's exact symptom (`.find()` returned the stale
    `Draft` entry) before the fix, and the real expected result
    (`✓ ส่งแล้ว`) after it. Fixed by replacing the blind `.find()` with:
    filter `drafts` to entries matching both `u[0]` **and** the real
    current cycle (`getCurrentEvalCycleYear()` — deliberately scoped to
    *this* cycle, not just the employee code, so an older cycle's already-
    `Approved` record can never be mistaken for this cycle's progress),
    then reduce to the entry with the highest `evalStatusRank()` among
    whatever matches — so a leftover wrong-level duplicate from any past
    bug can never again hide a real, more-advanced status, regardless of
    which array position it happens to occupy. Verified with both new
    tests (the faithful real-data reproduction, now passing cleanly, and
    the stale-wrong-level-duplicate scenario, now correctly showing
    "ดูแบบฟอร์ม" instead of "ประเมิน") plus re-ran #160/#161's own tests
    and the standard click-sweep (`nav pages clicked: 22 errors: []`)
    with zero regressions. **This is a real, defensible hardening
    regardless of whether it is the exact cause in this user's live
    browser** — I cannot inspect their actual `localStorage`, so the
    specific stale entry's origin (which past level-guessing bug wrote
    it, and when) can't be confirmed from here; the fix closes the whole
    *class* of "a `.find()` by employee-code-only can return a stale
    duplicate instead of the real current one" risk, the same way #161
    closed the cycle-type class rather than one specific record. General
    lesson sharper than #136/#138's own "reuse one roster-building
    function" discipline: `buildTierRoster()` (#136) already does the
    right thing here — it filters by `cycle` before comparing rank — but
    `renderTeamFromMaster()`'s own, older, independent lookup was never
    brought in line with that same discipline when #136 shipped, because
    the team page predates `buildTierRoster()` and was never migrated
    onto it (it has its own bucket logic — `__noL1__`/`__noL1L2__` —
    `buildTierRoster()` doesn't cover). Whenever a "pick the matching
    draft" pattern is hardened in one function, grep the whole file for
    every *other* independent `drafts.find(x=>x[0]===...)`-shaped lookup
    that was never updated to match, the same way #126/#127/#138 already
    taught for scoping and counting functions, not just this file's one
    canonical roster builder.

169. **Follow-up to #168: user clicked the new "🔄 Sync จาก Excel แล้วลองใหม่"
    button and reported "ดึงแล้วยังไม่มานะ เป็นปัญหาที่อะไร" (tried syncing,
    still nothing, what's the problem) — then confirmed via AskUserQuestion
    that the diagnostic banner shows "ขึ้นข้อความเดิมเป๊ะๆ (ไม่เปลี่ยนเลย)"
    (the exact same message, completely unchanged) even after the retry.**
    Read `retrySyncAndReopenReviewer()` (#168) again: it called
    `ms365SyncAppraisals(false)`, re-rendered, and reopened the same form —
    but never captured *what that specific sync call actually found*, and
    `openReviewerForm()`'s not-found banner (#165/#167) only ever reads
    `getDrafts()`/`restoreReviewerFormFromDraft()`, which has no way to know
    whether a sync even ran, let alone what it returned — so the banner's
    text is mechanically identical before and after a retry whenever the
    sync genuinely finds nothing new to merge, regardless of *why* it found
    nothing (never configured at all, configured but the real Excel table
    is empty, or configured and genuinely full of rows but none matching
    this specific code/cycle/level). "The same text as before" was never
    evidence the retry button was broken — it was the predictable result of
    a diagnostic banner that still couldn't see the one new fact the retry
    action itself produced.
    Added `lastRetrySyncResult` (module-level, reset on every retry click):
    `retrySyncAndReopenReviewer()` now checks `isMs365Configured(cfg)`
    *before* calling `ms365SyncAppraisals()` at all (previously it let that
    function's own internal check return `0` silently with no trace this
    banner could use), wraps the real sync call in its own `try/catch` to
    capture a thrown error message, and records the real outcome — whether
    MS365/Worker isn't configured on this device at all, the sync threw a
    real error, or the sync succeeded and returned a real row count — before
    reopening the form. `openReviewerForm()`'s not-found banner now appends
    a "ผลการกด Sync ล่าสุด (เวลาจริง): …" line reading this evidence
    directly: "เครื่องนี้ยังไม่ได้ตั้งค่า MS365/Worker ไว้เลย" (not
    configured — the real cause is upstream of any Excel data at all, and
    plainly not a rhodes/cycle/level mismatch), "Sync สำเร็จ ดึงข้อมูลทั้ง
    ตาราง Appraisals มาได้ 0 แถว…(ตารางว่างทั้งหมด)" (configured and
    genuinely ran, but the real Excel table itself has zero rows — a
    completely different, Excel-side problem to check), or "Sync สำเร็จ
    ดึงข้อมูลมาได้ N แถว แต่ไม่มีแถวไหนตรงกับรหัส/รอบ/ระดับนี้เลย" (the
    sync genuinely works and the table genuinely has data, but none of it
    matches this specific employee/cycle/level combination — pointing
    straight at a real data-entry mismatch in Excel, not a code/sync bug at
    all) — three previously indistinguishable "still nothing" outcomes
    turned into three concretely different, independently actionable
    findings, each naming the real next step instead of leaving the user
    to re-report the identical symptom a third time. Verified with a
    Playwright test covering all three outcomes (mocking
    `isMs365Configured`/`workerFetch` for each) and confirming the banner's
    text differs correctly for each — plus full re-runs of #165/#167/#168's
    own existing tests and the standard click-sweep, all with zero
    regressions. **This still does not claim to have fixed the user's real
    underlying cause** — it is the next layer of the same #129/#142/#165/
    #167/#168 "make the failure diagnosable in the user's own hands, don't
    guess again" discipline: the next report should now carry one of these
    three concrete findings instead of "still nothing," and whichever one
    it is determines the real next fix (set up MS365 on this device, check
    why the real Excel table is empty, or check why this employee's real
    row's code/cycle/level don't match what the app expects — most likely
    the same #160-shaped "a field looks like text but is stored as a
    different type/value in the real sheet" class of issue, now checkable
    with a real row count instead of a guess). General lesson sharper than
    #168's own conclusion: a "retry" button is only as useful as the
    diagnostic sitting next to it — if the retry action produces real,
    specific information (a row count, a thrown error, a configuration
    state) that the surrounding UI never captures or displays, a user who
    clicks it and sees the identical message has no way to tell "the retry
    did nothing" from "the retry worked exactly as designed and genuinely
    found nothing new," which read as exactly the same complaint but call
    for completely different next steps; always thread the action's own
    real result into whatever diagnostic is already on screen, not just
    the state the action was meant to refresh.

170. **Follow-up to #169: user's screenshot of the new diagnostic banner
    showed the exact concrete evidence it was built to surface — "Sync
    สำเร็จ ดึงข้อมูลทั้งตาราง Appraisals มาได้ 10 แถว แต่ไม่มีแถวไหนตรง
    กับรหัส 90526 · รอบ 2569 · ระดับ of เลย" — and that finding alone was
    enough to pin the real cause, since #162's own earlier investigation
    had already confirmed this exact employee's real Excel rows genuinely
    exist at cycle 2569/level 'of'. If the sync pulled 10 real rows and
    still found zero matches for a person already known to be in there,
    the mismatch had to be in how a match is decided, not in the data.**
    Re-read `normalizeAppraisalRow()` (#117/#160) and `getDrafts()`
    (#161): both already coerce `out[2]`/`out[3]` (รอบ/ระดับ) to a real
    `String` at ingestion and at read time, closing the exact "Excel cell
    formatted as Number instead of Text, so Graph hands back a JS number
    that silently fails every strict `===` comparison against a string"
    bug twice already — but **`out[0]`/`d[0]` (EmpID, the employee code
    itself) was never touched by either fix**. If the real Excel sheet's
    EmpID column is Number-formatted (entirely plausible — "90526" reads
    exactly like a number, the same reasoning #160 already gave for why
    "รอบ" ends up Number-formatted too), Graph returns it as a real JS
    `number`, and every strict-equality lookup against it
    (`findCurrentCycleDraft()`/`restoreReviewerFormFromDraft()`'s own
    `d[0]===empCode`, where `empCode` is always a real string sourced
    from `MASTER_USERS`/a code-entry field) silently fails — explaining
    both halves of the banner's own wording at once: "ไม่มีแถวไหนตรงกับ
    รหัส 90526" (the strict-equality draft lookup found nothing) and the
    earlier layer's own "ไม่พบรหัสพนักงานนี้ใน local เครื่องนี้เลยแม้แต่
    รายการเดียว" (the `sameCodeOtherDrafts` filter, built on the exact
    same `d[0]===empCode` comparison, found nothing either, even though
    the row had just been merged into local storage moments earlier by
    the very sync that reported 10 rows pulled).
    Fixed at both the same two layers #160/#161 already established for
    this exact bug shape — never patch only the ingestion point or only
    the read point, since a record already cached before the fix needs
    the read-side self-heal and a freshly-synced record needs the
    ingestion-side fix: `normalizeAppraisalRow()` now also coerces
    `out[0]=String(out[0]).trim()` alongside its existing `out[2]`/
    `out[3]` handling, and `getDrafts()` now also coerces `d[0]` the same
    way it already self-heals `d[2]`/`d[3]` for any draft cached before
    this fix shipped — so an already-stale local entry with a numeric
    empCode corrects itself the next time anything reads `getDrafts()`,
    with no forced resync needed. Verified with a 4-case Playwright test:
    ingestion correctly coerces a numeric EmpID to a string; a full real
    sync with a mocked Excel row carrying a numeric EmpID now correctly
    merges and becomes findable by the real string code
    (`findCurrentCycleDraft()` now returns the real `'Submitted'` row,
    not nothing); an already-cached stale entry written with a numeric
    empCode (simulating data synced before this fix existed) self-heals
    on the next `getDrafts()` read; and the reviewer form's own banner —
    the exact UI the user's screenshot showed — now correctly clears and
    restores all 10 real factor scores instead of showing the not-found
    banner. Confirmed each case genuinely reproduces the reported bug
    first: ran the identical test against the pre-fix code via
    `git stash`, and all 4 assertions failed exactly as the user's
    screenshot showed (banner stays, raw score reads `0`) before the fix
    and pass cleanly after — plus full re-runs of #165/#167/#168/#169's
    own existing tests and the standard click-sweep (`nav pages clicked:
    22 errors: []`), all with zero regressions. General lesson sharper
    than #160/#161's own conclusion: when a "coerce this field's type at
    ingestion + self-heal at read" fix is applied to *some* fields of a
    multi-field external row (here, คอลัมน์ 2 and 3 of an Appraisals row),
    always check every *other* field in that same row for the identical
    risk, not just the ones the original report happened to point at —
    `normalizeAppraisalRow()`'s own code comment for #160 already stated
    the general mechanism ("a column that looks like a number gets
    Number-formatted in Excel, Graph returns it as a real number"), which
    applies with exactly equal force to `empCode` as it does to `cycle`;
    the fact that #117/#160/#161 all fixed *other* fields first and left
    this one is not evidence `empCode` was safe, only that nobody had
    checked it yet — and this time, the #169 diagnostic banner itself
    (built specifically so a report would carry real evidence instead of
    another guess) is what made the real cause identifiable from a single
    screenshot instead of a sixth round of speculation.

171. **Follow-up to #170 (not a bug report): user confirmed the sync fix
    resolved the reported data problem, then asked "หน้ารายงานแบบประเมิน
    ในทุกจุดหรือแถบอื่นที่แสดงแบบนี้ จัดรูปแบบให้อ่านง่าย ชัดเจน เป็น
    ระเบียบมืออาชีพด้วย" (format the evaluation-report display, wherever
    it shows like this, to be more readable/professional) — a pure
    visual-polish request, confirmed via one clarifying question to mean
    only `openReviewerForm()`'s own modal (the "ดูแบบฟอร์ม/สอบทาน"
    window), not the self-eval page's separate, already-different `.kv`
    list-style time-detail panel.** The one genuinely cluttered spot in
    the screenshot was the "รายละเอียดเวลาทำงาน (Z)" box: it reused the
    `.review-score-summary` class — built and sized for the *final*
    4-tile score tally at the bottom of the form (Raw/Y/Z/X) — to hold
    8 attendance stats instead, producing two uneven rows where a long
    label ("สาย+กลับก่อน ÷ 8 (ปัดลง)") wrapped awkwardly in a narrow
    quarter-width tile and the one truly important number (the real Z
    score) sat visually no different from the 7 raw inputs feeding it.
    Added two new classes scoped only to this one box —
    `.review-z-grid` (6 raw attendance stats in a clean 3-column grid)
    and `.review-z-highlight` (a full-width highlighted bar pulling the
    two numbers that actually matter — "วันลารวม" and the real "Z คะแนน
    จริง" — out of the grid and into one visually prominent result,
    matching how the final score tally already earns its own emphasis)
    — deliberately **not** touching `.review-score-summary` itself,
    since it's still correctly used for the genuine 4-tile final tally
    later in the same form and changing it there would have been an
    unrelated, unasked-for edit. Added small icon prefixes to
    `.review-doc-head`'s title and each `.review-section-title` (📋/⏱️/
    📊/📝) for quick visual scanning, uppercase+letter-spacing on the
    employee-info tile labels, a subtler gradient header background,
    and zebra striping + a bolder header row on the factor-scoring
    table — all small, low-risk CSS additions in a new, clearly-labeled
    `<style>` block rather than editing the existing "v12 — reviewer
    modal cleanup" block in place, so the change is easy to isolate or
    revert on its own. Verified visually with a real rendered screenshot
    (not just a DOM/class check — CLAUDE.md #15's own "verify styling
    with an actual rendered screenshot" rule) of both halves of the
    modal (the Z-detail section and, scrolled down, the factor table +
    final score tally + comments + approval-flow footer), confirming
    the new layout reads cleanly and nothing overlaps or breaks at the
    same viewport this file's other tests already use — plus full
    re-runs of #165/#167/#168/#169/#170's own existing tests (none of
    which touch CSS/layout, but all exercise this exact modal's JS
    logic — restoring scores, showing diagnostic banners, the retry
    button) and the standard click-sweep (`nav pages clicked: 22 errors:
    []`), all with zero regressions. General lesson: a pure visual/
    layout request is still worth one clarifying question when the
    user's own wording ("ทุกจุดที่แสดงแบบนี้") is ambiguous about scope
    across genuinely different-looking implementations of a similar
    idea (here, the reviewer modal's card-grid Z box vs. the self-eval
    page's unrelated `.kv` list-style one) — guessing the wider scope
    risks redesigning a page nobody asked to change; and the real fix
    for "a grid looks cluttered" is often not "make the grid prettier"
    but "stop forcing data that isn't the same *kind* of information
    (6 raw inputs vs. 1 final answer) into one undifferentiated grid
    built for the other shape."

192. **Follow-up to #191: user said if the header "พิมพ์ใบประเมิน (PDF)"
    button now pulls the real latest result like the banner's "ดาวน์โหลด
    ใบประเมิน PDF" button, and the two are duplicates, remove one —
    confirmed they were now byte-for-byte duplicates (#191 made the
    header button call the exact same `printSingleDraft()` resolution as
    the banner), so deleted the header button and the now-unused
    `printMyResultForm()` function it called, per this project's
    standing "delete code known to be unused" convention (#48/#51/#80) —
    the banner's own download button (only shown once a real result
    exists via `hasVisibleResult()`) is the one real print path left.**
    **Second half, the notification bell**: "พอคลิกไปแล้วมันเห็นข้อมูลหมด"
    (once clicked, it shows everything) — traced `getNotifications()`
    (#73/#85/#87/#126/#130/#138's own repeatedly-fixed function) and
    found one item still genuinely unscoped: the "รอ Push เข้า Excel"
    line counted `isFinalStatus()` drafts straight from the raw
    `MS365_LOCAL_DRAFT_KEY` array with **zero** `getMyScopedEmpCodes()`/
    `buildTierRoster()` filtering at all — unlike the 4 queue-count
    lines right above it (all correctly routed through `buildTierRoster()`
    since #138/#140) and the hierarchy-issues count right below it
    (already correctly scoped internally by `checkHierarchyIssues()`,
    #73/#127). #87 had explicitly left this one line company-wide on
    purpose, reasoning it was "an admin/system concern," but never
    actually hid it from non-admin roles — so any logged-in L1/L2/unit/
    emp clicking the bell saw a real company-wide "N รายการ" count and a
    link into "MS365 Excel," a page whose own nav item is `data-role=
    "admin"` and that they can't even open. Fixed by gating the whole
    item behind `['admin','sysadmin'].includes(me[2])`, the identical
    pattern CLAUDE.md #90 already established for the "📢 ส่ง Reminder"
    button (hide the control entirely for every role it isn't actually
    for, not just leave it visible-but-useless). Verified with a
    Playwright test seeding a real non-admin `l1` session and a real
    `Approved` draft with nothing scoping it to that L1: confirms
    `getNotifications()` for the L1 contains no `ms365`-linked item at
    all, while the same real data still correctly appears for an admin
    session — plus confirmed the myresult page's header button and
    `printMyResultForm()` are both gone from the DOM/`window` — plus the
    standard click-sweep (`nav pages clicked: 17 errors: []`), zero
    regressions. General lesson sharper than #87's own conclusion:
    "company-wide on purpose because it's an admin concern" is not the
    same as "safe to show to everyone" — a summary item built for one
    specific role still needs the same per-role visibility gate every
    other admin-only control in this file already gets (#72/#90/#113),
    or it leaks a real, if harmless-to-act-on, company-wide number to
    whoever happens to open the bell.

193. **User reported "แบบฟอร์มที่ขึ้นในหน้าประเมินตนเองดึงมาไม่ตรง" — an
    employee's self-eval page showed "พนักงานปฏิบัติการ" (op) while the
    same employee's "แก้ไขพนักงาน" page showed "ระดับแบบฟอร์มประเมิน"
    already correctly set to "พนักงานสำนักงาน" (of). Asked two clarifying
    questions before touching code: confirmed the employee code typed on
    the self-eval page matched the edited employee's code exactly (ruling
    out a same-name/different-code mix-up, since `getAssignedEvalLevel()`
    (CLAUDE.md #23) checks `emp[18]` first and would always return the
    real assigned level if the lookup resolved to the right record at
    all).** With a duplicate-record or code-mismatch cause ruled out by
    the user's own confirmation, re-read `saveUserFromModal()`
    end-to-end: it writes `emp[18]='of'` into `MASTER_USERS` correctly
    and immediately — but its two Excel pushes
    (`pushSingleEmployeeSettings()`/`pushSingleEmployeeToExcel()`) were
    still **fire-and-forget**, exactly the same race CLAUDE.md #55
    already found and fixed for `resetUserPin()` years of fixes ago, just
    never applied to this sibling save function. Since `MASTER_USERS` has
    **zero** persistence of its own (#32 — it resets to the hardcoded
    demo baseline on every page load/login, then gets rebuilt purely from
    Excel via the silent-sync chain), a fresh edit only ever lives in
    that one in-memory array until the push to Excel actually lands — if
    Admin reloads, logs out, or simply navigates to test the self-eval
    page right after saving (an extremely ordinary thing to do, exactly
    what this report describes) before the un-awaited push finishes, the
    next page load's `doLogin()`/`tryRestoreSession()` sync chain wipes
    `MASTER_USERS` back to baseline and `ms365SyncEmployeeSettingsSilent()`
    pulls `evalLevel` back from Excel's `EmployeeSettings` table — which
    still holds the old `'op'` value, since the push that would have
    updated it never finished. The result: "แก้ไขพนักงาน" (still on the
    original, un-reloaded tab) correctly shows `'of'` from its own live
    `MASTER_USERS` reference, while the self-eval page (opened fresh,
    post-reload) shows the stale `'op'` pulled back down from Excel —
    two screens disagreeing about the exact same employee record for a
    purely timing reason, not a logic bug in either page. Fixed by
    making `saveUserFromModal()` `async` and `await`ing both push calls
    before `closeM()` — the identical fix #55 already applied to
    `resetUserPin()`'s own equivalent race, just extended to this
    sibling save path that #55 never touched (it only covered the PIN
    field's push, not the employee-edit save path that also pushes
    `evalLevel`/`evalExempt`/`lineUserId` through the same table).
    Verified with a Playwright test that gates the mocked
    `graphUpsertTableRow()` behind an artificial delay (so the push is
    still genuinely in-flight when `saveUserFromModal()`'s own promise
    is inspected) and confirms the function's returned promise only
    resolves after both pushes have genuinely completed — plus the
    standard click-sweep (`nav pages clicked: 17 errors: []`), zero
    regressions. **Real limit, stated plainly**: this closes the *race*
    — it does not retroactively fix any employee record whose
    `EmployeeSettings` Excel row is already stuck on a stale value from
    before this fix; re-saving that employee (even with no real change)
    will now push the correct value through and hold it across future
    reloads/syncs. General lesson sharper than #55's own conclusion: a
    fire-and-forget-push race fixed once in one function (a PIN reset)
    does not mean every other function pushing through the *same*
    underlying table is safe — `EmployeeSettings` alone had at least two
    writers (`resetUserPin()`, already fixed; `saveUserFromModal()`,
    not) — grep every caller of a push function fixed for this exact
    race and check whether each one is also awaited, not just the one
    the original report was about.
    **Immediate follow-up, same request's real target**: user's next
    screenshot pointed specifically at the employee-info tiles
    (ชื่อ-สกุล/รหัสพนักงาน/ตำแหน่ง/รอบประเมิน) asking for them "ให้เห็น
    ชัดเจน ใหญ่กว่านี้" (bigger, clearer) — `.review-employee-grid`'s
    value text (`b`) was still only `11px`, the original pre-#171 size,
    since that earlier pass only added uppercase/letter-spacing to the
    *labels*, never touched the actual value font size. Bumped
    `.review-employee-grid b` to `17px`/`font-weight:800` (matching the
    `.review-z-highlight` result numbers' own prominence one section
    below), gave each tile more breathing room (`padding:13px 15px`,
    white background, a subtle shadow) instead of the cramped `9px 11px`
    on a slightly off-white `#fbfcfe` background. Verified the real
    computed style via `getComputedStyle()` first (`fontSize:"17px"`)
    before re-screenshotting, since a stale screenshot file from a
    previous run can look unchanged purely from file-caching confusion
    even when the CSS itself is already correct — re-ran with a fresh
    output path to confirm visually. Re-ran the same full regression
    suite + click-sweep, zero regressions.

184. **User asked a design question — "ถ้ามีการนำ KPI มาด้วย จะคำนวณอย่างไร" —
    then confirmed, after I explained X had never included KPI at all, that the
    real ask was to add KPI as a genuine third component of the real evaluation
    formula, with "สัดส่วนให้ Admin กำหนดได้เอง หากนโยบายเปลี่ยน" (the Y/Z/KPI split
    must be Admin-configurable, not hardcoded, since company policy can change
    over time).** Asked 3 clarifying questions before touching the core scoring
    engine, since a wrong guess here would mean redoing the real X formula every
    evaluation ultimately saves: confirmed (1) Admin/HR enters the KPI's real
    actual achieved value directly on the KPI page itself (not a separate
    reviewer-step, not self-reported by the employee), (2) the Y/Z/KPI split must
    be set **per form level** (op/of/ldr/mgr can each have their own real split,
    not one company-wide number), and (3) an employee with no KPI assigned at all
    should have the KPI slice's % **returned to Y**, not simply lost.
    **Investigated the real existing formula first, rather than guessing its
    shape** — found X = Y + Z was already a clean 0–100 percentage system:
    `Y = (rawFactorSum/maxFactorSum) × Ypct` and `Z = Zmaxraw` (where `Zmaxraw`
    already numerically equals `Zpct` for every level), so `Ypct+Zpct=100`
    already, just never previously exposed to Admin as an editable number — this
    meant the real KPI feature needed far less new plumbing than it first looked:
    only the *weight* needed to become configurable and a *third term* needed
    adding, not a rebuild of the Y/Z math itself. Also found this file keeps
    **two parallel configs** describing the same percentages — `LEVEL_CONFIG[lv]`
    (`Ypct`/`Zpct`/`Zmaxraw`, what the real save-path formulas actually read) and
    `SML_FORMS[lv]` (`ypct`/`zpct`/`zmax`, what the reviewer-form/template-preview
    pages display and calculate from) — any weight change must apply to both at
    once through one function, never edited independently, the same #41 "two
    duplicate implementations that can silently disagree" caution this file has
    hit before, just for a pair of config *objects* instead of a pair of
    *functions* this time.
    **Added `DEFAULT_SCORE_WEIGHTS`/`KPI_SCORE_WEIGHTS_KEY`** — one override
    object per level (`{ypct, zpct, kpct}`), defaulting to the exact real numbers
    already in production with `kpct:0` for every level — zero behavior change
    for anyone until Admin explicitly opens the new weight panel and saves a real
    split (CLAUDE.md #6's own "a localStorage-backed override must never change
    existing behavior by default" rule). `applyScoreWeightsToConfigs()` is the
    one function that writes a saved split onto *both* `LEVEL_CONFIG` and
    `SML_FORMS` together, so the two configs can never drift apart again — every
    other function in the file keeps reading `cfg.Ypct`/`cfg.ypct` exactly as
    before, with zero changes needed at any of those read sites.
    **New `computeKpiScoreForEmp(empCode, cycle)`** — reads real KPI records from
    the existing `goalKpiData` (Goal/KPI management module, previously a pure
    goal-tracking list with **no actual-value or per-employee field at all**) —
    added `empCode` (which specific employee, required only for `scope==='person'`
    KPIs — org/dept-scope KPIs have no one person to score, a real, honestly-
    documented limitation rather than guessed at), `targetVal`/`actualVal`
    (numeric, separate from the existing free-text `target` label like "≥95%" so
    existing records' display text is untouched), and `direction` (`up`/`down`,
    e.g. "ยิ่งต่ำยิ่งดี" for an accident count) to the Add/Edit KPI modal — new
    fields shown/required only when scope is "รายบุคคล," wired through
    `onKpiScopeChange()`/`onKpiEmpCodeInput()` the same resolve-by-code-not-name
    pattern CLAUDE.md #1/#28 already establish (rejects a scope='person' KPI with
    no real matching `MASTER_USERS` code, same as every other code-entry field in
    this file). `computeKpiAchievementPct(k)` converts target/actual/direction
    into a real 0–100% achievement ratio (capped both directions, never
    fabricated when either number is genuinely blank — returns `null`, per
    CLAUDE.md #14), and the overall per-employee KPI score is the weight-averaged
    achievement across every one of that employee's real, active, current-cycle
    person-scope KPIs.
    **`computeEvalXWithKpi(lv, empCode, cycle, rawY, maxYraw, zScore)`** is the
    one real place X=Y+Z+KPI is now computed — re-derives Y itself (not just adds
    a KPI term onto an already-computed Y), since the *effective* Y% depends on
    whether this specific employee has a real KPI (`ypctEff = hasKpi ? Ypct :
    Ypct+Kpct`, implementing the user's own "return KPI's % to Y when absent"
    answer) — every other function that needs X calls this one shared function
    (the same CLAUDE.md #41/#94 "one shared chokepoint, no duplicate formula"
    discipline), never re-derives the split independently: `calcCurrentEvalSummary()`
    (the self-eval page's real save/submit-confirm path), `recalc()` (the
    self-eval page's live preview while filling the form — verified against
    `calcCurrentEvalSummary()`'s own result to confirm the two can never show a
    different number), `selectReviewScore()` (the reviewer-form's live preview),
    and `clearReviewerForm()` (resetting raw scores to 0 must NOT also silently
    zero out a real KPI contribution that doesn't depend on raw factor scores at
    all — the old code hardcoded `#reviewX` back to just `Z`, which would have
    been wrong the moment any level ever turns KPI on). `submitReviewerForm()`
    was simplified to **read `#reviewX`/`#reviewY` straight off the DOM** instead
    of recomputing `x=y+z` a third, independent time — the exact kind of
    duplicate-formula risk #41 warns about, closed by deletion rather than a
    fourth copy of the same math.
    **New Admin UI**: a "⚖️ สัดส่วนคะแนน Y / Z / KPI" panel added to the existing
    sysadmin-only factor editor (`showTplDetail()`, "ตั้งค่าแบบประเมิน" page) — 3
    number inputs per level, a "💾 บันทึกสัดส่วน" button
    (`saveScoreWeightsFromForm()`, refuses to save unless Y+Z+KPI sums to exactly
    100%, never silently rescales what Admin typed) and a "↩️ รีเซ็ตเป็นค่าเริ่มต้น"
    button (`resetScoreWeightsForLevel()`) — the same editable-override +
    reset-to-default pairing CLAUDE.md #6 requires for every such value in this
    file. New KPI/Y/Z stat tiles added to both the self-eval page
    (`#sumKpiCard`) and the reviewer-form modal (`#reviewKpiCard`) — both
    genuinely hidden (`display:none`) whenever that level's `Kpct` is 0, so a
    company that never turns KPI on sees no new UI at all, not just a 0.00 tile
    sitting there unexplained.
    **Excel sync, extended rather than duplicated**: reused the *same*
    `FormWeights` table and `pushFormWeightsToExcel()`/`ms365SyncFormWeights()`
    pair already built for factor overrides (#39) — the JSON payload per level
    changed shape from a bare factors array to `{factors, ypct, zpct, kpct}`,
    with the pull side accepting **both** the old array-only shape (so a row
    synced from before this fix, or from a device not yet updated, still reads
    correctly) and the new object shape — never breaking an existing sync, per
    the same backward-compatible-read discipline CLAUDE.md #102/#106 already
    establish for a changed external-table shape. **Deliberately left the KPI
    actual-value/target/direction/empCode fields local-only (not synced to
    Excel)** — unlike the weight panel, there is no real, screenshot-verified
    column for these in the `KPI_Goals` sheet (CLAUDE.md #30/#97's own "never
    assume a column exists without verifying against the real file" rule), so
    guessing a shape here risked the exact #68/#104 class of silent corruption;
    stated as a known limitation rather than silently built and hoped-for.
    Verified with Playwright/Node tests driving the real functions (never
    writing to `LEVEL_CONFIG`/`SML_FORMS` directly): confirmed the baseline
    (`Kpct=0`) produces byte-identical X to the pre-#184 formula; confirmed
    saving a real 50/30/20 split and an employee with *no* KPI assigned
    correctly redistributes the 20% into Y (`Ypct_eff=70`); confirmed the same
    employee *with* a real 70%-achieved KPI gets the un-redistributed split
    (`Ypct=50`) plus a real `14.00` KPI contribution; confirmed resetting
    restores the exact original 70/30/0 default; confirmed a `direction='down'`
    KPI with target=0/actual=0 scores 100%; confirmed the self-eval page's live
    `recalc()` tile and `calcCurrentEvalSummary()`'s saved result agree exactly
    (`Y=50.00, KPI=16.00, X=96.00` both sides); confirmed the reviewer-form path
    (`openReviewerForm → selectReviewScore → submitReviewerForm`) produces the
    identical `X=94.00`/grade `A` end-to-end through the real UI (clicking real
    score buttons, never writing scores to the draft directly) — plus the
    standard click-sweep (`nav pages clicked: 17 errors: []`). General lesson:
    before building a user's requested "add a new score component," re-derive
    the *existing* formula's real shape first (here, discovering Y/Z already
    summed to a clean 100%, and that two parallel config objects already existed
    describing it) — it is often far cheaper to extend an already-normalized
    system with one new configurable weight and one shared calculation
    chokepoint than to guess at a brand-new formula from scratch, and finding
    the existing duplicate-config risk (`LEVEL_CONFIG` vs `SML_FORMS`) before
    writing the override mechanism is what kept the fix from silently
    reintroducing the exact "two numbers disagree" bug shape this file has hit
    many times before.

185. **Follow-up to #184: user asked "sync excel ด้วย" — closing the one
    gap #184 itself explicitly deferred: the real KPI actual-value/
    target/direction/empCode fields (only meaningful for scope='person'
    KPIs, the ones that feed the new Y/Z/KPI formula) were left
    local-only, since #184 had no real screenshot-verified column
    layout for them in the `KPI_Goals` sheet to extend safely.** Rather
    than guess a column position inside the existing 8-column layout
    (`KPI_ID·Name·Unit·Target·Weight·Scope·Year·Status`, verified real
    per #34), appended the 4 new fields as **trailing** columns 8–11
    (`EmpCode·ActualVal·TargetVal·Direction`) — the same CLAUDE.md #5
    "append at the end, never insert mid-row" discipline this file
    already applies to arrays, here applied to an external table whose
    real shape beyond column 7 has never been confirmed against a
    screenshot. `pushKpiToExcel()` now sends all 12 values on every
    push; `ms365SyncKpiGoals()`'s reader explicitly distinguishes
    "column genuinely absent" (`undefined`/`null`, from a row synced
    before this fix or from a real sheet that hasn't added these
    columns yet) from "a real empty string"/"a real `0`" — `actualVal`/
    `targetVal` parse to `''` only when the raw cell is itself
    `undefined`/`null`/`''`, never conflating that with the real number
    `0` (meaningful for e.g. a zero-accident KPI's real actual value).
    Verified with a Node/Playwright test: pushing a real person-scope
    KPI captures the exact 12-element array sent to
    `graphUpsertTableRow`, round-tripping that same row back through
    `ms365SyncKpiGoals()` reproduces the identical KPI object; and,
    separately, feeding the sync function an **old-shape 8-column row**
    (simulating a real sheet or a pre-#184 sync that never had these
    columns) confirms it parses without error and correctly falls back
    to `empCode:''`/`actualVal:''`/`targetVal:''`/`direction:'up'`
    rather than crashing or guessing — plus re-ran all three of #184's
    own weight/UI/reviewer-form tests (unaffected, since this change
    only touches the KPI-record read/write shape, not the scoring
    formula itself) and the standard click-sweep (`nav pages clicked:
    17 errors: []`), zero regressions. **Left unchanged, stated
    plainly**: the weight panel's own Excel sync (`FormWeights` table,
    #184's `{factors, ypct, zpct, kpct}` JSON payload) was already real
    as of #184 — this fix only closes the *second*, explicitly-deferred
    half (the per-employee actual-value fields on `KPI_Goals`). Like
    every other locally-guessed Excel column in this file's history
    (#68's GM column, #97's Approvals mismatch), if the real sheet
    later turns out to already use columns 8–11 for something else, a
    real screenshot of that header row is the next real fix, not
    further guessing from code alone.

186. **User sent a real screenshot of the `KPI_Goals` sheet's actual header
    row and data — exactly the "verify against the real file" check #185
    itself invited. It confirmed the column-order guess in #184/#185 was
    wrong on two real points at once.** The real sheet has **10** base
    columns, not the 8 assumed: `KPI_ID · ชื่อ KPI · หน่วยวัด · น้ำหนัก ·
    เป้าหมาย · ประเภท · ขอบเขต · ใช้ในรอบ · Status · หมายเหตุ` — "น้ำหนัก"
    (weight/pct) sits **before** "เป้าหมาย" (target text), the reverse of
    what `pushKpiToExcel()`/`ms365SyncKpiGoals()` assumed, and there are
    two genuinely real columns the code never accounted for at all:
    "ประเภท" (Type) at index 5 and "หมายเหตุ" (Note) at index 9. The old
    code comment explicitly claimed "คอลัมน์ Type ไม่ได้อยู่ใน schema จริง"
    (the Type column isn't in the real schema) — that was simply wrong,
    now disproven by the real header row; both `type` and `note` already
    existed as real fields on the local `goalKpiData` object (`mKpiType`/
    `mKpiNote` in the Add/Edit KPI modal, #35) but were never pushed to
    Excel at all, so every real push was silently 2 columns short and
    writing `pct`/`target` into each other's real cells. Since #185's
    4 new trailing fields (EmpCode/ActualVal/TargetVal/Direction) were
    appended right after the assumed 8th column, they also collided with
    the real Status(8)/Note(9) columns instead of landing past them.
    Fixed `pushKpiToExcel()`'s array to the real verified order — `[id,
    name, unit, pct, target, type, scope, year, status, note, empCode,
    actualVal, targetVal, direction]` (14 elements) — and
    `ms365SyncKpiGoals()`'s reader to the matching indices, reading
    `type`/`note` directly from their now-confirmed-real columns (5/9)
    instead of `type`'s old oldById-fallback-only treatment (kept as a
    secondary fallback only for a genuinely blank cell, never the primary
    source anymore, since the column is real). Verified with a Playwright
    test that feeds the **exact real screenshot rows** (K001/K002/K005,
    10 columns, no trailing #185 fields at all) through the real
    `ms365SyncKpiGoals()` and confirms every field — including `type`
    ("ปริมาณ"/"คุณภาพ"/"ภาวะผู้นำ") and `note` ("— ยังไม่เปิดใช้...") —
    lands correctly; plus a full push→capture→pull round-trip test with
    every field (type/note/empCode/actualVal/targetVal/direction all
    populated) confirming byte-for-byte fidelity — plus re-ran all four
    of #184/#185's own existing tests and the standard click-sweep (`nav
    pages clicked: 17 errors: []`), zero regressions. General lesson
    sharper than #185's own closing line: the very next real screenshot
    *did* turn out to contradict the guessed column order — not at the
    new trailing fields #185 flagged as unverified, but one layer
    further back, in the base 8-column layout #184 had itself never
    actually verified against a real header row either (it was adapted
    from an idealized schema, not the real sheet) — a "based on the
    established doc schema" assumption is still a guess until a real
    screenshot confirms it, even when it's reused from an earlier,
    seemingly-settled fix rather than invented fresh.

187. **User asked directly: "กรณีที่เราลงผลประเมินไปแล้วมาเพิ่ม KPI ภายหลัง
    ระบบทำไง" (what happens if an evaluation is already recorded and a KPI
    gets added afterward).** Traced the real behavior first rather than
    guessing: the self-eval page's `recalc()` and the reviewer modal's
    `selectReviewScore()` both call `computeEvalXWithKpi()` (#184) fresh
    every time, reading `goalKpiData` live with no caching — so a record
    still sitting at `Submitted`/`L1Reviewed`/`L2Reviewed` picks up a
    newly-added KPI automatically the next time anyone opens that form
    (`restoreEvalFormFromDraft()`/`restoreReviewerFormFromDraft()` call
    the real `setScore()` per factor, which triggers `recalc()`), and
    resaving/resubmitting persists the updated value. But once a record
    passes `GMApproved`/`Acknowledged`/`Calibrated`, nothing in this file
    ever reopens its score form again — the stored `X`/`Y`/`KPI` become a
    permanent snapshot from whenever they were last saved, and a KPI
    added after that point has no path to reach them at all. Asked 3
    clarifying questions before building anything, since this touches
    the core scoring chokepoint and the already-ranked Bell Curve
    results: confirmed (1) a manual "Admin กดคำนวณใหม่เอง" button, not a
    silent auto-recompute — the same "no silent score change" caution
    #180's grade-hiding and #182's notify-dedup both already apply;
    (2) scope is **any status up to and including `Calibrated`, never
    `Approved`** — an Approved record is genuinely closed, consistent
    with `exportPayrollData()`'s own `isFinalStatus()` gate (#61) that
    already treats `Approved` as the one real point of no return; (3)
    recalculating updates **only the raw X/Y/Z numbers — the grade
    (A-E) stays exactly as it was** until HR explicitly reruns Bell
    Curve for that person's real comparison group, since a grade is a
    relative rank against peers (#155), not a function of one person's
    score alone — silently re-grading one person without re-ranking the
    whole group would produce a grade that no longer means what Bell
    Curve's own percentile promise claims it means.
    Added `recalcKpiScoreForRecord(empCode, cycle)`: looks the record up
    via the same `findCurrentCycleDraft()` helper every other status-
    sensitive lookup in this file already uses (#162/#163's own "don't
    `.find()` blind, pick the highest-ranked real match" discipline),
    refuses for a non-admin (`isAdminOrSysadmin()`, #113's own gate) or
    for a record already `Approved` (pointing the toast at "✏️ ปรับ
    เกรดเอง" — #155's real per-person override — as the honest remaining
    path for that case), then rebuilds `rawY`/`maxY` from the record's
    own **already-given raw factor scores** (`d[4..13]`/`d[14..17]`,
    `collectEvaluationPayload()`'s own established positional shape —
    never re-asks anyone to re-score anything) against the *current*
    `SML_FORMS[lv].factors` weights, recomputes `Z` live via
    `computeZScore()` (so a since-corrected attendance record also gets
    picked up, not just KPI — "คำนวณใหม่" means genuinely fresh, not
    KPI-only), and calls `computeEvalXWithKpi()` — the one real formula
    chokepoint (#184) — to get the real new `Y`/`Z`/`KPI`/`X`. Writes
    only `d[d.length-5..3]` (Y/Z/X) in place, leaves grade/status
    completely untouched, pushes to Excel via `pushDraftRowToExcel()`
    (#94's established "always push the current-state table, never
    silently local-only" rule), and logs a real before→after `X` diff to
    Audit Log (#114's own established diff-log pattern). Added a
    "🔄 คำนวณใหม่ (KPI)" button to **both** real rows on the Calibration
    page (`renderCalibQueue()`) that can legitimately need it: the
    `'ready'` row (status exactly `Acknowledged`, about to be
    calibrated — HR already has an editable `.calib-adj` number box
    there, this button just fills it with the real recalculated value
    instead of making HR do the math by hand) and the `'done'` row
    (status `Calibrated` or later — this is the one genuinely new real
    gap, since that row previously had no editable field or any way to
    touch the stored score at all). The `'done'` row's button is
    explicitly gated on the record's **real** `d[d.length-1]` status,
    not the roster's `state` label — `buildTierRoster()`'s `'done'`
    bucket for Calibration's `Acknowledged` input status covers both
    `Calibrated` *and* `Approved` records together (#136), so checking
    the real status directly is what correctly hides the button once a
    record is truly `Approved`, where the roster-level `'done'` label
    alone would not have been specific enough. Verified end-to-end with
    a Playwright test: seeds a real `Acknowledged` draft with real raw
    factor scores and a pre-KPI baseline `X`, adds a real person-scope
    KPI afterward, confirms the button correctly recomputes `X`/`Y` to
    include it while `grade`/`status` stay exactly as they were and a
    real Excel push + Audit Log entry fire; repeats the same recalc
    against a `Calibrated` record and confirms the grade is provably
    unchanged even though `X` moved; confirms a record flipped to
    `Approved` is refused outright with the stored `X` genuinely
    untouched; confirms a non-admin session is refused too — plus full
    re-runs of #184-#186's own existing KPI tests and the standard
    click-sweep (`nav pages clicked: 17 errors: []`), zero regressions.
    General lesson: when a user asks "what happens in scenario X" about
    a feature that was just shipped, tracing the real code path first
    (rather than assuming "it just works" or "it's broken") often
    reveals the honest answer splits into "automatic in some states,
    a real gap in others" — and once the gap is confirmed real, the
    right scope for closing it (how far it should reach, whether it's
    automatic or manual, what it should and shouldn't touch) is worth
    confirming explicitly before writing code, since a scoring/grading
    feature has real consequences (an already-ranked Bell Curve result,
    a record already communicated to the employee) that a wrong guess
    here would be expensive to walk back.

188. **User asked two things in one short message: "หน้าพนักงานไม่ต้องแสดง
    dashboard" (the employee's own page shouldn't show the Dashboard) and
    "ทบทวนหน้า role ด้วย มีแถบให้เลือกไม่ครบ" (review the role page too —
    a selectable bar/list is missing some options).**
    **Dashboard-for-emp**: traced `setRole()`/`NAV_PERMS` and found the
    `dash` nav item had **no `data-role` attribute at all** — unlike
    every other nav item, it was never gated by role, by design, per
    CLAUDE.md #58's own stated reason (`setRole('admin')` fires
    synchronously at script-parse time, before login, to show something
    while the page loads — wiring `dash` into anything role-sensitive at
    that exact moment had broken things before). That reasoning covered
    *why `dash` couldn't be wired into certain async dispatch logic* — it
    never actually required `dash` to stay visible to every role forever;
    adding a plain static `data-role` attribute calls no function and
    doesn't touch the TDZ/`DEFAULT_MS365_CONFIG` ordering #58 warned
    about, so it was safe to add. Gave the dash nav item
    `data-role="admin,exec,gm,l2,l1,unit"` (deliberately excluding only
    `emp` — `sysadmin` always bypasses the role filter in `setRole()`
    regardless of any list, per its own `r==='sysadmin'?true:...` check).
    **Found and fixed a real knock-on bug this surfaced**: `setRole()`'s
    own "current page just got hidden, go somewhere real" fallback was
    hardcoded to always `.click()` the `dash` nav item — harmless while
    `dash` was unconditionally visible, but now that `dash` itself can be
    the hidden page (exactly the case when an `emp` session first loads,
    since the page's default `.on` state is `pg-dash`), that hardcoded
    click would have silently shown the Dashboard *content* anyway (a
    programmatic `.click()` on a `display:none` element still fires its
    `onclick` handler — only the sidebar wouldn't highlight it), defeating
    the whole fix. Changed the fallback to find the first nav item that
    is actually visible for the current role and click that instead
    (falling back to the old hardcoded `dash` click only if, somehow,
    nothing is visible at all) — for `emp` this now correctly lands on
    "1. ประเมินตนเอง" (`myeval`, one of only two nav items — the other
    being "8. ผลประเมิน" — that have never had a `data-role` at all,
    since every employee needs access to both regardless of role).
    **"หน้า role" (the role page) audit**: re-ran the exact #64/#65/#79
    discipline — grepped every independent role-enumeration list in the
    file (`#roleSel`, `#filterRole`, `mu_role`, `NAV_ROLES`, `ROLE_DEFS`,
    `avMap`) and found all six already complete (all 8 real roles:
    sysadmin/admin/exec/gm/l2/l1/unit/emp, or 7 for `NAV_ROLES` which
    correctly omits `sysadmin` since that role always bypasses the nav
    gate and was never meant to need a configurable column). The one
    genuinely incomplete list found was `U_ROLE_LABEL` (the employee
    list's own role-badge map, used at 2 render sites) — missing
    `sysadmin` and `gm` entirely, so an employee row with either role
    fell through to the bare `||u[2]` fallback and rendered as plain
    unstyled text ("sysadmin"/"gm") instead of a real colored badge like
    every other role gets — exactly the #79 shape of a role-label list
    silently left behind a newer role rollout. Added both, matching the
    existing icon/wording conventions already used in `NAV_ROLE_LABEL`/
    `avMap`/`#roleSel` for the same two roles. Verified with a Playwright
    test that logs in via the real `applySession()` (never touching
    `setRole()`/CSS directly) as a synthetic `emp` employee — confirms
    the dash nav item is genuinely hidden (`display:none`) and the page
    actually lands on `pg-myeval`, not a hidden `pg-dash` — then logs in
    as `admin` and confirms the dash nav item is visible again, plus
    confirms `U_ROLE_LABEL.sysadmin`/`.gm` now exist — plus the standard
    click-sweep (`nav pages clicked: 17 errors: []`), zero regressions.
    General lesson: a page explicitly left unrestricted in the past for
    a real, documented reason (here, `dash`'s role in top-level
    synchronous init, #58) doesn't mean every later request to restrict
    it is automatically unsafe — re-read *why* the earlier exception
    existed before assuming it still applies to the new change, since a
    static HTML attribute and a dynamic function call can carry very
    different risk even when they touch the same element; and once a
    previously-"always visible" nav item becomes conditionally hidden,
    audit every other place in the file that assumed it would always be
    clickable (here, `setRole()`'s own hardcoded fallback), since that
    kind of hardcoded reference is easy to miss until the exact
    condition that breaks it (the currently-active page being the one
    just hidden) actually occurs.

189. **User's screenshot of the "ตั้งค่าผู้ใช้ & บทบาท" page's Super Admin
    role card (13 real permission rows, all ✓) said "หน้าแก้ไขมารายการ
    ไม่ครบ" (the edit page's list is incomplete).** Traced `editRole(key)`/
    `saveRoleFromModal()`: both already iterate `Object.keys(ROLE_PERM_LABELS)`
    generically (the correct, generic pattern #37 established) — so the
    bug wasn't in the JS logic, it was in the `#mEditRole` modal's own
    static HTML, which still only had **10** checkboxes
    (`rp_selfEval`/`rp_teamEval`/`rp_reviewL2`/`rp_calibration`/
    `rp_finalApprove`/`rp_dashTeam`/`rp_dashOrg`/`rp_importTime`/
    `rp_exportReport`/`rp_adminSettings`) against `ROLE_PERM_LABELS`'s
    real 13 keys — missing `reviewL1` (added by #92), `gmApprove` (added
    by #61), and `viewCalibGrade` (added by #180), three separate
    historical role rollouts that each extended `ROLE_PERM_LABELS`/
    `ROLE_DEFS` (and, per #37/#64/#65's own established discipline, every
    *other* role-enumeration list in the file) but never circled back to
    this one specific modal's hand-written checkbox markup.
    **This was not just a cosmetic gap — it was a real silent data-loss
    bug**: `editRole(key)`'s loop does `document.getElementById('rp_'+k)`
    for each key and only sets `.checked` `if(el)` (correctly guarded, so
    opening the modal never crashed), but `saveRoleFromModal()`'s own
    write-back loop does `perms[k] = !!document.getElementById('rp_'+k)
    ?.checked` with **no such guard** — for any of the 3 missing keys,
    `getElementById` returns `null`, `?.checked` is `undefined`, and
    `!!undefined` is `false`. So editing *any* role (even just to fix a
    typo in its name) and clicking "บันทึก" silently wrote `gmApprove:
    false`/`reviewL1:false`/`viewCalibGrade:false` into that role's
    stored perms, **regardless of what the real value had been**,
    permanently disabling GM-approval/dept-head-review/post-Calibration-
    grade-visibility for that role the next time anyone edited it at
    all — a real, serious access-control regression hiding behind an
    innocent-looking "แก้ไข" button, exactly the shape of risk CLAUDE.md
    #55/#143 already warn about for any save path that can silently
    clear a value nobody meant to touch.
    Fixed by adding the 3 missing `<label><input type="checkbox"
    id="rp_...">` rows to the modal's static HTML, in the same order
    `ROLE_PERM_LABELS` lists them (right after `teamEval` for `reviewL1`,
    right after `reviewL2` for `gmApprove`, at the end for
    `viewCalibGrade` — matching the real display card's own row order)
    — zero JS changes needed, since `editRole()`/`saveRoleFromModal()`
    were already written generically and only needed the matching markup
    to exist. Verified with a Playwright test that opens `editRole('gm')`
    (a real role with `gmApprove:true`/`viewCalibGrade:true` in its
    actual `ROLE_DEFS` defaults) and confirms all 13 checkboxes now
    exist in the DOM, the 3 previously-missing ones correctly reflect
    the real stored state (not defaulting to unchecked), and — the part
    that actually matters — clicking "บันทึก" with nothing touched now
    **preserves** `gmApprove`/`viewCalibGrade` as `true` instead of
    silently flipping them to `false` — plus the standard click-sweep
    (`nav pages clicked: 17 errors: []`), zero regressions. General
    lesson sharper than #37/#64/#65's own "grep every role-enumeration
    array when adding a role" discipline: that discipline covers *which
    roles exist*, but a **permission key** rollout (adding a new
    checkable capability like `gmApprove`/`reviewL1`/`viewCalibGrade` to
    an existing set of roles) needs the identical sweep applied to every
    place that lists *permission keys*, not just role keys — and when
    the generic read/write loop (`editRole()`/`saveRoleFromModal()`)
    already iterates the keys correctly, a hand-written HTML checklist
    sitting right next to it is the one place still capable of silently
    disagreeing, since nothing enforces that the modal's static markup
    and the live permission-key list stay in sync with each other.

190. **User's screenshot of the "แบบประเมินตนเอง" page's top toolbar (🗑️ ล้าง
    ผลประเมิน / 💾 บันทึกร่าง / 🖨️ พิมพ์ร่าง / 📤 ส่งแบบประเมิน / 💾 ส่งออก
    ไฟล์) showed all 5 buttons rendered normally, and asked: "หน้าประเมิน
    ตนเอง ถ้าไม่มีสิทธิประเมินให้ขึ้นสีเทาไว้ ปุ่มไม่ใช้งาน" (if the
    employee has no self-eval permission, grey these out — disabled).**
    `onEvalCodeGateChange()` (CLAUDE.md #111/#62/#71) already correctly
    gated the 4 level-selection buttons and `#formArea` behind
    `isEligibleForSelfEval()` — but the 5 real action buttons sit
    *outside* `#formArea`, in the page header's own `.ph-act` block, and
    were never wired into that same ineligible branch at all: they had no
    `id`, no disabled state, nothing — an ineligible employee saw a red
    "⛔ ไม่อยู่ในรายชื่อ/แผนกที่กำหนด" warning with every one of these 5
    buttons still fully clickable right above it, exactly contradicting
    the warning's own meaning.
    Gave all 5 buttons real `id`s (`evalBtnClear`/`evalBtnSaveDraft`/
    `evalBtnPrint`/`evalBtnSubmit`/`evalBtnExport`) and added one shared
    `setEvalToolbarEnabled(enabled)` helper — sets `.disabled`, a greyed
    `opacity:0.45`/`cursor:not-allowed`, and an explanatory `title` when
    disabled. Called `setEvalToolbarEnabled(true)` at the top of
    `onEvalCodeGateChange()` (the same "reset before re-deciding" spot
    the level buttons already use) and `setEvalToolbarEnabled(false)`
    inside the existing ineligible branch, right alongside the level-
    button disable and `#formArea` hide it already does — one real
    chokepoint, not a second independent gate. Verified with a Playwright
    test seeding one eligible employee (in `EVAL_ELIGIBILITY`'s real
    `emps[]` allowlist, written through `localStorage`/`loadEvalEligibility()`
    itself — not the module variable directly, since `isEligibleForSelfEval()`
    always re-reads from storage) and one ineligible employee under
    `restricted` mode: confirms all 5 buttons are enabled/normal for the
    eligible code, all 5 are disabled+greyed for the ineligible code, and
    clearing the code field resets them back to enabled — plus the
    standard click-sweep (`nav pages clicked: 17 errors: []`), zero
    regressions. General lesson sharper than #111's own conclusion: a
    gating fix applied to one real element (`#formArea`) and a related
    set of buttons (the 4 level buttons) inside the same function does
    not automatically cover every *other* control on the same page that
    implies the same permission — a page header's own action buttons,
    sitting outside the gated content area entirely, are exactly the
    kind of control a "hide the form" fix can walk right past, since
    they were never part of the form being hidden.

191. **User's screenshot of "ผลประเมินของฉัน" showed two print buttons —
    the page header's "🖨️ พิมพ์ใบประเมิน (PDF)" and the success banner's
    "📄 ดาวน์โหลดใบประเมิน PDF" (#173) — and reported "ไม่เหมือนกัน" (they
    don't produce the same thing).** Traced the header button: it called
    bare `printEvalForm()` with no arguments — the exact function built
    for the **self-eval page's own live state** (`currentLevel`/
    `evalScores`, module variables only `setEvalLevel()` on `pg-myeval`
    ever sets, plus `#evalCode`/`#evalPos`/`#evalDept` DOM elements that
    don't exist on `pg-myresult` at all). On the result page, `currentLevel`
    is whatever it last happened to be set to elsewhere in the session —
    `null` if the self-eval page was never opened this session (the
    button then just warns "กรุณาเลือกระดับตำแหน่งก่อน" and does nothing),
    or a completely different employee's/level's stale scores if an
    admin had browsed someone else's form earlier — while the banner's
    "ดาวน์โหลด" button (#173) correctly calls `printSingleDraft(code,
    cycle, level)` with the real resolved draft for `CURRENT_SESSION_USER`,
    the same `hasVisibleResult()`-filtered, latest-by-cycle lookup
    `renderMyResult()` itself already uses to populate the page.
    Added `printMyResultForm()` — mirrors `renderMyResult()`'s own
    `latest` resolution exactly (not a new query) and calls the same
    `printSingleDraft()` both buttons should have used from the start —
    and pointed the header button at it instead of bare `printEvalForm()`.
    Verified with a Playwright test that deliberately seeds a stale
    `currentLevel='mgr'`/`evalScores` leftover (simulating having
    browsed a different employee's self-eval form earlier in the same
    session) alongside a real `GMApproved` draft at level `'op'`, and
    confirms the header button now correctly calls `printSingleDraft()`
    with the real `op`/2569 record — matching the banner button exactly
    — instead of silently printing the stale `mgr` state or warning
    "เลือกระดับก่อน" — plus the standard click-sweep (`nav pages
    clicked: 17 errors: []`), zero regressions. General lesson: a
    function built for one page's own live in-memory state (module
    variables + specific DOM ids) is not safe to call bare from a
    second page just because it "does roughly the same thing" — when
    two buttons on the same page are supposed to produce the same
    document, grep whether they actually call the same function with
    the same real-data resolution, not just whether their labels and
    icons look similar.

207. **A `disabled` button is silent — "กดแล้วไม่มีอะไรเกิดขึ้น" can simply mean the button was never clickable.**
    "ยืนยันผล Calibration" was `disabled` until Bell Curve was computed and re-locked on any score edit/group
    change/auto-sync invalidation, so users clicked a dead button with zero feedback and reported "nothing
    happens / Excel not saved." Fixed by never truly disabling it (only dimming) — `confirmCalibration()` already
    toasts why it can't proceed. It also now `await`s `pushDraftRowToExcel()` (which returns `{ok,error}`) and
    reports the real Excel result in the toast instead of a fire-and-forget "success." Added `resetCalibration()`
    (admin-only; `Calibrated` → `Acknowledged`, grade back to provisional, pushed to Appraisals/Approvals/Audit
    Log; `Approved` is never touched). General rule: for any "it doesn't save" report, first check whether the
    control can actually fire, then make the action report its real outcome on screen.

208. **Per-device `localStorage`-only config with an empty default disappears on every new device/cleared browser** —
    `appUrl` (LINE/email result link) was `''` in `DEFAULT_MS365_CONFIG`, so Admin had to retype it everywhere.
    Baked the real URL in as the default (it is not a secret; the page is public and the link only opens the PIN
    login). Same lesson as #31.

209. **KPI Import (CSV) + Delete (web and Excel).** `openKpiImportModal()`/`previewKpiImport()`/`confirmKpiImport()`
    validate every row before writing (name/unit/weight required, scope in org/dept/person, `person` needs an
    `emp_code` that exists in `MASTER_USERS`, duplicate `kpi_id` in file skipped, existing `kpi_id` = update in
    place) and show a preview first (same shape as employee import #77). `pushKpiToExcel()` now returns a
    promise so import can report real Excel success counts. `deleteGoalKpi()` (admin-only) removes the KPI locally
    and calls the new `graphDeleteTableRows()` → Worker `POST /rows/delete` (also in the delegated path). Delete
    matches **every** row with the key (duplicates included), deletes from the **highest `index` down** (deleting a
    row shifts later indexes), and refuses an empty key (would match blank cells). If the Excel delete fails the
    toast says the KPI will come back on the next `ms365SyncKpiGoals()` — never claims a clean delete.
    **The Worker changed (`/rows/delete`) → it needs a redeploy**; until then web-side delete works but the Excel
    delete reports "not found" via the Sync Log/toast.

210. **Y/Z/KPI weights per year/cycle.** `getScoreWeightsFor(lv,cycle)` is the single resolver (year override in
    `smlPmsScoreWeightsByYear` -> base weights). `computeEvalXWithKpi` uses the *record's own cycle*, so 2569=60/30/10
    never changes 2568 records. Z is scaled (`zRaw/tableMax*zpct`) only when `zpct` differs from the Z-table max.
    Admin picks "ใช้กับรอบ" in ตั้งค่าแบบประเมิน; FormWeights payload gained `byYear` (pull merges, remote wins).
    Also fixed `calcCurrentEvalSummary` using max Z instead of real attendance Z. Labels on LEVEL_CONFIG/SML_FORMS
    show the *current* cycle's %.

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

163. **Follow-up to #162: user reported the identical "ไม่ดึงข้อมูลที่
    ประเมินแล้วมาแสดง" symptom again — this time even after trying a
    completely fresh Private/Incognito window with a fresh login,
    ruling out ALL browser-side caching. Confirmed the #162 fix itself
    was genuinely already live (its own commit was ~18 hours old, far
    past any realistic GitHub Pages propagation delay; `main` and the
    feature branch were confirmed in sync with zero diff; the real
    `findCurrentCycleDraft` function was confirmed present in the
    checked-out file) — so the honest conclusion was that #162's fix,
    while correct for what it covered, did not cover everything.**
    #162 fixed the unsafe `drafts.find(x=>x[0]===u[0])` lookup in
    `renderTeamFromMaster()`/`countTeamPending()`/`getReportData()` —
    but grepping the whole file for the same shape (`drafts.find(...
    x[0]===...)` with no, or incomplete, cycle/level scoping) found the
    identical bug living in **6 more places**, the biggest of which is
    `buildTierRoster(resolverFn, myCode, inputStatus, cycle)` (#136) —
    the one shared function behind **all 5 real review/approval
    queues** (`renderReviewL1Queue`/`renderReviewQueue`/
    `renderGmApproveQueue`/`renderCalibQueue`/`renderApproveQueue`).
    Its own lookup, `getDrafts().find(d=>d[0]===emp[0] && d[2]===cycle)
    || null`, filters by cycle (unlike #162's original bug, which
    didn't filter by cycle at all) but still takes the **first** match
    instead of the highest-ranked one — so a stale, lower-rank duplicate
    draft under a different `level` (the exact kind of leftover #162
    already diagnosed as coming from historical level-guessing bugs
    like #110, or simply two Excel rows with the same EmpID/cycle but
    different levels/history) sitting earlier in the array can still
    silently hide the real, further-advanced record, reproducing
    "⏳ รอผลประเมิน" on every queue page even though the real Excel data
    (and the real draft) already shows an advanced status. Reproduced
    this exact failure with a Playwright test seeding a real L1
    (department head) + one employee with a stale `'op'`-level `Draft`
    row followed by the real `'of'`-level `Submitted` row — confirmed
    it fails (shows "รอผลประเมิน", `state:'pending'`) on the pre-fix code
    and passes (shows real action buttons, `state:'ready'`) after the
    fix, by stashing/unstashing the change and re-running the identical
    test against both versions.
    Fixed by routing `buildTierRoster()`'s lookup through the same
    `findCurrentCycleDraft()` helper #162 already built — one line
    changed, cascading correctly to every one of the 5 queue pages plus
    their nav badges/notification counts (#138/#140), since they all
    call `buildTierRoster()` rather than querying `getDrafts()`
    independently. Audited and fixed the remaining 5 instances of the
    same shape found by the same grep: `acknowledgeMyResult()` (the "6.
    ผลประเมิน" employee-acknowledge action — critical, since it directly
    *mutates* `d[d.length-1]` in place; picking the wrong stale draft
    here would have silently corrupted the wrong record),
    `overrideEmployeeGrade()` (Admin's manual grade override, #155 —
    same direct-mutation risk), `renderCycleParticipantsList()` (#146's
    Cycle History participant list, code+cycle only), and two with no
    cycle filter at all — `getNineBoxData()` (Dashboard 9-Box) and
    `renderDashboardWorkflowSteps()` (Dashboard step counts) — both
    widened to also scope by `getCurrentEvalCycleYear()` before picking
    a draft, not just deduped by rank. `onIdpEmpChange()` (IDP modal's
    grade-default lookup, code-only, no mutation, cosmetically low
    stakes) was fixed too for consistency, with a defensive
    `typeof findCurrentCycleDraft==='function'` fallback since it runs
    very early in the file before the helper is guaranteed defined.
    Left every other `drafts.find(...)`/`.find(d=>draftKey(d)===key)`
    call site unchanged — each of those already matches by the full
    composite key (code+cycle+level, or `draftKey()` directly), which
    is inherently safe since `draftKey()`'s three parts together are
    the real natural key with no ambiguity left to resolve. Verified
    with the new queue-page reproduction test plus a full re-run of all
    of #162's own tests (team page, countTeamPending, the original
    duplicate-Excel-row reproduction) and the standard click-sweep (`nav
    pages clicked: 22 errors: []`), all passing with zero regressions.
    General lesson sharper than #162's own conclusion: when a bug
    pattern (`.find()` picking the wrong draft among same-code
    duplicates) is found and fixed at one call site, grep the *exact
    same pattern* — not just the one function the user's screenshot
    happened to show — across the entire file before considering the
    class of bug closed; `buildTierRoster()` is this file's single
    highest-traffic consumer of `getDrafts()` (every review/approval
    queue funnels through it) and would have kept reproducing the
    user's exact symptom indefinitely even with #162's own fix fully
    deployed and even with all browser caching definitively ruled out,
    since the two bugs lived in genuinely different functions that both
    happened to produce the identical visible symptom on different
    pages of the same workflow.

164. **User's screenshot of a reviewer form opened from "2. ประเมินทีมงาน"
    showed the previous evaluator's real comment correctly pulled in
    ("ผู้ประเมินรอบแรก" with real strength/development text), but every
    factor row unscored — "รวมคะแนนดิบ 0 / 100", Y=0.00, X=30.00 (Z
    only) — "ยังเหมือนเดิมระบบดึง comment มา แต่ไม่ได้ดึงคะแนนประเมินมา"
    (still the same — the system pulls the comment but not the score).**
    Traced `restoreReviewerFormFromDraft(lv, empCode, cycle)` (#109):
    its lookup is `getDrafts().find(d => d[0]===empCode && d[2]===cycle
    && d[3]===lv)` — matching the **full** composite key including
    level, which is inherently safe per #163's own stated exemption
    ("every `drafts.find` matching the full composite key needs no
    fix"). That exemption was correct about the *lookup itself* — the
    real bug was one layer earlier, in what `lv` the call site actually
    passed in. `renderTeamFromMaster()`'s row button computed
    `realLevel = getAssignedEvalLevel(u) || inferLevelFromPosition(u[7])`
    **fresh on every render**, with zero regard for what level the
    employee's *already-saved* draft (`d`, the very record this exact
    row was already matched to a few lines above for its status column)
    was actually stored under. If Admin's assigned `evalLevel` changed
    *after* the draft was first created — or the draft was created
    before #110's own fix, back when the team page still guessed the
    level from job-title keywords — `realLevel` and the real `d[3]`
    silently diverge, and `restoreReviewerFormFromDraft()`'s exact-match
    lookup finds nothing. `buildPrevCommentsHtml()` (#131), by contrast,
    keys only by `empCode|cycle` with no level component at all, so it
    kept working regardless — explaining exactly why the comment showed
    up while every score stayed blank, which read as two unrelated bugs
    but was one: a level mismatch that only breaks the *level-keyed*
    half of the form.
    Fixed by preferring the already-saved draft's own real level over a
    freshly recomputed one: `withStatus`'s mapped objects now also carry
    `d` (previously dropped after computing `status`/`X`/`discipline`),
    and the row button computes `openLevel = d ? d[3] :
    (getAssignedEvalLevel(u) || inferLevelFromPosition(u[7]))` — real
    stored data wins whenever a draft already exists; the live-computed
    guess is only used for an employee who has never been evaluated at
    all yet, the one case where there's no stored level to defer to.
    Reproduced the exact symptom with a Playwright test that assigns an
    employee's *current* `evalLevel` as `'of'` while seeding a real
    saved draft under level `'op'` (simulating an assignment changed
    after the fact) — confirmed the pre-fix code opens the form with
    `'of'` (the wrong, freshly-guessed level) and the post-fix code
    opens with `'op'` (the real stored level, matching the draft) — plus
    a second end-to-end test clicking the real row button and confirming
    `#reviewRaw`/`#reviewY`/`#reviewX` all populate with real nonzero
    numbers after the fix, where the identical test against the pre-fix
    code (via `git stash`) reproduces `raw=0, Y=0.00` exactly matching
    the screenshot — plus the standard click-sweep (`nav pages clicked:
    22 errors: []`) and a full re-run of #162/#163's own tests with zero
    regressions. **Deliberately left every other `openReviewerForm()`
    call site unchanged** — the 5 queue-page call sites (L1/L2/GM/
    Calibration/Approve, `buildTierRoster()`'s own roster rows) already
    pass `${d[3]}` straight from the matched draft object itself, never
    recomputing a level independently, so they were never at risk of
    this exact mismatch; only the team page's own row (which computes a
    level from the employee's *current* assignment rather than reading
    it off the row's own already-looked-up draft) had the gap. General
    lesson sharper than #163's own "every `drafts.find` matching the
    full composite key is inherently safe" conclusion: that's true for
    the *lookup function itself*, but a composite-key lookup is only as
    good as the key it's given — when a *call site* recomputes one part
    of that key (here, `lv`) independently of a record it already has
    sitting right next to it in scope, the lookup can fail with zero
    error even though its own logic is completely correct; whenever two
    different pieces of a form (a level-keyed half and a level-agnostic
    half) show inconsistent restore behavior, suspect a key-construction
    mismatch at the *caller*, not a bug in the restore function both
    halves nominally share.

165. **Follow-up to #164: user reported "ยังเหมือนเดิม" (still the same)
    on the identical symptom — comment restores, scores don't — even
    after the level-mismatch fix was deployed. Re-verified from scratch
    rather than guess a 4th time blind (per #100/#149-152's own
    established discipline): confirmed the real subtitle text on the
    user's screenshot, "พนักงานปฏิบัติการ — งานสำนักงาน," is the exact
    `label` string for `SML_FORMS.of` (checked directly against the
    source), and "รวมคะแนนดิบ 20" matches `of`'s real default
    (unoverridden) total weight (3+3+3+2+2+2+2+1+1+1=20) — proving the
    level genuinely *was* already `'of'` with no mismatch for this
    specific record, meaning #164's fix, while a real and separately
    valid fix, was never the actual cause of this particular report.**
    Read `restoreReviewerFormFromDraft()` line by line for any remaining
    logic bug (button-matching substring collisions, a wrong `LEVEL_CONFIG`
    reference, a possible `loadFormOverrides()` weight drift) — found
    nothing conclusively wrong in the code itself, and confirmed via
    test that the exact same restore path works correctly end-to-end
    with realistic `'of'`-level data under default weights. With no
    further code-reading able to pin down the cause and no access to the
    user's actual live `localStorage`/Excel data to inspect directly,
    guessing a specific root cause a fourth time risked repeating the
    exact same "ship a fix, still broken" cycle this conversation was
    already three rounds into. Took the diagnostic-by-design approach
    this file has already proven out twice (#129's banner-wording fix,
    #142's `diagnoseResolverGaps()`): rather than silently failing when
    nothing restores, `restoreReviewerFormFromDraft()` now returns a
    real diagnostic object (`{found, matched, total, mismatches,
    draftRaw}`) instead of nothing, and `openReviewerForm()` renders a
    visible `al-w` warning banner at the top of the form whenever
    restoration is incomplete, distinguishing the two genuinely
    different real causes a blank form can have: (1) **no matching
    draft at all** for the exact `empCode|cycle|level` the form opened
    with — states the real code/cycle/level values used, so a mismatch
    against what the user sees in Excel is immediately checkable; (2)
    **a draft was found, but one or more factor's raw value doesn't fit
    any grade for that factor's *current* weight** — states, per factor,
    the real stored raw number against the real current weight's valid
    score range (e.g. "ค่าดิบ 999 ไม่ตรงกับช่วงคะแนนของน้ำหนัก 3 ที่ใช้
    อยู่ตอนนี้ (15/14/13/12/11)"), plus the complete raw array as stored,
    so the exact real numbers are visible on screen without needing
    DevTools or a screen-share — directly actionable evidence for either
    this agent's next diagnosis or HR's own report to Admin. Verified
    with a Playwright test covering all three states: a clean, fully-
    matching draft shows **no** banner at all (never alarms when nothing
    is wrong — #129's own "don't overstate severity" rule applies here
    too); a draft with values that don't fit any grade for their factor's
    weight shows the mismatch banner naming the real raw values and
    weight ranges; no draft at all shows the not-found banner naming the
    real code/cycle/level that was searched for — plus full re-runs of
    #163/#164's own tests and the standard click-sweep (`nav pages
    clicked: 22 errors: []`) with zero regressions. **This does not
    claim to have found or fixed the user's actual root cause** — it
    converts an invisible failure into a visible, specific diagnosis;
    the next real step is reading whatever this banner now says on the
    user's own screen (a wrong level/cycle value, or specific raw-vs-
    weight mismatches per factor) and using *that* real evidence —
    rather than another round of code-reading speculation — to fix
    whatever it actually names, the same honest escalation #142 already
    took for the review-filter dropdown's empty-list reports. General
    lesson sharper than #142's own conclusion: when a report survives a
    second genuinely-reasoned fix attempt with the identical symptom,
    and further code-only investigation stops turning up new candidate
    causes, the responsible move is not a third guess — it's making the
    failure diagnosable *in the user's own hands*, since at that point
    the fastest real progress comes from the next report carrying actual
    evidence (specific numbers, specific mismatches) instead of another
    "still the same" with no new information to narrow the search.

166. **User's screenshot of "ผังองค์กร & พนักงาน" — logged in with her own
    real PIN as an L2 (confirmed via one clarifying question, ruling out
    the #72 Demo-UI-preview distinction) — showed 47 company-wide
    employees including AGM/MD and other divisions entirely outside her
    team: "ทำไมเห็นของทีมอื่นด้วย ผลประเมินไม่มีการดึงข้อมูลจาก Excel มา
    แสดง" (why do I see other teams too, and the results aren't pulled
    from Excel to show).** Confirmed `renderOrg()` itself was NOT the
    problem — it already correctly filters through `getMyScopedEmpCodes()`
    since #73. Traced the one real chokepoint every other page-specific
    render function in this file funnels through — the `.nav-item`
    click dispatcher (the same `if(p==='...')` list #58/#85/#92/#128
    have all extended before) — and found **no `p==='org'` entry at
    all**. `renderOrg(MASTER_USERS)` is only ever called once, from the
    page-init `setTimeout(...,150)` that fires immediately on script
    load — **before** `CURRENT_SESSION_USER` is set (so
    `getMyScopedEmpCodes()` returns `null`/unrestricted at that exact
    moment) and **before** the silent MS365 sync chain
    (`doLogin()`/`tryRestoreSession()`, #32/#33) has pulled real Excel
    data into `MASTER_USERS` at all — meaning the table is a permanent,
    unscoped snapshot of the hardcoded demo baseline, frozen from before
    anyone logs in, regardless of who later navigates to the page or
    what role they have. This explains **both** halves of the one
    report at once: "เห็นของทีมอื่น" (the stale snapshot was rendered
    with scope `null`, since nobody was logged in yet) and "ไม่ดึงจาก
    Excel" (the stale snapshot predates the real sync too — the rows
    shown are literally the file's own built-in demo employees, never
    real synced data). The nav item itself is hardcoded `data-role=
    "admin"` (#51's original scope), but this specific deployment's
    Admin had evidently broadened `NAV_PERMS['org']` via the nav-
    permission editor (#64) to also let `l2` reach it — a real, en-
    route-normal admin customization that nonetheless exposed a latent
    bug nobody had hit yet, since every *previous* visitor to this page
    was admin/sysadmin/exec, for whom "unscoped" was already the
    correct answer regardless of when the stale render happened, which
    is exactly why this specific gap survived #73's own scoping fix
    undetected until a real non-admin role could actually open the page.
    Fixed by adding the missing dispatch entry — `if(p==='org'){
    renderOrg(MASTER_USERS); checkHierarchyIssues(false); }` — the same
    pattern every other page-specific render in this list already uses,
    so navigating to the page always re-renders from the real, current
    `MASTER_USERS` (post-sync) through the real, current
    `getMyScopedEmpCodes()` (post-login), instead of showing whatever
    was true 150ms after the page first loaded. Verified by simulating
    the real-world condition (widened `NAV_PERMS['org']` to include
    `l2`, matching what this deployment evidently already has) and
    clicking the real nav item: pre-fix shows all 18 demo-baseline
    employees unscoped (reproducing the exact symptom — company-wide
    data, visibly not the real synced data); post-fix shows exactly the
    logged-in L2 and her one real direct report — plus full re-runs of
    #163-#165's own tests and the standard click-sweep (`nav pages
    clicked: 22 errors: []`) with zero regressions. General lesson
    sharper than #73's own conclusion: a scoping fix inside a shared
    render function (`renderOrg()`) is only as good as how often that
    function actually re-runs — if its *only* call site is a one-time
    page-init render that fires before login/sync ever complete, the
    scoping logic can be perfectly correct and still produce a
    permanently wrong result, because it never gets a second chance to
    run with real data in scope; whenever a nav-gated page's default
    `data-role` gets broadened to a new role via the admin-configurable
    `NAV_PERMS` system (#64), check whether that page's own render
    function is wired into the nav-click dispatcher at all — a page
    that was previously safe to leave un-dispatched (because only
    always-unrestricted roles could ever reach it) stops being safe the
    moment any restricted role gains access to it through that same
    configurable permission system.

167. **User's screenshot showed #165's own "not found" banner working
    exactly as designed — "ไม่พบใบประเมินที่บันทึกไว้ตรงกับเงื่อนไข (รหัส
    90526 · รอบ 2569 · ระดับ of)" — then replied "แต่มีใน Excel ตามที่
    เคยส่งให้ดู" (but it's in Excel, as I already showed you).** This
    confirmed the real composite key the banner reports (code/cycle/
    level) matches what the real Excel data for this employee has always
    had, per #162's own earlier investigation of this exact person's
    real duplicate rows — so the banner correctly identified *that*
    nothing matches locally, but not yet *why*: whether this device's
    local copy (1) genuinely has zero record for this employee at all
    (sync never reached this device/session), or (2) has a record, just
    filed under a different cycle/level than expected (a residual
    leftover of the exact shape #162/#163 already found and partially
    hardened against). These two causes need different real next steps
    (re-run a sync, vs. report the specific stale key found) — the
    original #165 banner couldn't distinguish them. Extended
    `restoreReviewerFormFromDraft()`'s diagnostic one layer further:
    when the exact composite-key lookup finds nothing, it now also
    searches `getDrafts()` for **any** record matching just the employee
    code (ignoring cycle/level) and returns the real cycle/level/status
    of every match found. `openReviewerForm()`'s banner now reports
    either the real list of what *was* found locally under which
    cycle/level/status (so a genuine stale-key mismatch is immediately
    visible and comparable against the real Excel row), or an explicit
    "ไม่พบรหัสพนักงานนี้ใน local เครื่องนี้เลยแม้แต่รายการเดียว" (zero
    records at all for this code) with a direct suggestion to re-run the
    sync — the same "diagnose, don't guess a fifth time" discipline
    #129/#142/#165 already established, pushed one more concrete step
    toward a real, actionable answer rather than stopping at "not
    found." Verified with two Playwright cases: one seeding a real local
    draft for the test employee under a deliberately different cycle/
    level (reproducing exactly the #162-shaped "stale local key" cause)
    confirms the banner reports the real cycle/level/status that *was*
    found; one with zero local drafts for the code at all confirms the
    banner reports the "never synced to this device" case distinctly —
    plus full re-runs of #163-#166's own tests and the standard
    click-sweep (`nav pages clicked: 22 errors: []`) with zero
    regressions. **Still not a claimed fix** — exactly like #165, this
    converts one more layer of "invisible" into "visible, specific
    evidence"; the real next step is reading what this expanded banner
    now actually says for the real record on the user's own screen
    (zero local records at all, vs. a specific stale cycle/level that
    was found) and acting on whichever of the two it turns out to be.
    General lesson sharper than #165's own conclusion: a first
    diagnostic pass that correctly narrows "found vs. not found" is not
    automatically specific enough to act on — when the "not found"
    branch itself still has more than one real underlying cause (sync
    never ran, vs. sync ran but under a different key), keep extending
    the same diagnostic rather than guessing which of the remaining
    causes is more likely; each layer of real, on-screen evidence moves
    the next report closer to something directly actionable instead of
    another round of "still the same."

168. **User asked two things in one short follow-up: first, a factual
    question — does reviewer-entered grade data come from the
    `Appraisals` sheet, and do comments come from `Approvals`? — then
    "มีวิธีแก้ไขยังไง" (how can this be fixed).** Answered the first
    directly from code (both confirmed exactly as asked — scores via
    `saveEvaluationToMs365()`/`submitReviewerForm()`/
    `confirmCalibration()` push/pull through `cfg.evaluationTable`
    ='Appraisals'; comments via `pushApprovalRecordToExcel()`/
    `ms365SyncEvalComments()` folded into the `Approvals` table's
    Comment column, no separate table) — and pointed out the real
    operational difference this explains: `Approvals` is append-only
    (so a prior reviewer's comment always keeps showing even when the
    current sync hasn't caught up), while `Appraisals` is upsert-keyed
    (so a missed/stale sync makes the score vanish entirely, exactly
    the #165-#167 symptom). For "how to fix": #165/#167's diagnostic
    banners already *named* the real cause (no local record for this
    employee at all, vs. one found under a different cycle/level) but
    gave the user no way to actually act on either cause without
    leaving the page — closed that gap by adding a real "🔄 Sync จาก
    Excel แล้วลองใหม่" button directly inside the "not found" banner,
    wired to a new `retrySyncAndReopenReviewer(lv,name,code,position,
    cycle)`: calls the real `ms365SyncAppraisals(false)` (non-silent,
    so a genuine success/failure toast shows — #69's own established
    convention for a user-triggered action, as opposed to the usual
    silent background sync), re-renders the workflow pages, then
    re-opens the same reviewer form with the same identity so the
    result is visible immediately in the same place the diagnosis was
    shown, with zero navigation required. Deliberately did **not** add
    a similar button to the "found but values mismatch" banner (#165's
    second case) — re-syncing can never fix a genuine raw-value/weight
    mismatch, since the problem there isn't staleness, it's a real data
    shape disagreement that needs Admin to look at the actual numbers;
    offering a sync-retry button there would imply a fix that wouldn't
    actually do anything, the same honesty rule CLAUDE.md #10 already
    establishes for not offering an action that doesn't work. Verified
    with a Playwright test that opens the form for an employee with
    zero local drafts (confirms the retry button renders inside the
    banner), then mocks a real Excel row becoming available and clicks
    the actual button: confirms the banner clears and the real scores
    (raw=88, matching the mocked row) restore correctly in the same
    modal — plus full re-runs of #163-#167's own tests and the standard
    click-sweep (`nav pages clicked: 22 errors: []`) with zero
    regressions. General lesson sharper than #165/#167's own
    conclusion: a diagnostic banner that correctly names a fixable
    cause (data just hasn't synced to this device yet) is only half the
    job — when the fix for that specific cause is a single, safe,
    already-existing action (re-running a sync function the app already
    has), wire a real button to it right where the diagnosis is shown,
    rather than describing the remedy in prose and expecting the user
    to go find the control themselves on a different page; reserve the
    prose-only, "report this to Admin" treatment for causes that
    genuinely have no one-click remedy (a real data mismatch needing
    human judgment), so a button is never offered for something it
    can't actually solve.

172. **User saw the L3 ("สอบทานผู้จัดการส่วน") queue page showing Grade "B"
    for all 5 rows and asked a design question: "เพื่อไม่ให้พนักงานหรือ
    หัวหน้า < L3 เข้าใจผิด ควรซ่อนเกรดนี้ไว้ไหม" (to stop employees or
    supervisors below L3 from misreading this as final, should this grade
    be hidden). First explained this specific case wasn't a bug at all —
    the badge is `gradeFromX(X)`, the deliberately-kept "ชั่วคราว"
    (provisional) absolute-threshold grade #155 already documented as
    existing purely to give a mid-pipeline display value before the real
    Bell Curve grade is computed at Calibration; 5 people landing in the
    same 80-89 band is coincidence, not staleness. Recommended labeling
    it as provisional rather than hiding it outright — hiding removes a
    useful at-a-glance signal for the reviewer actually doing the work,
    while the real risk is only that the same A-E letter looks identical
    to a final grade to anyone else who happens to see the page. User
    confirmed the labeled approach.
    Added one shared helper, `provisionalGradeCell(grade)` (next to
    `gradeFromX()`), rendering the existing `.grade g${grade}` badge with
    a `title` tooltip stating plainly it's provisional and naming where
    the real grade comes from, plus a small "(ชั่วคราว)" caption under it
    — the same `<span class="grade...">...</span><br><small>...</small>`
    shape `runBellCurveCalculation()`'s own real-grade-preview cell
    already uses, so provisional and real grade cells read consistently
    even though only one of them is actually final. Wired into all 4
    stages where the value shown is still `gradeFromX()`, never the real
    Bell Curve result: `renderReviewL1Queue()`, `renderReviewQueue()`
    (L2/L3), `renderGmApproveQueue()`, and `renderCalibQueue()`'s own
    per-row cell for a record that hasn't had Bell Curve run on it yet
    (8 call sites total — each queue has a `ready`-state row and a
    `done`-state row that both display the same field). **Deliberately
    left untouched**: `renderApproveQueue()` (AMD/MD's final approve
    queue, roster built from `'Calibrated'` status) — by that stage
    `confirmCalibration()` has already overwritten the draft's grade
    with the real Bell Curve result, so the badge there is genuinely
    final and labeling it "provisional" would be dishonest in the other
    direction; `runBellCurveCalculation()`'s own result cell (already
    the real computed preview, about to be saved verbatim); the Dashboard's
    grade-distribution bars and IDP table (both filtered to
    `Calibrated`/`Approved` records only, i.e. already real); and
    `renderMyResult()` ("6. ผลประเมิน"), which already solved this exact
    problem for the employee's own page a different way back in #156 —
    hiding the letter behind a 🔒 until `isFinalStatus()`, since an
    employee has no reason to see *any* grade, provisional or not,
    before MD's real sign-off. Verified with a Playwright test driving
    one real draft through Submitted→L1Reviewed→L2Reviewed→Acknowledged
    →Calibrated and checking each stage's queue page: the provisional
    label appears at L1/L2/GM/pre-bell-curve-Calibration, and is
    correctly absent once the record reaches the real post-Calibration
    Approve queue (which still shows a real `.grade` badge, just without
    the "ชั่วคราว" caption) — plus full re-runs of #165/#167/#168/#169/
    #170/#171's own existing tests and the standard click-sweep (`nav
    pages clicked: 22 errors: []`), all with zero regressions. General
    lesson: when a user's own wording offers two options ("should we
    hide this"), the better fix is sometimes a third option that keeps
    the useful part of the current behavior while closing the real risk
    named in the question — confirm the narrower option with the user
    before implementing, since "hide" and "label clearly" solve the same
    complaint with very different costs to the people who still need
    the information.

173. **User asked for three things in one message: let employees acknowledge
    their GM-approved result via LINE too (not just the web app), show which
    channel (web/LINE) they used right on the printed signature line, and
    let employees download their own evaluation PDF to keep. Asked three
    clarifying questions first, since each had more than one reasonable
    shape: confirmed LINE acknowledgment should work as a real button
    tapped directly inside the LINE chat (not a link that opens the web
    app), confirmed the channel should show on the printed signature line
    plus Audit Log only (not a separate UI badge), and confirmed "save" means
    downloading the existing printed-PDF flow, not a new export format.**
    **LINE in-chat acknowledge**: `notifyEmployeeOfApproval()` (fired
    automatically from `approveGmSelected()`, #61) now sends LINE alongside
    email, independently best-effort (same honesty rules as every other
    email in this file, #26/#40/#58 — its return shape changed from a flat
    `{sent,reason}` to `{email:{...}, line:{...}}`, with
    `approveGmSelected()` updated to count each channel separately rather
    than conflating them into one "notified" number). The LINE message is a
    real Buttons Template (`POST /send-line-ack`, a new Worker endpoint —
    deliberately **not** reused through the existing `/send-line` endpoint,
    since that one is a true multicast broadcasting the *same* text to many
    people, while this needs one personalized message per employee with
    their own `empCode`/`cycle` embedded in a `postback` button's `data`)
    sent via a new `pushLineMessage()` (LINE's single-recipient `/v2/bot/
    message/push`, distinct from `sendLineMulticast()`'s `/multicast`).
    Tapping the button fires a real LINE `postback` event back to
    `/webhook/line` — `handleLineEvent()` now dispatches `ev.type==='postback'`
    to a new `handleLineAckPostback()`, entirely separate from the existing
    text-message registration flow (#148), which: (1) verifies the real
    LINE `userId` that tapped the button matches the `LineUserId` already
    registered for that `empCode` in `EmployeeSettings` (never trusts the
    postback data alone — someone forwarding/screenshotting a button could
    otherwise fake an ack for someone else), (2) reads the real `Appraisals`
    row for that `empCode`+`cycle`, requires it to be exactly `'GMApproved'`
    (same guard `acknowledgeMyResult()` uses client-side) before writing
    `'Acknowledged'` back via `upsertRow()` (full-row PATCH, every other
    column untouched), (3) appends a real `Approvals` log row via `addRow()`
    with the comment `'รับทราบผลการประเมินผ่าน LINE'` — the honest marker
    the web side later parses to know the channel — and (4) always replies
    in the same chat with a real outcome (saved / already-acknowledged /
    not-found / error), never silence, following this file's own
    #149/#150/#151 "never let a fire-and-forget webhook step swallow its
    own failure" discipline from the start rather than needing a follow-up
    fix. A local `EVAL_STATUS_ORDER` + `evalStatusRank()` were added to the
    **Worker** file too, explicitly commented as needing to stay
    byte-for-byte in sync with the client's own array — the same
    CLAUDE.md #41 "two copies in two files that can't share code" caution
    `rowMatchesUpsertKey()` already established, now applied to a status
    ordering instead of a key-matching function. All of this happens
    entirely server-side — the web client has no way to know it happened
    until the next sync.
    **Channel tracking**: new `ACK_CHANNEL_KEY` local store (same
    `empCode|cycle` key shape as `APPROVAL_SIGNATURE_KEY`/`EVAL_HR_NOTE_KEY`,
    #39/#96 — never appended to the draft array itself, since `d[d.length-1]`
    etc. are positional and load-bearing everywhere). `acknowledgeMyResult()`
    (the web button) now sets it to `'web'` immediately — no need to wait
    for a sync, since it's the same device — and its own `Approvals` push
    comment changed from `'รับทราบผลการประเมินโดยพนักงานเอง'` to add
    `'(ผ่านเว็บ)'`, giving the two channels distinct, greppable markers in
    the same Comment column (`'ผ่าน LINE'` vs `'ผ่านเว็บ'`) with no prefix
    collision against #96/#131/#39's own existing markers in that same
    column. New `ms365SyncAckChannel(silent)` mirrors
    `ms365SyncApprovalSignatures()`/`ms365SyncHrNotes()` structurally —
    reads `Approvals`, filters `step==='Acknowledged'`, checks the comment
    for either marker — wired into both silent-sync groups right next to
    its siblings. `_sign()` (the shared signature-box renderer behind both
    `printEvalForm()`'s and `buildEvalPrintPage()`'s "ส่วนที่ 4 ลงนามผล"
    grid, #121/#122/#123) gained an optional 6th `channelLabel` parameter —
    appends `" (เว็บ)"`/`" (LINE)"` to the existing "✓ ยืนยันแล้ว" chip only
    for the employee-acknowledge row (the only one of the 4 signature lines
    with a real channel concept at all — L1/L2/final-approver never pass
    this param, so they're completely unaffected), and omits the
    parenthetical entirely — never a blank `"()"` or a guessed channel —
    for any record acknowledged before this feature existed, where no
    channel was ever recorded (CLAUDE.md #14's honest-empty-state rule).
    **Download PDF**: added a `📄 ดาวน์โหลดใบประเมิน PDF` button directly
    in `renderMyResult()`'s own banner (next to the existing "✅ รับทราบผล
    การประเมิน" button) calling the exact same `printSingleDraft(code,
    cycle, level)` every other PDF button in this file already uses (#120/
    #121) — no second print path, `window.print()`'s own "Save as PDF"
    destination is the honest save mechanism (this app has no server to
    generate/host a real downloadable file, same architectural limit
    CLAUDE.md #8/#25 already state for everything else). Shown any time the
    page has a real visible result (`hasVisibleResult()`, same gate the
    banner itself is already behind), not just once acknowledged.
    Verified with a Node test mocking the full Worker Graph-auth/site/rows
    chain plus the LINE API, covering the real `/send-line-ack` endpoint
    (confirms it builds a genuine Buttons Template with the real employee's
    `code`/`cycle` embedded in the postback `data`, addressed to the one
    real `userId`, not a multicast) and the postback webhook path (a real
    `GMApproved`→`Acknowledged` update with the Approvals log row carrying
    the real "ผ่าน LINE" marker and a correct success reply; a mismatched
    LINE `userId` is refused with zero write; an already-acknowledged
    record replies honestly without re-patching) — plus a Playwright test
    confirming `acknowledgeMyResult()` sets the local channel to `'web'`
    and the draft really advances, `_sign()` renders the channel
    parenthetical correctly (and omits it correctly when there's no
    channel on file), `ms365SyncAckChannel()` correctly parses a mocked
    `"ผ่าน LINE"` comment, the real download-PDF button renders with the
    correct `printSingleDraft()` arguments, and `notifyEmployeeOfApproval()`
    genuinely calls both `/send-mail` and `/send-line-ack` independently
    and returns the new per-channel result shape — plus the standard
    click-sweep (`nav pages clicked: 22 errors: []`) and re-runs of
    `test_line_webhook.js`'s existing 8 cases (unaffected — the postback
    dispatch is a brand-new branch, the existing text-message registration
    flow is untouched) and `test_empcode_type.js`/`test_provisional_grade.js`
    with zero regressions. **This changes the Worker's own code** (the new
    `/send-line-ack` endpoint, `pushLineMessage()`, `handleLineAckPostback()`,
    the postback dispatch in `handleLineEvent()`) — per CLAUDE.md #41/#106/
    #147/#148's own established precedent, **it needs a real redeploy**
    before any of the LINE-acknowledge flow has live effect; the channel-
    tracking and download-PDF pieces are purely client-side and go live
    the moment GitHub Pages updates, same as any other client-only fix in
    this file. General lesson combining #96/#131/#147/#148: when a request
    bundles "add a second channel for an existing action" with "and track
    which channel was used," the channel marker belongs in whichever
    shared log/comment column the action already writes to (reuse the
    established `Approvals`-comment-marker pattern), not a new Excel table
    — and a server-side action (a LINE postback handled entirely inside
    the Worker, with no client involved at all) still needs the exact same
    identity-verification and silent-failure discipline this file already
    demands of every client-side write, just implemented once more in a
    second language-adjacent codebase that can't share functions with the
    first.

174. **Follow-up to #173: right after the LINE in-chat acknowledge feature
    shipped, user flagged a real design gap in it — "ก่อนพนักงานกดรับทราบ
    พนักงานเหนผลการประเมินตนเองก่อน" (before the employee clicks
    acknowledge, the employee must see their own evaluation result
    first).** The web flow already satisfied this correctly —
    `renderMyResult()` shows the real X/Y/Z breakdown (grade letter still
    locked per #156/#161) on the same page as the "✅ รับทราบผลการประเมิน"
    button — but the LINE Buttons Template `/send-line-ack` builds (#173)
    sent only generic text ("ผลการประเมินของคุณรอบ ... ได้รับการอนุมัติจาก
    GM แล้ว ... กดปุ่มด้านล่างเพื่อรับทราบ") with zero real score data, so
    an employee could tap the postback button directly in LINE chat and
    acknowledge without ever seeing their actual numbers — the one real
    asymmetry between the two newly-parallel channels.
    Fixed by threading the real Y/Z/X values all the way from the one
    place they're already in scope through to the LINE message text:
    `approveGmSelected()` (the only real call site of
    `notifyEmployeeOfApproval()`) now extracts `Y=d[d.length-5]`,
    `Z=d[d.length-4]`, `X=d[d.length-3]` from each real draft `d` — the
    same positional convention `renderMyResult()`/`getReportData()` already
    use — and passes them as 3 new parameters.
    `notifyEmployeeOfApproval(empCode, empName, cycle, Y, Z, X)` forwards
    them into **both** channels, not just LINE: the email body (previously
    only said "go check the web page") now states the real
    Y/Z/X numbers directly too, with an honest note that the grade is
    still locked until Calibration/MD approval — matching the exact
    #156/#161 grade-hiding rule rather than contradicting it. The Worker's
    `/send-line-ack` endpoint now accepts `Y`/`Z`/`X` in its request body
    and builds the Buttons Template's `text` field as
    `"ผลการประเมินของคุณรอบ {cycle} ได้รับการอนุมัติจาก GM แล้ว\nY=.. Z=..
    X=..\n(เกรดจะแสดงหลัง Calibration และอนุมัติขั้นสุดท้ายจาก MD)\nกดปุ่ม
    ด้านล่างเพื่อรับทราบผลได้ทันที"` — the real numbers are visible in the
    chat message itself, before the button is ever tapped, with a
    defensive length-cap (`slice(0,157)+'...'`) respecting LINE's own
    ~160-character limit on this field; when no score is supplied (an
    older client, or a genuinely missing value) the score line is simply
    omitted rather than showing a fabricated `Y=0.00`/etc. (CLAUDE.md
    #14's "don't fabricate a value you can't be sure of" rule). The
    postback button's own `data` payload (`action=ack&code=..&cycle=..`)
    and `handleLineAckPostback()`'s real identity-verification/status-
    update logic (#173) needed zero changes — this fix only changes what
    the employee is shown *before* tapping, never what the tap itself
    does. Verified with a Node test against the real Worker endpoint
    confirming the message text contains the real Y/Z/X values, never
    mentions a grade letter, states the grade is still locked, and stays
    within LINE's character limit — plus a second case confirming no
    score is fabricated when none is supplied — plus a Playwright test
    driving the real UI path end-to-end (ticks a real `.gm-chk` checkbox,
    calls the real `approveGmSelected()`, confirms the real draft's Y/Z/X
    are the exact values forwarded to the mocked `/send-line-ack` call) —
    plus full re-runs of #173's own existing tests (channel tracking,
    postback handling) and the standard click-sweep (`nav pages clicked:
    22 errors: []`), all with zero regressions. **This changes the
    Worker's own code**, so per CLAUDE.md #41/#106/#147/#148/#173's own
    established precedent it needs a real redeploy before the LINE
    message actually carries the real score in production — the
    client-side email-body change goes live the moment GitHub Pages
    updates, same as any other purely-client fix in this file. General
    lesson sharper than #173's own conclusion: when a feature is built to
    make two channels (web, LINE) do "the same real action," checking that
    both channels *perform* the action identically (#173's own identity-
    verification/status-update parity) is not the same as checking both
    channels show the *same real information* leading up to that action —
    a parity gap in what's displayed before an irreversible-feeling action
    (acknowledging a result) is just as real a bug as a parity gap in the
    action's own mechanics, and is exactly the kind of thing a user
    testing the brand-new feature catches within one message of it
    shipping.

175. **Follow-up to #174: user asked for even more — "แก้อยากให้พนักงานเห็น
    ผลการประเมินตนเอง ส่งแนบ pdf หรือ link ให้ดูและกดรับทราบ" (want the
    employee to see their own result — send either a PDF attachment or a
    link to view it, then acknowledge).** Asked one clarifying question
    first, since "ส่งแนบ PDF" isn't actually possible as stated: LINE's
    Messaging API has no message type for a bot to push an arbitrary file
    (PDF) to a user — only text/image/video/audio/template/flex — so a
    real PDF attachment was never on the table; the only honest option is
    a **link**. Confirmed with the user that the link should point
    "ลิงก์พิมพ์ PDF ตรงจากเว็บ" (straight to the web app's print page),
    which raised a real security question: a direct deep-link that opens
    someone's printed evaluation with no login at all would leak personal
    score data to anyone who forwards/screenshots the LINE message (LINE
    push messages are not access-controlled once sent). Resolved this by
    keeping the PIN gate fully intact — the link opens the real web app
    with the employee's code **prefilled** (never bypassing the PIN
    itself) and, only once a real PIN login succeeds *for that exact
    employee*, auto-navigates straight to "6. ผลประเมิน" (which already
    has the real Y/Z/X breakdown, the #173 download-PDF button, and the
    acknowledge button all on one page) — this satisfies "ลิงก์พิมพ์ PDF
    ตรงจากเว็บ" in spirit (one tap from the link to seeing/printing the
    real result) without the security regression a true unauthenticated
    deep-link would introduce.
    **New admin-configurable `appUrl` field** (`DEFAULT_MS365_CONFIG`,
    MS365 Proxy settings page, `ms365AppUrl` input) — deliberately left
    **empty** by default, unlike `workerUrl`/`workerApiKey`/`tenantId`/
    `clientId` which are safely baked in (#31): this app genuinely has no
    way to know its own real deployed URL (GitHub Pages path, a custom
    domain, Pages possibly not even enabled) — guessing one would be
    exactly the CLAUDE.md #14 "don't fabricate a value you can't be sure
    of" mistake, so Admin must type the real URL in once. When left
    blank, the LINE message simply omits the link button entirely (same
    "visibly work without the piece that's missing" honesty as #10/#105)
    — the existing in-chat postback acknowledge button (#173/#174) still
    works regardless.
    **Link construction**: `notifyEmployeeOfApproval()` builds
    `ackLink = cfg.appUrl + '?ackCode=' + empCode + '&ackCycle=' + cycle`
    (URL-encoded) and forwards it into **both** channels — the email body
    (previously only said "go check the web page," now includes the real
    clickable link) and the `/send-line-ack` Worker call's body. The
    Worker adds a second Buttons Template action (`type:'uri'`) alongside
    the existing postback button only when `ackLink` is a real `http(s)`
    URL (never trusts an arbitrary scheme like `javascript:` blindly —
    checked with a real regex before adding it as a clickable action).
    **Client-side wiring, two new pieces**: (1) a page-load script reads
    `?ackCode=` from `location.search` and prefills `#loginCode` (calling
    the existing `onLoginCodeInput()` so the datalist/autocomplete
    behaves exactly as if the employee had typed it) — PIN entry is
    completely untouched, still required every time; (2)
    `applySession()` (the one real chokepoint every successful login
    already funnels through, #32/#72/#90/#158) checks whether `?ackCode=`
    matches the **actually logged-in** user's own real code
    (`u[0]===ackCode`, not just "a param exists in the URL") before
    auto-navigating to the myresult page — a link meant for one employee
    opened by a different person who logs in as themselves never jumps
    to anyone else's result, closing the exact "a forwarded link exposes
    someone's score to the wrong viewer" risk this whole design was
    built around avoiding. Verified with a Node test against the real
    Worker endpoint confirming the uri action is added only with a real
    `http(s)` ackLink and omitted for none/garbage input, a Playwright
    test confirming `notifyEmployeeOfApproval()` builds and forwards the
    real link into both the LINE call and the email body when `appUrl`
    is configured (and sends a genuinely empty link, never a guessed
    one, when it isn't), and — the security-critical case — that opening
    the link's URL prefills the code field, that logging in as the
    *matching* employee auto-navigates to "6. ผลประเมิน", and that
    logging in as a **different** employee (link opened by the wrong
    person, who then logs in as themselves) never auto-navigates there
    at all — plus full re-runs of #173/#174's own existing tests and the
    standard click-sweep (`nav pages clicked: 22 errors: []`), all with
    zero regressions. **This changes the Worker's own code** (the new
    `uri` action branch in `/send-line-ack`), so per CLAUDE.md #41/#106/
    #147/#148/#173/#174's own established precedent it needs a real
    redeploy before the link button appears in LINE; the client-side
    `appUrl` field, email-body link, and login-page auto-navigation go
    live the moment GitHub Pages updates. **Told the user plainly**: she
    needs to type the real web app URL into the new "ลิงก์เว็บแอป SML
    PMS" field on the MS365 Proxy settings page and save it once — until
    she does, the LINE message still works exactly as before (#174's
    score-in-text + postback acknowledge), just without the extra "view
    full result" link button. General lesson: a feature request phrased
    as "send X" can turn out to describe something the underlying
    platform genuinely cannot do (LINE can't push files) — say so plainly
    and ask which of the real alternatives the user wants, rather than
    silently substituting one without asking; and when the chosen
    alternative is a deep-link into an authenticated app, the fix must
    preserve the authentication boundary (still require the real PIN,
    still verify the logged-in identity matches who the link was for)
    rather than treating "convenience" and "security" as a tradeoff to
    pick one side of.

176. **User's screenshot of a printed evaluation form's "ส่วนที่ 4 ลงนาม
    ผลการประเมิน" showed "ผู้ประเมิน (ผู้บังคับบัญชาโดยตรง)" and "ผู้ยืนยัน
    ผลการประเมิน (MGR.)" both correctly tagged "✓ ยืนยันแล้ว" — but with
    the signer's name underneath showing the literal placeholder "(—)"
    instead of a real name. Asked for: "รายงานแบบฟอร์มประเมินในแต่ละ
    ระดับที่ประเมินแล้ว ... ให้เพิ่มรายชื่อผู้ที่ลงนามประเมินแล้วด้วย"
    (for a form already reviewed at each level, add the real name of
    whoever signed).** Traced `_sign()`'s two L1/L2 call sites in both
    `printEvalForm()` and `buildEvalPrintPage()`: `signedName` was passed
    as `empL1`/`empL2` — `MASTER_USERS[9]`/`[10]`, the employee's own
    *org-chart chain field* naming who their supervisor generically is —
    never the actual person who clicked approve on this specific record.
    When that chain field is empty (a real, common case: #128's
    `skipEmptyReviewStages()` auto-skips a tier entirely when the
    employee has no real reviewer assigned there), `_sign()`'s own
    fallback (`signedName||officialTitle||''`) had nothing left to fall
    back to, so it rendered the chip "✓ ยืนยันแล้ว" (implying a real
    human confirmed it) right next to a blank "(—)" name — dishonest in
    two directions at once: claiming a signoff happened when the stage
    was really auto-skipped, and never showing the real name even on
    records where an actual person *did* review (since the chain-field
    name is a generic org fact, not "who actually did this review").
    **Built a real per-stage signer record**, the missing piece: added
    `EVAL_STAGE_SIGNERS_KEY` (key `empCode|cycle|step`, distinct from
    `EVAL_LAST_ACTOR_KEY` (#58) which only remembers the *most recent*
    actor and would be overwritten the moment a later stage runs — this
    new store keeps one entry per stage so an already-advanced record
    still shows who did L1Reviewed even after L2Reviewed has happened).
    `recordStageSigner()` is called from the one real chokepoint every
    stage transition already goes through, `pushApprovalRecordToExcel()`
    (right alongside the existing `recordEvalActor()` call — same real
    actor, same moment, zero new call sites to wire). `ms365SyncStageSigners(silent)`
    pulls the real signer back out of the *same* `Approvals` Excel table
    #39/#96/#131 already read/write (never a new table — a signer's name
    per stage is exactly the "ผู้อนุมัติ" column CLAUDE.md #97's fix
    already resolves honestly by employee code, just never read back for
    this purpose before), merging by keeping whichever row's real
    timestamp is newest per `(empCode|cycle|step)` — wired into both
    silent-sync groups (`doLogin()`/`tryRestoreSession()`) right next to
    `ms365SyncApprovalSignatures()`.
    `_sign()` gained an optional 7th `skippedNote` parameter
    (backward-compatible — every existing call without it behaves
    identically): when `ok` is true but there is neither a real recorded
    signer **nor** a chain-field name at all, it now renders a distinct
    "⏩ ข้ามขั้นตอน" chip with the real reason ("ไม่มีผู้สอบทานระดับนี้
    สำหรับพนักงานคนนี้") instead of the dishonest "✓ ยืนยันแล้ว (—)" —
    computed per call site from `resolveL1Reviewer(emp)`/
    `resolveL2Reviewer(emp)` (#128's own resolvers, reused rather than a
    fourth independent "does this person have a real reviewer" check per
    #126/#127/#130/#141's established discipline) returning `null`.
    Verified with a Playwright test driving the real UI path (seeds a
    real L1/L2 chain, logs in as each reviewer in turn, calls the real
    `pushApprovalRecordToExcel()` the same way the actual approve buttons
    do, never writes the signer store directly) confirming both
    `printEvalForm()` and `buildEvalPrintPage()` now show the real
    reviewer names on the printed signature grid, and a second case
    seeding an employee with zero real reviewers at any tier confirming
    the honest "⏩ ข้ามขั้นตอน" chip renders instead of a fake confirmed
    signoff — plus the standard click-sweep (`nav pages clicked: 17
    errors: []`), zero regressions. General lesson sharper than #39's
    own precedent: a signature line's "✓ confirmed" chip and its
    "(name)" title are two separate claims that must both be backed by
    real data — reusing a generic org-chart field as a stand-in for "who
    actually signed this specific record" works only until the chain
    field happens to be empty (which #128's own auto-skip feature made a
    normal, frequent case, not an edge case), at which point the honest
    fix is tracking the real per-stage actor (a field this file already
    resolves correctly everywhere else, #97) rather than patching the
    display to hide a blank value.

177. **Follow-up to #176: user asked "ตอนเรียกดูแบบฟอร์มก็เห็นใช่ไหม" (do
    we also see it when viewing the form on screen).** Honest answer at
    that moment was no — #176 only fixed the real signer names on the
    two *printed* outputs (`printEvalForm()`/`buildEvalPrintPage()`);
    the on-screen "ดูแบบฟอร์ม"/"สอบทานแบบฟอร์ม" modal (`openReviewerForm()`,
    #93/#109/#119, opened from every one of the 5 review/approval queues
    plus the team page) had **no signature section at all** — only a
    static, identical-on-every-form diagram ("ผู้ประเมิน → ผู้บังคับบัญชา
    ระดับสูง → ผู้จัดการทั่วไปฝ่าย → MD-SML") with zero real names or
    status, regardless of how far the record had actually progressed.
    Added `buildReviewerSignFlowHtml(code, cycle, lv)`, reusing the exact
    same `_sign()` function #176 just fixed (never a second signature
    renderer that could drift out of sync — the #30/#97/#121 "one
    function builds it, every caller goes through it" discipline) with
    the identical real-data sourcing (`getStageSigner()`,
    `resolveL1Reviewer()`/`resolveL2Reviewer()`, `getApprovalSignature()`,
    `ackChannelLabel()`) — so the on-screen modal and the printed PDF now
    show the exact same real reviewer names/status for the exact same
    record, never two different answers to "who signed this." Replaced
    the static approval-flow diagram in `openReviewerForm()`'s template
    with an empty `#reviewerSignFlow` placeholder, populated right after
    the modal's `innerHTML` is set (so the real draft/status lookup,
    identical to what `restoreReviewerFormFromDraft()` does a few lines
    below for score-restoring, runs once per open). Added a scoped
    `.reviewer-sign-flow` CSS override bumping `_sign()`'s print-tuned
    6–7pt font sizes up to a readable 11–13px for on-screen viewing
    (`!important`, deliberately — the pt-sized print rules have higher
    specificity and must stay untouched for the real A4 printed output,
    which still renders `.F-signs` bare with no wrapper class). Verified
    with a Playwright test that seeds a real L1/L2 chain, performs the
    real review actions via `pushApprovalRecordToExcel()` (the same
    chokepoint the actual approve buttons call, never writing the signer
    store directly), opens the real modal via `openReviewerForm()`, and
    confirms the on-screen signature grid shows the real L1/L2 reviewer
    names — plus full re-runs of #176's own print-path tests and the
    standard click-sweep (`nav pages clicked: 17 errors: []`), zero
    regressions. General lesson: when a fix adds a new real-data display
    to one output format of a record (here, the printed PDF), check
    whether the *same* record has a sibling on-screen view that shows
    related-but-stale information (the static approval-flow diagram) —
    a user noticing the fix in one place and asking "does the other
    place show it too" is exactly the signal that the fix's scope should
    have been "every place this fact is displayed," not just the one
    place the original screenshot happened to show.

178. **Follow-up to #177: user's screenshot of the newly-added on-screen
    signature section showed "ส่วนที่ 2 — ความคิดเห็นและแผนพัฒนา" followed
    directly by "ส่วนที่ 4 — ลงนามผลการประเมิน" — user asked simply
    "ส่วนที่ 3 ละ" (where's section 3).** This was a real numbering bug
    introduced in #177 itself, not a missing-content bug: `printEvalForm()`'s
    real printed form genuinely has 4 sections (factors=1, comments=2,
    a distinct "การอบรมพัฒนาบุคลากร (Training Needs)"=3, signatures=4),
    so when #177 added the signature grid to the on-screen reviewer modal
    I copied the "ส่วนที่ 4" label straight from the print output — but
    the on-screen modal has never had a Training Needs section (#121
    deliberately left it out, since it reads live `<textarea>` values with
    no per-draft storage), so the modal's own real section sequence is
    only 1 (factors) → 2 (comments) → signatures, with no section 3
    content anywhere in it. Confirmed via `grep -n "review-section-title"`
    that the modal literally renders "ส่วนที่ 1"→"ส่วนที่ 2"→"ส่วนที่ 4" with
    nothing in between. Fixed by renumbering the one mislabeled heading
    (line ~11024) from "ส่วนที่ 4" to "ส่วนที่ 3" — the modal's own correct,
    complete sequence. Verified with `node --check`-equivalent syntax
    validation, a full re-run of #176/#177's own existing tests
    (`test_stage_signers.js`, `test_printevalform_stage.js` — both still
    pass unaffected, since they only check for real signer names, never
    the section-number text) and the standard click-sweep (`nav pages
    clicked: 17 errors: []`), zero regressions. General lesson: when
    porting a UI section from one output format (a printed form with N
    real sections) into a second, deliberately-smaller output format (an
    on-screen modal missing one of those sections by design), never copy
    the first format's section *numbers* verbatim — renumber to match
    the second format's own real, complete sequence, or a gap appears
    that reads to the user exactly like missing content even though
    nothing is actually missing.

179. **Follow-up to #178: user asked to re-verify the whole thing —
    "ข้อมูลมีครบตามใบประเมินใช่ไหม สรุปมีกี่ส่วน 3 หรือ 4 ส่วน กลับไปทบทวน
    และแก้ไขทุกส่วนให้ถูกต้อง" (is the data complete per the real
    evaluation form, how many sections really — 3 or 4 — review and fix
    every section everywhere). #178 only fixed one of four real places
    this form's sections are rendered — grepping `ส่วนที่ [0-9]` across
    the whole file surfaced two more genuine numbering bugs, neither of
    them the one #178 already fixed.**
    The honest answer to "3 or 4" is: it depends on which output,
    correctly — the on-screen self-eval page has 4 real sections
    (1=ตาราง, 2=Z, 3=ความคิดเห็น+Training combined under one header, per
    its own real markup at line ~1737, 4=ลงนาม); `buildEvalPrintPage()`
    (#120/#121, the shared builder behind every L1-L4 queue's "🖨️ PDF"
    export and batch print) and `openReviewerForm()`'s on-screen modal
    (#177/#178) both deliberately have only 3 (no comments/Training
    section at all, per #121's own stated reasoning — it reads live
    `<textarea>` values with no per-draft storage) — 3 and 4 are both
    "correct," just for different outputs, the same "two numbers answer
    different questions" shape CLAUDE.md #129/#139 already established,
    here applied to a section *count* instead of a badge count.
    **Two real bugs found, neither the one #178 fixed**:
    1. `printEvalForm()`'s own print output (the self-eval page's
       "พิมพ์ร่าง"/"พิมพ์ใบประเมิน PDF" button, lines ~5629-5649) had
       **two separate section-numbering defects at once**: the real
       section 3 (comments+Training, one combined section on-screen)
       was split into two side-by-side sub-boxes with their own stray
       `ส่วนที่ 2`/`ส่วนที่ 3` micro-labels — `ส่วนที่ 2` duplicating the
       Z-score section's own already-used "2" a few lines above, and the
       Training sub-box mislabeled `ส่วนที่ 3` as if it were its own
       top-level section rather than half of one. Fixed by giving the
       combined block one real `F-sec s3` header ("ส่วนที่ 3 —
       ความคิดเห็นและแผนพัฒนา", matching the on-screen page's own
       wording exactly) and stripping the two inner sub-labels down to
       plain, un-numbered captions ("ความคิดเห็นเพิ่มเติม" /
       "การอบรมพัฒนาบุคลากร (Training Needs)") — they're sub-parts of one
       section, not two more top-level ones. Added a matching
       `.F-sec.s3b` CSS rule (same color as `.s3`) rather than reusing
       the bare `.s3` class outright, since that class is already used
       by the unrelated, unlabeled "∑ คะแนนรวม" subtotal row a few lines
       above and reusing it verbatim risked a confusing visual tie
       between two different kinds of block even though both happen to
       want the same color.
    2. `buildEvalPrintPage()` (queue-export/batch print, no comments
       section by design) still labeled its signature block "ส่วนที่ 4"
       — the exact #178 shape of bug, just in the *printed* output
       instead of the on-screen modal this time: real sections present
       are only 1 (factors) and 2 (Z), so jumping straight to "4" leaves
       an unexplained gap at "3," identical to what #178 found and fixed
       for the reviewer modal one turn earlier. Fixed by renumbering
       this one block's `F-sec` class and text from `s4`/"4" to `s3`/"3"
       — its sibling `F-signs s4` class (the 4-column *grid layout* for
       the 4 real signer rows: self/L1/L2/final-approver) was
       deliberately left untouched, since that "4" means "four signer
       columns," a completely different fact from "ส่วนที่ 4" the
       section-number label, and renaming one must never be confused
       with the other.
    **Confirmed correct and left untouched**: the on-screen self-eval
    page's own static cards (1-2-3-4, real and already consistent) and
    `openReviewerForm()`'s on-screen modal (1-2-3, #178's own fix,
    re-verified unaffected by this pass). Verified with a final grep
    across all four outputs confirming each one now reads a complete,
    gap-free, duplicate-free sequence: self-eval page 1,2,3,4;
    `printEvalForm()` print 1,2,3,4; `buildEvalPrintPage()` 1,2,3;
    reviewer modal 1,2,3 — plus full re-runs of #176/#177/#178's own
    existing tests (`test_stage_signers.js`, `test_printevalform_stage.js`)
    and the standard click-sweep (`nav pages clicked: 17 errors: []`),
    zero regressions. General lesson sharper than #178's own conclusion:
    when a user's follow-up asks "is this number right across the whole
    thing," a single fixed instance is not evidence the whole file
    agrees — grep the *exact same numbering pattern* (`ส่วนที่ [0-9]`,
    here) across every independent place the same conceptual form gets
    rendered (on-screen page, two different print/export builders, one
    on-screen modal) before answering "yes, it's all correct now," since
    each output can have its own genuinely different real section count
    by design, and a numbering bug in one is no indication the others
    are clean — or dirty.

180. **User's screenshot of a real GM-approved record (status GMApproved,
    confirmed via the previous exchange) still showed the "ผู้อนุมัติ
    (GM./AGM./MD)" signature box as "⏳ กำลังประเมิน" — my own explanation
    at the time was correct but not what the user actually wanted: that
    box has always meant the *final* AMD/MD sign-off (`isFinalStatus()`,
    #61's real last pipeline stage, after Calibration), not GM approval
    specifically, even though its label literally says "GM./AGM./MD."
    User asked directly to change this: make the box fire as soon as GM
    approves, and add a genuinely new "ส่วนที่ 4 ตัดเกรดหลัง Calibration"
    section (admin-configurable visibility) to carry the *real* post-
    Calibration grade that the old box's final-approval gate used to
    imply. Confirmed scope with 3 clarifying questions before touching
    the state machine, given the size of a wrong guess here.**
    Changed the GM/AGM/MD signature condition in all 3 real places it's
    built (`buildReviewerSignFlowHtml()` — the on-screen modal signature
    flow, #177; `printEvalForm()`; `buildEvalPrintPage()`) from
    `isFinalStatus(status)` to `hasVisibleResult(status)` — an existing
    function (`rank>=evalStatusRank('GMApproved')`, #61) nobody had ever
    pointed this specific box at — and swapped its signer-name source
    from `getApprovalSignature()` (#39, the true final AMD/MD signer)
    to `getStageSigner(code, cycle, 'GMApproved')` (#176's per-stage
    signer store, already correctly populated by `approveGmSelected()`
    → `pushApprovalRecordToExcel(...,'GMApproved',...)` → its own
    internal `recordStageSigner()` call — no new write path needed, the
    real GM approver's name was already being recorded, just never read
    back for this box). Kept the existing "⏩ ข้ามขั้นตอน" fallback
    (`resolveGmReviewer()` returning null, #128/#145/#158) for a record
    whose GM tier was genuinely auto-skipped, same pattern as the L1/L2
    rows right above it.
    Added the real grade section as one shared function,
    `buildCalibGradeSectionHtml(draft, sectionNum, includeHeader)` — the
    established "build it once, every caller goes through it" discipline
    (#30/#97/#121) — reading the real Bell Curve grade from
    `draft[draft.length-2]` (which `confirmCalibration()`/
    `overrideEmployeeGrade()` already write, #155) once
    `evalStatusRank(status) >= evalStatusRank('Calibrated')`, with an
    honest "⏳ ยังไม่ถึงขั้นตอน Calibration" placeholder before that — never
    the same gated-until-`isFinalStatus()` provisional grade the "∑
    คะแนนรวม" box already shows (#156/#161/#172's own box, left
    completely untouched, still locked until true final approval).
    Wired into `printEvalForm()` (inserted before the signature section,
    renumbering it from "ส่วนที่ 4" to "ส่วนที่ 5"), `buildEvalPrintPage()`
    (inserted before signature, renumbered "ส่วนที่ 3"→"ส่วนที่ 4"), and
    `openReviewerForm()`'s on-screen modal (appended as a genuinely new
    "ส่วนที่ 4" after the modal's existing 3 sections — #178's own fixed
    sequence needed no renumbering there, since this is additive, not a
    gap-fill). The on-screen modal call passes `includeHeader:false`
    (it already prints its own `.review-section-title` header, matching
    how the signature section above it works) and reuses the exact
    `.F-result`/`.F-grade-circle`/`.F-sec` print-tuned classes — added
    matching `.reviewer-sign-flow` CSS overrides (the same #177
    font-bump pattern, just extended to these 3 new classes, which that
    pass never needed since it only touched `.F-sign`).
    **Admin-configurable visibility**: reused the existing `ROLE_PERMS`
    system (#37) instead of inventing a new store — added one new
    permission key, `viewCalibGrade`, to `ROLE_PERM_LABELS` and every
    `ROLE_DEFS` entry's `perms` object (default true for
    sysadmin/admin/exec/gm — all already inside the real approval chain
    at some stage — false for l2/l1/unit/emp, matching #156/#161's own
    "a pre-final grade stays hidden from lower roles by default" stance)
    — `canViewCalibGrade()` checks `CURRENT_SESSION_USER`'s real role
    against it (sysadmin/admin always pass, same as every other
    admin-override check in this file, #72/#90/#113), so Admin can widen
    or narrow exactly who sees this one section from the existing "ตั้ง
    ค่าผู้ใช้ & บทบาท" page with zero new UI needed — the checkbox for
    "เห็นเกรดหลัง Calibration (ก่อนอนุมัติขั้นสุดท้าย)" simply appears in
    that page's existing per-role permission list (#37's `renderRoleCards()`/
    `editRole()`) automatically, since both already iterate
    `ROLE_PERM_LABELS` generically. Verified with a Playwright test
    seeding a real GM-approved record with a real recorded GM signer:
    confirms the signature box shows "✓ ยืนยันแล้ว" with the real GM's
    name at GMApproved (not waiting for Calibration/final approval),
    confirms the new section shows the honest "ยังไม่ถึงขั้นตอน
    Calibration" placeholder before Calibration and the real Bell Curve
    grade after it, confirms an `l2`-role viewer sees nothing (empty
    string, section hidden) while a `gm`-role viewer sees it (matching
    the new default perms) — plus a second test driving the real
    `openReviewerForm()` UI end-to-end confirming the on-screen modal's
    new "ส่วนที่ 4 — ตัดเกรดหลัง Calibration" section renders with the
    real grade and mentions Bell Curve — plus full re-runs of
    #176/#177/#178's own existing tests and the standard click-sweep
    (`nav pages clicked: 17 errors: []`), zero regressions. **One test-
    authoring mistake caught and fixed during this pass, worth
    remembering**: a first draft of the Calibration-advance test
    mutated a `getDrafts()`-returned array in place, then called
    `saveDrafts(getDrafts())` — since `getDrafts()` always re-parses
    fresh from `localStorage` on every call (never returns a cached
    reference), that second call fetched a brand-new, unmutated copy
    and silently discarded the edit; the real app code (`confirmCalibration()`
    et al.) already gets this right by capturing one `const drafts =
    getDrafts()` reference, mutating it, and passing that *same*
    reference to `saveDrafts()` — a test that doesn't follow that exact
    pattern can look like it's testing real app behavior while actually
    testing nothing. General lesson: a signature box's label naming
    several real titles ("GM./AGM./MD") does not mean any one of them
    individually triggers it — when a user explicitly asks to change
    *which* approval stage a shared UI element reacts to, check whether
    the file already has a named function for exactly that threshold
    (`hasVisibleResult()` here, built for an unrelated purpose in #61
    but exactly reusable) before writing a new status comparison from
    scratch, and when adding a new field whose sensitivity falls between
    two existing policies (visible-to-all vs. locked-until-final), reuse
    the existing per-role permission system (#37) rather than building a
    bespoke visibility toggle — the admin UI for it then comes for free.

181. **User's screenshot of "📬 แจ้งผลการประเมิน (อนุมัติขั้นสุดท้ายแล้ว)"
    showed an empty "รายชื่อที่ Approved แล้วแต่ยังไม่ได้แจ้ง" list and
    reported "ส่งไม่ได้" (can't send) — explained the real cause (#156's
    own design: this modal's target was always `isFinalStatus()`, i.e.
    the real MD final-approval stage, and nothing had reached it yet, so
    the button correctly no-ops) and asked whether the user actually had
    a real MD-approved record missing from the list. User's real answer
    reframed the whole feature: "อยากให้เมื่อ GM หรือคนที่ได้รับมอบหมาย
    ให้ทำแทน GM อนุมัติแล้ว ส่งแจ้งไปยังพนักงาน ไม่ใช่ MD" — the manual
    notify button was simply built against the wrong trigger stage from
    the start; #156 had asked "hide the grade until MD approval" and
    "notify once Approved" in the same breath, but the user's real intent
    for *this specific notification* was always the earlier GM-approval
    moment, not final MD sign-off.
    Changed `getResultNotifyTargets()`'s condition from
    `isFinalStatus(status)` to `hasVisibleResult(status)`
    (`rank>=evalStatusRank('GMApproved')`, #61) — the exact same
    threshold #180 just pointed the "ผู้อนุมัติ (GM./AGM./MD)" signature
    box at, reused rather than re-derived. "คนที่ได้รับมอบหมายให้ทำแทน
    GM" needed zero extra code: `hasVisibleResult()` only reads the
    draft's own status rank, and that status only ever reaches
    `GMApproved` via `approveGmSelected()`, which is already gated by
    `getMyScopedEmpCodes()`'s `gm`-branch/`resolveGmReviewer()` — #158's
    own fix already lets any real employee named in u[11] (not just
    role==='gm') approve at this tier, so "GM or their delegate" was
    already the real population reaching this status before this request
    even started. Updated the modal title ("GM อนุมัติแล้ว" instead of
    "อนุมัติขั้นสุดท้ายแล้ว"), its empty-state text, the default message
    body, the email subject line, and the `sendResultNotification()`
    warning toast — all 5 spots that still said "Approved"/"อนุมัติ
    ขั้นสุดท้าย" would otherwise have kept claiming the old, now-wrong
    trigger stage, the same CLAUDE.md #34/#49/#67 "keep every UI claim in
    sync with the code underneath it" discipline. Verified with a test
    seeding one employee at real status `GMApproved` and a second still
    at `Submitted`: confirms `getResultNotifyTargets()` includes only the
    GM-approved one, the modal title reads the new wording, and the
    preview renders their real email — plus the standard click-sweep
    (`nav pages clicked: 17 errors: []`), zero regressions. **Told the
    user plainly, not silently left implied**: `approveGmSelected()`
    already sends an automatic email/LINE notification the instant GM
    approves (`notifyEmployeeOfApproval()`, #61/#173/#174) — this manual
    button now fires at the *same* real trigger stage, so clicking it for
    a record whose automatic notification already went out sends a
    second, redundant message to that employee (deduped only against
    other manual clicks via `RESULT_NOTIFIED_KEY`, never against the
    separate automatic send). This is intentional as a manual backup
    (useful if the automatic one failed — e.g. the Worker wasn't
    configured at the moment of approval) but worth knowing before using
    it as a matter of habit on every record. General lesson: when a
    report like "I can't send" turns out to be the feature working
    exactly as designed, the honest next step is confirming the *design
    target* itself with the user rather than assuming the empty state is
    a bug to code around — the user's own answer here didn't just explain
    the empty list, it reframed which pipeline stage the whole feature
    was supposed to watch, and an already-existing function built for an
    unrelated purpose (#180's `hasVisibleResult()`) was exactly the right
    tool once the real target stage was named.

182. **Follow-up to #181: right after retargeting "แจ้งผลการประเมิน" to fire
    at GM approval instead of final MD approval, I flagged that this makes
    the manual button's trigger stage the exact same stage as the
    *automatic* email/LINE notification `approveGmSelected()` already sends
    the instant GM approves — a real risk of double-notifying someone. User
    asked for three things in response: "ถ้าไม่ต้องการให้ส่งซ้ำอัตโนมัติ
    แจ้งเป็น list ว่าใครส่งไปแล้ว แล้ว ต้องการให้ส่งซ้ำไหม ถามก่อนส่ง" — (1)
    stop the automatic send from silently colliding with the manual one,
    (2) show a real list of who's already been notified, (3) if Admin wants
    to resend to someone already notified, ask for confirmation first.**
    `RESULT_NOTIFIED_KEY` (#156/#181) was a flat `Set` of `draftKey()`
    strings with no metadata at all — enough to filter the *target* list
    but not enough to ever show a real "who/when/how" list, and with no
    distinction between an automatic send and a manual one. Restructured it
    into an object map keyed by `draftKey()`, each entry `{at, source}`
    (`loadResultNotified()`/`saveResultNotified()`/`markResultNotified(key,
    source)`) — with a backward-compat read path that converts an old
    array-shaped Set into `{at:null, source:'manual'}` entries rather than
    discarding a previously-saved notified state the moment this ships.
    **Closing the duplicate-send gap**: `approveGmSelected()`'s own
    per-record notify loop (`notifyEmployeeOfApproval()`, #173/#174) now
    calls `markResultNotified(draftKey(d), 'auto')` the instant either
    channel (email open or a real LINE send) succeeds — so a GM-approved
    record that was already auto-notified never appears as a target in the
    manual modal, closing the gap at its real source rather than only
    deduping inside the manual button itself. Deliberately only marks on a
    real success (`r.email?.sent || r.line?.sent`) — if both channels fail
    (e.g. the Worker isn't configured), the record is left un-notified so
    it still surfaces to Admin via the manual button rather than silently
    vanishing, the same CLAUDE.md #10 "never look like it worked when it
    didn't" rule.
    **Already-notified list**: added `getResultAlreadyNotified()` (the
    mirror of `getResultNotifyTargets()` — same `hasVisibleResult()` gate,
    opposite notified-filter) and a new "รายชื่อที่แจ้งไปแล้ว" section in
    the `mResultNotify` modal, rendered by the same `renderResultNotifyPreview()`
    call that already populates the normal target list — each row shows
    the real employee name/code, the real notified timestamp (`toLocaleString('th-TH')`,
    or an honest "ไม่ทราบเวลา (ของเก่า)" for a pre-#182 entry with no
    recorded time, never a fabricated one, per CLAUDE.md #14), and the real
    source ("อัตโนมัติตอน GM อนุมัติ" vs. "ส่งด้วยมือ"), each with its own
    `.rn-resend-chk` checkbox to opt back in for a resend.
    **Confirm-before-resend**: `sendResultNotification()` now reads whatever
    `.rn-resend-chk` boxes are checked, and if any are, calls a real
    `confirm()` naming exactly how many people are about to be re-notified
    before proceeding — declining clears the resend set but still lets the
    normal (never-notified) targets send as usual, never silently blocking
    the whole action over a declined resend. Accepted resend targets are
    concatenated with the normal target list for the actual send, and
    re-marked `markResultNotified(key, 'manual')` (updating both the
    timestamp and the source) so a resent record's history reflects the
    real, most recent action rather than the stale original one. Verified
    with a Playwright test (stubbing `window.confirm` to record calls and
    return a controlled answer) covering the full sequence: before any
    notify both of two GM-approved employees are real targets; marking one
    `'auto'` (simulating what `approveGmSelected()` now does) removes it
    from the target list and surfaces it in the already-notified list with
    the correct source label and a real checkbox; checking that box and
    declining the confirm sends only the still-normal target and leaves the
    declined one's source untouched; checking it again and accepting the
    confirm resends it and flips its stored source to `'manual'` — plus the
    standard click-sweep (`nav pages clicked: 17 errors: []`), zero
    regressions. General lesson: when a fix retargets a feature's trigger
    stage to overlap with an existing automatic action at that same stage
    (#181 moving onto the same stage #173/#174's auto-notify already uses),
    the collision isn't hypothetical — the fix for it belongs at the
    automatic action's own success path (mark there, not just filter in
    the manual button), and a "don't let X happen automatically, but let me
    choose to do it anyway" request is a strong signal that the underlying
    store needs to become a real log (who/when/how) rather than a bare
    "has this happened" flag, since a flag can prevent a repeat but can
    never answer "did it already happen" in a way a human can act on.

183. **User's screenshot of the real Outlook compose window opened by
    "📬 แจ้งผลประเมิน"'s "ส่งทันที" button showed the same real email
    address repeated 5 times in Bcc — "มี bcc มากเกิน" — plus a second
    request in the same message: "ให้เพิ่ม link ให้ด้วย เพื่อพาไปดูผล
    รวมถึงใน line ด้วย" (add a link to view the result, in LINE too).**
    Traced the Bcc duplication to `getResultNotifyTargets()`
    (#156/#181/#182): it returns one entry **per matching draft**, not
    per employee — and a real employee can have more than one draft
    sitting at `GMApproved`-or-later at once, the same duplicate-Excel-
    row/stale-local-entry shape CLAUDE.md #162/#163 already diagnosed
    for this file's review queues (leftover rows from before #41's
    composite-key upsert existed). `sendResultNotification()` then
    built `emps = allTargets.map(t=>t.emp)` with **zero dedup** before
    joining every `u[15]` into the `bcc=` query param — so one real
    person with 3 stale duplicate drafts appeared in Bcc 3 times, matching
    the screenshot exactly (this is a different bug from #153's own
    "To field is empty" fix on the same `mailto:` construction — that one
    was about the address *slot*, this one is about the *recipient list*
    itself containing repeats).
    Fixed by deduplicating `allTargets` down to one entry per real
    employee **code** (`[...new Map(allTargets.map(t=>[t.emp[0],t.emp]))
    .values()]`) before building either the email Bcc list or the LINE
    multicast recipient list — deliberately deduped by `u[0]` (the real
    employee code), not just by email string, since the same fix also
    needs to prevent sending the *LINE* multicast to the same person's
    `lineUserId` multiple times, which a plain email-dedupe wouldn't
    catch. `allTargets.forEach(t=>markResultNotified(...))` right after
    is left iterating the **original, undeduped** `allTargets` (not the
    new `emps` list) so every one of that person's duplicate drafts gets
    marked notified — not just the first one encountered — or the
    un-marked duplicates would keep resurfacing as targets on the next
    open of this same modal, the exact kind of "fixed the display, not
    the underlying duplicate-row cause" half-fix CLAUDE.md #162/#163
    already warn against.
    **Link, second half of the request**: reused the exact `appUrl`/
    `ackLink` mechanism #175 already built for `notifyEmployeeOfApproval()`
    (the *automatic* GM-approval email/LINE send) — `loadMs365Config()`'s
    `appUrl` field, left blank by Admin until explicitly configured,
    never guessed (CLAUDE.md #14). The one real difference from #175's
    own per-recipient `ackLink` (`?ackCode=&ackCycle=`): this button
    sends one **shared** Bcc email and one **shared** LINE multicast to
    several different real people at once, so a single link can never
    carry one specific person's `?ackCode=` without silently sending
    every *other* recipient straight to the wrong person's result page —
    the exact security boundary #175 itself was built to protect.
    Appended only the app's **base** URL (no `?ackCode=`) to the message
    text for both channels (`messageWithLink`, shared by the email body
    and the LINE text) — each recipient clicks through to the real login
    page and signs in with their own code/PIN as normal, same honest
    "no personalized link when the send itself isn't personalized"
    scope #175's own code comment already documents for the no-`appUrl`
    case, just applied here to "can't personalize a bulk send" instead
    of "no URL configured at all." Updated the modal's own message
    textarea with a one-line note that the link is appended
    automatically, so Admin isn't surprised to see it show up in the
    sent message beyond what they typed. Verified with a Playwright test
    that seeds one real employee with 3 duplicate `GMApproved` drafts
    (reproducing the exact screenshot's real-world shape) and a second
    employee with one real draft: confirms the raw target list is 4
    entries but the deduped employee list used for Bcc/LINE is exactly
    2 (one per real person), and confirms **all 3** of the duplicate
    employee's draft keys end up marked notified after one send, not
    just the first — plus full re-runs of #182's own existing tests and
    the standard click-sweep (`nav pages clicked: 17 errors: []`), zero
    regressions. General lesson: a bulk-notify feature built on top of
    "the list of records matching a status condition" (`getResultNotifyTargets()`
    here) silently inherits every duplicate-row risk already known to
    exist in that same underlying draft store (#162/#163's own
    conclusion) unless it explicitly collapses to one row per real
    person before building a recipient list — and when adding a "send
    a link too" feature a second time for a *different* send path than
    the one it was first built for (#175's per-person send vs. this
    bulk send), re-check whether the earlier design's core assumption
    (one link can safely name one specific person) still holds for the
    new path, since a shared Bcc/multicast send is a fundamentally
    different trust boundary from a single personalized push message.

194. **User's screenshot of a plain employee's (role `emp`) notification bell
    showed "⚠️ ข้อมูลสายบังคับบัญชาไม่ครบ 22 รายการ" — the exact same
    company-wide hierarchy-data-quality count an Admin would see — and said
    plainly: "เช็ค ว่า การแจ้งเตือน พนักงานยังเห็นเหมือน ไม่ถูกต้อง" (check —
    the employee's notification still shows the same [as admin], it's not
    correct).** Traced `getNotifications()`'s `hierCount` item: it calls
    `checkHierarchyIssues(false)` (#73/#127), which already scopes its
    `noL1`/`circular` output lists via `getMyScopedEmpCodes()` — but that
    helper deliberately returns `null` (unrestricted/company-wide) for role
    `emp`, the exact same treatment it gives `admin`/`sysadmin`/`exec`,
    specifically so a plain employee can see org-wide averages elsewhere in
    the app (CLAUDE.md #45's own stated reason). So the internal scoping was
    a complete no-op for this role — a plain employee got the identical
    company-wide count, with a link into "org" (the org-chart page), which
    is itself `data-role="admin"` and therefore a page they can't even open.
    This is the exact same shape of leak #192 just fixed one item below it
    in the same function (`pendingPush`) — a summary notification item with
    zero role gate of its own, relying entirely on an inner function's
    scoping that happens to be a no-op for this specific role.
    Fixed the same way #192 fixed `pendingPush`: wrapped the whole
    `hierCount` computation + `items.push()` call in
    `if(me && ['admin','sysadmin'].includes(me[2])){ ... }` — hiding the
    item entirely for every other role, not just leaving a correct-but-
    useless number visible (CLAUDE.md #90's own "hide the control entirely
    for every role it isn't actually for" rule). Verified with a Playwright
    test seeding a real employee with no L1 at all (so `checkHierarchyIssues()`
    has a genuine real issue to count) and confirming a plain `emp` session's
    `getNotifications()` no longer contains the `org`-linked item, while an
    admin session still sees it with the real count ("2 รายการ") — plus a
    re-run of #192's own existing test and the standard click-sweep (`nav
    pages clicked: 17 errors: []`), zero regressions. General lesson sharper
    than #87/#192's own conclusion: when one unscoped notification item in
    `getNotifications()` is found and fixed, check every *other* item in the
    same function for the identical risk — an item that calls a function
    which scopes "most of the time" (`checkHierarchyIssues()`'s own
    `getMyScopedEmpCodes()` call, correct for `l1`/`unit`/`l2`/`gm`) can
    still leak company-wide for the specific roles that helper deliberately
    leaves unrestricted, and a notification item is the wrong place to carry
    that company-wide exception when the page it links to is admin-only
    anyway.

195. **User asked "การส่งเมลแจ้งพนักงานใช้แบบเดียวกับที่ส่งแจ้งตอนเปลี่ยนรหัส
    (PIN) ได้ไหม" — confirmed via a clarifying question this means both
    "📢 ส่ง Reminder" and "📬 แจ้งผลประเมิน" should switch from `mailto:`
    (opens the Admin's own email client, #10/#153) to a real server-side
    send through the Worker's `/send-mail` endpoint, the same mechanism
    `tryEmailPin()` (#26) already uses to deliver a PIN automatically.**
    `/send-mail` has no Bcc support — it sends to exactly one `toEmail` at
    a time — so added `sendEmailToList(recipients, subject, body)`: loops
    one `/send-mail` call per recipient, best-effort (one person's failure
    never blocks the rest, the same pattern `notifyAdminOfMissingReviewChain()`
    #128 already established for looping over several admins), and returns
    a real per-recipient result map (`perEmp: Map<empCode, {sent, reason}>`)
    plus aggregate counts — not just "opened the compose window," which is
    all `mailto:` could ever honestly report (#10/#153's own stated limit).
    Gates on `isWorkerConfigured(cfg)` — the exact same check `tryEmailPin()`
    uses, not a new one — and when false, returns `{configured:false}` so
    the caller can fall back to the old `mailto:` flow rather than silently
    failing to send on a device that hasn't set up the Worker yet.
    Rewired both `sendReminder()` and `sendResultNotification()`: when the
    Worker is configured, every recipient gets a real individual email via
    `sendEmailToList()`, and the toast now reports genuine "ส่งอีเมลสำเร็จ
    N คน / ไม่สำเร็จ M คน (เหตุผลจริง)" counts instead of "เปิดโปรแกรม
    อีเมลแล้ว"; when it isn't configured, both fall back to the exact same
    `mailto:`-with-To-filled-in flow #153 already fixed, with the toast
    stating plainly that the fallback was used because the Proxy isn't set
    up. **`sendResultNotification()`'s "mark as notified" logic got a real
    accuracy upgrade as a direct consequence**: the old mailto:-only code
    could only ever mark "opened the compose window" for the *whole* Bcc
    batch at once (#182's own stated limitation); now that the Worker path
    verifies success per person, a target is only marked `RESULT_NOTIFIED_KEY`
    when their own email genuinely sent (or LINE succeeded for the group,
    or the mailto: fallback was used — both kept at the old batch-level
    granularity, since neither can be verified per person) — someone whose
    real send failed stays an un-notified target for the next click instead
    of silently disappearing from the list while never actually receiving
    anything. Verified with 4 Playwright/Node cases driving the real
    functions: a 2-recipient send where both succeed, one where a specific
    recipient's mocked `/send-mail` call throws (confirms the other still
    succeeds, the failure is attributed to the right person, and the
    aggregate counts are correct), a case with the Worker reported as not
    configured (confirms `configured:false`, zero calls made), and a full
    `sendResultNotification()` run with one recipient's send mocked to fail
    (confirms only the succeeding recipient's draft gets marked notified,
    the failing one does not) — plus full re-runs of #192/#194's own
    existing tests and the standard click-sweep (`nav pages clicked: 17
    errors: []`), zero regressions. **One test-authoring mistake caught
    and fixed during this pass, worth remembering**: a first draft of the
    test mocked `window.isMs365Configured` (a *different*, broader function
    checking `tenantId`/`clientId`/`siteUrl`) expecting it to gate the new
    send path — but `tryEmailPin()`'s own real check, which `sendEmailToList()`
    deliberately mirrors, is `isWorkerConfigured(cfg)` (checks `workerUrl`/
    `workerApiKey` specifically), a narrower and genuinely different
    function; the mock silently had zero effect since the real code never
    calls the function the test overrode, producing a test that looked like
    it passed with the wrong numbers until checked case-by-case. **This
    change is purely client-side** — `/send-mail` itself, the Worker
    endpoint, already exists and needs no redeploy; everything here goes
    live the moment GitHub Pages updates. General lesson sharper than
    #147's own conclusion: when a user asks to make one already-working
    feature (Reminder/Result-notify) "use the same method as" another
    already-working feature (PIN email), the real design is almost always
    already sitting in the second feature's own function — reuse its exact
    gating check (`isWorkerConfigured`, not a similarly-named but different
    function) and its exact fallback discipline (never fail silently when
    the Worker isn't set up), and double-check which specific function name
    a test mocks against the real call site, not just a plausible-sounding
    sibling name.

196. **User asked for the Calibration page itself ("หมวดของ calibration ปรับหน้า
    ให้ดูง่าย ชัดเจน" — a typo for "calibration," confirmed from context since
    this is the only page that name could mean) to be visually easier to read
    and clearer — pure layout/CSS request, same shape as #171's reviewer-modal
    cleanup, no logic change asked for or made.** Read the real current markup
    (`pg-calib`, line ~1900) and `renderCalibQueue()` (line ~9473) first: an
    8-column table (พนักงาน/หน่วยงาน/X/เกรดเดิม/คะแนนหลังปรับ/เกรด Bell
    Curve/หมายเหตุวินัย/การดำเนินการ) built from inline `style="..."` attributes
    on every cell, a Bell Curve settings card, a grade-distribution mini-table,
    and the table's 3 row states (`'pending'`/`'ready'`/`'done'` from
    `buildTierRoster()`, #136) rendered with no visual distinction beyond the
    pending row's plain gray text color — the "needs action" row looked
    identical to the page's general background, and a "ยังไม่คำนวณ" Bell Curve
    placeholder was unstyled plain text sitting next to where a real grade badge
    would later appear, easy to miss. Fixed with the exact #171 pattern: a new,
    clearly-labeled `<style>` block (not editing the existing CSS in place), every
    selector scoped under `#pg-calib` specifically to avoid the CLAUDE.md #15
    "a generic class name collides with an unrelated component elsewhere in this
    7000+ line file" risk, rather than inventing new generic class names. Added
    `calib-row-ready`/`calib-row-done`/`calib-row-pending` classes to the 3 real
    `<tr>` templates in `renderCalibQueue()` (zero logic touched — purely an
    added `class="..."` attribute on each template string) so CSS can give a
    ready row a warm "needs attention" tint, a done row a green "finished" tint
    with a real pill badge ("✓ ผ่าน Calibration แล้ว"), and a muted "ยังไม่คำนวณ"
    pill instead of bare text. Added icon prefixes to the page title and all 3
    card headers (⚖️/⚙️/📊/📋, matching every other page's own icon-prefixed
    heading convention already established across this file), two-line column
    headers for the longer labels, a gradient-highlighted header on the Bell
    Curve settings card (since it's the one real action HR must do before
    confirming — the same visual-priority instinct #171 already applied), a
    pill-styled Bell Curve status message, zebra striping + bold uppercase
    table headers (reusing the exact same styling #171 already established for
    the reviewer modal's own table, for visual consistency across the two
    pages), and wider/clearer input boxes with a real `:focus` outline for the
    adjusted-score and HR-note fields. Verified with a real rendered screenshot
    (CLAUDE.md #15's own rule — a DOM/class check alone can't catch a visual
    bug) seeding one employee at each of the 3 real states and confirming the
    page reads cleanly: pending rows muted, the ready row has an editable
    highlighted input with a clear "ยังไม่คำนวณ" pill, the done row has a green
    tint and a real "ผ่านแล้ว" badge — plus re-ran all 3 existing Calibration-
    related Playwright tests (#155's/#172's/#187's own tests covering the real
    Bell Curve calculation, the provisional-vs-final grade distinction, and the
    KPI recalc button) with zero regressions, a full end-to-end flow test
    (seed a real Acknowledged draft → run the real `runBellCurveCalculation()`
    → confirm the cell populates and the confirm button unlocks, exactly as
    before this change) confirming the new classes never interfered with the
    real Bell Curve logic, and the standard click-sweep (`nav pages clicked: 17
    errors: []`). General lesson: a pure visual-polish request on a page this
    file already has several working Playwright tests for is exactly the case
    where "verify nothing broke" means two separate checks — a rendered
    screenshot (for the thing that was actually asked to change) and a full
    re-run of the page's own existing logic tests (for everything that wasn't
    supposed to change at all) — neither one alone is sufficient proof the
    change was safe.

197. **User asked to be able to run Bell Curve "แบบ กลุ่ม แผนก ส่วน ฝ่าย ใดก็ได้
    ระบบจะดึงข้อมูลแล้ว admin สามารถคลิกให้ประมวลผลได้เมื่อต้องการ หรือมีการเลือก
    กลุ่มใหม่" — asked a clarifying question first since the field-level select
    (`#calibBellCurveField`, กลุ่ม/แผนก/ส่วน/ฝ่าย) already existed since #155;
    confirmed what was actually missing: picking one **specific real value**
    within the chosen field (e.g. เทียบเฉพาะแผนกบัญชี) and computing/confirming
    that one group at a time, not all groups at once every time.** Before this,
    `computeBellCurveGrades()` always split the whole ready roster into every
    distinct group automatically and `confirmCalibration()` required
    `bellCurveResult.byKey`'s count to **exactly equal** every `.calib-adj`
    input on the page — any partial computation was rejected outright, so
    there was no way to process one real department and leave the rest for
    later; HR had to always compute+confirm the entire company at once.
    Added a second `<select id="calibBellCurveValue">`, populated by
    `populateBellCurveValueOptions()` with the **real distinct values** (with
    real per-group counts) of whichever field is currently chosen, read live
    from `getReadyCalibRoster()` (a new shared helper both this and
    `computeBellCurveGrades()` now call, instead of each independently calling
    `buildTierRoster()` with its own filter — the #126/#127/#138 "reuse one
    function, don't recompute the same condition twice" discipline) — the
    first option is always "— ทุกกลุ่ม —" (empty value = the exact old
    behavior, byte-for-byte, when left unselected). `computeBellCurveGrades()`
    gained an optional `specificValue` parameter: when set, it filters the
    roster to only that one real group before ranking (same Bell Curve
    math/tie-break, just scoped to fewer people) and stamps the result with
    `scopeValue` so the status line can say which group was computed.
    `runBellCurveCalculation()` only updates `.calib-bc-cell`s that are
    present in the new (possibly partial) result — cells outside the chosen
    group are left exactly as they were (`ยังไม่คำนวณ`), never overwritten or
    blanked. **The real behavior change, to make partial confirms possible**:
    `updateCalibConfirmLock()` now unlocks the confirm button once **any**
    row has a computed result (not all of them), and `confirmCalibration()`
    now commits only the subset of `.calib-adj` inputs whose key is present
    in `bellCurveResult.byKey` — every other row is left completely untouched
    at its current `Acknowledged` status, ready for the next group/value
    selection and calculation. The status message and the final toast always
    state the real split ("คำนวณแล้ว 2/4 รายการ... เหลืออีก N รายการ รอเลือก
    กลุ่มถัดไป"), never implying "done" when a subset remains. Changing either
    select (`onCalibBellCurveFieldChange()`/`onCalibBellCurveValueChange()`)
    invalidates `bellCurveResult` and re-locks the confirm button, the exact
    same "must recompute after any change" discipline CLAUDE.md #133/#155
    already established for a single reject and for a score edit — now also
    applied to "picking a different group," matching the user's own "หรือมีการ
    เลือกกลุ่มใหม่" requirement. Verified with a Playwright test that seeds 4
    employees split across two real departments (แผนกบัญชี/แผนกขาย), selects
    field=department + value=แผนกบัญชี, computes, confirms (only those 2 move
    to `Calibrated` with real Bell Curve grades, the other 2 stay
    `Acknowledged`/`calib-row-ready`), then selects value=แผนกขาย and repeats
    — confirming the second pair advances too, completing the full roster
    across two separate admin actions instead of one — plus full re-runs of
    #155/#172/#187/#196's own existing Calibration tests confirming the
    **default** (no specific value picked) path still computes/confirms
    everyone in one shot exactly as before, with zero regression, plus the
    standard click-sweep (`nav pages clicked: 17 errors: []`). General lesson:
    when a user names a feature ("compute Bell Curve by any of these 4 real
    org levels") that already exists in the UI almost exactly as described,
    the real gap is often one level more specific than the words first suggest
    — here "any of these 4" was already true, but "one at a time, by a real
    value within the chosen level" was the part silently missing; a single
    clarifying question with concrete option previews, rather than assuming
    the feature request restates something already built, is what surfaced it.

198. **Follow-up to #197: user's screenshot of the new field/value selects
    (confirming #197 shipped correctly) asked for two more things in the
    same card: "ให้ดึงรายชื่อตามที่กำหนดขึ้นมา" (pull up the actual names
    matching what's selected) and "ให้มีแถบ export เป็น excel ได้ด้วย" (add
    an Excel export tab too).** Before this, #197's field/value selects only
    *drove* the Bell Curve calculation and the export list did not exist at
    all — HR had no way to see *who* was actually in the chosen group before
    clicking "คำนวณ Bell Curve," and no way to pull a group's roster out of
    the app as a file.
    Added `getCalibScopedRoster(fieldKey, specificValue)` — one shared
    filter function that `computeBellCurveGrades()` (#197), the new preview,
    and the new export all now call identically (replacing the inline filter
    line #197 had written directly inside `computeBellCurveGrades()`), so the
    three can never silently disagree on which people belong to the selected
    group (the #126/#127/#138/#156 "one function, not a fourth independent
    query" discipline, applied here across three *new* consumers of the same
    real-time list at once rather than found as a drift bug later).
    `renderCalibBellCurveNamesPreview()` renders a real table (name/code/
    department/live X/provisional grade) of exactly who's in the currently
    selected field+value right inside the Bell Curve settings card — refreshed
    on every render (`renderCalibQueue()`, after the roster rows exist, since
    the preview reads each person's live `.calib-adj` input value) and on
    every field/value change (`onCalibBellCurveFieldChange()`/
    `onCalibBellCurveValueChange()`), so it's always showing the group that's
    about to be computed, not a stale one. An honest empty state ("ไม่มี
    รายชื่อในกลุ่มนี้ที่รอ Calibration") shows when a chosen value has nobody
    left — never a blank table pretending there's data, per CLAUDE.md #14.
    A new "📥 Export Excel" button next to "📊 คำนวณ Bell Curve" calls
    `exportCalibScopedList()`, which builds a CSV (code/name/department/form
    level/X/provisional grade, via the file's existing `downloadCsv()`
    helper, #60/#156 — this file has no real `.xlsx` writer, a UTF-8-BOM CSV
    Excel opens natively is the established honest equivalent) from the
    **exact same** `getCalibScopedRoster()` call the preview and the Bell
    Curve calculation itself use — exporting "ทุกกลุ่ม" (no value selected)
    exports everyone currently ready for Calibration, exporting a specific
    value (e.g. แผนกบัญชี) exports only that group, matching "ตามที่กำหนด"
    (per what's currently selected) literally. Verified with a Playwright
    test seeding 3 employees across two real departments: confirms the
    preview with no value selected shows all 3 real names, confirms
    selecting "แผนกบัญชี" narrows the preview to exactly the 2 real matching
    names (and states "2 คน"), and confirms clicking Export (intercepting
    the generated `<a download>` element rather than letting a real file
    download in the test) produces a real non-empty CSV filename naming the
    real field+value+cycle — plus full re-runs of #197's own partial-confirm
    test and #155/#172/#187/#196's own existing Calibration tests, all with
    zero regressions, plus the standard click-sweep (`nav pages clicked: 17
    errors: []`), plus a real rendered screenshot (CLAUDE.md #15's own rule)
    confirming the preview table and Export button render cleanly inside the
    settings card. General lesson: when a feature ships and the user's very
    next message asks for "show me who" and "let me export it" about the
    same selection that feature just introduced, both requests point at the
    identical underlying list the feature's own calculation already computes
    — the fix is almost always exposing that existing list through two new
    thin views (a preview render, a CSV builder), never recomputing a fourth
    version of "who's in this group" independently.

199. **User reported "กด calibation แล้ว เกรด กลับมาเปฌนก่อน calibation" (after
    clicking Calibration, the grade goes back to [looking like] before
    Calibration).** Traced `renderCalibQueue()`'s `'done'` row branch (status
    already `Calibrated`/`Approved`, i.e. `grade` is the real Bell Curve/
    manual-override result, #155) — it still called `provisionalGradeCell(grade)`,
    the same helper used for `'ready'` rows that haven't been calibrated yet.
    `provisionalGradeCell()` always appends "(ชั่วคราว)" (provisional/temporary)
    with a tooltip stating "the real grade will only be computed via Bell
    Curve at the Calibration step" — so the instant `confirmCalibration()`
    finished and `renderWorkflowPages()` re-rendered the queue, the just-
    calibrated row's grade *letter* was correct but its caption/tooltip
    claimed the opposite — that it was still provisional and Calibration
    hadn't really happened yet — reading exactly like the grade reverted to
    its pre-Calibration state. This directly contradicted this file's own
    stated design: #172's own `renderApproveQueue()` comment explicitly says
    a `Calibrated`/`Approved` record's grade is genuinely final and "labeling
    it provisional would be dishonest" — #172's fix just never carried that
    same exemption into `renderCalibQueue()`'s own `'done'` branch, even
    though its roster (`buildTierRoster(null,null,'Acknowledged',cycle)`)
    buckets both `Calibrated` and `Approved` records into that exact `'done'`
    state. Fixed by rendering the `'done'` row's grade plainly (`<span
    class="grade g${grade}">` with a real "เกรดจริงจาก Bell Curve/การปรับเอง
    ณ ขั้น Calibration — ไม่ใช่เกรดชั่วคราวอีกต่อไป" tooltip) and a "(ผ่าน
    Calibration แล้ว)" caption instead of `provisionalGradeCell()`'s
    "(ชั่วคราว)" one — the `'ready'` row (still genuinely provisional,
    `gradeFromX()`) keeps `provisionalGradeCell()` unchanged. Verified with a
    Playwright test that seeds 2 employees, runs the real Bell Curve
    calculation + `confirmCalibration()`, and confirms the re-rendered
    `'done'` row shows the real stored grade with the new "(ผ่าน Calibration
    แล้ว)" caption and never the old "(ชั่วคราว)" text — plus full re-runs of
    #155/#172/#187/#196/#197/#198's own existing Calibration tests, all with
    zero regressions, plus the standard click-sweep (`nav pages clicked: 17
    errors: []`). General lesson sharper than #172's own conclusion: a shared
    display helper built for "not yet calibrated" (`provisionalGradeCell()`)
    is easy to leave wired into a sibling row state that reaches the exact
    same roster bucket (`'done'`) through a different filter (`buildTierRoster`'s
    status comparison) than the one a fix explicitly reasoned about (`renderApproveQueue()`'s
    separate `'Calibrated'`-input roster) — when a fix states "X's grade is
    final by this stage, never label it provisional," grep every other place
    reading the exact same status range for the identical helper call, not
    just the one function the fix was written against.

200. **Follow-up to #199: user asked "รายชื่อในกลุ่มที่เลือก ให้แสดงข้อมูล
    update ตามที่คำนวณ" (the names list in the selected group should show
    updated data per what was calculated).** `renderCalibBellCurveNamesPreview()`
    (#198) always showed each person's stored draft grade via
    `provisionalGradeCell()` — even after HR clicked "📊 คำนวณ Bell Curve,"
    the preview kept showing the old provisional `gradeFromX()` grade and
    never the real computed rank/grade sitting in `bellCurveResult.byKey`;
    `runBellCurveCalculation()` also never re-rendered this preview at all,
    only the main table's `.calib-bc-cell`s. Fixed by having the preview
    read `bellCurveResult.byKey` first for each row — showing the real
    computed grade + rank (`อันดับ N/M`) the moment it exists for that key,
    falling back to the old provisional cell only for a row not yet computed
    (still outside the chosen group/value, or before any calculation has
    run) — and calling `renderCalibBellCurveNamesPreview()` from
    `runBellCurveCalculation()` itself right after updating the main table's
    cells, so both views refresh together instead of only one. The column
    header also drops "ชั่วคราว" once a real calculation exists for this
    group. Verified with a Playwright test confirming the preview shows
    "เกรดชั่วคราว"/no rank before computing and switches to a plain "เกรด"
    header with real rank text after clicking compute — plus full re-runs
    of #197/#198/#199's own existing Calibration tests and the standard
    click-sweep (`nav pages clicked: 17 errors: []`), zero regressions.

201. **User asked: "ตารางปรับเทียบรายบุคคล ให้มีกรองเลือก ฝ่าย ส่วน แผนก
    กลุ่มงาน ด้วย และ เพิ่ม export excel ได้" (the individual calibration
    table should also have filters for department/division/section/group,
    and add Excel export).** The existing "เฉพาะค่า" dropdown + Export
    button above it (#197/#198) only govern which group gets *computed*
    for Bell Curve and that group's preview/export — the main "📋 ตาราง
    ปรับเทียบรายบุคคล" table itself (every pending/ready/done row in the
    whole roster) had no filter of its own and no export at all. Added 4
    real filter `<select>`s (`calibFilterGroup`/`Section`/`Division`/
    `Dept`, matching `BELL_CURVE_GROUP_FIELDS`'s existing group:3/section:4/
    division:5/department:6 indices — reused, never a second mapping) above
    the table, deliberately independent of the Bell Curve "เฉพาะค่า"
    selector (two different purposes: that one decides what to *compute*,
    this one just decides what to *show/browse* and never touches
    calculation/confirm logic at all). `populateCalibTableFilters(fullRoster)`
    fills all 4 from the real distinct values present in the full roster
    (every state, not just `ready`) — CLAUDE.md #3's own "populate from
    real data" rule — preserving each select's current value if it's still
    real, called every render alongside the existing
    `populateBellCurveValueOptions()`. `filterCalibTableRoster(fullRoster)`
    applies all 4 (AND, empty = no restriction) before building the table
    rows and before computing the header's "รอปรับเทียบ N รายการ" count, so
    the count always matches what the filtered table actually shows
    (CLAUDE.md #126/#127/#138's own discipline). Added a "↩️ ล้างตัวกรอง"
    reset button and a "📥 Export Excel (ตารางนี้)" button
    (`exportCalibTableList()`) that exports the exact same filtered roster
    the table is currently showing — code/name/group/section/division/
    department/status/X/grade, including `pending` rows (honestly labeled
    "รอผลประเมิน" with blank score/grade, never fabricated) — via the
    file's existing `downloadCsv()` helper (#60/#156/#198), distinct from
    `exportCalibScopedList()`'s own Bell-Curve-group-only export above it.
    Verified with a Playwright test seeding 3 employees across two real
    departments: confirms the filter options show real department values
    with real counts, selecting one department correctly narrows both the
    table rows and the "รอปรับเทียบ" count to just that department, the
    Export button produces a real non-empty CSV named after the active
    filter, and "ล้างตัวกรอง" restores all 3 rows — plus full re-runs of
    #197/#198/#199/#200's own existing Calibration tests, all with zero
    regressions, plus the standard click-sweep (`nav pages clicked: 17
    errors: []`).

202. **User reported "พอกดคำนวณแล้วเกรดเปลี่ยน แต่สักพักก็กลับมาเหมือนเดิม"
    (after clicking compute the grade changes, but after a while it goes
    back to how it was) — a genuine new bug, distinct from #199's display-
    label fix. Traced `renderCalibQueue()`'s own comment: "`bellCurveResult`
    ถูก invalidate ทุกครั้งที่ renderCalibQueue() รันใหม่ (เปิดหน้า/sync
    อัตโนมัติ/แก้ไขคะแนน)" — this blanket `bellCurveResult = null` fired
    on *every* re-render, including the one `startEvalAutoSync()` (#59)
    triggers every 30 seconds via `ms365SyncAppraisals()` →
    `renderWorkflowPages()` → `renderCalibQueue()`, completely independent
    of whether HR actually edited anything. So the real sequence matching
    the report: HR clicks "📊 คำนวณ Bell Curve" → grade cells correctly
    show the computed result → within the next ~30 seconds, the background
    auto-sync tick fires → `renderCalibQueue()` reruns, nulls
    `bellCurveResult`, and rebuilds every `.calib-bc-cell` back to its
    always-starts-blank "ยังไม่คำนวณ" markup (the cell HTML itself is
    freshly generated on every tbody rebuild regardless of whether a result
    exists — only `runBellCurveCalculation()`'s own explicit paint call
    ever fills it in) — reading exactly like the grade "came back" to
    before Calibration, with nobody having touched anything in between.
    `onCalibScoreInput()`/`onCalibBellCurveFieldChange()`/
    `onCalibBellCurveValueChange()` already correctly null the result on
    a genuine user edit — the blanket reset inside `renderCalibQueue()`
    itself was redundant for that case and solely responsible for wiping
    an unconfirmed-but-still-correct result on every background tick.
    Fixed by replacing the unconditional null with a real validity check:
    keep `bellCurveResult` across a re-render only when the field/value
    selection still matches what it was computed against **and** every
    person in `bellCurveResult.byKey` is still in the `'ready'` roster
    with the exact same `X` the calc used (so a genuine remote change —
    e.g. another device advancing/editing that person — still correctly
    invalidates it). Extracted the cell-painting logic shared by
    `runBellCurveCalculation()` into one `applyBellCurveResultToCells(result)`
    helper (CLAUDE.md #126/#127/#138's "one function, not a fourth copy"
    discipline) so `renderCalibQueue()` can re-paint the freshly-rebuilt
    cells from a still-valid preserved result, rather than leaving them
    stuck at "ยังไม่คำนวณ" even though the underlying value survived.
    Verified with a Playwright test that computes Bell Curve, simulates
    the 30-second auto-sync tick by calling `renderWorkflowPages()`
    directly, and confirms the grade cells and the unlocked confirm
    button both survive — then edits one score for real and confirms the
    result correctly invalidates and the table correctly reverts to
    "ยังไม่คำนวณ" in that case. Confirmed the test reproduces the real bug
    first (failed identically on the pre-fix code via `git stash`) before
    confirming the fix — plus full re-runs of #197/#198/#199/#200/#201's
    own existing Calibration tests, all with zero regressions, plus the
    standard click-sweep (`nav pages clicked: 17 errors: []`). **The
    group/section/division/department filter + Excel export for the main
    calibration table the user also asked for in the same message was
    already shipped in #201 one turn earlier** — confirmed still present
    in the file (`calibFilterGroup`/`Section`/`Division`/`Dept`,
    `exportCalibTableList()`), just not visible in the user's cropped
    screenshot (which showed only the table rows, above the filter bar) —
    no further work needed there. General lesson sharper than #155/#172's
    own "must re-confirm after any edit" discipline: an invalidate-on-
    every-render rule that's correct for "the user might have edited
    something" is not automatically correct for "the page re-rendered for
    any reason at all" — a page with a background auto-refresh timer
    (#59) re-renders on a schedule completely unrelated to user action,
    and a blanket invalidation tied to *rendering* rather than to the
    *specific events that actually invalidate the data* will periodically
    destroy a user's own uncommitted work with no visible cause; when a
    "must recompute after X" rule is enforced inside a render function
    rather than at the specific X event(s), check whether that render
    function also fires for unrelated reasons (an auto-sync tick) before
    assuming the blanket reset is safe.

203. **Follow-up to #202: user reported "export ทำไมไม่ใช่ ที่ calibration
    แล้ว" (why doesn't export [show] what's already been calibrated), and
    after being told the top "📥 Export Excel" button only exports people
    still `'ready'` (not yet confirmed) — by design, per #198 — reported a
    second, real bug: "export แล้ว ข้อมูลยังเป็นเกรดเดิม ก่อน calibration"
    (after exporting, the data is still the old grade, from before
    calibration). Reproduced with a Playwright test: ran the real
    `runBellCurveCalculation()` (computing a real new grade, e.g. B/D) but
    deliberately did NOT click "ยืนยันผล Calibration" yet, then called the
    real `exportCalibScopedList()` — the exported CSV's grade column showed
    the stale pre-calculation value ("C") instead of the just-computed
    real Bell Curve grade.** Root cause: `exportCalibScopedList()` read
    `grade = r.draft[r.draft.length-2]` unconditionally — the value still
    stored in the draft from before this run's calculation — and never
    checked `bellCurveResult.byKey[key]` for the real, just-computed
    result, even though `renderCalibBellCurveNamesPreview()` sitting right
    next to it on the same page had already been fixed to do exactly that
    in #200. #200's own fix note explicitly named this discipline
    ("CLAUDE.md #126/#127/#138" — "one function, not a fourth independent
    query") but, being scoped to the preview table specifically, never
    circled back to the export function showing the identical data one
    button over. Fixed by making `exportCalibScopedList()` read
    `bellCurveResult.byKey[key]` first (falling back to the stored draft's
    provisional grade only for a row not yet computed this run), adding a
    real "อันดับ" (rank) column from the same result object, and relabeling
    the grade column header dynamically — "เกรด (Bell Curve)" once any row
    in the export has a real computed result, "เกรดชั่วคราว" otherwise —
    so the header's own claim never disagrees with what the column
    actually holds (the same CLAUDE.md #34/#49/#67 "keep the UI's claim in
    sync with the code" rule). Verified with a Playwright test reproducing
    the exact report (compute, don't confirm, export) — CSV now shows the
    real "B"/"D" grades with the correct rank ("1/2"/"2/2") instead of the
    stale "C" — plus re-ran #198/#199/#200/#201/#202's own existing
    Calibration tests (table-filter export, post-confirm export, grade-
    revert, preview-update, auto-sync-persist), all with zero regressions,
    plus the standard click-sweep (`nav pages clicked: 17 errors: []`).
    **Confirmed, not a bug**: `exportCalibTableList()` (the bottom "Export
    Excel (ตารางนี้)" button) was already reading the real post-`confirm`
    grade correctly for `'done'` rows (`d[d.length-2]`, written directly by
    `confirmCalibration()`) — verified with a second test that computes,
    confirms, and exports via that button, confirming the real updated
    grades appear. The bug was specific to the top button's *pre-confirm*
    preview-style export. General lesson sharper than #200's own
    conclusion: when a fix teaches one display (a preview table) to read a
    live, not-yet-saved computation result instead of stale stored state,
    grep every *other* function reading the exact same stored field
    (`r.draft[r.draft.length-2]`, here) for the identical staleness risk —
    an export button sitting right next to a just-fixed preview, built
    from the same roster and the same "show what Bell Curve just computed"
    intent, is exactly the kind of sibling a scoped fix walks past.

204. **Follow-up to #203: user immediately reported the EXACT symptom on
    the OTHER export button too — "Export Excel (ตารางนี้) ยังเป็นค้าเดิม
    ก่อน calibation" (Export Excel [this table] is still the old value
    from before calibration) — directly contradicting #203's own closing
    claim that `exportCalibTableList()` (the bottom button) was "confirmed,
    not a bug... already reading the real post-confirm grade correctly."**
    That earlier verification was correct but incomplete: it only tested
    the POST-confirm scenario (where `confirmCalibration()` has already
    overwritten `d[d.length-2]` with the real grade, so reading it
    unconditionally happens to work). It never tested the exact scenario
    the user was actually describing — a `'ready'`-state row where HR has
    clicked "📊 คำนวณ Bell Curve" (populating the live, not-yet-committed
    `bellCurveResult` global) but has NOT yet clicked "ยืนยันผล
    Calibration." In that window, `d[d.length-2]` is still the stale
    pre-calibration value, and `exportCalibTableList()`'s final `return`
    line read it unconditionally, with zero check against
    `bellCurveResult.byKey[key]` — the identical bug class #203 had just
    fixed one function over, never propagated to this sibling.
    Reproduced with a Playwright test mirroring #203's own reproduction
    exactly (seed 2 real employees + drafts, compute Bell Curve, do NOT
    confirm, click the bottom "Export Excel (ตารางนี้)" button, decode the
    real blob CSV) — confirmed pre-fix shows the stale "C"/"C" for both
    rows; post-fix shows the real computed "B"/"D" with correct rank
    ("1/2"/"2/2"), verified by stashing the fix and re-running the
    identical test against the pre-fix code. Fixed with the exact same
    pattern already proven in #203: read `bcByKey = bellCurveResult ?
    bellCurveResult.byKey : {}` once, and for each non-pending row compute
    `const bc = bcByKey[key]; const grade = bc ? bc.grade : d[d.length-2];`
    plus a real "อันดับ" rank column (new 10th CSV column, `pending` rows
    get an honest blank rather than a guessed rank) — `'done'`-state rows
    fall through correctly to the now-real `d[d.length-2]` exactly as
    before, since `bellCurveResult` is reliably invalidated by the time a
    row has actually been confirmed. Verified with the new reproduction
    test (now passing) plus full re-runs of #198/#199/#200/#201/#202/
    #203's own existing Calibration tests (table-filter export,
    scoped-group export before/after confirm, grade-revert, preview-
    update, auto-sync-persist) — all with zero regressions — plus the
    standard click-sweep (`nav pages clicked: 22 errors: []`). General
    lesson sharper than #203's own closing line: "grep every other function
    reading the same stored field" is the right instinct, but testing only
    the state the bug report happened to describe (post-confirm) is not
    the same as testing the state the FIX actually needs to cover
    (pre-confirm, live-but-uncommitted) — when a sibling function is
    "confirmed, not a bug" against a reproduction, check that the
    reproduction actually exercises the *specific* scenario the staleness
    risk depends on (a live global sitting uncommitted) rather than the
    scenario where the bug happens to self-resolve (the value having
    already been overwritten for an unrelated reason); two near-identical
    functions sharing one risk can still need two separate, carefully-
    scoped tests before either one is safe to call closed.

205. **User reported "ข้อมูลไม่ save ที่ calibration แล้ว" (data from
    Calibration doesn't save) — confirmed via a clarifying question the
    real split: the web app's own table correctly showed the new
    Calibrated grade, but the real Excel `Appraisals` sheet did not
    reflect it. Earlier in the same conversation the user had already
    sent a screenshot of the real sheet showing duplicate rows per
    employee — e.g. 90526 with both a "Submitted" row and an
    "Acknowledged" row, same EmpID/รอบ/ระดับ — which turned out to be
    the exact smoking gun.** Traced `graphUpsertTableRow()`/
    `graphUpsertTableRowPartial()` (client, delegated path) and the
    Worker's `upsertRow()`/`upsertRowPartial()` (used whenever the
    Worker is configured, which per #31 is every device by default) and
    found **two real, compounding bugs** in all four, all sharing one
    root pattern:
    1. **Only the first matching row ever got updated.**
       `rows.findIndex(r => rowMatchesUpsertKey(...))` picks exactly one
       row and PATCHes it; when a duplicate of the same composite key
       already exists (any leftover from before #41's upsert existed,
       or from the second bug below), the *other* duplicate is left
       completely untouched forever. Whoever happens to be looking at
       that specific stale duplicate row in Excel sees no change at all
       after Calibration, confirming — even though the web app and one
       of the two Excel rows are both genuinely correct.
    2. **Neither function ever followed Microsoft Graph's
       `@odata.nextLink` pagination when searching for the row to
       update** — unlike `graphListTableRows()`/`listRows()`, already
       fixed for this exact class of bug in #159, these four upsert
       functions each called a single, unpaginated GET on `/rows` and
       searched only that one page. If the real matching row happened
       to sit on a later page (plausible the moment `Appraisals`
       accumulates enough real rows, duplicates included), the search
       would find nothing and silently **add a brand-new duplicate
       row** instead of updating the existing one — actively
       manufacturing more of the exact duplicate-row problem bug #1
       already makes visible, on every single push from that point on.
    Reproduced both independently with Playwright/Node tests before
    fixing: (1) seeded two duplicate rows sharing one composite key and
    confirmed the pre-fix client function PATCHes only the first,
    leaving the second at its old status; (2) seeded a real match
    sitting on page 2 behind a mocked `@odata.nextLink` and confirmed
    the pre-fix Worker route (driven through the real `/rows/upsert`
    HTTP endpoint end-to-end, not just the internal function in
    isolation) never reaches it and instead calls `/add`, creating a
    new duplicate. Fixed by extracting one shared pagination helper on
    each side (`graphFetchAllTableRowsRaw()` client,
    `fetchAllTableRowsRaw()` Worker — mirroring `graphListTableRows()`/
    `listRows()`'s exact loop-until-no-`@odata.nextLink` pattern, #159)
    and changing `findIndex` to `filter`: every real match now gets
    PATCHed (full-row for the plain upsert, the same per-row
    range-PATCH loop for the partial/formula-safe upsert, #106), and a
    new row is only ever added when zero real matches exist anywhere
    across every page. Kept the client and Worker implementations
    byte-for-byte parallel in logic, per CLAUDE.md #41's own standing
    rule for this exact pair of files that can't share code. Verified
    with both reproduction tests now passing post-fix (both duplicates
    PATCHed, zero spurious adds) plus full re-runs of every existing
    Calibration/Appraisals-push Playwright test (`test_calib_flow`,
    `test_calib_push_verify`, `test_export_grade_after_calib`, and 7
    others) and the standard click-sweep (`nav pages clicked: 22
    errors: []`), all with zero regressions. **This changes the
    Worker's own code**, so per CLAUDE.md #41/#106/#147's own
    established precedent **it needs a real redeploy** before the
    duplicate-row/pagination fix has any live effect on a device
    routing through the Worker (every device, by default, per #31) —
    the client-side delegated-path fix goes live the moment GitHub
    Pages updates, same as any other purely-client fix in this file.
    **What this fix does and does not resolve, stated plainly**: going
    forward, every push correctly updates every real existing duplicate
    (so the symptom — "looks fine in the app, Excel doesn't match" —
    cannot recur) and the Worker can no longer manufacture a *new*
    duplicate from a pagination miss. It does **not** retroactively
    merge or delete the duplicate rows already sitting in the user's
    real Excel file from before this fix (there is still no
    `graphDeleteTableRow()` anywhere in this codebase, per #39/#113's
    own stated limit) — those pre-existing duplicates will now all stay
    in sync with each other on every future push, but someone still
    needs to manually clean up the stale historical rows in the Excel
    file itself if a tidy sheet matters, which this fix doesn't attempt
    to do automatically. General lesson sharper than #159's own
    conclusion: when a pagination-follow fix is applied to one function
    reading a table (`graphListTableRows()`), grep every *other*
    function that independently GETs the same `/rows` endpoint before
    assuming the fix is complete — an upsert function's own internal
    "find the row to update" search is a second, easy-to-miss
    unpaginated read hiding right next to the paginated one that
    already got fixed, and a pagination miss there is strictly worse
    than a pagination miss on a pure read (it doesn't just return stale
    data, it actively writes a new duplicate row that makes the next
    search miss again too).

206. **Follow-up to #205: user reported the *same* "ไม่ save เข้า Excel
    เลย" symptom again — this time after confirming the Worker had
    genuinely been redeployed with #205's fix. Investigated with real
    Cloudflare Workers Observability logs (the first time this file has
    used that diagnostic source directly, rather than the Sync Log panel
    alone) rather than guessing a second time blind.** The Sync Log panel
    itself was the first real clue: it showed only the 30-second
    auto-sync's "ดึงข้อมูล...จาก Excel" pull entries, repeating
    continuously, with **zero push entries at all** — not even a failure
    entry — immediately after the user clicked "ยืนยันผล Calibration" on
    3 real employees. Cloudflare's own Observability log for the Worker
    confirmed the Worker itself was reachable and healthy (a real
    `POST /rows/add` succeeded with `200`), but searching the log for
    "upsert" returned **zero events, ever** — the `/rows/upsert` endpoint
    (the one `pushDraftRowToExcel()`/`graphUpsertTableRow()` must hit to
    actually update a Calibration grade) had never once been called on
    the live Worker, even though the Worker's own route for it is coded
    correctly (confirmed by reading `tools/sml-pms-proxy-worker.js`
    directly — not a Worker-side bug this time).
    Traced `confirmCalibration()` (line ~9908) for a reason the client
    itself might never reach that endpoint: it matches each confirmed
    row's real draft via `drafts.find(x=>draftKey(x)===key)` — a plain
    `.find()` by the row's *full* composite key, which CLAUDE.md #163/
    #164 previously reasoned was "inherently safe" since the key already
    encodes code+cycle+level with no ambiguity left. That reasoning was
    never actually tested against a live production scenario where the
    30-second background auto-sync (`startEvalAutoSync()`, #59) can run
    **between** the moment a Calibration row is rendered (fixing its
    `data-key` in the DOM) and the moment HR actually clicks confirm
    (which re-reads `getDrafts()` fresh, per #161's own "`getDrafts()`
    always re-parses from `localStorage` on every call" note) — if
    anything about that record's local copy shifts in that window (a
    merged Excel row landing under a slightly different shape), the
    exact-string match can silently find nothing, and `confirmCalibration()`
    just **skips pushing that record's actual grade/status to Excel at
    all** — while the *second*, independent loop a few lines below
    (`confirmInputs.forEach(...)`, which pushes the Approvals-table
    audit comment) runs **unconditionally** regardless of whether the
    real draft was found, so a "ยืนยันผล Calibration แล้ว N รายการ" success
    toast and a real `Approvals` log entry both still appear — exactly
    matching what the user saw and reported as "เกรดเปลี่ยน" (the on-screen
    preview, #200, does update live from the just-computed Bell Curve
    result regardless) while the real `Appraisals` row underneath never
    gets touched. Reproduced this exact race deterministically with a
    Playwright test that renders the queue, computes Bell Curve, then
    mutates the local draft's `level` field *after* render but *before*
    calling `confirmCalibration()` (simulating the real-world auto-sync
    race) — confirmed the plain `.find()` finds nothing in that case.
    Fixed with a two-part defense, not just a diagnostic: (1) when the
    exact-key `.find()` comes back empty, fall back to
    `findCurrentCycleDraft(drafts, empCode, cycle)` (the #163-established
    "safe" helper — matches by code+cycle only, picks whichever draft has
    the highest real status rank) so the record's real grade/status still
    gets written and pushed even when the exact composite key drifted;
    (2) **always** log to the Sync Log — a "เริ่มยืนยัน N รายการ" entry the
    instant the function starts doing real work, and, whenever the
    primary key lookup fails, a specific entry naming the exact key that
    didn't match and whether the fallback found a real record in its
    place — so the *next* time this (or any future variant of it) happens,
    the Sync Log panel the user already knows how to check shows the real
    cause directly, with no need to escalate to Cloudflare's own
    dashboard again. Verified with a test confirming the fallback
    recovers the record and the log entry appears for the race case, and
    that the normal (no-race) path logs cleanly with no fallback noise —
    plus full re-runs of every existing Calibration Playwright test
    (#155/#172/#187/#196-#205's own test suite) and the standard
    click-sweep (`nav pages clicked: 22 errors: []`), all with zero
    regressions. **This is purely a client-side fix** — it goes live the
    moment GitHub Pages updates, no Worker redeploy needed this time,
    since the bug and the fix are both entirely in `confirmCalibration()`
    on the client. General lesson sharper than #163/#164's own
    conclusion: "a `.find()` matching the full composite key is inherently
    safe" is only true if nothing can ever change the underlying data
    *between* the moment a UI element's key is fixed in the DOM and the
    moment a later action reads that key back against fresh data — a
    page with its own background auto-sync timer (#59) is exactly the
    kind of environment where that assumption quietly stops holding, and
    the right response is not just re-deriving why it "should" still be
    safe, but adding both a real fallback match *and* an unconditional
    diagnostic log at that exact lookup, so a live production report
    that can't be reproduced locally still leaves a concrete trail the
    next time it happens.
