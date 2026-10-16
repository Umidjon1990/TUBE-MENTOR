# TUBE MENTOR 2.2 — JSON orqali dars yaratish va o‘quvchi interfeysi

## Bajarilgan ishlar

- Admin → To‘lov va namuna dars sozlamalari: bir martalik welcome bonus, umumiy dars narxi va alohida dars narxlari. Mavjud sozlamalar uchun 30/10 qiymatlari saqlanadi. Oldingi grant/xaridlar o‘zgarmaydi. Narx o‘zgarishlari mavjud commerce auditida qayd qilinadi.
- Mavjud demo tanlash va kirish berish/bekor qilish boshqaruvi saqlandi. Eski xaridni “bepul” deb olib tashlash yoki qayta sotish qilinmadi.
- JSON → tekshiruv → mazmun ko‘rinishi → qoralama → admin tasdig‘i bilan bir bosqichda nashr. Metadata ham JSONdan olinadi. Eski import formatlari ham saqlangan.
- JSON chegarasi 2 MB. Yaroqsiz paket yozilmaydi. Mavjud darsni almashtirishda nusxa raqami tranzaksiya ichida tekshiriladi; eski nashr yangi nusxa tasdiqlanguncha saqlanadi.
- Subtitr va tarjima bosilganda video pauza bo‘ladi. alignment bor darslarda arabcha/inglizcha va o‘zbekcha qismlar bir xil rangda; bosilgan juftlik chiziq va kontur bilan ham ajratiladi.
- Mustahkamlash va yakuniy lug‘at testlarini qo‘lda tahrirlangan JSONda alohida berish mumkin. Savol/variant shuffle yangi urinishda, serverda bo‘ladi; davom etayotgan urinish saqlanadi. Arabcha tanlovlarda ma’no ajratuvchi harakatlar saqlanadi.
- Yangi xarid tasdiqlanganda “Dars sizniki!” va qisqa confetti. Ovoz foydalanuvchi yoqqandagina. Reduced motion qo‘llanadi; qayta ochilgan darsda effekt takrorlanmaydi.
- Public, auth va o‘quvchi sahifalarida oq/lavanda/binafsha mavzu, hajmli tugma va ikonlar. Admin dashboardiga yangi mavzu qo‘llanmaydi.
- Yangi hero tasviri WebP, taxminan 28 KB; runtime 3D/canvas ishlatilmaydi.
- Navigatsiyadagi GET /api/auth/me so‘rovlari login urinishlari limitini tugatmaydi; login va boshqa autentifikatsiya so‘rovlarida limit saqlanadi.

## Ishlatish

1. `/admin/lessons/new` → ChatGPT yo‘riqnomasi va JSON namunani yuklab olish.
2. Yo‘riqnoma bilan real audio/video yoki vaqtli subtitr asosida dars tayyorlash.
3. Tayyor JSONni qo‘yish/yuklash → ko‘rish → qoralama.
4. Muharrir → Kontent → Tekshiruv → to‘rt tasdiq → **Tekshirdim — nashr qilish**.
5. Coin va demo tanlovi: `/admin/commerce-settings`.

## Chegaralar

Avvalgi darslar yangi alignment bilan qayta import qilinmaguncha rangli so‘z/birikma mosligi bo‘lmaydi; pauza va eski lug‘at ishlaydi. Nashr qilish video va tarjima bilan inson tomonidan solishtirishni talab qiladi. Avtomatik validator tarjimaning semantik haqiqatligini yoki i’robning mutlaq to‘g‘riligini kafolatlamaydi. Qoida manbalari `content-quality.md`da ko‘rsatilgan; rasmiy sertifikat da’vosi yo‘q.

OpenAI/Whisper API qo‘lda JSON oqimida ishlatilmaydi, yangi kalit talab qilinmaydi. Ixtiyoriy API vositalari alohida yopiq bo‘limda. PDF/elektron qo‘llanma savdosi ushbu relizga kiritilmagan. Testlar dars kontenti tarkibida nashr qilinadi; alohida mustaqil test do‘koni yaratilmagan.

## Rasm manbasi

Built-in imagegen orqali yaratilgan. Loyiha asseti: `client/public/learning-hero.webp`.

Ishlatilgan prompt:

> Use case: stylized-concept. Asset type: lightweight website hero illustration for TUBE MENTOR language learning. A polished premium 3D still life: glossy violet headphones leaning against a rounded tablet showing a simple white play triangle, small open book and a few gold coin discs, arranged as one coherent compact composition. White to pale lavender background, vivid purple resin surfaces, soft studio shadows, elegant dimensional app aesthetic. No people, no letters, no text, no logos, no watermark. Wide horizontal composition, all objects contained with generous margins. This image will be displayed beside real HTML headings.

## Yakuniy tekshiruv

- TypeScript (`npm run check`): o‘tdi.
- Unit/API (`npm test`): 58/58 o‘tdi.
- Chromium E2E (`npm run test:e2e`): 7/7 o‘tdi; 320, 390, 768 va 1280 px tekshirildi.
- Production build va alohida production smoke: o‘tdi; productionda demo hisob yaratilmasligi tekshirildi.
- Testlar uchun statik demo parollari tasodifiy, har ishga tushganda yangilanadigan qiymatlarga almashtirildi. Karta testi `0000` prefiksli sun’iy raqamdan foydalanadi. Production hisob/parollari ishlatilmaydi.
- Brauzerda yangi JSON import/nashr, subtitr pauzasi va ikki tildagi ajratish, coin xaridi, chek yuborish, admin tasdig‘i va qo‘llab-quvvatlash oqimlari tekshirildi.
