import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getLoginUrl } from "@/const";
import { motion } from "framer-motion";
import { 
  Trophy, 
  Target, 
  Users, 
  Waves, 
  ChevronRight,
  Zap,
  Medal,
  TrendingUp
} from "lucide-react";
import { useLocation, Redirect } from "wouter";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to dashboard if authenticated - use Redirect component instead of setLocation during render
  if (isAuthenticated && !loading) {
    return <Redirect to="/dashboard" />;
  }

  const features = [
    {
      icon: Zap,
      title: "Guadagna XP",
      description: "Ogni metro nuotato ti avvicina al prossimo livello. Da Novizio a Poseidone!",
    },
    {
      icon: Medal,
      title: "Sblocca Badge",
      description: "40+ badge da collezionare per distanza, costanza, acque libere e traguardi speciali.",
    },
    {
      icon: TrendingUp,
      title: "Traccia i Progressi",
      description: "Sincronizza automaticamente i tuoi allenamenti da Garmin Connect.",
    },
    {
      icon: Users,
      title: "Sfida i Compagni",
      description: "Classifica interna per vedere chi è il nuotatore più dedicato della società.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--navy)] via-[var(--navy-light)] to-[var(--azure)] opacity-95" />
        
        {/* Wave pattern overlay */}
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path fill="currentColor" className="text-white" d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
        </div>

        <div className="relative container py-20 md:py-32">
          <div className="flex flex-col items-center text-center">
            {/* Logo */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              className="mb-8"
            >
              <img 
                src="/oppidum-logo.png" 
                alt="Oppidum" 
                className="h-24 md:h-32 w-auto drop-shadow-2xl"
              />
            </motion.div>

            {/* Title */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-4xl md:text-6xl font-bold text-white mb-4"
            >
              SwimForge
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-xl md:text-2xl text-white/90 mb-2"
            >
              Forgia il tuo percorso, vasca dopo vasca
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-lg text-white/70 mb-8 max-w-2xl"
            >
              La piattaforma di gamification esclusiva per i nuotatori master di Oppidum.
              Trasforma ogni allenamento in un'avventura.
            </motion.p>

            {/* CTA Button */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
            >
              <Button
                size="lg"
                className="bg-[var(--gold)] hover:bg-[var(--gold-light)] text-[var(--navy)] font-semibold text-lg px-8 py-6 rounded-xl shadow-lg hover:shadow-xl transition-all"
                onClick={() => window.location.href = getLoginUrl()}
              >
                Inizia l'Avventura
                <ChevronRight className="ml-2 h-5 w-5" />
              </Button>
            </motion.div>

            {/* Stats preview */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="mt-12 grid grid-cols-3 gap-8 md:gap-16"
            >
              {[
                { value: "20", label: "Livelli" },
                { value: "40+", label: "Badge" },
                { value: "∞", label: "XP da guadagnare" },
              ].map((stat, i) => (
                <div key={i} className="text-center">
                  <div className="text-3xl md:text-4xl font-bold text-[var(--gold)]">{stat.value}</div>
                  <div className="text-sm text-white/70">{stat.label}</div>
                </div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="w-full h-16 md:h-24">
            <path fill="var(--background)" d="M0,64L80,69.3C160,75,320,85,480,80C640,75,800,53,960,48C1120,43,1280,53,1360,58.7L1440,64L1440,120L1360,120C1280,120,1120,120,960,120C800,120,640,120,480,120C320,120,160,120,80,120L0,120Z" />
          </svg>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-16 md:py-24">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Come Funziona
            </h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              SwimForge trasforma i tuoi allenamenti in un'esperienza di gioco coinvolgente
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="h-full card-hover border-border/50 bg-card">
                  <CardContent className="p-6">
                    <div className="w-12 h-12 rounded-xl bg-[var(--azure)]/10 flex items-center justify-center mb-4">
                      <feature.icon className="h-6 w-6 text-[var(--azure)]" />
                    </div>
                    <h3 className="font-semibold text-lg mb-2 text-card-foreground">{feature.title}</h3>
                    <p className="text-muted-foreground text-sm">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Levels Preview Section */}
      <section className="py-16 bg-muted/30">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Il Tuo Percorso
            </h2>
            <p className="text-muted-foreground text-lg">
              Da Novizio a Poseidone: 20 livelli di crescita
            </p>
          </motion.div>

          <div className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto">
            {[
              { level: 1, title: "Novizio", color: "#9ca3af" },
              { level: 5, title: "Atleta", color: "#3b82f6" },
              { level: 10, title: "Gran Maestro", color: "#f59e0b" },
              { level: 15, title: "Mito", color: "#06b6d4" },
              { level: 20, title: "Poseidone", color: "#1e40af" },
            ].map((level, index) => (
              <motion.div
                key={level.level}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-card border border-border shadow-sm"
              >
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                  style={{ backgroundColor: level.color }}
                >
                  {level.level}
                </div>
                <span className="font-medium text-card-foreground">{level.title}</span>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <Waves className="h-12 w-12 text-[var(--azure)] mx-auto mb-6" />
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Pronto a Tuffarti?
            </h2>
            <p className="text-muted-foreground text-lg mb-8 max-w-xl mx-auto">
              Unisciti ai tuoi compagni di squadra e inizia a guadagnare XP oggi stesso.
            </p>
            <Button
              size="lg"
              className="bg-[var(--navy)] hover:bg-[var(--navy-light)] text-white font-semibold text-lg px-8 py-6 rounded-xl"
              onClick={() => window.location.href = getLoginUrl()}
            >
              Accedi con Manus
              <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 border-t border-border">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img src="/oppidum-logo.png" alt="Oppidum" className="h-8 w-auto" />
              <span className="text-sm text-muted-foreground">
                SwimForge © {new Date().getFullYear()} - Società Sportiva Oppidum
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              Nuota. Guadagna. Conquista.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
