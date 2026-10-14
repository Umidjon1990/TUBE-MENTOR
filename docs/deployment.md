# Deploy va konfiguratsiya

TUBE MENTOR 2.1 faol rollari — **admin va o‘quvchi**. Admin barcha mualliflarning kontentini, mavzularni, coin paketlarini, to‘lov va yordam jarayonini `/admin` orqali boshqaradi. Eski teacher hisoblari studentga o‘tadi; balans va kontent saqlanadi, admin huquqi avtomatik berilmaydi. Batafsil ishlash tartibi: [coin-payments.md](coin-payments.md).

## Majburiy sozlamalar

| Variable         | Qiymat                               | Maqsad                                          |
| ---------------- | ------------------------------------ | ----------------------------------------------- |
| `DATABASE_URL`   | Hostingdagi PostgreSQL ulanish satri | Barcha ma’lumotlar va production sessiyalar     |
| `SESSION_SECRET` | 32+ tasodifiy belgi                  | Sessiya imzosi; deploylar orasida o‘zgartirmang |
| `APP_URL`        | `https://sizning-domeningiz`         | Email havolalari, OAuth va so‘rov manbasi       |
| `PORT`           | Hosting bergan port                  | Express porti; lokal standart 5000              |
| `TZ`             | `UTC`                                | Serverning vaqt talqini                         |

Tasodifiy secret yaratish: `node -e "process.stdout.write(require('node:crypto').randomBytes(48).toString('base64url'))"`. Natijani hosting variables oynasiga qo‘ying. Secretni chatga yoki GitHub fayliga kiritmang.

## Qo‘shimcha imkoniyatlar

| Variable                                       | Qachon kerak                                                                                       |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`                               | Email bilan ro‘yxatdan o‘tish, email tasdiqlash va parol tiklash; Google/Telegram uchun kerak emas |
| `MAIL_FROM`                                    | Resend tasdiqlagan domen: `TUBE MENTOR <hello@domeningiz>`                                         |
| `ALLOW_SIGNUP`                                 | `false` bo‘lsa yangi hisob ochish yopiladi; mavjud hisoblar ishlaydi                               |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`     | Google OAuth web application                                                                       |
| `TELEGRAM_CLIENT_ID`, `TELEGRAM_CLIENT_SECRET` | BotFather Login Widget bergan OIDC login kalitlari; bot tokeni emas                                |
| `OPENAI_API_KEY`                               | AI kontent va Whisper transkripsiya                                                                |
| `OPENAI_MODEL`                                 | Standart `gpt-4o-mini`; hisobingizda ruxsat berilgan model                                         |
| `YT_DLP_BINARY`                                | YouTube audiosini olish uchun o‘rnatilgan `yt-dlp` yo‘li                                           |
| `DB_POOL_MAX`                                  | Har app instance uchun ulanish limiti; standart 10                                                 |
| `TELEGRAM_BOT_TOKEN`                           | Admin to‘lov bildirishnomalari boti; Telegram Login kaliti emas                                    |
| `TELEGRAM_WEBHOOK_SECRET`                      | Bot webhooki uchun 32+ tasodifiy belgi                                                             |
| `TELEGRAM_ADMIN_IDS`                           | Tasdiqlashga ruxsatli adminlarning raqamli Telegram IDlari, vergul bilan ajratilgan                |
| `PRIVATE_RECEIPTS_DIR`                         | Yopiq, doimiy volume ichidagi chek papkasi: `/app/private-payments/receipts`                       |

Google Cloud Console’da **Web application** OAuth client yarating. Authorized redirect URI aynan `https://sizning-domeningiz/api/auth/google/callback` bo‘lsin. Domenni o‘zgartirsangiz `APP_URL` va callbackni birga yangilang. Email xizmatida domenni tasdiqlash kerak. Kalitlar yo‘q bo‘lsa UI shu imkoniyatni o‘chirilgan holda ko‘rsatadi.

Telegram uchun BotFather Mini App → bot → **Login Widget → Switch to OpenID Connect Login**ni oching. **Trusted Origin**ga saytning HTTPS domenini, **Redirect URI**ga `APP_URL/api/auth/telegram/callback`ni kiriting; Client ID/Secretni hostingga qo‘ying. Standart RS256 algoritmini qoldiring. To‘liq qadamlar: [telegram-login.md](telegram-login.md). Telegram hisobida email bo‘lmasa ham kirish va o‘qish ishlaydi; Google/Telegram hisoblarini mavjud **Profil → Kirish hisoblari** orqali bog‘lash mumkin. Yangi profillar faqat student rolida ochiladi; boshqa profilning provayder hisobini ulash rad etiladi.

