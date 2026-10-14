# Deploy va konfiguratsiya

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

Google Cloud Console’da **Web application** OAuth client yarating. Authorized redirect URI aynan `https://sizning-domeningiz/api/auth/google/callback` bo‘lsin. Domenni o‘zgartirsangiz `APP_URL` va callbackni birga yangilang. Email xizmatida domenni tasdiqlash kerak. Kalitlar yo‘q bo‘lsa UI shu imkoniyatni o‘chirilgan holda ko‘rsatadi.

Telegram uchun BotFather Mini App → bot → **Login Widget**da saytning HTTPS manzili va `APP_URL/api/auth/telegram/callback`ni Allowed URLsga kiriting; Client ID/Secretni hostingga qo‘ying. Standart RS256 algoritmini qoldiring. To‘liq qadamlar: [telegram-login.md](telegram-login.md). Telegram hisobida email bo‘lmasa ham kirish va o‘qish ishlaydi; Google/Telegram hisoblarini mavjud **Profil → Kirish hisoblari** orqali bog‘lash mumkin. Yangi profillar faqat student rolida ochiladi; boshqa profilning provayder hisobini ulash rad etiladi.

YouTube’dan Whisper orqali audio olish uchun deploy muhitida `ffmpeg` va boshqariladigan `yt-dlp` versiyasini o‘rnating. Dastur ish paytida tashqi binarni yuklab ishga tushirmaydi. `yt-dlp` bo‘lmasa o‘qituvchi audio faylni bevosita yuklashi mumkin. Ayrim YouTube videolari login yoki hudud cheklovi sabab ochilmasligi mumkin; admin cookie yuklash oynasi faqat kerak bo‘lganda ishlatiladi.

## Deploy ketma-ketligi

1. Ishlab turgan PostgreSQL bazasi va yuklangan rasmlarning backupini oling.
2. Hostingga majburiy variables kiriting. Mavjud `SESSION_SECRET`ni saqlang; bo‘lmagan bo‘lsa yangi yarating.
3. `npm ci && npm run build` bilan build; `npm start` bilan ishga tushiring. `railway.json` shu buyruqlarni ishlatadi. Startup migratsiyalarni transaction va advisory lock bilan bir marta qo‘llaydi; xatoda app tayyor deb ko‘rsatilmaydi.
4. `/api/health` — database connected/200 qaytarsin. Domain HTTPS va reverse proxy bitta ishonchli hop orqali ishlasin. To‘g‘ridan-to‘g‘ri tashqi kirishni faqat hosting proxyga yo‘naltiring.
5. Mavjud admin hisob bo‘lmasa, bir marta `ADMIN_USERNAME`, `ADMIN_PASSWORD`ni kiritib `npm run setup:admin` bajaring. Keyin admin paroli variable’ni o‘chiring.
6. Haqiqiy Google/Telegram kirishi, profilga provayder ulash, email xizmati yoqilgan bo‘lsa tasdiqlash/parol tiklash, YouTube video/audio va telefon mikrofonini yakuniy domenda sinang. Tashqi provayderlarni haqiqiy kalitlar bilan tekshirish lokal sinovlardan alohida.

**Fayllar:** `/app/uploads`ni persistent volume bilan saqlang (konteyner working directory `/app` bo‘lsa). YouTube cookie fayli rootda `youtube_cookies.txt`, vaqtinchalik cookie fayllari `private-uploads`da; ular `/uploads`dan tashqarida va GitHubga kiritilmaydi. Cookie yangilansa mavjud nusxaga xavfsiz huquqlar qo‘llanadi. Bir nechta app instance bo‘lsa rasmlar uchun umumiy persistent storage kerak. PostgreSQL muntazam backup olinsin.

**Rollback:** migratsiyalar qo‘shimcha jadval/ustunlar kiritadi; eski ma’lumotlarni o‘chirmaydi. Kodni oldingi commitga qaytarishdan oldin eski startupdagi `db:push --force` buyrug‘ini ishlatmaslik kerak. Bazani orqaga tushirish zarur bo‘lsa backupdan alohida tiklash rejasini qo‘llang.

## GitHub tekshiruvi

CI Ubuntu 24.04, Node 20 va PostgreSQL 16 bilan sozlangan. Hozir GitHub hisobi billing sabab Actions ishlarini boshlamayapti. Hisobdagi shu cheklov bartaraf etilgach PR tekshiruvini qayta ishga tushirish kerak. Mahalliy sinovlar va production smoke natijalari `implementation-status.md`da keltirilgan.
