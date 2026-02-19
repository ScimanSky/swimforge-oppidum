"use client"

import { useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet"
import { Menu } from "lucide-react"
import { SwimForgeMark, SwimForgeWordmark } from "@/components/brand/SwimForgeBrand"

const navLinks = [
  { href: "#features", label: "Funzionalità" },
  { href: "#progress", label: "Progressi" },
  { href: "#cta", label: "Inizia" },
]

export function LandingNav() {
  const [open, setOpen] = useState(false)

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
      <nav className="container mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="sf-brand-anchor flex min-h-[44px] items-center gap-2 rounded-xl px-2.5 py-1.5">
          <SwimForgeMark className="h-8 w-8" />
          <SwimForgeWordmark className="text-sm md:text-base" compact />
        </Link>

        {/* Desktop Navigation */}
        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost-neon" asChild>
            <Link href="/login">Accedi</Link>
          </Button>
          <Button variant="neon" asChild>
            <Link href="/signup">Inizia l&apos;Avventura</Link>
          </Button>
        </div>

        {/* Mobile Navigation */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="md:hidden">
            <Button variant="ghost" size="icon">
              <Menu className="w-5 h-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[300px] bg-background">
            <div className="flex flex-col gap-6 mt-8">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-lg font-medium text-foreground hover:text-primary transition-colors"
                  onClick={() => setOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className="flex flex-col gap-3 mt-4">
                <Button variant="outline-neon" asChild className="w-full bg-transparent">
                  <Link href="/login">Accedi</Link>
                </Button>
                <Button variant="neon" asChild className="w-full">
                  <Link href="/signup">Inizia l&apos;Avventura</Link>
                </Button>
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  )
}
