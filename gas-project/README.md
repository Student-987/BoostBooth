# BoostBooth — คู่มือติดตั้ง Google Apps Script (ฉบับ 2 ไฟล์: Code.gs + Index.html)

โปรเจกต์นี้ถูกย่อโครงสร้างฝั่ง Google Apps Script ให้เหลือเพียง **2 ไฟล์หลัก** (`Code.gs` และ `Index.html`) เพื่อให้ง่ายที่สุดสำหรับมือใหม่ แต่ยังคงความสามารถครบทุกด้านครับ

---

## วิธีติดตั้งใน Google Apps Script (2 ไฟล์จบ)

1. เปิด [script.google.com](https://script.google.com) กด **New Project**
2. วางโค้ดจากไฟล์ `Code.gs` ลงใน `Code.gs`
3. กด `+` สร้างไฟล์ HTML ชื่อ **`Index`** แล้ววางโค้ดจาก `Index.html`
4. โค้ดถูกตั้งค่าเริ่มต้นให้เก็บรูปลงโฟลเดอร์ Google Drive ปลายทาง (`1803j-lPX2WNhkXJaPRbU5JUhRK8z74cj`) ไว้แล้ว (สามารถเปลี่ยนเป็นโฟลเดอร์อื่นได้ในหน้า **Admin > Settings**)
5. เลือกฟังก์ชัน `initializeDatabase` ด้านบนแล้วกด **Run** เพื่อให้สิทธิ์สร้าง Google Sheets (`SETTINGS`, `FRAMES`, `SESSIONS`, `MEDIA`, `LOGS`) และโฟลเดอร์ย่อย `FRAMES/`, `SESSIONS/` ภายในโฟลเดอร์ Google Drive ที่ตั้งไว้
6. กด **Deploy > New deployment > Web app**:
   - **Execute as**: `Me` *(ต้องเป็นบัญชี Google ที่มีสิทธิ์ Editor ในโฟลเดอร์ Google Drive ปลายทาง)*
   - **Who has access**: `Anyone` *(จำเป็นเพื่อให้โทรศัพท์เครื่องอื่นสแกน QR Code แล้วเปิดหน้าดาวน์โหลดได้โดยไม่ต้องล็อกอิน)*
7. คัดลอก **Web app URL** (`https://script.google.com/macros/s/.../exec`) มาใส่ในหน้า **Admin > Settings** ของ BoostBooth Web App ➔ QR Code ที่สร้างจะชี้ไปที่ลิงก์สาธารณะของ GAS ทันที และรูปที่ถ่ายจะถูกอัปโหลดเข้าโฟลเดอร์ Drive ที่ตั้งไว้โดยอัตโนมัติครับ

---

## หมายเหตุเกี่ยวกับกล้อง Sony (ถ้าต่อ USB-C)
หากต้องการควบคุมชัตเตอร์กล้อง Sony ผ่านสาย USB-C บนเครื่องคอมพ์เสริม จะมีไฟล์เสริมแยกบนคอมพิวเตอร์อีกเพียง 1 ไฟล์คือ `sony-bridge-server.mjs` (ไม่ต้องใส่ใน Google Apps Script) ครับ
