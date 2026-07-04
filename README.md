# Backend Administrasi Guru Premium

Backend ini memakai Node.js, Express, Sequelize, dan MySQL.

## Menjalankan

1. Salin `.env.example` menjadi `.env`
2. Isi `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USERNAME`, dan `MYSQL_PASSWORD`
3. Install dependency:
   `npm install`
4. Jalankan:
   `npm run dev`

## Catatan

- Port default: `3401`
- API mengikuti pola endpoint yang sudah dipakai frontend: `/api/auth/*`, `/api/admin/*`, `/api/superadmin/*`, `/api/teacher/*`, `/api/academic/*`
- Data utama tersimpan di MySQL, bukan file JSON
# absensi-premium
