import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  PlayCircle,
  BookOpen,
  Sparkles,
  Subtitles,
  Languages,
  AlignLeft,
  Search,
  ClipboardCheck,
  Layers,
  ArrowRight,
  Zap,
  Star,
  CheckCircle2,
  ChevronRight,
  Globe,
  Mic,
  Brain,
  FileText,
} from "lucide-react";
import { Link } from "wouter";
import PublicLayout from "@/components/layouts/public-layout";
import { SUPPORTED_LANGUAGES } from "@shared/languages";

const langCardData: Record<string, { emoji: string; gradient: string; iconBg: string; accentColor: string; desc: string }> = {
  ar: {
    emoji: "ع",
    gradient: "from-emerald-400 via-teal-400 to-cyan-400",
    iconBg: "bg-gradient-to-br from-emerald-400 to-teal-500",
    accentColor: "emerald",
    desc: "Harakat bilan to'liq arab tili darslari",
  },
  en: {
    emoji: "En",
    gradient: "from-blue-400 via-indigo-400 to-violet-400",
    iconBg: "bg-gradient-to-br from-blue-400 to-indigo-500",
    accentColor: "blue",
    desc: "Ingliz tili darslari va so'z tahlili",
  },
};

function AnimatedCounter({ target, suffix = "" }: { target: number; suffix?: string }) {
  const [count, setCount] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !started.current) {
          started.current = true;
          let current = 0;
          const step = Math.ceil(target / 40);
          const interval = setInterval(() => {
            current += step;
            if (current >= target) {
              current = target;
              clearInterval(interval);
            }
            setCount(current);
          }, 30);
        }
      },
      { threshold: 0.5 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [target]);

  return (
    <div ref={ref} className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent">
      {count}{suffix}
    </div>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 hero-gradient-bright" />
      <div className="absolute top-0 left-0 right-0 h-full overflow-hidden">
        <div className="absolute top-10 left-[10%] w-64 h-64 rounded-full bg-primary/20 blur-[80px] animate-float-slow" />
        <div className="absolute top-20 right-[15%] w-72 h-72 rounded-full bg-violet-500/15 blur-[80px] animate-float-slow-reverse" />
        <div className="absolute bottom-10 left-[30%] w-80 h-80 rounded-full bg-cyan-400/15 blur-[100px] animate-float-slow" />
        <div className="absolute top-1/3 right-[5%] w-48 h-48 rounded-full bg-amber-400/10 blur-[60px]" />
      </div>

      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,hsl(var(--background)/0.4)_100%)]" />

      <div className="relative max-w-6xl mx-auto px-4 md:px-6 pt-12 md:pt-20 pb-16 md:pb-28">
        <div className="flex flex-col items-center text-center gap-6 md:gap-8">
          <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/10 border border-primary/20 shadow-lg shadow-primary/5">
            <Zap className="w-4 h-4 text-primary" />
            <span
              className="text-sm font-semibold text-primary tracking-wide"
              data-testid="text-badge-ai"
            >
              AI YORDAMIDA VIDEO DARSLIKLAR
            </span>
          </div>

          <h1
            className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight max-w-4xl leading-[1.08]"
            data-testid="text-hero-title"
          >
            <span className="text-foreground">YouTube videolaridan</span>
            <br />
            <span className="hero-title-gradient">
              MUKAMMAL DARSLIK
            </span>
          </h1>

          <p
            className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed"
            data-testid="text-hero-description"
          >
            Istalgan YouTube videosidan professional darsliklar tayyorlang.
            <br className="hidden sm:block" />
            O'qituvchi yaratadi — o'quvchilar foydalanadi.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <Link href="/library">
              <Button
                size="lg"
                className="hero-cta-button px-8 h-12 text-base font-semibold"
                data-testid="button-get-started"
              >
                <PlayCircle className="w-5 h-5 mr-2" />
                Boshlash
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </Link>
            <a href="#features">
              <Button
                size="lg"
                variant="outline"
                className="border-border/60 hover:border-primary/40 hover:bg-primary/5 px-8 h-12 text-base font-semibold transition-all duration-300"
                data-testid="button-learn-more"
              >
                <BookOpen className="w-5 h-5 mr-2" />
                Batafsil
              </Button>
            </a>
          </div>

          <div className="flex items-center gap-8 mt-4 flex-wrap justify-center">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Bepul foydalanish</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>AI bilan tahlil</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>So'zma-so'z tarjima</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function LanguageSection() {
  const [hoveredLang, setHoveredLang] = useState<string | null>(null);

  return (
    <section className="relative py-16 md:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-primary/[0.03] to-transparent" />
      <div className="relative max-w-5xl mx-auto px-4 md:px-6">
        <div className="flex flex-col items-center text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/15">
            <Globe className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Til tanlang</span>
          </div>
          <h2 className="text-2xl md:text-3xl font-bold mb-3" data-testid="text-language-title">
            Qaysi tilni o'rganmoqchisiz?
          </h2>
          <p className="text-muted-foreground max-w-lg">
            Tilni tanlang va video darsliklardan foydalaning
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
          {SUPPORTED_LANGUAGES.map((lang) => {
            const card = langCardData[lang.code] || langCardData.ar;
            const isHovered = hoveredLang === lang.code;

            return (
              <Link key={lang.code} href={`/library?lang=${lang.code}`}>
                <div
                  className="group relative cursor-pointer"
                  onMouseEnter={() => setHoveredLang(lang.code)}
                  onMouseLeave={() => setHoveredLang(null)}
                  data-testid={`hero-lang-card-${lang.code}`}
                >
                  <div
                    className={`
                      relative rounded-2xl overflow-hidden
                      transition-all duration-500 ease-out
                      bg-card/80 backdrop-blur-sm
                      border-2 ${isHovered ? 'border-primary/40 shadow-xl shadow-primary/10' : 'border-border/60 shadow-lg shadow-black/5'}
                    `}
                    style={{
                      transform: isHovered ? "translateY(-6px) scale(1.02)" : "translateY(0) scale(1)",
                      transition: "transform 0.4s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.4s ease, border-color 0.3s ease",
                    }}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-[0.06] transition-opacity duration-500`} />

                    <div className="relative p-6 md:p-8">
                      <div className="flex items-start gap-5">
                        <div
                          className={`
                            w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center
                            ${card.iconBg}
                            shadow-lg
                            transition-all duration-500
                            group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-xl
                          `}
                        >
                          <span className="text-2xl md:text-3xl font-bold text-white">
                            {card.emoji}
                          </span>
                        </div>

                        <div className="flex-1 min-w-0">
                          <h3 className="text-xl md:text-2xl font-bold mb-1 group-hover:text-primary transition-colors duration-300">
                            {lang.name}
                          </h3>
                          <p className="text-base text-muted-foreground/80 font-medium mb-1">
                            {lang.nameLocal}
                          </p>
                          <p className="text-sm text-muted-foreground/60 leading-relaxed">
                            {card.desc}
                          </p>
                        </div>
                      </div>

                      <div
                        className={`
                          flex items-center gap-2 mt-5 pt-4 border-t border-border/30
                          text-sm font-semibold transition-all duration-300
                          ${isHovered ? "text-primary" : "text-muted-foreground"}
                        `}
                      >
                        <span>Darslarni ko'rish</span>
                        <ArrowRight className={`w-4 h-4 transition-transform duration-300 ${isHovered ? "translate-x-1.5" : ""}`} />
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function StatsSection() {
  return (
    <section className="relative py-10 md:py-16">
      <div className="max-w-5xl mx-auto px-4 md:px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 md:gap-8">
          {[
            { value: 100, suffix: "+", label: "Video darsliklar" },
            { value: 2, suffix: "", label: "Til mavjud" },
            { value: 50, suffix: "+", label: "So'z tahlili" },
            { value: 10, suffix: "+", label: "Test savollari" },
          ].map((stat, i) => (
            <div
              key={i}
              className="flex flex-col items-center text-center p-4 rounded-2xl bg-card/50 border border-border/40 backdrop-blur-sm"
              data-testid={`stat-card-${i}`}
            >
              <AnimatedCounter target={stat.value} suffix={stat.suffix} />
              <span className="text-sm text-muted-foreground mt-1 font-medium">{stat.label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

const features = [
  {
    icon: Subtitles,
    title: "Video subtitle",
    description:
      "YouTube videolariga subtitrlar qo'shiladi va real vaqtda ko'rsatiladi.",
    gradient: "from-cyan-400 to-blue-500",
    bgGradient: "from-cyan-500/10 to-blue-500/10",
  },
  {
    icon: Languages,
    title: "So'zma-so'z tarjima",
    description:
      "Har bir so'zning tarjimasi va ma'nosi alohida ko'rsatiladi.",
    gradient: "from-violet-400 to-purple-500",
    bgGradient: "from-violet-500/10 to-purple-500/10",
  },
  {
    icon: AlignLeft,
    title: "Gapma-gap tarjima",
    description:
      "Har bir gap alohida tarjima qilinadi va grammatik tahlili beriladi.",
    gradient: "from-amber-400 to-orange-500",
    bgGradient: "from-amber-500/10 to-orange-500/10",
  },
  {
    icon: Search,
    title: "So'zlar tahlili",
    description:
      "So'zlarning lug'aviy shakli, qo'llanishi va kontekstdagi ma'nosi tahlil qilinadi.",
    gradient: "from-emerald-400 to-green-500",
    bgGradient: "from-emerald-500/10 to-green-500/10",
  },
  {
    icon: ClipboardCheck,
    title: "Testlar",
    description:
      "Dars mavzusi bo'yicha bilimingizni sinash uchun testlar tayyorlanadi.",
    gradient: "from-blue-400 to-indigo-500",
    bgGradient: "from-blue-500/10 to-indigo-500/10",
  },
  {
    icon: Layers,
    title: "Flashcardlar",
    description:
      "So'zlarni eslab qolish uchun flashcard kartochkalari yaratiladi.",
    gradient: "from-rose-400 to-pink-500",
    bgGradient: "from-rose-500/10 to-pink-500/10",
  },
];

function FeaturesSection() {
  return (
    <section id="features" className="relative max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-24">
      <div className="text-center mb-14">
        <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-accent/10 border border-accent/15">
          <Sparkles className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium text-accent">Xususiyatlar</span>
        </div>
        <h2
          className="text-3xl md:text-4xl font-bold mb-4"
          data-testid="text-features-title"
        >
          Nima uchun TUBE MENTOR?
        </h2>
        <p
          className="text-muted-foreground text-lg max-w-2xl mx-auto"
          data-testid="text-features-subtitle"
        >
          Video asosida tayyorlangan darsliklarning imkoniyatlari
        </p>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => (
          <Card
            key={index}
            className="group relative overflow-hidden bg-card/60 backdrop-blur-sm border-border/50 hover:border-primary/30 transition-all duration-500 hover:shadow-xl hover:shadow-primary/5 hover:-translate-y-1"
            data-testid={`card-feature-${index}`}
          >
            <CardContent className="p-6 md:p-7">
              <div
                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.bgGradient} flex items-center justify-center mb-5 group-hover:scale-110 transition-transform duration-500`}
              >
                <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${feature.gradient} flex items-center justify-center shadow-md`}>
                  <feature.icon className="w-4 h-4 text-white" />
                </div>
              </div>
              <h3 className="font-bold mb-2.5 group-hover:text-primary transition-colors duration-300 text-lg">
                {feature.title}
              </h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function HowItWorksSection() {
  const steps = [
    {
      icon: PlayCircle,
      title: "Video tanlang",
      description: "YouTube dan istalgan video havolasini kiriting",
      gradient: "from-cyan-400 to-blue-500",
    },
    {
      icon: Mic,
      title: "Audio tahlil",
      description: "AI yordamida ovoz transkripsiya qilinadi",
      gradient: "from-violet-400 to-purple-500",
    },
    {
      icon: Brain,
      title: "AI tahlil",
      description: "ChatGPT tarjima, so'zlar va testlarni yaratadi",
      gradient: "from-amber-400 to-orange-500",
    },
    {
      icon: FileText,
      title: "Tayyor darslik",
      description: "Professional darslik foydalanishga tayyor",
      gradient: "from-emerald-400 to-green-500",
    },
  ];

  return (
    <section className="relative py-16 md:py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-accent/[0.02] to-transparent" />
      <div className="relative max-w-6xl mx-auto px-4 md:px-6">
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 mb-4 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/15">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary">Qanday ishlaydi</span>
          </div>
          <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-how-it-works-title">
            4 oddiy qadamda darslik yarating
          </h2>
          <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
            YouTube videodan tayyor darslikgacha — tez va oson
          </p>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          {steps.map((step, i) => (
            <div key={i} className="relative" data-testid={`step-card-${i}`}>
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-12 left-[calc(50%+40px)] w-[calc(100%-40px)] h-[2px]">
                  <div className="h-full bg-gradient-to-r from-border to-border/30 relative">
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-primary/30" />
                  </div>
                </div>
              )}
              <div className="flex flex-col items-center text-center group">
                <div className="relative mb-5">
                  <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${step.gradient} flex items-center justify-center shadow-lg group-hover:scale-110 group-hover:shadow-xl transition-all duration-500`}>
                    <step.icon className="w-8 h-8 text-white" />
                  </div>
                  <div className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-card border-2 border-primary flex items-center justify-center shadow-md">
                    <span className="text-xs font-bold text-primary">{i + 1}</span>
                  </div>
                </div>
                <h3 className="font-bold text-lg mb-2 group-hover:text-primary transition-colors">
                  {step.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-[200px]">
                  {step.description}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="relative py-16 md:py-24 overflow-hidden">
      <div className="max-w-4xl mx-auto px-4 md:px-6">
        <div className="relative rounded-3xl overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-primary via-cyan-500 to-accent" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.15),transparent_50%)]" />
          <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full bg-white/5 blur-2xl" />

          <div className="relative px-8 md:px-14 py-14 md:py-16 text-center">
            <div className="inline-flex items-center gap-2 mb-6 px-4 py-2 rounded-full bg-white/15 border border-white/20">
              <Star className="w-4 h-4 text-white" />
              <span className="text-sm font-medium text-white/90">Hoziroq boshlang</span>
            </div>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-white mb-5 leading-tight">
              O'rganishni yangi<br className="hidden sm:block" /> bosqichga olib chiqing
            </h2>
            <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto leading-relaxed">
              YouTube videolaridan professional darsliklar yarating va til o'rganishni osonlashtiring
            </p>
            <Link href="/library">
              <Button
                size="lg"
                className="bg-white text-primary hover:bg-white/90 shadow-2xl shadow-black/20 px-10 h-12 text-base font-bold transition-all duration-300 hover:scale-105"
                data-testid="button-cta-library"
              >
                Kutubxonaga o'tish
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <PublicLayout>
      <HeroSection />
      <StatsSection />
      <LanguageSection />
      <FeaturesSection />
      <HowItWorksSection />
      <CTASection />
    </PublicLayout>
  );
}
