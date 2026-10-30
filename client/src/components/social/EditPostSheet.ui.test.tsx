import { act, cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EditPostSheet } from "./EditPostSheet"

const state = vi.hoisted(() => ({
  post: null as any,
  isError: false,
  updateCalls: [] as any[],
  onOpenChange: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  invalidate: vi.fn(),
  people: [] as any[],
  updateImpl: null as null | ((vars: unknown) => Promise<unknown>),
}))

vi.mock("sonner", () => ({
  toast: { success: state.toastSuccess, error: state.toastError, warning: vi.fn() },
}))

vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false })
  const invalidator = { invalidate: (...args: unknown[]) => state.invalidate(...args) }
  return {
    trpc: {
      useUtils: () => ({
        community: {
          feed: invalidator,
          postById: invalidator,
          ownPost: invalidator,
          clubs: { feed: invalidator },
        },
      }),
      community: {
        ownPost: { useQuery: () => ({ data: state.post, isError: state.isError }) },
        users: {
          search: {
            useQuery: (_input: unknown, options?: { enabled?: boolean }) => ({
              data: options?.enabled === false ? undefined : state.people,
            }),
          },
        },
        postImageKitAuth: { useMutation: mutation },
        postUploadImage: { useMutation: mutation },
        cloudinaryVideoAuth: { useMutation: mutation },
        updatePost: {
          useMutation: () => ({
            mutateAsync: async (vars: unknown) => {
              state.updateCalls.push(vars)
              if (state.updateImpl) return state.updateImpl(vars)
              return { success: true }
            },
          }),
        },
      },
    },
  }
})

