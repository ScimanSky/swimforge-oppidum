import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Router } from "wouter"
import { memoryLocation } from "wouter/memory-location"

import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet"
import { CreateSheet, type CreateAction } from "./CreateMenu"

/** The shell's wiring: the «Crea» sheet closes and, for «Nuovo post», a second real dialog opens. */
function Harness({ onAction }: { onAction?: (action: CreateAction) => void }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [postOpen, setPostOpen] = useState(false)
  return (
    <Router hook={memoryLocation({ path: "/today" }).hook}>
      <CreateSheet
        open={menuOpen}
        onOpenChange={setMenuOpen}
        isGarminSyncing={false}
        onAction={(action) => {
          onAction?.(action)
          setMenuOpen(false)
          if (action !== "garmin") setPostOpen(true)
        }}
      >
        <button type="button" aria-label="Crea">
          +
        </button>
      </CreateSheet>
      <Sheet open={postOpen} onOpenChange={setPostOpen}>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetTitle>Nuovo post</SheetTitle>
          <textarea aria-label="Testo del post" />
        </SheetContent>
      </Sheet>
    </Router>
  )
}

describe("CreateSheet", () => {
  afterEach(() => {
    cleanup()
    document.body.style.pointerEvents = ""
  })

  it("Nuovo post: il fuoco resta nel nuovo dialogo, non torna al +, e la pagina resta cliccabile alla chiusura", async () => {
    render(<Harness />)
    const plus = screen.getByRole("button", { name: "Crea" })
    await userEvent.click(plus)
    // Radix returns the focus with plus.focus() when the sheet unmounts: it must not happen.
    const focusPlus = vi.spyOn(plus, "focus")
    await userEvent.click(await screen.findByRole("button", { name: "Nuovo post" }))

    const postDialog = await screen.findByRole("dialog", { name: "Nuovo post" })
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Crea" })).not.toBeInTheDocument())
    await waitFor(() => expect(postDialog.contains(document.activeElement)).toBe(true))
    expect(focusPlus).not.toHaveBeenCalled()

    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Nuovo post" })).not.toBeInTheDocument())
    expect(document.body.style.pointerEvents).not.toBe("none")
  })

  it("Bozza IA del post: stesso comportamento", async () => {
    const onAction = vi.fn()
    render(<Harness onAction={onAction} />)
    const plus = screen.getByRole("button", { name: "Crea" })
    await userEvent.click(plus)
    const focusPlus = vi.spyOn(plus, "focus")
    await userEvent.click(await screen.findByRole("button", { name: "Bozza IA del post" }))
    expect(onAction).toHaveBeenCalledWith("ai-post")
    const postDialog = await screen.findByRole("dialog", { name: "Nuovo post" })
    await waitFor(() => expect(postDialog.contains(document.activeElement)).toBe(true))
    expect(focusPlus).not.toHaveBeenCalled()
    await userEvent.keyboard("{Escape}")
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    expect(document.body.style.pointerEvents).not.toBe("none")
  })

  it("Sincronizza Garmin (nessun altro dialogo): il fuoco torna al +", async () => {
    render(<Harness />)
    const plus = screen.getByRole("button", { name: "Crea" })
    await userEvent.click(plus)
    await userEvent.click(await screen.findByRole("button", { name: "Sincronizza Garmin" }))
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument())
    await waitFor(() => expect(document.activeElement).toBe(plus))
    expect(document.body.style.pointerEvents).not.toBe("none")
  })
})
