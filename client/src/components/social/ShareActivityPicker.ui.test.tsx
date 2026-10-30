import { cleanup, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ShareActivityPicker } from "./ShareActivityPicker"

const mocks = vi.hoisted(() => ({
  createPost: vi.fn(),
  people: [] as any[],
}))

vi.mock("sonner", () => ({ toast: { error: vi.fn(), warning: vi.fn(), success: vi.fn() } }))

vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ useMutation: () => ({ mutateAsync: vi.fn(), isPending: false }) })
  return {
    trpc: {
      useUtils: () => ({
        community: { feed: { invalidate: vi.fn() }, unsharedActivities: { invalidate: vi.fn() } },
      }),
      community: {
        unsharedActivities: {
          useQuery: () => ({
            data: [{ id: 9, activity_name: "Soglia", distance_meters: 2000, duration_seconds: 2400 }],
            isLoading: false,
          }),
        },
        postImageKitAuth: mutation(),
        postUploadImage: mutation(),
        cloudinaryVideoAuth: mutation(),
        createPost: { useMutation: () => ({ mutateAsync: mocks.createPost, isPending: false }) },
        users: {
          search: {
            useQuery: (_input: unknown, options?: { enabled?: boolean }) => ({
              data: options?.enabled === false ? undefined : mocks.people,
            }),
          },
        },
      },
    },
  }
})

describe("ShareActivityPicker", () => {
  beforeEach(() => {
    mocks.createPost.mockReset()
    mocks.people = [{ userId: 5, name: "Ada Rossi", username: "ada", avatarUrl: null }]
  })
  afterEach(cleanup)

  it("mentions with «@» in the comment; no tag field, no hashtags; the picked ids are sent", async () => {
    render(<ShareActivityPicker open onOpenChange={() => {}} initialActivityId={9} />)
    expect(await screen.findByText("Condividi attività")).toBeInTheDocument()
    expect(screen.queryByText("Tagga amici")).toBeNull()

    const field = screen.getByRole("textbox", { name: "Testo del post" })
    await userEvent.type(field, "Con @ad")
    await userEvent.click(await screen.findByRole("option", { name: /Ada Rossi/ }))
    await userEvent.type(field, "#vasca")
    expect(screen.queryByText("Hashtag rilevati")).toBeNull()

    await userEvent.click(screen.getByRole("button", { name: "Condividi" }))
    expect(mocks.createPost).toHaveBeenCalledWith({
      activityId: 9,
      content: "Con @ada #vasca",
      mediaUrls: [],
      mediaUrl: null,
      taggedUserIds: [5],
    })
  })
})
