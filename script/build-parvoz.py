"""Rebuild the curated package from reviewed Arabic/Uzbek timings and lexicon."""
import json,re,pathlib
base=pathlib.Path(__file__).resolve().parents[1]
clean=lambda s:re.sub(r'[\u064b-\u065f\u0670ـ؟!،.؛:«»]','',s)
lex={}
for line in (base/'server/curated/parvoz-lexicon.tsv').read_text().splitlines():
 v=line.split('\t');lex[v[0]]={'meaning':v[1],'partOfSpeech':v[2],**({'lemma':v[3]} if len(v)>3 else {}),**({'root':v[4]} if len(v)>4 else {})}
# Each reviewed phrase keeps the original Arabic tokens. Uzbek display order may differ.
spec={
1:([3,2,2,3,2],['samolyotni qanday boshqarasan?','Juha,','qo‘shilding-ku.','Axir, samolyotlar klubiga','bugungina'],[1,0,4,2,3]),
2:([2,1],['nimani nazarda tutyapsan?','Bu bilan'],[1,0]),
3:([2,3,2],['Aytmoqchimanki, sen','hali o‘rganmagansan.','samolyotni boshqarishni'],[0,2,1]),
4:([3,1,1],['kerak.','o‘rganishing','Avval'],[2,1,0]),
5:([2,3,4],['esingdami?','mashina haydagan payting','Haydashni o‘rganmasdan'],[2,1,0]),
6:([1,1,3,5],['Ha-a!','O‘sha kuni','svetoforni sindirgan edik','va ko‘prikdan qulagan edik!'],[0,1,2,3]),
8:([2,2],['Yo‘q, yo‘q,','eslolmayman.'],[0,1]),
9:([2,1,2,2,3],['Qolaversa,','osmonda','yo‘q-ku.','svetofor','va ko‘priklar ham'],[0,1,4,2,3]),
10:([1,1,3,4],['Unda','esingdami?','mototsikl mingan payting','haydashni o‘rganmasdan'],[0,3,2,1]),
11:([1,2,2,4,4],['Ha-a,','urib yuborgan kunim!','qo‘shnilarning itini','U ortimizdan yugurib,','mana shu yerimdan tishlagan edi.'],[0,2,1,3,4]),
13:([2,2],['Yo‘q, yo‘q,','eslolmayman.'],[0,1]),
14:([2,3,2],['Umuman olganda,','itlar yo‘q.','osmonda'],[0,2,1]),
15:([1,4,2],['Demak,','hech qanday muammo yo‘q.','samolyotni boshqarishda'],[0,2,1]),
16:([3,2,3],['Yo‘q, Juha,','kim istasa,','biror ish qilishni'],[0,2,1]),
17:([3,1,2],['kerak.','o‘rganishi','uni qanday bajarishni'],[2,1,0]),
18:([1,2],['Hatto','kichkina qushlarning ham'],[0,1]),
19:([1,1,2],['onasi','o‘rgatadi.','qanday uchishni'],[1,2,0]),
20:([1,1,1],['Demak,','ta’lim olish kerak.','avval'],[0,2,1]),
21:([1,2],['Tushundingmi,','Juha?'],[0,1]),
22:([1,2],['Yo‘q,','tushunmadim.'],[0,1]),
23:([3,1],['Men albatta','uchishim kerak.'],[0,1]),
24:([1,2],['Xayr,','do‘stim.'],[0,1]),
25:([1,2,2],['Qani,','Juha,','qahramon!'],[0,1,2]),
26:([2],['Ularga boshqarishni ko‘rsat!'],[0]),
27:([1,1,1],['Va','isbotla:','u ikkoviga'],[0,2,1]),
28:([2,2],['ta’lim olish','muhim emasligini.'],[0,1]),
29:([1,2,1,3],['Voy,','qanchalar oson ekan!','uchish','umuman o‘rganmasdan ham'],[0,3,2,1]),
30:([1,2,3],['sinab ko‘raman.','mana bu tugmani','Nima qilishini bilish uchun'],[2,1,0]),
31:([3,3,3],['Ey Rabbim, asra!','Ey Rabbim, asra!','Bu yerda nima bo‘lyapti?'],[0,1,2]),
32:([4],['Meni bu narsadan tushiringlar!'],[0]),
36:([1,2,2],['Koshki','gapingga quloq solganimda edi,','Huma!'],[0,1,2]),
37:([1,2,2],['Juha,','qayerdasan,','Juha?'],[0,1,2]),
38:([2,1,1,5],['Men shu yerdaman!','Xo‘p,','o‘rganaman.','biror ish qilishdan oldin'],[0,1,3,2]),
40:([4,2],['Xush kelibsiz,','aziz tomoshabinlar!'],[0,1]),
42:([3,2,2],['va yana bir yangi savol bilan birgamiz.','dasturingizdan','«Juha topishmoqlari»'],[2,1,0]),
43:([3,3],['Bugun biz bilan','dasturimizning yangi ishtirokchisi bor.'],[0,1]),
44:([2,2,1],['U —','mening aziz eshagim','Huma.'],[0,1,2]),
48:([3,3],['har bir zamonaviy ixtironing','Bu zamondagi'],[1,0]),
49:([1,3,2],['asosi','biror g‘oya yoki tajribaga borib taqaladi.','bizning davrimizdagi'],[0,2,1]),
50:([1,1],['samolyot','Masalan,'],[1,0]),
51:([2,2,2,3],['g‘oyadan boshlangan.','bir musulmon olimning','uchishga uringan','ancha oldin'],[3,2,1,0]),
52:([4,4],['U o‘zini patlar bilan qoplagan','va ikkita katta qanot yasagan.'],[0,1]),
53:([6],['Ular bilan havoda ancha uzoq masofaga uchgan.'],[0]),
54:([1,1,1,5],['va','deb hisoblangan.','shu tariqa','uchish vositasini ixtiro qilgan birinchi kishi'],[0,3,1,2]),
56:([2,2,4,2],['kim?','musulmon olim','Birinchi bo‘lib','uchishga uringan'],[3,2,0,1]),
57:([5,3,3],['Hasan ibn Haysammi?','Abbos ibn Firnosmi?','Muhammad Ali Kleymi?'],[0,1,2]),
58:([3,2,2,4,2],['Savolni yana takrorlaymiz:','kim?','musulmon olim','birinchi bo‘lib','uchishga uringan'],[0,4,3,1,2]),
59:([5,3,3],['Hasan ibn Haysammi?','Abbos ibn Firnosmi?','Muhammad Ali Kleymi?'],[0,1,2]),
60:([3,2],['mumkinmi?','Ikkita javobni olib tashlash'],[1,0]),
61:([2,3,2],['Nima? Xo‘p,','qo‘ng‘iroq qilsam bo‘ladimi?','eshak do‘stimga'],[0,2,1]),
62:([3,1,3,6,2],['javobni topsangiz,','Do‘stlarim,','to‘g‘ri javobni yuboringlar.','ekranda ko‘rsatilgan elektron pochtaga','sovrin yutish uchun'],[1,0,4,3,2])}
segments=[]
for i,line in enumerate((base/'server/curated/parvoz-source.tsv').read_text().splitlines(),1):
 start,end,ar,uz,grammar=line.split('\t');tokens=ar.split();counts,translations,orders=spec.get(i,([len(tokens)],[uz],[0]));assert sum(counts)==len(tokens),(i,counts,tokens)
 groups=[];offset=0
 for j,(count,translation,order) in enumerate(zip(counts,translations,orders)):
  ts=[]
  for k,t in enumerate(tokens[offset:offset+count],offset):
   key=clean(t);assert key in lex,(i,t,key);data=dict(lex[key])
   if key=='من' and t.startswith('مَنْ'):data={'meaning':'kim; … qilgan kishi','partOfSpeech':'shart yoki so‘roq olmoshi'}
   if t=='إِذَا':data={'meaning':'agar; …sa','partOfSpeech':'shart bog‘lovchisi'}
   ts.append({'id':f't{i}-{k+1}','text':t,**data})
  groups.append({'id':f'g{i}-{j+1}','ar':' '.join(t['text'] for t in ts),'uz':translation,'order':order,'tokens':ts});offset+=count
 segments.append({'id':f's{i}','start':float(start),'end':float(end),'groups':groups,'grammar':grammar})
