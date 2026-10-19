# Zamonaviy Ta’lim: domen o‘zgarishisiz yakuniy ulanishlar

Asosiy manzil: https://zamonaviy-talim.up.railway.app. Domen va DNS o‘zgartirilmaydi.

## Adminning ish tartibi

1. Asosiy saytga mavjud Google, Telegram yoki mavjud tasdiqlangan hisob bilan kiring. Hisobda `admin` roli bo‘lishi kerak.
2. Kabinet → Admin → **Kontent muharrirlari**. Tube Mentor, Video kurslar, Arabictest, Master Quiz/PDF, Al-Qomus va asosiy sayt muharrirlari shu yerdan ochiladi. Alohida parol kiritilmaydi.
3. Asosiy hisobdan chiqish muharrirlardagi shu hisobdan berilgan ruxsatlarni ham yopadi. Avvaldan mavjud mustaqil native admin loginlari saqlanadi.
4. Kontentni o‘z manbasida tayyorlang. Asosiy admin kabinetida katalogni yangilang, haqiqiy coin narxi, muddat va limitni belgilang, demoni tekshirib **Sotuvda** holatiga o‘tkazing. Tizim taxminiy narx bilan mahsulotlarni avtomatik sotuvga chiqarmaydi.
5. Xaridlar, muddat uzaytirish, ruxsatni bekor qilish, coin qaytarish, Telegram to‘lovlarini tasdiqlash va qo‘lda baholash navbati asosiy admin kabinetida boshqariladi.

## Arabictest Darslik paketlari

Darslikni Arabictest muharririda yarating; kamida bitta ishlaydigan bepul preview video bo‘lsin. Darslik nashr qilingan va dashboard uchun yoqilgan bo‘lishi kerak. Savdoga mosligi barcha dars/paket testlari asosida tekshiriladi. Narx va aniq foydalanish muddatini asosiy kabinetda belgilang.

O‘quvchi xaridni **Video kurslarim** bo‘limidan davom ettiradi. Har bir coin xaridi o‘z native biriktirishi va progressiga ega. Videolar, ketma-ket ochilish, darsga xos reading quiz, oddiy/TANAL/skill testlar va paket testlari manba qoidalari bilan ishlaydi. Boshlangan test qayta ochilganda yangi urinish sarflanmaydi. Natijalar muzlatilgan savollar bo‘yicha hisoblanadi.

Sotilgan kursning dars/paket tuzilmasini o‘chirib almashtirish cheklangan: nashrdan oling yoki yangi kurs nusxasi yarating. Ruxsat bekor qilinganda course reading tarixi o‘chirilmaydi; mustaqil qo‘lda berilgan ruxsatlar boshqa xarid bilan aralashtirilmaydi.

## PDF savdosi

Master Quiz muharriri → Kutubxona → **PDF yuklash**. Mavjud himoyalangan saqlash ishlatiladi. **Marketplace’da sotish** belgisini yoqing, 1–5 ta demo sahifani tanlang. Eski xususiy kitoblar avtomatik ommaga ochilmaydi.

Asosiy admin kabinetida katalogni yangilang va PDF uchun coin narxi, muddat hamda **PDF ochish limiti**ni belgilang. Bo‘sh limit cheksiz; qiymat kiritilsa, bu sahifa soni emas, yangi o‘qish seanslari sonidir. Nashrdan olish avvalgi xaridlarni bekor qilmaydi. Native kutubxonada kitobni arxivlash/litsenziyani tugatish esa fayldan foydalanishni to‘xtatadi.

Xaridor **Manbalarim** orqali PDF’ni ochadi. Bitta o‘qish seansi 2 soatgacha, xarid/litsenziya muddatidan oshmagan holda ishlaydi. Sahifa almashtirish, range so‘rovlari va faol seans ichida qayta yuklash qo‘shimcha ochish sarflamaydi. Har bir sahifada shaxsiy suvbelgi bo‘ladi. Skrinshotni mutlaqo taqiqlash va’da qilinmaydi.

Eski Master hisobini tasdiqlab bog‘lash uning native PDF biriktirishlari, qolgan ochishlari va muddatini ham import qiladi. Counter va parallel seanslar eski kabinet bilan bir xil native yozuvlarda saqlanadi. Yangi coin xaridlari ulardan mustaqil.

## Xavfsizlik va ekspluatatsiya

- Bir martalik 60 soniyali admin kodi, source/nonce binding, HttpOnly cookie, har so‘rovda asosiy admin sessiyasini tekshirish.
- Brauzerga service kalit, login tokeni yoki original PDF storage key berilmaydi.
- Coin hisobini faqat asosiy core o‘zgartiradi; idempotent outbox yetkazishi va source ACK’dan keyingi refund saqlanadi.
- PDF streaming: source → core → BFF, HTTP Range va `private, no-store, no-transform`. Demo faqat dastlabki belgilangan sahifalardan qayta tuziladi.
- Mavjud SESSION_SECRET/JWT/storage/Google/Telegram kalitlari o‘zgartirilmaydi. Al-Qomus uchun alohida service kaliti core va source’ga bir xil qilib qo‘yiladi.
- Yangi SQL jadvallar qo‘shiluvchi va qayta ishga tushirishga chidamli. Mavjud foydalanuvchilar, coin tarixi va kontent bazalari ko‘chirilmaydi.
