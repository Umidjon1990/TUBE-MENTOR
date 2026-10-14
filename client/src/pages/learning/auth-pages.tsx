import { useState, useEffect, useRef } from "react";
import { Link, Redirect, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Eye,
  EyeOff,
  CheckCircle2,
  Play,
  Headphones,
  Bookmark,
  Mic,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Brand, Panel, Loading } from "@/components/learning-shell";
import { useAuth } from "@/hooks/use-auth";
import { request, errorText } from "@/lib/learning-api";
import { queryClient } from "@/lib/queryClient";
import { CEFR_LEVELS } from "@shared/learning";
import {
  SocialAuthButtons,
  useAuthConfig as useConfig,
} from "@/components/social-auth";

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete = "current-password",
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  autoComplete?: string;
}) {
  const [show, setShow] = useState(false);
  const id = label.replace(/\s/g, "-");
  return (
    <label htmlFor={id} className="field-label">
      {label}
      <span className="password-field">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          required
          minLength={autoComplete === "new-password" ? 10 : 1}
          maxLength={128}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          onClick={() => setShow(!show)}
          aria-label={show ? "Parolni yashirish" : "Parolni ko‘rsatish"}
        >
          {show ? <EyeOff size={20} /> : <Eye size={20} />}
        </button>
      </span>
    </label>
  );
}
function AuthFrame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <main className="auth-page">
      <Brand />
      <Panel>
        <h1>{title}</h1>
        <p className="muted">{subtitle}</p>
        {children}
      </Panel>
      <Link href="/courses" className="quiet-link">
        Darslarni ko‘rish <ArrowRight size={16} />
      </Link>
    </main>
  );
}

