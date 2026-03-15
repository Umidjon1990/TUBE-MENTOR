import { useState } from "react";
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
} from "lucide-react";
import { Link } from "wouter";
import PublicLayout from "@/components/layouts/public-layout";
import { SUPPORTED_LANGUAGES } from "@shared/languages";

const langCardData: Record<string, { emoji: string; gradient: string; glow: string; shadow: string; bgPattern: string; desc: string }> = {
  ar: {
    emoji: "ع",
    gradient: "from-emerald-500 via-teal-500 to-cyan-500",
    glow: "shadow-emerald-500/30",
    shadow: "hover:shadow-emerald-500/40",
    bgPattern: "from-emerald-500/5 via-teal-500/5 to-cyan-500/5",
    desc: "Harakat bilan to'liq arab tili darslari",
  },
  en: {
    emoji: "En",
    gradient: "from-blue-500 via-indigo-500 to-violet-500",
    glow: "shadow-blue-500/30",
    shadow: "hover:shadow-blue-500/40",
    bgPattern: "from-blue-500/5 via-indigo-500/5 to-violet-500/5",
    desc: "Ingliz tili darslari va so'z tahlili",
  },
};

function HeroSection() {
  const [hoveredLang, setHoveredLang] = useState<string | null>(null);

  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px]" />
      <div className="relative max-w-6xl mx-auto px-4 md:px-6 py-16 md:py-28">
        <div className="flex flex-col items-center text-center gap-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border-primary/20 neon-glow-sm">
            <Sparkles className="w-4 h-4 text-primary" />
            <span
              className="text-sm font-medium text-primary"
              data-testid="text-badge-ai"
            >
              VIDEO ASOSIDA DARSLIKLAR
            </span>
          </div>

          <h1
            className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight max-w-4xl leading-[1.1]"
            data-testid="text-hero-title"
          >
            <span className="text-foreground">YouTube videolaridan</span>
            <br />
            <span className="bg-gradient-to-r from-primary via-cyan-400 to-accent bg-clip-text text-transparent neon-text text-center">
              MUKAMMAL DARSLIK
            </span>
          </h1>

          <p
            className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed"
            data-testid="text-hero-description"
          >
            Istalgan YouTube videosidan professional darsliklar tayyorlang.
            O'qituvchi yaratadi — o'quvchilar foydalanadi.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-2">
            <Link href="/library">
              <Button
                size="lg"
                className="bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 text-primary-foreground shadow-lg shadow-primary/25 px-8"
                data-testid="button-get-started"
              >
                <PlayCircle className="w-5 h-5 mr-2" />
                Boshlash
              </Button>
            </Link>
          </div>

          <div className="w-full max-w-3xl mt-8">
            <div className="flex items-center justify-center gap-2 mb-6">
              <Languages className="w-5 h-5 text-primary" />
              <h2 className="text-lg md:text-xl font-semibold">Tilni tanlang va dars yarating</h2>
            </div>

            <div className="grid sm:grid-cols-2 gap-5 px-2">
              {SUPPORTED_LANGUAGES.map((lang) => {
                const card = langCardData[lang.code] || langCardData.ar;
                const isHovered = hoveredLang === lang.code;

                return (
                  <Link key={lang.code} href={`/lessons/create?lang=${lang.code}`}>
                    <div
                      className="group relative cursor-pointer"
                      style={{ perspective: "1000px" }}
                      onMouseEnter={() => setHoveredLang(lang.code)}
                      onMouseLeave={() => setHoveredLang(null)}
                      data-testid={`hero-lang-card-${lang.code}`}
                    >
                      <div
                        className={`
                          relative rounded-2xl border border-white/10 overflow-hidden
                          transition-all duration-500 ease-out
                          bg-gradient-to-br ${card.bgPattern}
                          backdrop-blur-xl
                          shadow-2xl ${card.glow} ${card.shadow}
                          hover:shadow-3xl
                        `}
                        style={{
                          transform: isHovered
                            ? "rotateY(-5deg) rotateX(5deg) translateY(-8px) scale(1.02)"
                            : "rotateY(0deg) rotateX(0deg) translateY(0px) scale(1)",
                          transformStyle: "preserve-3d",
                          transition: "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), box-shadow 0.5s ease",
                        }}
                      >
                        <div className={`absolute inset-0 bg-gradient-to-br ${card.gradient} opacity-0 group-hover:opacity-[0.07] transition-opacity duration-500`} />

                        <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent" />

                        <div
                          className="absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl transition-opacity duration-700"
                          style={{
                            background: `radial-gradient(circle, ${lang.code === "ar" ? "rgba(16,185,129,0.15)" : "rgba(99,102,241,0.15)"}, transparent)`,
                            opacity: isHovered ? 1 : 0.3,
                          }}
                        />

                        <div className="relative p-6 md:p-8" style={{ transformStyle: "preserve-3d" }}>
                          <div className="flex items-start gap-5">
                            <div
                              className={`
                                w-16 h-16 md:w-20 md:h-20 rounded-2xl flex items-center justify-center
                                bg-gradient-to-br ${card.gradient}
                                shadow-lg ${card.glow}
                                transition-all duration-500
                                group-hover:scale-110 group-hover:rotate-3
                              `}
                              style={{
                                transform: isHovered ? "translateZ(30px)" : "translateZ(0px)",
                                transition: "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)",
                              }}
                            >
                              <span className="text-2xl md:text-3xl font-bold text-white">
                                {card.emoji}
                              </span>
                            </div>

                            <div className="flex-1 min-w-0" style={{
                              transform: isHovered ? "translateZ(20px)" : "translateZ(0px)",
                              transition: "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1)",
                            }}>
                              <h3 className="text-xl md:text-2xl font-bold mb-1 group-hover:text-white transition-colors">
                                {lang.name}
                              </h3>
                              <p className="text-base text-muted-foreground/80 font-medium mb-1">
                                {lang.nameLocal}
                              </p>
                              <p className="text-xs text-muted-foreground/60 leading-relaxed">
                                {card.desc}
                              </p>
                            </div>
                          </div>

                          <div
                            className={`
                              flex items-center gap-2 mt-5 pt-4 border-t border-white/5
                              text-sm font-medium transition-all duration-300
                              ${isHovered ? "text-white" : "text-muted-foreground"}
                            `}
                            style={{
                              transform: isHovered ? "translateZ(15px)" : "translateZ(0px)",
                              transition: "transform 0.5s cubic-bezier(0.23, 1, 0.32, 1), color 0.3s ease",
                            }}
                          >
                            <span>Dars yaratish</span>
                            <ArrowRight className={`w-4 h-4 transition-transform duration-300 ${isHovered ? "translate-x-1" : ""}`} />
                          </div>
                        </div>

                        <div
                          className="absolute inset-0 rounded-2xl pointer-events-none"
                          style={{
                            background: isHovered
                              ? `radial-gradient(ellipse at 30% 20%, ${lang.code === "ar" ? "rgba(16,185,129,0.08)" : "rgba(99,102,241,0.08)"}, transparent 60%)`
                              : "none",
                            transition: "background 0.5s ease",
                          }}
                        />
                      </div>

                      <div
                        className="absolute -bottom-2 left-4 right-4 h-8 rounded-2xl blur-xl transition-opacity duration-500"
                        style={{
                          background: `linear-gradient(to right, ${lang.code === "ar" ? "rgba(16,185,129,0.2)" : "rgba(99,102,241,0.2)"}, transparent)`,
                          opacity: isHovered ? 1 : 0,
                        }}
                      />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
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
    gradient: "from-primary/10 to-cyan-500/10",
    iconColor: "text-primary",
  },
  {
    icon: Languages,
    title: "So'zma-so'z tarjima",
    description:
      "Har bir so'zning tarjimasi va ma'nosi alohida ko'rsatiladi.",
    gradient: "from-accent/10 to-violet-500/10",
    iconColor: "text-accent",
  },
  {
    icon: AlignLeft,
    title: "Gapma-gap tarjima",
    description:
      "Har bir gap alohida tarjima qilinadi va grammatik tahlili beriladi.",
    gradient: "from-amber-500/10 to-orange-500/10",
    iconColor: "text-amber-500",
  },
  {
    icon: Search,
    title: "So'zlar tahlili",
    description:
      "So'zlarning lug'aviy shakli, qo'llanishi va kontekstdagi ma'nosi tahlil qilinadi.",
    gradient: "from-emerald-500/10 to-green-500/10",
    iconColor: "text-emerald-500",
  },
  {
    icon: ClipboardCheck,
    title: "Testlar",
    description:
      "Dars mavzusi bo'yicha bilimingizni sinash uchun testlar tayyorlanadi.",
    gradient: "from-blue-500/10 to-indigo-500/10",
    iconColor: "text-blue-500",
  },
  {
    icon: Layers,
    title: "Flashcardlar",
    description:
      "So'zlarni eslab qolish uchun flashcard kartochkalari yaratiladi.",
    gradient: "from-rose-500/10 to-pink-500/10",
    iconColor: "text-rose-500",
  },
];

function FeaturesSection() {
  return (
    <section id="features" className="max-w-6xl mx-auto px-4 md:px-6 py-12 md:py-24">
      <div className="text-center mb-16">
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
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {features.map((feature, index) => (
          <Card
            key={index}
            className="glass border-border/50 hover:border-primary/30 transition-all duration-300 group"
            data-testid={`card-feature-${index}`}
          >
            <CardContent className="p-6">
              <div
                className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4`}
              >
                <feature.icon className={`w-5 h-5 ${feature.iconColor}`} />
              </div>
              <h3 className="font-semibold mb-2 group-hover:text-primary transition-colors text-[22px] text-center">
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

export default function Home() {
  return (
    <PublicLayout>
      <HeroSection />
      <FeaturesSection />
    </PublicLayout>
  );
}
