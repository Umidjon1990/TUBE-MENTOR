# Kontent sifati va dars yaratish

## Amaliy tartib

1. `/lesson-package-prompt.txt` yo‘riqnomasini va `/lesson-package-example.json` format namunasini oling.
2. ChatGPTga haqiqiy video/audio yoki vaqtli SRT/VTT bilan birga bering. URLning o‘zi manba ochilganini kafolatlamaydi. Namuna havolasi va vaqtlari dars manbasi emas.
3. `/admin/lessons/new` → **JSONdan dars yaratish** → fayl yoki matn → preview → qoralama saqlash.
4. Kontent ko‘rinishida video, tarjima, nahv/sarf, ranglar va testlarni qo‘lda tekshiring. Noto‘g‘ri qismni tuzatib butun paketni muharrirdagi JSON import orqali qayta yuklash mumkin.
5. **Tekshiruv** bo‘limidagi to‘rt tasdiqdan so‘ng **Tekshirdim — nashr qilish**. Admin uchun qo‘shimcha moderator bosqichi kerak emas.
6. **Nashrdan olish** yangi sotuvni yopadi; oldin ochilgan darsga kirish saqlanadi. Xavfsizlik sababli kirishni bekor qilish alohida, sababli va auditli admin amalidir.

Bu yo‘l OpenAI/Whisper API chaqirmaydi. Mavjud ixtiyoriy API tugmalari qo‘lda ishga tushirilmaguncha ishlamaydi. ChatGPT obunasini API krediti deb hisoblamang.

## Format va texnik filtr

- schemaVersion 1; metadata va content bitta paketda.
- YouTube HTTPS URL, til va CEFR darajasi tekshiriladi.
- Subtitrlarning start/end vaqtlari, tartibi va gapga lineIndices mosligi tekshiriladi.
- Tarjima, grammarNotes, wordMap va lug‘at tarjimalari talab qilinadi.
- alignment: JavaScript UTF-16 `[start,end)` indekslari; manba va tarjima oralig‘i chegaradan chiqmasin, ustma-ust tushmasin. Tarjima tabiiy tartibda qoladi.
- Test turi `practice` yoki `vocabulary`; har ikkisi kerak. Har savolda yagona correctIndex, takrorlanmagan variantlar, explanation, skill va distractorRationale kerak.
- Savol va variantlar serverda yangi urinish uchun shuffle qilinadi; davom etayotgan urinishning tartibi saqlanadi. ID va javob matni o‘zgarmaydi. Harakatlari farqli arabcha tanlovlar tenglashtirilmaydi.
- Qoralama almashtirishda contentVersion mos kelishi kerak; eskirgan nusxa 409 bilan rad etiladi. Kontent tahriri oldingi nashrni saqlab, qayta tekshiruvni talab qiladi.

## Mazmuniy mezonlar

Tarjima asl ma’no, zamon, shaxs, inkor va uslubni saqlaydi. Lug‘at kontekstdagi ma’noni beradi. Birikmalar butun tarjima qilinadi. Nahv va sarf, vazifa va i’rob alomati alohida tekshiriladi. Test chalg‘ituvchilari odatiy xatolarga asoslanadi, ammo ikkinchi to‘g‘ri javob yoki variant tartibiga ishora bo‘lmaydi. Yo‘riqnoma alohida ikkinchi mazmuniy tekshiruvni talab qiladi; avtomatik filtr mazmunning to‘g‘riligini isbotlamaydi. Yakuniy video bilan tekshiruv admin zimmasida.

CEFR darajasi pedagogik yo‘nalish hisoblanadi; platforma rasmiy CEFR imtihoni yoki ALTE sertifikati sifatida taqdim qilinmaydi. Sinovlar natijalarini kuzatib, haddan tashqari oson/qiyin yoki noaniq savollarni qayta ko‘rish kerak.

Asosiy manbalar (2026-10-16 tekshirildi):
- Council of Europe, CEFR Companion Volume: https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-companion-volume-and-its-language-versions
- Council of Europe, Developing tests and examining: https://www.coe.int/en/web/common-european-framework-reference-languages/developing-tests-examining
- ALTE, Guides and Reference Materials (Principles of Good Practice va 2026 manual): https://www.alte.org/Materials

Ushbu loyiha qoidalari manbalardan ilhomlangan amaliy tekshiruvlardir; rasmiy audit/sertifikat da’vosi emas.
