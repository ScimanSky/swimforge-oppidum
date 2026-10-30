import { act, cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LatestSwimShare } from "./LatestSwimShare"

const state = vi.hoisted(() => ({
  query: { data: undefined, isPending: true, isSuccess: false, isError: false } as Record<string, unknown>,
  toastInfo: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { info: state.toastInfo, error: state.toastError } }))
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ activities: { list: { invalidate: vi.fn() } } }),
    community: { latestSwim: { useQuery: () => state.query } },
  },
}))
vi.mock("@/components/social/ShareActivityPicker", () => ({
  ShareActivityPicker: ({ initialActivityId }: { initialActivityId: number }) => (
    <div data-testid="share-picker">{initialActivityId}</div>
  ),
}))
vi.mock("@/components/social/EditPostSheet", () => ({
  EditPostSheet: () => <div data-testid="edit-post" />,
}))

describe("LatestSwimShare", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    state.query = { data: undefined, isPending: true, isSuccess: false, isError: false }
    state.toastInfo.mockReset()
    state.toastError.mockReset()
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    document.body.innerHTML = ""
  })

  it("says it is looking for the swim instead of showing nothing", () => {
    render(<LatestSwimShare onClose={vi.fn()} />)
    expect(screen.getByRole("dialog", { name: "Condividi l'ultima nuotata" })).toBeInTheDocument()
    expect(screen.getAllByRole("status").some((node) => node.textContent?.includes("Cerco la tua ultima nuotata"))).toBe(
      true,
    )
  })

  it("then opens the share sheet of that swim", () => {
    const { rerender } = render(<LatestSwimShare onClose={vi.fn()} />)
    state.query = { data: { id: 99, shared: false }, isPending: false, isSuccess: true, isError: false }
    rerender(<LatestSwimShare onClose={vi.fn()} />)
    expect(screen.getByTestId("share-picker")).toHaveTextContent("99")
    expect(screen.queryByRole("dialog", { name: "Condividi l'ultima nuotata" })).not.toBeInTheDocument()
  })

  it("without swims: a message, and the focus goes back to «Crea»", async () => {
    const crea = document.createElement("button")
    crea.dataset.tour = "create-post"
    crea.textContent = "Crea"
    document.body.appendChild(crea)
    state.query = { data: null, isPending: false, isSuccess: true, isError: false }
    const onClose = vi.fn()
    render(<LatestSwimShare onClose={onClose} />)
    expect(state.toastInfo).toHaveBeenCalledWith("Non hai ancora nuotate da condividere.", expect.anything())
    expect(onClose).toHaveBeenCalled()
    await act(async () => {
      vi.runAllTimers()
    })
    expect(document.activeElement).toBe(crea)
  })

  it("does not take the focus from an element that has it", async () => {
    const crea = document.createElement("button")
    crea.dataset.tour = "create-post"
    const other = document.createElement("input")
    document.body.append(crea, other)
    other.focus()
    state.query = { data: null, isPending: false, isSuccess: false, isError: true }
    render(<LatestSwimShare onClose={vi.fn()} />)
    expect(state.toastError).toHaveBeenCalled()
    await act(async () => {
      vi.runAllTimers()
    })
    expect(document.activeElement).toBe(other)
  })
})