YouTube’dan Whisper orqali audio olish uchun deploy muhitida `ffmpeg` va boshqariladigan `yt-dlp` versiyasini o‘rnating. Dastur ish paytida tashqi binarni yuklab ishga tushirmaydi. `yt-dlp` bo‘lmasa admin audio faylni bevosita yuklashi mumkin. Ayrim YouTube videolari login yoki hudud cheklovi sabab ochilmasligi mumkin; admin cookie yuklash oynasi faqat kerak bo‘lganda ishlatiladi.

## Coin va qo‘lda to‘lovni tayyorlash

Yangi tasdiqlangan o‘quvchi bir marta **30 coin** oladi; oddiy dars **10 coin**. Darsga xarid huquqi progressdan alohida saqlanadi: takror ko‘rish va tekshirilgan yangi nusxa yana coin olmaydi. Balans tugashi mavjud dars/lug‘at/natijani yopmaydi. Admin belgilagan bitta haqiqiy namuna dars mehmon uchun ochiq.

1. **Coin paketlari**da haqiqiy so‘mdagi narxlarni kiriting va sotiladigan paketlarni faollashtiring. Dastlab 50/100/300 coin paketlari narxi 0, faol emas.
2. **To‘lov sozlamalari**da qabul qiluvchi, 16 raqamli karta yoki rasmiy HTTPS Payme havolasi, yo‘riqnoma va tekshirish ish vaqtini belgilang. Yordam/qaytarish qoidalarini yo‘riqnomada tushuntiring.
3. Nashr qilingan haqiqiy darslardan bittasini **Namuna dars** sifatida tanlang. Tayyor narx va rekvizitlar bo‘lgach to‘lov qabul qilishni yoqing.
4. O‘quvchi sayt orqali paket tanlaydi, buyurtmaga to‘lov qiladi va chek yuklaydi. Admin haqiqiy bank/Payme tushumini tekshirib, noyob bank tranzaksiya raqami bilan tasdiqlaydi; shundan keyin coin bir marta qo‘shiladi.
5. Noto‘liq to‘lov yoki chek uchun aniqlashtirish/rad etish ishlatiladi. **Murojaatlar**da o‘quvchi va buyurtmaga bog‘langan yozishmalar yuritiladi. Murojaat yoki javobning o‘zi balansni o‘zgartirmaydi.
6. Qaytarish faqat shu buyurtmadan qolgan ishlatilmagan pullik coinlarga tatbiq etiladi. Admin pulni bank orqali qaytargach, qaytarish tranzaksiyasi va sababini buyurtmada qayd etadi; bonusning pul qiymati yo‘q.

Bu versiyada **Payme Merchant API va avtomatik to‘lov billing ulanmagan**. Rasmiy Payme checkout havolasi tegishli merchant/kassa ulanishini talab qiladi; oddiy karta raqamidan bunday havola yasalmaydi. Coin qo‘shilishi adminning serverda saqlangan tasdig‘iga tayanadi. To‘liq qo‘llanma: [coin-payments.md](coin-payments.md).

## Telegram admin bildirishnomalari

Login kalitlarini saqlang. Bot uchun alohida `TELEGRAM_BOT_TOKEN`, 32+ belgili `TELEGRAM_WEBHOOK_SECRET` va raqamli `TELEGRAM_ADMIN_IDS` kerak. Server `APP_URL/api/commerce/telegram/webhook`ni secret bilan ro‘yxatdan o‘tkazadi.

Saytga faol admin hisobi bilan kirib **To‘lov sozlamalari → Telegram hisobini ulash** havolasini yarating, botda **Start** bosing. Botdagi moliyaviy qaror uchun saytning faol admini va Telegram ID allowlisti birga tekshiriladi. Bot tokenini, webhook secretini yoki login secretini UI/GitHubga kiritmang.

