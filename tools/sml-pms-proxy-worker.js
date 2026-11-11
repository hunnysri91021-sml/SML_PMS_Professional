/*
 * SML PMS — MS365 Proxy (Cloudflare Worker)
 *
 * ทำไมต้องมีไฟล์นี้: ปกติเว็บ SML_PMS_v14.html คุยกับ Microsoft Graph API ตรงๆ ด้วยสิทธิ์
 * "delegated" ของผู้ใช้แต่ละคน (MSAL.js) ซึ่งต้องมีคน login Microsoft อย่างน้อย 1 ครั้งต่อเครื่อง
 * ถ้ามีพนักงานหลายร้อยคนและไม่ต้องการให้ใครต้อง login Microsoft เลย ต้องมี "ตัวกลาง" ที่ถือ
 * สิทธิ์แบบ Application (client credentials) แทนทุกคนไว้ฝั่งเซิร์ฟเวอร์ — นี่คือตัวกลางนั้น
 *
 * Worker นี้ไม่เก็บ/ประมวลผลอะไรเลยนอกจาก: รับคำขอจากเว็บ SML PMS, แลก Client Secret เป็น
 * access token แบบ Application permission, แล้วส่งต่อคำขอไปยัง Microsoft Graph ตาราง Excel
 * ที่กำหนดไว้เท่านั้น (ผ่าน SITE_URL/FILE_PATH ที่ตั้งเป็น Secret ของ Worker เอง ไม่ได้มาจาก
 * เว็บ) เพื่อไม่ให้ Client Secret หลุดไปอยู่ในโค้ดฝั่งเบราว์เซอร์ ซึ่งเปิดดูได้จากใครก็ตาม
 *
 * วิธี deploy (Cloudflare, ฟรี):
 *   1. สร้างบัญชี Cloudflare (ฟรี) → Workers & Pages → Create Worker
 *   2. วางโค้ดไฟล์นี้ทั้งหมดแทนโค้ดตัวอย่าง แล้วกด Deploy
 *   3. ไปที่ Settings → Variables → เพิ่ม Secret (encrypted) ทั้ง 9 ตัว:
 *        TENANT_ID       = Azure AD Tenant ID
 *        CLIENT_ID       = Azure AD App (client) ID ที่ขอสิทธิ์ Application แล้ว
 *        CLIENT_SECRET   = Client secret ที่สร้างไว้ใน Azure AD (เห็นครั้งเดียวตอนสร้าง)
 *        SITE_URL        = เช่น https://siammotor.sharepoint.com/sites/Chosiya-HR
 *        FILE_PATH       = เช่น _SML_PMS_Professional/SML_PMS_Master.xlsx
 *        SESSION_SECRET  = สตริงสุ่มยาว 48 ตัวขึ้นไป (ชนิด Secret) ใช้เซ็นบัตรผ่านล็อกอิน (token) อายุ 8 ชม.
 *                          — ไม่ต้องกรอกที่เว็บ และไม่มีกุญแจ API ฝังในเว็บอีกต่อไป (#260 แทน PROXY_API_KEY เดิม
 *                          ซึ่งถูกยกเลิกแล้ว ลบทิ้งจาก Cloudflare ได้) สร้างด้วย: openssl rand -hex 32
 *        SEND_AS_EMAIL   = อีเมล HR/Admin จริงใน Microsoft 365 ที่จะใช้เป็น "ผู้ส่ง" เวลาส่ง PIN
 *                          ให้พนักงานทางอีเมล (เช่น hr@siammotor.com) — ต้องเป็นกล่องอีเมลจริง
 *                          ที่มีอยู่ในองค์กร ไม่ใช่ที่อยู่ลอยๆ
 *        LINE_CHANNEL_ACCESS_TOKEN = Channel access token (long-lived) ของ LINE Official Account
 *                          ที่บริษัทใช้ (LINE Developers Console → ช่อง Messaging API ของ OA นั้น
 *                          → ออก token) ใช้สำหรับปุ่ม "ส่ง Reminder" ช่องทาง LINE และสำหรับตอบกลับ
 *                          ข้อความใน webhook ด้านล่าง — ไม่เกี่ยวกับ Microsoft/Azure เลย เป็นความลับ
 *                          คนละชุดกับ CLIENT_SECRET
 *        LINE_CHANNEL_SECRET = Channel secret (คนละตัวกับ ACCESS_TOKEN ด้านบน — อยู่ในหน้า
 *                          "Basic settings" ของ Messaging API channel เดียวกันใน LINE Developers
 *                          Console) ใช้ตรวจลายเซ็น x-line-signature ของ webhook ด้านล่าง เพื่อ
 *                          พิสูจน์ว่าคำขอมาจาก LINE จริง ไม่ใช่ใครก็ได้ยิงมาปลอมๆ
 *   4. คัดลอก URL ของ Worker (เช่น https://sml-pms-proxy.<ชื่อบัญชี>.workers.dev) ไปกรอกที่
 *      หน้า "เชื่อมต่อ MS365 Excel" → แท็บ "ขั้นตอนตั้งค่า" ช่อง "Proxy URL" / "Proxy API Key"
 *      (ช่องเดียวกันนี้ยังเป็นที่เว็บเรียก /send-line ผ่าน ไม่มีหน้าตั้งค่าแยกสำหรับ LINE)
 *   5. ไปที่ LINE Developers Console → Messaging API channel ของ OA บริษัท → แท็บ "Messaging API"
 *      → ช่อง "Webhook URL" ใส่ `<Worker URL ข้อ 4>/webhook/line` แล้วกด "Verify" (ต้องเจอ 200 OK)
 *      → เปิด "Use webhook" เป็น ON → แนะนำปิด "Auto-reply messages"/"Greeting messages" ของ OA
 *      (ในแท็บ "Response settings") ไม่งั้นพนักงานจะเห็นทั้งข้อความทักทายอัตโนมัติของ LINE OA เอง
 *      ปนกับข้อความตอบกลับจริงจาก Worker นี้ สับสนว่าลงทะเบียนสำเร็จหรือไม่
 *
 * วิธีได้ LINE User ID ของพนักงานแต่ละคน (อัตโนมัติ ผ่าน webhook — แนะนำ):
 *   พนักงานเพิ่มเพื่อนกับ LINE OA ของบริษัท แล้วพิมพ์ "รหัสพนักงาน" ของตัวเอง (เช่น SML-001) ส่งไปที่
 *   OA ข้อความธรรมดา 1 ข้อความ — LINE จะยิง webhook event มาที่ /webhook/line ด้านล่าง ซึ่งจะ:
 *   ตรวจลายเซ็นก่อนว่ามาจาก LINE จริง → ค้นหารหัสที่พิมพ์มาในตาราง Employees จริง (ตัดช่องว่าง/ไม่
 *   สนตัวเล็ก-ใหญ่) → ถ้าเจอ จะบันทึก userId จริงของ LINE เข้าตาราง EmployeeSettings ให้พนักงานคนนั้น
 *   ทันที (คงค่า PinHash/EvalLevel/EvalExempt เดิมไว้ ไม่แตะ) แล้วตอบกลับยืนยันชื่อ-รหัสพนักงานที่จับคู่
 *   ได้ในแชท LINE — ถ้าพิมพ์รหัสผิด/ไม่พบ จะตอบกลับบอกตรงๆ ว่าไม่พบ ไม่เงียบ ไม่ทำอะไรลวกๆ ต่อให้
 *   อัตโนมัติแล้ว IT/Admin ยังสามารถพิมพ์ LINE User ID เข้าช่องในหน้าแก้ไขพนักงานของเว็บด้วยมือได้เสมอ
 *   (เช่น กรณีพนักงานพิมพ์ผ่าน OA ไม่ได้ด้วยเหตุผลใดก็ตาม) — สองทางนี้เขียนลงที่เดิม ไม่ชนกัน
 *
 * การรับทราบผลประเมินผ่าน LINE โดยตรง (ไม่ต้องเปิดเว็บ):
 *   เมื่อ GM อนุมัติผลประเมินของพนักงานคนหนึ่ง เว็บจะเรียก POST /send-line-ack (userId/empCode/
 *   empName/cycle) ให้ Worker ส่งข้อความ LINE แบบ Buttons Template ที่มีปุ่ม "✅ รับทราบผลการ
 *   ประเมิน" ฝัง code/cycle ของคนนั้นไว้ในตัว (postback data) — พนักงานกดปุ่มในแชทได้เลย LINE จะยิง
 *   webhook event ชนิด postback กลับมาที่ /webhook/line เดียวกับข้างบน handleLineEvent() จะแยกไป
 *   เรียก handleLineAckPostback() ซึ่งตรวจว่า LINE User ID ที่กดจริงตรงกับที่ลงทะเบียนไว้สำหรับ
 *   รหัสพนักงานนั้นหรือไม่ แล้วอัปเดตสถานะใบประเมินเป็น Acknowledged ตรงเข้า Excel ทั้งตาราง
 *   Appraisals (สถานะปัจจุบัน) และ Approvals (ประวัติ, คอมเมนต์ระบุ "ผ่าน LINE" ชัดเจน) ทันที — ทั้งหมด
 *   นี้เกิดฝั่ง Worker ล้วนๆ ไม่ผ่านเว็บไคลเอนต์เลย เว็บจะเห็นผลก็ต่อเมื่อ sync กลับมาภายหลัง (เหมือน
 *   ข้อมูลอื่นๆ ที่ sync จาก Excel ทุกจุดในเว็บ) ไม่ต้องตั้งค่า Secret เพิ่มจากที่มีอยู่แล้ว (ใช้
 *   LINE_CHANNEL_ACCESS_TOKEN/LINE_CHANNEL_SECRET ชุดเดิม)
 *
 *   #175: LINE Bot ส่งไฟล์ PDF แนบจริงให้ผู้ใช้ไม่ได้เลย (ข้อจำกัดจริงของ LINE Messaging API — ไม่มี
 *   message type สำหรับไฟล์ทั่วไปจาก bot ถึงผู้ใช้) จึงเพิ่มปุ่มที่สอง (type: uri) ใน Buttons Template
 *   เดียวกัน พาไปเปิดเว็บแอปจริงแทน — รับ ackLink (URL เว็บพร้อม ?ackCode=&ackCycle= สำหรับ prefill
 *   ช่อง login) มาจากเว็บไคลเอนต์ใน request body เดียวกับ Y/Z/X ถ้า Admin ไม่ได้ตั้งค่า "ลิงก์เว็บแอป"
 *   ไว้ที่หน้า MS365 Proxy (ackLink จะเป็นค่าว่าง) ปุ่มนี้จะไม่ถูกเพิ่มเลย — ไม่เดา URL จริงเอง
 *   (CLAUDE.md #14) ปุ่ม postback เดิมยังทำงานเหมือนเดิมทุกประการ ไม่กระทบกัน
 *
 * ข้อกำหนดฝั่ง Azure AD ที่ทีม IT/แอดมิน M365 ต้องทำ (ใครก็ตามที่มี Global/Application
 * Administrator หรือสิทธิ์เทียบเท่า):
 *   - App registrations → เพิ่ม API permission (Application, ไม่ใช่ Delegated):
 *       Microsoft Graph → Files.ReadWrite.All, Sites.Read.All, Mail.Send
 *   - กด "Grant admin consent" ให้ทุกสิทธิ์
 *   - แนะนำอย่างยิ่ง: ตั้ง SharePoint Application Access Policy จำกัดให้แอปนี้เข้าถึงได้แค่
 *     ไซต์ Chosiya-HR ไซต์เดียว ไม่ใช่ทั้งองค์กร (ลดผลกระทบถ้า Client Secret หลุด)
 *   - Mail.Send (Application) ให้แอปนี้ "ส่งอีเมลในนามใครก็ได้ในองค์กร" โดยดีฟอลต์ — แนะนำให้
 *     IT จำกัดด้วย Exchange Online Application Access Policy ให้ส่งได้แค่ในนาม SEND_AS_EMAIL
 *     กล่องเดียว (ดูคำสั่งท้ายไฟล์นี้)
 *
 * ความปลอดภัยของการเข้าถึง (#260): ผู้ใช้ต้อง POST /auth/login ด้วยรหัสพนักงาน + PIN ก่อน Worker ตรวจ PIN
 * เองฝั่งเซิร์ฟเวอร์ (เทียบ SHA-256 กับ PinHash ในตาราง EmployeeSettings ซึ่งไม่ส่งออกไปให้ไคลเอนต์ที่ไม่ใช่
 * Admin) แล้วออกบัตรผ่านที่เซ็นด้วย SESSION_SECRET ทุก endpoint อื่นต้องแนบ "Authorization: Bearer <token>"
 * และตรวจสิทธิ์ตามบทบาท (เขียนตารางสำคัญ/ลบ/dedupe = Admin เท่านั้น) — ไม่มีกุญแจร่วมฝังในหน้าเว็บอีกต่อไป
 * ลืม PIN (#302): /auth/forgot ส่ง OTP 6 หลักไปอีเมลของพนักงาน แล้ว /auth/reset ให้พนักงานตั้ง PIN ใหม่เอง (ต้องมี SEND_AS_EMAIL)
 * เปิดใช้งานครั้งแรก (#303): HR ออกรหัสเปิดใช้งาน (/admin/activation-codes) → พนักงาน /auth/activate/start (ยืนยันรหัส + ส่ง OTP ไปอีเมล) → /auth/activate/finish (ตั้ง PIN + ลงทะเบียนอีเมลในตาราง Employees คอลัมน์ J)
 * ข้อจำกัดที่เหลือ (รอบ 1): ยังไม่กรอง "รายแถว" ตามสังกัด (ผู้ล็อกอินอ่านตารางที่ไม่ใช่ EmployeeSettings ได้ทั้งตาราง)
 * และตัวนับ PIN ผิดอยู่ในหน่วยความจำของ Worker (รีเซ็ตเมื่อ isolate ถูกรีไซเคิล) — Application Access Policy
 * ที่จำกัดให้แอปเข้าถึงได้แค่ site เดียวยังจำเป็นเสมอ
 */

