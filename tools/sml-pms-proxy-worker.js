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
 *        FILE_PATH       = เช่น _SML_PMS_Professiona/SML_PMS_Master.xlsx
 *        PROXY_API_KEY   = กุญแจที่ตั้งเอง (สุ่มยาวๆ) ให้ตรงกับที่กรอกในหน้า MS365 ของเว็บ
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
 * ความปลอดภัยของ PROXY_API_KEY: เป็นกุญแจร่วมง่ายๆ กันคนแปลกหน้ายิงคำขอมาที่ Worker เฉยๆ
 * ไม่ใช่ความปลอดภัยระดับสูง (ใครเปิด DevTools ดู Network request จากเว็บที่ตั้งค่าไว้แล้วจะเห็นได้)
 * — ความปลอดภัยจริงของสถาปัตยกรรมนี้อยู่ที่ Application Access Policy ข้างต้นที่จำกัดว่า Worker
 * เข้าถึงได้แค่ไฟล์ Excel ไฟล์เดียว ไม่ใช่ทั้ง Tenant
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Api-Key',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    /* /webhook/line: LINE platform เป็นคนยิงเข้ามาตรง ไม่ใช่เบราว์เซอร์ของเว็บ SML PMS ที่ตั้งค่า
       X-Api-Key ไว้ — LINE ไม่มีทางส่ง header นั้นมา ใช้ x-line-signature (HMAC-SHA256 ของ body
       ด้วย LINE_CHANNEL_SECRET) เป็นตัวพิสูจน์ตัวตนของ route นี้เองแทน จึงต้องเช็คเส้นทางนี้ก่อน
       ผ่าน PROXY_API_KEY gate ด้านล่างไปเลย ไม่งั้นจะถูกตีกลับ 401 ก่อนได้ตรวจลายเซ็นจริงด้วยซ้ำ */
    if (url.pathname === '/webhook/line' && request.method === 'POST') {
      return handleLineWebhook(request, env);
    }

    const apiKey = request.headers.get('X-Api-Key');
    if (!env.PROXY_API_KEY || apiKey !== env.PROXY_API_KEY) {
      return json({ error: 'unauthorized' }, 401, cors);
    }

    try {
      /* /send-line ไม่เกี่ยวกับ Microsoft/Azure เลยแม้แต่น้อย — ไม่ต้องขอ getAppToken() (ซึ่งเป็น
         token ของ Microsoft Graph) เลย วางไว้ก่อนบรรทัดนั้นโดยเจตนา เพื่อให้ช่องทาง LINE ทำงานได้
         แม้ TENANT_ID/CLIENT_ID/CLIENT_SECRET ของฝั่ง MS365 ยังตั้งไม่ครบ/ผิด */
      if (url.pathname === '/send-line' && request.method === 'POST') {
        const { userIds, message } = await request.json();
        if (!Array.isArray(userIds) || !userIds.length || !message) return json({ error: 'missing userIds/message' }, 400, cors);
        if (!env.LINE_CHANNEL_ACCESS_TOKEN) return json({ error: 'ยังไม่ได้ตั้งค่า LINE_CHANNEL_ACCESS_TOKEN ใน Worker' }, 500, cors);
        await sendLineMulticast(env.LINE_CHANNEL_ACCESS_TOKEN, userIds, message);
        return json({ ok: true, count: userIds.length }, 200, cors);
      }

      const token = await getAppToken(env);

      /* /send-mail ไม่เกี่ยวกับ Excel เลย ไม่ต้อง resolveSite() (ซึ่งไปหา SharePoint site/ไฟล์)
         แยกไว้ต่างหาก กันไม่ให้การส่งอีเมลไปติดพังเวลา SITE_URL/FILE_PATH ตั้งค่าไม่ถูกโดยไม่จำเป็น */
      if (url.pathname === '/send-mail' && request.method === 'POST') {
        const { toEmail, toName, subject, body } = await request.json();
        if (!toEmail || !subject || !body) return json({ error: 'missing toEmail/subject/body' }, 400, cors);
        if (!env.SEND_AS_EMAIL) return json({ error: 'ยังไม่ได้ตั้งค่า SEND_AS_EMAIL ใน Worker' }, 500, cors);
        await sendMail(token, env.SEND_AS_EMAIL, toEmail, toName, subject, body);
        return json({ ok: true }, 200, cors);
      }

      const { driveId, itemId } = await resolveSite(env, token);

      if (url.pathname === '/rows' && request.method === 'GET') {
        const table = url.searchParams.get('table');
        if (!table) return json({ error: 'missing table' }, 400, cors);
        const rows = await listRows(token, driveId, itemId, table);
        return json({ rows }, 200, cors);
      }

      if (url.pathname === '/rows/add' && request.method === 'POST') {
        const { table, values } = await request.json();
        if (!table || !values) return json({ error: 'missing table/values' }, 400, cors);
        await addRow(token, driveId, itemId, table, values);
        return json({ ok: true }, 200, cors);
      }

      if (url.pathname === '/rows/upsert' && request.method === 'POST') {
        const { table, keyColIndex, keyValue, values } = await request.json();
        if (!table || keyColIndex === undefined || keyValue === undefined || !values) {
          return json({ error: 'missing table/keyColIndex/keyValue/values' }, 400, cors);
        }
        const result = await upsertRow(token, driveId, itemId, table, keyColIndex, keyValue, values);
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
        const result = await upsertRowPartial(token, driveId, itemId, table, keyColIndex, keyValue, values, protectedCols || []);
        return json({ ok: true, result }, 200, cors);
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
  cachedSite = { driveId: drive.id, itemId: item.id };
  return cachedSite;
}

async function graphGet(token, url) {
  const res = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  const data = await res.json();
  if (!res.ok) throw new Error((data.error && data.error.message) || 'Graph GET failed: ' + res.status);
  return data;
}
async function graphSend(token, url, method, body) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error((data.error && data.error.message) || 'Graph ' + method + ' failed: ' + res.status);
  return data;
}

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