worddefs=[('plane','الطَّائِرَةُ','samolyot','ot',1,'طَائِرَةٌ','ط ي ر','plane'),('driving','الْقِيَادَةُ','boshqarish; haydash','masdar',5,'قِيَادَةٌ','ق و د',None),('learn','يَتَعَلَّمُ','o‘rganadi','fe’l',17,'تَعَلَّمَ','ع ل م',None),('traffic','إِشَارَةُ الْمُرُورِ','svetofor','ot birikmasi',6,'إِشَارَةٌ','', 'traffic-light'),('bridge','الْكُوبْرِي','ko‘prik','ot',6,'كُوبْرِي','', 'bridge'),('fall','وَقَعْنَا','quladik','fe’l',6,'وَقَعَ','و ق ع',None),('birds','الْعَصَافِيرُ','qushlar; chumchuqlar','ko‘plikdagi ot',18,'عُصْفُورٌ','', 'birds'),('fly','يَطِيرُونَ','ular uchadilar','fe’l',19,'طَارَ','ط ي ر',None),('button','الزِّرُّ','tugma','ot',30,'زِرٌّ','', 'button'),('try','سَأُجَرِّبُ','sinab ko‘raman','fe’l',30,'جَرَّبَ','ج ر ب',None),('wings','جَنَاحَيْنِ','ikkita qanotni','ikkilikdagi ot',52,'جَنَاحٌ','', 'wings'),('rescue','أَنْقِذُونِي','meni qutqaringlar','buyruq fe’li',33,'أَنْقَذَ','ن ق ذ',None)]
words=[]
for wid,word,meaning,pos,s,lemma,root,img in worddefs:
 words.append({'id':wid,'word':word,'meaning':meaning,'partOfSpeech':pos,'segmentId':f's{s}','lemma':lemma,'grammar':segments[s-1]['grammar'],**({'root':root} if root else {}),**({'image':'/learning-assets/parvoz-'+img+'.png'} if img else {})})
