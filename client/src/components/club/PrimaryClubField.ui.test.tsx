import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { PrimaryClubField } from "./PrimaryClubField"

const state = vi.hoisted(() => ({
  clubs: [] as any[] | undefined,
  listInputs: [] as unknown[],
  saves: [] as unknown[],
  invalidate: vi.fn(),
  toastSuccess: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: state.toastSuccess, error: vi.fn() } }))
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      profile: { get: { invalidate: state.invalidate } },
      community: { feed: { invalidate: state.invalidate } },
    }),
    community: {
      clubs: {
        list: {
          useQuery: (input: unknown) => {
            state.listInputs.push(input)
            return { data: state.clubs, isPending: state.clubs === undefined }
          },
        },
      },
    },
    profile: {
      setPrimaryClub: {
        useMutation: (options?: { onSuccess?: () => void }) => ({
          mutate: (vars: unknown) => {
            state.saves.push(vars)
            options?.onSuccess?.()
          },
          isPending: false,
        }),
      },
    },
  },
}))

// Radix Select needs pointer capture and scrollIntoView, missing in jsdom.
Object.assign(Element.prototype, {
  hasPointerCapture: () => false,
  releasePointerCapture: () => {},
  scrollIntoView: () => {},
})

describe("PrimaryClubField", () => {
  beforeEach(() => {
    state.clubs = [
      { id: 3, name: "Oppidum Cagliari" },
      { id: 8, name: "AI Club" },
    ]
    state.listInputs = []
    state.saves = []
    state.invalidate.mockReset()
    state.toastSuccess.mockReset()
  })
  afterEach(cleanup)

  it("lists the user's clubs and «Nessuno»; choosing one saves it", async () => {
    render(<PrimaryClubField value={undefined} />)
    expect(state.listInputs[0]).toEqual({ scope: "mine", limit: 100 })
    const select = screen.getByRole("combobox", { name: "Club principale" })
    expect(select).toHaveTextContent("Scegli un club")
    expect(screen.getByText(/Finché non scegli, compare l'ultimo club in cui sei entrato\./)).toBeInTheDocument()

    await userEvent.click(select)
    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "Oppidum Cagliari",
      "AI Club",
      "Nessuno",
    ])
    await userEvent.click(screen.getByRole("option", { name: "Oppidum Cagliari" }))
    expect(state.saves).toEqual([{ clubId: 3 }])
    expect(state.toastSuccess).toHaveBeenCalledWith("Club principale salvato.")
    expect(state.invalidate).toHaveBeenCalled()
  })

  it("«Nessuno» saves null; the stored choice is shown", async () => {
    render(<PrimaryClubField value={3} />)
    const select = screen.getByRole("combobox", { name: "Club principale" })
    expect(select).toHaveTextContent("Oppidum Cagliari")
    await userEvent.click(select)
    await userEvent.click(screen.getByRole("option", { name: "Nessuno" }))
    expect(state.saves).toEqual([{ clubId: null }])
    cleanup()

    render(<PrimaryClubField value={null} />)
    expect(screen.getByRole("combobox", { name: "Club principale" })).toHaveTextContent("Nessuno")
  })

  it("a club left after choosing it reads as not chosen", () => {
    render(<PrimaryClubField value={99} />)
    expect(screen.getByRole("combobox", { name: "Club principale" })).toHaveTextContent("Scegli un club")
  })

  it("no clubs: says so, no select", () => {
    state.clubs = []
    render(<PrimaryClubField value={undefined} />)
    expect(screen.getByText("Non fai parte di nessun club.")).toBeInTheDocument()
    expect(screen.queryByRole("combobox")).toBeNull()
  })
})
