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
