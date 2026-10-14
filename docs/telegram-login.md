# TUBE MENTOR — Telegram orqali kirishni sozlash

Bu loyiha Telegram’ning bepul **Telegram Login / OpenID Connect** xizmatidan foydalanadi. Email, sayt uchun alohida parol, telefon raqamini olish yoki botdan xabar yuborish ruxsati talab qilinmaydi. Faqat `openid profile` so‘raladi.

## 1. Bot yarating

1. Telegram’da rasmiy [@BotFather](https://t.me/BotFather)ni oching.
2. `/newbot` yuboring.
3. Ko‘rinadigan nom uchun `TUBE MENTOR`ni yozing.
4. Bot uchun bo‘sh username tanlang; u `bot` bilan tugashi kerak. Masalan, `TubeMentorLogin_bot` — faqat namuna, band bo‘lsa boshqa nom tanlang.
5. Botga sayt logotipini qo‘ying. Bu foydalanuvchiga kirish oynasidagi botni tanishga yordam beradi.

BotFather bergan **bot tokeni login uchun ishlatilmaydi**. Quyidagi bo‘limdan alohida login Client ID va Client Secret olinadi.

## 2. Login Widget sozlamalarini oching

BotFather’ning **Mini App** oynasini oching, botingizni tanlang va **Login Widget** bo‘limiga kiring. Eski oynada domen maydoni ko‘rinsa, **Switch to OpenID Connect Login** tugmasini bosing. Allowed URLs yangi oynada ikki bo‘limga ajratilgan:

1. **Redirect URIs → Add a Redirect URI**:

```text
https://www.tubementor.uz/api/auth/telegram/callback
```

2. **Trusted Origins → Add a Trusted Origin**:

```text
https://www.tubementor.uz
```

**Native Login** bo‘limi sayt uchun talab qilinmaydi.

Shu bo‘lim ko‘rsatgan **Client ID** va **Client Secret**ni saqlang. Advanced bo‘limidagi token imzolash algoritmini standart **RS256** holatida qoldiring.

Loyiha server orqali qaytish oqimidan foydalanadi; eski iframe widget yoki faqat `/setdomain` buyrug‘i bu OIDC sozlamalarining o‘rnini bosmaydi.

## 3. Railway Variables

Railway → `confident-stillness` loyihasi → `production` → **TUBE-MENTOR** servisi → **Variables → New Variable**:

| Name                     | Value                                             |
| ------------------------ | ------------------------------------------------- |
| `TELEGRAM_CLIENT_ID`     | BotFather’dagi Login Widget Client ID             |
| `TELEGRAM_CLIENT_SECRET` | BotFather’dagi Login Widget Client Secret         |
| `APP_URL`                | `https://www.tubementor.uz` — avvaldan kiritilgan |

Kalitlarni chatga yoki GitHub fayllariga qo‘ymang. `ALLOW_SIGNUP=false` bo‘lsa yangi foydalanuvchi ochish yopiladi; mavjud hisoblar orqali kirish davom etadi. `ALLOW_SIGNUP`ni barcha o‘quvchilar kirishi kerak bo‘lsa `true` qiling yoki standart holatida qoldiring.

Google va Telegram orqali kirish uchun `RESEND_API_KEY` talab qilinmaydi. Mavjud markaz/admin hisoblari login va parol bilan ham ishlaydi.

## 4. Yangilangan versiyani deploy qiling

Kod `feat/mobile-learning-platform` branch va [PR #1](https://github.com/Umidjon1990/TUBE-MENTOR/pull/1)ga push qilinadi. Railway `main`ni kuzatadi. PR `main`ga qo‘shilgandan keyin yangilangan versiya deploy qilinishi kerak; faqat variables kiritish eski 1.0 versiyaga yangi Telegram funksiyasini qo‘shmaydi.

Deployda server qo‘shimcha `telegram_id` ustuni va unique indexni avtomatik yaratadi. Mavjud hisoblar, darslar va progress o‘chirilmaydi. Telegram sozlamalari yo‘q bo‘lsa kirish tugmasi ko‘rsatilmaydi. Baza va yuklangan fayllarning backup/persistent storage talablari [deployment.md](deployment.md)da.

## 5. Yakuniy sinov

1. `https://www.tubementor.uz/api/health` JSONida versiya `2.0.0`, baza `connected` bo‘lsin.
2. `https://www.tubementor.uz/api/auth/config` JSONida `telegramEnabled: true` bo‘lsin. Maxfiy kalitlar bu javobga kiritilmaydi.
3. Kirish yoki ro‘yxatdan o‘tish sahifasidagi **Telegram orqali davom etish** tugmasini bosing.
4. Telegram’da tasdiqlang. Yangi o‘quvchi daraja tanlash sahifasiga, mavjud o‘quvchi esa o‘z darslariga yo‘naltiriladi.
5. Avval Google yoki markaz hisobi bilan kirgan bo‘lsangiz, avval o‘sha profilga kiring: **Profil → Kirish hisoblari → Telegram → Ulash**. Shunda dars natijalari bitta profilda qoladi.
6. Keyin Telegram orqali qayta kiring va o‘sha daraja, lug‘at va natijalar saqlanganini tekshiring. Xuddi shu usulda Google hisobini ham ulash mumkin.

Ikkala provayderda alohida profil yaratib bo‘lgan bo‘lsangiz, dastur ularni avtomatik birlashtirmaydi. Boshqa profilga tegishli hisobni ulash rad etiladi; tasdiqlangan, alohida ko‘chirish rejasi kerak.

## Muammolarni aniqlash

- **Tugma yo‘q:** yangi versiya deploy qilinganini va ikkala Telegram variable mavjudligini tekshiring. Client ID raqamli qiymat; unga bot tokenini yozmang.
- **Kirish yakunlanmadi:** Allowed URLs, `APP_URL`, Client Secret va standart RS256 sozlamasini tekshiring. Yangi tugmadan oqimni qayta boshlang; qaytish havolasini qayta ishlatmang.
- **Profilga ulanmadi:** mavjud profilingizdan ulashni boshlang. Boshqa profilga ulangan Telegram/Google hisobi qayta biriktirilmaydi.
- **Domen o‘zgardi:** `APP_URL` va BotFather Allowed URLsni birga yangilang.

Manba: [Telegram Login rasmiy hujjatlari](https://core.telegram.org/bots/telegram-login).