/* รับ webhook event จาก LINE จริง 1 event — สนใจแค่ "ข้อความตัวอักษรธรรมดา" เท่านั้น (ไม่สน
   sticker/รูป/follow event อื่นๆ) เนื้อข้อความที่คาดหวังคือรหัสพนักงาน (เช่น SML-001) เทียบกับ
   ตาราง Employees จริงแบบตัดช่องว่าง+ไม่สนตัวเล็ก-ใหญ่ (ไม่ใช่เทียบชื่อ/เดา — เทียบรหัสตรงๆเท่านั้น
   ตาม CLAUDE.md #1 ของเว็บ) ถ้าเจอ จะเขียน userId จริงเข้า EmployeeSettings โดยคงค่า
   PinHash/EvalLevel/EvalExempt เดิมไว้ทุกประการ (ไม่แตะ ไม่เดา ไม่ล้าง) แล้วตอบกลับยืนยันในแชท —
   ถ้าไม่เจอรหัส ตอบกลับบอกตรงๆว่าไม่พบ ไม่เงียบ (ตาม CLAUDE.md #10/#14 ของเว็บ — ห้ามดูเหมือน
   ทำงานสำเร็จทั้งที่ไม่ได้เขียนอะไรจริง) ความผิดพลาดใดๆที่เกิดขึ้น (Graph ล่ม ฯลฯ) จะถูกจับโดย
   handleLineWebhook ด้านล่าง ไม่ทำให้ event อื่นในชุดเดียวกันพังตามไปด้วย */
async function handleLineEvent(ev, env, token, driveId, itemId) {
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
   secret เลย ซึ่งต้องปฏิเสธจริงๆ (403/500) ไม่ใช่ปลอมว่า 200 แล้วไม่ทำอะไร */
async function handleLineWebhook(request, env) {
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
    // รายการเดียวจะได้ทำงานเลย เพราะ getAppToken()/resolveSite() พังตั้งแต่ขั้นแรก เดิมโค้ดจุดนี้
    // แค่ console.error() แล้วเงียบไปทั้งหมด (ไม่มีการตอบกลับ LINE เลยสักข้อความ แม้จะพิมพ์รหัส
    // พนักงานที่มีอยู่จริง) — เป็นช่องโหว่แบบเดียวกับที่ #149 เพิ่งปิดไปใน handleLineEvent() เอง
    // แค่คนละชั้น (ชั้นนี้ยังไม่ทันได้รู้ด้วยซ้ำว่าใครพิมพ์อะไรมา เพราะยังไม่ได้ resolve พนักงาน)
    // ตอบ 200 กลับ LINE เสมอเหมือนเดิม (กัน retry storm) แต่ตอนนี้ยังพยายามตอบข้อความ error
    // จริงกลับไปในแชทให้ทุก event ที่เป็นข้อความตัวอักษรด้วย — ใช้ LINE_CHANNEL_ACCESS_TOKEN
    // ได้ตามปกติ เพราะการส่งข้อความ LINE ไม่ได้พึ่ง Microsoft Graph เลยแม้แต่น้อย
    console.error('handleLineWebhook outer MS365/Graph setup failed:', (e && e.message) || e);
    for (const ev of events) {
      if (ev && ev.type === 'message' && ev.message && ev.message.type === 'text' && ev.replyToken) {
        await replyLine(
          env.LINE_CHANNEL_ACCESS_TOKEN,
          ev.replyToken,
          '⚠️ ระบบเชื่อมต่อข้อมูลขัดข้องชั่วคราว ไม่สามารถตรวจสอบรหัสพนักงานได้ในขณะนี้ กรุณาลองพิมพ์รหัสพนักงานส่งใหม่อีกครั้งในภายหลัง หรือแจ้ง Admin ให้ตรวจสอบ Log ของ Worker'
        ).catch(() => {});
      }
    }
  }
  return new Response('OK', { status: 200 });
}

async function listRows(token, driveId, itemId, table) {
  const base = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(table)}')/rows`;
  const data = await graphGet(token, base);
  return (data.value || []).map((r) => (r.values && r.values[0]) || []);
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
async function upsertRow(token, driveId, itemId, table, keyColIndex, keyValue, values) {
  const base = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${itemId}/workbook/tables('${encodeURIComponent(table)}')/rows`;
  const data = await graphGet(token, base);
  const rows = data.value || [];
  const idx = rows.findIndex((r) => rowMatchesUpsertKey(r.values && r.values[0], keyColIndex, keyValue));
  if (idx >= 0 && rows[idx].index !== undefined) {
    await graphSend(token, base + `/itemAt(index=${rows[idx].index})`, 'PATCH', { values: [values] });
    return 'updated';
  }
  await graphSend(token, base + '/add', 'POST', { values: [values] });
  return 'added';
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
  const data = await graphGet(token, base);
  const rows = data.value || [];
  const idx = rows.findIndex((r) => rowMatchesUpsertKey(r.values && r.values[0], keyColIndex, keyValue));
  if (idx >= 0 && rows[idx].index !== undefined) {
    const rangeData = await graphGet(token, base + `/itemAt(index=${rows[idx].index})/range`);
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
    return 'updated-partial';
  }
  await graphSend(token, base + '/add', 'POST', { values: [values] });
  return 'added';
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
