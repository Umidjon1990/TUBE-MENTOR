/** Source: user supplied Juho 1-qism .mp4, 148.12 s. Timings checked against
 * local Arabic ASR and visible captions. Character's deliberate grammar errors
 * are preserved in quoted speech and explicitly explained, never silently fixed. */
import {writeFileSync} from 'node:fs';
import {experienceSchema,type Experience} from '../shared/experience';
import {experiencePackage} from '../shared/experience-package';
const bare=(s:string)=>s.replace(/[\u064b-\u0670]/g,'').replace(/[،.؟!«»]/g,'');
const verbs=new Set('يصنعون سنخيم تقصد أقصد قلت كان انظر تلمعان تحاول كشفت يضرب أخطأت استخدمت يشير يجب تقول تشير تستخدم أشير يمكنك'.split(' '));
const adjectives=new Set('معنوي جميل مخيف بعيد بعيدة المشهورين أجمل العاقل'.split(' '));
const pronouns=new Set('هو أنت هذا هذه هاتان هؤلاء الذي ذلك إنها إنه إنّه'.split(' '));
const particles=new Set('يا من ومن في لا بل لاسم حين ما كان أمام لقد لكان كيف إلى وهو والنجوم لأن أما ولكنك لن أن بها بعد الآن فقط بدلا مثل كسر بالتأكيد فذكاء'.split(' '));
type G=[string,string,string];
const rows:{start:number;end:number;groups:G[];grammar:string}[]=[];
function add(start:number,end:number,grammar:string,...groups:G[]){rows.push({start,end,groups,grammar})}
add(0,3.25,'إِنَّ — ta’kid yuklamasi; ـهُ uning ismi, كَسْرٌ xabari. مَعْنَوِيٌّ sifat. Bu yerda «buzish» ko‘chma ma’noda.',
 ['إِنَّهُ كَسْرٌ مَعْنَوِيٌّ','Bu ko‘chma ma’nodagi buzish-ku','albatta, u|buzish|ko‘chma ma’nodagi'],['يَا هُومَا','ey Huma.','ey|Huma']);
add(3.25,6.1,'كَسْرِ الْقَوَاعِدِ — izofa: qoidalarni buzish. وَ — bog‘lovchi. Huma «buzish»ni jismonan sindirish deb tushunadi.',
 ['مِثْلَ كَسْرِ','Bamisoli buzish','kabi|buzish'],['الْقَوَاعِدِ وَالْقَوَانِينِ','qoidalar va qonunlarni.','qoidalar|va qonunlar']);rows.at(-1)!.groups[0][1]='Qoidalar va qonunlarni buzish kabi.';rows.at(-1)!.groups[1][1]='';
add(6.1,10.8,'لِمَاذَا — sabab so‘rog‘i. يَصْنَعُونَ — ko‘plikdagi hozirgi zamon fe’li. مِنَ الزُّجَاجِ materialni bildiradi; qahramonning so‘zi so‘zma-so‘z tushunishga asoslangan hazil.',
 ['وَلِمَاذَا يَصْنَعُونَ','Nega ular yasashadi','va nega|ular yasaydilar'],['الْقَوَاعِدَ وَالْقَوَانِينَ','qoidalar va qonunlarni','qoidalarni|va qonunlarni'],['مِنَ الزُّجَاجِ يَا جُحَا','oynadan, ey Juho?','-dan|oyna|ey|Juho']);
add(23.24,28.06,'هٰذَا — yaqin turgan birlik muzakkarga ishora. الْمَكَانُ — joy. الَّذِي bog‘lovchi olmoshidan keyingi gap joyni aniqlaydi; سَـ kelasi zamonni bildiradi.',
 ['هٰذَا هُوَ الْمَكَانُ','Mana shu joy','bu|u|joy'],['الَّذِي سَنُخَيِّمُ فِيهِ','biz chodir tikib tunaydigan','-adigan (bog‘lovchi olmosh)|biz chodir tikib tunaymiz|unda'],['يَا هُومَا','ey Huma.','ey|Huma']);
add(29.06,31.3,'جِدًّا sifatning darajasini kuchaytiradi: «juda». Bu qisqa gapda baholanayotgan narsa oldingi kontekstdan anglashiladi.',
 ['جَمِيلٌ جِدًّا','Juda ajoyib.','chiroyli, ajoyib|juda']);
add(31.52,33.6,'تَقْصِدُ — «sen nazarda tutyapsan». Savol intonatsiya orqali berilgan.',
 ['تَقْصِدُ الْمَكَانَ','Joyni nazarda tutyapsanmi?','sen nazarda tutyapsan|joyni']);
add(33.6,37.7,'لَا ... بَلْ — oldingi taxminni inkor qilib tuzatish. اِسْتِخْدَامَكَ — «sening ishlatishing»; ـكَ ikkinchi shaxs qo‘shimchasi. هٰذَا bu yerda til birligi sifatida tilga olingan.',
 ['لَا بَلْ أَقْصِدُ','Yo‘q, men nazarda tutyapman','yo‘q|balki|men nazarda tutaman'],['اسْتِخْدَامَكَ لِاسْمِ الْإِشَارَةِ هٰذَا','«bu» ko‘rsatish olmoshini ishlatganingni','sening ishlatishingni|olmoshi uchun (ismga)|ko‘rsatish|bu']);
