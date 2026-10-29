import {LessonManagementActions} from '@/components/lesson-management';
import { useEffect, useState } from "react";
import { Link, useLocation, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus,
  ArrowRight,
  Check,
  Eye,
  Upload,
  Download,
  FileText,
  Sparkles,
  ShieldCheck,
  Globe,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Panel,
  Loading,
  ErrorState,
  EmptyState,
} from "@/components/learning-shell";
import { request, errorText } from "@/lib/learning-api";
import { useAuth } from "@/hooks/use-auth";
import {
  CEFR_LEVELS,
  cefrLevel,
  lessonSegments,
  lessonVocabulary,
  buildQuestions,
} from "@shared/learning";
import type { Lesson, Collection } from "@shared/schema";
import { LessonPackageImport } from "@/components/lesson-package-import";
import AdminLayout from "@/components/layouts/admin-layout";
import "@/admin-content.css";
function AdminContentShell({
  children,
  title,
  back,
}: {
  children: React.ReactNode;
  title?: string;
  back?: string;
  studio?: boolean;
}) {
  return (
    <AdminLayout
      title={title || "Darslar"}
      subtitle="Kontentni tayyorlash, tekshirish va nashr qilish"
    >
      <div className="learning-app admin-learning-content">
        <main className="learning-main">
          {back && (
            <Link className="quiet-link admin-content-back" href={back}>
              ← Ortga
            </Link>
          )}
          {children}
        </main>
      </div>
    </AdminLayout>
  );
}
const labels: Record<string, string> = {
  draft: "Qoralama",
  pending: "Tekshiruvda",
  approved: "Tasdiqlangan",
  published: "Nashr qilingan",
  rejected: "Tuzatish kerak",
  processing: "Tayyorlanmoqda",
  archived: "Arxivlangan",
};
function Status({ value }: { value: string }) {
  return (
    <span className={`status-pill ${value}`}>{labels[value] || value}</span>
  );
}
export function StudioPage() {
  const q = useQuery<Lesson[]>({
    queryKey: ["/api/admin/lessons"],
    queryFn: () => request("GET", "/api/admin/lessons"),
  });
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const visible = q.data?.filter(
    (l) =>
      l.title.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (!status || l.status === status),
  );
  useEffect(()=>setSelected([]),[search,status]);
  return (
    <AdminContentShell title="Barcha darslar">
      <div className="section-heading">
        <p>
          Matn, tarjima va vaqtlarni tekshiring. So‘ng darsni nashrga yuboring.
        </p>
        <Link className="primary-link" href="/admin/lessons/new">
          <Plus size={19} />
          Yangi dars
        </Link>
      </div>
      <div className="catalog-filters">
        <label className="field-label">
          Dars qidirish
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Dars nomi"
          />
        </label>
        <label className="field-label">
          Holati
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Barcha holatlar</option>
            {Object.entries(labels).map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : visible?.length ? (
        <div className="studio-list">
          <div className="lesson-selection-bar">
            <label><input type="checkbox" aria-label="Ko‘rsatilgan barcha darslarni tanlash" checked={!!visible.length&&visible.every(l=>selected.includes(l.id))} onChange={e=>setSelected(e.target.checked?visible.map(l=>l.id):[])}/> Barchasini tanlash</label>
            <span>{selected.length} ta tanlangan</span>
            <LessonManagementActions ids={selected} onDone={()=>setSelected([])}/>
          </div>
          {visible.map(l=><article className="learning-panel lesson-management-card" key={l.id}>
            <label className="lesson-select"><input type="checkbox" aria-label={l.title+' — tanlash'} checked={selected.includes(l.id)} onChange={e=>setSelected(old=>e.target.checked?[...old,l.id]:old.filter(id=>id!==l.id))}/></label>
            <Link className="studio-card" href={`/admin/lessons/${l.id}`}><div><Status value={l.status}/><h2>{l.title}</h2><p>{cefrLevel(l.level)} · {l.targetLanguage==='en'?'Ingliz tili':'Arab tili'} · {l.contentVersion}-nusxa</p></div><ArrowRight size={20}/></Link>
            <LessonManagementActions ids={[l.id]} onDone={()=>setSelected(old=>old.filter(id=>id!==l.id))}/>
          </article>)}
        </div>
      ) : (
        <EmptyState
          title={
            q.data?.length
              ? "Mos dars topilmadi"
              : "Birinchi darsingizni yarating"
          }
          description="YouTube havolasini qo‘shing, matn va mashqlarni tayyorlang."
          href="/admin/lessons/new"
          action="Dars yaratish"
        />
      )}
    </AdminContentShell>
  );
}
export function CreateStudioLesson() {
  const [, navigate] = useLocation();
  const cache = useQueryClient();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [language, setLanguage] = useState("ar");
  const [level, setLevel] = useState("A1");
  const cost = useQuery<{ lessonCreationCost: number }>({
    queryKey: ["/api/studio/config"],
    queryFn: () => request("GET", "/api/studio/config"),
  });
  const create = useMutation({
    mutationFn: () =>
      request<{ lesson: Lesson }>("POST", "/api/user/lessons", {
        title,
        youtubeUrl: url,
        targetLanguage: language,
        level,
      }),
    onSuccess: (l) => {
      void cache.invalidateQueries({ queryKey: ["/api/auth/me"] });
      void cache.invalidateQueries({ queryKey: ["/api/user/lessons"] });
      navigate(`/admin/lessons/${l.lesson.id}`);
    },
  });
  return (
    <AdminContentShell studio title="Yangi dars" back="/admin/lessons">
      <LessonPackageImport
        onCreated={(lesson) => {
          void cache.invalidateQueries({ queryKey: ["/api/user/lessons"] });
          navigate(`/admin/lessons/${lesson.id}`);
        }}
      />
      <Panel>
        <h2>Qo‘lda bo‘sh dars yaratish</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label className="field-label">
            Dars nomi
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              required
            />
          </label>
          <label className="field-label">
            YouTube havolasi
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              maxLength={2048}
              placeholder="https://www.youtube.com/watch?v=…"
              required
            />
          </label>
          <div className="settings-grid">
            <label className="field-label">
              Til
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="ar">Arab tili</option>
                <option value="en">Ingliz tili</option>
              </select>
            </label>
            <label className="field-label">
              Daraja
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                {CEFR_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>
          {user?.role !== "admin" && (
            <p className="muted">
              Balansingiz: {user?.coins || 0} coin.{" "}
              {cost.data &&
                `Dars yaratish: ${cost.data.lessonCreationCost} coin.`}
            </p>
          )}
          {create.error && (
            <p role="alert" className="inline-error">
              {errorText(create.error)}
            </p>
          )}
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? "Yaratilmoqda…" : "Dars yaratish"}
            <Plus size={18} />
          </Button>
        </form>
      </Panel>
    </AdminContentShell>
  );
}
interface Review {
  problems: string[];
  checks: Record<string, boolean>;
  contentVersion: number;
  hasPublishedVersion: boolean;
}
export function StudioEditor() {
  const [, navigate] = useLocation();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const cache = useQueryClient();
  const [tab, setTab] = useState("json");
  const [title, setTitle] = useState("");
  const [level, setLevel] = useState("A1");
  const [transcript, setTranscript] = useState("");
  const [json, setJson] = useState("");
  const [jsonField, setJsonField] = useState("content");
  const [checks, setChecks] = useState<Record<string, boolean>>({});
  const [message, setMessage] = useState("");
  const q = useQuery<Lesson>({
    queryKey: ["/api/user/lessons", id],
    queryFn: () => request("GET", `/api/user/lessons/${id}`),
  });
  const review = useQuery<Review>({
    queryKey: ["studio-review", id],
    queryFn: () => request("GET", `/api/studio/lessons/${id}/review`),
  });
  useEffect(() => {
    if (q.data) {
      setTitle(q.data.title);
      setLevel(cefrLevel(q.data.level));
      setTranscript(q.data.manualTranscript || q.data.transcript || "");
    }
  }, [q.data]);
  useEffect(() => {
    setChecks(review.data?.checks || {});
  }, [review.data]);
  const refresh = () => {
    void cache.invalidateQueries({ queryKey: ["/api/user/lessons"] });
    void cache.invalidateQueries({ queryKey: ["studio-review", id] });
    void cache.invalidateQueries({ queryKey: ["/api/admin/lessons"] });
    void cache.invalidateQueries({ queryKey: ["catalog"] });
  };
  const action = useMutation({
    mutationFn: async ({
      method = "POST",
      path,
      body = {},
    }: {
      method?: string;
      path: string;
      body?: unknown;
    }) => request(method, path, body),
    onSuccess: (result) => {
      refresh();
      setMessage(
        result &&
          typeof result === "object" &&
          "success" in result &&
          result.success === false
          ? String(
              (result as { message?: string }).message ||
                "Matn topilmadi. SRT/VTT yoki JSON import qiling.",
            )
          : "O‘zgarish saqlandi",
      );
    },
  });
  function run(path: string, body: unknown = {}, method = "POST") {
    setMessage("");
    action.mutate({ path, body, method });
  }
  const config = useQuery<{ aiEnabled: boolean }>({
    queryKey: ["/api/studio/config"],
    queryFn: () => request("GET", "/api/studio/config"),
  });
  const base = `/api/user/lessons/${id}`;
  const lesson = q.data;
  const segments = lesson ? lessonSegments(lesson) : [];
  const vocab = lesson ? lessonVocabulary(lesson) : [];
  async function exportJson() {
    try {
      const data = await request("GET", `${base}/export-json`);
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dars-${id}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setMessage(errorText(e));
    }
  }
  function importJson() {
    try {
      const data = JSON.parse(json);
      if (data.schemaVersion === 1) {
        run("/api/admin/lesson-package", {
          package: data,
          lessonId: Number(id),
          contentVersion: lesson?.contentVersion,
        });
        return;
      }
      run(
        `${base}/${jsonField === "content" ? "import-content" : "import-json"}`,
        jsonField === "content"
          ? { content: data }
          : { field: jsonField, data },
        jsonField === "content" ? "POST" : "PATCH",
      );
    } catch {
      setMessage("JSON matnini tekshiring: sintaksis noto‘g‘ri.");
    }
  }
  return (
    <AdminContentShell
      studio
      title={lesson?.title || "Dars muharriri"}
      back="/admin/lessons"
    >
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        lesson && (
          <>
            <Panel>
              <LessonManagementActions ids={[lesson.id]} onDone={()=>navigate("/admin/lessons")}/>
              <div className="section-heading">
                <Status value={lesson.status} />
                <span>{lesson.contentVersion}-nusxa</span>
              </div>
              {review.data?.hasPublishedVersion &&
                lesson.status !== "published" && (
                  <p className="success-text">
                    Avval nashr qilingan nusxa o‘quvchilarga ochiq. Yangi nusxa
                    tekshiruvni kutmoqda.
                  </p>
                )}
              <form
                className="editor-metadata"
                onSubmit={(e) => {
                  e.preventDefault();
                  run(base, { title, level }, "PATCH");
                }}
              >
                <label className="field-label">
                  Dars nomi
                  <input
                    required
                    maxLength={200}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </label>
                <label className="field-label">
                  Daraja
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                  >
                    {CEFR_LEVELS.map((l) => (
                      <option key={l}>{l}</option>
                    ))}
                  </select>
                </label>
                <Button
                  type="submit"
                  variant="outline"
                  disabled={action.isPending}
                >
                  Saqlash
                </Button>
              </form>
              <div className="editor-links">
                <Link href={`/learn/${id}?preview=1`} className="outline-link">
                  <Eye size={18} />
                  O‘quvchi ko‘rinishi
                </Link>
                <Link href={`/lessons/${id}/advanced`} className="quiet-link">
                  Batafsil tahrir va eksport <ArrowRight size={16} />
                </Link>
              </div>
            </Panel>
            <nav className="editor-tabs" aria-label="Muharrir bo‘limlari">
              {[
                ["text", "Matn"],
                ["json", "JSON import"],
                ["content", "Kontent"],
                ["review", "Tekshiruv"],
              ].map(([k, t]) => (
                <button
                  className={tab === k ? "active" : ""}
                  key={k}
                  aria-pressed={tab === k}
                  onClick={() => setTab(k)}
                >
                  {t}
                </button>
              ))}
            </nav>
            {tab === "text" && (
              <Panel>
                <h2>Matn va vaqtlar</h2>
                <p>
                  Aniq boshlanish va tugash vaqtlari bilan SRT/VTT kiriting.
                  Faqat boshlanishi ko‘rsatilgan transkriptda vaqtlar taxminiy
                  belgilanadi. Subtitr olish tugmasi mavjud manbadan matnni
                  izlaydi. Audio va AI xizmatlari alohida sozlanadi.
                </p>
                <label className="field-label">
                  Transkript
                  <textarea
                    rows={10}
                    value={transcript}
                    onChange={(e) => setTranscript(e.target.value)}
                    maxLength={120000}
                    dir="auto"
                  />
                </label>
                <div className="editor-actions">
                  <Button
                    disabled={action.isPending || !transcript.trim()}
                    onClick={() =>
                      run(`${base}/transcript`, {
                        mode: "manual",
                        manualText: transcript,
                      })
                    }
                  >
                    <FileText size={18} />
                    Matnni saqlash
                  </Button>
                  <Button
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() => run(`${base}/transcript`, { mode: "auto" })}
                  >
                    Subtitr olish
                  </Button>
                  <details className="optional-ai-tools">
                    <summary>Ixtiyoriy API xizmatlari</summary>
                    <p>
                      Hozirgi JSON ish jarayonida bu xizmatlar kerak emas. Faqat
                      alohida sozlab ishlatiladi.
                    </p>
                    <Button
                      variant="outline"
                      disabled={action.isPending || !config.data?.aiEnabled}
                      onClick={() => run(`${base}/whisper-transcribe`, {})}
                    >
                      Whisper bilan olish
                    </Button>
                    <Button
                      variant="outline"
                      disabled={
                        action.isPending ||
                        !lesson.transcript ||
                        !config.data?.aiEnabled
                      }
                      onClick={() => run(`${base}/generate`, {})}
                    >
                      <Sparkles size={18} />
                      AI bilan tayyorlash
                    </Button>
                  </details>
                  <Link className="quiet-link" href={`/lessons/${id}/process`}>
                    Audio yuklash va ChatGPT yo‘riqnomasi{" "}
                    <ArrowRight size={16} />
                  </Link>
                </div>
              </Panel>
            )}
            {tab === "json" && (
              <Panel>
                <h2>Kontent importi</h2>
                <p>
                  Yangi yagona paketni metadata va content bilan qo‘ying.{" "}
                  <a href="/lesson-package-prompt.txt" download>
                    ChatGPT yo‘riqnomasi
                  </a>{" "}
                  ·{" "}
                  <a href="/lesson-package-example.json" download>
                    JSON namuna
                  </a>
                </p>
                <p>
                  To‘liq kontent: summaryShort, summaryDetailed, vocabulary,
                  sentenceAnalysis va quizzes. Alohida maydon uchun JSON massiv
                  kiriting. Grammatik ma’lumotlar saqlanadi.
                </p>
                <label className="field-label">
                  Import turi
                  <select
                    value={jsonField}
                    onChange={(e) => setJsonField(e.target.value)}
                  >
                    {[
                      "content",
                      "sentenceAnalysisJson",
                      "vocabularyJson",
                      "quizzesJson",
                      "subtitlesJson",
                      "phrasesJson",
                      "flashcardsJson",
                      "wordTimestampsJson",
                    ].map((f) => (
                      <option key={f} value={f}>
                        {f === "content" ? "To‘liq kontent" : f}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field-label">
                  JSON matni
                  <textarea
                    rows={13}
                    value={json}
                    onChange={(e) => setJson(e.target.value)}
                    spellCheck={false}
                    maxLength={2000000}
                  />
                </label>
                <label className="upload-json">
                  <Upload size={17} />
                  JSON faylini ochish
                  <input
                    type="file"
                    accept="application/json,.json"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 2000000) {
                          setMessage("JSON 2 MB dan oshmasin");
                          return;
                        }
                        setJson(await file.text());
                      }
                    }}
                  />
                </label>
                <div className="editor-actions">
                  <Button
                    disabled={action.isPending || !json.trim()}
                    onClick={importJson}
                  >
                    Import qilish
                  </Button>
                  <Button variant="outline" onClick={() => void exportJson()}>
                    <Download size={18} />
                    JSON eksport
                  </Button>
                  <Button
                    variant="outline"
                    disabled={action.isPending}
                    onClick={() => run(`${base}/resync-timing`, {})}
                  >
                    Vaqtlarni moslash
                  </Button>
                </div>
              </Panel>
            )}
            {tab === "content" && (
              <>
                <Panel>
                  <h2>Gaplar · {segments.length}</h2>
                  {segments.map((s) => (
                    <div className="content-preview-row" key={s.id}>
                      <span>
                        {s.start ?? "?"}–{s.end ?? "?"} s ·{" "}
                        {s.timing === "exact"
                          ? "Aniq vaqt"
                          : "Vaqtni tuzatish kerak"}
                      </span>
                      <p
                        className={
                          lesson.targetLanguage === "ar" ? "arabic" : ""
                        }
                        dir="auto"
                      >
                        {s.text}
                      </p>
                      <p>{s.translation || "Tarjima yo‘q"}</p>
                      {s.grammarNotes && (
                        <details>
                          <summary>Grammatika</summary>
                          <p>{s.grammarNotes}</p>
                        </details>
                      )}
                    </div>
                  ))}
                </Panel>
                <Panel>
                  <h2>Lug‘at · {vocab.length}</h2>
                  <div className="lesson-vocabulary">
                    {vocab.map((w) => (
                      <div key={w.normalized}>
                        <strong dir="auto">{w.word}</strong>
                        <span>{w.meaning}</span>
                      </div>
                    ))}
                  </div>
                </Panel>
                <Panel>
                  <h2>Mashqlar va javoblar</h2>
                  {[
                    ...buildQuestions(lesson, "practice"),
                    ...buildQuestions(lesson, "vocabulary"),
                  ].map((q, i) => (
                    <details className="content-preview-row" key={i}>
                      <summary dir="auto">{q.prompt}</summary>
                      <p dir="auto">Javob: {q.answer}</p>
                      <p dir="auto">{q.explanation}</p>
                    </details>
                  ))}
                </Panel>
              </>
            )}
            {tab === "review" && (
              <Panel>
                <h2>
                  <ShieldCheck size={22} /> Nashr oldidan tekshiruv
                </h2>
                {review.isLoading ? (
                  <Loading />
                ) : review.error ? (
                  <ErrorState error={review.error} />
                ) : (
                  <>
                    {review.data?.problems.length ? (
                      <div className="validation-problems" role="alert">
                        {review.data.problems.map((p) => (
                          <p key={p}>{p}</p>
                        ))}
                      </div>
                    ) : (
                      <p className="success-text">
                        Kontent tuzilishi tayyor. Mazmunni ham tekshirib
                        tasdiqlang.
                      </p>
                    )}
                    {[
                      ["text", "Arabcha/inglizcha matn va yozuv to‘g‘ri"],
                      [
                        "translation",
                        "Tarjimalar va grammatik izohlar tekshirildi",
                      ],
                      ["timing", "Videodagi gaplar subtitr vaqtlariga mos"],
                      [
                        "exercises",
                        "Mashqlar, javoblar va lug‘at testi tekshirildi",
                      ],
                    ].map(([k, t]) => (
                      <label key={k} className="consent-row">
                        <input
                          type="checkbox"
                          checked={!!checks[k]}
                          onChange={(e) =>
                            setChecks((v) => ({ ...v, [k]: e.target.checked }))
                          }
                        />
                        {t}
                      </label>
                    ))}
                    <div className="editor-actions">
                      <Button
                        disabled={
                          action.isPending ||
                          !!review.data?.problems.length ||
                          !["text", "translation", "timing", "exercises"].every(
                            (k) => checks[k],
                          )
                        }
                        onClick={() =>
                          run(`/api/studio/lessons/${id}/review`, {
                            ...checks,
                            contentVersion: lesson.contentVersion,
                          })
                        }
                      >
                        <Check size={18} />
                        {user?.role === "admin"
                          ? "Tekshirdim — nashr qilish"
                          : "Tekshiruvga yuborish"}
                      </Button>
                      {user?.role === "admin" &&
                        lesson.status === "pending" && (
                          <Button
                            disabled={action.isPending}
                            onClick={() =>
                              run(
                                `/api/admin/lessons/${id}/approve`,
                                {},
                                "PATCH",
                              )
                            }
                          >
                            Admin tasdig‘i
                          </Button>
                        )}
                      {lesson.status === "approved" && (
                        <Button
                          disabled={action.isPending}
                          onClick={() =>
                            run(
                              `${user?.role === "admin" ? `/api/admin/lessons/${id}` : base}/publish`,
                              {},
                              "PATCH",
                            )
                          }
                        >
                          <Globe size={18} />
                          Nashr qilish
                        </Button>
                      )}
                      {review.data?.hasPublishedVersion && (
                        <Button
                          variant="outline"
                          disabled={action.isPending}
                          onClick={() =>
                            run(
                              `${user?.role === "admin" ? `/api/admin/lessons/${id}` : base}/unpublish`,
                              {},
                              "PATCH",
                            )
                          }
                        >
                          Nashrdan olish
                        </Button>
                      )}
                    </div>
                  </>
                )}
              </Panel>
            )}
            {action.isPending && <p role="status">Bajarilmoqda…</p>}
            {action.error && (
              <p className="inline-error" role="alert">
                {errorText(action.error)}
              </p>
            )}
            {message && (
              <p role="status" className="success-text">
                {message}
              </p>
            )}
          </>
        )
      )}
    </AdminContentShell>
  );
}
export function ModerationPage() {
  const q = useQuery<(Lesson & { creatorName: string })[]>({
    queryKey: ["/api/admin/lessons"],
    queryFn: () => request("GET", "/api/admin/lessons"),
  });
  return (
    <AdminLayout title="Kontent tekshiruvi">
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        <div className="studio-list">
          {q.data
            ?.filter((l) => l.status !== "published")
            .map((l) => (
              <Link
                key={l.id}
                className="studio-card learning-panel"
                href={`/admin/lessons/${l.id}`}
              >
                <div>
                  <Status value={l.status} />
                  <h2>{l.title}</h2>
                  <p>
                    {l.creatorName} · {cefrLevel(l.level)}
                  </p>
                </div>
                <ArrowRight size={20} />
              </Link>
            ))}
        </div>
      )}
    </AdminLayout>
  );
}

