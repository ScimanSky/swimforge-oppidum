const stats = [
  { value: "20", label: "Livelli", description: "da sbloccare" },
  { value: "40+", label: "Badge", description: "di progressione" },
  { value: "∞", label: "XP", description: "da guadagnare" },
]

export function LandingStats() {
  return (
    <section id="progress" className="py-16 bg-card border-y border-border">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-3 gap-6 sm:gap-8">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center border-r last:border-r-0 border-border"
            >
              <p className="text-3xl sm:text-4xl font-display font-bold text-primary">
                {stat.value}
              </p>
              <p className="text-sm font-medium text-foreground mt-1">{stat.label}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{stat.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
