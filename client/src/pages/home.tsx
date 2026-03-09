import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { GraduationCap, PlayCircle, Brain, BookOpen, Sparkles, ArrowRight, Zap, Users, BarChart3 } from "lucide-react";
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
            <span className="text-sm font-medium text-primary" data-testid="text-badge-ai">
              Sun'iy intellekt bilan ishlaydi
            </span>
          </div>

          <h1
            className="text-4xl md:text-6xl lg:text-7xl font-bold tracking-tight max-w-4xl leading-[1.1]"
            data-testid="text-hero-title"
          >
            <span className="text-foreground">YouTube videolaridan</span>
            <br />
            <span className="bg-gradient-to-r from-primary via-cyan-400 to-accent bg-clip-text text-transparent neon-text">
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
              <Button size="lg" className="bg-gradient-to-r from-primary to-cyan-500 hover:from-primary/90 hover:to-cyan-500/90 text-primary-foreground shadow-lg shadow-primary/25 px-8" data-testid="button-get-started">
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
    gradient: "from-primary/10 to-cyan-500/10",
    iconColor: "text-primary",
  },
  {
    icon: BookOpen,
    title: "Interaktiv darslar",
    description: "Videolardan avtomatik ravishda tuzilgan darslar va mashqlar yaratiladi.",
    gradient: "from-accent/10 to-violet-500/10",
    iconColor: "text-accent",
  },
  {
    icon: Zap,
    title: "Tezkor natija",
    description: "Bir necha daqiqada videoni to'liq darsga aylantiring.",
    gradient: "from-amber-500/10 to-orange-500/10",
    iconColor: "text-amber-500",
  },
  {
    icon: Users,
    title: "Hamkorlikda o'rganish",
    description: "Boshqa o'quvchilar bilan birga o'rganing va tajriba almashing.",
    gradient: "from-emerald-500/10 to-green-500/10",
    iconColor: "text-emerald-500",
  },
  {
    icon: BarChart3,
    title: "Rivojlanish tahlili",
    description: "O'z bilimlaringiz va rivojlanishingizni kuzatib boring.",
    gradient: "from-blue-500/10 to-indigo-500/10",
    iconColor: "text-blue-500",
  },
  {
    icon: GraduationCap,
    title: "Sertifikatlar",
    description: "Kurslarni tugatganingizda sertifikat oling va yutuqlaringizni namoyish qiling.",
    gradient: "from-rose-500/10 to-pink-500/10",
    iconColor: "text-rose-500",
  },
];

function FeaturesSection() {
  return (
    <section id="features" className="max-w-6xl mx-auto px-6 py-24">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-4xl font-bold mb-4" data-testid="text-features-title">
          Nima uchun Tube Mentor AI?
        </h2>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto" data-testid="text-features-subtitle">
          Zamonaviy texnologiyalar yordamida o'rganishni yangi bosqichga olib chiqing
        </p>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
        {features.map((feature, index) => (
          <Card key={index} className="glass border-border/50 hover:border-primary/30 transition-all duration-300 group" data-testid={`card-feature-${index}`}>
            <CardContent className="p-6">
              <div className={`w-11 h-11 rounded-xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-4`}>
                <feature.icon className={`w-5 h-5 ${feature.iconColor}`} />
              </div>
              <h3 className="text-base font-semibold mb-2 group-hover:text-primary transition-colors">{feature.title}</h3>
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
    <section id="stats" className="relative">
      <div className="absolute inset-0 bg-gradient-to-r from-primary/5 via-transparent to-accent/5" />
      <div className="relative max-w-6xl mx-auto px-6 py-20">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: "10K+", label: "Foydalanuvchilar" },
            { value: "50K+", label: "Yaratilgan darslar" },
            { value: "500+", label: "Video tahlillari" },
            { value: "98%", label: "Qoniqish darajasi" },
          ].map((stat, index) => (
            <div key={index} className="text-center" data-testid={`stat-${index}`}>
              <div className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-primary to-cyan-400 bg-clip-text text-transparent mb-1">
                {stat.value}
              </div>
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
    <section id="cta" className="max-w-6xl mx-auto px-6 py-24">
      <div className="relative rounded-2xl overflow-hidden neon-glow">
        <div className="absolute inset-0 bg-gradient-to-r from-primary/80 to-accent/80" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImEiIHBhdHRlcm5Vbml0cz0idXNlclNwYWNlT25Vc2UiIHdpZHRoPSIyMCIgaGVpZ2h0PSIyMCI+PGNpcmNsZSBjeD0iMTAiIGN5PSIxMCIgcj0iMSIgZmlsbD0icmdiYSgyNTUsMjU1LDI1NSwwLjA4KSIvPjwvcGF0dGVybj48L2RlZnM+PHJlY3QgZmlsbD0idXJsKCNhKSIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIvPjwvc3ZnPg==')] opacity-50" />
        <div className="relative p-12 md:p-16 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4" data-testid="text-cta-title">
            Hoziroq boshlang!
          </h2>
          <p className="text-white/80 text-lg mb-8 max-w-xl mx-auto" data-testid="text-cta-description">
            Tube Mentor AI bilan o'rganishni yangi darajaga olib chiqing.
            Bepul ro'yxatdan o'ting va birinchi darsingizni yarating.
          </p>
          <Link href="/login">
            <Button size="lg" variant="secondary" className="shadow-lg px-8" data-testid="button-cta-login">
              Tizimga kirish
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  return (
    <PublicLayout>
      <HeroSection />
      <FeaturesSection />
      <StatsSection />
      <CTASection />
    </PublicLayout>
  );
}
