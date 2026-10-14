# TUBE MENTOR 2.1 — bajarilgan ishlar va tekshiruv

## Ishlaydigan jarayon

Tasdiqlangan o‘quvchi hisobiga bir marta 30 coin → katalogdan dars tanlash → 10 coinni tasdiqlab sarflash → doimiy dars huquqi → barcha o‘quv bosqichlari va yakuniy lug‘at testi. Bitta admin tanlagan namuna dars mehmon uchun ochiq; yopiq darslarning matni, video manzili va javoblari serverda himoyalangan.

Coin yetmaganda paket → saytdagi to‘lov buyurtmasi → karta/rasmiy Payme → yopiq chek → admin bank tushumini tekshiradi → bank reference bilan bir martalik coin qo‘shilishi. Paketlar va haqiqiy rekvizitlarni admin belgilaydi. Telegram admin botida aynan shu tekshiruv bajariladi; bot ishlamasa saytdagi tasdiqlash davom etadi. Avtomatik Payme Merchant API bu relizga kirmaydi.

Yagona admin kabineti dars/mavzu yaratish, kontent tekshiruvi va nashri, paket/narx/namuna sozlamalari, to‘lovlar, foydalanuvchi balanslari, kirish huquqlari, qaytarish, murojaatlar, audit va CSV eksportini boshqaradi. Eski teacher hisoblari studentga o‘tadi; ular yaratgan kontent va moliyaviy tarix saqlanadi. Oxirgi faol adminni yo‘qotishdan himoya mavjud.

## Tekshiruv natijalari

- TypeScript tekshiruvi va yakuniy production build muvaffaqiyatli.
- 51 ta birlik/API holati tekshirildi: yakuniy umumiy yurishda 50 tasi o‘tdi; qolgan oxirgi-admin xato kodini qaytarish tuzatilib, shu holat alohida muvaffaqiyatli qayta sinandi.
- 15 ta commerce integratsion holati bonusning bir martalikligi, parallel xarid/ortiqcha sarf, yopiq material, buyurtma snapshotlari, chek turi/hajmi/egasi, takroriy bank reference, bot/web parallel tasdig‘i, kechikkan to‘lov, lotga bog‘langan qaytarish, audit, demo test ko‘chirish, murojaat maxfiyligi va oxirgi admin himoyasini qamraydi.
- 6 ta Chromium brauzer sinovi o‘tdi: 320/390/768/1280 px ekranlarda sahifalar; 30→20 coin bilan dars ochish va qayta kirish; chek → haqiqiy admin dialogi orqali tasdiq → 120 coin; o‘quvchi/admin murojaat yozishmasi; dars yaratish; lug‘at, mikrofon, bosqich/test/natija; Google/Telegram tugmalari va hisob ulash.
- Production bundle yangi bazada ishga tushdi: versiyali migratsiyalar, health, SPA manzillari, API 404 va productionda demo hisoblar yaratilmasligi tekshirildi.
- `npm audit --omit=dev`: 0 vulnerability. `git diff --check`: xato yo‘q.
- Mahalliy API sinovlari PostgreSQL protokoli orqali PGlite ishlatadi. Brauzer video/mikrofon/provayder sinovlari nazorat qilinadigan fixture ishlatadi; bu haqiqiy bank yoki Telegram xabari yuborilganini anglatmaydi.

GitHub Actions oldingi relizda hisob billing cheklovi sabab ishga tushmagan. CI boshlanmaganda mahalliy natijani CI natijasi deb hisoblamang; hisob cheklovi bartaraf etilgach PostgreSQL 16 workflowini qayta ishlating.

## Ishga tushirishda egasi kiritadigan ma’lumotlar

[Coin va to‘lov sozlash qo‘llanmasi](coin-payments.md) bo‘yicha admin paketlarning haqiqiy narxi/faolligi, qabul qiluvchi, karta/rasmiy Payme, ish vaqti va namuna darsini belgilaydi. Narx/rekvizitlar bo‘lmaganda to‘lov o‘chirilgan holda turadi.

Telegram bot uchun `TELEGRAM_BOT_TOKEN` va raqamli `TELEGRAM_ADMIN_IDS` zarur. Admin saytdagi **To‘lov sozlamalari → Telegram botini ulash** orqali botni o‘z profiliga bog‘laydi. Loginning mavjud Client ID/Secret qiymatlari saqlanadi. `TELEGRAM_WEBHOOK_SECRET` va `/app/private-payments` persistent volume deploymentda tayyorlanadi.

Haqiqiy bank/Payme tushumi, bot pairing va botdagi chek yetkazilishi shu sozlamalar kiritilgach kichik to‘lov bilan yakuniy domenda tekshiriladi. Google va Telegram orqali kirish avvalgi 2.0 relizda foydalanuvchi tomonidan tekshirilgan.

## Ma’lumotlarni saqlash

0005/0006 migratsiyalari mavjud balans va tarixni saqlaydi; eski o‘qilgan darslardan kirish huquqlarini yaratadi. Coin moliyaviy jurnali va murojaat xabarlari append-only. Qaytarish faqat tegishli to‘lovning sarflanmagan pullik coinidan olinadi; murojaat yaratish pulni avtomatik qaytarmaydi. Arxivlangan dars eski xaridorlarda qoladi, yangi xarid yopiladi. PostgreSQL va receipt volume uchun alohida muntazam backup kerak.

Talaffuz ovozi qurilmada saqlanadi; avtomatik talaffuz balli kiritilmagan. Yangi kontent nusxasida o‘quv bosqichlari yangilanishi mumkin, ammo sotib olingan dars huquqi va tarixiy test/lug‘at saqlanadi.