export function StudioCourses() {
  const q = useQuery<(Collection & { lessonCount: number })[]>({
    queryKey: ["/api/user/collections"],
    queryFn: () => request("GET", "/api/user/collections"),
  });
  const [name, setName] = useState("");
  const [language, setLanguage] = useState("ar");
  const [level, setLevel] = useState("A1");
  const cache = useQueryClient();
  const [, navigate] = useLocation();
  const create = useMutation({
    mutationFn: () =>
      request<Collection>("POST", "/api/user/collections", {
        name,
        targetLanguage: language,
        level,
      }),
    onSuccess: (c) => {
      void cache.invalidateQueries({ queryKey: ["/api/user/collections"] });
      navigate(`/admin/courses/${c.id}`);
    },
  });
  return (
    <AdminContentShell studio title="Kurslar">
      <Panel>
        <h2>Yangi kurs</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <label className="field-label">
            Kurs nomi
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={200}
            />
          </label>
          <div className="settings-grid">
            <label className="field-label">
              Til
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
              >
                <option value="ar">Arab tili</option>
                <option value="en">Ingliz tili</option>
              </select>
            </label>
            <label className="field-label">
              Daraja
              <select value={level} onChange={(e) => setLevel(e.target.value)}>
                {CEFR_LEVELS.map((l) => (
                  <option key={l}>{l}</option>
                ))}
              </select>
            </label>
          </div>
          <Button type="submit" disabled={create.isPending}>
            Kurs yaratish <Plus size={18} />
          </Button>
          {create.error && (
            <p role="alert" className="inline-error">
              {errorText(create.error)}
            </p>
          )}
        </form>
      </Panel>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        q.data?.map((c) => (
          <Link
            key={c.id}
            href={`/admin/courses/${c.id}`}
            className="studio-card learning-panel"
          >
            <div>
              <Status value={c.status} />
              <h2>{c.name}</h2>
              <p>
                {cefrLevel(c.level)} · {c.lessonCount} dars
              </p>
            </div>
            <ArrowRight size={20} />
          </Link>
        ))
      )}
    </AdminContentShell>
  );
}
export function StudioCourseEditor() {
  const { id } = useParams<{ id: string }>();
  const cache = useQueryClient();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [lessonId, setLessonId] = useState("");
  const q = useQuery<
    Collection & { lessons: (Lesson & { orderIndex: number })[] }
  >({
    queryKey: ["studio-course", id],
    queryFn: () => request("GET", `/api/user/collections/${id}`),
  });
  const all = useQuery<Lesson[]>({
    queryKey: ["/api/user/lessons"],
    queryFn: () => request("GET", "/api/user/lessons"),
  });
  useEffect(() => {
    if (q.data) {
      setName(q.data.name);
      setDescription(q.data.description || "");
    }
  }, [q.data]);
  const base = `/api/user/collections/${id}`;
  const action = useMutation({
    mutationFn: ({
      path = base,
      method = "PATCH",
      body = {},
    }: {
      path?: string;
      method?: string;
      body?: unknown;
    }) => request(method, path, body),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["studio-course", id] });
      void cache.invalidateQueries({ queryKey: ["/api/user/collections"] });
      void cache.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
  function move(index: number, direction: number) {
    const list = [...q.data!.lessons];
    [list[index], list[index + direction]] = [
      list[index + direction],
      list[index],
    ];
    action.mutate({
      path: `${base}/lessons/order`,
      method: "PUT",
      body: { items: list.map((l, i) => ({ lessonId: l.id, orderIndex: i })) },
    });
  }
  return (
    <AdminContentShell
      studio
      title={q.data?.name || "Kurs muharriri"}
      back="/admin/courses"
    >
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} />
      ) : (
        q.data && (
          <>
            <Panel>
              <Status value={q.data.status} />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  action.mutate({ body: { name, description } });
                }}
              >
                <label className="field-label">
                  Kurs nomi
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    maxLength={200}
                  />
                </label>
                <label className="field-label">
                  Tavsif
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={2000}
                  />
                </label>
                <Button type="submit" disabled={action.isPending}>
                  Saqlash
                </Button>
              </form>
              <p>
                O‘quvchi faqat nashr qilingan darslarni ko‘radi. Qoralama
                darslar yashirin qoladi.
              </p>
              <Button
                variant="outline"
                disabled={action.isPending}
                onClick={() =>
                  action.mutate({
                    path:
                      user?.role === "admin"
                        ? `/api/admin/collections/${id}`
                        : base,
                    body: {
                      status:
                        q.data!.status === "published" ? "draft" : "published",
                    },
                  })
                }
              >
                {q.data.status === "published"
                  ? "Nashrdan olish"
                  : "Kursni ochish"}
              </Button>
            </Panel>
            <Panel>
              <h2>Kurs darslari</h2>
              {q.data.lessons.map((l, i) => (
                <div className="course-editor-row" key={l.id}>
                  <Link href={`/admin/lessons/${l.id}`}>
                    <strong>
                      {i + 1}. {l.title}
                    </strong>
                    <Status value={l.status} />
                  </Link>
                  <div>
                    <Button
                      variant="outline"
                      aria-label="Darsni yuqoriga"
                      disabled={i === 0 || action.isPending}
                      onClick={() => move(i, -1)}
                    >
                      <ArrowUp size={16} />
                    </Button>
                    <Button
                      variant="outline"
                      aria-label="Darsni pastga"
                      disabled={
                        i === q.data!.lessons.length - 1 || action.isPending
                      }
                      onClick={() => move(i, 1)}
                    >
                      <ArrowDown size={16} />
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={action.isPending}
                      onClick={() =>
                        action.mutate({
                          path: `${base}/lessons/${l.id}`,
                          method: "DELETE",
                        })
                      }
                    >
                      Ajratish
                    </Button>
                  </div>
                </div>
              ))}
              <label className="field-label">
                Dars qo‘shish
                <select
                  value={lessonId}
                  onChange={(e) => setLessonId(e.target.value)}
                >
                  <option value="">Darsni tanlang</option>
                  {all.data
                    ?.filter(
                      (l) =>
                        !q.data!.lessons.some((v) => v.id === l.id) &&
                        l.targetLanguage === q.data!.targetLanguage,
                    )
                    .map((l) => (
                      <option value={l.id} key={l.id}>
                        {l.title} · {labels[l.status]}
                      </option>
                    ))}
                </select>
              </label>
              <Button
                disabled={!lessonId || action.isPending}
                onClick={() =>
                  action.mutate({
                    path: `${base}/lessons`,
                    method: "POST",
                    body: {
                      lessonId: Number(lessonId),
                      orderIndex: q.data!.lessons.length,
                    },
                  })
                }
              >
                Qo‘shish <Plus size={18} />
              </Button>
            </Panel>
            {action.error && (
              <p role="alert" className="inline-error">
                {errorText(action.error)}
              </p>
            )}
          </>
        )
      )}
    </AdminContentShell>
  );
}
