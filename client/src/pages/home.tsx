import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, PlayCircle, Brain, BookOpen, Sparkles, ArrowRight, Zap, Users, BarChart3 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";

function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-primary/10 dark:from-primary/10 dark:via-transparent dark:to-primary/5" />
      <div className="absolute top-20 left-10 w-72 h-72 bg-primary/5 rounded-full blur-3xl" />
      <div className="absolute bottom-10 right-10 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />

      <div className="relative max-w-6xl mx-auto px-6 py-24 md:py-32">
        <div className="flex flex-col items-center text-center gap-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 dark:bg-primary/20">
            <Sparkles className="w-4 h-4 text-primary" />
            <span className="text-sm font-medium text-primary" data-testid="text-badge-ai">
              Sun'iy intellekt bilan ishlaydi
            </span>
          </div>

          <h1
            className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight max-w-4xl"
            data-testid="text-hero-title"
          >
            <span className="text-foreground">YouTube videolaridan</span>
            <br />
            <span className="bg-gradient-to-r from-primary to-blue-600 dark:to-blue-400 bg-clip-text text-transparent">
              aqlli darslar
            </span>
            <br />
            <span className="text-foreground">yarating</span>
          </h1>

          <p
            className="text-lg md:text-xl text-muted-foreground max-w-2xl leading-relaxed"
            data-testid="text-hero-description"
          >
            Tube Mentor AI yordamida istalgan YouTube videosini interaktiv darslarga aylantiring.
            Sun'iy intellekt sizga o'rganishni osonlashtiradi.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 mt-4">
            <Link href="/login">
              <Button size="lg" data-testid="button-get-started">
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
    icon: Brain,
    title: "AI tahlili",
    description: "Sun'iy intellekt video mazmunini chuqur tahlil qiladi va asosiy fikrlarni ajratib beradi.",
  },
  {
    icon: BookOpen,
    title: "Interaktiv darslar",
    description: "Videolardan avtomatik ravishda tuzilgan darslar va mashqlar yaratiladi.",
  },
  {
    icon: Zap,
    title: "Tezkor natija",
    description: "Bir necha daqiqada videoni to'liq darsga aylantiring.",
  },
  {
    icon: Users,
    title: "Hamkorlikda o'rganish",
    description: "Boshqa o'quvchilar bilan birga o'rganing va tajriba almashing.",
  },
  {
    icon: BarChart3,
    title: "Rivojlanish tahlili",
    description: "O'z bilimlaringiz va rivojlanishingizni kuzatib boring.",
  },
  {
    icon: GraduationCap,
    title: "Sertifikatlar",
    description: "Kurslarni tugatganingizda sertifikat oling va yutuqlaringizni namoyish qiling.",
  },
];

function FeaturesSection() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-features-title">
          Nima uchun Tube Mentor AI?
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto" data-testid="text-features-subtitle">
          Zamonaviy texnologiyalar yordamida o'rganishni yangi bosqichga olib chiqing
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {features.map((feature, index) => (
          <Card key={index} className="hover-elevate group" data-testid={`card-feature-${index}`}>
            <CardContent className="p-6">
              <div className="w-12 h-12 rounded-md bg-primary/10 dark:bg-primary/20 flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{feature.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

function StatsSection() {
  return (
    <section className="bg-muted/40 dark:bg-muted/20">
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: "10K+", label: "Foydalanuvchilar" },
            { value: "50K+", label: "Yaratilgan darslar" },
            { value: "500+", label: "Video tahlillari" },
            { value: "98%", label: "Qoniqish darajasi" },
          ].map((stat, index) => (
            <div key={index} className="text-center" data-testid={`stat-${index}`}>
              <div className="text-3xl md:text-4xl font-bold text-primary mb-1">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section className="max-w-6xl mx-auto px-6 py-20">
      <div className="relative rounded-md bg-gradient-to-r from-primary to-blue-600 dark:from-primary dark:to-blue-500 p-12 md:p-16 text-center">
        <div className="absolute inset-0 rounded-md bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNhKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-50" />
        <div className="relative">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" data-testid="text-cta-title">
            Hoziroq boshlang!
          </h2>
          <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto" data-testid="text-cta-description">
            Tube Mentor AI bilan o'rganishni yangi darajaga olib chiqing.
            Bepul ro'yxatdan o'ting va birinchi darsingizni yarating.
          </p>
          <Link href="/login">
            <Button size="lg" variant="secondary" data-testid="button-cta-login">
              Tizimga kirish
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t">
      <div className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="text-lg font-bold">Tube Mentor AI</span>
            </div>
            <p className="text-sm text-muted-foreground max-w-sm leading-relaxed">
              Sun'iy intellekt yordamida YouTube videolaridan interaktiv darslar yarating va
              o'rganish jarayonini samaraliroq qiling.
            </p>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-sm">Platforma</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Xususiyatlar</li>
              <li>Narxlar</li>
              <li>Yordam</li>
            </ul>
          </div>
          <div>
            <h4 className="font-semibold mb-3 text-sm">Kompaniya</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>Biz haqimizda</li>
              <li>Blog</li>
              <li>Aloqa</li>
            </ul>
          </div>
        </div>
        <div className="border-t mt-8 pt-8 text-center">
          <p className="text-sm text-muted-foreground" data-testid="text-copyright">
            &copy; 2026 Tube Mentor AI. Barcha huquqlar himoyalangan.
          </p>
        </div>
      </div>
    </footer>
  );
}

export default function Home() {
  const healthQuery = useQuery({
    queryKey: ["/api/health"],
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
              <GraduationCap className="w-5 h-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-bold" data-testid="text-brand-name">Tube Mentor AI</span>
          </div>
          <nav className="hidden md:flex items-center gap-6">
            <span className="text-sm text-muted-foreground cursor-pointer" data-testid="link-features">Xususiyatlar</span>
            <span className="text-sm text-muted-foreground cursor-pointer" data-testid="link-pricing">Narxlar</span>
            <span className="text-sm text-muted-foreground cursor-pointer" data-testid="link-about">Biz haqimizda</span>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="outline" size="sm" data-testid="button-login">
                Kirish
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <HeroSection />
        <FeaturesSection />
        <StatsSection />
        <CTASection />
      </main>

      <Footer />
    </div>
  );
}