export default {
  async fetch(request, env, ctx) {
    _listEnv = env;
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    /* /webhook/line: LINE platform ยิงเข้ามาตรง ไม่มีบัตรผ่านของเว็บ — ใช้ x-line-signature
       (HMAC-SHA256 ของ body ด้วย LINE_CHANNEL_SECRET) พิสูจน์ตัวตนของ route นี้เอง จึงต้องเช็คก่อนด่านบัตรผ่าน */
    if (url.pathname === '/webhook/line' && request.method === 'POST') {
      return handleLineWebhook(request, env, ctx);
    }

    /* #260: ล็อกอินที่ Worker — เป็น route เดียวที่เปิดโดยไม่ต้องมีบัตรผ่าน (ตรวจ PIN เองแล้วออกบัตรให้) */
    if (url.pathname === '/auth/login' && request.method === 'POST') {
      try { return await handleLogin(request, env, cors); }
      catch (e) { return json({ error: String((e && e.message) || e) }, 500, cors); }
    }

    /* #302: ลืม PIN — พนักงานขอรหัสยืนยัน (OTP) ทางอีเมลที่ลงทะเบียนไว้แล้วตั้ง PIN ใหม่เอง (ยังไม่ล็อกอินจึงไม่มีบัตรผ่าน) */
    if ((url.pathname === '/auth/forgot' || url.pathname === '/auth/reset') && request.method === 'POST') {
      try { return await (url.pathname === '/auth/forgot' ? handleForgot : handleReset)(request, env, cors); }
      catch (e) { return json({ error: String((e && e.message) || e) }, 500, cors); }
    }

    /* #303: เปิดใช้งานครั้งแรก — รหัสเปิดใช้งานจาก HR + ยืนยันอีเมลด้วย OTP + ตั้ง PIN เอง */
    if ((url.pathname === '/auth/activate/start' || url.pathname === '/auth/activate/finish') && request.method === 'POST') {
      try { return await (url.pathname === '/auth/activate/start' ? handleActivateStart : handleActivateFinish)(request, env, cors); }
      catch (e) { return json({ error: String((e && e.message) || e) }, 500, cors); }
    }

    const auth = await authenticate(request, env);
    if (!auth) return json({ error: 'unauthorized' }, 401, cors);

    try {
      /* /send-line ไม่เกี่ยวกับ Microsoft/Azure เลยแม้แต่น้อย — ไม่ต้องขอ getAppToken() (ซึ่งเป็น
         token ของ Microsoft Graph) เลย วางไว้ก่อนบรรทัดนั้นโดยเจตนา เพื่อให้ช่องทาง LINE ทำงานได้
         แม้ TENANT_ID/CLIENT_ID/CLIENT_SECRET ของฝั่ง MS365 ยังตั้งไม่ครบ/ผิด */
      if (url.pathname === '/send-line' && request.method === 'POST') {
        const { userIds, message } = await request.json();
        if (!Array.isArray(userIds) || !userIds.length || !message) return json({ error: 'missing userIds/message' }, 400, cors);
        if (!env.LINE_CHANNEL_ACCESS_TOKEN) return json({ error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Worker' }, 500, cors);
        /* #260: ผู้ใช้ที่ไม่ใช่ Admin ส่งได้เฉพาะ LINE User ID ที่ลงทะเบียนไว้ในระบบจริง (กันใช้ Worker ยิงข้อความหาใครก็ได้) */
        if (!isAdminAuth(auth)) {
          const known = await registeredLineIds(env);
          if (userIds.some((u) => !known.has(String(u)))) return json({ error: 'forbidden: userId ไม่ได้ลงทะเบียนในระบบ' }, 403, cors);
        }
        await sendLineMulticast(env.LINE_CHANNEL_ACCESS_TOKEN, userIds, message);
        return json({ ok: true, count: userIds.length }, 200, cors);
      }

      /* #173: ผู้ใช้ขอให้พนักงานกดรับทราบผลได้ตรงในแชท LINE เอง (ไม่ต้องเปิดเว็บ) — ส่ง Buttons
         Template ให้คนเดียวจริง (ไม่ใช่ multicast แบบ /send-line ด้านบน เพราะข้อความนี้ฝัง
         code/cycle เฉพาะของคนนั้นไว้ในปุ่ม postback) ปุ่มที่กดจะยิง postback event กลับมาที่
         /webhook/line → handleLineEvent() จัดการ (อัปเดต Appraisals/Approvals ตรงๆ ฝั่ง Worker
         ไม่ผ่านเว็บไคลเอนต์เลย — ดูคอมเมนต์ที่ handleLineEvent() ด้านล่าง) เหตุผลเดียวกับ /send-line:
         ไม่เกี่ยวกับ Microsoft/Azure เลย วางไว้ก่อน getAppToken() */
      if (url.pathname === '/send-line-ack' && request.method === 'POST') {
        const { userId, empCode, empName, cycle, Y, Z, X, ackLink } = await request.json();
        if (!userId || !empCode || !cycle) return json({ error: 'missing userId/empCode/cycle' }, 400, cors);
        /* #260: userId ต้องเป็นของ empCode นั้นจริงตามตาราง EmployeeSettings (กันส่งปุ่มรับทราบของคนหนึ่งไปหาอีกคน) */
        if (!(await lineIdMatchesEmp(env, String(userId), String(empCode)))) return json({ error: 'forbidden: userId ไม่ตรงกับพนักงาน' }, 403, cors);
        if (!env.LINE_CHANNEL_ACCESS_TOKEN) return json({ error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Worker' }, 500, cors);
        /* #174: พนักงานต้องเห็นผลประเมินของตนเอง (Y/Z/X) ก่อนกดปุ่มรับทราบ — ไม่ใช่กดรับทราบ
           ข้อความทั่วไปแบบเดิมโดยไม่เห็นตัวเลขจริงเลย เกรดยังไม่ใส่ (ล็อกไว้จนกว่า MD อนุมัติ
           ขั้นสุดท้าย ตาม CLAUDE.md #156/#161) Buttons Template's `text` field จำกัดความยาวจริง
           ของ LINE (~160 ตัวอักษร) จึงตัดสำรองไว้ไม่ให้เกิน แม้ตัวเลขจะยาวผิดปกติ */
        const hasScore = Y != null && Z != null && X != null;
        const scorePart = hasScore
          ? `\nY=${Number(Y).toFixed(2)} Z=${Number(Z).toFixed(2)} X=${Number(X).toFixed(2)}\n(เกรดจะแสดงหลัง Calibration และอนุมัติขั้นสุดท้ายจาก MD)`
          : '';
        let bodyText = `ผลการประเมินของคุณรอบ ${cycle} ได้รับการอนุมัติจาก GM แล้ว${scorePart}\nกดปุ่มด้านล่างเพื่อรับทราบผลได้ทันที`;
        if (bodyText.length > 160) bodyText = bodyText.slice(0, 157) + '...';
        /* #175: LINE Bot ส่งไฟล์ PDF แนบจริงๆให้ผู้ใช้ไม่ได้ (Messaging API ไม่รองรับการส่งไฟล์ชนิดนี้
           จาก bot) — ทำได้แค่ส่ง "ลิงก์" ปุ่ม uri พาไปเปิดเว็บแอปจริง (ackLink มาจากเว็บไคลเอนต์ ซึ่ง
           Admin ต้องตั้งค่า "ลิงก์เว็บแอป" ไว้ก่อน ไม่งั้น ackLink จะเป็นค่าว่าง — ไม่เดา URL เอง ตาม #14)
           ปุ่มนี้พาไปหน้า login พร้อม prefill รหัสพนักงาน แล้วหลัง login ด้วย PIN จริงสำเร็จจะพาไปหน้า
           "8. ผลประเมิน" ที่มีทั้งคะแนนจริง ปุ่มดาวน์โหลด PDF และปุ่มรับทราบ ให้อัตโนมัติ — ไม่ได้ข้าม
           PIN เลย แค่ช่วยพาไปหน้าที่ถูกต้อง (ดู applySession() ฝั่งเว็บ) */
        const actions = [
          { type: 'postback', label: '✅ รับทราบผลการประเมิน', data: `action=ack&code=${encodeURIComponent(empCode)}&cycle=${encodeURIComponent(cycle)}`, displayText: '✅ รับทราบผลการประเมิน' },
        ];
        if (ackLink && /^https?:\/\//.test(ackLink)) {
          actions.push({ type: 'uri', label: '📄 ดูผลเต็ม/ดาวน์โหลด PDF', uri: ackLink });
        }
        const message = {
          type: 'template',
          altText: `ผลการประเมินของคุณ ${empName || empCode} รอบ ${cycle} ได้รับการอนุมัติจาก GM แล้ว — กรุณารับทราบในแชทนี้`,
          template: {
            type: 'buttons',
            text: bodyText,
            actions,
          },
        };
        await pushLineMessage(env.LINE_CHANNEL_ACCESS_TOKEN, userId, [message]);
        return json({ ok: true }, 200, cors);
      }

      const token = await getAppToken(env);

      /* /send-mail ไม่เกี่ยวกับ Excel เลย ไม่ต้อง resolveSite() (ซึ่งไปหา SharePoint site/ไฟล์)
         แยกไว้ต่างหาก กันไม่ให้การส่งอีเมลไปติดพังเวลา SITE_URL/FILE_PATH ตั้งค่าไม่ถูกโดยไม่จำเป็น */
      if (url.pathname === '/send-mail' && request.method === 'POST') {
        const { toEmail, toName, subject, body } = await request.json();
        if (!toEmail || !subject || !body) return json({ error: 'missing toEmail/subject/body' }, 400, cors);
        if (!env.SEND_AS_EMAIL) return json({ error: 'ยังไม่ได้ตั้งค่า SEND_AS_EMAIL ใน Worker' }, 500, cors);
        /* #260: ผู้ใช้ที่ไม่ใช่ Admin ส่งได้เฉพาะถึงอีเมลของพนักงานที่มีในตาราง Employees (กันใช้ Worker ส่งหาคนนอก) */
        if (!isAdminAuth(auth)) {
          const { driveId: d0, itemId: i0 } = await resolveSite(env, token);
          const emps = await listRows(token, d0, i0, 'Employees');
          const want = String(toEmail).trim().toLowerCase();
          if (!emps.some((r) => String(r[9] || '').trim().toLowerCase() === want)) return json({ error: 'forbidden: ผู้รับไม่ใช่พนักงานในระบบ' }, 403, cors);
        }
        await sendMail(token, env.SEND_AS_EMAIL, toEmail, toName, subject, body);
        return json({ ok: true }, 200, cors);
      }

      const { driveId, itemId, siteId } = await resolveSite(env, token);

      /* #264: ตั้งค่า/ย้าย list (Admin เท่านั้น) — ไม่ขึ้นกับ LIST_TABLES เพื่อให้ย้ายข้อมูลได้ก่อนสลับใช้งาน */
      /* #303: HR ออกรหัสเปิดใช้งาน (Admin เท่านั้น) — body {empCode?, days?}; ไม่ระบุ empCode = ทุกคนที่ยังไม่มี PIN */
      if (url.pathname === '/admin/activation-codes' && request.method === 'POST') {
        if (!isAdminAuth(auth)) return json({ error: 'forbidden: เฉพาะ Admin' }, 403, cors);
        if (!env.SESSION_SECRET) return json({ error: 'ยังไม่ได้ตั้งค่า SESSION_SECRET ใน Worker' }, 500, cors);
        const bi = await request.json().catch(() => ({}));
        const days = Math.min(60, Math.max(1, parseInt(bi.days, 10) || ACT_DEFAULT_DAYS));
        const [emps, sets] = await Promise.all([
          listRows(token, driveId, itemId, 'Employees'),
          listRows(token, driveId, itemId, 'EmployeeSettings'),
        ]);
        const want = bi.empCode ? String(bi.empCode).trim().toLowerCase() : '';
        const out = [];
        for (const e of emps) {
          const code = String(e[0] || '').trim();
          if (!code || String(e[15] || '').toLowerCase().includes('resign')) continue;
          if (want && code.toLowerCase() !== want) continue;
          const sr = sets.find((r) => String(r[0] || '').trim() === code);
          const pinHash = String((sr && sr[1]) || '').trim().toLowerCase();
          if (pinHash) { if (want) return json({ error: 'พนักงานคนนี้มี PIN แล้ว — ใช้ปุ่มตั้ง/รีเซ็ต PIN หรือให้ลืม PIN ตั้งเอง' }, 400, cors); continue; }
          const exp = actExpDay(days);
          out.push({ code, name: String(e[1] || '').trim(), activation: await makeActivation(env, code, exp, pinHash), email: String(e[9] || '').trim(), days });
        }
        if (want && !out.length) return json({ error: 'ไม่พบรหัสพนักงานนี้ (หรือลาออกแล้ว)' }, 404, cors);
        return json({ ok: true, codes: out }, 200, cors);
      }

      if (url.pathname === '/admin/list-setup' && request.method === 'POST') {
        const { table } = await request.json();
        if (!isAdminAuth(auth)) return json({ error: 'forbidden: เฉพาะ Admin' }, 403, cors);
        if (!(table in LIST_SCHEMAS)) return json({ error: 'ตารางนี้ยังไม่รองรับการย้ายไป List' }, 400, cors);
        const r = await ensureList(token, siteId, table);
        const ec = await ensureListColumns(token, siteId, table);
        if (ec.failed.length) {
          return json({ error: 'List "' + table + '" ขาดคอลัมน์ ' + ec.failed.map((f) => f.name).join(', ') + ' และเพิ่มเองไม่ได้ (' + ec.failed[0].error + ') — สร้างคอลัมน์ข้อความหลายบรรทัด (Plain text) ชื่อเหล่านี้ใน List แล้วลองใหม่' }, 400, cors);
        }
        return json({ ok: true, list: r, addedColumns: ec.added }, 200, cors);
      }
      if (url.pathname === '/admin/list-migrate' && request.method === 'POST') {
        const { table, offset } = await request.json();
        if (!isAdminAuth(auth)) return json({ error: 'forbidden: เฉพาะ Admin' }, 403, cors);
        if (!(table in LIST_SCHEMAS)) return json({ error: 'ตารางนี้ยังไม่รองรับการย้ายไป List' }, 400, cors);
        if (table in LIST_KEYS && isListBacked(env, table)) return json({ error: 'ตาราง ' + table + ' สลับไปใช้ List แล้ว — ห้ามย้ายซ้ำ (Excel เก่ากว่า List จะทับข้อมูลใหม่) ถ้าจะย้ายใหม่ให้ลบ ' + table + ' ออกจาก LIST_TABLES ก่อน' }, 400, cors);
        const r = await migrateTableToList(token, driveId, itemId, siteId, table, parseInt(offset, 10) || 0, 200);
        return json({ ok: true, ...r }, 200, cors);
      }

      /* #267: เก็บถาวร — ลบแถวเก่าออกจาก List (AuditLog/Approvals) หลังเว็บ export ไฟล์เก็บไว้แล้ว
         ทำได้เฉพาะตารางที่สลับไปใช้ List แล้ว, วันที่ตัดต้องเก่ากว่า 60 วัน (กันลบข้อมูลรอบปัจจุบัน), ลบทีละ ≤400 แถวต่อครั้ง */
      if (url.pathname === '/admin/list-archive' && request.method === 'POST') {
        const { table, before, dryRun } = await request.json();
        if (!isAdminAuth(auth)) return json({ error: 'forbidden: เฉพาะ Admin' }, 403, cors);
        if (!(table in ARCHIVE_DATE_COL)) return json({ error: 'ตารางนี้ไม่รองรับการเก็บถาวร' }, 400, cors);
        if (!isListBacked(env, table)) return json({ error: 'ตาราง ' + table + ' ยังไม่ได้สลับไปใช้ SharePoint List (LIST_TABLES) — เก็บถาวรได้เฉพาะตารางที่อยู่ใน List' }, 400, cors);
        const cutoff = Date.parse(before);
        if (isNaN(cutoff)) return json({ error: 'วันที่ตัดไม่ถูกต้อง' }, 400, cors);
        if (cutoff > Date.now() - 60 * 86400000) return json({ error: 'เก็บถาวรได้เฉพาะข้อมูลที่เก่ากว่า 60 วัน' }, 400, cors);
        const col = ARCHIVE_DATE_COL[table];
        const items = await listItemsPick(token, siteId, table, [col]);
        const old = items.filter((x) => { const t = Date.parse(x.v[col]); return !isNaN(t) && t < cutoff; });
        if (dryRun) return json({ ok: true, count: old.length, total: items.length, dryRun: true }, 200, cors);
        const batch = old.slice(0, 400);
        const reqs = batch.map((x) => ({ method: 'DELETE', url: `/sites/${siteId}/lists/${listSeg(table)}/items/${x.id}` }));
        try { await sendListBatches(token, siteId, table, reqs); }
        catch (e) { return json({ error: String(e.message || e).replace('ย้ายไม่สำเร็จ', 'ลบไม่สำเร็จ') }, 500, cors); }
        return json({ ok: true, deleted: batch.length, remaining: old.length - batch.length, total: items.length }, 200, cors);
      }

      /* #281: ล้างข้อมูลทดสอบ (Admin เท่านั้น) — เฉพาะตารางใน CLEARABLE_TABLES (ผล/ประวัติ/IDP ที่ระบบเขียนเอง)
         ลบทีละไม่เกิน CLEAR_CHUNK แถวต่อครั้ง ส่ง remaining กลับให้เว็บเรียกซ้ำจนหมด; dryRun=true นับอย่างเดียว */
      if (url.pathname === '/admin/clear-table' && request.method === 'POST') {
        const { table, dryRun } = await request.json();
        if (!isAdminAuth(auth)) return json({ error: 'forbidden: เฉพาะ Admin' }, 403, cors);
        if (!CLEARABLE_TABLES.includes(table)) return json({ error: 'ตารางนี้ไม่อนุญาตให้ล้าง' }, 400, cors);
        let total, deleted = 0;
        if (isListBacked(env, table)) {
          const items = await listItemsPick(token, siteId, table, [0]);
          total = items.length;
          if (!dryRun) {
            const batch = items.slice(0, 400);
            const reqs = batch.map((x) => ({ method: 'DELETE', url: `/sites/${siteId}/lists/${listSeg(table)}/items/${x.id}` }));
            try { await sendListBatches(token, siteId, table, reqs); }
            catch (e) { return json({ error: String(e.message || e).replace('ย้ายไม่สำเร็จ', 'ลบไม่สำเร็จ') }, 500, cors); }
            deleted = batch.length;
          }
        } else {
          const base = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(table)}')/rows`;
          const rows = (await fetchAllTableRowsRaw(token, base)).filter((r) => r.index !== undefined).sort((a, b) => b.index - a.index);
          total = rows.length;
          if (!dryRun) {
            // ลบจาก index มากไปน้อย — แถวที่เหลืออยู่ข้างบนไม่เลื่อนตำแหน่ง
            for (const r of rows.slice(0, CLEAR_CHUNK)) { await graphSend(token, base + `/itemAt(index=${r.index})`, 'DELETE'); deleted++; }
          }
        }
        return json({ ok: true, total, deleted, remaining: dryRun ? total : total - deleted, dryRun: !!dryRun }, 200, cors);
      }
      /* #281: เคลียร์ "ช่องกรอก" ของตารางที่มีคอลัมน์สูตร (Attendance) — คอลัมน์ที่เคลียร์กำหนดฝั่ง Worker เท่านั้น
         ไม่เคลียร์ EmpID/ชื่อ/รอบ และไม่แตะคอลัมน์สูตร (วันลารวม/Z Score) */
      if (url.pathname === '/admin/clear-columns' && request.method === 'POST') {
        const { table, dryRun } = await request.json();
        if (!isAdminAuth(auth)) return json({ error: 'forbidden: เฉพาะ Admin' }, 403, cors);
        const cols = CLEARABLE_COLUMNS[table];
        if (!cols) return json({ error: 'ตารางนี้ไม่รองรับการเคลียร์คอลัมน์' }, 400, cors);
        if (isListBacked(env, table)) return json({ error: 'ตารางอยู่ใน SharePoint List ไม่รองรับ' }, 400, cors);
        const tbl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(table)}')`;
        let rangeData = null;
        try { rangeData = await graphGet(token, tbl + '/dataBodyRange?$select=address,rowCount'); } catch (e) { rangeData = null; }
        const m = rangeData && /^(.+)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(rangeData.address || '');
        if (!m) return json({ ok: true, rows: 0, cleared: 0, dryRun: !!dryRun }, 200, cors);
        const sheetName = m[1], startCol = colLetterToIndex(m[2]), r1 = parseInt(m[3], 10), r2 = parseInt(m[5], 10);
        const nRows = r2 - r1 + 1;
        if (!dryRun) {
          for (const group of groupContiguous(cols.slice().sort((a, b) => a - b))) {
            const addr = `${sheetName}!${colIndexToLetter(startCol + group[0])}${r1}:${colIndexToLetter(startCol + group[group.length - 1])}${r2}`;
            const rangeUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${encodeURIComponent(addr)}')`;
            await graphSend(token, rangeUrl, 'PATCH', { values: Array.from({ length: nRows }, () => group.map(() => '')) });
          }
        }
        return json({ ok: true, rows: nRows, cleared: dryRun ? 0 : nRows, dryRun: !!dryRun }, 200, cors);
      }

      if (url.pathname === '/rows' && request.method === 'GET') {
        const table = url.searchParams.get('table');
        if (!table) return json({ error: 'missing table' }, 400, cors);
        let rows = isListBacked(env, table)
          ? await listItemRows(token, siteId, table, url.searchParams.get('limit'))
          : await listRows(token, driveId, itemId, table);
        if (!isAdminAuth(auth)) {
          const scope = computeScope(await loadEmpsCached(token, driveId, itemId), auth);
          rows = filterRowsByScope(table, rows, scope, auth);
        }
        /* #260: PinHash (คอลัมน์ 1 ของ EmployeeSettings) ไม่ส่งให้ผู้ใช้ที่ไม่ใช่ Admin — กัน hash ของ PIN ทุกคนรั่ว */
        if (table === 'EmployeeSettings' && !isAdminAuth(auth)) rows = rows.map((r) => { const c = r.slice(); c[1] = ''; return c; });
        return json({ rows }, 200, cors);
      }

      if (url.pathname === '/rows/add' && request.method === 'POST') {
        const { table, values } = await request.json();
        if (!table || !values) return json({ error: 'missing table/values' }, 400, cors);
        if (!canWrite(auth, table, 'add')) return json({ error: 'forbidden: ไม่มีสิทธิ์เขียนตาราง ' + table }, 403, cors);
        if (!isAdminAuth(auth) && table in ROW_SCOPE_COL) {
          const scope = computeScope(await loadEmpsCached(token, driveId, itemId), auth);
          if (!writeKeyOk(table, values[0], scope)) return json({ error: 'forbidden: เขียนได้เฉพาะข้อมูลของพนักงานในสังกัดตน' }, 403, cors);
        }
        if (isListBacked(env, table)) await addListItem(token, siteId, table, values);
        else await addRow(token, driveId, itemId, table, values);
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === '/rows/upsert' && request.method === 'POST') {
        const { table, keyColIndex, keyValue, values } = await request.json();
        if (!table || keyColIndex === undefined || keyValue === undefined || !values) {
          return json({ error: 'missing table/keyColIndex/keyValue/values' }, 400, cors);
        }
        const listBacked = isListBacked(env, table);
        if (listBacked && !(table in LIST_KEYS)) return json({ error: 'ตาราง ' + table + ' อยู่ใน SharePoint List ไม่รองรับการแก้/ลบรายแถว' }, 400, cors);
        if (!canWrite(auth, table, 'upsert')) return json({ error: 'forbidden: ไม่มีสิทธิ์เขียนตาราง ' + table }, 403, cors);
        if (!isAdminAuth(auth) && table in ROW_SCOPE_COL) {
          const scope = computeScope(await loadEmpsCached(token, driveId, itemId), auth);
          if (!writeKeyOk(table, values[0], scope) || !writeKeyOk(table, keyValue, scope)) return json({ error: 'forbidden: เขียนได้เฉพาะข้อมูลของพนักงานในสังกัดตน' }, 403, cors);
        }
        const result = listBacked
          ? await upsertListItem(token, siteId, table, keyColIndex, keyValue, values)
          : await upsertRow(token, driveId, itemId, table, keyColIndex, keyValue, values);
        return json({ ok: true, result }, 200, cors);
      }

      /* /rows/upsert-partial — เหมือน /rows/upsert แต่ "ไม่แตะ" คอลัมน์ที่อยู่ใน protectedCols
         เลยตอนอัปเดตแถวเดิม (ใช้ worksheet range PATCH เฉพาะกลุ่มคอลัมน์ที่ต่อเนื่องกัน แทนการ
         PATCH ทั้งแถวแบบ /rows/upsert) — มีไว้สำหรับตารางที่มีคอลัมน์สูตร Excel (เช่น "Attendance"
         คอลัมน์วันลารวม/Z Score ที่คำนวณสดในไฟล์จริง) ซึ่งการ PATCH ทั้งแถวแบบเดิมจะเขียนทับสูตร
         นั้นด้วยค่านิ่งทุกครั้ง — ดู CLAUDE.md #104/#106 ของเว็บ SML PMS */
      if (url.pathname === '/rows/upsert-partial' && request.method === 'POST') {
        const { table, keyColIndex, keyValue, values, protectedCols } = await request.json();
        if (!table || keyColIndex === undefined || keyValue === undefined || !values) {
          return json({ error: 'missing table/keyColIndex/keyValue/values' }, 400, cors);
        }
        if (isListBacked(env, table)) return json({ error: 'ตาราง ' + table + ' อยู่ใน SharePoint List ไม่รองรับการแก้/ลบรายแถว' }, 400, cors);
        if (!isAdminAuth(auth)) return json({ error: 'forbidden: เฉพาะ Admin' }, 403, cors);
        const result = await upsertRowPartial(token, driveId, itemId, table, keyColIndex, keyValue, values, protectedCols || []);
        return json({ ok: true, result }, 200, cors);
      }

      /* /rows/delete — ลบ "ทุกแถว" ในตารางที่คีย์ตรงกัน (ใช้ตรรกะจับคู่เดียวกับ /rows/upsert ทุกประการ:
         rowMatchesUpsertKey, อ่านครบทุกหน้า) ใช้กับ KPI_Goals ตอนลบ KPI จากหน้าเว็บ — ปฏิเสธคีย์ว่าง
         เพราะจะไปจับคู่กับ "เซลล์ว่าง" ของแถวอื่นแล้วลบผิดแถวได้ */
      if (url.pathname === '/rows/delete' && request.method === 'POST') {
        const { table, keyColIndex, keyValue } = await request.json();
        const keys = Array.isArray(keyValue) ? keyValue : [keyValue];
        if (!table || keyColIndex === undefined || keyValue === undefined || keys.some((k) => String(k ?? '').trim() === '')) {
          return json({ error: 'missing table/keyColIndex/keyValue (คีย์ต้องไม่ว่าง)' }, 400, cors);
        }
        const listBacked = isListBacked(env, table);
        if (listBacked && !(table in LIST_KEYS)) return json({ error: 'ตาราง ' + table + ' อยู่ใน SharePoint List ไม่รองรับการแก้/ลบรายแถว' }, 400, cors);
        if (!canWrite(auth, table, 'delete')) return json({ error: 'forbidden: ไม่มีสิทธิ์ลบตาราง ' + table }, 403, cors);
        if (!isAdminAuth(auth) && table in ROW_SCOPE_COL) {
          const scope = computeScope(await loadEmpsCached(token, driveId, itemId), auth);
          if (!writeKeyOk(table, keyValue, scope)) return json({ error: 'forbidden: ลบได้เฉพาะข้อมูลของพนักงานในสังกัดตน' }, 403, cors);
        }
        const deleted = listBacked
          ? await deleteListItems(token, siteId, table, keyColIndex, keyValue)
          : await deleteRows(token, driveId, itemId, table, keyColIndex, keyValue);
        return json({ ok: true, deleted }, 200, cors);
      }

      /* /rows/dedupe — ลบ "แถวซ้ำเก่า" ของตารางที่ถือ 1 เรื่อง = 1 แถวตามคีย์ผสม (เช่น Appraisals: EmpID+รอบ+ระดับ)
         เก็บไว้แถวเดียวต่อคีย์ = แถวที่ "สถานะก้าวหน้าที่สุด" (คอลัมน์สุดท้ายของแถว เทียบ EVAL_STATUS_ORDER)
         ถ้าสถานะเท่ากันเก็บแถวล่างสุด (เพิ่มทีหลังสุด) — dryRun=true คืนจำนวนที่จะลบโดยไม่ลบจริง
         ตรรกะวางแผน planDedupe() ต้องตรงกับฝั่งเว็บ (graphDedupeTableRows ใน SML_PMS_v14.html) ทุกประการ */
      if (url.pathname === '/rows/dedupe' && request.method === 'POST') {
        const { table, keyCols, dryRun } = await request.json();
        if (!table || !Array.isArray(keyCols) || !keyCols.length) {
          return json({ error: 'missing table/keyCols' }, 400, cors);
        }
        const listBacked = isListBacked(env, table);
        if (listBacked && !(table in LIST_KEYS)) return json({ error: 'ตาราง ' + table + ' อยู่ใน SharePoint List ไม่รองรับการแก้/ลบรายแถว' }, 400, cors);
        if (!isAdminAuth(auth)) return json({ error: 'forbidden: เฉพาะ Admin' }, 403, cors);
        const result = listBacked
          ? await dedupeListItems(token, siteId, table, keyCols, !!dryRun)
          : await dedupeRows(token, driveId, itemId, table, keyCols, !!dryRun);
        return json({ ok: true, ...result }, 200, cors);
      }

      return json({ error: 'not found' }, 404, cors);
    } catch (e) {
      return json({ error: String((e && e.message) || e) }, 500, cors);
    }
  },
};

// โทเคนแคชไว้ในหน่วยความจำของ Worker instance เดียว (อายุสั้น ปลอดภัยกว่าขอใหม่ทุกครั้ง)
let cachedToken = null;
let cachedTokenExp = 0;
async function getAppToken(env) {
  if (cachedToken && Date.now() < cachedTokenExp - 60000) return cachedToken;
  const res = await fetch(`https://login.microsoftonline.com/${env.TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.CLIENT_ID,
      client_secret: env.CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || 'token request failed');
  cachedToken = data.access_token;
  cachedTokenExp = Date.now() + data.expires_in * 1000;
  return cachedToken;
}

/* เดิม error จาก resolveSite() บอกแค่ "Requested site could not be found" เฉยๆ ไม่บอกว่า
   ลองเรียก URL ไหนไป ทำให้แยกไม่ออกว่า SITE_URL สะกดผิด/ไฟล์อยู่ผิดที่/หรือสิทธิ์ Application
   เข้าไซต์นี้ไม่ได้ ตอนนี้แต่ละขั้น (หา site → หา drive → หาไฟล์) จะห่อ error ด้วยข้อความบอก
   ชัดเจนว่ากำลังลองเรียกอะไร กับ URL จริงที่ใช้ ช่วยวินิจฉัยได้เองโดยไม่ต้องใช้ Graph Explorer */
let cachedSite = null;
async function resolveSite(env, token) {
  if (cachedSite) return cachedSite;
  const siteUrl = new URL(env.SITE_URL);
  const siteLookupUrl = `https://graph.microsoft.com/v1.0/sites/${siteUrl.hostname}:${siteUrl.pathname}`;
  let site;
  try {
    site = await graphGet(token, siteLookupUrl);
  } catch (e) {
    throw new Error(`หา SharePoint site ไม่เจอ (SITE_URL="${env.SITE_URL}", เรียก ${siteLookupUrl}): ${e.message}`);
  }
  let drive;
  try {
    drive = await graphGet(token, `https://graph.microsoft.com/v1.0/sites/${site.id}/drive`);
  } catch (e) {
    throw new Error(`เจอ site แล้ว (id=${site.id}) แต่หา document library (drive) ไม่เจอ: ${e.message}`);
  }
  const filePath = (env.FILE_PATH || 'SML_PMS_Master.xlsx').replace(/^\/+/, '');
  let item;
  try {
    item = await graphGet(token, `https://graph.microsoft.com/v1.0/sites/${site.id}/drive/root:/${encodeURI(filePath)}`);
  } catch (e) {
    throw new Error(`เจอ site/drive แล้ว แต่หาไฟล์ไม่เจอ (FILE_PATH="${env.FILE_PATH}"): ${e.message}`);
  }
  cachedSite = { driveId: drive.id, itemId: item.id, siteId: site.id };
  return cachedSite;
}

/* #292: Graph/SharePoint บางครั้งตอบเป็นหน้า HTML (502/503/504, ไฟล์ Excel ถูกล็อกขณะมีคนเปิดแก้) แทน JSON —
   โค้ดเดิม res.json() พังด้วย "Unexpected token '<'" ซึ่งไม่บอกสาเหตุจริง ตอนนี้: อ่านเป็นข้อความก่อน,
   ลองใหม่สูงสุด 3 ครั้งเมื่อเป็น 429/5xx/423/HTML (หน่วง 0.6s,1.2s) แล้วแจ้ง HTTP status จริง */
async function graphRequest(token, url, method, body) {
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 600 * attempt));
    const res = await fetch(url, {
      method,
      headers: method === 'GET' ? { Authorization: 'Bearer ' + token } : { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {}, isJson = true;
    try { data = text ? JSON.parse(text) : {}; } catch (e) { isJson = false; }
    if (res.ok && isJson) return data;
    const msg = isJson
      ? ((data.error && data.error.message) || 'Graph ' + method + ' failed: ' + res.status)
      : 'Graph ตอบกลับไม่ใช่ JSON (HTTP ' + res.status + ') — อาจเป็นช่วง SharePoint/Excel ไม่ว่างหรือไฟล์ถูกล็อก: ' + String(text).replace(/\s+/g, ' ').slice(0, 80);
    lastErr = new Error(msg);
    const retryable = !isJson || res.status === 429 || res.status === 423 || res.status >= 500;
    if (!retryable) throw lastErr;
  }
  throw lastErr;
}
async function graphGet(token, url) { return graphRequest(token, url, 'GET'); }
async function graphSend(token, url, method, body) { return graphRequest(token, url, method, body); }

/* ส่งอีเมลจริงในนาม SEND_AS_EMAIL (ต้องเป็นกล่องอีเมลจริงในองค์กร) ผ่าน Microsoft Graph
   /users/{email}/sendMail — endpoint นี้คืน 202 Accepted แบบไม่มี body เมื่อสำเร็จ */
async function sendMail(token, fromEmail, toEmail, toName, subject, bodyText) {
  const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(fromEmail)}/sendMail`;
  await graphSend(token, url, 'POST', {
    message: {
      subject,
      body: { contentType: 'Text', content: bodyText },
      toRecipients: [{ emailAddress: { address: toEmail, name: toName || toEmail } }],
    },
    saveToSentItems: true,
  });
}

/* ส่งข้อความ LINE จริงผ่าน LINE Messaging API /v2/bot/message/multicast — คนละ token/คนละ API
   กับ Microsoft Graph ทั้งหมด (LINE_CHANNEL_ACCESS_TOKEN เป็น token แบบคงที่อายุยาว ไม่ต้องขอใหม่
   ทุกครั้งแบบ getAppToken() ของฝั่ง MS365) multicast รับคนได้สูงสุด 500 คน/ครั้ง จึงแบ่งเป็นชุดๆ
   ถ้าเกิน — ชุดใดชุดหนึ่งพังจะ throw ออกไปทันที (ให้ /send-line ด้านบนรายงาน error ตามจริง ไม่กลืน) */
async function sendLineMulticast(token, userIds, text) {
  const chunks = [];
  for (let i = 0; i < userIds.length; i += 500) chunks.push(userIds.slice(i, i + 500));
  for (const chunk of chunks) {
    const res = await fetch('https://api.line.me/v2/bot/message/multicast', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: chunk, messages: [{ type: 'text', text }] }),
    });
    if (!res.ok) {
      const errText = await res.text();
      throw new Error('LINE multicast failed: ' + res.status + ' ' + errText);
    }
  }
}

/* ส่งข้อความ LINE ให้คนเดียวจริง (ต่าง sendLineMulticast ด้านบนตรงที่ไม่ broadcast ไปหลายคน) ผ่าน
   /v2/bot/message/push — ใช้กับ /send-line-ack ที่ต้องฝังข้อมูลเฉพาะของคนนั้น (code/cycle ใน
   ปุ่ม postback) ซึ่งทำผ่าน multicast ไม่ได้เพราะเนื้อข้อความต้องต่างกันต่อคน messages เป็นอาร์เรย์
   ของ LINE message object ใดก็ได้ (text/template/flex ฯลฯ) ไม่ใช่แค่ string ธรรมดาแบบ
   sendLineMulticast — ให้ /send-line-ack ด้านบนประกอบ message object เองตามชนิดที่ต้องการ */
async function pushLineMessage(token, userId, messages) {
  const res = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ to: userId, messages }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('LINE push failed: ' + res.status + ' ' + errText);
  }
}

/* ตอบกลับข้อความเดียวในแชท LINE ของคนที่เพิ่งส่งมา (ใช้ replyToken จาก event นั้นๆ เท่านั้น ใช้ได้
   ครั้งเดียวและมีอายุสั้นมาก — ต่างจาก sendLineMulticast ด้านบนที่ส่งแบบ broadcast ไปหลายคน)
   สำคัญ: ต้องเช็ค res.ok แล้วโยน error ถ้าพัง — เดิมฟังก์ชันนี้ fetch() เฉยๆไม่เช็คผลลัพธ์เลย ถ้า LINE
   ปฏิเสธ (เช่น replyToken หมดอายุ/ถูกใช้ซ้ำจากการทดสอบหลายรอบ, LINE_CHANNEL_ACCESS_TOKEN ผิด/หมดอายุ)
   โค้ดจะคิดว่าสำเร็จเงียบๆ — Cloudflare Logs จะขึ้น "0 Errors" ทั้งที่พนักงานไม่ได้รับข้อความจริง
   เป็นบั๊กรูปแบบเดียวกับ #149/#150 แค่อยู่ลึกลงไปอีกชั้น (ชั้นส่งข้อความเอง ไม่ใช่ชั้นเขียน Excel) */
async function replyLine(accessToken, replyToken, text) {
  if (!accessToken || !replyToken) throw new Error('replyLine: missing accessToken/replyToken');
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('LINE reply failed: ' + res.status + ' ' + errText);
  }
}

function arrayBufferToBase64(buf) {
  let binary = '';
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/* ตรวจว่า body จริงๆมาจาก LINE หรือไม่ — LINE เซ็น HMAC-SHA256 ของ raw request body ด้วย
   Channel secret แล้วส่งมาเป็น Base64 ใน header x-line-signature เราคำนวณซ้ำด้วย secret เดียวกัน
   แล้วเทียบว่าตรงกันทุกตัวอักษร (ไม่ใช่แค่ความยาว/ขึ้นต้นเหมือนกัน) ก่อนเชื่อ body นี้เลย */
async function verifyLineSignature(channelSecret, rawBody, signatureHeader) {
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  return arrayBufferToBase64(sigBuf) === signatureHeader;
}

/* ลำดับสถานะจริงของใบประเมิน — ต้องตรงกับ EVAL_STATUS_ORDER ใน SML_PMS_v14.html ทุกตัวอักษร
   (CLAUDE.md #41's precedent: client/Worker คนละที่ แชร์โค้ดกันไม่ได้ ต้องคัดลอกให้ตรงกันเองแล้ว
   แก้คู่กันเสมอถ้าฝั่งใดฝั่งหนึ่งเปลี่ยน) ใช้แค่เพื่อแยก "สถานะยังไม่ถึง GMApproved" (จริงๆ ไม่ควรเกิด
   เพราะปุ่มนี้ส่งหลัง GM อนุมัติเท่านั้น) ออกจาก "ผ่าน GMApproved ไปแล้ว" (รับทราบไปแล้วก่อนหน้านี้) */
const EVAL_STATUS_ORDER = ['Draft', 'Submitted', 'L1Reviewed', 'L2Reviewed', 'GMApproved', 'ResultSent', 'Acknowledged', 'Calibrated', 'CalibChecked', 'Approved'];
function evalStatusRank(status) {
  const i = EVAL_STATUS_ORDER.indexOf(status);
  return i < 0 ? -1 : i;
}

/* #173: จัดการปุ่ม "✅ รับทราบผลการประเมิน" ที่พนักงานกดตรงในแชท LINE (postback, ไม่ใช่ข้อความ
   ตัวอักษร) — ผู้ใช้เลือกแบบนี้แทนแบบ "ส่งลิงก์ให้เปิดเว็บ" เพื่อให้รับทราบได้จบในแชทเดียว ทำงานฝั่ง
   Worker ล้วนๆ โดยไม่ผ่านเว็บไคลเอนต์เลย (เว็บจะรู้ผลก็ต่อเมื่อ sync กลับมาจากตาราง Approvals/
   Appraisals ภายหลัง — ดู ms365SyncAppraisals()/ms365SyncAckChannel() ในเว็บ) ขั้นตอน:
   1) ตรวจว่า userId ที่กดจริงตรงกับ LineUserId ที่ลงทะเบียนไว้สำหรับรหัสพนักงานใน postback data
      หรือไม่ (ปุ่มถูกส่งถึง userId เดียวตอน push อยู่แล้ว แต่ตรวจซ้ำกันคนแชร์ข้อความ/ส่งต่อปุ่มกัน)
   2) อ่านแถว Appraisals จริงของ code+cycle นั้น ต้องมีสถานะ GMApproved พอดี (เงื่อนไขเดียวกับที่
      acknowledgeMyResult() ฝั่งเว็บใช้) — ถ้าผ่านไปไกลกว่านั้นแล้ว (Acknowledged ขึ้นไป) แปลว่ารับทราบ
      ไปแล้วก่อนหน้า ไม่ใช่ error แค่ไม่มีอะไรให้ทำซ้ำ
   3) อัปเดตสถานะเป็น Acknowledged (upsertRow ทั้งแถว คอลัมน์อื่นคงเดิมทุกตัว) + push แถว log ใหม่เข้า
      Approvals (append-only เหมือนทุก step อื่น — pushApprovalRecordToExcel() ฝั่งเว็บ) comment
      ระบุ "ผ่าน LINE" ชัดเจน ให้ ms365SyncAckChannel() ฝั่งเว็บอ่านช่องทางกลับไปแสดงในใบพิมพ์ได้
   แยกทุกขั้นเป็น try/catch ของตัวเอง + console.error ค่าจริงเสมอ (CLAUDE.md #10/#14/#66/#149/#150/#151
   ของเว็บ — ไม่เงียบ ไม่กลืน error) และตอบกลับในแชทเสมอไม่ว่าสำเร็จหรือไม่ (ไม่ใช่แค่เขียน log เฉยๆ) */
async function handleLineAckPostback(ev, env, token, driveId, itemId) {
  const userId = ev.source && ev.source.userId;
  const replyToken = ev.replyToken;
  const data = (ev.postback && ev.postback.data) || '';
  if (!userId || !replyToken) return;
  const params = new URLSearchParams(data);
  if (params.get('action') !== 'ack') return;
  const code = String(params.get('code') || '').trim();
  const cycle = String(params.get('cycle') || '').trim();
  if (!code || !cycle) return;

  let empName = code;
  try {
    const settingsRows = await listRows(token, driveId, itemId, 'EmployeeSettings');
    const existing = settingsRows.find((r) => String(r[0] || '').trim() === code);
    const registeredUserId = existing ? existing[5] || '' : '';
    if (!registeredUserId || registeredUserId !== userId) {
      await replyLine(
        env.LINE_CHANNEL_ACCESS_TOKEN,
        replyToken,
        '⚠️ ไม่สามารถยืนยันการรับทราบได้ — บัญชี LINE นี้ไม่ตรงกับที่ลงทะเบียนไว้สำหรับรหัสพนักงานนี้ กรุณารับทราบผ่านเว็บแทน หรือติดต่อ Admin'
      );
      return;
    }
  } catch (e) {
    console.error('handleLineAckPostback: EmployeeSettings lookup failed for', code, ':', (e && e.message) || e);
    await replyLine(
      env.LINE_CHANNEL_ACCESS_TOKEN,
      replyToken,
      '⚠️ ระบบขัดข้องชั่วคราว ไม่สามารถยืนยันการรับทราบได้ตอนนี้ กรุณาลองใหม่อีกครั้ง หรือกดรับทราบที่เว็บแทน'
    ).catch((e2) => console.error('handleLineAckPostback: fallback replyLine also failed:', (e2 && e2.message) || e2));
    return;
  }

  try {
    const empRows = await listRows(token, driveId, itemId, 'Employees');
    const emp = empRows.find((r) => String(r[0] || '').trim() === code);
    if (emp) empName = String(emp[1] || code).trim();
  } catch (e) {
    console.error('handleLineAckPostback: Employees lookup failed for', code, ':', (e && e.message) || e);
  }

  let outcome = 'error'; // 'saved' | 'already' | 'notfound' | 'error'
  try {
    const { siteId: ackSiteId } = await resolveSite(env, token);
    const appraisalRows = isListBacked(env, 'Appraisals')
      ? await listItemRows(token, ackSiteId, 'Appraisals')
      : await listRows(token, driveId, itemId, 'Appraisals');
    const row = appraisalRows.find((r) => String(r[0] || '').trim() === code && String(r[2] || '').trim() === cycle);
    if (!row) {
      outcome = 'notfound';
    } else {
      /* #238: หลัง #232 แถว Appraisals มีคอลัมน์ KPI ต่อท้าย — สถานะอยู่ index 22 (ไม่ใช่ช่องสุดท้าย) ใช้กฎเดียวกับ planDedupe */
      const statusIdx = row.length >= 23 ? 22 : row.length - 1;
      const status = String(row[statusIdx] || '').trim();
      if (status === 'ResultSent') { // #238: รับทราบได้เฉพาะหลัง GM ยืนยันส่งผลให้พนักงาน (ResultSent)
        const level = String(row[3] || '').trim();
        const updated = row.slice();
        updated[statusIdx] = 'Acknowledged';
        if (isListBacked(env, 'Appraisals')) await upsertListItem(token, ackSiteId, 'Appraisals', [0, 2, 3], [code, cycle, level], updated);
        else await upsertRow(token, driveId, itemId, 'Appraisals', [0, 2, 3], [code, cycle, level], updated);
        await appendRow(env, token, driveId, itemId, 'Approvals', [code, empName, cycle, 'Acknowledged', empName, new Date().toISOString(), 'รับทราบผลการประเมินผ่าน LINE']);
        outcome = 'saved';
      } else if (evalStatusRank(status) > evalStatusRank('ResultSent')) {
        outcome = 'already';
      } else {
        outcome = 'notfound'; // สถานะยังไม่ถึง GMApproved เลย (ไม่ควรเกิดจริง เพราะปุ่มส่งหลัง GM อนุมัติเท่านั้น)
      }
    }
  } catch (e) {
    console.error('handleLineAckPostback: Appraisals update failed for', code, cycle, ':', (e && e.message) || e);
    outcome = 'error';
  }

  try {
    const msg =
      outcome === 'saved'
        ? `✅ บันทึกการรับทราบผลประเมินของคุณ ${empName} รอบ ${cycle} เรียบร้อยแล้วครับ`
        : outcome === 'already'
        ? `คุณ ${empName} ได้กดรับทราบผลประเมินรอบ ${cycle} ไปแล้วก่อนหน้านี้ครับ`
        : outcome === 'notfound'
        ? `⚠️ ไม่พบผลประเมินของ ${empName} รอบ ${cycle} ที่รออนุมัติจาก GM อยู่ในขณะนี้ — กรุณารับทราบผ่านเว็บแทน หรือติดต่อ Admin`
        : `⚠️ ไม่สามารถบันทึกการรับทราบของ ${empName} รอบ ${cycle} ได้ในขณะนี้ (ระบบขัดข้องชั่วคราว) กรุณาลองใหม่อีกครั้ง หรือกดรับทราบที่เว็บแทน`;
    await replyLine(env.LINE_CHANNEL_ACCESS_TOKEN, replyToken, msg);
  } catch (e) {
    console.error('handleLineAckPostback: replyLine failed for', code, ':', (e && e.message) || e);
  }
}

/* รับ webhook event จาก LINE จริง 1 event — สนใจแค่ "ข้อความตัวอักษรธรรมดา" เท่านั้น (ไม่สน
   sticker/รูป/follow event อื่นๆ) เนื้อข้อความที่คาดหวังคือรหัสพนักงาน (เช่น SML-001) เทียบกับ
   ตาราง Employees จริงแบบตัดช่องว่าง+ไม่สนตัวเล็ก-ใหญ่ (ไม่ใช่เทียบชื่อ/เดา — เทียบรหัสตรงๆเท่านั้น
   ตาม CLAUDE.md #1 ของเว็บ) ถ้าเจอ จะเขียน userId จริงเข้า EmployeeSettings โดยคงค่า
   PinHash/EvalLevel/EvalExempt เดิมไว้ทุกประการ (ไม่แตะ ไม่เดา ไม่ล้าง) แล้วตอบกลับยืนยันในแชท —
   ถ้าไม่เจอรหัส ตอบกลับบอกตรงๆว่าไม่พบ ไม่เงียบ (ตาม CLAUDE.md #10/#14 ของเว็บ — ห้ามดูเหมือน
   ทำงานสำเร็จทั้งที่ไม่ได้เขียนอะไรจริง) ความผิดพลาดใดๆที่เกิดขึ้น (Graph ล่ม ฯลฯ) จะถูกจับโดย
   handleLineWebhook ด้านล่าง ไม่ทำให้ event อื่นในชุดเดียวกันพังตามไปด้วย */
async function handleLineEvent(ev, env, token, driveId, itemId) {
  /* #173: postback event (ปุ่ม "✅ รับทราบผลการประเมิน" ที่ /send-line-ack ส่งไป, ดูด้านบน) แยกไปอีก
     ฟังก์ชันหนึ่งโดยเฉพาะ — ไม่ใช่ "ข้อความตัวอักษร" แบบ flow เดิมด้านล่าง (ซึ่งยังคงทำงานเหมือนเดิม
     ทุกประการสำหรับการลงทะเบียน LINE User ID) */
  if (ev && ev.type === 'postback') { await handleLineAckPostback(ev, env, token, driveId, itemId); return; }
  if (!ev || ev.type !== 'message' || !ev.message || ev.message.type !== 'text') return;
  const userId = ev.source && ev.source.userId;
  const replyToken = ev.replyToken;
  if (!userId || !replyToken) return;
  const text = String(ev.message.text || '').trim();
  if (!text) return;

  const empRows = await listRows(token, driveId, itemId, 'Employees');
  const emp = empRows.find((r) => String(r[0] || '').trim().toLowerCase() === text.toLowerCase());
  if (!emp) {
    await replyLine(
      env.LINE_CHANNEL_ACCESS_TOKEN,
      replyToken,
      `ไม่พบรหัสพนักงาน "${text}" ในระบบ กรุณาพิมพ์รหัสพนักงานของตัวเองให้ถูกต้อง (เช่น SML-001) แล้วส่งมาใหม่`
    );
    return;
  }
  const empCode = String(emp[0]).trim();
  const empName = String(emp[1] || '').trim();

  /* หาตัวพนักงานได้แล้ว (ผ่านมาถึงนี่คือ listRows('Employees')/getAppToken/resolveSite ทำงานถูก
     ทั้งหมด) — แยก 2 ขั้นตอนออกจากกันชัดเจน: (1) บันทึกลง EmployeeSettings (2) ตอบกลับในแชท
     เพราะถ้ารวมไว้ใน try/catch เดียวกันเหมือนเดิม แล้ว replyLine() พังเอง (เช่น replyToken หมดอายุ
     จากการทดสอบซ้ำ) จะถูกเข้าใจผิดว่า "บันทึกข้อมูลไม่สำเร็จ" ทั้งที่จริงบันทึกสำเร็จแล้ว แค่ตอบกลับ
     ไม่สำเร็จเท่านั้น — ทั้งสองความล้มเหลวต้อง console.error ค่าจริงแยกกันให้เห็นใน Cloudflare Logs
     เสมอ ไม่เงียบแบบเดิม ตรงตาม CLAUDE.md #10/#14/#66 ของเว็บ */
  let saveOk = false;
  try {
    const settingsRows = await listRows(token, driveId, itemId, 'EmployeeSettings');
    const existing = settingsRows.find((r) => String(r[0] || '').trim() === empCode);
    const pinHash = existing ? existing[1] || '' : '';
    const evalLevel = existing ? existing[2] || '' : '';
    const evalExempt = existing ? existing[4] || '0' : '0';

    await upsertRow(token, driveId, itemId, 'EmployeeSettings', 0, empCode, [
      empCode,
      pinHash,
      evalLevel,
      new Date().toISOString(),
      evalExempt,
      userId,
    ]);
    saveOk = true;
  } catch (e) {
    console.error('handleLineEvent: EmployeeSettings save failed for', empCode, ':', (e && e.message) || e);
  }

  try {
    if (saveOk) {
      await replyLine(
        env.LINE_CHANNEL_ACCESS_TOKEN,
        replyToken,
        `✅ ลงทะเบียนรับการแจ้งเตือนทาง LINE สำเร็จ สำหรับ: ${empName} (${empCode})\nต่อไปนี้จะได้รับการแจ้งเตือนเรื่องการประเมินผลผ่าน LINE นี้`
      );
    } else {
      await replyLine(
        env.LINE_CHANNEL_ACCESS_TOKEN,
        replyToken,
        `⚠️ พบรหัสพนักงาน ${empName} (${empCode}) แล้ว แต่บันทึกข้อมูลไม่สำเร็จ (ระบบขัดข้องชั่วคราว) กรุณาแจ้ง Admin ให้ตรวจสอบ Log ของ Worker หรือลองพิมพ์รหัสส่งใหม่อีกครั้งในภายหลัง`
      );
    }
  } catch (e) {
    console.error('handleLineEvent: replyLine failed for', empCode, ':', (e && e.message) || e);
  }
}

/* จุดเข้า webhook จริง — ต้องตอบ 200 กลับ LINE เสมอไม่ว่าข้างในจะสำเร็จหรือพังยังไง (ไม่งั้น LINE
   จะเข้าใจว่า endpoint นี้ล่ม แล้วส่ง event ซ้ำๆมาเรื่อยๆ) ยกเว้นกรณีลายเซ็นไม่ถูกต้อง/ไม่ได้ตั้งค่า
   secret เลย ซึ่งต้องปฏิเสธจริงๆ (403/500) ไม่ใช่ปลอมว่า 200 แล้วไม่ทำอะไร

   สำคัญมาก (เจอจาก Cloudflare Logs จริง — "outcome":"canceled"): เดิมฟังก์ชันนี้ await ทุกขั้นตอน
   (getAppToken→resolveSite→listRows Employees→listRows/upsertRow EmployeeSettings→replyLine)
   ให้เสร็จ "ก่อน" ถึงจะส่ง Response 200 กลับ — ทั้งที่ LINE คาดหวังให้ webhook ตอบกลับเร็วมาก (ไม่กี่
   วินาที) ถ้า chain เรียก Microsoft Graph หลายรอบใช้เวลารวมนานเกินไป (วัดได้จริง ~2 วินาทีในเคส
   ที่เจอ) LINE จะตัดการเชื่อมต่อไปก่อนที่เราจะตอบทัน — Cloudflare เห็น request มาถึงจริง (log ขึ้น)
   และ Worker ไม่ error เลย (เพราะยังไม่ถึงจุดที่จะ error) แต่ "outcome" จะเป็น "canceled" แทนที่จะ
   เป็น "ok" และผลคือพนักงานไม่ได้รับการตอบกลับเลย ทั้งที่ Worker ถูกต้องทุกอย่าง แค่ตอบช้าเกินไป
   แก้โดยตอบ LINE ว่า 200 OK "ทันที" หลังตรวจลายเซ็นผ่านเท่านั้น แล้วค่อยประมวลผลจริง (เรียก Graph/
   บันทึก Excel/ตอบกลับแชท) แบบเบื้องหลังผ่าน ctx.waitUntil() — มาตรฐานที่ LINE เองแนะนำสำหรับ
   webhook ที่ทำงานช้า ctx อาจไม่มีในสภาพแวดล้อมทดสอบ (unit test เรียก worker.fetch(req, env) ตรงๆ
   ไม่ผ่าน runtime จริง) จึง fallback เป็น await ตรงๆ แทนในกรณีนั้น เพื่อให้ผลการทดสอบยังคงเดิม */
async function handleLineWebhook(request, env, ctx) {
  const rawBody = await request.text();
  if (!env.LINE_CHANNEL_SECRET) {
    return new Response('LINE_CHANNEL_SECRET not configured on Worker', { status: 500 });
  }
  const signature = request.headers.get('x-line-signature');
  const valid = await verifyLineSignature(env.LINE_CHANNEL_SECRET, rawBody, signature);
  if (!valid) return new Response('invalid signature', { status: 403 });

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch (e) {
    return new Response('bad json', { status: 400 });
  }
  const events = Array.isArray(payload.events) ? payload.events : [];

  const processEvents = async () => {
    try {
      const token = await getAppToken(env);
      const { driveId, itemId } = await resolveSite(env, token);
      for (const ev of events) {
        await handleLineEvent(ev, env, token, driveId, itemId).catch((e) => {
          console.error('handleLineEvent threw unexpectedly:', (e && e.message) || e);
        });
      }
    } catch (e) {
      // ปัญหาฝั่ง MS365/Graph เอง (TENANT_ID/CLIENT_ID/CLIENT_SECRET/SITE_URL/FILE_PATH ตั้งค่า
      // ไม่ถูก, token หมดอายุ, หา site/ไฟล์ไม่เจอ ฯลฯ) — เกิด "ก่อน" ที่ handleLineEvent() แม้แต่
      // รายการเดียวจะได้ทำงานเลย เพราะ getAppToken()/resolveSite() พังตั้งแต่ขั้นแรก ไม่เงียบไป
      // ทั้งหมดเหมือนเดิม (#150): ยังพยายามตอบข้อความ error จริงกลับไปในแชทให้ทุก event ที่เป็น
      // ข้อความตัวอักษรด้วย — ใช้ LINE_CHANNEL_ACCESS_TOKEN ได้ตามปกติ เพราะการส่งข้อความ LINE
      // ไม่ได้พึ่ง Microsoft Graph เลยแม้แต่น้อย (ตอน LINE ได้รับ 200 ไปแล้วตั้งแต่ก่อนหน้านี้ จึง
      // ไม่มี retry storm ให้กังวลอีกต่อไปในจุดนี้)
      console.error('handleLineWebhook outer MS365/Graph setup failed:', (e && e.message) || e);
      for (const ev of events) {
        if (ev && ev.type === 'message' && ev.message && ev.message.type === 'text' && ev.replyToken) {
          await replyLine(
            env.LINE_CHANNEL_ACCESS_TOKEN,
            ev.replyToken,
            '⚠️ ระบบเชื่อมต่อข้อมูลขัดข้องชั่วคราว ไม่สามารถตรวจสอบรหัสพนักงานได้ในขณะนี้ กรุณาลองพิมพ์รหัสพนักงานส่งใหม่อีกครั้งในภายหลัง หรือแจ้ง Admin ให้ตรวจสอบ Log ของ Worker'
          ).catch((e2) => console.error('handleLineWebhook: fallback replyLine also failed:', (e2 && e2.message) || e2));
        }
      }
    }
  };

  if (ctx && typeof ctx.waitUntil === 'function') {
    ctx.waitUntil(processEvents());
  } else {
    await processEvents();
  }
  return new Response('OK', { status: 200 });
}

// #159: ตารางที่มีแถวจำนวนมาก Graph อาจแบ่งหน้าด้วย @odata.nextLink — ต้องวนอ่านจนครบทุกหน้า
// ไม่ใช่แค่หน้าแรก มิฉะนั้น sync จะดึงข้อมูลที่ประเมินไปแล้วมาได้ไม่ครบ (เฉพาะกลุ่มแรกของตาราง)

/* ===== #264: ตารางที่ย้ายไปเก็บเป็น SharePoint List แทน Excel (เริ่มที่ AuditLog) =====
   เปิดใช้ด้วย env LIST_TABLES="AuditLog" (คั่นด้วยจุลภาค) — ถ้าไม่ตั้ง ทุกอย่างทำงานผ่าน Excel เหมือนเดิม
   สัญญา API กับเว็บ (/rows, /rows/add) ไม่เปลี่ยน: Worker แปลง list item <-> array ตามลำดับคอลัมน์เดิม
   List ใช้คอลัมน์ข้อความหลายบรรทัดชื่อ F0..F{n-1} (n จาก LIST_SCHEMAS) ชื่อ list = ชื่อตาราง */
const LIST_SCHEMAS = { AuditLog: 7, Approvals: 7, Appraisals: 24 };
// ตารางที่ "แก้แถวเดิม" (upsert/ลบ/ลบซ้ำ) ต้องระบุคอลัมน์คีย์ — ตารางที่ไม่อยู่ในนี้เป็นแบบเพิ่มแถวอย่างเดียว
const LIST_KEYS = { Appraisals: [0, 2, 3] };
// #267: คอลัมน์วันที่/เวลา (ISO) ของตารางที่เก็บถาวรได้ — AuditLog F0, Approvals F5
const ARCHIVE_DATE_COL = { AuditLog: 0, Approvals: 5 };
/* #281: ตารางที่ปุ่ม "ล้างข้อมูลทดสอบ" ลบได้ทั้งตาราง + คอลัมน์ช่องกรอกของ Attendance (D–H สาย/กลับก่อน/ป่วย/กิจ/ขาด, K หมายเหตุ) */
const CLEARABLE_TABLES = ['Appraisals', 'Approvals', 'AuditLog', 'IDP', 'AttendanceDetail']; /* #286: AttendanceDetail = ค่าดิบ วัน/ชม./นาที */
const CLEARABLE_COLUMNS = { Attendance: [3, 4, 5, 6, 7, 10] };
const CLEAR_CHUNK = 100;
const DEDUPE_STATUS_COL = 22;
function isListBacked(env, table) {
  if (!(table in LIST_SCHEMAS)) return false;
  return String(env.LIST_TABLES || '').split(',').map((x) => x.trim()).includes(table);
}
function listFieldNames(table) { return Array.from({ length: LIST_SCHEMAS[table] }, (_, i) => 'F' + i); }
// SharePoint อาจตั้งชื่อภายในของคอลัมน์ "F0" เป็น "_x0046_0" — อ่านชื่อภายในจริงจาก list แล้วใช้ตามนั้น (cache ต่อ isolate)
const _listFieldCache = {};
async function resolveListFields(token, siteId, table) {
  const def = listFieldNames(table);
  const ck = siteId + '|' + table + '|' + listSeg(table);
  if (_listFieldCache[ck]) return _listFieldCache[ck];
  try {
    const c = await graphGet(token, `${listBase(siteId, table)}/columns?$select=name,displayName&$top=200`);
    const cols = c.value || [];
    let allFound = true;
    const out = def.map((n, i) => {
      const hit = cols.find((x) => x.name === n) || cols.find((x) => x.name === '_x0046_' + i) || cols.find((x) => x.displayName === n);
      if (!hit) allFound = false;
      return hit ? hit.name : n;
    });
    if (allFound) _listFieldCache[ck] = out;
    return out;
  } catch (e) { return def; }
}
// ระบุ List ด้วยรหัส (GUID) ผ่าน env LIST_ID_<ชื่อตาราง> เช่น LIST_ID_AuditLog — ใช้เมื่อมี list ชื่อซ้ำหรือชื่อจับผิดตัว
let _listEnv = null;
function listSeg(table) {
  const id = _listEnv && String(_listEnv['LIST_ID_' + table] || '').trim().replace(/^(\{|%7B)/i, '').replace(/(\}|%7D)$/i, '');
  return id ? id : encodeURIComponent(table);
}
function listBase(siteId, table) {
  return `https://graph.microsoft.com/v1.0/sites/${siteId}/lists/${listSeg(table)}`;
}
async function listItemRows(token, siteId, table, limit) {
  const names = await resolveListFields(token, siteId, table);
  let url = `${listBase(siteId, table)}/items?$expand=${encodeURIComponent('fields($select=' + names.join(',') + ')')}&$top=999`;
  let rows = [];
  let guard = 0;
  while (url && guard < 200) {
    const data = await graphGet(token, url);
    rows = rows.concat((data.value || []).map((it) => names.map((n) => String((it.fields && it.fields[n]) ?? ''))));
    url = data['@odata.nextLink'] || null;
    guard++;
  }
  const lim = parseInt(limit, 10);
  return lim > 0 && rows.length > lim ? rows.slice(rows.length - lim) : rows;
}
function listFieldsFromValues(names, values) {
  const f = {};
  names.forEach((n, i) => { f[n] = String(values[i] ?? ''); });
  return f;
}
async function addListItem(token, siteId, table, values) {
  const names = await resolveListFields(token, siteId, table);
  return graphSend(token, `${listBase(siteId, table)}/items`, 'POST', { fields: listFieldsFromValues(names, values) });
}
async function countListItems(token, siteId, table) {
  let url = `${listBase(siteId, table)}/items?$select=id&$top=999`;
  let n = 0; let guard = 0;
  while (url && guard < 400) {
    const data = await graphGet(token, url);
    n += (data.value || []).length;
    url = data['@odata.nextLink'] || null;
    guard++;
  }
  return n;
}
/* อ่าน item ของ list เฉพาะบางคอลัมน์ + id ของ item — คืน [{id, v:[...ยาวเท่าจำนวนคอลัมน์ ช่องที่ไม่ได้เลือกเป็น '']}] เรียงตาม id */
async function listItemsPick(token, siteId, table, cols) {
  const names = await resolveListFields(token, siteId, table);
  const n = LIST_SCHEMAS[table];
  const sel = cols.map((c) => names[c]).join(',');
  let url = `${listBase(siteId, table)}/items?$expand=${encodeURIComponent('fields($select=' + sel + ')')}&$top=999`;
  const out = []; let guard = 0;
  while (url && guard < 200) {
    const data = await graphGet(token, url);
    for (const it of (data.value || [])) {
      const v = Array(n).fill('');
      cols.forEach((c) => { v[c] = String((it.fields && it.fields[names[c]]) ?? ''); });
      out.push({ id: String(it.id), v });
    }
    url = data['@odata.nextLink'] || null;
    guard++;
  }
  return out;
}
// upsert/ลบ/ลบซ้ำบน list — ตรรกะจับคู่เดียวกับ Excel ทุกประการ (rowMatchesUpsertKey / planDedupe)
async function upsertListItem(token, siteId, table, keyColIndex, keyValue, values) {
  const kc = Array.isArray(keyColIndex) ? keyColIndex : [keyColIndex];
  const items = await listItemsPick(token, siteId, table, kc);
  const matches = items.filter((x) => rowMatchesUpsertKey(x.v, keyColIndex, keyValue));
  if (matches.length) {
    const names = await resolveListFields(token, siteId, table);
    // อัปเดต "ทุกรายการ" ที่คีย์ตรงกัน (เหมือนฝั่ง Excel — #205) ไม่ใช่แค่รายการแรก
    for (const m of matches) {
      await graphSend(token, `${listBase(siteId, table)}/items/${m.id}/fields`, 'PATCH', listFieldsFromValues(names, values));
    }
    return 'updated';
  }
  await addListItem(token, siteId, table, values);
  return 'added';
}
async function deleteListItems(token, siteId, table, keyColIndex, keyValue) {
  const kc = Array.isArray(keyColIndex) ? keyColIndex : [keyColIndex];
  const items = await listItemsPick(token, siteId, table, kc);
  const matches = items.filter((x) => rowMatchesUpsertKey(x.v, keyColIndex, keyValue));
  for (const m of matches) await graphSend(token, `${listBase(siteId, table)}/items/${m.id}`, 'DELETE');
  return matches.length;
}
async function dedupeListItems(token, siteId, table, keyCols, dryRun) {
  const cols = Array.from(new Set([...keyCols, ...(LIST_SCHEMAS[table] > DEDUPE_STATUS_COL ? [DEDUPE_STATUS_COL] : [])]));
  const items = await listItemsPick(token, siteId, table, cols);
  const plan = planDedupe(items.map((x) => ({ index: parseInt(x.id, 10), values: [x.v] })), keyCols);
  if (!dryRun) {
    for (const idx of plan.toDelete) await graphSend(token, `${listBase(siteId, table)}/items/${idx}`, 'DELETE');
  }
  return { totalRows: items.length, dupGroups: plan.dupGroups, toDelete: plan.toDelete.length, deleted: dryRun ? 0 : plan.toDelete.length, dryRun };
}
// ส่ง $batch ทีละ 20 แล้วรายงานสาเหตุจริงถ้ามีรายการล้ม (รวมชื่อคอลัมน์ภายในของ list ให้เห็นว่าขาดอะไร)
async function sendListBatches(token, siteId, table, reqs) {
  for (let i = 0; i < reqs.length; i += 20) {
    const batch = reqs.slice(i, i + 20).map((r, j) => Object.assign({ id: String(j + 1) }, r));
    const res = await graphSend(token, 'https://graph.microsoft.com/v1.0/$batch', 'POST', { requests: batch });
    const bad = (res.responses || []).filter((r) => r.status >= 300);
    if (bad.length) {
      const msg = JSON.stringify((bad[0].body && bad[0].body.error && bad[0].body.error.message) || bad[0].status);
      let cols = '';
      try {
        const c = await graphGet(token, `${listBase(siteId, table)}/columns?$select=name,displayName&$top=100`);
        const li = await graphGet(token, `${listBase(siteId, table)}?$select=id,displayName,webUrl`);
        cols = ' | list ที่ใช้: ' + (li.webUrl || li.displayName) + ' | คอลัมน์ (ชื่อภายใน): ' + (c.value || []).map((x) => x.name).join(', ');
      } catch (e2) { cols = ' | อ่านคอลัมน์ไม่ได้: ' + e2.message; }
      throw new Error('ย้ายไม่สำเร็จ ' + bad.length + ' แถว: ' + msg + cols);
    }
  }
}
// เพิ่มคอลัมน์ F0..Fn ที่ขาดใน list (ถ้าสิทธิ์พอ) — ถ้าเพิ่มเองไม่ได้ คืนรายการที่ขาดให้ผู้ใช้สร้างเอง
async function ensureListColumns(token, siteId, table) {
  let cols;
  try {
    const c = await graphGet(token, `${listBase(siteId, table)}/columns?$select=name,displayName&$top=200`);
    cols = c.value || [];
  } catch (e) { return { added: [], failed: [], skipped: true }; }
  const added = [], failed = [];
  listFieldNames(table).forEach((n, i) => {
    const hit = cols.find((x) => x.name === n) || cols.find((x) => x.name === '_x0046_' + i) || cols.find((x) => x.displayName === n);
    if (!hit) failed.push({ name: n });
  });
  const stillMissing = [];
  for (const f of failed) {
    try {
      await graphSend(token, `${listBase(siteId, table)}/columns`, 'POST', { name: f.name, text: { allowMultipleLines: true } });
      added.push(f.name);
    } catch (e) { stillMissing.push({ name: f.name, error: e.message }); }
  }
  if (added.length) delete _listFieldCache[siteId + '|' + table + '|' + listSeg(table)];
  return { added, failed: stillMissing, skipped: false };
}
/* สร้าง list ถ้ายังไม่มี (ต้องมีสิทธิ์สร้าง list บน site — ถ้าไม่พอ คืนข้อความจาก Graph ให้สร้างมือ) */
async function ensureList(token, siteId, table) {
  let getErr = '';
  try {
    await graphGet(token, listBase(siteId, table));
    return 'exists';
  } catch (e) { getErr = e.message; }
  // สิทธิ์ Sites.Selected(write) อาจอ่าน "ตัวรายการ list" ไม่ได้ แต่อ่าน/เขียน item ได้ — ถ้าเข้าถึง item ได้ถือว่ามี list แล้ว
  try {
    await graphGet(token, `${listBase(siteId, table)}/items?$top=1&$select=id`);
    return 'exists';
  } catch (e) { getErr += ' | items: ' + e.message; }
  try {
    await graphSend(token, `https://graph.microsoft.com/v1.0/sites/${siteId}/lists`, 'POST', {
      displayName: table,
      columns: listFieldNames(table).map((n) => ({ name: n, text: { allowMultipleLines: true } })),
      list: { template: 'genericList' },
    });
  } catch (e) {
    // บอกว่า Worker เชื่อม site ไหนและเห็น list อะไรบ้าง เพื่อหาว่า list อยู่คนละ site หรือชื่อไม่ตรง
    let seen = '';
    try {
      const s = await graphGet(token, `https://graph.microsoft.com/v1.0/sites/${siteId}?$select=webUrl`);
      const ls = await graphGet(token, `https://graph.microsoft.com/v1.0/sites/${siteId}/lists?$select=displayName&$top=100`);
      seen = ' | site ที่ Worker ใช้: ' + (s.webUrl || siteId) + ' | list ที่เห็น: ' + ((ls.value || []).map((x) => x.displayName).join(', ') || '(ไม่มี)');
    } catch (e2) { seen = ' | อ่านรายชื่อ list ไม่ได้: ' + e2.message; }
    throw new Error('เข้าถึง List "' + table + '" ไม่ได้ (' + getErr + ') และสร้างเองไม่ได้ (' + e.message + ')' + seen);
  }
  return 'created';
}
/* ตารางที่ "แก้แถวเดิม" (Appraisals): ย้ายแบบ upsert ตามคีย์ — รันซ้ำได้ (อัปเดตรายการที่มีแล้ว/เพิ่มที่ยังไม่มี) จึงใช้ได้
   แม้ Excel ยังถูกแก้ระหว่างรอสลับ และลบแถวซ้ำเก่าให้ในตัว (เก็บแถวสถานะก้าวหน้าสุดต่อคีย์) — เหตุผลเดียวกับ planDedupe
   ห้ามรันหลังสลับ LIST_TABLES แล้ว (Excel จะเก่ากว่า list → ทับข้อมูลใหม่) ดูที่ route /admin/list-migrate */
async function migrateKeyedTableToList(token, driveId, itemId, siteId, table, offset, chunk) {
  const keyCols = LIST_KEYS[table];
  const excel = await listRows(token, driveId, itemId, table);
  const plan = planDedupe(excel.map((v, i) => ({ index: i, values: [v] })), keyCols);
  const drop = new Set(plan.toDelete);
  const surv = excel.filter((_, i) => !drop.has(i));
  const part = surv.slice(offset, offset + chunk);
  const fnames = await resolveListFields(token, siteId, table);
  const existing = await listItemsPick(token, siteId, table, keyCols);
  const keyOf = (v) => { const ps = keyCols.map((c) => String(v[c] ?? '').trim()); return ps.some((x) => x === '') ? null : ps.join('|'); };
  const idByKey = new Map();
  for (const x of existing) { const k = keyOf(x.v); if (k && !idByKey.has(k)) idByKey.set(k, x.id); }
  const reqs = part.map((vals) => {
    const k = keyOf(vals);
    const id = k ? idByKey.get(k) : null;
    return id
      ? { method: 'PATCH', url: `/sites/${siteId}/lists/${listSeg(table)}/items/${id}/fields`, headers: { 'Content-Type': 'application/json' }, body: listFieldsFromValues(fnames, vals) }
      : { method: 'POST', url: `/sites/${siteId}/lists/${listSeg(table)}/items`, headers: { 'Content-Type': 'application/json' }, body: { fields: listFieldsFromValues(fnames, vals) } };
  });
  await sendListBatches(token, siteId, table, reqs);
  const next = offset + part.length;
  return { total: surv.length, start: offset, migrated: part.length, next, done: next >= surv.length, droppedDuplicates: plan.toDelete.length };
}
/* ย้ายข้อมูลจาก Excel เข้า list ทีละก้อน (ทำซ้ำได้: เริ่มต่อจากจำนวนที่ย้ายไปแล้ว — ใช้ได้เพราะ AuditLog เป็น append-only) */
async function migrateTableToList(token, driveId, itemId, siteId, table, offset, chunk) {
  if (table in LIST_KEYS) return migrateKeyedTableToList(token, driveId, itemId, siteId, table, offset, chunk);
  const rows = await listRows(token, driveId, itemId, table);
  const fnames = await resolveListFields(token, siteId, table);
  let start = offset;
  if (start === 0) start = await countListItems(token, siteId, table);
  const part = rows.slice(start, start + chunk);
  for (let i = 0; i < part.length; i += 20) {
    const batch = part.slice(i, i + 20).map((vals, j) => ({
      id: String(j + 1), method: 'POST',
      url: `/sites/${siteId}/lists/${listSeg(table)}/items`,
      headers: { 'Content-Type': 'application/json' },
      body: { fields: listFieldsFromValues(fnames, vals) },
    }));
    const res = await graphSend(token, 'https://graph.microsoft.com/v1.0/$batch', 'POST', { requests: batch });
    const bad = (res.responses || []).filter((r) => r.status >= 300);
    if (bad.length) {
      const msg = JSON.stringify((bad[0].body && bad[0].body.error && bad[0].body.error.message) || bad[0].status);
      let cols = '';
      try {
        const c = await graphGet(token, `${listBase(siteId, table)}/columns?$select=name,displayName&$top=100`);
        const li = await graphGet(token, `${listBase(siteId, table)}?$select=id,displayName,webUrl`);
        cols = ' | list ที่ใช้: ' + (li.webUrl || li.displayName) + ' | คอลัมน์ (ชื่อภายใน): ' + (c.value || []).map((x) => x.name).join(', ');
      } catch (e2) { cols = ' | อ่านคอลัมน์ไม่ได้: ' + e2.message; }
      throw new Error('ย้ายไม่สำเร็จ ' + bad.length + ' แถว: ' + msg + cols);
    }
  }
  const next = start + part.length;
  return { total: rows.length, start, migrated: part.length, next, done: next >= rows.length };
}

async function listRows(token, driveId, itemId, table) {
  let url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(table)}')/rows`;
  let rows = [];
  let guard = 0;
  while (url && guard < 200) {
    const data = await graphGet(token, url);
    rows = rows.concat((data.value || []).map((r) => (r.values && r.values[0]) || []));
    url = data['@odata.nextLink'] || null;
    guard++;
  }
  return rows;
}
// #264: เพิ่มแถวต่อท้าย โดยเคารพ LIST_TABLES (ตารางที่ย้ายไป SharePoint List ต้องเขียนที่ List ไม่ใช่ Excel)
async function appendRow(env, token, driveId, itemId, table, values) {
  if (isListBacked(env, table)) {
    const { siteId } = await resolveSite(env, token);
    return addListItem(token, siteId, table, values);
  }
  return addRow(token, driveId, itemId, table, values);
}
async function addRow(token, driveId, itemId, table, values) {
  const base = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(table)}')/rows/add`;
  return graphSend(token, base, 'POST', { values: [values] });
}
// keyColIndex: ตัวเลขเดียว (คีย์คอลัมน์เดียว) หรืออาร์เรย์ของตัวเลข (คีย์ผสมหลายคอลัมน์ เช่น
// [empCodeCol, cycleCol, levelCol] สำหรับตาราง Appraisals ที่รหัสพนักงานอย่างเดียวไม่พอระบุแถว)
// keyValue ต้องเป็นอาร์เรย์คู่กันถ้า keyColIndex เป็นอาร์เรย์ — ต้องตรงกับตรรกะฝั่งเว็บ
// (rowMatchesUpsertKey ใน SML_PMS_v14.html) ทุกประการ
function rowMatchesUpsertKey(rowVals, keyColIndex, keyValue) {
  if (Array.isArray(keyColIndex)) {
    return keyColIndex.every((ci, i) => String(rowVals?.[ci] ?? '').trim() === String(keyValue[i]).trim());
  }
  return String(rowVals?.[keyColIndex] ?? '').trim() === String(keyValue).trim();
}
// #159: ตารางแถวเยอะอาจแบ่งหน้าด้วย @odata.nextLink — upsertRow()/upsertRowPartial() เดิมอ่านแค่
// หน้าแรกของ /rows ตรงๆ (ไม่วนเหมือน listRows() ที่แก้ไปแล้ว) ถ้าแถวจริงอยู่หน้าถัดไปจะหาไม่เจอ
// แล้ว "add" แถวใหม่ซ้ำแทนอัปเดตแถวเดิม — สาเหตุหนึ่งที่ทำให้มีแถวซ้ำสะสมใน Appraisals
async function fetchAllTableRowsRaw(token, base) {
  let url = base, rows = [], guard = 0;
  while (url && guard < 200) {
    const data = await graphGet(token, url);
    rows = rows.concat(data.value || []);
    url = data['@odata.nextLink'] || null;
    guard++;
  }
  return rows;
}
async function upsertRow(token, driveId, itemId, table, keyColIndex, keyValue, values) {
  const base = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(table)}')/rows`;
  const rows = await fetchAllTableRowsRaw(token, base);
  // อัปเดต "ทุกแถว" ที่คีย์ตรงกัน ไม่ใช่แค่แถวแรก — ถ้ามีแถวซ้ำของคนเดิมค้างอยู่ (เช่นจากก่อน
  // ตารางนี้เป็น upsert, หรือจาก bug อ่านไม่ครบหน้าข้างบน) การอัปเดตแค่แถวแรกจะทิ้งแถวซ้ำที่เหลือ
  // ไว้เป็นค่าเก่าตลอดไป — ผู้ใช้ที่บังเอิญดูแถวซ้ำนั้นจะเห็นเหมือน "บันทึกไม่ขึ้น Excel"
  const matches = rows.filter((r) => rowMatchesUpsertKey(r.values && r.values[0], keyColIndex, keyValue) && r.index !== undefined);
  if (matches.length) {
    for (const r of matches) {
      await graphSend(token, base + `/itemAt(index=${r.index})`, 'PATCH', { values: [values] });
    }
    return 'updated';
  }
  await graphSend(token, base + '/add', 'POST', { values: [values] });
  return 'added';
}

