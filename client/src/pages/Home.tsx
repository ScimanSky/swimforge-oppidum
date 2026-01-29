import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Link, useLocation, Redirect } from "wouter";
import { motion } from "framer-motion";
import { 
  Trophy, 
  Target, 
  Users, 
  Waves, 
  ChevronRight,
  Zap,
  Medal,
  TrendingUp,
  Sparkles,
  Award,
  Activity,
  Brain,
  MessageSquare,
  BarChart3
} from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, setLocation] = useLocation();

  // Redirect to dashboard if authenticated
  if (isAuthenticated && !loading) {
    return <Redirect to="/dashboard" />;
  }

  const features = [
    {
      icon: Zap,
      title: "Guadagna XP",
      description: "Ogni metro nuotato ti avvicina al prossimo livello. Da Novizio a Poseidone!",
      gradient: "from-yellow-500/10 to-orange-500/10",
      iconColor: "text-yellow-500",
      image: "/images/young_beginner_swimmer.webp"
    },
    {
      icon: Medal,
      title: "Sblocca Badge",
      description: "40+ badge da collezionare per distanza, costanza, acque libere e traguardi speciali.",
      gradient: "from-purple-500/10 to-pink-500/10",
      iconColor: "text-purple-500",
      image: "/images/swimmer_female_portrait.webp"
    },
    {
      icon: TrendingUp,
      title: "Traccia i Progressi",
      description: "Sincronizza automaticamente i tuoi allenamenti da Garmin Connect.",
      gradient: "from-cyan-500/10 to-blue-500/10",
      iconColor: "text-cyan-500",
      image: "/images/swimmer_smartwatch_tech.webp"
    },
    {
      icon: Users,
      title: "Sfida i Compagni",
      description: "Classifica interna per vedere chi è il nuotatore più dedicato della società.",
      gradient: "from-green-500/10 to-emerald-500/10",
      iconColor: "text-green-500",
      image: "/images/swimmers_team_community.webp"
    },
  ];

  const benefits = [
    {
      icon: Trophy,
      title: "Sistema di Livelli",
      description: "20 livelli progressivi che premiano la tua dedizione",
      image: "/images/levels_progression.webp"
    },
    {
      icon: Sparkles,
      title: "Challenge Mensili",
      description: "Obiettivi mensili per mantenere alta la motivazione",
      image: "/images/monthly_challenge_target.webp"
    },
    {
      icon: Award,
      title: "Riconoscimenti",
      description: "Badge esclusivi per traguardi speciali e milestone",
      image: "/images/awards_trophies.webp"
    },
    {
      icon: Activity,
      title: "Statistiche Dettagliate",
      description: "Analisi approfondite dei tuoi progressi nel tempo",
      image: "/images/detailed_stats_graph.webp"
    }
  ];

  return (
    <div className="min-h-screen bg-background overflow-x-hidden font-sans">
      {/* Hero Section */}
      <section className="relative overflow-hidden min-h-screen flex items-center">
        {/* Animated gradient background */}
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--navy)] via-[var(--navy-light)] to-[var(--azure)] opacity-95" />
        
        {/* Hero Background Image */}
        <div className="absolute inset-0 opacity-20">
          <img 
            src="/images/swimmer_action_hero.webp" 
            alt="Swimmer in action" 
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--navy)]/50 to-[var(--navy)]" />
        </div>
        
        {/* Animated particles effect */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute w-2 h-2 bg-white/20 rounded-full"
              style={{
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
              }}
              animate={{
                y: [0, -30, 0],
                opacity: [0.2, 0.5, 0.2],
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                repeat: Infinity,
                delay: Math.random() * 2,
              }}
            />
          ))}
        </div>
        
        {/* Wave pattern overlay */}
        <div className="absolute inset-0 opacity-10">
          <svg className="w-full h-full" viewBox="0 0 1440 320" preserveAspectRatio="none">
            <path fill="currentColor" className="text-white" d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
          </svg>
        </div>

        <div className="relative container py-20 md:py-32">
          <div className="flex flex-col items-center text-center">
            {/* Logo with pulse animation */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mb-6 relative"
            >
              <motion.div
                className="absolute inset-0 bg-cyan-500/20 rounded-full blur-2xl"
                animate={{
                  scale: [1, 1.2, 1],
                  opacity: [0.3, 0.5, 0.3],
                }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                }}
              />
              <div className="h-32 w-32 md:h-48 md:w-48 rounded-full bg-white flex items-center justify-center relative z-10 shadow-[0_0_40px_rgba(14,165,233,0.4)] border-4 border-white/10 overflow-hidden">
                <img 
                  src="/swimforge-logo.png" 
                  alt="SwimForge Logo" 
                  className="w-full h-full object-contain p-2"
                />
              </div>
            </motion.div>

            {/* Title with gradient */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-5xl md:text-7xl font-bold text-white mb-4 bg-gradient-to-r from-white via-cyan-200 to-white bg-clip-text text-transparent drop-shadow-lg"
            >
              SwimForge
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="text-xl md:text-3xl text-white/90 mb-3 font-semibold"
            >
              Forgia il tuo percorso, vasca dopo vasca
            </motion.p>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.4 }}
              className="text-lg md:text-xl text-white/70 mb-10 max-w-2xl leading-relaxed"
            >
              La piattaforma esclusiva per nuotatori di tutte le età.
              Trasforma ogni allenamento in un'avventura epica.
            </motion.p>

            {/* CTA Button with enhanced animation */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.5 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link href="/auth">
                <Button
                  size="lg"
                  className="bg-[var(--gold)] hover:bg-[var(--gold-light)] text-[var(--navy)] font-bold text-lg px-10 py-7 rounded-2xl shadow-2xl hover:shadow-[0_0_30px_rgba(251,191,36,0.5)] transition-all relative overflow-hidden group border-none"
                >
                  <span className="relative z-10 flex items-center">
                    Inizia l'Avventura
                    <ChevronRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </span>
                  <motion.div
                    className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-orange-400"
                    initial={{ x: "-100%" }}
                    whileHover={{ x: "100%" }}
                    transition={{ duration: 0.6 }}
                  />
                </Button>
              </Link>
            </motion.div>

            {/* Enhanced stats preview */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.7 }}
              className="mt-16 grid grid-cols-3 gap-8 md:gap-20"
            >
              {[
                { value: "20", label: "Livelli", icon: Trophy },
                { value: "40+", label: "Badge", icon: Medal },
                { value: "∞", label: "XP da guadagnare", icon: Zap },
              ].map((stat, i) => (
                <motion.div 
                  key={i} 
                  className="text-center"
                  whileHover={{ scale: 1.1 }}
                  transition={{ type: "spring", stiffness: 300 }}
                >
                  <div className="flex justify-center mb-2">
                    <stat.icon className="h-6 w-6 md:h-8 md:w-8 text-[var(--gold)]" />
                  </div>
                  <div className="text-4xl md:text-5xl font-bold text-[var(--gold)] mb-1">{stat.value}</div>
                  <div className="text-sm md:text-base text-white/70 font-medium">{stat.label}</div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>

        {/* Bottom wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 120" preserveAspectRatio="none" className="w-full h-16 md:h-24 text-background">
            <path fill="currentColor" d="M0,64L80,69.3C160,75,320,85,480,80C640,75,800,53,960,48C1120,43,1280,53,1360,58.7L1440,64L1440,120L1360,120C1280,120,1120,120,960,120C800,120,640,120,480,120C320,120,160,120,80,120L0,120Z" />
          </svg>
        </div>
      </section>

      {/* Features Section - Enhanced with Images */}
      <section className="py-20 md:py-28 relative z-10">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <motion.div
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--azure)]/10 border border-[var(--azure)]/20 mb-6 backdrop-blur-sm"
            >
              <Sparkles className="h-4 w-4 text-[var(--azure)]" />
              <span className="text-sm font-semibold text-[var(--azure)]">Funzionalità Principali</span>
            </motion.div>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Come Funziona
            </h2>
            <p className="text-muted-foreground text-lg md:text-xl max-w-3xl mx-auto">
              SwimForge trasforma i tuoi allenamenti in un'esperienza di gioco coinvolgente e motivante
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
                whileHover={{ y: -8 }}
              >
                <Card className={`h-full card-hover border-border/50 bg-gradient-to-br ${feature.gradient} backdrop-blur-sm relative overflow-hidden group cursor-pointer`}>
                  {/* Image Background with Parallax */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-25 transition-opacity duration-500 ease-out overflow-hidden">
                    <motion.img 
                      src={feature.image} 
                      alt={feature.title}
                      className="w-[120%] h-[120%] object-cover grayscale group-hover:grayscale-0 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      whileHover={{ scale: 1.1, x: "-50%", y: "-50%" }}
                      transition={{ duration: 8, ease: "linear" }}
                    />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <CardContent className="p-6 relative z-10 flex flex-col h-full">
                    <motion.div 
                      className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-5 shadow-lg border border-white/5 relative z-10`}
                      whileHover={{ rotate: 360, scale: 1.1 }}
                      transition={{ duration: 0.6, type: "spring" }}
                    >
                      <feature.icon className={`h-7 w-7 ${feature.iconColor}`} />
                    </motion.div>
                    <h3 className="font-bold text-xl mb-3 text-card-foreground group-hover:text-[var(--azure)] transition-colors">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed group-hover:text-foreground/90 transition-colors">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section - NEW */}
      <section className="py-20 bg-gradient-to-b from-muted/30 to-background">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Perché SwimForge?
            </h2>
            <p className="text-muted-foreground text-lg md:text-xl max-w-3xl mx-auto">
              Un sistema completo per monitorare, migliorare e celebrare i tuoi progressi
            </p>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto">
            {benefits.map((benefit, index) => (
              <motion.div
                key={benefit.title}
                initial={{ opacity: 0, x: index % 2 === 0 ? -20 : 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
              >
                <Card className="border-border/50 bg-card/50 backdrop-blur-sm hover:bg-card/80 transition-all h-full relative overflow-hidden group cursor-pointer">
                  {/* Image Background with Parallax */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-30 transition-opacity duration-500 ease-out overflow-hidden">
                    <motion.img 
                      src={benefit.image} 
                      alt={benefit.title}
                      className="w-[120%] h-[120%] object-cover grayscale group-hover:grayscale-0 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      whileHover={{ scale: 1.1, x: "-50%", y: "-50%" }}
                      transition={{ duration: 8, ease: "linear" }}
                    />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-r from-card/95 via-card/80 to-card/60 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  
                  <CardContent className="p-6 flex items-start gap-4 relative z-10">
                    <motion.div 
                      className="w-12 h-12 rounded-xl bg-[var(--azure)]/10 flex items-center justify-center flex-shrink-0 group-hover:bg-[var(--azure)]/20 transition-colors"
                      whileHover={{ rotate: [0, -10, 10, 0], scale: 1.1 }}
                      transition={{ duration: 0.5 }}
                    >
                      <benefit.icon className="h-6 w-6 text-[var(--azure)] group-hover:text-cyan-300 transition-colors" />
                    </motion.div>
                    <div>
                      <h3 className="font-bold text-lg mb-2 text-card-foreground group-hover:text-[var(--azure)] transition-colors">{benefit.title}</h3>
                      <p className="text-muted-foreground group-hover:text-foreground/90 transition-colors">{benefit.description}</p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Features Section - NEW with Coach Image */}
      <section className="py-20 bg-gradient-to-b from-background to-muted/30 relative overflow-hidden">
        {/* Abstract tech background elements */}
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-5 pointer-events-none">
          <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="none">
            <path d="M0,0 L100,0 L100,100 L50,100 Z" fill="url(#grid-pattern)" />
            <defs>
              <pattern id="grid-pattern" width="10" height="10" patternUnits="userSpaceOnUse">
                <path d="M 10 0 L 0 0 0 10" fill="none" stroke="currentColor" strokeWidth="0.5" />
              </pattern>
            </defs>
          </svg>
        </div>

        <div className="container relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <motion.div
              initial={{ scale: 0 }}
              whileInView={{ scale: 1 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 200, delay: 0.2 }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 mb-6"
            >
              <Brain className="h-4 w-4 text-purple-500" />
              <span className="text-sm font-semibold text-purple-500">Intelligenza Artificiale</span>
            </motion.div>
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Il Tuo Coach AI Personale
            </h2>
            <p className="text-muted-foreground text-lg md:text-xl max-w-3xl mx-auto">
              Analisi avanzate e consigli personalizzati per migliorare le tue performance
            </p>
          </motion.div>

          <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {[
              {
                icon: Brain,
                title: "AI Insights",
                description: "Analisi intelligenti dei tuoi allenamenti con suggerimenti personalizzati basati sui tuoi dati",
                gradient: "from-purple-500/10 to-pink-500/10",
                iconColor: "text-purple-500",
                image: "/images/ai_insights_data.webp"
              },
              {
                icon: MessageSquare,
                title: "AI Coach",
                description: "Allenamenti personalizzati generati dall'AI in base al tuo livello e ai tuoi obiettivi",
                gradient: "from-blue-500/10 to-cyan-500/10",
                iconColor: "text-blue-500",
                image: "/images/ai_coach_digital.webp"
              },
              {
                icon: BarChart3,
                title: "Analisi Predittive",
                description: "Previsioni sui tuoi progressi e identificazione di pattern nei tuoi allenamenti",
                gradient: "from-cyan-500/10 to-teal-500/10",
                iconColor: "text-cyan-500",
                image: "/images/predictive_analytics_speed.webp"
              }
            ].map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                whileHover={{ y: -8 }}
              >
                <Card className={`h-full border-border/50 bg-gradient-to-br ${feature.gradient} backdrop-blur-sm relative overflow-hidden group cursor-pointer`}>
                  {/* Image Background with Parallax */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-35 transition-opacity duration-500 ease-out overflow-hidden">
                    <motion.img 
                      src={feature.image} 
                      alt={feature.title}
                      className="w-[120%] h-[120%] object-cover grayscale group-hover:grayscale-0 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
                      whileHover={{ scale: 1.1, x: "-50%", y: "-50%" }}
                      transition={{ duration: 8, ease: "linear" }}
                    />
                  </div>
                  <div className="absolute inset-0 bg-gradient-to-br from-white/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <CardContent className="p-6 relative z-10">
                    <motion.div 
                      className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.gradient} flex items-center justify-center mb-5 shadow-lg border border-white/10 relative z-10`}
                      whileHover={{ rotate: 360, scale: 1.1 }}
                      transition={{ duration: 0.6, type: "spring" }}
                    >
                      <feature.icon className={`h-7 w-7 ${feature.iconColor}`} />
                    </motion.div>
                    <h3 className="font-bold text-xl mb-3 text-card-foreground group-hover:text-[var(--azure)] transition-colors">{feature.title}</h3>
                    <p className="text-muted-foreground leading-relaxed group-hover:text-foreground/90 transition-colors">{feature.description}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>

          {/* AI Highlight Box with Image */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-12 max-w-4xl mx-auto"
          >
            <Card className="border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-pink-500/5 backdrop-blur-sm relative overflow-hidden">
              {/* Background Image */}
              <div className="absolute right-0 top-0 bottom-0 w-1/3 opacity-20 mask-image-gradient">
                <img 
                  src="/images/swimmer_smartwatch_tech.webp" 
                  alt="AI Coach"
                  className="w-full h-full object-cover"
                  style={{ maskImage: 'linear-gradient(to left, black, transparent)' }}
                />
              </div>
              <CardContent className="p-8 text-center relative z-10">
                <Brain className="h-12 w-12 text-purple-500 mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-card-foreground mb-3">
                  Allenamenti Intelligenti
                </h3>
                <p className="text-muted-foreground text-lg leading-relaxed max-w-2xl mx-auto">
                  L'AI analizza i tuoi dati di allenamento, identifica punti di forza e aree di miglioramento, 
                  e genera workout personalizzati per massimizzare i tuoi progressi. Come avere un coach esperto 
                  sempre al tuo fianco.
                </p>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      </section>

      {/* Levels Preview Section - Enhanced with Images */}
      <section className="py-20">
        <div className="container">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-4xl md:text-5xl font-bold text-foreground mb-6">
              Il Tuo Percorso di Crescita
            </h2>
            <p className="text-muted-foreground text-lg md:text-xl max-w-3xl mx-auto">
              Da Novizio a Poseidone: 20 livelli progressivi che premiano la tua dedizione
            </p>
          </motion.div>

          {/* Level Cards with Images */}
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-12">
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative group"
            >
              <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-xl hover:shadow-blue-500/10 transition-all h-full">
                <div className="relative h-72 overflow-hidden">
                  <img 
                    src="/images/young_beginner_swimmer.webp" 
                    alt="Novizio"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6">
                    <div className="flex items-center gap-4 mb-2">
                      <div className="w-14 h-14 rounded-full bg-gray-400 flex items-center justify-center text-white font-bold text-xl shadow-lg border-2 border-white/20">
                        1
                      </div>
                      <div>
                        <div className="font-bold text-2xl text-white">Novizio</div>
                        <div className="text-base text-gray-300">Inizio del viaggio</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="relative group"
            >
              <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm hover:shadow-xl hover:shadow-amber-500/10 transition-all h-full">
                <div className="relative h-72 overflow-hidden">
                  <img 
                    src="/images/expert_swimmer_advanced.webp" 
                    alt="Gran Maestro"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-card via-card/60 to-transparent" />
                  <div className="absolute bottom-6 left-6 right-6">
                    <div className="flex items-center gap-4 mb-2">
                      <div className="w-14 h-14 rounded-full bg-amber-500 flex items-center justify-center text-white font-bold text-xl shadow-lg border-2 border-white/20">
                        10
                      </div>
                      <div>
                        <div className="font-bold text-2xl text-white">Gran Maestro</div>
                        <div className="text-base text-gray-300">Esperienza consolidata</div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            </motion.div>
          </div>

          <div className="flex flex-wrap justify-center gap-4 max-w-5xl mx-auto">
            {[
              { level: 1, title: "Novizio", color: "#9ca3af", description: "Inizio del viaggio" },
              { level: 5, title: "Atleta", color: "#3b82f6", description: "Costanza premiata" },
              { level: 10, title: "Gran Maestro", color: "#f59e0b", description: "Esperienza consolidata" },
              { level: 15, title: "Mito", color: "#06b6d4", description: "Leggenda vivente" },
              { level: 20, title: "Poseidone", color: "#1e40af", description: "Dio del mare" },
            ].map((level, index) => (
              <motion.div
                key={level.level}
                initial={{ opacity: 0, scale: 0.8 }}
                whileInView={{ opacity: 1, scale: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
                whileHover={{ scale: 1.05, y: -5 }}
                className="flex flex-col items-center gap-3 px-6 py-4 rounded-2xl bg-card border border-border shadow-lg hover:shadow-xl transition-all"
              >
                <div className="flex items-center gap-3">
                  <motion.div 
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg shadow-lg border border-white/10"
                    style={{ backgroundColor: level.color }}
                    whileHover={{ rotate: 360 }}
                    transition={{ duration: 0.6 }}
                  >
                    {level.level}
                  </motion.div>
                  <div className="text-left">
                    <div className="font-bold text-lg text-card-foreground">{level.title}</div>
                    <div className="text-xs text-muted-foreground">{level.description}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section - Enhanced with Community Image */}
      <section className="py-24 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[var(--navy)]/90 to-[var(--azure)]/90 z-10" />
        {/* Background Image */}
        <div className="absolute inset-0">
          <img 
            src="/images/swimmers_team_community.webp" 
            alt="Community"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="container relative z-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center max-w-3xl mx-auto"
          >
            <motion.div
              animate={{
                y: [0, -10, 0],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
              }}
            >
              <Waves className="h-16 w-16 text-white mx-auto mb-8 drop-shadow-lg" />
            </motion.div>
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-6 drop-shadow-md">
              Pronto a Tuffarti?
            </h2>
            <p className="text-white/90 text-lg md:text-xl mb-10 font-medium">
              Unisciti ai tuoi compagni di squadra e inizia a guadagnare XP oggi stesso.
              La tua avventura acquatica ti aspetta!
            </p>
            <motion.div
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <Link href="/auth">
                <Button
                  size="lg"
                  className="bg-white hover:bg-gray-100 text-[var(--navy)] font-bold text-lg px-10 py-7 rounded-2xl shadow-xl hover:shadow-2xl transition-all"
                >
                  Accedi o Registrati
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Footer - Enhanced */}
      <footer className="py-10 border-t border-border bg-muted/30">
        <div className="container">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center">
                <Waves className="h-4 w-4 text-white" />
              </div>
              <span className="text-sm text-muted-foreground font-medium">
                SwimForge © {new Date().getFullYear()}
              </span>
            </div>
            <div className="text-sm text-muted-foreground font-semibold">
              🏊‍♂️ Nuota. Guadagna. Conquista.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
