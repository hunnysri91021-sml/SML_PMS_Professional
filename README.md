# SML PMS — Performance Management System

ระบบประเมินผลการปฏิบัติงานพนักงาน (Performance Management System) ของบริษัท สยามกลการโลจิสติกส์ จำกัด (Siam Motors Group) พัฒนาเป็นเว็บแอปไฟล์เดียว (single-file HTML/CSS/JavaScript) ไม่ต้องติดตั้ง ไม่ต้องมี build system เปิดใช้งานได้ทันทีผ่านเบราว์เซอร์

🔗 **เว็บไซต์ใช้งานจริง:** https://hunnysri91021-sml.github.io/SML_PMS_Professional/

## คุณสมบัติหลัก

- **แบบประเมินผลการปฏิบัติงาน** แยกตามระดับตำแหน่ง 4 กลุ่ม: พนักงานปฏิบัติการ (op), พนักงานสำนักงาน (of), หัวหน้าแผนก/วิศวกร (ldr), ผู้จัดการส่วน (mgr) — แต่ละกลุ่มมีปัจจัยการประเมินและสัดส่วนคะแนน (Y/Z) ตามแบบฟอร์มทางการของบริษัท
- **โครงสร้างองค์กร** ครบ 4 ระดับ: กลุ่ม (Group) → แผนก (Section) → ส่วน (Division) → ฝ่าย (Department) พร้อมตำแหน่งและสายบังคับบัญชา (L1/L2/ผู้อนุมัติ)
- **จัดการพนักงาน** เพิ่ม/แก้ไข/นำเข้าพนักงานผ่านฟอร์มหรือ Template CSV
- **บทบาทผู้ใช้งาน (UI-level)**: emp / l1 / l2 / exec / admin / sysadmin — ใช้แสดงผลหน้าจอที่เหมาะกับแต่ละบทบาทเท่านั้น **สิทธิ์การเข้าถึงข้อมูลจริงควบคุมที่ระดับ SharePoint permission** (Edit/Read/ไม่มีสิทธิ์) ไม่ใช่ระบบ login ในตัวแอป
- **เชื่อมต่อ Microsoft 365 Excel** ผ่าน Microsoft Graph API + MSAL.js (OAuth PKCE, ไม่มี client secret) อ่าน/เขียนข้อมูลพนักงานและผลประเมินบน Excel Online (SharePoint) โดยตรง พร้อม Auto-sync ทุก 5 นาทีขณะเปิดหน้า MS365
- **Export รายงาน** เป็น PDF ผ่าน Graph API

## โครงสร้างไฟล์

| ไฟล์ | หน้าที่ |
|---|---|
| `SML_PMS_v14.html` | แอปพลิเคชันหลักทั้งหมด (HTML/CSS/JS ในไฟล์เดียว) |
| `index.html` | หน้า redirect เข้า `SML_PMS_v14.html` สำหรับ GitHub Pages |
| `SML_PMS_Master.xlsx` | ไฟล์ตัวอย่าง/Template โครงสร้างฐานข้อมูล 8 ชีต (ไม่ใช่ข้อมูลพนักงานจริง) |
| `.github/workflows/gh-pages.yml` | GitHub Actions สำหรับ deploy ขึ้น GitHub Pages อัตโนมัติเมื่อ push เข้า `main` |

## เทคโนโลยีที่ใช้

- HTML / CSS / Vanilla JavaScript (ไม่มี framework, ไม่มี build step)
- Microsoft Graph API + MSAL.js (`@azure/msal-browser`) สำหรับ SSO และเข้าถึง Excel Online
- GitHub Pages สำหรับโฮสต์ (จำเป็นสำหรับ HTTPS redirect URI ของ MSAL)

## การตั้งค่า MS365

ค่าตั้งต้น (Tenant ID, Client ID, SharePoint Site, path ไฟล์ Excel) ถูกกำหนดไว้ในแอปแล้วเป็นค่าเดียวกันสำหรับทุกเครื่อง/ทุกผู้ใช้ ไม่ต้องตั้งค่าซ้ำ หากต้องการเปลี่ยนค่า ทำได้ที่หน้า "MS365 Excel" → "ตั้งค่าด่วน MS365" ในแอป

## หมายเหตุด้านความปลอดภัย

- Repository นี้เป็น **Public** — Tenant ID/Client ID ที่ฝังในโค้ดปลอดภัยตามหลักการของ SPA App Registration (ไม่มี client secret) แต่ **ข้อมูลพนักงานจริงไม่ได้เก็บในโค้ด** อยู่บน SharePoint เท่านั้น และสิทธิ์การเข้าถึงคุมด้วย SharePoint permission
