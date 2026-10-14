import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Mic,
  Square,
  Volume2,
  Bookmark,
  Eye,
  EyeOff,
  Trophy,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  LearningShell,
  Panel,
  Meter,
  Loading,
  ErrorState,
} from "@/components/learning-shell";
import { LearningVideo, type VideoHandle } from "@/components/learning-video";
import { useAuth } from "@/hooks/use-auth";
import { useRecorder } from "@/hooks/use-recorder";
import { useLearningActivity } from "@/hooks/use-learning-activity";
import { request, speak, errorText } from "@/lib/learning-api";
import {
  STAGES,
  STAGE_LABELS,
  normalizeAnswer,
  type Stage,
  type Segment,
  type LessonWord,
  type PublicQuestion,
} from "@shared/learning";
import type { LessonProgress } from "@shared/schema";
import type { LessonCard } from "./learner-pages";

interface LessonView extends LessonCard {
  summary: string | null;
  segments: Segment[];
  vocabulary: LessonWord[];
  progress: LessonProgress | null;
  preview: boolean;
  canEdit: boolean;
  practiceCount: number;
  vocabularyCount: number;
}
interface Completion {
  progress: LessonProgress;
  xp: number;
}
interface Attempt {
  id: string;
  kind: string;
  questions: PublicQuestion[];
  answers: { questionId: string; answer: string; correct: boolean }[];
  finishedAt: string | null;
  score: number | null;
}
interface Feedback extends Partial<Completion> {
  correct: boolean;
  answer: string;
  explanation: string;
  done: boolean;
  score: number | null;
  answered: number;
}
export default function LessonPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isLoading: authLoading } = useAuth();
  const cache = useQueryClient();
  const editorPreview =
    new URLSearchParams(window.location.search).get("preview") === "1";
  const preview = !user || editorPreview;
  const queryKey = ["learning-lesson", id, preview, user?.id];
  const q = useQuery<LessonView>({
    queryKey,
    queryFn: () =>
      request(
        "GET",
        user
          ? `/api/learn/lessons/${id}${editorPreview ? "?preview=1" : ""}`
          : `/api/learn/preview/${id}`,
      ),
    enabled: !authLoading,
    retry: false,
  });
  const [stage, setStage] = useState<Stage | "results">("listen");
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [translation, setTranslation] = useState(false);
  const [word, setWord] = useState<LessonWord | null>(null);
  const [position, setPosition] = useState(0);
  const [spoken, setSpoken] = useState(false);
  const [notice, setNotice] = useState("");
  const [note, setNote] = useState("");
  const noteSave = useMutation({
    mutationFn: () =>
      request("POST", `/api/learn/lessons/${id}/notes`, {
        content: note,
        sentenceIndex: segmentIndex,
      }),
    onSuccess: () => {
      setNote("");
      setNotice("Eslatma saqlandi");
      void cache.invalidateQueries({ queryKey: ["learning-notes"] });
    },
  });
  const initialized = useRef("");
  const video = useRef<VideoHandle>(null);
  const wordTrigger = useRef<HTMLElement | null>(null);
  const activity = useLearningActivity(Number(id), !!q.data && !preview);
  const data = q.data;
  const segment = data?.segments[segmentIndex];
  const recording = useRecorder(
    `${user?.id || "guest"}:${id}:${data?.contentVersion || 1}:${segment?.id || "0"}`,
  );
  useEffect(() => {
    if (data && initialized.current !== id) {
      initialized.current = id;
      const p = data.progress;
      setSegmentIndex(
        Math.min(p?.segmentIndex || 0, Math.max(0, data.segments.length - 1)),
      );
      const time = Number(new URLSearchParams(window.location.search).get("t"));
      setPosition(
        Number.isFinite(time) && time > 0 ? time : p?.playbackPosition || 0,
      );
      setStage(
        p?.completionPercent === 100
          ? "results"
          : STAGES.find((s) => !p?.completedStages?.includes(s)) || "listen",
      );
    }
  }, [data, id]);
  function updateProgress(p?: LessonProgress) {
    if (p)
      cache.setQueryData<LessonView>(queryKey, (old) =>
        old
          ? { ...old, progress: p, completionPercent: p.completionPercent || 0 }
          : old,
      );
    for (const key of [
      ["/api/learn/today"],
      ["/api/learn/analytics"],
      ["/api/auth/me"],
      ["/api/learn/reviews"],
      ["/api/user/saved-words"],
      ["catalog"],
    ])
      void cache.invalidateQueries({ queryKey: key });
  }
  const complete = useMutation({
    mutationFn: async (s: Stage) => {
      await activity.flush();
      return request<Completion>("POST", `/api/learn/lessons/${id}/stages`, {
        stage: s,
        recorded: recording.hasRecording,
        spoken,
      });
    },
    onSuccess: (r, s) => {
      updateProgress(r.progress);
      setNotice(r.xp ? `+${r.xp} XP — bosqich saqlandi` : "Bosqich saqlandi");
      setStage(STAGES[STAGES.indexOf(s) + 1] || "results");
      video.current?.pause();
    },
  });
  const saved = useQuery<{ normalized: string }[]>({
    queryKey: ["/api/user/saved-words", id],
    queryFn: () => request("GET", `/api/user/saved-words?lessonId=${id}`),
    enabled: !!user && !editorPreview,
  });
  const save = useMutation({
    mutationFn: () =>
      request("POST", "/api/user/saved-words", {
        lessonId: Number(id),
        word: word!.word,
        subtitleTime: word!.subtitleTime,
      }),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["/api/user/saved-words"] });
      void cache.invalidateQueries({ queryKey: ["/api/learn/reviews"] });
    },
  });
  function openWord(w: LessonWord) {
    wordTrigger.current = document.activeElement as HTMLElement;
    setWord(w);
    save.reset();
  }
  function changeSegment(index: number) {
    recording.stop();
    setSegmentIndex(index);
    setSpoken(false);
    const s = data?.segments[index];
    if (s?.start !== null && s?.start !== undefined)
      video.current?.seek(s.start, s.end);
    activity.touch();
  }
  function chooseStage(s: Stage) {
    recording.stop();
    setStage(s);
    setNotice("");
    if (s === "practice" || s === "vocabulary") video.current?.pause();
  }
  const completed = data?.progress?.completedStages || [];
  const arabic = data?.targetLanguage !== "en";
  return (
    <LearningShell
      title={data?.title || "Dars"}
      back={editorPreview ? `/studio/lessons/${id}` : "/courses"}
    >
      {authLoading || q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        data && (
          <>
            <div className="lesson-heading">
              <span className="level-pill">
                {data.level} · {arabic ? "Arab tili" : "Ingliz tili"}
              </span>
              <Meter
                value={data.progress?.completionPercent || 0}
                label="Dars bajarilishi"
              />
            </div>
            {preview && (
              <Panel className="preview-notice">
                <BookOpen size={21} />
                <div>
                  <strong>
                    {editorPreview
                      ? "O‘quvchi ko‘rinishi"
                      : "Dars bilan tanishing"}
                  </strong>
                  <p>
                    {editorPreview
                      ? "Bu ko‘rinishda natija va ball yozilmaydi."
                      : "Bosqichlarni bajarish va natijalarni saqlash uchun hisobingizga kiring."}
                  </p>
                  {!user && (
                    <Link
                      className="quiet-link"
                      href={`/login?next=/learn/${id}`}
                    >
                      Kirish va o‘rganishni boshlash <ArrowRight size={16} />
                    </Link>
                  )}
                </div>
              </Panel>
            )}
            <nav className="lesson-stages" aria-label="Dars bosqichlari">
              {STAGES.map((s, i) => (
                <button
                  key={s}
                  onClick={() => chooseStage(s)}
                  aria-current={stage === s ? "step" : undefined}
                  className={
                    stage === s ? "active" : completed.includes(s) ? "done" : ""
                  }
                >
                  <span>
                    {completed.includes(s) ? <Check size={15} /> : i + 1}
                  </span>
                  {STAGE_LABELS[s]}
                </button>
              ))}
            </nav>
            {stage === "results" ? (
              <Results lessonId={id} onBack={() => setStage("listen")} />
            ) : (
              <div className="lesson-workspace">
                <div className="lesson-main">
                  <LearningVideo
                    ref={video}
                    url={data.youtubeUrl}
                    segments={data.segments}
                    position={position}
                    initialPosition={
                      Number(
                        new URLSearchParams(window.location.search).get("t"),
                      ) ||
                      data.progress?.playbackPosition ||
                      0
                    }
                    onProgress={(time, index, playing) => {
                      setPosition(time);
                      if (stage !== "shadow") setSegmentIndex(index);
                      activity.playback(time, index, playing);
                    }}
                    onSegment={setSegmentIndex}
                  />
                  {(stage === "listen" ||
                    stage === "understand" ||
                    stage === "shadow") &&
                    segment && (
                      <Panel className="sentence-panel">
                        <div className="section-heading">
                          <span className="eyebrow">
                            {segmentIndex + 1} / {data.segments.length} GAP
                          </span>
                          <button
                            className="quiet-link"
                            onClick={() => setTranslation(!translation)}
                            aria-pressed={translation}
                          >
                            {translation ? (
                              <EyeOff size={17} />
                            ) : (
                              <Eye size={17} />
                            )}{" "}
                            Tarjima
                          </button>
                        </div>
                        <p
                          className={arabic ? "sentence arabic" : "sentence"}
                          dir={arabic ? "rtl" : "ltr"}
                        >
                          {segment.text.split(/(\s+)/).map((token, i) => {
                            const normalized = normalizeAnswer(token);
                            const entry =
                              segment.words.find(
                                (w) => w.normalized === normalized,
                              ) ||
                              data.vocabulary.find(
                                (w) => w.normalized === normalized,
                              );
                            return entry ? (
                              <button
                                key={i}
                                className="sentence-word"
                                onClick={() => {
                                  openWord({
                                    ...entry,
                                    sourceSentence: segment.text,
                                    subtitleTime: segment.start,
                                  });
                                  save.reset();
                                }}
                              >
                                {token}
                              </button>
                            ) : (
                              <span key={i}>{token}</span>
                            );
                          })}
                        </p>
                        {(translation || stage === "understand") && (
                          <p className="sentence-translation">
                            {segment.translation || "Tarjima tayyorlanmoqda"}
                          </p>
                        )}
                        {stage === "understand" && segment.grammarNotes && (
                          <details className="grammar-notes">
                            <summary>Gap tuzilishi va grammatika</summary>
                            <p>{segment.grammarNotes}</p>
                          </details>
                        )}
                        <div className="sentence-controls">
                          <Button
                            variant="outline"
                            disabled={segmentIndex === 0}
                            aria-label="Oldingi gap"
                            onClick={() => changeSegment(segmentIndex - 1)}
                          >
                            <ChevronLeft size={20} />
                          </Button>
                          <button
                            className="quiet-link"
                            disabled={segment.start === null}
                            onClick={() => {
                              if (segment.start !== null)
                                video.current?.seek(segment.start, segment.end);
                            }}
                          >
                            Shu gapni eshitish <Volume2 size={18} />
                          </button>
                          <Button
                            variant="outline"
                            disabled={segmentIndex >= data.segments.length - 1}
                            aria-label="Keyingi gap"
                            onClick={() => changeSegment(segmentIndex + 1)}
                          >
                            <ChevronRight size={20} />
                          </Button>
                        </div>
                      </Panel>
                    )}
                  {stage === "listen" && (
                    <Panel>
                      <h2>1. Tingla</h2>
                      <p>
                        Videoni tinglang. Gaplar bo‘yicha yurib, asosiy mazmunni
                        tushunishga harakat qiling.
                      </p>
                    </Panel>
                  )}
                  {stage === "understand" && (
                    <Panel>
                      <h2>2. Tushun</h2>
                      <p>
                        So‘z ustiga bosing: ma’no, talaffuz va gapdagi
                        vazifasini ko‘ring. Kerakli so‘zlarni lug‘atingizga
                        saqlang.
                      </p>
                      {data.summary && (
                        <details>
                          <summary>Dars mazmuni</summary>
                          <p>{data.summary}</p>
                        </details>
                      )}
                    </Panel>
                  )}
                  {stage === "understand" && !preview && (
                    <Panel>
                      <h2>O‘zim uchun eslatma</h2>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          noteSave.mutate();
                        }}
                      >
                        <label className="field-label">
                          Eslatma
                          <textarea
                            value={note}
                            onChange={(e) => setNote(e.target.value)}
                            required
                            maxLength={5000}
                            rows={3}
                          />
                        </label>
                        <Button
                          type="submit"
                          disabled={noteSave.isPending || !note.trim()}
                        >
                          Eslatmani saqlash
                        </Button>
                        {noteSave.error && (
                          <p role="alert" className="inline-error">
                            {errorText(noteSave.error)}
                          </p>
                        )}
                      </form>
                    </Panel>
                  )}
                  {stage === "shadow" && (
                    <Panel className="shadow-panel">
                      <h2>3. Eshit va takrorla</h2>
                      <p>
                        Gapni tinglang, keyin o‘zingiz takrorlang. Yozuvingizni
                        namuna bilan taqqoslang.
                      </p>
                      <div className="record-actions">
                        <Button
                          variant={
                            recording.recording ? "destructive" : "default"
                          }
                          disabled={recording.pending || preview}
                          onClick={() => {
                            video.current?.pause();
                            recording.recording
                              ? recording.stop()
                              : void recording.start();
                          }}
                        >
                          {recording.recording ? (
                            <Square size={19} />
                          ) : (
                            <Mic size={20} />
                          )}{" "}
                          {recording.pending
                            ? "Mikrofon ochilmoqda…"
                            : recording.recording
                              ? `To‘xtatish · ${recording.seconds}s`
                              : "Ovozimni yozish"}
                        </Button>
                        {recording.url && (
                          <audio
                            controls
                            src={recording.url}
                            aria-label="O‘zingizning yozuvingiz"
                          />
                        )}
                      </div>
                      {recording.error && (
                        <p className="inline-error" role="alert">
                          {recording.error}
                        </p>
                      )}
                      <p className="muted">
                        Yozuv shu qurilmada qoladi. Talaffuzga avtomatik baho
                        berilmaydi.
                      </p>
                      <label className="consent-row">
                        <input
                          type="checkbox"
                          checked={spoken}
                          onChange={(e) => setSpoken(e.target.checked)}
                        />
                        Gaplarni ovoz chiqarib takrorladim
                      </label>
                    </Panel>
                  )}
                  {(stage === "practice" || stage === "vocabulary") &&
                    (preview ? (
                      <Panel>
                        <h2>{STAGE_LABELS[stage]}</h2>
                        <p>
                          {stage === "practice"
                            ? data.practiceCount
                            : data.vocabularyCount}{" "}
                          ta savol tayyor.{" "}
                          {editorPreview
                            ? "Kontent tekshiruvida savollar va javoblarni ko‘rishingiz mumkin."
                            : "Testni bajarish uchun hisobingizga kiring."}
                        </p>
                      </Panel>
                    ) : (
                      <Exercise
                        key={`${id}:${stage}`}
                        lessonId={id}
                        kind={stage}
                        language={data.targetLanguage}
                        segments={data.segments}
                        seek={(time, end) => video.current?.seek(time, end)}
                        onDone={(r) => {
                          updateProgress(r.progress);
                          setStage(
                            stage === "practice" ? "vocabulary" : "results",
                          );
                        }}
                      />
                    ))}
                  {(stage === "listen" ||
                    stage === "understand" ||
                    stage === "shadow") && (
                    <Button
                      className="complete-stage wide-button"
                      disabled={
                        preview ||
                        complete.isPending ||
                        recording.recording ||
                        (stage === "shadow" &&
                          !recording.hasRecording &&
                          !spoken)
                      }
                      onClick={() => complete.mutate(stage)}
                    >
                      {complete.isPending
                        ? "Saqlanmoqda…"
                        : "Bosqichni yakunlash"}
                      <ArrowRight size={18} />
                    </Button>
                  )}
                  {complete.error && (
                    <p className="inline-error" role="alert">
                      {errorText(complete.error)}
                    </p>
                  )}
                  {activity.error && !preview && (
                    <p className="inline-error" role="status">
                      Natijani saqlash: {activity.error}
                    </p>
                  )}
                  {notice && (
                    <p role="status" className="success-text">
                      {notice}
                    </p>
                  )}
                </div>
                {stage !== "practice" && stage !== "vocabulary" && (
                  <aside className="lesson-aside">
                    <Panel>
                      <h2>Dars lug‘ati</h2>
                      <p>{data.vocabulary.length} ta asosiy so‘z</p>
                      <div className="lesson-vocabulary">
                        {data.vocabulary.map((w) => (
                          <button
                            key={w.normalized}
                            onClick={() => {
                              openWord(w);
                            }}
                          >
                            <span
                              className={arabic ? "arabic" : ""}
                              dir={arabic ? "rtl" : "ltr"}
                            >
                              {w.word}
                            </span>
                            <span>{w.meaning}</span>
                          </button>
                        ))}
                      </div>
                    </Panel>
                    {completed.length > 0 && (
                      <Button
                        variant="outline"
                        onClick={() => setStage("results")}
                      >
                        <Trophy size={18} />
                        Natijalarim
                      </Button>
                    )}
                  </aside>
                )}
              </div>
            )}
            <Dialog
              open={!!word}
              onOpenChange={(open) => {
                if (!open) setWord(null);
              }}
            >
              <DialogContent
                className="word-dialog"
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  wordTrigger.current?.focus();
                }}
              >
                <DialogTitle
                  className={arabic ? "arabic" : ""}
                  dir={arabic ? "rtl" : "ltr"}
                >
                  {word?.word}
                </DialogTitle>
                <DialogDescription>{word?.meaning}</DialogDescription>
                <button
                  className="quiet-link"
                  onClick={() => speak(word?.word || "", data.targetLanguage)}
                >
                  <Volume2 size={20} />
                  Talaffuzni eshitish
                </button>
                {word?.pronunciation && (
                  <p className="muted">{word.pronunciation}</p>
                )}
                {word?.sourceSentence && (
                  <Panel>
                    <p
                      className={arabic ? "arabic context-sentence" : ""}
                      dir={arabic ? "rtl" : "ltr"}
                    >
                      {word.sourceSentence}
                    </p>
                    <button
                      className="quiet-link"
                      disabled={word.subtitleTime === null}
                      onClick={() => {
                        if (word.subtitleTime !== null) {
                          video.current?.seek(word.subtitleTime);
                          setWord(null);
                        }
                      }}
                    >
                      Darsdagi joyini eshitish <Volume2 size={17} />
                    </button>
                  </Panel>
                )}
                {word &&
                  (word.grammarNotes ||
                    word.i_rab ||
                    word.grammaticalRole ||
                    word.root) && (
                    <details className="grammar-notes">
                      <summary>Grammatik ma’lumot</summary>
                      {word.root && (
                        <p>
                          Ildiz: <span className="arabic">{word.root}</span>
                        </p>
                      )}
                      {word.grammaticalRole && <p>{word.grammaticalRole}</p>}
                      {word.i_rab && (
                        <p className="arabic" dir="rtl">
                          {word.i_rab}
                        </p>
                      )}
                      {word.grammarNotes && <p>{word.grammarNotes}</p>}
                    </details>
                  )}
                {!user ? (
                  <Link
                    className="primary-link"
                    href={`/login?next=/learn/${id}`}
                  >
                    Saqlash uchun kirish
                  </Link>
                ) : (
                  <Button
                    className="wide-button"
                    disabled={
                      editorPreview ||
                      save.isPending ||
                      saved.data?.some((w) => w.normalized === word?.normalized)
                    }
                    onClick={() => save.mutate()}
                  >
                    {saved.data?.some(
                      (w) => w.normalized === word?.normalized,
                    ) ? (
                      <Check size={19} />
                    ) : (
                      <Bookmark size={19} />
                    )}{" "}
                    {saved.data?.some((w) => w.normalized === word?.normalized)
                      ? "Lug‘atda saqlangan"
                      : "Lug‘atimga saqlash"}
                  </Button>
                )}
                {save.error && (
                  <p role="alert" className="inline-error">
                    {errorText(save.error)}
                  </p>
                )}
              </DialogContent>
            </Dialog>
          </>
        )
      )}
    </LearningShell>
  );
}

