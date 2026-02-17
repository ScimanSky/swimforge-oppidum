import Link from "next/link"
import Image from "next/image"

const footerLinks = {
  prodotto: {
    title: "Prodotto",
    links: [
      { label: "Funzionalità", href: "#features" },
      { label: "Progressi", href: "#progress" },
      { label: "Community", href: "/club" },
    ],
  },
  supporto: {
    title: "Supporto",
    links: [
      { label: "Accedi", href: "/login" },
      { label: "Registrati", href: "/signup" },
      { label: "Coach", href: "/coach" },
    ],
  },
  legale: {
    title: "Legale",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Termini", href: "/terms" },
      { label: "Cookie", href: "/cookies" },
    ],
  },
}

export function LandingFooter() {
  return (
    <footer className="bg-card border-t border-border">
      <div className="container mx-auto px-4 py-12 lg:py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-3 lg:col-span-1 mb-4 lg:mb-0">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <Image
                src="/swimforge-logo.png"
                alt="SwimForge"
                width={36}
                height={36}
                className="h-9 w-9"
              />
              <span className="font-display text-xl font-bold text-foreground">SwimForge</span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-xs">
              La piattaforma per nuotatori che vogliono crescere, competere e divertirsi.
            </p>
          </div>

          {/* Links */}
          {Object.entries(footerLinks).map(([key, section]) => (
            <div key={key}>
              <h4 className="font-semibold text-foreground mb-4">{section.title}</h4>
              <ul className="space-y-3">
                {section.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 pt-8 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-sm text-muted-foreground">
            2026 SwimForge. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
