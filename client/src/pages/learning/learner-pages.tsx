import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  BookOpen,
  Bookmark,
  Play,
  Repeat2,
  Search,
  Volume2,
  Trash2,
  Check,
  Clock,
  Flame,
  Trophy,
  Settings,
  LogOut,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LearningShell,
  Panel,
  Meter,
  Loading,
  ErrorState,
  EmptyState,
} from "@/components/learning-shell";
import { useAuth } from "@/hooks/use-auth";
import { request, speak, errorText } from "@/lib/learning-api";
import { useLearningActivity } from "@/hooks/use-learning-activity";
import { CEFR_LEVELS } from "@shared/learning";
import type { SavedWord } from "@shared/schema";
import { LinkedAccountsPanel } from "@/components/social-auth";

export interface LessonCard {
  id: number;
  title: string;
  description: string | null;
  thumbnailUrl: string | null;
  youtubeUrl: string | null;
  level: string;
  targetLanguage: string;
  contentVersion: number;
  completionPercent: number;
}
interface CourseCard {
  id: number;
  name: string;
  description: string | null;
  coverImage: string | null;
  level: string;
  targetLanguage: string;
  lessonCount: number;
  completedCount: number;
  completionPercent: number;
}
interface Catalog {
  courses: CourseCard[];
  lessons: LessonCard[];
  total: number;
  page: number;
  availableLevels: string[];
}
function Cover({ src }: { src?: string | null }) {
  const [broken, setBroken] = useState(false);
  return (
    <div className="course-cover">
      {src && !broken ? (
        <img src={src} alt="" loading="lazy" onError={() => setBroken(true)} />
      ) : (
        <BookOpen size={34} />
      )}
    </div>
  );
}
function LessonRow({ lesson }: { lesson: LessonCard }) {
  return (
    <Link href={`/learn/${lesson.id}`} className="lesson-row">
      <Cover src={lesson.thumbnailUrl} />
      <div>
        <span className="level-pill">{lesson.level}</span>
        <h3>{lesson.title}</h3>
        {lesson.completionPercent > 0 ? (
          <>
            <Meter value={lesson.completionPercent} label="Dars bajarilishi" />
            <small>{lesson.completionPercent}% bajarilgan</small>
          </>
        ) : (
          <small>
            {lesson.description?.slice(0, 95) || "Video, lug‘at va mashqlar"}
          </small>
        )}
      </div>
      <ArrowRight size={19} />
    </Link>
  );
}
export function TodayPage() {
  const { user } = useAuth();
  const q = useQuery<{
    studySeconds: number;
    dueWords: number;
    continueLesson: LessonCard | null;
    completedLessons: number;
  }>({
    queryKey: ["/api/learn/today"],
    queryFn: () => request("GET", "/api/learn/today"),
  });
  return (
    <LearningShell>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        q.data && (
          <>
            <div className="welcome-heading">
              <span className="eyebrow">BUGUNGI O‘QUV YO‘LINGIZ</span>
              <h1>Salom, {user?.fullName.split(" ")[0]}!</h1>
              <p>Bugun ham bir qadam oldinga.</p>
            </div>
            <Panel className="goal-card">
              <div>
                <Clock size={25} />
                <div>
                  <h2>Kunlik maqsad</h2>
                  <p>
                    {Math.floor(q.data.studySeconds / 60)} /{" "}
                    {user?.dailyGoalMinutes || 15} daqiqa
                  </p>
                </div>
              </div>
              <Meter
                value={
                  (q.data.studySeconds /
                    ((user?.dailyGoalMinutes || 15) * 60)) *
                  100
                }
                label="Kunlik maqsad"
              />
            </Panel>
            <div className="dashboard-grid">
              <Panel>
                <div className="section-heading">
                  <h2>Davom ettirish</h2>
                  <Play size={22} />
                </div>
                {q.data.continueLesson ? (
                  <>
                    <LessonRow lesson={q.data.continueLesson} />
                    <Link
                      href={`/learn/${q.data.continueLesson.id}`}
                      className="primary-link"
                    >
                      Darsni davom ettirish <ArrowRight size={18} />
                    </Link>
                  </>
                ) : (
                  <EmptyState
                    title="Keyingi darsingizni tanlang"
                    description="Darajangizga mos kurslarni ko‘rib chiqing."
                    href="/courses"
                  />
                )}
              </Panel>
              <Panel className="review-teaser">
                <Repeat2 size={30} />
                <h2>Bugungi takrorlash</h2>
                <p>
                  {q.data.dueWords
                    ? `${q.data.dueWords} ta so‘z tayyor`
                    : "Bugungi takrorlashlar bajarilgan"}
                </p>
                <Link
                  href={q.data.dueWords ? "/review" : "/words"}
                  className="outline-link"
                >
                  {q.data.dueWords
                    ? "Takrorlashni boshlash"
                    : "Lug‘atimni ochish"}
                  <ArrowRight size={18} />
                </Link>
              </Panel>
            </div>
            <Link href="/courses" className="next-row">
              <BookOpen size={24} />
              <span>Darajangizga mos yangi darslar</span>
              <ArrowRight size={20} />
            </Link>
          </>
        )
      )}
    </LearningShell>
  );
}
export function CatalogPage() {
  const { user } = useAuth();
  const [language, setLanguage] = useState(
    new URLSearchParams(window.location.search).get("lang") === "en"
      ? "en"
      : user?.targetLanguage || "ar",
  );
  const initialized = useRef(false);
  const [level, setLevel] = useState("");
  const [search, setSearch] = useState("");
  const [qtext, setQtext] = useState("");
  const [page, setPage] = useState(1);
  useEffect(() => {
    if (user && !initialized.current) {
      initialized.current = true;
      if (!new URLSearchParams(window.location.search).has("lang"))
        setLanguage(user.targetLanguage);
    }
  }, [user]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQtext(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery<Catalog>({
    queryKey: ["catalog", language, level, qtext, page],
    queryFn: ({ signal }) =>
      request(
        "GET",
        `/api/learn/catalog?${new URLSearchParams({ language, level, q: qtext, page: String(page) })}`,
        undefined,
        signal,
      ),
  });
  return (
    <LearningShell title="Darslar">
      <div className="catalog-controls">
        <label className="search-field">
          <Search size={20} />
          <input
            aria-label="Kurs yoki mavzu izlash"
            placeholder="Kurs yoki mavzu izlash"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <div className="filter-row">
          <div className="choice-row">
            {[
              ["ar", "Arab tili"],
              ["en", "Ingliz tili"],
            ].map(([code, title]) => (
              <button
                className={language === code ? "choice selected" : "choice"}
                key={code}
                onClick={() => {
                  setLanguage(code);
                  setLevel("");
                  setPage(1);
                }}
                aria-pressed={language === code}
              >
                {title}
              </button>
            ))}
          </div>
          <label className="compact-select">
            Daraja
            <select
              value={level}
              onChange={(e) => {
                setLevel(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Barcha darajalar</option>
              {CEFR_LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {query.isLoading ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        query.data && (
          <>
            {query.data.courses.length > 0 && (
              <>
                <h2 className="section-title">Darajangizga mos kurslar</h2>
                <div className="course-grid">
                  {query.data.courses.map((c) => (
                    <Link
                      href={`/courses/${c.id}`}
                      className="course-card"
                      key={c.id}
                    >
                      <Cover src={c.coverImage} />
                      <div>
                        <span className="level-pill">{c.level}</span>
                        <h3>{c.name}</h3>
                        <p>{c.lessonCount} dars</p>
                        <Meter
                          value={c.completionPercent}
                          label="Kurs bajarilishi"
                        />
                        <small>
                          {c.completedCount} / {c.lessonCount} dars
                        </small>
                      </div>
                      <ArrowRight size={18} />
                    </Link>
                  ))}
                </div>
              </>
            )}
            <h2 className="section-title">Video darslar</h2>
            {query.data.lessons.length ? (
              <div className="lesson-grid">
                {query.data.lessons.map((l) => (
                  <LessonRow key={l.id} lesson={l} />
                ))}
              </div>
            ) : (
              <EmptyState
                title="Hozircha mos dars yo‘q"
                description="Boshqa daraja yoki tilni tanlang. Yangi darslar tayyorlanmoqda."
              />
            )}
            {query.data.total > 20 && (
              <div className="pagination">
                <Button
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage(page - 1)}
                >
                  Oldingi
                </Button>
                <span>
                  {page} / {Math.ceil(query.data.total / 20)}
                </span>
                <Button
                  variant="outline"
                  disabled={page * 20 >= query.data.total}
                  onClick={() => setPage(page + 1)}
                >
                  Keyingi
                </Button>
              </div>
            )}
          </>
        )
      )}
    </LearningShell>
  );
}
export function CoursePage() {
  const { id } = useParams<{ id: string }>();
  const q = useQuery<{
    id: number;
    name: string;
    description: string | null;
    coverImage: string | null;
    level: string;
    lessons: LessonCard[];
  }>({
    queryKey: ["course", id],
    queryFn: () => request("GET", `/api/learn/courses/${id}`),
  });
  const completion = q.data?.lessons.length
    ? Math.round(
        q.data.lessons.reduce((n, l) => n + l.completionPercent, 0) /
          q.data.lessons.length,
      )
    : 0;
  return (
    <LearningShell title={q.data?.name || "Kurs"} back="/courses">
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        q.data && (
          <>
            <Panel className="course-intro">
              <Cover src={q.data.coverImage} />
              <div>
                <span className="level-pill">{q.data.level}</span>
                <h2>{q.data.name}</h2>
                <p>{q.data.description}</p>
                <small>
                  {
                    q.data.lessons.filter((l) => l.completionPercent === 100)
                      .length
                  }{" "}
                  / {q.data.lessons.length} dars tugallangan
                </small>
                <Meter value={completion} label="Kurs bajarilishi" />
              </div>
            </Panel>
            <h2 className="section-title">Kurs darslari</h2>
            <div className="course-lesson-list">
              {q.data.lessons.map((l, i) => (
                <Link
                  href={`/learn/${l.id}`}
                  className={
                    l.completionPercent > 0 && l.completionPercent < 100
                      ? "course-lesson current"
                      : "course-lesson"
                  }
                  key={l.id}
                >
                  <span className="lesson-number">
                    {l.completionPercent === 100 ? <Check size={20} /> : i + 1}
                  </span>
                  <div>
                    <h3>{l.title}</h3>
                    <small>
                      {l.completionPercent === 100
                        ? "Tugallangan"
                        : l.completionPercent > 0
                          ? `Davom etmoqda · ${l.completionPercent}%`
                          : "O‘rganishni boshlash"}
                    </small>
                  </div>
                  <ArrowRight size={20} />
                </Link>
              ))}
            </div>
            {!q.data.lessons.length && (
              <EmptyState
                title="Darslar tayyorlanmoqda"
                description="Bu kursga tez orada darslar qo‘shiladi."
              />
            )}
          </>
        )
      )}
    </LearningShell>
  );
}
export function WordsPage() {
  const cache = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [learned, setLearned] = useState(false);
  const q = useQuery<SavedWord[]>({
    queryKey: ["/api/user/saved-words"],
    queryFn: () => request("GET", "/api/user/saved-words"),
  });
  const due = useQuery<ReviewCard[]>({
    queryKey: ["/api/learn/reviews"],
    queryFn: () => request("GET", "/api/learn/reviews"),
  });
  const remove = useMutation({
    mutationFn: (id: number) =>
      request("DELETE", `/api/user/saved-words/${id}`, {}),
    onSuccess: () => {
      void cache.invalidateQueries({ queryKey: ["/api/user/saved-words"] });
      void cache.invalidateQueries({ queryKey: ["/api/learn/reviews"] });
    },
  });
  const words = (q.data || []).filter(
    (w) =>
      (!learned || w.isLearned) &&
      `${w.word} ${w.translationUz || ""}`
        .toLocaleLowerCase()
        .includes(search.toLocaleLowerCase()),
  );
  return (
    <LearningShell title="Lug‘atim">
      <Panel className="review-banner">
        <div>
          <Repeat2 size={26} />
          <div>
            <h2>Bugungi takrorlash</h2>
            <p>{due.data?.length || 0} ta so‘z tayyor</p>
          </div>
        </div>
        <Link href="/review" className="primary-link">
          Boshlash <ArrowRight size={18} />
        </Link>
      </Panel>
      <label className="search-field">
        <Search size={20} />
        <input
          aria-label="So‘z izlash"
          placeholder="So‘z izlash"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </label>
      <div className="choice-row filter-chips">
        <button
          className={!learned ? "choice selected" : "choice"}
          onClick={() => setLearned(false)}
        >
          Barchasi
        </button>
        <button
          className={learned ? "choice selected" : "choice"}
          onClick={() => setLearned(true)}
        >
          O‘rganilgan
        </button>
      </div>
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : words.length ? (
        <div className="word-grid">
          {words.map((w) => (
            <Panel key={w.id} className="word-card">
              <div className="word-head">
                <h2
                  className={/[\u0600-\u06ff]/.test(w.word) ? "arabic" : ""}
                  dir={/[\u0600-\u06ff]/.test(w.word) ? "rtl" : "ltr"}
                >
                  {w.word}
                </h2>
                <div>
                  <button
                    className="icon-action"
                    aria-label={`${w.word} talaffuzini eshitish`}
                    onClick={() =>
                      speak(
                        w.word,
                        /[\u0600-\u06ff]/.test(w.word) ? "ar" : "en",
                      )
                    }
                  >
                    <Volume2 size={21} />
                  </button>
                  <button
                    className="icon-action danger"
                    aria-label={`${w.word} so‘zini o‘chirish`}
                    disabled={remove.isPending}
                    onClick={() => remove.mutate(w.id)}
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              </div>
              <p className="word-meaning">{w.translationUz}</p>
              {w.sourceSentence && (
                <p
                  className={
                    /[\u0600-\u06ff]/.test(w.sourceSentence)
                      ? "arabic context-sentence"
                      : "context-sentence"
                  }
                  dir={/[\u0600-\u06ff]/.test(w.sourceSentence) ? "rtl" : "ltr"}
                >
                  {w.sourceSentence}
                </p>
              )}
              <Link
                className="quiet-link"
                href={`/learn/${w.lessonId}?t=${w.subtitleTime || 0}`}
              >
                Darsdagi joyini eshitish <ArrowRight size={17} />
              </Link>
            </Panel>
          ))}
        </div>
      ) : (
        <EmptyState
          title={search ? "Mos so‘z topilmadi" : "Lug‘atingizni to‘ldiring"}
          description="Darsdagi so‘z ustiga bosib, ma’nosini ko‘ring va saqlang."
          href="/courses"
        />
      )}
      {remove.error && (
        <p role="alert" className="inline-error">
          {errorText(remove.error)}
        </p>
      )}
    </LearningShell>
  );
}
interface ReviewCard {
  id: number;
  lessonId: number;
  word: string;
  meaning: string;
  sourceSentence: string | null;
  subtitleTime: number | null;
  dueAt: string;
}
export function ReviewPage() {
  const { user } = useAuth();
  useLearningActivity(null, true);
  const cache = useQueryClient();
  const q = useQuery<ReviewCard[]>({
    queryKey: ["/api/learn/reviews"],
    queryFn: () => request("GET", "/api/learn/reviews"),
  });
  const [shown, setShown] = useState(false);
  const [done, setDone] = useState(0);
  const total = useRef(0);
  const eventId = useRef(crypto.randomUUID());
  const card =
    done < total.current || total.current === 0 ? q.data?.[0] : undefined;
  useEffect(() => {
    if (q.data?.length && total.current === 0) total.current = q.data.length;
  }, [q.data]);
  useEffect(() => {
    setShown(false);
    eventId.current = crypto.randomUUID();
  }, [card?.id]);
  const rate = useMutation({
    mutationFn: (rating: string) =>
      request("POST", `/api/learn/reviews/${card!.id}`, {
        id: eventId.current,
        rating,
      }),
    onSuccess: () => {
      setDone((n) => n + 1);
      void cache.invalidateQueries({ queryKey: ["/api/learn/reviews"] });
      void cache.invalidateQueries({ queryKey: ["/api/learn/today"] });
      void cache.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });
  return (
    <LearningShell title="Kundalik takrorlash" back="/words">
      {q.isLoading ? (
        <Loading />
      ) : q.error ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !card ? (
        <EmptyState
          title={
            done ? "Takrorlash qismi yakunlandi!" : "Hozircha takrorlash yo‘q"
          }
          description={
            done
              ? `${done} ta so‘z bilan shug‘ullandingiz. Keyingi takrorlash sanalari belgilandi.`
              : "Saqlangan va qiyin so‘zlar o‘z vaqtida shu yerda chiqadi."
          }
          href="/today"
          action="Bugun ekraniga qaytish"
        />
      ) : (
        <>
          <div className="review-progress">
            <span>
              {done + 1} / {total.current || q.data?.length} karta
            </span>
            <Meter
              value={(done / Math.max(1, total.current)) * 100}
              label="Takrorlash jarayoni"
            />
          </div>
          <Panel className="review-card">
            <button
              className="icon-action"
              aria-label="So‘z talaffuzini eshitish"
              onClick={() =>
                speak(
                  card.word,
                  /[\u0600-\u06ff]/.test(card.word) ? "ar" : "en",
                )
              }
            >
              <Volume2 size={24} />
            </button>
            <h2
              className={/[\u0600-\u06ff]/.test(card.word) ? "arabic" : ""}
              dir={/[\u0600-\u06ff]/.test(card.word) ? "rtl" : "ltr"}
            >
              {card.word}
            </h2>
            {!shown ? (
              <>
                <p className="muted">Ma’nosini eslab ko‘ring</p>
                <Button onClick={() => setShown(true)} className="wide-button">
                  Javobni ko‘rsatish
                </Button>
              </>
            ) : (
              <>
                <h3>{card.meaning}</h3>
                {card.sourceSentence && (
                  <p
                    className="arabic context-sentence"
                    dir={
                      /[\u0600-\u06ff]/.test(card.sourceSentence)
                        ? "rtl"
                        : "ltr"
                    }
                  >
                    {card.sourceSentence}
                  </p>
                )}
                <Link
                  href={`/learn/${card.lessonId}?t=${card.subtitleTime || 0}`}
                  className="quiet-link"
                >
                  Darsdagi joyini eshitish <ArrowRight size={18} />
                </Link>
              </>
            )}
          </Panel>
          {shown && (
            <Panel>
              <p>Eslab qolish qanchalik oson bo‘ldi?</p>
              <div className="review-ratings">
                {[
                  ["hard", "Qiyin"],
                  ["medium", "O‘rta"],
                  ["easy", "Oson"],
                ].map(([rating, title]) => (
                  <button
                    key={rating}
                    className={rating}
                    disabled={rate.isPending}
                    onClick={() => rate.mutate(rating)}
                  >
                    {title}
                  </button>
                ))}
              </div>
            </Panel>
          )}
          {rate.error && (
            <p role="alert" className="inline-error">
              {errorText(rate.error)}
            </p>
          )}
        </>
      )}
    </LearningShell>
  );
}
export function ProfilePage() {
  const { user, logout } = useAuth();
  const cache = useQueryClient();
  const [goal, setGoal] = useState(user?.dailyGoalMinutes || 15);
  const [level, setLevel] = useState(user?.learningLevel || "A1");
  const [language, setLanguage] = useState(user?.targetLanguage || "ar");
  const [name, setName] = useState(user?.fullName || "");
  const [message, setMessage] = useState("");
  const q = useQuery<{
    weekly: { date: string; seconds: number }[];
    completedLessons: number;
    savedWords: number;
    totalStudySeconds: number;
  }>({
    queryKey: ["/api/learn/analytics"],
    queryFn: () => request("GET", "/api/learn/analytics"),
  });
  const save = useMutation({
    mutationFn: () =>
      request("PATCH", "/api/learn/preferences", {
        fullName: name,
        targetLanguage: language,
        learningLevel: level,
        dailyGoalMinutes: goal,
      }),
    onSuccess: (u) => {
      cache.setQueryData(["/api/auth/me"], u);
      setMessage("Sozlamalar saqlandi");
      void cache.invalidateQueries({ queryKey: ["/api/learn/today"] });
    },
  });
  const max = Math.max(60, ...(q.data?.weekly || []).map((d) => d.seconds));
  return (
    <LearningShell title="Profil">
      <Panel className="profile-summary">
        <span className="profile-avatar">{user?.fullName.slice(0, 1)}</span>
        <div>
          <h2>{user?.fullName}</h2>
          <span className="level-pill">
            {user?.targetLanguage === "en" ? "Ingliz tili" : "Arab tili"} ·{" "}
            {user?.learningLevel}
          </span>
        </div>
      </Panel>
      <LinkedAccountsPanel />
      <div className="stat-grid">
        <Panel>
          <Flame />
          <strong>{user?.streakDays || 0} kun</strong>
          <span>Ketma-ket o‘qish</span>
        </Panel>
        <Panel>
          <Trophy />
          <strong>{user?.xp || 0} XP</strong>
          <span>Jami ball</span>
        </Panel>
        <Panel>
          <BookOpen />
          <strong>{q.data?.completedLessons || 0} ta</strong>
          <span>Tugallangan dars</span>
        </Panel>
        <Panel>
          <Bookmark />
          <strong>{q.data?.savedWords || 0} ta</strong>
          <span>Saqlangan so‘z</span>
        </Panel>
      </div>
      <Panel>
        <h2>Shu hafta</h2>
        {q.isLoading ? (
          <Loading />
        ) : q.error ? (
          <p role="alert">{errorText(q.error)}</p>
        ) : (
          <div className="weekly-bars" aria-label="Haftalik faol o‘qish vaqti">
            {q.data?.weekly.map((day) => (
              <div key={day.date}>
                <span className="bar-value">
                  {Math.floor(day.seconds / 60)} daq
                </span>
                <span
                  className="week-bar"
                  style={{
                    height: `${Math.max(5, (day.seconds / max) * 90)}px`,
                  }}
                />
                <small>
                  {new Intl.DateTimeFormat("uz", { weekday: "short" }).format(
                    new Date(`${day.date}T12:00:00`),
                  )}
                </small>
              </div>
            ))}
          </div>
        )}
      </Panel>
      <Panel>
        <h2>
          <Settings size={20} /> O‘quv sozlamalari
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="field-label">
            Ismingiz
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={100}
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
          <label className="field-label">
            Kunlik maqsad
            <select
              value={goal}
              onChange={(e) => setGoal(Number(e.target.value))}
            >
              {[10, 15, 20, 30, 60].map((n) => (
                <option key={n} value={n}>
                  {n} daqiqa
                </option>
              ))}
            </select>
          </label>
          {save.error && (
            <p role="alert" className="inline-error">
              {errorText(save.error)}
            </p>
          )}
          {message && (
            <p role="status" className="success-text">
              {message}
            </p>
          )}
          <Button type="submit" disabled={save.isPending}>
            Sozlamalarni saqlash
          </Button>
        </form>
      </Panel>
      <div className="editor-links">
        <Link href="/notes" className="quiet-link">
          Eslatmalarim <ArrowRight size={17} />
        </Link>
        <Link href="/flashcards/archive" className="quiet-link">
          Oldingi kartochkalarim <ArrowRight size={17} />
        </Link>
      </div>
      <Button
        variant="outline"
        className="logout-button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
      >
        <LogOut size={19} />
        Hisobdan chiqish
      </Button>
    </LearningShell>
  );
}