export function LandingPage() {
  const { user, isLoading } = useAuth();
  const catalog = useQuery<any>({
    queryKey: ["landing-catalog"],
    queryFn: () => request("GET", "/api/learn/catalog?language=ar"),
  });
  if (isLoading) return <Loading />;
  if (user)
    return (
      <Redirect
        to={
          user.role === "admin"
            ? "/admin"
            : user.role === "teacher"
              ? "/studio"
              : user.onboardingCompleted
                ? "/today"
                : "/onboarding"
        }
      />
    );
  const sample = catalog.data?.lessons?.[0];
  return (
    <div className="landing-page">
      <header>
        <Brand />
        <Link href="/login" className="outline-link">
          Kirish
        </Link>
      </header>
      <main className="landing-content">
        <div className="landing-copy">
          <span className="level-pill">Arab tilini video bilan o‘rganing</span>
          <h1>
            Tinglang.
            <br />
            Tushuning.
            <br />
            <em>Gapiring.</em>
          </h1>
          <p>
            O‘zbekcha izohlar bilan bosqichma-bosqich arab tili. Har bir darsda
            video, lug‘at va amaliy mashqlar.
          </p>
          <Link className="primary-link" href="/register">
            O‘rganishni boshlash <ArrowRight size={20} />
          </Link>
          <Link
            className="outline-link"
            href={sample ? `/learn/${sample.id}` : "/courses"}
          >
            Namunaviy dars <Play size={18} />
          </Link>
        </div>
        <div className="landing-preview">
          <div className="preview-head">
            <span className="level-pill">A2 · Kundalik hayot</span>
            <span>Video bilan o‘rganish</span>
          </div>
          <div className="arabic hero-sentence" lang="ar" dir="rtl">
            أَذْهَبُ إِلَى الْعَمَلِ كُلَّ صَبَاحٍ.
          </div>
          <p>Men har kuni ertalab ishga boraman.</p>
          <div className="feature-grid">
            <div>
              <Headphones />
              <strong>Tinglang</strong>
              <small>Gapni qayta eshiting</small>
            </div>
            <div>
              <Mic />
              <strong>Takrorlang</strong>
              <small>Ovozingizni yozing</small>
            </div>
            <div>
              <Bookmark />
              <strong>Saqlang</strong>
              <small>So‘zlarni eslab qoling</small>
            </div>
          </div>
          {sample && (
            <Link href={`/learn/${sample.id}`} className="sample-row">
              <Play size={19} />
              {sample.title}
              <ArrowRight size={19} />
            </Link>
          )}
        </div>
      </main>
      <section className="landing-benefits">
        <div>
          <h2>Darajangizga mos</h2>
          <p>O‘zingizga mos kurs va qisqa darslardan boshlang.</p>
        </div>
        <div>
          <h2>O‘zbekcha tushuntirish</h2>
          <p>Arabcha so‘z va gapni uning asl kontekstida tushuning.</p>
        </div>
        <div>
          <h2>Kunlik takrorlash</h2>
          <p>Saqlangan va qiyin so‘zlaringizni reja bilan takrorlang.</p>
        </div>
      </section>
      <footer>
        © {new Date().getFullYear()} TUBE MENTOR · Video bilan o‘rganish
      </footer>
    </div>
  );
}
export function LoginPage() {
  const { user, login } = useAuth();
  const config = useConfig();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const providerError = new URLSearchParams(window.location.search).get(
    "error",
  );
  const errors: Record<string, string> = {
    google_unavailable: "Google orqali kirish hozir mavjud emas",
    google_failed: "Google orqali kirish yakunlanmadi. Qayta urinib ko‘ring.",
    google_email_link:
      "Mavjud hisobingizga kirib, Profil bo‘limidan Google’ni ulang.",
    telegram_unavailable: "Telegram orqali kirish hozir mavjud emas",
    telegram_failed:
      "Telegram orqali kirish yakunlanmadi. Qayta urinib ko‘ring.",
    account_in_use: "Bu hisob boshqa profilga ulangan. O‘sha profilga kiring.",
    signup_disabled: "Ro‘yxatdan o‘tish yopilgan",
    blocked: "Hisob bloklangan",
  };
  if (user)
    return (
      <Redirect
        to={
          user.role === "admin"
            ? "/admin"
            : user.role === "teacher"
              ? "/studio"
              : user.onboardingCompleted
                ? "/today"
                : "/onboarding"
        }
      />
    );
  return (
    <AuthFrame
      title="Yana xush kelibsiz!"
      subtitle="Darsingizni qolgan joyidan davom ettiring."
    >
      <SocialAuthButtons config={config.data} />
      {(config.data?.googleEnabled || config.data?.telegramEnabled) && (
        <div className="form-divider">yoki login bilan kiring</div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          login.mutate({ username, password });
        }}
      >
        <label className="field-label">
          Email yoki foydalanuvchi nomi
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
            maxLength={254}
          />
        </label>
        <PasswordInput label="Parol" value={password} onChange={setPassword} />
        {config.data?.emailEnabled && (
          <Link href="/forgot-password" className="form-link">
            Parolni unutdingizmi?
          </Link>
        )}
        {(login.error || providerError) && (
          <p role="alert" className="inline-error">
            {login.error
              ? errorText(login.error)
              : errors[providerError!] || "Kirish yakunlanmadi"}
          </p>
        )}
        <Button
          className="wide-button"
          type="submit"
          disabled={login.isPending}
        >
          {login.isPending ? "Kirilmoqda…" : "Kirish"}
        </Button>
      </form>
      <p className="auth-switch">
        Hisobingiz yo‘qmi? <Link href="/register">Ro‘yxatdan o‘tish</Link>
      </p>
    </AuthFrame>
  );
}
export function RegisterPage() {
  const config = useConfig();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password !== repeat) {
      setError("Parollar bir xil bo‘lishi kerak");
      return;
    }
    setBusy(true);
    try {
      await request("POST", "/api/auth/register", {
        fullName: name,
        email,
        password,
        acceptedTerms: terms,
      });
      setSent(true);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title="O‘rganishni boshlaymiz"
      subtitle="Shaxsiy natijalaringiz bir joyda saqlanadi."
    >
      {sent ? (
        <div className="confirmation">
          <CheckCircle2 />
          <h2>Emailingizni tekshiring</h2>
          <p>
            Hisobingizni faollashtirish uchun emailingizdagi havolani oching.
          </p>
          <Link href="/verify-email">Havolani qayta yuborish</Link>
        </div>
      ) : (
        <>
          <SocialAuthButtons config={config.data} />
          {config.isLoading ? (
            <Loading />
          ) : !config.data?.signupEnabled ? (
            <p className="notice">
              {config.data?.socialSignupEnabled &&
              (config.data.googleEnabled || config.data.telegramEnabled)
                ? "Hisobingizni Google yoki Telegram orqali yarating. Sayt uchun alohida parol kerak emas."
                : "Hisob ochish uchun markazga murojaat qiling. Mavjud hisobingiz bilan kirishingiz mumkin."}
            </p>
          ) : (
            <form onSubmit={submit}>
              <label className="field-label">
                Ismingiz
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                  minLength={2}
                  maxLength={100}
                />
              </label>
              <label className="field-label">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                  maxLength={254}
                />
              </label>
              <PasswordInput
                label="Parol"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
              />
              <PasswordInput
                label="Parolni takrorlang"
                value={repeat}
                onChange={setRepeat}
                autoComplete="new-password"
              />
              <label className="check-label">
                <input
                  type="checkbox"
                  required
                  checked={terms}
                  onChange={(e) => setTerms(e.target.checked)}
                />
                Hisob yaratish va platformadan foydalanishga roziman
              </label>
              {error && (
                <p role="alert" className="inline-error">
                  {error}
                </p>
              )}
              <Button type="submit" className="wide-button" disabled={busy}>
                {busy ? "Yuborilmoqda…" : "Hisob yaratish"}
              </Button>
              <p className="small muted">
                Emailingizga tasdiqlash havolasi yuboriladi.
              </p>
            </form>
          )}
        </>
      )}
      <p className="auth-switch">
        Hisobingiz bormi? <Link href="/login">Kirish</Link>
      </p>
    </AuthFrame>
  );
}
export function VerificationPage() {
  const [, navigate] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token");
  const started = useRef(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState(
    token
      ? "Email tasdiqlanmoqda…"
      : "Emailingizdagi havolani oching yoki yangisini so‘rang.",
  );
  const [error, setError] = useState("");
  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    void request<any>("POST", "/api/auth/verify-email", { token })
      .then((user) => {
        queryClient.setQueryData(["/api/auth/me"], user);
        window.history.replaceState(null, "", "/verify-email");
        navigate(user.onboardingCompleted ? "/today" : "/onboarding");
      })
      .catch((e) => setError(errorText(e)));
  }, [token, navigate]);
  async function resend(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const result = await request<{ message: string }>(
        "POST",
        "/api/auth/resend-verification",
        { email },
      );
      setStatus(result.message);
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <AuthFrame title="Emailni tasdiqlash" subtitle={status}>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <form onSubmit={resend}>
        <label className="field-label">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <Button type="submit" className="wide-button">
          Havolani qayta yuborish
        </Button>
      </form>
      <Link href="/login" className="form-link">
        Kirishga qaytish
      </Link>
    </AuthFrame>
  );
}
export function PasswordRecoveryPage({ reset = false }: { reset?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const token = new URLSearchParams(window.location.search).get("token");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const result = await request<{ message: string }>(
        "POST",
        reset ? "/api/auth/reset-password" : "/api/auth/forgot-password",
        reset ? { token, password } : { email },
      );
      setMessage(result.message);
      if (reset) window.history.replaceState(null, "", "/reset-password");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title={reset ? "Yangi parol" : "Parolni tiklash"}
      subtitle={
        reset
          ? "Hisobingiz uchun yangi parol o‘rnating."
          : "Emailingizga tiklash havolasini yuboramiz."
      }
    >
      {message ? (
        <p className="notice" role="status">
          {message}
        </p>
      ) : (
        <form onSubmit={submit}>
          {reset ? (
            <PasswordInput
              label="Yangi parol"
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
            />
          ) : (
            <label className="field-label">
              Email
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </label>
          )}
          {error && (
            <p role="alert" className="inline-error">
              {error}
            </p>
          )}
          <Button className="wide-button" type="submit" disabled={busy}>
            {reset ? "Parolni yangilash" : "Havola yuborish"}
          </Button>
        </form>
      )}
      <Link href="/login" className="form-link">
        Kirishga qaytish
      </Link>
    </AuthFrame>
  );
}
export function OnboardingPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [language, setLanguage] = useState(user?.targetLanguage || "ar");
  const [level, setLevel] = useState(user?.learningLevel || "A1");
  const [goal, setGoal] = useState(user?.dailyGoalMinutes || 15);
  const [unknown, setUnknown] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const catalog = useQuery<{ availableLevels: string[] }>({
    queryKey: ["onboarding-levels", language],
    queryFn: () => request("GET", `/api/learn/catalog?language=${language}`),
  });
  const available = catalog.data?.availableLevels || [];
  useEffect(() => {
    if (available.length && !available.includes(level)) setLevel(available[0]);
  }, [catalog.data, level]);
  async function submit() {
    setBusy(true);
    setError("");
    try {
      const updated = await request("PATCH", "/api/learn/preferences", {
        targetLanguage: language,
        learningLevel: unknown ? available[0] || "A1" : level,
        dailyGoalMinutes: goal,
        timezone:
          Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tashkent",
        onboardingCompleted: true,
      });
      queryClient.setQueryData(["/api/auth/me"], updated);
      navigate("/today");
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthFrame
      title="Sizga mos yo‘lni tanlaymiz"
      subtitle="Tanlovni keyinchalik profilingizdan o‘zgartira olasiz."
    >
      <fieldset>
        <legend>Qaysi tilni o‘rganasiz?</legend>
        <div className="choice-row">
          {[
            ["ar", "Arab tili"],
            ["en", "Ingliz tili"],
          ].map(([code, title]) => (
            <button
              key={code}
              className={language === code ? "choice selected" : "choice"}
              onClick={() => setLanguage(code)}
              aria-pressed={language === code}
            >
              {title}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend>Darajangiz</legend>
        <div className="level-grid">
          {CEFR_LEVELS.map((l) => (
            <button
              key={l}
              className={level === l && !unknown ? "choice selected" : "choice"}
              disabled={available.length > 0 && !available.includes(l)}
              onClick={() => {
                setLevel(l);
                setUnknown(false);
              }}
              aria-pressed={level === l && !unknown}
            >
              {l}
              <small>
                {available.length > 0 && !available.includes(l)
                  ? "Darslar tayyorlanmoqda"
                  : ""}
              </small>
            </button>
          ))}
        </div>
        <button
          className="text-action"
          onClick={() => setUnknown(!unknown)}
          aria-pressed={unknown}
        >
          Darajamni bilmayman
        </button>
        {unknown && (
          <p className="notice">
            Avval boshlang‘ich namunaviy darsni tavsiya qilamiz. Mos darajani
            keyin o‘zgartira olasiz.
          </p>
        )}
      </fieldset>
      <fieldset>
        <legend>Kunlik maqsad</legend>
        <div className="choice-row">
          {[10, 15, 20].map((n) => (
            <button
              className={goal === n ? "choice selected" : "choice"}
              key={n}
              onClick={() => setGoal(n)}
              aria-pressed={goal === n}
            >
              {n} daqiqa
            </button>
          ))}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <Button className="wide-button" onClick={submit} disabled={busy}>
        {busy ? "Saqlanmoqda…" : "Davom etish"}
      </Button>
    </AuthFrame>
  );
}
