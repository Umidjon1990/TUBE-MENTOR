# TUBE MENTOR

Video asosida arab va ingliz tilini o‘rganish platformasi. O‘quvchi: **Bugun → Darslar → Tingla → Tushun → Takrorla → Mustahkamla → Dars lug‘ati testi → Natija**. Shaxsiy lug‘at va kundalik takrorlash, o‘qituvchi studiyasi hamda admin boshqaruvi bir backendga ulangan.

## Ishga tushirish

Node.js 20.19+ va PostgreSQL 16+ kerak.

```sh
npm ci
cp .env.example .env
# .env ichiga haqiqiy DATABASE_URL, SESSION_SECRET, APP_URL kiriting.
npm run db:migrate
npm run setup:admin
npm run dev
```

`setup:admin` uchun `ADMIN_USERNAME` va kamida 10 belgili `ADMIN_PASSWORD` kiriting. Buyruq mavjud hisobni o‘zgartirmaydi. Muvaffaqiyatli yaratilgandan keyin `ADMIN_PASSWORD`ni muhitdan olib tashlang. Eski hisoblar va darslar migratsiyada saqlanadi. Ishlab turgan bazada `db:push` ishlatmang; `db:migrate` va avtomatik versiyali migratsiyalarni ishlating.

Bazasiz mahalliy ko‘rish:

```sh
npm ci
npm run demo
```

`http://localhost:5000` ochiladi. Mahalliy ma’lumot `.data/demo`da saqlanadi. Demo hisoblar: `demo_student / DemoStudent2026!`, `demo_teacher / DemoTeacher2026!`, `demo_admin / DemoAdmin2026!`. Demo kursdagi video va matn bir-biriga mos emas; ular faqat dastur sinovi uchun. Productionda demo seed ishlamaydi.

## Tekshiruv

```sh
npm run check
npm test
npm run build
npm run test:production
npx playwright install chromium
npm run test:e2e
```

API testlari PostgreSQL protokoli orqali aynan shu `pg`/Drizzle backendini ishlatadi. Mahalliy standart — PGlite; GitHub Actions esa alohida PostgreSQL 16 bazasida parallel so‘rovlarni tekshiradi. Haqiqiy PostgreSQL bilan mahalliy test uchun `TEST_DATABASE_URL`ni faqat bo‘sh, nomi `_test` bilan tugaydigan test bazasiga yo‘naltiring. Brauzer testi tashqi YouTube API uchun nazorat qilinadigan fixture va sun’iy mikrofonni ishlatadi.

## Production va kalitlar

To‘liq ko‘rsatma: [docs/deployment.md](docs/deployment.md). Majburiy: `DATABASE_URL`, `SESSION_SECRET` (32+ tasodifiy belgi), `APP_URL` (saytning HTTPS manzili). Hosting `PORT`ni o‘zi berishi mumkin.

Email xizmatini yoqish: `RESEND_API_KEY`, tasdiqlangan domenli `MAIL_FROM`. Google kirishi: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Kontent AI/Whisper: `OPENAI_API_KEY`. Kalitlar faqat backend muhitida turadi; `VITE_` orqali berilmaydi. Kalitlarsiz mavjud hisob bilan o‘qish, matnni qo‘lda kiritish va JSON import ishlaydi.

## Kontentni nashr qilish

1. O‘qituvchi studiyasida YouTube dars yarating va CEFR darajasini tanlang.
2. Vaqtli SRT/VTT yoki transkript kiriting; AI yoki JSON bilan tarjima, lug‘at va mashqlarni tayyorlang.
3. Kontent oynasida arabcha harakatlar, tarjima, grammatika va savollarni tekshiring. Vaqtlar videoga mos bo‘lsin.
4. Tekshiruv bo‘limidagi to‘rtta bandni tasdiqlab, admin tekshiruviga yuboring.
5. Admin tasdiqlaydi; tasdiqlangan nusxa nashr qilinadi. O‘qituvchi keyingi tahrirni boshlasa, avvalgi nashr o‘quvchilarda saqlanadi.

Darsga yakuniy lug‘at testi avtomatik tuziladi (8 tagacha asosiy so‘z); ma’no tanlash, yozib eslash va kontekstni to‘ldirish mavjud. Javoblar serverda tekshiriladi. Xato so‘zlar darhol takrorlashga, to‘g‘ri so‘zlar keyingi kunlarga rejalashtiriladi. Yangi nashrda dars bosqichlari qayta boshlanadi; tarixiy testlar va lug‘at saqlanadi.

## Tuzilishi

- `client/src/pages/learning/`: yangi o‘quvchi va studiya sahifalari.
- `shared/learning.ts`: yagona gap/lug‘at modeli, javob tekshiruvi va takrorlash jadvali.
- `server/auth-routes.ts`, `server/learning-routes.ts`: autentifikatsiya va o‘quv API.
- `migrations/`: ma’lumotni saqlaydigan versiyali SQL migratsiyalar.
- `tests/`, `e2e/`: baza, API va brauzer sinovlari.

Talaffuzni tinglash qurilmaning ovoz sinteziga bog‘liq. Mikrofon yozuvi shu qurilmaning IndexedDB bazasida saqlanadi; serverga yuborilmaydi va avtomatik talaffuz balli berilmaydi.
