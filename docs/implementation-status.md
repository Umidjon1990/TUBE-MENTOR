# TUBE MENTOR — bajarilgan ishlar

## Reja va holat

1. Kod auditi, yangi ma’lumotlar modeli va versiyali migratsiyalar — bajarildi.
2. Kirish, ro‘yxatdan o‘tish, email tasdiqlash/tiklash, Google/Telegram OAuth, hisoblarni ulash va rollar — bajarildi.
3. Mobil Bugun, daraja tanlash, kurslar, darslar, lug‘at va profil — bajarildi.
4. Tingla → Tushun → Takrorla → Mustahkamla → Lug‘at testi → Natija — ulandi.
5. O‘qituvchi studiyasi, JSON/SRT/VTT import, kontent ko‘rish va admin tasdig‘i — ulandi.
6. Baza, API, brauzer va production yig‘ilishini tekshirish — natijalar quyida.
7. Kalitlar ro‘yxati va deploy yo‘riqnomasi — `.env.example`, `docs/deployment.md`.

## Tekshirilgan natijalar

- TypeScript tekshiruvi va production build muvaffaqiyatli.
- 32 ta unit/API sinovi (21 mavjud + 11 yangi autentifikatsiya sinovi): eski hisob saqlanishi, qayta migratsiya, haqiqiy pg/Drizzle orqali DB ishlashi, ruxsatlar, private ma’lumotlar, CSRF manbasi, progress, immutable javoblar, XP idempotentligi, SRS, nashr nusxalari, email tokenlari, parol reseti, logout va sessiyaning app instancelar orasida saqlanishi. Telegram uchun haqiqiy RSA imzosi bilan issuer/audience/nonce/expiry, PKCE, state, bir martalik callback, yopiq signup, bloklangan hisoblar, parallel signup va ikki provayderni bitta profilga xavfsiz ulash tekshirildi. Google Gmail bo‘lmagan tasdiqlangan email bilan ham Resendsiz ishlaydi; legacy admin/non-authoritative email hisoblarini avtomatik egallash rad etiladi.
- Excel lug‘at eksporti dependency yangilanishidan keyin ochib tekshirildi: arabcha va o‘zbekcha kataklar saqlanadi.
- 70 gapli uzun transkript nazorat qilinadigan lokal provider bilan tekshirildi: barcha gaplar saqlanadi; yetishmagan tahlil xato beradi. Bu haqiqiy OpenAI sifati sinovi emas.
- 5 ta Chromium brauzer sinovida 320/390/768/1280px ekranlar, Google/Telegram mobil tugmalari va profilga hisob ulash, so‘z dialogi, ovoz yozish, bosqichlar, yakuniy test, reload, o‘qituvchi yaratishi va admin navigatsiyasi tekshirildi. Video API fixture, mikrofon esa sun’iy test qurilmasi bilan ishladi.
- Yig‘ilgan production server Node 24 va minimal qo‘llab-quvvatlanadigan Node 20.19.5 bilan yangi bazada ishga tushdi: migratsiyalar, health, SPA marshrutlari va productionda demo hisob yo‘qligi tekshirildi.
- Production dependencies uchun `npm audit --omit=dev`: ma’lum zaifliklar qolmadi. CSS build vositalari alohida dev dependencies sifatida saqlanadi.

## Deploydan keyingi tekshiruvlar

Railway production servisi va `https://www.tubementor.uz` domeni tekshirildi. Mavjud baza/session/OpenAI kalitlari saqlandi; yangi public sozlamalar kiritildi. Hozir saytda eski 1.0 versiya, yangilangan kod PR #1da. Yangi versiya deploy qilinib, haqiqiy Google/Telegram kalitlari kiritilgach callback va profilga hisob ulashni real hisoblar bilan sinash kerak. Resend yoqilgan bo‘lsa email yetkazilishi ham tekshiriladi. YouTube iframe/Whisper hamda haqiqiy Android/iPhone mikrofon sinovi ham alohida qoladi. Avtomatik talaffuz baholash kiritilmagan: ovoz qurilmada saqlanadi va o‘quvchi o‘zi taqqoslaydi.

Mahalliy DB sinovlari PGlite PostgreSQL protocol serverida o‘tdi; GitHub Actions PostgreSQL 16 bilan parallel so‘rovlarni tekshirish uchun sozlangan. GitHub hisobi billing sabab bloklangani uchun remote job boshlanmagan; bu tekshiruv hozircha o‘tgan deb hisoblanmaydi. [GitHub tekshiruv holati](https://github.com/Umidjon1990/TUBE-MENTOR/actions/runs/38536851830). Mavjud darslarning til bo‘yicha mazmun sifati avtomatik tasdiqlanmaydi: yangi kontent uchun to‘rtta tekshiruv va admin tasdig‘i zarur.

Oldingi saqlangan lug‘at yangi takrorlash navbatiga migratsiya qilinadi. Eslatmalar va oldingi kartochkalar profil orqali ochiladi. Kontent yaratgan eski student hisobga tahrir huquqi kerak bo‘lsa, admin unga teacher rolini beradi.

Telegram bo‘yicha bosqichma-bosqich sozlash: [telegram-login.md](telegram-login.md). BotFather Login Widget Client ID va Client Secret kerak; bot tokeni login uchun ishlatilmaydi. OIDC Authorization Code + PKCE oqimi qo‘llanadi; faqat `openid profile` so‘raladi. Emaili yo‘q Telegram foydalanuvchisiga mavjud bo‘lmagan email tasdiqlangan deb yozilmaydi: himoyalangan sahifalar provayderning tekshirilgan identifikatorini qabul qiladi.
