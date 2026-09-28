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
