// Onlayn kurs uchun ommaviy oferta (2-versiya, «ZAMONAVIYTALIM» MCHJ rekvizitlari bilan). Admin ustoz xonasida tahrirlay oladi.
// Matn versiyalanadi: o'zgartirilsa yangi versiya bo'ladi,
// avval rozi bo'lgan o'quvchilar o'z versiyasida qoladi.
export const OFFER_DRAFT = `# Onlayn kurs shartnomasi (ommaviy oferta)

**"ZAMONAVIYTALIM" MCHJ** (keyingi o'rinlarda — Markaz) zamonaviytalim.uz platformasi orqali arab tili kurslarini o'tkazadi. Siz guruhga qo'shilishda "Shartlarga roziman" belgisini qo'ysangiz, ushbu shartnoma tuziladi. Imzo kerak emas: rozilik vaqti va oferta versiyasi tizimda saqlanadi, nusxasi kabinetingizda turadi.

## 1. Kurs

- Oyiga 12 ta dars: Zoom'da jonli dars, dars yozuvi, topshiriq va testlar.
- Dars jadvali guruh sahifasida. O'zgarsa, kamida 24 soat oldin xabar beriladi.
- O'qituvchi sababi bilan qolgan dars boshqa kuni o'tiladi.

## 2. Sinov haftasi

- Qo'shilgan kundan boshlab 7 kun bepul o'qiysiz.
- Sinov darslari real darslar va birinchi oy hisobiga kiradi.
- Davom etmasangiz, hech narsa to'lamaysiz.

## 3. To'lov

- Oylik narx "Kurs to'lovi" bo'limida ko'rsatiladi.
- Birinchi to'lov sinov tugaguncha qilinadi va qo'shilgan kundan bir oyni qoplaydi. Keyingisi — har oy shu sanada.
- To'lov karta, Click yoki Payme orqali. Chekni "Kurs to'lovi" bo'limiga yuborasiz, Markaz tasdiqlaydi.
- To'lov kunidan 3 kun oldin va o'sha kuni eslatma keladi.
- To'lov kunidan keyin 1 kun imtiyoz bor. Keyin to'lov tasdiqlanguncha darslar yopiladi (chat va to'lov bo'limi ochiq).
- Iltimosingiz bilan keyinroq to'lash sanasi belgilanishi mumkin — shu sanagacha darslar ochiq.

## 4. Qoidalar

- Darslarning kamida 80 foizida qatnashing. Kira olmasangiz, oldindan "Darsga kira olmayman" tugmasi orqali xabar bering.
- Topshiriqlarni muddatida bajaring.
- Guruhda hurmat bilan muomala qiling. Diniy, siyosiy targ'ibot, reklama va haqorat taqiqlanadi.
- Qoidabuzarlik uchun jarima ballari yoziladi: sababsiz qoldirilgan dars — 3, 15 daqiqadan ko'p kechikish — 1, bajarilmagan tezkor topshiriq — 1, kechikkan asosiy topshiriq — 2, chat odobini buzish — 3 ball. Bir oyda 6 ballda ogohlantirish, 10 ballda ikkinchi ogohlantirish, 12 ballda kursdan chetlatish. Ballar har oy nolga tushadi.

## 5. Guruhdan chiqarish

Quyidagi hollarda guruhdan chiqarilasiz:
- sinov tugab yoki to'lov kuni o'tib, to'lov qilinmasa — oldin ogohlantiriladi va 24 soat muddat beriladi;
- bir oyda 12 jarima ballari to'plansa;
- ketma-ket 2 oylik nazoratdan 60% dan kam olib, qayta topshirishda ham o'tmasangiz;
- materiallarni tarqatsangiz yoki guruh qoidalarini qo'pol buzsangiz.

## 6. Pulni qaytarish

- Istalgan vaqtda kursdan chiqishingiz mumkin — platforma orqali yozma ariza bering.
- To'lov tasdiqlangandan keyin 3 kun ichida ariza bersangiz — to'liq qaytariladi.
- Keyin — o'tilmagan darslar uchun qaytariladi.
- Pul 30 kun ichida, to'lov qilingan usul orqali qaytariladi (bank va to'lov tizimi komissiyasi bundan mustasno).

## 7. Materiallar va ma'lumotlar

- Dars yozuvlari, kitoblar va testlar Markaz mulki: yozib olish, skrinshot qilish va tarqatish taqiqlanadi.
- Jonli darslar yozib olinadi va faqat shu guruhga ko'rsatiladi.
- Ism, telefon, davomat, to'lov va natijalaringiz faqat o'qitish uchun ishlatiladi, boshqalarga berilmaydi (qonunda belgilangan hollardan tashqari).

## 8. Boshqa shartlar

- Davomati 80% va yakuniy nazorati 60% dan yuqori bo'lgan o'quvchiga sertifikat beriladi.
- 18 yoshgacha bo'lganlar ota-onasi roziligi bilan qo'shiladi.
- Internet uzilishi, tabiiy ofat kabi holatlarda dars boshqa kunga ko'chiriladi.
- Markaz shartlarni kamida 10 kun oldin xabar berib o'zgartirishi mumkin. Rozi bo'lmasangiz, 6-bo'lim bo'yicha pulni qaytarib olib chiqishingiz mumkin.
- Nizolar avval kelishuv yo'li bilan, kelishilmasa qonunchilikka muvofiq sudda hal qilinadi.

## Markaz

"ZAMONAVIYTALIM" MCHJ · STIR 312 316 714
Davlat ro'yxatidan o'tgan: 30.07.2025, guvohnoma № 2895972
Ta'lim faoliyati xabarnomasi: tasdiqnoma № 929919, reyestr X-1742760 (Maktabgacha va maktab ta'limi vazirligi; masofaviy ta'lim, arab tili)
Manzil: Namangan viloyati, Uychi tumani, Bog' MFY, Savdogar ko'chasi, 41-uy
Sayt: zamonaviytalim.uz
`;

/** Qo'shilishda o'quvchi alohida belgilaydigan asosiy bandlar (har biri majburiy). */
export const OFFER_CONSENTS = [
  { key: "payment", label: "7 kun sinov bepul; keyin oylik to'lov qilaman, to'lamasam darslar yopilishi va guruhdan chiqarilishim mumkin" },
  { key: "rules", label: "Darslarda qatnashaman, guruh qoidalari va jarima ballari tizimiga roziman" },
  { key: "materials", label: "Dars materiallarini tarqatmayman; darslar yozib olinishiga roziman" },
  { key: "personalData", label: "Pulni qaytarish tartibi bilan tanishdim va ma'lumotlarim o'qitish uchun ishlatilishiga roziman" },
] as const;