function Exercise({
  lessonId,
  kind,
  language,
  segments,
  seek,
  onDone,
}: {
  lessonId: string;
  kind: "practice" | "vocabulary";
  language: string;
  segments: Segment[];
  seek: (time: number, end?: number | null) => void;
  onDone: (r: Feedback) => void;
}) {
  const q = useQuery<Attempt>({
    queryKey: ["attempt", lessonId, kind],
    queryFn: () =>
      request("POST", `/api/learn/lessons/${lessonId}/attempts`, { kind }),
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });
  const [index, setIndex] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [selected, setSelected] = useState<number[]>([]);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (q.data && index === null) setIndex(q.data.answers.length);
  }, [q.data, index]);
  const question = q.data?.questions[index ?? 0];
  const submit = useMutation({
    mutationFn: () =>
      request<Feedback>("POST", `/api/learn/attempts/${q.data!.id}/answers`, {
        questionId: question!.id,
        answer:
          question!.type === "order"
            ? selected.map((i) => question!.tokens![i]).join(" ")
            : answer,
      }),
    onSuccess: (r) => setFeedback(r),
  });
  function next() {
    if (feedback?.done) {
      onDone(feedback);
      return;
    }
    setIndex((n) => (n ?? 0) + 1);
    setFeedback(null);
    setAnswer("");
    setSelected([]);
    submit.reset();
    input.current?.focus();
  }
  if (q.isLoading || (index === null && !q.error)) return <Loading />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  if (!question)
    return (
      <Panel>
        <h2>Test yakunlangan</h2>
        <Button
          onClick={() =>
            onDone({
              correct: false,
              answer: "",
              explanation: "",
              done: true,
              score: q.data?.score ?? null,
              answered: q.data?.answers.length || 0,
            })
          }
        >
          Davom etish <ArrowRight size={18} />
        </Button>
      </Panel>
    );
  const arabic = language === "ar";
  const response =
    question.type === "order"
      ? selected.map((i) => question.tokens![i]).join(" ")
      : answer;
  const cue = segments.find((s) => s.start === question.cueTime);
  return (
    <Panel className="exercise-panel">
      <div className="section-heading">
        <h2>
          {kind === "vocabulary" ? "Dars lug‘ati testi" : "Mustahkamlash"}
        </h2>
        <span>
          {(index ?? 0) + 1} / {q.data!.questions.length}
        </span>
      </div>
      <Meter
        value={((index ?? 0) / q.data!.questions.length) * 100}
        label="Test jarayoni"
      />
      <span className="exercise-type">
        {
          {
            choice: "To‘g‘ri javobni tanlang",
            recall: "Xotiradan yozing",
            gap: "Bo‘sh joyni to‘ldiring",
            order: "Gapni tuzing",
            dictation: "Tinglab yozing",
          }[question.type]
        }
      </span>
      <h3
        className={
          /[\u0600-\u06ff]/.test(question.prompt)
            ? "arabic quiz-prompt"
            : "quiz-prompt"
        }
        dir={/[\u0600-\u06ff]/.test(question.prompt) ? "rtl" : "ltr"}
      >
        {question.prompt}
      </h3>
      {question.cueTime !== null && question.cueTime !== undefined && (
        <Button
          variant="outline"
          onClick={() => seek(question.cueTime!, cue?.end)}
        >
          <Volume2 size={19} />
          Namunani eshitish
        </Button>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (response.trim()) submit.mutate();
        }}
      >
        {question.type === "choice" ? (
          <div className="answer-choices">
            {question.options?.map((option, i) => (
              <button
                type="button"
                key={i}
                disabled={!!feedback || submit.isPending}
                onClick={() => setAnswer(option)}
                aria-pressed={answer === option}
                className={answer === option ? "selected" : ""}
              >
                <span>{String.fromCharCode(65 + i)}</span>
                <span dir="auto">{option}</span>
              </button>
            ))}
          </div>
        ) : question.type === "order" ? (
          <>
            <div
              className={arabic ? "token-answer arabic" : "token-answer"}
              dir={arabic ? "rtl" : "ltr"}
            >
              {selected.length ? (
                selected.map((i, n) => (
                  <button
                    disabled={!!feedback}
                    type="button"
                    key={n}
                    onClick={() =>
                      setSelected((a) => a.filter((_, k) => k !== n))
                    }
                  >
                    {question.tokens![i]}
                  </button>
                ))
              ) : (
                <span className="muted">So‘zlarni tanlang</span>
              )}
            </div>
            <div
              className={arabic ? "token-pool arabic" : "token-pool"}
              dir={arabic ? "rtl" : "ltr"}
            >
              {question.tokens?.map((token, i) => (
                <button
                  key={i}
                  type="button"
                  disabled={selected.includes(i) || !!feedback}
                  onClick={() => setSelected((a) => [...a, i])}
                >
                  {token}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="quiet-link"
              disabled={!!feedback}
              onClick={() => setSelected([])}
            >
              <RotateCcw size={16} />
              Qayta tuzish
            </button>
          </>
        ) : (
          <label className="field-label">
            Javobingiz
            <input
              ref={input}
              aria-label="Javobingiz"
              className={arabic ? "arabic" : ""}
              dir={arabic ? "rtl" : "ltr"}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              maxLength={4000}
              disabled={!!feedback || submit.isPending}
            />
          </label>
        )}
        {!feedback && (
          <Button
            className="wide-button"
            type="submit"
            disabled={!response.trim() || submit.isPending}
          >
            {submit.isPending ? "Tekshirilmoqda…" : "Javobni tekshirish"}
          </Button>
        )}
      </form>
      {submit.error && (
        <p role="alert" className="inline-error">
          {errorText(submit.error)}
        </p>
      )}
      {feedback && (
        <div
          className={
            feedback.correct
              ? "answer-feedback correct"
              : "answer-feedback incorrect"
          }
          role="status"
        >
          <strong>
            {feedback.correct ? "To‘g‘ri!" : "Yana mashq qilamiz"}
          </strong>
          {!feedback.correct && (
            <p>
              To‘g‘ri javob: <span dir="auto">{feedback.answer}</span>
            </p>
          )}
          {feedback.explanation && <p dir="auto">{feedback.explanation}</p>}
          <Button className="wide-button" onClick={next}>
            {feedback.done
              ? kind === "practice"
                ? "Lug‘at testiga o‘tish"
                : "Natijani ko‘rish"
              : "Keyingi savol"}
            <ArrowRight size={18} />
          </Button>
        </div>
      )}
    </Panel>
  );
}
interface TestResult {
  score: number;
  total: number;
  correct: number;
  errors: {
    prompt: string;
    response: string;
    answer: string;
    explanation: string;
  }[];
}
function Results({
  lessonId,
  onBack,
}: {
  lessonId: string;
  onBack: () => void;
}) {
  const { user } = useAuth();
  const q = useQuery<{
    practice: TestResult | null;
    vocabulary: TestResult | null;
    progress: LessonProgress | null;
    savedWords: number;
  }>({
    queryKey: ["results", lessonId],
    queryFn: () => request("GET", `/api/learn/lessons/${lessonId}/results`),
    enabled: !!user,
  });
  if (!user)
    return (
      <Panel>
        <Link className="primary-link" href={`/login?next=/learn/${lessonId}`}>
          Natijalarni saqlash uchun kirish
        </Link>
      </Panel>
    );
  return q.isLoading ? (
    <Loading />
  ) : q.error ? (
    <ErrorState error={q.error} retry={() => q.refetch()} />
  ) : (
    <div className="lesson-results">
      <Panel className="result-hero">
        <Trophy size={42} />
        <h2>
          {q.data?.progress?.completionPercent === 100
            ? "Dars yakunlandi!"
            : "Darsdagi natijalaringiz"}
        </h2>
        <p>
          {q.data?.progress?.completionPercent || 0}% bajarildi ·{" "}
          {Math.floor((q.data?.progress?.studyTimeSeconds || 0) / 60)} daqiqa
          faol o‘qish
        </p>
        <Meter
          value={q.data?.progress?.completionPercent || 0}
          label="Dars natijasi"
        />
      </Panel>
      <div className="dashboard-grid">
        {[
          ["Mashqlar", q.data?.practice],
          ["Lug‘at testi", q.data?.vocabulary],
        ].map(([title, value]) => {
          const r = value as TestResult | null;
          return (
            <Panel key={String(title)}>
              <h2>{String(title)}</h2>
              <strong className="score-number">
                {r ? `${r.score}%` : "—"}
              </strong>
              <p>
                {r
                  ? `${r.correct} / ${r.total} to‘g‘ri javob`
                  : "Hali yakunlanmagan"}
              </p>
            </Panel>
          );
        })}
      </div>
      {q.data?.vocabulary?.errors.length ? (
        <Panel>
          <h2>Takrorlash uchun so‘zlar</h2>
          <p>Xato so‘zlar kundalik takrorlashga qo‘shildi.</p>
          {q.data.vocabulary.errors.map((e, i) => (
            <div className="result-error" key={i}>
              <p dir="auto">{e.prompt}</p>
              <strong dir="auto">{e.answer}</strong>
              <small dir="auto">{e.explanation}</small>
            </div>
          ))}
        </Panel>
      ) : null}
      <div className="result-actions">
        <Link className="primary-link" href="/review">
          Lug‘atni takrorlash <ArrowRight size={18} />
        </Link>
        <Link className="outline-link" href="/courses">
          Keyingi darsni tanlash
        </Link>
        <Button variant="ghost" onClick={onBack}>
          Darsga qaytish
        </Button>
      </div>
    </div>
  );
}
