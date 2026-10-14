# TUBE MENTOR

Video asosida arab va ingliz tilini o‘rganish platformasi. **2.1** versiyada kontent, mavzular, coin, to‘lov va o‘quvchilar murojaatlarini admin bitta kabinetdan boshqaradi. Faol rollar: **admin** va **o‘quvchi**.

O‘quvchi: **Namuna dars → Google/Telegram orqali kirish → Daraja → Coin bilan dars ochish → Tingla → Tushun → Takrorla → Mustahkamla → Dars lug‘ati testi → Natija**. Shaxsiy lug‘at, progress va takrorlash bir backendga ulangan.

## Coin va dars olish

- Yangi tasdiqlangan o‘quvchi hisobiga bir marta **30 coin** beriladi; mavjud profilga ikkinchi kirish usulini ulash yana bonus bermaydi.
- Oddiy dars **10 coin**. O‘quvchi xaridni tasdiqlaydi; balans yechilishi va dars ochilishi bitta transactionda bajariladi.
- Ochilgan dars qayta coin talab qilmaydi. Balans tugasa ham shu dars, lug‘at va natijalar saqlanadi; tekshirilgan yangi nusxa ham shu kirish huquqidan foydalanadi.
- Admin tanlagan bitta haqiqiy **Namuna dars** ro‘yxatsiz ochiladi.
- **Coin paketi → saytda buyurtma → karta yoki rasmiy Payme havolasi orqali to‘lov → chek → admin haqiqiy bank tushumini tekshiradi → coin qo‘shiladi**.
- **Yordam va murojaatlar**da o‘quvchi to‘lov/dars/qaytarish bo‘yicha yozishma ochadi. Murojaatning o‘zi balansni o‘zgartirmaydi; qaytarish admin tomonidan tekshiriladi va alohida qayd etiladi.

To‘liq foydalanish va sozlash: [docs/coin-payments.md](docs/coin-payments.md). Dastlab paketlar faol emas va narxi 0, to‘lov o‘chirilgan; admin haqiqiy narx va rekvizitlarni kiritadi.

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

`http://localhost:5000` ochiladi. Mahalliy ma’lumot `.data/demo`da saqlanadi. Mahalliy demo hisoblariga kirish ma’lumotlari `npm run demo` terminalida ko‘rsatiladi. `demo_teacher` avvalgi fixture hisobi; kontent boshqaruvi uchun ishlatilmaydi. Demo kursdagi video va matn bir-biriga mos emas; ular faqat dastur sinovi uchun. Productionda demo seed ishlamaydi.

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

Google kirishi: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`. Telegram kirishi: `TELEGRAM_CLIENT_ID`, `TELEGRAM_CLIENT_SECRET`. Email xizmatini yoqish uchun ixtiyoriy `RESEND_API_KEY` va tasdiqlangan domenli `MAIL_FROM` kerak; Google/Telegram kirishi Resendsiz ishlaydi. Kontent AI/Whisper: `OPENAI_API_KEY`. Kalitlar faqat backend muhitida turadi; `VITE_` orqali berilmaydi. Kalitlarsiz mavjud hisob bilan o‘qish, matnni qo‘lda kiritish va JSON import ishlaydi.

Admin to‘lov boti uchun `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, `TELEGRAM_ADMIN_IDS` va adminning botni sayt orqali ulashi kerak. Bu qiymatlar Telegram Login kalitlaridan alohida. Cheklar uchun `PRIVATE_RECEIPTS_DIR=/app/private-payments/receipts`ni ommaga ochilmagan persistent volume ichida saqlang. To‘lov tasdig‘i saytdan ham ishlaydi; bu versiyada Payme Merchant API avtomatik billing ulanmagan.

## Kontentni nashr qilish

1. Admin → **Darslar → Dars yaratish**da YouTube video va CEFR darajasini kiriting.
2. Vaqtli SRT/VTT yoki transkript kiriting; AI yoki JSON bilan tarjima, lug‘at va mashqlarni tayyorlang.
3. Kontent oynasida arabcha harakatlar, tarjima, grammatika va savollarni tekshiring. Vaqtlar videoga mos bo‘lsin.
4. **Sifat tekshiruvi**da barcha bandlarni tekshirib, tayyor nusxani tasdiqlang va nashr qiling.
5. **Mavzular**da darslarni biriktiring va tartiblang. Keyingi tahrir davomida avvalgi tekshirilgan nashr o‘quvchilarda saqlanadi. Arxivlash yangi xaridni to‘xtatadi; oldingi xaridor huquqi saqlanadi.

O‘qituvchi kabineti talab qilinmaydi. Eski teacher hisoblari studentga o‘tadi; kontenti va balansi saqlanadi, admin huquqi avtomatik berilmaydi.

Darsga yakuniy lug‘at testi avtomatik tuziladi (8 tagacha asosiy so‘z); ma’no tanlash, yozib eslash va kontekstni to‘ldirish mavjud. Javoblar serverda tekshiriladi. Xato so‘zlar darhol takrorlashga, to‘g‘ri so‘zlar keyingi kunlarga rejalashtiriladi. Yangi nashrda dars bosqichlari qayta boshlanadi; tarixiy testlar va lug‘at saqlanadi.

## Tuzilishi

- `client/src/pages/learning/`: o‘quvchi jarayoni va admin kabinetida ishlatiladigan kontent muharriri.
- `client/src/pages/admin/commerce.tsx`: dashboard, to‘lov, paket, sozlama, audit va yordam boshqaruvi.
- `shared/learning.ts`: yagona gap/lug‘at modeli, javob tekshiruvi va takrorlash jadvali.
- `server/auth-routes.ts`, `server/learning-routes.ts`: autentifikatsiya va o‘quv API.
- `server/commerce.ts`, `server/commerce-support.ts`, `server/payment-bot.ts`: hamyon, xarid, yordam, yopiq chek va admin bot API.
- `migrations/`: ma’lumotni saqlaydigan versiyali SQL migratsiyalar.
- `tests/`, `e2e/`: baza, API va brauzer sinovlari.

Talaffuzni tinglash qurilmaning ovoz sinteziga bog‘liq. Mikrofon yozuvi shu qurilmaning IndexedDB bazasida saqlanadi; serverga yuborilmaydi va avtomatik talaffuz balli berilmaydi.