Checkout va chek yuklash saytda bajariladi; bot adminning tekshirish/bildirishnoma vositasi. Bot ulanmaganida ham saytdagi buyurtma, yordam va tasdiqlash ishlaydi. Telegram bot/Mini App ichida raqamli mahsulot savdosi alohida Stars integratsiyasini talab qiladi; bu versiya botda dars yoki coin sotmaydi.

## Deploy ketma-ketligi

1. Ishlab turgan PostgreSQL bazasi, yuklangan rasmlar va mavjud yopiq chek fayllarining backupini oling.
2. Hostingga majburiy variables kiriting. Mavjud `SESSION_SECRET`ni saqlang; bo‘lmagan bo‘lsa yangi yarating.
3. `npm ci && npm run build` bilan build; `npm start` bilan ishga tushiring. `railway.json` shu buyruqlarni ishlatadi. Startup migratsiyalarni transaction va advisory lock bilan bir marta qo‘llaydi; xatoda app tayyor deb ko‘rsatilmaydi.
4. `/api/health` — database connected/200 qaytarsin. Domain HTTPS va reverse proxy bitta ishonchli hop orqali ishlasin. To‘g‘ridan-to‘g‘ri tashqi kirishni faqat hosting proxyga yo‘naltiring.
5. Mavjud admin hisob bo‘lmasa, bir marta `ADMIN_USERNAME`, `ADMIN_PASSWORD`ni kiritib `npm run setup:admin` bajaring. Keyin admin paroli variable’ni o‘chiring.
6. Admin kontent yaratish/nashr qilish va namuna darsni tanlashni tekshiring. Google/Telegram kirishi, bitta 30 coin bonus, dars ochish va qayta kirishda mavjud huquqni yakuniy domenda sinang. Email xizmati yoqilgan bo‘lsa tasdiqlash/parol tiklash, YouTube video/audio va telefon mikrofonini ham sinang.
7. To‘lov rekvizitlari tayyor bo‘lgach, kichik haqiqiy to‘lov bilan chek, bank tushumi, saytdagi/botdagi admin tasdig‘i, balans, dars xaridi va murojaatni tekshiring. Haqiqiy tashqi xizmatlar bilan sinov lokal fixture sinovlaridan alohida.

**Fayllar:** `/app/uploads`ni persistent volume bilan saqlang (konteyner working directory `/app` bo‘lsa). YouTube cookie fayli rootda `youtube_cookies.txt`, vaqtinchalik cookie fayllari `private-uploads`da; ular `/uploads`dan tashqarida va GitHubga kiritilmaydi. Cookie yangilansa mavjud nusxaga xavfsiz huquqlar qo‘llanadi. Bir nechta app instance bo‘lsa rasmlar uchun umumiy persistent storage kerak. PostgreSQL muntazam backup olinsin.

**To‘lov cheklari:** `/app/private-payments`ga ommaviy fayllardan alohida persistent volume biriktiring va `PRIVATE_RECEIPTS_DIR=/app/private-payments/receipts`ni kiriting. Papka serverga yozish uchun ochiq bo‘lsin; uni `/uploads`, `dist/public` yoki GitHubga qo‘ymang. Chek faqat egasi yoki faol adminning autentifikatsiyalangan so‘rovi bilan beriladi. PostgreSQL moliyaviy jurnalini va private receipt volume’ni birga backup qiling; yangi deploy yoki restart cheklar tarixini yo‘qotmasligi kerak. Bir nechta app instance ishlatilsa shu yopiq fayllar barcha instancelarga yagona xavfsiz saqlash orqali ochilishi kerak.

**Rollback:** migratsiyalar qo‘shimcha jadval/ustunlar kiritadi; eski ma’lumotlarni o‘chirmaydi. Kodni oldingi commitga qaytarishdan oldin eski startupdagi `db:push --force` buyrug‘ini ishlatmaslik kerak. Bazani orqaga tushirish zarur bo‘lsa backupdan alohida tiklash rejasini qo‘llang.

## GitHub tekshiruvi

CI Ubuntu 24.04, Node 20 va PostgreSQL 16 bilan sozlangan. Hozir GitHub hisobi billing sabab Actions ishlarini boshlamayapti. Hisobdagi shu cheklov bartaraf etilgach PR tekshiruvini qayta ishga tushirish kerak. Mahalliy sinovlar va production smoke natijalari `implementation-status.md`da keltirilgan.