// ลบทุกแถวที่คีย์ตรงกัน — ลบจาก index มากไปน้อยเสมอ เพราะการลบแถวหนึ่งทำให้ index ของแถวที่อยู่ถัดลงไปเลื่อนขึ้น
// (ลบจากน้อยไปมากจะลบผิดแถวตั้งแต่แถวที่สองเป็นต้นไป)
async function deleteRows(token, driveId, itemId, table, keyColIndex, keyValue) {
  const base = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(table)}')/rows`;
  const rows = await fetchAllTableRowsRaw(token, base);
  const matches = rows
    .filter((r) => rowMatchesUpsertKey(r.values && r.values[0], keyColIndex, keyValue) && r.index !== undefined)
    .sort((a, b) => b.index - a.index);
  for (const r of matches) {
    await graphSend(token, base + `/itemAt(index=${r.index})`, 'DELETE');
  }
  return matches.length;
}

/* วางแผนลบแถวซ้ำ: คืน {groups, toDelete:[index...]} — ไม่แตะแถวที่คีย์ใดคีย์หนึ่งว่าง (ไม่ใช่แถวจริง) */
function planDedupe(rows, keyCols) {
  const groups = new Map();
  for (const r of rows) {
    if (r.index === undefined || !r.values) continue;
    const v = r.values[0] || []; // Graph ส่ง values เป็น 2 มิติ ([[...แถว...]]) เหมือน rowMatchesUpsertKey
    const parts = keyCols.map((c) => String(v[c] ?? '').trim());
    if (parts.some((p) => p === '')) continue;
    const k = parts.join('|');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const toDelete = [];
  let dupGroups = 0;
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    dupGroups++;
    let keep = list[0];
    for (const r of list) {
      const rv = r.values[0] || [], kv = keep.values[0] || [];
      const rr = evalStatusRank(String(rv[rv.length >= 23 ? 22 : rv.length - 1] ?? '').trim());
      const kr = evalStatusRank(String(kv[kv.length >= 23 ? 22 : kv.length - 1] ?? '').trim());
      if (rr > kr || (rr === kr && r.index > keep.index)) keep = r;
    }
    for (const r of list) if (r !== keep) toDelete.push(r.index);
  }
  toDelete.sort((a, b) => b - a); // ลบ index มาก→น้อย (ลบแล้ว index แถวถัดลงไปเลื่อนขึ้น)
  return { dupGroups, toDelete };
}
async function dedupeRows(token, driveId, itemId, table, keyCols, dryRun) {
  const base = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(table)}')/rows`;
  const rows = await fetchAllTableRowsRaw(token, base);
  const plan = planDedupe(rows, keyCols);
  if (!dryRun) {
    for (const idx of plan.toDelete) await graphSend(token, base + `/itemAt(index=${idx})`, 'DELETE');
  }
  return { totalRows: rows.length, dupGroups: plan.dupGroups, toDelete: plan.toDelete.length, deleted: dryRun ? 0 : plan.toDelete.length, dryRun };
}

