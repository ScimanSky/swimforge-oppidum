import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { MentionUser } from "@/lib/mentions"
import { MentionTextarea } from "./MentionTextarea"

const state = vi.hoisted(() => ({
  searches: [] as Array<{ input: any; enabled: boolean | undefined }>,
  people: [] as any[],
}))

vi.mock("@/lib/trpc", () => ({
  trpc: {
    community: {
      users: {
        search: {
          useQuery: (input: any, options?: { enabled?: boolean }) => {
            state.searches.push({ input, enabled: options?.enabled })
            return { data: options?.enabled === false ? undefined : state.people }
          },
        },
      },
    },
  },
}))

let latest: { value: string; mentions: MentionUser[] } = { value: "", mentions: [] }

function Harness({ initial = "", initialMentions = [] as MentionUser[] }) {
  const [value, setValue] = useState(initial)
  const [mentions, setMentions] = useState<MentionUser[]>(initialMentions)
  latest = { value, mentions }
  return (
    <MentionTextarea
      aria-label="Testo del post"
      value={value}
      onValueChange={setValue}
      mentions={mentions}
      onMentionsChange={setMentions}
    />
  )
}

const ada = { userId: 5, name: "Ada Rossi", username: "ada", avatarUrl: null }
const bea = { userId: 6, name: "Bea", username: null, avatarUrl: null }

describe("MentionTextarea", () => {
  beforeEach(() => {
    state.searches = []
    state.people = [ada, bea]
    latest = { value: "", mentions: [] }
  })
  afterEach(cleanup)

  it("«@» and two letters suggest swimmers after a pause; a click writes @username and keeps the id", async () => {
    render(<Harness />)
    const field = screen.getByRole("textbox", { name: "Testo del post" })
    expect(screen.getByText("Scrivi @ e un nome per menzionare qualcuno.")).toBeInTheDocument()

    await userEvent.type(field, "Vasca con @a")
    // One letter: no search yet.
    expect(state.searches.every((call) => call.enabled !== true)).toBe(true)

    await userEvent.type(field, "d")
    const list = await screen.findByRole("listbox", { name: "Persone da menzionare" })
    expect(state.searches.filter((call) => call.enabled).map((call) => call.input)).toContainEqual({ query: "ad", limit: 6 })
    expect(list).toHaveTextContent("Ada Rossi")
    expect(list).toHaveTextContent("@ada")

    await userEvent.click(screen.getByRole("option", { name: /Ada Rossi/ }))
    expect(latest.value).toBe("Vasca con @ada ")
    expect(latest.mentions).toEqual([{ userId: 5, name: "Ada Rossi", username: "ada" }])
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(field).toHaveFocus()
  })

  it("keyboard: arrows move, Enter picks; without a username the name is written", async () => {
    render(<Harness />)
    const field = screen.getByRole("textbox", { name: "Testo del post" })
    await userEvent.type(field, "@be")
    await screen.findByRole("listbox")
    expect(field).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[0].id)

    await userEvent.keyboard("{ArrowDown}")
    expect(screen.getAllByRole("option")[1]).toHaveAttribute("aria-selected", "true")
    expect(field).toHaveAttribute("aria-activedescendant", screen.getAllByRole("option")[1].id)
    await userEvent.keyboard("{Enter}")
    expect(latest.value).toBe("@Bea ")
    expect(latest.mentions.map((user) => user.userId)).toEqual([6])
  })

  it("Escape closes the suggestions and keeps the text", async () => {
    render(<Harness />)
    const field = screen.getByRole("textbox", { name: "Testo del post" })
    await userEvent.type(field, "@ad")
    await screen.findByRole("listbox")
    await userEvent.keyboard("{Escape}")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(latest.value).toBe("@ad")
  })

  it("no swimmer found says so", async () => {
    state.people = []
    render(<Harness />)
    await userEvent.type(screen.getByRole("textbox", { name: "Testo del post" }), "@zz")
    await waitFor(() => expect(screen.getByText("Nessun nuotatore trovato.")).toHaveAttribute("aria-live", "polite"))
  })

  it("a screen reader hears how many swimmers are suggested", async () => {
    render(<Harness />)
    await userEvent.type(screen.getByRole("textbox", { name: "Testo del post" }), "@ad")
    await screen.findByRole("listbox")
    expect(screen.getByText("2 nuotatori suggeriti")).toHaveAttribute("aria-live", "polite")
  })

  it("ten mentions at most, counting only those still in the text", async () => {
    const ten = Array.from({ length: 10 }, (_, index) => ({ userId: 100 + index, name: null, username: `u${index}` }))
    const written = ten.map((user) => `@${user.username}`).join(" ")
    render(<Harness initial={`${written} `} initialMentions={ten} />)
    const field = screen.getByRole("textbox", { name: "Testo del post" })
    await userEvent.type(field, "@ad")
    await new Promise((resolve) => setTimeout(resolve, 400))
    expect(screen.queryByRole("listbox")).toBeNull()

    // One of the ten deleted from the text: suggestions come back and a new pick is kept.
    await userEvent.clear(field)
    await userEvent.type(field, `${ten.slice(1).map((user) => `@${user.username}`).join(" ")} @ad`)
    await userEvent.click(await screen.findByRole("option", { name: /Ada Rossi/ }))
    expect(latest.mentions.map((user) => user.userId)).toContain(5)
  })
})