qs=[]
def choice(kind,prompt,segment,word,options,correct=0,explanation='',**extra):
 q={'id':'p'+str(len(qs)+1),'kind':kind,'phase':'practice','prompt':prompt,'segmentId':'s'+str(segment),'wordId':word,'choices':[{'id':chr(97+i),'text':v} for i,v in enumerate(options)],'answer':{'choiceId':chr(97+correct)},'explanation':explanation,**extra};qs.append(q);return q
choice('choice','Do‘sti nima uchun Juhani samolyotni boshqarishdan qaytardi?',1,'plane',['U klubga yaqinda qo‘shilgan, hali boshqarishni o‘rganmagan.','U avval samolyot boshqargan, lekin yangi klubni yoqtirmagan.','U mashina haydashni biladi, samolyoti esa hali tayyor emas.','U klubga a’zo bo‘lmagan, do‘sti esa uni kutib turgan.'],explanation='Do‘sti u klubga bugungina qo‘shilganini aytadi; keyingi gapda boshqarishni hali o‘rganmagani tushuntiriladi.')
choice('cloze','«Avval o‘rganishing kerak» gapini to‘ldiring.',4,'learn',['تَتَعَلَّمَ','تُعَلِّمَ','تَعْمَلَ','تَطِيرَ'],sentence='لَا بُدَّ أَنْ ___ أَوَّلًا.',explanation='تَتَعَلَّمَ — o‘rganishing; تُعَلِّمَ — o‘rgatishing. Zarurat birikmasidan keyin أَنْ ishlatiladi.')
choice('audio','Shu gapda oldingi voqea qanday tugagan?',6,'fall',['Svetofor sinib, ular ko‘prikdan qulagan.','Svetofor yonib, ular ko‘prikdan o‘tgan.','Svetofor o‘chib, ular ko‘prikda to‘xtagan.','Svetofor sinib, ular ko‘prikdan qaytgan.'],explanation='كَسَرْنَا — sindirdik; وَقَعْنَا مِنْ عَلَى الْكُوبْرِي — ko‘prikdan quladik.')
choice('image','Qaysi arabcha so‘z rasmdagi narsani bildiradi?',30,'button',['الزِّرُّ','الْجِسْرُ','الْجَنَاحُ','الرِّيشُ'],image='/learning-assets/parvoz-button.png',explanation='الزِّرُّ — tugma. Juha nima qilishini bilmay turib tugmani sinab ko‘radi.')
q=choice('error','Qushlar haqida aytilgan gapdagi xato fe’lni toping va to‘g‘rilang.',19,'fly',['يَطِيرُونَ','يَجْرُونَ','يَقُودُونَ','يَقَعُونَ'],tokens=['أُمُّهُمْ','تُعَلِّمُهُمْ','كَيْفَ','يَسْبَحُونَ.'],explanation='Gapda uchish o‘rgatilishi aytiladi: يَطِيرُونَ. يَسْبَحُونَ esa suzadilar degani.');q['answer']['tokenIndex']=3
qs.append({'id':'p6','kind':'order','phase':'practice','prompt':'«Avval o‘rganishing kerak» gapini so‘zlarni bosib tuzing.','segmentId':'s4','wordId':'learn','tokens':['لَا','بُدَّ','أَنْ','تَتَعَلَّمَ','أَوَّلًا.'],'answer':{'order':[0,1,2,3,4]},'explanation':'Zarurat: لَا بُدَّ أَنْ; keyin harakat va payt holi: تَتَعَلَّمَ أَوَّلًا.'})
qs.append({'id':'p7','kind':'match','phase':'practice','prompt':'Voqeada tilga olingan uchta narsani ma’nosi bilan juftlang.','segmentId':'s6','wordId':'traffic','pairs':[{'id':'plane','left':'الطَّائِرَةُ','right':'samolyot'},{'id':'bridge','left':'الْكُوبْرِي','right':'ko‘prik'},{'id':'traffic','left':'إِشَارَةُ الْمُرُورِ','right':'svetofor'}],'answer':{'pairs':[['plane','plane'],['bridge','bridge'],['traffic','traffic']]},'explanation':'Samolyot — الطَّائِرَةُ; ko‘prik — الْكُوبْرِي; svetofor — إِشَارَةُ الْمُرُورِ.'})
choice('choice','Juha «osmonda svetofor ham, ko‘prik ham yo‘q» deb nimani oqlamoqchi?',9,'bridge',['O‘rganmasdan uchish ham xavfsiz degan noto‘g‘ri fikrini.','Ko‘priklar qurishni avval o‘rganish kerak degan fikrini.','Samolyot haydashdan oldin yo‘l qoidalarini bilish fikrini.','Osmondagi belgilarni do‘stidan yaxshiroq bilish fikrini.'],explanation='U mashinada sodir bo‘lgan xavf osmonda yo‘q deb o‘ylaydi. Do‘sti esa har qanday ishni avval o‘rganish kerakligini aytadi.')
choice('cloze','Juha tugmani nima maqsadda bosmoqchi? Gapni to‘ldiring.',30,'try',['لِأَرَى','بِدُونِ','مُنْذُ','لَيْتَنِي'],sentence='سَأُجَرِّبُ هَذَا الزِّرَّ ___ مَاذَا يَفْعَلُ.',explanation='لِأَرَى — ko‘rish uchun; bu yerda tugma nima qilishini bilish maqsadini bildiradi.')
choice('audio','Qahramonning ushbu iltimosi nimani bildiradi?',33,'rescue',['Meni qutqaringlar!','Menga o‘rgatinglar!','Meni kutinglar!','Meni tinglanglar!'],explanation='أَنْقِذُونِي dagi أَنْقِذُوا — qutqaringlar; نِي — meni.')
choice('choice','Hikoya oxirida Juha qanday xulosaga keladi?',38,'driving',['Biror ishni bajarishdan oldin uni o‘rganish kerak.','Avval ishni boshlab, keyin kerakli qoidani so‘rash kerak.','Qushlar kabi faqat boshqalarga qarab o‘rganish kerak.','Xavfli ishlarni faqat do‘sti yonida bajarish kerak.'],explanation='سَأَتَعَلَّمُ قَبْلَ أَنْ أَفْعَلَ أَيَّ شَيْءٍ — biror ish qilishdan oldin o‘rganaman.')
choice('image','Rasmga mos birikmani tanlang.',52,'wings',['جَنَاحَانِ كَبِيرَانِ','زِرَّانِ كَبِيرَانِ','جِسْرَانِ كَبِيرَانِ','طَائِرَتَانِ كَبِيرَتَانِ'],image='/learning-assets/parvoz-wings.png',explanation='جَنَاحَانِ — ikkita qanot. Videoda to‘ldiruvchi vazifasida جَنَاحَيْنِ كَبِيرَيْنِ ishlatilgan.')
for i,w in enumerate(words):
 distractors=[v['meaning'] for v in words if v['id']!=w['id'] and (v['partOfSpeech']==w['partOfSpeech'] or 'ot' in v['partOfSpeech'] and 'ot' in w['partOfSpeech'])]
 distractors=list(dict.fromkeys(distractors+[v['meaning'] for v in words if v['id']!=w['id']]))[:3]
 opts=distractors[:];correct=i%4;opts.insert(correct,w['meaning']);s=segments[int(w['segmentId'][1:])-1]
 qs.append({'id':'v'+str(i+1),'kind':'audio' if i in [2,5,7,11] else 'image' if 'image' in w else 'choice','phase':'vocabulary','prompt':f'«{w["word"]}» darsdagi kontekstda nimani bildiradi?','segmentId':w['segmentId'],'wordId':w['id'],**({'image':w['image']} if 'image' in w else {}),'choices':[{'id':chr(97+j),'text':v} for j,v in enumerate(opts)],'answer':{'choiceId':chr(97+correct)},'explanation':f'{w["word"]} — {w["meaning"]}. '+w['grammar']})
p={'schemaVersion':1,'version':'parvoz-v1','lessonId':50,'youtubeId':'MDZFbSmIFRM','title':'Parvoz — avval o‘rgan, keyin bajar','summary':'Juhaning sarguzashtini tinglang, rangli tarjima bilan tushuning va 12 ta tayanch so‘zni mashqlar bilan eslab qoling. Javoblar tanlash orqali bajariladi.','duration':321.1,'segments':segments,'words':words,'chapters':[{'id':'warning','title':'Do‘stning ogohlantirishi','start':0,'end':76.25},{'id':'flight','title':'Shoshqaloqlik va saboq','start':76.25,'end':184.28},{'id':'invention','title':'Ixtiro haqidagi savol','start':184.28,'end':321.1}],'questions':qs}
(base/'server/curated/parvoz-v1.json').write_text(json.dumps(p,ensure_ascii=False,indent=2)+'\n')
print(len(segments),'timed segments;',len(words),'words;',len(qs),'questions')