function colIndexToLetter(idx) {
  let n = idx + 1, s = '';
  while (n > 0) { const r = (n - 1) % 26; s = String.fromCharCode(65 + r) + s; n = Math.floor((n - 1) / 26); }
  return s;
}
function colLetterToIndex(letters) {
  let n = 0;
  for (let i = 0; i < letters.length; i++) n = n * 26 + (letters.charCodeAt(i) - 64);
  return n - 1;
}
function groupContiguous(nums) {
  const groups = []; let cur = [];
  for (const n of nums) {
    if (cur.length && n !== cur[cur.length - 1] + 1) { groups.push(cur); cur = []; }
    cur.push(n);
  }
  if (cur.length) groups.push(cur);
  return groups;
}
/* อัปเดตแถวเดิมด้วย worksheet-range PATCH เฉพาะคอลัมน์ที่ไม่อยู่ใน protectedCols (กลุ่มคอลัมน์
   ต่อเนื่องกันถูกรวม PATCH เดียวกัน) แทนการ PATCH ทั้งแถว — คอลัมน์ที่ "ข้าม" (เช่น สูตร Excel)
   จะไม่ถูกแตะเลย คงค่า/สูตรเดิมไว้ ถ้ายังไม่มีแถวนี้ (รหัสใหม่) จะ add แถวเต็มตามปกติ — แถวใหม่
   ไม่มีสูตรเดิมให้รักษาอยู่แล้ว ค่าในตำแหน่ง protectedCols ของแถวใหม่จึงเป็นค่าว่าง/0 ตามที่ values
   ส่งมา จนกว่า HR จะพิมพ์สูตรเองหรือลากสูตรจากแถวข้างบนในไฟล์ Excel ครั้งเดียว (ไม่เกิดบ่อย เพราะ
   เป็นแค่ตอนมีรหัสพนักงานใหม่เข้าตารางนี้ครั้งแรก) */