add(37.7,39.86,'حِينَ — «...ganingda», vaqtni bildiradi. قُلْتَ — قَالَ fe’lining ikkinchi shaxs o‘tgan zamoni. Keyin Juho aytgan jumla iqtibos qilinadi.',
 ['حِينَ قُلْتَ','Sen deganingda:','...gan paytingda|sen deding'],['هٰذَا هُوَ الْمَكَانُ','«Mana shu joy».','bu|u|joy']);
add(39.86,43.76,'مَا رَأْيُكَ فِي ...؟ — «... haqida fikring qanday?» qolipi. رَأْيُكَ tarkibidagi ـكَ «sening»ni bildiradi.',
 ['مَا رَأْيُكَ فِي الْمَكَانِ','Joy haqida fikring qanday','qanday|sening fikring|haqida|joy'],['يَا هُومَا','ey Huma?','ey|Huma']);
add(43.76,46.44,'إِنَّهُ — «haqiqatan ham bu». مَكَانٌ xabar, مُخِيفٌ unga ergashgan sifat: «qo‘rqinchli joy».',
 ['إِنَّهُ مَكَانٌ مُخِيفٌ','Bu qo‘rqinchli joy ekan','haqiqatan, u|joy|qo‘rqinchli'],['يَا جُحَا','ey Juho.','ey|Juho']);
add(46.44,50.38,'كَانَ بِإِمْكَانِنَا — «biz ... qilishimiz mumkin edi». التَّخْيِيمُ masdar. أَمَامَ — «oldida».',
 ['كَانَ بِإِمْكَانِنَا التَّخْيِيمُ','Chodir tikishimiz mumkin edi','edi|bizning imkonimizda|chodir tikish'],['فِي صَالَةِ الْمَنْزِلِ','uy mehmonxonasida','-da|mehmonxona, zal|uyning'],['أَمَامَ التِّلْفَازِ','televizor oldida.','oldida|televizor']);
add(66.02,68.5,'يَا سَلَامُ — hayrat yoki zavqni bildiradigan tayyor undov. Bu o‘rinda so‘zma-so‘z «ey tinchlik» deb tarjima qilinmaydi.',
 ['يَا سَلَامُ','Voy, qanday zo‘r!','ey (undov)|ajoyib! (undov)']);
add(68.82,70.32,'Oldingi undovga ikkinchi qahramon ham qo‘shiladi. Ma’no nutq vaziyatidan anglashiladi.',
 ['يَا سَلَامُ','Voy, qanday ajoyib!','ey (undov)|ajoyib! (undov)']);
add(70.32,74.1,'مَا أَفْعَلَ ... — taajjub qolipi. مَا أَجْمَلَ الِاسْتِرْخَاءَ — «Dam olish naqadar yoqimli!»; الِاسْتِرْخَاءَ bu qolipda mansub.',
 ['مَا أَجْمَلَ الِاسْتِرْخَاءَ','Dam olish naqadar yoqimli','naqadar|go‘zal, yoqimli|dam olishni'],['يَا هُومَا','ey Huma!','ey|Huma']);
add(74.1,78.82,'هَاتَانِ — yaqin turgan ikkita muannas narsaga ishora, raf holatida. النَّجْمَتَانِ va تَلْمَعَانِ ham ikkilik shaklda. بِشِدَّةٍ — ravish ma’nosida «kuchli».',
 ['انْظُرْ يَا جُحَا','Qara, ey Juho','qara|ey|Juho'],['هَاتَانِ النَّجْمَتَانِ','mana bu ikki yulduz','mana bu ikkita (muannas)|ikki yulduz'],['تَلْمَعَانِ بِشِدَّةٍ','juda yorqin porlayapti.','ikkalasi porlayapti|kuchli ravishda']);
add(79.92,83.82,'هٰذِهِ — muannas birlikka ishora. خُدْعَةٌ muannas ot bo‘lgani uchun هٰذِهِ tanlangan. مِنْكَ — «sendan», kontekstda «sening».',
 ['هٰذِهِ خُدْعَةٌ مِنْكَ','Bu sening hiylang-ku','bu (muannas)|hiyla|sendan, sening'],['يَا هُومَا','ey Huma.','ey|Huma']);
add(83.82,87.3,'تُحَاوِلُ + masdar — «... qilishga urinyapsan». مُرَاجَعَةَ دَرْسِ أَسْمَاءِ الْإِشَارَةِ ketma-ket izofa birikmasidir.',
 ['أَنْتَ تُحَاوِلُ مُرَاجَعَةَ','Sen takrorlashga urinyapsan','sen|sen urinyapsan|takrorlashni'],['دَرْسِ أَسْمَاءِ الْإِشَارَةِ','ko‘rsatish olmoshlari darsini.','darsining|ismlari, olmoshlari|ko‘rsatish']);
add(87.3,91.12,'وَهٰذَا — «bu esa». وَقْتُ اسْتِرْخَاءٍ izofasi «dam olish vaqti»ni bildiradi. فَقَطْ ma’noni cheklaydi: «xolos».',
 ['وَهٰذَا وَقْتُ اسْتِرْخَاءٍ فَقَطْ','Bu esa faqat dam olish vaqti-ku.','bu esa|vaqt|dam olish|faqat, xolos']);
add(91.12,94.08,'هٰذَا muzakkar ذَكَاءٌ so‘ziga mos kelgan. مِنْكَ kontekstda «sening tomoningdan» ma’nosida.',
 ['هٰذَا ذَكَاءٌ مِنْكَ','Bu sening ziyrakliging','bu|ziyraklik|sening tomoningdan'],['يَا جُحَا','ey Juho.','ey|Juho']);
