"use client"

import AppLayout from "@/components/AppLayout"
import DirectMessages from "@/components/DirectMessages"

export default function MessagesPage() {
  return (
    <AppLayout>
      <div className="compact-shell mx-auto w-full max-w-[1400px] space-y-3 lg:space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold neon-gradient-text">Messaggi</h1>
            <p className="text-sm text-muted-foreground">Chat private SwimForge in layout esteso.</p>
          </div>
        </div>

        <DirectMessages mode="page" />
      </div>
    </AppLayout>
  )
}