async function upsertRowPartial(token, driveId, itemId, table, keyColIndex, keyValue, values, protectedCols) {
  const base = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(table)}')/rows`;
  const rows = await fetchAllTableRowsRaw(token, base);
  const matches = rows.filter((r) => rowMatchesUpsertKey(r.values && r.values[0], keyColIndex, keyValue) && r.index !== undefined);
  if (matches.length) {
    for (const r of matches) {
      const rangeData = await graphGet(token, base + `/itemAt(index=${r.index})/range`);
      const m = /^(.+)!([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(rangeData.address);
      if (!m) throw new Error('unexpected range address: ' + rangeData.address);
      const sheetName = m[1], rowNum = m[3];
      const startColIdx = colLetterToIndex(m[2]);
      const cols = values.map((_, i) => i).filter((i) => !protectedCols.includes(i));
      for (const group of groupContiguous(cols)) {
        const fromLetter = colIndexToLetter(startColIdx + group[0]);
        const toLetter = colIndexToLetter(startColIdx + group[group.length - 1]);
        const rangeAddr = `${sheetName}!${fromLetter}${rowNum}:${toLetter}${rowNum}`;
        const vals = group.map((i) => values[i]);
        const rangeUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/worksheets('${encodeURIComponent(sheetName)}')/range(address='${encodeURIComponent(rangeAddr)}')`;
        await graphSend(token, rangeUrl, 'PATCH', { values: [vals] });
      }
    }
    return 'updated-partial';
  }
  await graphSend(token, base + '/add', 'POST', { values: [values] });
  return 'added';
}

/* ===== #260: ล็อกอิน/บัตรผ่าน/สิทธิ์ตามบทบาท ===== */
const ADMIN_ROLES = ['admin', 'sysadmin'];
const SESSION_TTL_SEC = 8 * 3600;
/* ตารางที่ผู้ใช้ "ไม่ใช่ Admin" เขียนได้ (op: add/upsert/delete) — ที่เหลือทั้งหมด Admin เท่านั้น */
const NONADMIN_WRITE = {
  Appraisals: ['upsert'],
  Approvals: ['add'],
  AuditLog: ['add'],
  IDP: ['upsert', 'delete'],
};
function isAdminAuth(auth) { return !!auth && ADMIN_ROLES.includes(auth.role); }
function canWrite(auth, table, op) {
  if (isAdminAuth(auth)) return true;
  if (table === 'IDP' && auth.role === 'emp') return false;
  return (NONADMIN_WRITE[table] || []).includes(op);
}
/* เหมือน normalizeMs365Employee() ฝั่งเว็บ: แปลงข้อความบทบาทใน Excel เป็นรหัสบทบาท */
function normalizeRole(raw) {
  const r = String(raw || '').trim().toLowerCase();
  if (r.includes('sysadmin') || r.includes('super')) return 'sysadmin';
  if (r.includes('admin')) return 'admin';
  if (r.includes('exec')) return 'exec';
  if (r === 'gm' || r.includes('general manager')) return 'gm';
  if (r.includes('manager') || r === 'l2') return 'l2';
  if (r.includes('leader') || r === 'l1') return 'l1';
  if (r.includes('unit')) return 'unit';
  return r || 'emp';
}

/* ===== #262 (รอบ 2): กรอง "รายแถว" ตามสังกัดของผู้ล็อกอิน =====
   สำเนาตรรกะ getMyScopedEmpCodes() ของเว็บ (SML_PMS_v14.html) — ต้องแก้ให้ตรงกันทั้งสองไฟล์
   คอลัมน์ในตาราง Employees (ลำดับ EXCEL_EMPLOYEE_COLS): l1=11, l2=12, gm=13, approver=14
   ซึ่งตรงกับ MASTER_USERS: u[9]=l1, u[10]=l2, u[19]=gm (ผู้ตรวจ MGR L3), u[11]=approver (ผู้อนุมัติ GM L4)
   คืน null = เห็นได้ทั้งหมด (admin/sysadmin/exec) / Set ของรหัสพนักงานที่เห็นได้ (รวมตัวเอง) */
const EMPC = { id: 0, name: 1, role: 2, l1: 11, l2: 12, gm: 13, approver: 14, status: 15 };
function computeScope(emps, auth) {
  const myCode = String(auth.sub || '').trim();
  const role = auth.role;
  if (role === 'admin' || role === 'sysadmin' || role === 'exec') return null;
  const t = (v) => String(v == null ? '' : v).trim();
  const myName = t(auth.name);
  const rows = emps.map((r) => ({ code: t(r[EMPC.id]), name: t(r[EMPC.name]), role: normalizeRole(r[EMPC.role]),
    l1: t(r[EMPC.l1]), l2: t(r[EMPC.l2]), gm: t(r[EMPC.gm]), ap: t(r[EMPC.approver]) }));
  const set = new Set([myCode]);
  const addGm = () => rows.forEach((u) => { if (myName && u.ap === myName) set.add(u.code); });
  if (role === 'unit') {
    rows.forEach((u) => { if (myName && u.l1 === myName) set.add(u.code); });
    addGm();
  } else if (role === 'l1') {
    const direct = rows.filter((u) => myName && u.l1 === myName);
    direct.forEach((u) => set.add(u.code));
    rows.forEach((u) => { if (myName && u.l2 === myName) set.add(u.code); });
    direct.filter((u) => u.role === 'unit').forEach((h) => rows.forEach((u) => { if (u.l1 === h.name) set.add(u.code); }));
    addGm();
  } else if (role === 'l2') {
    rows.forEach((u) => { if (myName && u.gm === myName) set.add(u.code); });
    addGm();
  } else if (role === 'gm') {
    rows.forEach((u) => { if (myName && u.ap === myName) set.add(u.code); });
  }
  /* emp และบทบาทที่ไม่รู้จัก = เห็นแค่ของตัวเอง (เข้มกว่าเว็บซึ่งปล่อย emp ไว้ — ข้อมูลรายคนไม่จำเป็นต้องเห็นของคนอื่น) */
  return set;
}
/* ตาราง → คอลัมน์รหัสพนักงานที่ใช้กรองรายแถว (ตารางที่ไม่อยู่ในรายการ = ข้อมูลตั้งค่าทั่วไป เห็นได้ทุกคน) */
const ROW_SCOPE_COL = { Appraisals: 0, Attendance: 0, Approvals: 0, IDP: 0, AttendanceDetail: 0 };
const KPI_EMP_COL = 10;
let scopeCache = { at: 0, emps: null };
async function loadEmpsCached(token, driveId, itemId) {
  if (scopeCache.emps && Date.now() - scopeCache.at < 60000) return scopeCache.emps;
  const emps = await listRows(token, driveId, itemId, 'Employees');
  scopeCache = { at: Date.now(), emps };
  return emps;
}
function filterRowsByScope(table, rows, scope, auth) {
  if (!scope && isAdminAuth(auth) === false && auth.role !== 'exec') scope = new Set([String(auth.sub || '').trim()]);
  if (!scope) return rows;
  const inScope = (v) => scope.has(String(v == null ? '' : v).trim());
  if (table === 'AuditLog') return [];
  if (table === 'KPI_Goals') return rows.filter((r) => !String(r[KPI_EMP_COL] == null ? '' : r[KPI_EMP_COL]).trim() || inScope(r[KPI_EMP_COL]));
  if (table in ROW_SCOPE_COL) return rows.filter((r) => inScope(r[ROW_SCOPE_COL[table]]));
  return rows;
}
/* เขียนได้เฉพาะแถวของคนที่อยู่ใน scope ของตน (key = รหัสพนักงาน) */
function writeKeyOk(table, keyVal, scope) {
  if (!scope) return true;
  if (!(table in ROW_SCOPE_COL)) return true;
  const k = Array.isArray(keyVal) ? keyVal[0] : keyVal;
  return scope.has(String(k == null ? '' : k).trim());
}
function b64urlEncode(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlDecode(str) {
  let t = String(str).replace(/-/g, '+').replace(/_/g, '/');
  while (t.length % 4) t += '=';
  const bin = atob(t);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacKey(secret) {
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
async function issueToken(env, payload) {
  const body = b64urlEncode(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await hmacKey(env.SESSION_SECRET);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body)));
  return body + '.' + b64urlEncode(sig);
}
async function verifyToken(env, token) {
  if (!env.SESSION_SECRET || !token) return null;
  const parts = String(token).split('.');
  if (parts.length !== 2) return null;
  try {
    const key = await hmacKey(env.SESSION_SECRET);
    const ok = await crypto.subtle.verify('HMAC', key, b64urlDecode(parts[1]), new TextEncoder().encode(parts[0]));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    if (!p || !p.sub || !p.exp || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch (e) { return null; }
}
async function authenticate(request, env) {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  return m ? verifyToken(env, m[1].trim()) : null;
}
async function sha256Hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function timingSafeEqualStr(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
/* ตัวนับล็อกอินผิด (หน่วยความจำของ isolate — ดูข้อจำกัดในหัวไฟล์) */
const loginFails = new Map();
const LOGIN_MAX_PER_CODE = 5;
const LOGIN_MAX_PER_IP = 40;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
function lockRemainingMin(key) {
  const r = loginFails.get(key);
  if (!r || !r.until || r.until <= Date.now()) return 0;
  return Math.ceil((r.until - Date.now()) / 60000);
}
function registerFail(key, max) {
  if (loginFails.size > 5000) loginFails.clear();
  const r = loginFails.get(key) || { n: 0, until: 0 };
  if (r.until && r.until <= Date.now()) { r.n = 0; r.until = 0; }
  r.n++;
  if (r.n >= max) { r.until = Date.now() + LOGIN_LOCK_MS; r.n = 0; }
  loginFails.set(key, r);
}
async function handleLogin(request, env, cors) {
  if (!env.SESSION_SECRET) return json({ error: 'ยังไม่ได้ตั้งค่า SESSION_SECRET ใน Worker' }, 500, cors);
  let bodyIn = {};
  try { bodyIn = await request.json(); } catch (e) { /* ว่าง */ }
  const code = String(bodyIn.code || '').trim();
  const pin = String(bodyIn.pin || '').trim();
  if (!code || !pin) return json({ error: 'กรุณากรอกรหัสพนักงานและ PIN' }, 400, cors);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const kc = 'c:' + code.toLowerCase();
  const ki = ip ? 'i:' + ip : '';
  const lc = lockRemainingMin(kc);
  const li = ki ? lockRemainingMin(ki) : 0;
  if (lc || li) return json({ error: 'ใส่ PIN ผิดหลายครั้ง — ลองใหม่ในอีก ' + Math.max(lc, li) + ' นาที หรือให้ HR รีเซ็ต PIN' }, 429, cors);
  const token = await getAppToken(env);
  const { driveId, itemId } = await resolveSite(env, token);
  const [emps, sets] = await Promise.all([
    listRows(token, driveId, itemId, 'Employees'),
    listRows(token, driveId, itemId, 'EmployeeSettings'),
  ]);
  const fail = () => {
    registerFail(kc, LOGIN_MAX_PER_CODE);
    if (ki) registerFail(ki, LOGIN_MAX_PER_IP);
    return json({ error: 'รหัสพนักงานหรือ PIN ไม่ถูกต้อง' }, 401, cors);
  };
  const emp = emps.find((r) => String(r[0] || '').trim().toLowerCase() === code.toLowerCase());
  if (!emp) return fail();
  if (String(emp[15] || '').toLowerCase().includes('resign')) return fail();
  const setRow = sets.find((r) => String(r[0] || '').trim() === String(emp[0]).trim());
  const stored = String((setRow && setRow[1]) || '').trim().toLowerCase();
  if (!stored) return json({ error: 'บัญชีนี้ยังไม่ได้ตั้ง PIN — ติดต่อ HR เพื่อตั้ง PIN ก่อนเข้าใช้งาน' }, 403, cors);
  const given = await sha256Hex(pin);
  if (!timingSafeEqualStr(given, stored)) return fail();
  loginFails.delete(kc);
  const now = Math.floor(Date.now() / 1000);
  const role = normalizeRole(emp[2]);
  const payload = { sub: String(emp[0]).trim(), name: String(emp[1] || '').trim(), role, iat: now, exp: now + SESSION_TTL_SEC };
  return json({ token: await issueToken(env, payload), exp: payload.exp, user: { code: payload.sub, name: payload.name, role } }, 200, cors);
}
/* ===== #302: ลืม PIN → OTP ทางอีเมล → พนักงานตั้ง PIN ใหม่เอง =====
   ไม่เก็บสถานะที่ฝั่งเซิร์ฟเวอร์: challenge = เซ็น HMAC(SESSION_SECRET) ของ รหัส|หมดอายุ|OTP|PinHash ปัจจุบัน
   - OTP 6 หลักไม่อยู่ในคำตอบที่ส่งกลับเว็บ (ส่งทางอีเมลเท่านั้น) จึงเดาจากเว็บไม่ได้
   - ผูกกับ PinHash ปัจจุบัน → ตั้ง PIN สำเร็จแล้ว challenge/OTP เดิมใช้ซ้ำไม่ได้ (ใช้ครั้งเดียวโดยปริยาย)
   - อายุ 10 นาที, ใส่ OTP ผิดครบ 5 ครั้ง/รหัส (หรือ 40/IP) ล็อก 15 นาที, ขอ OTP ได้ไม่เกิน 3 ครั้ง/15 นาที/รหัส */
const RESET_OTP_TTL_SEC = 600;
const FORGOT_MAX_PER_CODE = 3;
async function otpSig(env, code, exp, otp, pinHash) {
  const key = await hmacKey(env.SESSION_SECRET);
  const data = new TextEncoder().encode([code.toLowerCase(), exp, otp, pinHash].join('|'));
  return b64urlEncode(new Uint8Array(await crypto.subtle.sign('HMAC', key, data)));
}
function maskEmail(e) {
  const [u, d] = String(e).split('@');
  if (!d) return '***';
  return (u.length <= 2 ? u[0] + '*' : u.slice(0, 2) + '***') + '@' + d;
}
async function lookupEmpForReset(env, code) {
  const token = await getAppToken(env);
  const { driveId, itemId } = await resolveSite(env, token);
  const [emps, sets] = await Promise.all([
    listRows(token, driveId, itemId, 'Employees'),
    listRows(token, driveId, itemId, 'EmployeeSettings'),
  ]);
  const emp = emps.find((r) => String(r[0] || '').trim().toLowerCase() === code.toLowerCase());
  const resigned = emp && String(emp[15] || '').toLowerCase().includes('resign');
  const setRow = emp ? sets.find((r) => String(r[0] || '').trim() === String(emp[0]).trim()) : null;
  return { token, driveId, itemId, emp: resigned ? null : emp, setRow };
}
async function handleForgot(request, env, cors) {
  if (!env.SESSION_SECRET) return json({ error: 'ยังไม่ได้ตั้งค่า SESSION_SECRET ใน Worker' }, 500, cors);
  if (!env.SEND_AS_EMAIL) return json({ error: 'ระบบยังไม่ได้ตั้งค่าอีเมลส่งออก — ติดต่อ HR เพื่อรีเซ็ต PIN' }, 500, cors);
  let b = {}; try { b = await request.json(); } catch (e) { /* ว่าง */ }
  const code = String(b.code || '').trim();
  if (!code) return json({ error: 'กรุณากรอกรหัสพนักงาน' }, 400, cors);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const kr = 'f:' + code.toLowerCase();
  const ki = ip ? 'fi:' + ip : '';
  const lk = Math.max(lockRemainingMin(kr), ki ? lockRemainingMin(ki) : 0);
  if (lk) return json({ error: 'ขอรหัสยืนยันบ่อยเกินไป — ลองใหม่ในอีก ' + lk + ' นาที' }, 429, cors);
  registerFail(kr, FORGOT_MAX_PER_CODE);
  if (ki) registerFail(ki, LOGIN_MAX_PER_IP);
  const generic = () => json({ error: 'ไม่พบรหัสพนักงานนี้ หรือยังไม่มีอีเมลในระบบ — ติดต่อ HR เพื่อรีเซ็ต PIN' }, 400, cors);
  const { token, emp, setRow } = await lookupEmpForReset(env, code);
  const email = emp ? String(emp[9] || '').trim() : '';
  if (!emp || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return generic();
  const otp = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const exp = Math.floor(Date.now() / 1000) + RESET_OTP_TTL_SEC;
  const pinHash = String((setRow && setRow[1]) || '').trim().toLowerCase();
  const sig = await otpSig(env, String(emp[0]).trim(), exp, otp, pinHash);
  await sendMail(token, env.SEND_AS_EMAIL, email, String(emp[1] || ''), 'รหัสยืนยันเพื่อตั้ง PIN ใหม่ SML PMS',
    `เรียนคุณ ${String(emp[1] || '').trim()} (${String(emp[0]).trim()})\n\nรหัสยืนยันสำหรับตั้ง PIN ใหม่ของคุณคือ: ${otp}\n(ใช้ได้ภายใน ${RESET_OTP_TTL_SEC / 60} นาที และใช้ได้ครั้งเดียว)\n\nหากคุณไม่ได้เป็นผู้ขอ กรุณาเพิกเฉยอีเมลนี้ PIN เดิมจะไม่ถูกเปลี่ยน — หากสงสัยว่ามีผู้อื่นพยายามเข้าบัญชี แจ้ง HR\n\n(อีเมลนี้ส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับ)`);
  return json({ ok: true, challenge: exp + '.' + sig, maskedEmail: maskEmail(email), ttlMin: RESET_OTP_TTL_SEC / 60 }, 200, cors);
}
async function handleReset(request, env, cors) {
  if (!env.SESSION_SECRET) return json({ error: 'ยังไม่ได้ตั้งค่า SESSION_SECRET ใน Worker' }, 500, cors);
  let b = {}; try { b = await request.json(); } catch (e) { /* ว่าง */ }
  const code = String(b.code || '').trim();
  const otp = String(b.otp || '').trim();
  const newPin = String(b.newPin || '').trim();
  const [expStr, sig] = String(b.challenge || '').split('.');
  const exp = parseInt(expStr, 10);
  if (!code || !otp || !sig || !exp) return json({ error: 'ข้อมูลไม่ครบ — กรุณาขอรหัสยืนยันใหม่' }, 400, cors);
  if (!/^\d{4,6}$/.test(newPin)) return json({ error: 'PIN ต้องเป็นตัวเลข 4-6 หลัก' }, 400, cors);
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const kc = 'r:' + code.toLowerCase();
  const ki = ip ? 'ri:' + ip : '';
  const lk = Math.max(lockRemainingMin(kc), ki ? lockRemainingMin(ki) : 0);
  if (lk) return json({ error: 'ใส่รหัสยืนยันผิดหลายครั้ง — ลองใหม่ในอีก ' + lk + ' นาที' }, 429, cors);
  const bad = (msg) => { registerFail(kc, LOGIN_MAX_PER_CODE); if (ki) registerFail(ki, LOGIN_MAX_PER_IP); return json({ error: msg }, 401, cors); };
  if (exp < Math.floor(Date.now() / 1000)) return json({ error: 'รหัสยืนยันหมดอายุ — กรุณาขอรหัสใหม่' }, 401, cors);
  const { token, driveId, itemId, emp, setRow } = await lookupEmpForReset(env, code);
  if (!emp) return bad('รหัสยืนยันไม่ถูกต้อง');
  const pinHash = String((setRow && setRow[1]) || '').trim().toLowerCase();
  const want = await otpSig(env, String(emp[0]).trim(), exp, otp, pinHash);
  if (!timingSafeEqualStr(want, sig)) return bad('รหัสยืนยันไม่ถูกต้อง หรือถูกใช้ไปแล้ว');
  /* เก็บคอลัมน์อื่นของ EmployeeSettings เดิมไว้ (ระดับแบบฟอร์ม/ยกเว้นประเมิน/LINE ID) เปลี่ยนเฉพาะ PinHash+เวลา */
  const old = setRow || [];
  const row = [String(emp[0]).trim(), await sha256Hex(newPin), old[2] || '', new Date().toISOString(), old[4] == null || old[4] === '' ? '0' : old[4], old[5] || ''];
  await upsertRow(token, driveId, itemId, 'EmployeeSettings', 0, String(emp[0]).trim(), row);
  try { await appendRow(env, token, driveId, itemId, 'AuditLog', [new Date().toISOString(), String(emp[0]).trim(), 'auth', 'พนักงานตั้ง PIN ใหม่เอง (ลืม PIN — ยืนยันด้วย OTP อีเมล)', String(emp[0]).trim(), String(emp[1] || ''), '']); } catch (e) { console.error('forgot-pin audit failed', String((e && e.message) || e)); }
  loginFails.delete(kc); loginFails.delete('c:' + code.toLowerCase()); loginFails.delete('f:' + code.toLowerCase());
  return json({ ok: true }, 200, cors);
}
/* ===== #303: เปิดใช้งานครั้งแรกด้วยรหัสจาก HR =====
   รหัสเปิดใช้งาน = [วันหมดอายุ 4 ตัว][ลายเซ็น 8 ตัว] (base32, แสดงเป็น XXXX-XXXX-XXXX) ไม่เก็บสถานะที่เซิร์ฟเวอร์:
   ลายเซ็น = HMAC(SESSION_SECRET) ของ รหัสพนักงาน|วันหมดอายุ|PinHash ปัจจุบัน(ว่าง) — ตั้ง PIN แล้วรหัสใช้ซ้ำไม่ได้ (ใช้ครั้งเดียวโดยปริยาย)
   ข้อจำกัด: ออกรหัสใหม่ไม่ยกเลิกรหัสเก่า (ไม่มีสถานะ) — รหัสเก่าใช้ได้จนกว่าจะหมดอายุหรือบัญชีมี PIN */
const ACT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ACT_DEFAULT_DAYS = 14;
const ACT_EPOCH_DAY = 18262; /* 2020-01-01 เป็นวันที่ (วันตั้งแต่ 1970) */
function actB32(n, len) { let o = ''; for (let i = 0; i < len; i++) { o = ACT_ALPHABET[n % 32] + o; n = Math.floor(n / 32); } return o; }
function actExpDay(days) { return Math.floor(Date.now() / 86400000) - ACT_EPOCH_DAY + days; }
async function hmacBytes(env, str) {
  const key = await hmacKey(env.SESSION_SECRET);
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(str)));
}
async function actSig(env, code, expDay, pinHash) {
  const b = await hmacBytes(env, ['act', code.toLowerCase(), expDay, pinHash].join('|'));
  let n = 0; for (let i = 0; i < 5; i++) n = n * 256 + b[i];
  return actB32(n, 8);
}
async function makeActivation(env, code, expDay, pinHash) {
  const raw = actB32(expDay, 4) + (await actSig(env, code, expDay, pinHash));
  return raw.slice(0, 4) + '-' + raw.slice(4, 8) + '-' + raw.slice(8);
}
async function verifyActivation(env, code, act, pinHash) {
  const raw = String(act || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (raw.length !== 12) return 'bad';
  let expDay = 0; for (const ch of raw.slice(0, 4)) { const v = ACT_ALPHABET.indexOf(ch); if (v < 0) return 'bad'; expDay = expDay * 32 + v; }
  const want = await actSig(env, code, expDay, pinHash);
  if (!timingSafeEqualStr(want, raw.slice(4))) return 'bad';
  if (Math.floor(Date.now() / 86400000) - ACT_EPOCH_DAY > expDay) return 'expired';
  return 'ok';
}
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
/* ตรวจรหัสเปิดใช้งาน + สถานะบัญชี (ต้องยังไม่มี PIN) — ใช้ร่วมกันทั้ง start/finish */
async function checkActivation(env, request, cors, b, bucket) {
  const code = String(b.code || '').trim();
  const act = String(b.activation || '').trim();
  if (!code || !act) return { err: json({ error: 'กรุณากรอกรหัสพนักงานและรหัสเปิดใช้งาน' }, 400, cors) };
  const ip = request.headers.get('CF-Connecting-IP') || '';
  const kc = bucket + ':' + code.toLowerCase();
  const ki = ip ? bucket + 'i:' + ip : '';
  const lk = Math.max(lockRemainingMin(kc), ki ? lockRemainingMin(ki) : 0);
  if (lk) return { err: json({ error: 'ลองผิดหลายครั้ง — ลองใหม่ในอีก ' + lk + ' นาที หรือติดต่อ HR' }, 429, cors) };
  const bad = (msg) => { registerFail(kc, LOGIN_MAX_PER_CODE); if (ki) registerFail(ki, LOGIN_MAX_PER_IP); return { err: json({ error: msg }, 401, cors) }; };
  const ctx = await lookupEmpForReset(env, code);
  const generic = 'รหัสพนักงานหรือรหัสเปิดใช้งานไม่ถูกต้อง';
  if (!ctx.emp) return bad(generic);
  const pinHash = String((ctx.setRow && ctx.setRow[1]) || '').trim().toLowerCase();
  if (pinHash) return { err: json({ error: 'บัญชีนี้ตั้ง PIN แล้ว — เข้าสู่ระบบได้เลย (ลืม PIN ใช้ "ลืม PIN?")' }, 400, cors) };
  const v = await verifyActivation(env, code, act, pinHash);
  if (v === 'expired') return { err: json({ error: 'รหัสเปิดใช้งานหมดอายุ — ขอรหัสใหม่จาก HR' }, 401, cors) };
  if (v !== 'ok') return bad(generic);
  const onFile = String(ctx.emp[9] || '').trim();
  const typed = String(b.email || '').trim();
  const email = EMAIL_RE.test(onFile) ? onFile : typed;
  if (!EMAIL_RE.test(email)) return { err: json({ error: 'กรุณากรอกอีเมลที่ใช้งานได้จริง' }, 400, cors) };
  return { ctx, code, pinHash, email, usedOnFile: EMAIL_RE.test(onFile), kc, ki };
}
async function handleActivateStart(request, env, cors) {
  if (!env.SESSION_SECRET) return json({ error: 'ยังไม่ได้ตั้งค่า SESSION_SECRET ใน Worker' }, 500, cors);
  if (!env.SEND_AS_EMAIL) return json({ error: 'ระบบยังไม่ได้ตั้งค่าอีเมลส่งออก — ติดต่อ HR' }, 500, cors);
  let b = {}; try { b = await request.json(); } catch (e) { /* ว่าง */ }
  const r = await checkActivation(env, request, cors, b, 'a');
  if (r.err) return r.err;
  /* จำกัดการส่ง OTP ต่อรหัส (กันถล่มอีเมล) */
  const ks = 'as:' + r.code.toLowerCase();
  if (lockRemainingMin(ks)) return json({ error: 'ขอรหัสยืนยันบ่อยเกินไป — ลองใหม่ภายหลัง' }, 429, cors);
  registerFail(ks, FORGOT_MAX_PER_CODE);
  const otp = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
  const exp = Math.floor(Date.now() / 1000) + RESET_OTP_TTL_SEC;
  const sig = b64urlEncode(await hmacBytes(env, ['actotp', r.code.toLowerCase(), exp, otp, r.email.toLowerCase()].join('|')));
  const emp = r.ctx.emp;
  await sendMail(r.ctx.token, env.SEND_AS_EMAIL, r.email, String(emp[1] || ''), 'รหัสยืนยันอีเมลเพื่อเปิดใช้งาน SML PMS',
    `เรียนคุณ ${String(emp[1] || '').trim()} (${r.code})\n\nรหัสยืนยันอีเมลสำหรับเปิดใช้งานบัญชี SML PMS ของคุณคือ: ${otp}\n(ใช้ได้ภายใน ${RESET_OTP_TTL_SEC / 60} นาที)\n\nหากคุณไม่ได้เป็นผู้ขอ กรุณาเพิกเฉยอีเมลนี้\n\n(อีเมลนี้ส่งโดยระบบอัตโนมัติ กรุณาอย่าตอบกลับ)`);
  return json({ ok: true, challenge: exp + '.' + sig, maskedEmail: maskEmail(r.email), usedOnFile: r.usedOnFile, ttlMin: RESET_OTP_TTL_SEC / 60 }, 200, cors);
}
async function handleActivateFinish(request, env, cors) {
  if (!env.SESSION_SECRET) return json({ error: 'ยังไม่ได้ตั้งค่า SESSION_SECRET ใน Worker' }, 500, cors);
  let b = {}; try { b = await request.json(); } catch (e) { /* ว่าง */ }
  const otp = String(b.otp || '').trim();
  const newPin = String(b.newPin || '').trim();
  const [expStr, sig] = String(b.challenge || '').split('.');
  const exp = parseInt(expStr, 10);
  if (!otp || !sig || !exp) return json({ error: 'ข้อมูลไม่ครบ — กรุณาขอรหัสยืนยันใหม่' }, 400, cors);
  if (!/^\d{4,6}$/.test(newPin)) return json({ error: 'PIN ต้องเป็นตัวเลข 4-6 หลัก' }, 400, cors);
  if (exp < Math.floor(Date.now() / 1000)) return json({ error: 'รหัสยืนยันหมดอายุ — กรุณาขอรหัสใหม่' }, 401, cors);
  const r = await checkActivation(env, request, cors, b, 'a');
  if (r.err) return r.err;
  const want = b64urlEncode(await hmacBytes(env, ['actotp', r.code.toLowerCase(), exp, otp, r.email.toLowerCase()].join('|')));
  if (!timingSafeEqualStr(want, sig)) {
    registerFail(r.kc, LOGIN_MAX_PER_CODE); if (r.ki) registerFail(r.ki, LOGIN_MAX_PER_IP);
    return json({ error: 'รหัสยืนยันอีเมลไม่ถูกต้อง' }, 401, cors);
  }
  const { token, driveId, itemId, emp, setRow } = r.ctx;
  const idc = String(emp[0]).trim();
  /* อีเมล: เขียนเฉพาะคอลัมน์ J ของตาราง Employees (ไม่แตะคอลัมน์อื่น/สูตร) และเฉพาะเมื่อ HR ยังไม่เคยลงไว้ */
  if (!r.usedOnFile) {
    const vals = new Array(10).fill(''); vals[9] = r.email;
    await upsertRowPartial(token, driveId, itemId, 'Employees', 0, idc, vals, [0, 1, 2, 3, 4, 5, 6, 7, 8]);
    scopeCache = { at: 0, emps: null };
  }
  const old = setRow || [];
  const row = [idc, await sha256Hex(newPin), old[2] || '', new Date().toISOString(), old[4] == null || old[4] === '' ? '0' : old[4], old[5] || ''];
  await upsertRow(token, driveId, itemId, 'EmployeeSettings', 0, idc, row);
  try { await appendRow(env, token, driveId, itemId, 'AuditLog', [new Date().toISOString(), idc, 'auth', 'พนักงานเปิดใช้งานบัญชีเอง (รหัสจาก HR + ยืนยันอีเมล' + (r.usedOnFile ? '' : ' + ลงทะเบียนอีเมลใหม่') + ')', idc, String(emp[1] || ''), '']); } catch (e) { console.error('activate audit failed', String((e && e.message) || e)); }
  loginFails.delete(r.kc);
  return json({ ok: true, emailRegistered: !r.usedOnFile }, 200, cors);
}
/* LINE User ID ที่ลงทะเบียนไว้ (EmployeeSettings คอลัมน์ 5) */
async function registeredLineIds(env) {
  const token = await getAppToken(env);
  const { driveId, itemId } = await resolveSite(env, token);
  const sets = await listRows(token, driveId, itemId, 'EmployeeSettings');
  return new Set(sets.map((r) => String(r[5] || '').trim()).filter(Boolean));
}
async function lineIdMatchesEmp(env, userId, empCode) {
  const token = await getAppToken(env);
  const { driveId, itemId } = await resolveSite(env, token);
  const sets = await listRows(token, driveId, itemId, 'EmployeeSettings');
  const row = sets.find((r) => String(r[0] || '').trim() === empCode.trim());
  return !!row && String(row[5] || '').trim() === userId.trim();
}

function json(obj, status, headers) {
  return new Response(JSON.stringify(obj), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

/*
 * จำกัดสิทธิ์ Mail.Send ให้ส่งได้แค่ในนาม SEND_AS_EMAIL กล่องเดียว (แนะนำอย่างยิ่ง)
 * ---------------------------------------------------------------------------
 * Mail.Send (Application) แบบไม่จำกัดขอบเขต จะทำให้แอปนี้ "ส่งอีเมลในนามใครก็ได้ในองค์กร"
 * ได้ตามค่าเริ่มต้น — ให้ทีม Exchange Online Admin รันคำสั่งนี้ใน Exchange Online PowerShell
 * เพื่อจำกัดให้แอปนี้ส่งได้แค่ในนามกล่องอีเมลเดียวที่ตั้งไว้ใน SEND_AS_EMAIL:
 *
 *   Connect-ExchangeOnline
 *   New-ApplicationAccessPolicy `
 *     -AppId "e00dda6c-8f9b-4c9f-bf97-a0f549de0b0c" `
 *     -PolicyScopeGroupId "hr@siammotor.com" `
 *     -AccessRight RestrictAccess `
 *     -Description "SML PMS Proxy — ส่งอีเมลได้แค่ในนาม hr@siammotor.com เท่านั้น"
 *
 * (แทน AppId และอีเมลด้วยค่าจริงของคุณ — ต้องตรงกับ CLIENT_ID และ SEND_AS_EMAIL ที่ตั้งไว้)
 * ตรวจสอบด้วย: Test-ApplicationAccessPolicy -AppId "<CLIENT_ID>" -Identity "hr@siammotor.com"
 * ต้องได้ผลลัพธ์ "Access Check Result: Granted"
 */