add(94.08,97.1,'لَقَدْ o‘tgan voqeani ta’kidlaydi. كَشَفْتَ — «sen fosh qilding»; خُطَّتِي — «mening rejam». Eski matndagi خَطَاتِي shakli xato edi.',
 ['لَقَدْ كَشَفْتَ خُطَّتِي','Rejamni fosh qilding','haqiqatan (ta’kid)|sen fosh qilding|mening rejamni'],['بِسُهُولَةٍ','osongina.','osonlik bilan']);
add(98.02,103.32,'يُضْرَبُ بِهِ الْمَثَلُ — majhul nisbatdagi turg‘un ibora: «u bilan misol keltiriladi; dong‘i ketgan». Uni «misol bilan uriladi» deb tarjima qilish noto‘g‘ri.',
 ['بِالتَّأْكِيدِ','Albatta!','albatta'],['فَذَكَاءُ جُحَا','Axir Juhoning zakovati','axir zakovati|Juhoning'],['يُضْرَبُ بِهِ الْمَثَلُ','tillarda doston-ku.','misol keltiriladi (iboraning fe’li)|u bilan|misol']);
add(103.32,108.52,'MUHIM: «هَؤُلَاءِ النُّجُومُ» Huma ataylab aytgan xato — audio mazmuni sifatida saqlangan. Osmondagi yulduzlar uchun to‘g‘risi «هٰذِهِ النُّجُومُ». أَلَيْسَ كَذٰلِكَ؟ — «shunday emasmi?»',
 ['هَؤُلَاءِ النُّجُومُ','Bu yulduzlar','bular (insonlar uchun; bu yerda xato)|yulduzlar'],['بَعِيدَةٌ جِدًّا يَا جُحَا','juda uzoq, ey Juho','uzoq|juda|ey|Juho'],['أَلَيْسَ كَذٰلِكَ','shunday emasmi?','emasmi|shunday']);
add(108.52,110.7,'إِنَّهَا tarkibidagi ـهَا nooqil ko‘plik النُّجُومُga muannas birlik sifatida qaytadi. بَعِيدَةٌ ham muannas birlikdagi xabar.',
 ['إِنَّهَا بَعِيدَةٌ فِعْلًا','Haqiqatan ham ular uzoq','haqiqatan, u (yulduzlarga qaytadi)|uzoq|haqiqatan'],['يَا هُومَا','ey Huma.','ey|Huma']);
add(110.7,113.66,'لٰكِنَّكَ — «lekin sen». أَخْطَأْتَ — o‘tgan zamon: «xato qilding». فِي أَسْمَاءِ الْإِشَارَةِ qaysi masalada xato bo‘lganini bildiradi.',
 ['وَلٰكِنَّكَ أَخْطَأْتَ','Lekin sen xato qilding','lekin sen|sen xato qilding'],['فِي أَسْمَاءِ الْإِشَارَةِ','ko‘rsatish olmoshlarida.','-da, borasida|ismlari, olmoshlari|ko‘rsatish']);
add(113.66,115,'كَيْفَ — «qanday?» so‘roq so‘zi. Huma tushuntirish so‘rayapti.',
 ['كَيْفَ','Qanday qilib?','qanday']);
add(115,118.4,'اِسْتَخْدَمْتُ — «men ishlatdim», so‘zlovchi Huma. هَؤُلَاءِ bu gapda olmoshning nomi sifatida keltirilgan.',
 ['لَقَدِ اسْتَخْدَمْتُ','Men ishlatdim-ku','axir (ta’kid)|men ishlatdim'],['اسْمَ الْإِشَارَةِ هَؤُلَاءِ','«هؤلاء» ko‘rsatish olmoshini.','ismini, olmoshini|ko‘rsatish|bular (insonlar uchun)']);
add(118.4,120.35,'وَهُوَ dagi هُوَ olmoshning o‘ziga qaytadi. Huma qoida haqida hali to‘liq bo‘lmagan tushunchasini aytadi.',
 ['وَهُوَ يُشِيرُ إِلَى الْجَمْعِ','U ko‘plikka ishora qiladi.','u esa|u ishora qiladi|-ga|ko‘plik']);
add(120.6,122.54,'النُّجُومُ — نَجْمٌning siniq ko‘pligi. Bu ot nooqil ko‘plik; oddiygina «ko‘plik» bo‘lish هَؤُلَاءِni tanlash uchun yetarli emas.',
 ['وَالنُّجُومُ جَمْعٌ','Yulduzlar ham ko‘plik-ku.','yulduzlar esa|ko‘plik']);
add(122.54,126.6,'كَانَ يَجِبُ أَنْ تَقُولَ — «sen ... deyishing kerak edi». أَنْdan keyingi تَقُولَ mansub. هٰذِهِ nooqil ko‘plik uchun muannas birlikda ishlatilgan.',
 ['كَانَ يَجِبُ أَنْ تَقُولَ','Sen deyishing kerak edi:','edi|kerak bo‘ladi|...ishni|sen aytishing'],['هٰذِهِ النُّجُومُ','«Bu yulduzlar» — هٰذِهِ النُّجُومُ.','bu (muannas; nooqil ko‘plikka ham)|yulduzlar']);
add(126.98,129.92,'بَدَلًا مِنْ — «... o‘rniga». هَؤُلَاءِ النُّجُومِ bu yerda avvalgi xato ibora iqtibosi; tavsiya etilayotgan javob emas.',
 ['بَدَلًا مِنْ هَؤُلَاءِ النُّجُومِ','«هؤلاء النجوم» deyish o‘rniga.','o‘rniga|-dan|bular (insonlar uchun; bu yerda xato)|yulduzlar']);