describe("EditPostSheet", () => {
  beforeEach(() => {
    state.post = {
      id: 7,
      activityId: 99,
      clubId: null,
      content: "Soglia 10×200, dura",
      mediaUrls: ["https://cdn.example/uno.jpg", "https://cdn.example/due.jpg"],
      taggedUsers: [],
    }
    state.isError = false
    state.updateCalls = []
    state.people = []
    state.onOpenChange.mockReset()
    state.toastSuccess.mockReset()
    state.toastError.mockReset()
    state.invalidate.mockReset()
    state.updateImpl = null
  })
  afterEach(cleanup)

  it("loads text and photos of the post, saves the edits and closes", async () => {
    render(<EditPostSheet open onOpenChange={state.onOpenChange} postRef={{ postId: 7 }} />)

    const text = await screen.findByRole("textbox", { name: "Testo del post" })
    expect(text).toHaveValue("Soglia 10×200, dura")
    await userEvent.clear(text)
    await userEvent.type(text, "Soglia 10×200, ottima")
    await userEvent.click(screen.getByRole("button", { name: "Togli il media 1" }))
    expect(screen.getAllByRole("img")).toHaveLength(1)

    await userEvent.click(screen.getByRole("button", { name: "Salva modifiche" }))

    await waitFor(() =>
      expect(state.updateCalls).toEqual([
        { postId: 7, content: "Soglia 10×200, ottima", mediaUrls: ["https://cdn.example/due.jpg"], taggedUserIds: [] },
      ]),
    )
    expect(state.toastSuccess).toHaveBeenCalledWith("Post aggiornato.")
    expect(state.onOpenChange).toHaveBeenCalledWith(false)
  })

  it("keeps the post's mentions still in the text and adds the new ones picked after «@»", async () => {
    state.post = {
      ...state.post,
      content: "Con @ada e @Bea",
      taggedUsers: [
        { userId: 5, name: "Ada Rossi", username: "ada" },
        { userId: 6, name: "Bea", username: null },
      ],
    }
    state.people = [{ userId: 8, name: "Carlo", username: "carlo", avatarUrl: null }]
    render(<EditPostSheet open onOpenChange={state.onOpenChange} postRef={{ postId: 7 }} />)
    const text = await screen.findByRole("textbox", { name: "Testo del post" })
    await userEvent.clear(text)
    await userEvent.type(text, "Con @ada e @ca")
    await userEvent.click(await screen.findByRole("option", { name: /Carlo/ }))
    await userEvent.click(screen.getByRole("button", { name: "Salva modifiche" }))
    await waitFor(() => expect(state.updateCalls[0]).toMatchObject({ content: "Con @ada e @carlo", taggedUserIds: [5, 8] }))
  })

  it("people tagged apart by an older post stay unless removed", async () => {
    state.post = {
      ...state.post,
      content: "Vasca con @ada",
      taggedUsers: [
        { userId: 5, name: "Ada Rossi", username: "ada" },
        { userId: 9, name: "Dario", username: null },
        { userId: 10, name: "Elena", username: "ele" },
      ],
    }
    render(<EditPostSheet open onOpenChange={state.onOpenChange} postRef={{ postId: 7 }} />)
    const chips = await screen.findByRole("list", { name: "Persone taggate nel post" })
    expect(chips).toHaveTextContent("Dario")
    expect(chips).toHaveTextContent("Elena")
    await userEvent.click(screen.getByRole("button", { name: "Togli Elena dal post" }))
    await userEvent.click(screen.getByRole("button", { name: "Salva modifiche" }))
    await waitFor(() => expect(state.updateCalls[0]).toMatchObject({ taggedUserIds: [5, 9] }))
  })

  it("a club post keeps the club's 1000 characters", async () => {
    state.post = { ...state.post, clubId: 3, activityId: null }
    render(<EditPostSheet open onOpenChange={state.onOpenChange} postRef={{ postId: 7 }} />)
    expect(await screen.findByRole("textbox", { name: "Testo del post" })).toHaveAttribute("maxLength", "1000")
  })

  it("a second tap while saving does not save twice", async () => {
    let finish: (value: unknown) => void = () => {}
    state.updateImpl = () => new Promise((resolve) => (finish = resolve))
    render(<EditPostSheet open onOpenChange={state.onOpenChange} postRef={{ postId: 7 }} />)
    const save = await screen.findByRole("button", { name: "Salva modifiche" })
    await userEvent.click(save)
    save.click()
    await act(async () => finish({ success: true }))
    expect(state.updateCalls).toHaveLength(1)
  })

  it("a server error shows the Italian message, never a bare code", async () => {
    state.updateImpl = async () => {
      throw Object.assign(new Error("FORBIDDEN"), { data: { code: "FORBIDDEN" } })
    }
    render(<EditPostSheet open onOpenChange={state.onOpenChange} postRef={{ postId: 7 }} />)
    await userEvent.click(await screen.findByRole("button", { name: "Salva modifiche" }))
    await waitFor(() => expect(state.toastError).toHaveBeenCalledWith("Non riesco a salvare il post."))
  })

  it("the Android back button closes the sheet instead of leaving the page", async () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {})
    const { rerender } = render(<EditPostSheet open onOpenChange={state.onOpenChange} postRef={{ postId: 7 }} />)
    await screen.findByRole("textbox", { name: "Testo del post" })
    expect(window.history.state).toMatchObject({ swimforgeEditPostOpen: true })

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"))
    })
    expect(state.onOpenChange).toHaveBeenCalledWith(false)
    rerender(<EditPostSheet open={false} onOpenChange={state.onOpenChange} postRef={{ postId: 7 }} />)
    // Closed by back: the entry is already gone, nothing more to pop.
    expect(back).not.toHaveBeenCalled()

    // Closed another way: the entry pushed on opening is removed.
    rerender(<EditPostSheet open onOpenChange={state.onOpenChange} postRef={{ postId: 7 }} />)
    rerender(<EditPostSheet open={false} onOpenChange={state.onOpenChange} postRef={{ postId: 7 }} />)
    expect(back).toHaveBeenCalledTimes(1)
    back.mockRestore()
  })

  it("a post that no longer exists says so", () => {
    state.post = undefined
    state.isError = true
    render(<EditPostSheet open onOpenChange={state.onOpenChange} postRef={{ activityId: 99 }} />)
    expect(screen.getByText("Non trovo il post: forse è stato eliminato.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Salva modifiche" })).not.toBeInTheDocument()
  })
})
