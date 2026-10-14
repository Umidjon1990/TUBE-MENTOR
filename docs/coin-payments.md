# TUBE MENTOR 2.1 — coin, dars xaridi va qo‘lda to‘lov

## O‘quvchi foydalanishi

- Google yoki Telegram bilan tasdiqlangan student hisobi bir marta 30 coin oladi. Profilga ikkinchi provayderni ulash yana bonus bermaydi. Alohida ochilgan ikki profil alohida hisob hisoblanadi; kerak bo‘lsa mavjud profilning Kirish hisoblari orqali provayderni ulang.
- Har bir oddiy dars 10 coin. O‘quvchi ochishni alohida tasdiqlaydi; darsni qayta ko‘rish, takrorlash va yangilangan nusxasidan foydalanish yana coin olmaydi.
- Balans 0 bo‘lsa ham oldin ochilgan darslar, lug‘at va natijalar ishlaydi.
- Admin belgilagan bitta Namuna dars mehmon uchun ochiq. Mehmonning ovoz yozuvi qurilmada, test urinishlari vaqtincha server sessiyasida turadi. Hisobga kirgach **Namuna test natijasini saqlash** orqali server baholagan test natijalari ko‘chiriladi; qo‘shimcha XP yoki coin berilmaydi. Namuna audio yozuvi hisobga yuklanmaydi.
- Coin paketini tanlash → saytda buyurtma → ko‘rsatilgan rekvizit/rasmiy Payme orqali to‘lov → shu buyurtmaga chek yuklash → admin tekshiruvi → coin qo‘shilishi → darsni ochish.
- **Yordam va murojaatlar** orqali to‘lov, dars yoki qaytarish haqida buyurtmaga bog‘langan yozishma ochish mumkin. Murojaat yuborishning o‘zi coin yoki pulni qaytarmaydi; admin alohida tekshiradi.

## Adminning yagona kabineti

`/admin` — to‘lovlar, coin, faol o‘quvchilar va sotuvlar hisoboti.

1. **Darslar**: barcha mualliflarning darslarini qidirish, yangi dars yaratish, video/transkripsiya, tarjima, lug‘at, mashq, shadowing va lug‘at testini tahrirlash.
2. **Mavzular**: kurs yaratish, til/daraja, darslarni biriktirish va tartiblash.
3. **Sifat tekshiruvi**: matn, tarjima, vaqt va mashqlarni tekshirish, tasdiqlash va nashr qilish. AI yaratgan kontent tekshiruvsiz sotuvga chiqmaydi.
4. **Coin paketlari**: paket nomi, coin miqdori, so‘mdagi narx, faol/o‘chirilgan holat.
5. **To‘lov sozlamalari**: namuna dars, qabul qiluvchi, karta/rasmiy Payme havolasi, yo‘riqnoma va tekshirish ish vaqti.
6. **To‘lovlar**: chek, kutilayotgan summa, bank tranzaksiyasi, tasdiqlash/rad etish/aniqlashtirish va ishlatilmagan pullik coinlarni qaytarish.
7. **O‘quvchilar**: balans tarixi va sabab bilan tuzatish, darsga qo‘shimcha kirish berish/bekor qilish, hisob holati.
8. **Murojaatlar**: o‘quvchi yozishmalari, javob, holat va tegishli to‘lov/darsga o‘tish.
9. **Audit va CSV**: moliyaviy harakatlar, buyurtmalar va admin amallarining to‘liq eksporti.

Eski teacher hisoblari migratsiyada studentga o‘tadi. Balans, yaratgan darslar va o‘qigan materiallarga kirish saqlanadi; ularga admin huquqi avtomatik berilmaydi. Yangi kontent va moliya boshqaruvi admin tomonidan bajariladi. Oxirgi faol, kirishga yaroqli adminni o‘chirib yoki oddiy rolga tushirib bo‘lmaydi.