add(129.92,135.4,'Asosiy qoida: nooqil ko‘plik odatda muannas birlik kabi moslashadi: هٰذِهِ النُّجُومُ. غَيْرِ الْعَاقِلِ — «inson bo‘lmagan narsalarga oid». Bu umumiy o‘quv qoidasidir.',
 ['لِأَنَّ هٰذِهِ تُشِيرُ','Chunki «هذه» ishora qiladi','chunki|bu (muannas)|u ishora qiladi'],['إِلَى الْجَمْعِ غَيْرِ الْعَاقِلِ','nooqil ko‘plikka.','-ga|ko‘plik|... bo‘lmagan|oqil, inson']);
add(135.4,139.06,'أَمَّا ... esa taqqoslash uchun. هَؤُلَاءِ oqil ko‘plik, ya’ni insonlar guruhiga ishora qiladi. تُسْتَخْدَمُ — majhul nisbat: «ishlatiladi».',
 ['أَمَّا هَؤُلَاءِ','«هؤلاء» esa','... esa|bular (insonlar uchun)'],['تُسْتَخْدَمُ مَعَ الْجَمْعِ الْعَاقِلِ','oqil ko‘plik bilan ishlatiladi.','ishlatiladi|bilan|ko‘plik|oqil, insonlarga oid']);
add(139.06,143.74,'لَنْ + أُشِيرَ kelajakdagi inkorni bildiradi: «endi ishora qilmayman». بِهَؤُلَاءِ — olmosh bilan ishora qilish. بَعْدَ الْآنِ — «bundan keyin».',
 ['حَسَنًا يَا جُحَا','Xo‘p, ey Juho','xo‘p|ey|Juho'],['لَنْ أُشِيرَ بِهَؤُلَاءِ إِلَى النُّجُومِ','«هؤلاء» bilan yulduzlarga ishora qilmayman','endi ...mayman|men ishora qilaman|«bular» olmoshi bilan|-ga|yulduzlar'],['بَعْدَ الْآنِ','bundan keyin.','keyin|hozir']);
add(143.74,148.1,'نُجُومٌ ikki ma’noli: osmon yulduzlari va mashhur insonlar. Mashhur insonlar nazarda tutilsa هَؤُلَاءِ ishlatiladi. أَنْ تُشِيرَ tarkibida fe’l mansub; الْمَشْهُورِينَ oqil ko‘plik sifatidir.',
 ['يُمْكِنُكَ أَنْ تُشِيرَ بِهَا','U bilan ishora qilishing mumkin','senga mumkin|...ishing|sen ishora qilishing|u bilan'],['إِلَى النُّجُومِ الْمَشْهُورِينَ مِنَ الْبَشَرِ','insonlar orasidagi mashhur «yulduz»larga.','-ga|yulduzlar|mashhur insonlar|-dan, orasidan|insonlar']);

