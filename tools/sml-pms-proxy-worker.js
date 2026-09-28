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
 *   3. ไปที่ Settings → Variables → เพิ่ม Secret (encrypted) ทั้ง 7 ตัว:
 *        TENANT_ID       = Azure AD Tenant ID
 *        CLIENT_ID       = Azure AD App (client) ID ที่ขอสิทธิ์ Application แล้ว
 *        CLIENT_SECRET   = Client secret ที่สร้างไว้ใน Azure AD (เห็นครั้งเดียวตอนสร้าง)
 *        SITE_URL        = เช่น https://siammotor.sharepoint.com/sites/Chosiya-HR
 *        FILE_PATH       = เช่น _SML_PMS_Professiona/SML_PMS_Master.xlsx
 *        PROXY_API_KEY   = กุญแจที่ตั้งเอง (สุ่มยาวๆ) ให้ตรงกับที่กรอกในหน้า MS365 ของเว็บ
 *        SEND_AS_EMAIL   = อีเมล HR/Admin จริงใน Microsoft 365 ที่จะใช้เป็น "ผู้ส่ง" เวลาส่ง PIN
 *                          ให้พนักงานทางอีเมล (เช่น hr@siammotor.com) — ต้องเป็นกล่องอีเมลจริง
 *                          ที่มีอยู่ในองค์กร ไม่ใช่ที่อยู่ลอยๆ
 *   4. คัดลอก URL ของ Worker (เช่น https://sml-pms-proxy.<ชื่อบัญชี>.workers.dev) ไปกรอกที่
 *      หน้า "เชื่อมต่อ MS365 Excel" → แท็บ "ขั้นตอนตั้งค่า" ช่อง "Proxy URL" / "Proxy API Key"
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

    const apiKey = request.headers.get('X-Api-Key');
    if (!env.PROXY_API_KEY || apiKey !== env.PROXY_API_KEY) {
      return json({ error: 'unauthorized' }, 401, cors);
    }

    try {
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
