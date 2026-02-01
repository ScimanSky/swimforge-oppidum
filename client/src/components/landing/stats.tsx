const stats = [
  { value: "12K+", label: "Active Swimmers", description: "worldwide community" },
  { value: "2.5M", label: "Kilometers Tracked", description: "and counting" },
  { value: "98%", label: "Accuracy Rate", description: "in metrics analysis" },
  { value: "4.9", label: "App Rating", description: "on all platforms" },
]

export function LandingStats() {
  return (
    <section className="py-16 bg-card border-y border-border">
      <div className="container mx-auto px-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
          {stats.map((stat, index) => (
            <div
              key={index}
              className="text-center lg:border-r last:border-r-0 border-border"
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