rows[4].start=28.68;rows[4].end=30.6;rows[6].end=37.08;rows[7].start=37.08;rows[7].end=39.78;rows[8].start=39.78;rows[11].start=64.92;rows[12].start=68.68;rows[13].end=73.86;rows[14].start=73.86;
// Word-level audio boundaries avoid clipping the first syllable of adjacent speakers.
const audioBounds=[[0, 3.2], [3.2, 6], [6, 10.8], [23.24, 28.06], [28.68, 30.6], [31.52, 33.6], [33.6, 37.08], [37.08, 39.78], [39.78, 43.48], [43.48, 46.3], [46.3, 50.38], [64.92, 68.5], [68.68, 70.32], [70.32, 73.86], [73.86, 78.82], [79.92, 83.26], [83.26, 87.3], [87.3, 91.06], [91.06, 94.08], [94.08, 97.1], [98, 103.3], [103.3, 108.28], [108.28, 110.5], [110.5, 113.58], [113.58, 114.98], [114.98, 118.32], [118.32, 120.35], [120.6, 122.46], [122.46, 126.6], [126.98, 129.68], [129.68, 135.4], [135.4, 139], [139, 143.52], [143.52, 148.1]];
audioBounds.forEach(([start,end],i)=>Object.assign(rows[i],{start,end}));
// Natural Uzbek group order. Group translations form a complete, non-literal sentence.
rows[1].groups=[['مِثْلَ كَسْرِ الْقَوَاعِدِ وَالْقَوَانِينِ','Qoidalar va qonunlarni buzish kabi.','kabi|buzish|qoidalar|va qonunlar']];
function rewrite(n:number,groups:G[]){rows[n-1].groups=groups}
rewrite(3,[['وَلِمَاذَا','Nega','va nega'],['يَصْنَعُونَ','yasashadi,','ular yasaydilar'],['الْقَوَاعِدَ وَالْقَوَانِينَ','qoidalar va qonunlarni','qoidalarni|va qonunlarni'],['مِنَ الزُّجَاجِ','oynadan','-dan|oyna'],['يَا جُحَا','ey Juho?','ey|Juho']]);
rewrite(4,[['هٰذَا هُوَ','mana shu','bu|u'],['الْمَكَانُ','joy.','joy'],['الَّذِي سَنُخَيِّمُ فِيهِ','biz chodir tikib tunaydigan','-adigan (bog‘lovchi olmosh)|biz chodir tikib tunaymiz|unda'],['يَا هُومَا','Ey Huma,','ey|Huma']]);
rewrite(7,[['لَا بَلْ','Yo‘q, aksincha,','yo‘q|aksincha'],['أَقْصِدُ','nazarda tutyapman,','men nazarda tutaman'],['اسْتِخْدَامَكَ','ishlatganingni','sening ishlatishingni'],['لِاسْمِ الْإِشَارَةِ هٰذَا','«bu» ko‘rsatish olmoshini','olmoshi uchun (ismga)|ko‘rsatish|bu']]);
rewrite(8,[['حِينَ قُلْتَ','deganingda.','...gan paytingda|sen deding'],['هٰذَا هُوَ الْمَكَانُ','«Mana shu joy»','bu|u|joy']]);
rewrite(11,[['كَانَ بِإِمْكَانِنَا','mumkin edi.','edi|bizning imkonimizda'],['التَّخْيِيمُ','chodir tikishimiz','chodir tikish'],['فِي صَالَةِ الْمَنْزِلِ','Uy mehmonxonasida','-da|mehmonxona, zal|uyning'],['أَمَامَ التِّلْفَازِ','televizor oldida','oldida|televizor']]);
rewrite(17,[['أَنْتَ','Sen','sen'],['تُحَاوِلُ','urinyapsan.','sen urinyapsan'],['مُرَاجَعَةَ','takrorlashga','takrorlashni'],['دَرْسِ أَسْمَاءِ الْإِشَارَةِ','ko‘rsatish olmoshlari darsini','darsining|ismlari, olmoshlari|ko‘rsatish']]);
rewrite(20,[['لَقَدْ','Haqiqatan,','haqiqatan (ta’kid)'],['كَشَفْتَ','fosh qilding.','sen fosh qilding'],['خُطَّتِي','rejamni','mening rejamni'],['بِسُهُولَةٍ','osongina','osonlik bilan']]);
rewrite(24,[['وَلٰكِنَّكَ','Lekin sen','lekin sen'],['أَخْطَأْتَ','xato qilding.','sen xato qilding'],['فِي أَسْمَاءِ الْإِشَارَةِ','ko‘rsatish olmoshlarida','-da, borasida|ismlari, olmoshlari|ko‘rsatish']]);
rewrite(26,[['لَقَدِ','Axir','axir (ta’kid)'],['اسْتَخْدَمْتُ','ishlatdim-ku.','men ishlatdim'],['اسْمَ الْإِشَارَةِ هَؤُلَاءِ','«هؤلاء» ko‘rsatish olmoshini','ismini, olmoshini|ko‘rsatish|bular (insonlar uchun)']]);
rewrite(31,[['لِأَنَّ هٰذِهِ','Chunki «هذه»','chunki|bu (muannas)'],['تُشِيرُ','ishora qiladi.','u ishora qiladi'],['إِلَى الْجَمْعِ غَيْرِ الْعَاقِلِ','nooqil ko‘plikka','-ga|ko‘plik|... bo‘lmagan|oqil, inson']]);
rewrite(33,[['حَسَنًا يَا جُحَا','Xo‘p, ey Juho,','xo‘p|ey|Juho'],['لَنْ أُشِيرَ','ishora qilmayman.','endi ...mayman|men ishora qilaman'],['بِهَؤُلَاءِ إِلَى النُّجُومِ','«هؤلاء» bilan yulduzlarga','«bular» olmoshi bilan|-ga|yulduzlar'],['بَعْدَ الْآنِ','bundan keyin','keyin|hozir']]);
rewrite(34,[['يُمْكِنُكَ أَنْ تُشِيرَ بِهَا','u bilan ishora qilishing mumkin.','senga mumkin|...ishing|sen ishora qilishing|u bilan'],['إِلَى النُّجُومِ الْمَشْهُورِينَ مِنَ الْبَشَرِ','Insonlar orasidagi mashhur «yulduz»larga','-ga|yulduzlar|mashhur insonlar|-dan, orasidan|insonlar']]);
const reorder:Record<number,number[]>={2:[0,2,3,1,4],3:[3,0,2,1],6:[0,3,2,1],7:[1,0],10:[2,3,1,0],16:[0,3,2,1],19:[0,2,3,1],23:[0,2,1],25:[0,2,1],30:[0,2,1],32:[0,3,2,1],33:[1,0]};
const segments=rows.map((r,i)=>({id:'s'+(i+1),start:r.start,end:r.end,grammar:r.grammar,groups:r.groups.map(([ar,uz,gloss],j)=>{const words=ar.split(' '),meanings=gloss.split('|');if(words.length!==meanings.length)throw Error(`Gloss mismatch ${i+1}/${j}: ${words.length}/${meanings.length}`);return{id:`s${i+1}g${j+1}`,ar,uz,order:reorder[i]?.indexOf(j)??j,tokens:words.map((text,k)=>{const b=bare(text);return{id:`s${i+1}t${j+1}_${k+1}`,text,meaning:meanings[k],partOfSpeech:verbs.has(b)?'Fe’l':adjectives.has(b)?'Sifat':pronouns.has(b)?'Olmosh':particles.has(b)||/^(و?يا|لأن|أما|لٰكن|ولكن|لن|أن|من|في|إلى|مع|بعد)$/.test(b)?'Harf / yordamchi so‘z':'Ism',...(verbs.has(b)?{}:{lemma:text})}})}})}));
// Explicitly classify remaining inflected function words and verbal forms.
for(const s of segments)for(const g of s.groups)for(const t of g.tokens){const b=bare(t.text);if(['استخدمت','أليس','يمكنك','وهو','وهذا','لأن','لقد','ولماذا','للاسـم'].includes(b))t.partOfSpeech=['استخدمت','أليس','يمكنك'].includes(b)?'Fe’l (qo‘shimchali shakl)':'Yordamchi so‘z / olmosh';if(['بالتأكيد','جدا','فعلا','بشدة','بسهولة','حسنا','بدلا'].includes(b))t.partOfSpeech='Ravish ma’nosidagi birikma';if(['جوحا','جحا','هوما'].includes(b))t.partOfSpeech='Atoqli ot';if(['لدي','رأيك','منك','فيه','بإمكاننا','بها','به','بهؤلاء','لأن','ولماذا','وهذا','وهو','ولكنك'].includes(b))t.partOfSpeech='Yordamchi so‘z va olmosh';}
const classes:Record<string,string>={كسر:'Masdar (ism)',مثل:'Ism · o‘xshatish',حين:'Ism · vaqt ravishi',أمام:'Ism · o‘rin ravishi',مع:'Ism · birgalik ma’nosida',بعد:'Ism · vaqt ravishi',الآن:'Ism · vaqt ravishi',كيف:'So‘roq ismi',ما:'So‘roq / taajjub ismi',أجمل:'Taajjub fe’li',فذكاء:'Ism va bog‘lovchi',والنجوم:'Ism va bog‘lovchi',لاسم:'Ism va jarr harfi',رأيك:'Ism va egalik olmoshi',بإمكاننا:'Jarr harfi, ism va egalik olmoshi',إنه:'Ta’kid harfi va olmosh',إنها:'Ta’kid harfi va olmosh',لأن:'Sababni bildiruvchi harf',لقد:'Ta’kid harflari',كذلك:'Ko‘rsatish birikmasi'};
for(const s of segments)for(const g of s.groups)for(const t of g.tokens){const c=classes[bare(t.text)];if(c)t.partOfSpeech=c;delete t.lemma;}
const wordDefs:[string,string,string,string,number,string?][]=[
 ['camp','سَنُخَيِّمُ','biz chodir tikib tunaymiz','Fe’l',4,'juho1-tent.webp'],
 ['stars','النَّجْمَتَانِ','ikki yulduz','Ism · ikkilik',15,'juho1-stars.webp'],
 ['figurative','كَسْرٌ مَعْنَوِيٌّ','ko‘chma ma’nodagi buzish','Otli birikma',1],
 ['rules','الْقَوَاعِدُ','qoidalar','Ism · siniq ko‘plik',2],
 ['laws','الْقَوَانِينُ','qonunlar','Ism · siniq ko‘plik',2],
 ['glass','الزُّجَاجُ','oyna, shisha','Ism',3],
 ['demonstrative','اسْمُ الْإِشَارَةِ','ko‘rsatish olmoshi','Izofa birikmasi',7],
 ['scary','مُخِيفٌ','qo‘rqinchli','Sifat',10],
 ['relax','الِاسْتِرْخَاءُ','dam olish, bo‘shashish','Masdar',14,'juho1-relax.webp'],
 ['shine','تَلْمَعَانِ','ikkalasi porlayapti','Fe’l · ikkilik',15],
 ['trick','خُدْعَةٌ','hiyla, nayrang','Ism',16],
 ['review','مُرَاجَعَةٌ','takrorlash','Masdar',17],
 ['plan','خُطَّتِي','mening rejam','Ism va egalik olmoshi',20],
 ['expose','كَشَفْتَ','sen fosh qilding','Fe’l · o‘tgan zamon',20],
 ['famous','يُضْرَبُ بِهِ الْمَثَلُ','tillarda doston; dong‘i ketgan','Turg‘un ibora',21],
 ['instead','بَدَلًا مِنْ','... o‘rniga','Birikma',30],
 ['nonhuman','الْجَمْعُ غَيْرُ الْعَاقِلِ','nooqil ko‘plik: inson bo‘lmagan narsalar ko‘pligi','Grammatik atama',31],
 ['human','الْجَمْعُ الْعَاقِلُ','oqil ko‘plik: insonlar ko‘pligi','Grammatik atama',32],
 ['this','هٰذِهِ','bu: muannas birlik yoki nooqil ko‘plik','Ko‘rsatish olmoshi',16],
 ['these','هَؤُلَاءِ','bular: insonlar guruhi','Ko‘rsatish olmoshi',32],
];
const words=wordDefs.map(([id,word,meaning,partOfSpeech,n,img])=>({id,word,meaning,partOfSpeech,segmentId:'s'+n,grammar:segments[n-1].grammar,...(img?{image:'/learning-assets/'+img}:{})}));
const questions:Experience['questions']=[];
function choice(id:string,kind:'choice'|'cloze'|'audio'|'image'|'error',phase:'practice'|'vocabulary',prompt:string,n:number,options:string[],correct:number,explanation:string,extra:Record<string,unknown>={}){questions.push({id,kind,phase,prompt,segmentId:'s'+n,choices:options.map((text,i)=>({id:'c'+i,text})),answer:{choiceId:'c'+correct},explanation,...extra} as any)}
choice('p1','choice','practice','Huma suhbat boshida nimani so‘zma-so‘z tushunib qoldi?',3,['Yo‘l topish haqidagi gapni','Qoidalarni buzish haqidagi gapni','Chodir tikish haqidagi gapni'],1,'كَسْرٌ ko‘chma ma’noda «buzish» bo‘lsa-da, Huma uni oynadek «sindirish» deb tushunadi.',{wordId:'figurative'});
choice('p2','choice','practice','Huma «جَمِيلٌ جِدًّا» deganda nimani maqtadi?',7,['Faqat sahroning manzarasini','Juhoning yangi chodirini','Juhoning «هذا»ni ishlatganini'],2,'U joyni emas, Juhoning ko‘rsatish olmoshini to‘g‘ri ishlatganini nazarda tutgan.',{wordId:'demonstrative'});
choice('p3','audio','practice','Gapni tinglang. Huma qayerda chodir tikishni afzal ko‘rardi?',11,['Uydagi televizor oldida','Uzoq yulduzlar ostida','Qishloq yo‘li yonida'],0,'Huma «فِي صَالَةِ الْمَنْزِلِ أَمَامَ التِّلْفَازِ» deydi.',{wordId:'camp'});
choice('p4','cloze','practice','Ikkita yulduzga mos olmoshni tanlang.',15,['هَؤُلَاءِ','هَاتَانِ','هٰذَا'],1,'النَّجْمَتَانِ — muannas ikkilik raf shakli; هَاتَانِ unga mos.',{sentence:'___ النَّجْمَتَانِ تَلْمَعَانِ بِشِدَّةٍ',wordId:'stars'});
choice('p5','cloze','practice','Birikmani to‘ldiring: «Bu sening hiylang».',16,['هٰذَا','هَؤُلَاءِ','هٰذِهِ'],2,'خُدْعَةٌ muannas birlik bo‘lgani uchun هٰذِهِ ishlatiladi.',{sentence:'___ خُدْعَةٌ مِنْكَ',wordId:'trick'});
choice('p6','choice','practice','Juho nima uchun Huma hiyla ishlatyapti deb o‘yladi?',17,['Uni majburan uyga qaytarmoqchi edi','Dam olish paytida darsni takrorlatmoqchi edi','Yulduzlarni undan yashirmoqchi edi'],1,'أَنْتَ تُحَاوِلُ مُرَاجَعَةَ دَرْسِ أَسْمَاءِ الْإِشَارَةِ — darsni takrorlashga urinish.',{wordId:'review'});
choice('p7','error','practice','Osmondagi yulduzlar haqida aytilgan gapdagi xato so‘zni bosing, keyin uning o‘rnini tanlang.',22,['هٰذَا','هٰذِهِ','هَاتَانِ'],1,'النُّجُومُ nooqil ko‘plik. Bu kontekstda هَؤُلَاءِ o‘rniga هٰذِهِ ishlatiladi.',{tokens:['هَؤُلَاءِ','النُّجُومُ','بَعِيدَةٌ'],answer:{choiceId:'c1',tokenIndex:0},wordId:'this'});
choice('p8','choice','practice','Nega «النُّجُومُ» bilan «هذه» ishlatiladi?',31,['Chunki barcha ko‘pliklar shunday ishlatiladi','Chunki faqat ikkita yulduz bor','Chunki bu nooqil ko‘plikdir'],2,'Nooqil ko‘plik odatda muannas birlik kabi moslashadi; oqil ko‘plik bilan هَؤُلَاءِ ishlatiladi.',{wordId:'nonhuman'});
choice('p9','choice','practice','Oxirgi hazilda «yulduzlar» deganda kimlar nazarda tutilgan?',34,['Osmondagi eng yorqin yulduzlar','Insonlar orasidagi mashhur kishilar','Sahroda birga dam olgan sayyohlar'],1,'النُّجُومُ الْمَشْهُورُونَ مِنَ الْبَشَرِ — mashhur insonlar. Ularga هَؤُلَاءِ bilan ishora qilsa bo‘ladi.',{wordId:'these'});
questions.push({id:'p10',kind:'order',phase:'practice',prompt:'Hikoyadagi voqealarni sodir bo‘lgan tartibida joylashtiring.',segmentId:'s34',tokens:['Juho mashhur insonlar haqidagi hazil bilan yakunlaydi.','Huma «هذا» olmoshining ishlatilganini maqtaydi.','Juho yulduzlar uchun «هذه» kerakligini tushuntiradi.','Huma ikki yulduzning porlashini aytadi.'],answer:{order:[1,3,2,0]},explanation:'Avval joy va «هذا» haqida suhbat, keyin ikki yulduz, undan so‘ng nooqil ko‘plik qoidasi, oxirida «mashhur yulduzlar» hazili.'});
questions.push({id:'p11',kind:'order',phase:'practice',prompt:'Arabcha gapni to‘g‘ri tartibga keltiring.',segmentId:'s15',tokens:['بِشِدَّةٍ','النَّجْمَتَانِ','هَاتَانِ','تَلْمَعَانِ'],answer:{order:[2,1,3,0]},explanation:'هَاتَانِ النَّجْمَتَانِ تَلْمَعَانِ بِشِدَّةٍ — ikki yulduz kuchli porlayapti.',wordId:'shine'});
questions.push({id:'p12',kind:'match',phase:'practice',prompt:'Ko‘rsatish olmoshlarini mos misollar bilan juftlang.',segmentId:'s32',pairs:[{id:'a',left:'هٰذَا',right:'الْمَكَانُ — bu joy'},{id:'b',left:'هٰذِهِ',right:'النُّجُومُ — bu yulduzlar'},{id:'c',left:'هَاتَانِ',right:'النَّجْمَتَانِ — bu ikki yulduz'},{id:'d',left:'هَؤُلَاءِ',right:'الْمُعَلِّمُونَ — bu o‘qituvchilar'}],answer:{pairs:[['a','a'],['b','b'],['c','c'],['d','d']]},explanation:'Muzakkar birlik: هذا; nooqil ko‘plik: هذه; muannas ikkilik: هاتان; oqil ko‘plik: هؤلاء.'});
choice('p13','audio','practice','Gapni tinglang. Qaysi ma’no mos?',20,['Rejamni osongina fosh qilding.','Rejamni yashirincha o‘zgartirding.','Rejamni birgalikda amalga oshirdik.'],0,'خُطَّتِي — mening rejam; كَشَفْتَ — sen fosh qilding; بِسُهُولَةٍ — osonlik bilan.',{wordId:'plan'});
choice('p14','cloze','practice','Kelajakdagi inkorni to‘ldiring.',33,['لَنْ','لَمْ','هَلْ'],0,'لَنْ + mansub muzori’ kelajakdagi inkorni bildiradi. لَمْ bilan fe’l majzum bo‘lardi.',{sentence:'___ أُشِيرَ بِهَؤُلَاءِ إِلَى النُّجُومِ بَعْدَ الْآنِ',wordId:'these'});
// Vocabulary questions cover all twenty selected targets, with context-specific distractors.
const distractors:Record<string,string[]>={camp:['biz dengizda suzamiz','biz shaharga qaytamiz'],stars:['ikki sayyoh','ikki chodir'],figurative:['oynaning darz ketishi','yo‘lning ikkiga ajralishi'],rules:['yulduzlar','rejalari'],laws:['qishloqlar','mehmonxonalar'],glass:['yog‘och','temir'],demonstrative:['so‘roq olmoshi','kishilik olmoshi'],scary:['tinchlantiruvchi','hayratlanarli'],relax:['shoshilish','bahslashish'],shine:['ikkalasi yashirinyapti','ikkalasi yaqinlashyapti'],trick:['tasodif','maslahat'],review:['dam olish','sayohat qilish'],plan:['mening xatom','mening savolim'],expose:['sen yashirding','sen takrorlading'],famous:['u misollarni unutgan','u boshqalarni jazolaydi'],instead:['bilan birga','sababli'],nonhuman:['faqat ikki narsani bildiruvchi shakl','faqat bir insonni bildiruvchi shakl'],human:['inson bo‘lmagan narsalar ko‘pligi','faqat ikki insonni bildiruvchi shakl'],this:['bu: faqat muzakkar birlik','bular: faqat insonlar guruhi'],these:['bu: faqat muannas birlik','bu ikkita: muannas ikkilik']};
for(const [i,w] of words.entries()){const opts=[...distractors[w.id]];const correct=i%3;opts.splice(correct,0,w.meaning);const kind=i===0||i===1?'image':i%4===3?'audio':'choice';choice('v'+(i+1),kind,'vocabulary',kind==='image'?'Rasmga mos ma’noni tanlang.':kind==='audio'?'Darsdagi gapni tinglang. «'+w.word+'» nimani anglatadi?':'«'+w.word+'»ning ushbu darsdagi ma’nosini tanlang.',Number(w.segmentId.slice(1)),opts,correct,w.word+' — '+w.meaning+'. '+w.grammar,{wordId:w.id,...(w.image?{image:w.image}:{})});}
// Two image questions explicitly practise Arabic retrieval rather than just Uzbek recognition.
choice('v21','image','vocabulary','Rasmga mos arabcha so‘zni tanlang.',15,['الْقَوَانِينُ','النَّجْمَتَانِ','الْقَوَاعِدُ'],1,'Rasmda ikki yulduz: النَّجْمَتَانِ.',{image:'/learning-assets/juho1-stars.webp',wordId:'stars'});
choice('v22','image','vocabulary','Rasmga mos harakatni tanlang.',4,['سَنُخَيِّمُ','تَلْمَعَانِ','كَشَفْتَ'],0,'Chodir tikib tunash — التَّخْيِيمُ; سَنُخَيِّمُ — biz chodir tikib tunaymiz.',{image:'/learning-assets/juho1-tent.webp',wordId:'camp'});
const p=experienceSchema.parse({schemaVersion:1,version:'juho1-v1',lessonId:34,youtubeId:'QcVjcoRxpwM',title:'Juho 1 — Ko‘rsatish olmoshlari',summary:'Juho va Huma sahroda dam oladi. Hikoya orqali هذا، هذه، هاتان، هؤلاء farqini, nooqil ko‘plik qoidasini va kundalik iboralarni o‘rganing. Tavsiya etilgan tinglash darajasi: B1; tayanch grammatika A1–A2.',duration:148.12,level:'B1',segments,words,chapters:[{id:'ch1',title:'«Buzish» ma’nosidagi hazil',start:0,end:10.8},{id:'ch2',title:'Joy va ko‘rsatish olmoshi',start:23.24,end:50.38},{id:'ch3',title:'Dam olish va ikki yulduz',start:64.92,end:103.3},{id:'ch4',title:'هذه yoki هؤلاء?',start:103.3,end:148.12}],questions});
writeFileSync('server/curated/juho1-v1.json',JSON.stringify(p,null,2)+'\n');
writeFileSync('server/curated/juho1-source.tsv',p.segments.map(s=>[s.start,s.end,s.groups.map(g=>g.ar).join(' ')].join('\t')).join('\n')+'\n');
const pack=experiencePackage(p);pack.metadata.level='B1';writeFileSync('../audit/juho1/lesson-package.json',JSON.stringify(pack));
console.log({sentences:p.segments.length,tokens:p.segments.flatMap(s=>s.groups.flatMap(g=>g.tokens)).length,words:p.words.length,questions:p.questions.length});
