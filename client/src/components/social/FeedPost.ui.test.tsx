import { cleanup, render, screen, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Router } from "wouter"
import { memoryLocation } from "wouter/memory-location"
import FeedPost from "./FeedPost"
import FeedSkeleton from "./FeedSkeleton"
import FeedSubTabs from "./FeedSubTabs"
import type { FeedPostRecord } from "./feed-types"

const state = vi.hoisted(() => ({
  reactions: [] as Array<{ reactionType: string; count: number }>,
  userReaction: null as { reactionType: string } | null,
}))

const { mutation } = vi.hoisted(() => ({
  mutation: () => ({ mutate: () => {}, isPending: false }),
}))

vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({}),
    community: {
      users: { toggleFollow: { useMutation: mutation } },
      hidePost: { useMutation: mutation },
      deletePost: { useMutation: mutation },
      reactions: {
        list: { useQuery: () => ({ data: state.reactions }) },
        userReaction: { useQuery: () => ({ data: state.userReaction }) },
        toggle: { useMutation: mutation },
      },
      comments: { useQuery: () => ({ data: [], isLoading: false, refetch: vi.fn() }) },
      addComment: { useMutation: mutation },
    },
  },
}))

vi.mock("./EditPostSheet", () => ({
  EditPostSheet: ({ postRef }: any) => <div data-testid="edit-post">{JSON.stringify(postRef)}</div>,
}))

const NOW = new Date("2026-10-28T18:00:00.000Z")

const activityPost: FeedPostRecord = {
  id: 9,
  user_id: 2,
  activity_id: 41,
  content: "Finalmente sotto l'1:50 sui 200.",
  created_at: "2026-10-28T15:00:00.000Z",
  activity_date: "2026-10-28T16:00:00.000Z",
  activity_distance_meters: 3400,
  activity_duration_seconds: 3700,
  activity_calories: 650,
  activity_heart_rate: null,
  activity_swolf: null,
  activity_is_open_water: false,
  activity_source: "garmin",
  comment_count: "5",
  user_name: "Giulia Bianchi",
  user_club_name: "Nuoto Oppidum",
}

function renderPost(post: FeedPostRecord, currentUserId = 1) {
  return render(
    <Router hook={memoryLocation({ path: "/home" }).hook}>
      <FeedPost post={post} currentUserId={currentUserId} autoplayVideos={false} />
    </Router>
  )
}

