import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {experienceSchema,grade,publicQuestion,sentenceArabic} from '../shared/experience';
const p=experienceSchema.parse(JSON.parse(readFileSync('server/curated/parvoz-v1.json','utf8')));
test('Parvoz retains all 62 timed Arabic passages, token annotations and seven non-typing exercise kinds',()=>{
 const source=readFileSync('server/curated/parvoz-source.tsv','utf8').trim().split('\n');assert.equal(p.segments.length,62);assert.equal(p.words.length,12);assert.equal(p.questions.length,24);
 assert.deepEqual(new Set(p.questions.map(q=>q.kind)),new Set(['choice','cloze','audio','image','error','order','match']));
 for(const [i,s] of p.segments.entries()){const [start,end,ar]=source[i].split('\t');assert.equal(s.start,Number(start));assert.equal(s.end,Number(end));assert.equal(sentenceArabic(s),ar);for(const g of s.groups)for(const t of g.tokens){assert.ok(t.meaning);assert.ok(t.partOfSpeech);assert.match(t.text,/[\u064b-\u0652]/)}}
});
test('every curated answer grades correctly and public questions omit grading keys',()=>{for(const q of p.questions){assert.equal(grade(q,q.answer),true);assert.equal('answer' in publicQuestion(q),false);assert.equal('explanation' in publicQuestion(q),false);if(q.choices)assert.equal(grade(q,{choiceId:q.choices.find(c=>c.id!==q.answer.choiceId)!.id}),false)}});
test('schema rejects overlapping timings, repeated matching pairs and invalid question references',()=>{
 const overlap=structuredClone(p);overlap.segments[1].start=0;assert.equal(experienceSchema.safeParse(overlap).success,false);
 const pairs=structuredClone(p);pairs.questions.find(q=>q.kind==='match')!.answer.pairs=[['plane','plane'],['plane','plane'],['plane','plane']];assert.equal(experienceSchema.safeParse(pairs).success,false);
 const reference=structuredClone(p);reference.questions[0].wordId='unknown';assert.equal(experienceSchema.safeParse(reference).success,false);
});
test('curated audio and all card illustrations are packaged locally',()=>{assert.ok(readFileSync('server/media/parvoz-v1.mp3').length>2000000);for(const image of new Set([...p.words.map(w=>w.image),...p.questions.map(q=>q.image)].filter(Boolean)))assert.ok(existsSync('client/public'+image),image)});