## To‘lovni faollashtirish

Haqiqiy summalar va rekvizitlar dastur tomonidan taxmin qilinmaydi. Dastlab paketlar 50/100/300 coin, narxi 0 va faol emas; to‘lov o‘chirilgan.

1. Admin → **Coin paketlari**: haqiqiy so‘mdagi narxlarni belgilang, kerakli paketlarni faollashtiring.
2. Admin → **To‘lov sozlamalari**: qabul qiluvchining nomi va tasdiqlangan rekvizitlarni kiriting. Karta 16 raqam; Payme havolasi rasmiy `https://checkout.paycom.uz/…` yoki ruxsat etilgan rasmiy Payme domenida bo‘lsin.
3. To‘lov yo‘riqnomasiga qaysi rekvizitga o‘tkazish, chekda nimalar ko‘rinishi, tekshirish ish vaqti va yordam/qaytarish qoidalarini yozing.
4. Nashr qilingan haqiqiy darslardan bittasini **Namuna dars** sifatida tanlang.
5. **To‘lovni yoqish**ni saqlang. Faol, narxi musbat paket va yaroqli rekvizit bo‘lmasa server yoqishni rad etadi.
6. Bitta kichik haqiqiy to‘lov bilan chek, bank tushumi, admin tasdig‘i, balans va dars ochilishini yakuniy domenda sinang.

Rasmiy Payme checkout uchun Payme Business/kassa ulanishi kerak. Shaxsiy karta raqamidan merchant havolasi yaratib bo‘lmaydi. Bu versiya to‘lovni admin qo‘lda tekshiradigan jarayonni bajaradi; avtomatik Merchant API billing hali ulanmagan.