describe("FeedPost Corsia", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ["Date"] })
    state.reactions = [
      { reactionType: "love", count: 20 },
      { reactionType: "fire", count: 4 },
    ]
    state.userReaction = null
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
  })

  it("intestazione: nome, poi «club · tempo fa»", () => {
    renderPost(activityPost)
    expect(screen.getByRole("link", { name: "Giulia Bianchi" })).toHaveAttribute("href", "/u/2")
    expect(screen.getByText("Nuoto Oppidum · 2h fa")).toBeInTheDocument()
  })

  it("il proprio post si può modificare ed eliminare, quando si vuole", async () => {
    vi.useRealTimers()
    renderPost(activityPost, 2)
    await userEvent.click(screen.getByRole("button", { name: "Menu post" }))
    expect(await screen.findByRole("menuitem", { name: "Elimina" })).toBeInTheDocument()
    expect(screen.queryByRole("menuitem", { name: "Segnala" })).toBeNull()
    await userEvent.click(screen.getByRole("menuitem", { name: "Modifica" }))
    expect(await screen.findByTestId("edit-post")).toHaveTextContent('{"postId":9}')
  })

  it("senza club: la fonte della nuotata", () => {
    renderPost({ ...activityPost, user_club_name: null })
    expect(screen.getByText("Garmin · 2h fa")).toBeInTheDocument()
  })

  it("card attività: distanza, passo in tono azione, durata; niente calorie", () => {
    renderPost(activityPost)
    const card = screen.getByRole("group", { name: "Nuotata in vasca" })
    expect(card).toHaveTextContent("3,4 km Distanza")
    expect(within(card).getByText("1:49")).toHaveClass("text-action-text")
    expect(within(card).getByText("Passo /100")).toBeInTheDocument()
    expect(within(card).getByText("1:02")).toBeInTheDocument()
    expect(within(card).queryByText(/kcal|Calorie/)).toBeNull()
    expect(within(card).queryByText("FC media")).toBeNull()
  })

  it("card attività: FC e SWOLF solo se presenti, al massimo quattro metriche", () => {
    renderPost({ ...activityPost, activity_heart_rate: 141.6, activity_swolf: "38" as unknown as number })
    const card = screen.getByRole("group", { name: "Nuotata in vasca" })
    expect(within(card).getByText("142")).toBeInTheDocument()
    expect(within(card).getByText("FC media")).toBeInTheDocument()
    expect(within(card).queryByText("SWOLF")).toBeNull()
  })

  it("post di solo testo: nessuna card attività, hashtag in colore azione", () => {
    const { container } = renderPost({
      ...activityPost,
      content: "Finalmente sotto l'1:50 sui 200. #soglia",
      activity_id: null,
      activity_source: null,
      activity_is_open_water: null,
      activity_distance_meters: null,
      activity_duration_seconds: null,
    })
    expect(screen.queryByText("Distanza")).toBeNull()
    expect(container.querySelector("article p.whitespace-pre-wrap")).toHaveTextContent(
      "Finalmente sotto l'1:50 sui 200. #soglia"
    )
    expect(screen.getByText("#soglia")).toHaveClass("text-action-text")
  })

  it("azioni: cuore con il totale, commenti, condividi; cuore pieno blu azione (non arancio XP) se hai reagito", () => {
    renderPost(activityPost)
    const heart = screen.getByRole("button", { name: "Reagisci, 24 reazioni" })
    expect(heart).toHaveTextContent("24")
    expect(heart.querySelector("svg")).not.toHaveClass("fill-current")
    expect(screen.getByRole("button", { name: "Commenti, 5" })).toHaveTextContent("5")
    expect(screen.getByRole("button", { name: "Condividi" })).toBeInTheDocument()
    cleanup()

    state.userReaction = { reactionType: "love" }
    renderPost(activityPost)
    const active = screen.getByRole("button", { name: "Cambia reazione, 24 reazioni" })
    expect(active.querySelector("svg")).toHaveClass("fill-current", "text-action-text")
    expect(active.querySelector("svg")).not.toHaveClass("text-xp")
  })

  it("i commenti si aprono dal pulsante", async () => {
    vi.useRealTimers()
    renderPost(activityPost)
    const toggle = screen.getByRole("button", { name: "Commenti, 5" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("textbox", { name: "Aggiungi un commento" })).toBeInTheDocument()
  })

  it("la card attività non è un landmark né un titolo", () => {
    renderPost(activityPost)
    expect(screen.queryByRole("region")).toBeNull()
    expect(screen.queryByRole("heading", { name: "Nuotata in vasca" })).toBeNull()
  })

  it("intestazione: «Livello N» e pulsante Segui con il nome accessibile", () => {
    renderPost({ ...activityPost, user_level: 12 })
    expect(screen.getByText("Livello 12")).toBeInTheDocument()
    const follow = screen.getByRole("button", { name: "Segui Giulia Bianchi" })
    expect(follow).not.toHaveAttribute("aria-label")
    expect(follow).not.toHaveAttribute("aria-pressed")
    cleanup()

    renderPost({ ...activityPost, is_following: true })
    expect(screen.getByRole("button", { name: "Seguendo Giulia Bianchi" })).toBeInTheDocument()
  })

  it("più foto: nomi numerati «1 di 3»; una sola foto senza numero", () => {
    renderPost({
      ...activityPost,
      media_urls: ["https://cdn.example.com/a.jpg", "https://cdn.example.com/b.jpg", "https://cdn.example.com/c.jpg"],
    })
    expect(screen.getByRole("button", { name: "Apri la foto 1 di 3" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Apri la foto 3 di 3" })).toBeInTheDocument()
    expect(screen.getAllByAltText(/^Foto del post, \d di 3$/)).toHaveLength(3)
    cleanup()

    renderPost({ ...activityPost, media_url: "https://cdn.example.com/a.jpg" })
    expect(screen.getByRole("button", { name: "Apri la foto" })).toBeInTheDocument()
    expect(screen.getByAltText("Foto del post")).toBeInTheDocument()
  })

  it("foto a tutta larghezza senza testo sovrapposto, post separati da una riga", () => {
    const { container } = renderPost({ ...activityPost, media_url: "https://cdn.example.com/a.jpg" })
    const img = screen.getByAltText("Foto del post")
    const frame = img.closest("div")!
    expect(frame).toHaveClass("rounded-xl")
    expect(frame.textContent).toBe("")
    const article = container.querySelector("article")!
    expect(article).toHaveClass("border-b", "border-border")
    expect(article.className).not.toMatch(/shadow|surface-panel/)
  })
})

describe("FeedSubTabs", () => {
  afterEach(cleanup)

  it("Per te e Seguiti: quella attiva è premuta, il clic cambia scheda", async () => {
    const onChange = vi.fn()
    render(<FeedSubTabs tab="perte" onChange={onChange} />)
    expect(screen.getByRole("button", { name: "Per te" })).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByRole("button", { name: "Seguiti" })).toHaveAttribute("aria-pressed", "false")
    await userEvent.click(screen.getByRole("button", { name: "Seguiti" }))
    expect(onChange).toHaveBeenCalledWith("seguiti")
  })
})

describe("FeedSkeleton", () => {
  afterEach(cleanup)

  it("annunciato come stato di caricamento", () => {
    render(<FeedSkeleton />)
    expect(screen.getByRole("status")).toHaveTextContent("Caricamento…")
  })
})
