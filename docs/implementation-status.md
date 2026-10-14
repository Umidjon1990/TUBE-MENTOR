# TUBE MENTOR — bajarilgan ishlar

## Reja va holat

1. Kod auditi, yangi ma’lumotlar modeli va versiyali migratsiyalar — bajarildi.
2. Kirish, ro‘yxatdan o‘tish, email tasdiqlash/tiklash, Google OAuth va rollar — bajarildi.
3. Mobil Bugun, daraja tanlash, kurslar, darslar, lug‘at va profil — bajarildi.
4. Tingla → Tushun → Takrorla → Mustahkamla → Lug‘at testi → Natija — ulandi.
5. O‘qituvchi studiyasi, JSON/SRT/VTT import, kontent ko‘rish va admin tasdig‘i — ulandi.
6. Baza, API, brauzer va production yig‘ilishini tekshirish — natijalar quyida.
7. Kalitlar ro‘yxati va deploy yo‘riqnomasi — `.env.example`, `docs/deployment.md`.

## Tekshirilgan natijalar

- TypeScript tekshiruvi va production build muvaffaqiyatli.
- 21 ta unit/API sinovi: eski hisob saqlanishi, qayta migratsiya, haqiqiy pg/Drizzle orqali DB ishlashi, ruxsatlar, private ma’lumotlar, CSRF manbasi, progress, immutable javoblar, XP idempotentligi, SRS, nashr nusxalari, email tokenlari, parol reseti, logout va sessiyaning app instancelar orasida saqlanishi.
- Excel lug‘at eksporti dependency yangilanishidan keyin ochib tekshirildi: arabcha va o‘zbekcha kataklar saqlanadi.
- 70 gapli uzun transkript nazorat qilinadigan lokal provider bilan tekshirildi: barcha gaplar saqlanadi; yetishmagan tahlil xato beradi. Bu haqiqiy OpenAI sifati sinovi emas.
- Chromiumda 320/390/768/1280px ekranlar, so‘z dialogi, ovoz yozish, bosqichlar, yakuniy test, reload, o‘qituvchi yaratishi va admin navigatsiyasi tekshirildi. Video API fixture, mikrofon esa sun’iy test qurilmasi bilan ishladi.
- Yig‘ilgan production server yangi bazada ishga tushdi: migratsiyalar, health, SPA marshrutlari va productionda demo hisob yo‘qligi tekshirildi.
- Production dependencies uchun `npm audit --omit=dev`: ma’lum zaifliklar qolmadi. CSS build vositalari alohida dev dependencies sifatida saqlanadi.

## Deploydan keyingi tekshiruvlar

Haqiqiy OAuth/email/AI kalitlari va yakuniy domen bu sessiyada yo‘q. Ular kiritilgach Google callback, Resend email yetkazilishi, YouTube iframe/Whisper hamda haqiqiy Android/iPhone mikrofonini sinash kerak. Avtomatik talaffuz baholash kiritilmagan: ovoz qurilmada saqlanadi va o‘quvchi o‘zi taqqoslaydi.

Mahalliy DB sinovlari PGlite PostgreSQL protocol serverida o‘tdi; GitHub Actions PostgreSQL 16 bilan parallel so‘rovlarni tekshirish uchun sozlangan. GitHub hisobi billing sabab bloklangani uchun remote job boshlanmagan; bu tekshiruv hozircha o‘tgan deb hisoblanmaydi. [GitHub tekshiruv holati](https://github.com/Umidjon1990/TUBE-MENTOR/actions/runs/38536851830). Mavjud darslarning til bo‘yicha mazmun sifati avtomatik tasdiqlanmaydi: yangi kontent uchun to‘rtta tekshiruv va admin tasdig‘i zarur.

Oldingi saqlangan lug‘at yangi takrorlash navbatiga migratsiya qilinadi. Eslatmalar va oldingi kartochkalar profil orqali ochiladi. Kontent yaratgan eski student hisobga tahrir huquqi kerak bo‘lsa, admin unga teacher rolini beradi.
