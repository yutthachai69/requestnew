-- เพิ่มคอลัมน์ description ในตาราง Role (รันเมื่อ db push error)
-- รันจากโฟลเดอร์โปรเจกต์: sqlite3 prisma/dev.db < prisma/add_role_description.sql
-- หรือเปิด prisma/dev.db ด้วย SQLite client แล้วรันคำสั่งด้านล่าง

ALTER TABLE Role ADD COLUMN description TEXT;
