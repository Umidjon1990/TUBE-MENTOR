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
} from "lucide-react";
import { Link } from "wouter";
import PublicLayout from "@/components/layouts/public-layout";

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 gradient-mesh" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/5 rounded-full blur-[100px]" />
      <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-36">
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

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
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
    <section id="features" className="max-w-6xl mx-auto px-6 py-24">
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
