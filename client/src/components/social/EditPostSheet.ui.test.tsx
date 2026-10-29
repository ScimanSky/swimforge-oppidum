import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { EditPostSheet } from "./EditPostSheet"

const state = vi.hoisted(() => ({
  post: null as any,
  isError: false,
  updateCalls: [] as any[],
  onOpenChange: vi.fn(),
  toastSuccess: vi.fn(),
  invalidate: vi.fn(),
}))

vi.mock("sonner", () => ({
  toast: { success: state.toastSuccess, error: vi.fn(), warning: vi.fn() },
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
        postImageKitAuth: { useMutation: mutation },
        postUploadImage: { useMutation: mutation },
        cloudinaryVideoAuth: { useMutation: mutation },
        updatePost: {
          useMutation: () => ({
            mutateAsync: async (vars: unknown) => {
              state.updateCalls.push(vars)
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
    state.onOpenChange.mockReset()
    state.toastSuccess.mockReset()
    state.invalidate.mockReset()
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
        { postId: 7, content: "Soglia 10×200, ottima", mediaUrls: ["https://cdn.example/due.jpg"] },
      ]),
    )
    expect(state.toastSuccess).toHaveBeenCalledWith("Post aggiornato.")
    expect(state.onOpenChange).toHaveBeenCalledWith(false)
  })

  it("a post that no longer exists says so", () => {
    state.post = undefined
    state.isError = true
    render(<EditPostSheet open onOpenChange={state.onOpenChange} postRef={{ activityId: 99 }} />)
    expect(screen.getByText("Non trovo il post: forse è stato eliminato.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Salva modifiche" })).not.toBeInTheDocument()
  })
})