Manbalar: [Payme Business ulanishi](https://business.help.paycom.uz/produktsiya/), [Payme checkout havolasi](https://developer.help.paycom.uz/initsializatsiya-platezhey/otpravka-cheka-po-metodu-get/).

## Telegram admin botini ulash

Telegram Login ishlayotgan `TELEGRAM_CLIENT_ID` va `TELEGRAM_CLIENT_SECRET` bot tokeni emas. Login sozlamalarini saqlang.

Railway → TUBE-MENTOR → production → Variables:

| Variable | Kerakli qiymat |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | BotFather bot tokeni; login botining tokeni ham ishlatilishi mumkin |
| `TELEGRAM_WEBHOOK_SECRET` | Kamida 32 tasodifiy belgi; deployment tayyorlashda xavfsiz qiymat kiritiladi |
| `TELEGRAM_ADMIN_IDS` | Ruxsatli admin Telegram raqamli user IDlari, vergul bilan ajratilgan |
| `PRIVATE_RECEIPTS_DIR` | `/app/private-payments/receipts` |

1. BotFather’da mavjud bot tokenini oling yoki alohida admin bot yarating.
2. Adminning raqamli Telegram ID sini ishonchli manbadan aniqlang; username yozmang. IDni `TELEGRAM_ADMIN_IDS`ga kiriting.
3. Variables saqlanib yangi deploy ishga tushsin. `APP_URL` HTTPS bo‘lishi kerak; server `/api/commerce/telegram/webhook` webhookini secret bilan o‘zi ro‘yxatdan o‘tkazadi.
4. Saytga **admin hisobi bilan** kiring → To‘lov sozlamalari → **Telegram botini ulash**.
5. Havoladagi botni ochib **Start** bosing. Bir martalik havola botdagi shaxsni shu admin hisobiga bog‘laydi. Faqat allowlistdagi ID va faol saytdagi admin moliyaviy tasdiqlashi mumkin.
6. Saytda yuklangan chek botda ko‘rinadi. **Tasdiqlash** tugmasi bank tranzaksiyasi raqamini so‘raydi. `/approve BUYURTMA_UUID BANK_REFERENCE` orqali tasdiqlanadi. Kech to‘lovlar uchun ` | sabab` ham yoziladi. `/reject BUYURTMA_UUID sabab` va `/info BUYURTMA_UUID sabab` mavjud.

Bank reference uchun bir xil, tekshirilgan formatdan foydalaning: masalan `PAYME:TRANZAKSIYA_ID` yoki bank nomi bilan haqiqiy tranzaksiya raqami. Bitta tushum ikki buyurtmaga yozilmasin. Chek rasmini ko‘rishning o‘zi tasdiqlash uchun yetarli emas: pul tushganini bank/Payme hisobotida solishtiring.

Google bilan kirgan o‘quvchi ham ixtiyoriy botni ulab xabar olishi mumkin. Telegram Login avtomatik botga xabar yuborish huquqi bermaydi. Bot ulanmagan yoki ishlamayotganida saytdagi buyurtma, murojaat va admin tasdiqlashi ishlayveradi.

Bot ichida o‘quvchiga coin/dars sotilmaydi; checkout va chek yuklash saytda. Telegram bot/Mini App ichida raqamli mahsulot savdosi alohida Telegram Stars integratsiyasini talab qiladi: [rasmiy Telegram qoidalari](https://core.telegram.org/bots/payments-stars).

## Cheklarni doimiy va yopiq saqlash

`/app/private-payments`ga persistent volume biriktiring. `PRIVATE_RECEIPTS_DIR` shu volume ichida bo‘lsin. Chekni `/uploads`, `dist/public` yoki GitHubga joylamang. JPG/PNG/WEBP, ko‘pi bilan 5 MB; fayl turi va baytlari tekshiriladi. Faqat egasi yoki faol admin faylni oladi.

PostgreSQL va private receipt volume uchun muntazam backup va tiklash tartibini hostingda sozlang. Server moliyaviy jurnal va yordam yozishmalarini o‘chirmaydi; ularni anonimlashtirish/saqlash muddatini amaldagi biznes qoidalari bilan boshqaring.

## Pul va coin hisobini boshqarish

- Coin qo‘shish, xarid va qaytarish transaction bilan bajariladi. Takroriy tugma, bot update yoki parallel admin tasdig‘i ikki marta coin bermaydi.
- Sotib olingan darsga kirish progress va kontent versiyasidan alohida saqlanadi.
- Bonus coin avval sarflanadi; qaytarish faqat aynan shu to‘lovdan qolgan ishlatilmagan pullik coinlar bilan cheklanadi.
- Pulni qaytarish admin bankdagi haqiqiy qaytarish va qaytarish referenceini tasdiqlaganidan keyin qayd etiladi. Qisman qaytarish hisoboti mavjud; bonusning pul qiymati yo‘q.
- Noto‘g‘ri yoki yetarli bo‘lmagan chek → aniqlashtirish. Rad etilgan buyurtmaga yangi chek yuborish mumkin.
- Bekor qilingan/muddati tugagan buyurtmaga kech kelgan to‘lov cheki yuborilsa, alohida kech to‘lov tekshiruviga o‘tadi. Admin sabab bilan tasdiqlaydi.
- Telegram xabarlarini yuborish muvaffaqiyatsiz bo‘lsa navbatda qayta uriniladi. Moliyaviy holat bazada authoritative; admin kabineti asosiy fallback.
- Dars arxivlansa yangi xarid to‘xtaydi, eski xaridorlar tekshirilgan nusxani ko‘radi. Moliyaviy dalillarni yo‘qotadigan hard-delete ishlatilmaydi.

## Tekshirish

`npm run check`, `npm test`, `npm run build`, `npm run test:production`, `npm run test:e2e`.

Mahalliy testlarda faqat alohida PGlite/test bazalari va soxta provider javoblari ishlatiladi. Haqiqiy bank/Payme tushumi, haqiqiy BotFather tokeni va Telegramda admin pairing yakuniy sozlamalardan keyin tekshiriladi.
