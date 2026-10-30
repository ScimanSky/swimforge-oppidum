import { useEffect, useRef, useState } from "react"
import { ImagePlus, X } from "lucide-react"
import { toast } from "sonner"
import { CLUB_POST_CONTENT_MAX_LENGTH, POST_CONTENT_MAX_LENGTH } from "@shared/const"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useCloseOnBack } from "@/hooks/useCloseOnBack"
import { uploadActivityShareMedia } from "@/lib/activity-share-media-upload"
import { pickedMentionIds, taggedUsersNotInText, type MentionUser } from "@/lib/mentions"
import { isVideoUrl, MAX_POST_MEDIA_ITEMS, validatePostMediaFile, type PostMediaKind } from "@/lib/post-media"
import { trpc } from "@/lib/trpc"
import { errorToastMessage } from "@/lib/trpc-errors"
import { MentionTextarea } from "./MentionTextarea"

export type EditPostRef = { postId: number } | { activityId: number }

type MediaItem =
  | { id: string; source: "saved"; url: string }
  | { id: string; source: "new"; file: File; previewUrl: string; kind: PostMediaKind }

interface EditPostSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The post, or the shared swim whose post is edited. */
  postRef: EditPostRef
}

/**
 * Edit text and photos of one's own post: feed, club or shared swim. People tagged apart by a
 * post from before «@» mentions (not written in its text) stay as chips the author can remove.
 * The Android back button closes the sheet.
 */
export function EditPostSheet({ open, onOpenChange, postRef }: EditPostSheetProps) {
  const utils = trpc.useUtils()
  const postQuery = trpc.community.ownPost.useQuery(postRef, { enabled: open, retry: false })
  const imageKitAuth = trpc.community.postImageKitAuth.useMutation()
  const postImageUpload = trpc.community.postUploadImage.useMutation()
  const cloudinaryVideoAuth = trpc.community.cloudinaryVideoAuth.useMutation()
  const updatePost = trpc.community.updatePost.useMutation()

  const [content, setContent] = useState("")
  const [mentions, setMentions] = useState<MentionUser[]>([])
  /** Tagged apart by an older post (not in its text): kept unless removed here. */
  const [taggedApart, setTaggedApart] = useState<MentionUser[]>([])
  const [media, setMedia] = useState<MediaItem[]>([])
  const [loadedPostId, setLoadedPostId] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const mediaInputRef = useRef<HTMLInputElement>(null)

  const post = postQuery.data
  // Fill the form once per opening, when the post arrives.
  useEffect(() => {
    if (!open || !post || loadedPostId === post.id) return
    const tagged = post.taggedUsers ?? []
    setContent(post.content ?? "")
    setMentions(tagged)
    setTaggedApart(
      taggedUsersNotInText(
        post.content,
        tagged.map((user) => ({ user_id: user.userId, name: user.name, username: user.username }))
      ).map((user) => ({ userId: user.user_id, name: user.name ?? null, username: user.username ?? null }))
    )
    setMedia(post.mediaUrls.map((url, index) => ({ id: `saved-${index}`, source: "saved", url })))
    setLoadedPostId(post.id)
  }, [open, post, loadedPostId])

  const reset = () => {
    media.forEach((item) => {
      if (item.source === "new") URL.revokeObjectURL(item.previewUrl)
    })
    setContent("")
    setMentions([])
    setTaggedApart([])
    setMedia([])
    setLoadedPostId(null)
  }

  const close = (next: boolean) => {
    if (!next) reset()
    onOpenChange(next)
  }

  useCloseOnBack(open, () => close(false), "swimforgeEditPostOpen")

  const pickMedia = (files: FileList | null) => {
    if (!files?.length) return
    const slots = MAX_POST_MEDIA_ITEMS - media.length
    if (slots <= 0) {
      toast.error(`Puoi allegare al massimo ${MAX_POST_MEDIA_ITEMS} media.`)
      return
    }
    const accepted: MediaItem[] = []
    Array.from(files)
      .slice(0, slots)
      .forEach((file) => {
        const validation = validatePostMediaFile(file)
        if (!validation.ok) {
          toast.error(validation.message)
          return
        }
        accepted.push({
          id: `new-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          source: "new",
          file,
          previewUrl: URL.createObjectURL(file),
          kind: validation.kind,
        })
      })
    if (accepted.length) setMedia((prev) => [...prev, ...accepted])
  }

  const removeMedia = (id: string) => {
    setMedia((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.source === "new") URL.revokeObjectURL(target.previewUrl)
      return prev.filter((item) => item.id !== id)
    })
  }

  const save = async () => {
    // One save at a time: the uploads take a while and the button may be tapped again.
    if (!post || savingRef.current) return
    savingRef.current = true
    setSaving(true)
    try {
      const mediaUrls: string[] = []
      for (const item of media) {
        if (item.source === "saved") {
          mediaUrls.push(item.url)
          continue
        }
        mediaUrls.push(
          await uploadActivityShareMedia({
            file: item.file,
            kind: item.kind,
            getImageKitAuth: () => imageKitAuth.mutateAsync(),
            uploadImageFallback: (payload) => postImageUpload.mutateAsync(payload),
            getCloudinaryAuth: () => cloudinaryVideoAuth.mutateAsync({ scope: "posts" }),
            notifyWarning: (message) => toast.warning(message),
          })
        )
      }
      const mentioned = pickedMentionIds(content, mentions)
      await updatePost.mutateAsync({
        postId: post.id,
        content: content.trim() || null,
        mediaUrls,
        taggedUserIds: [
          ...mentioned,
          ...taggedApart.map((user) => user.userId).filter((id) => !mentioned.includes(id)),
        ],
      })
      await Promise.all([
        utils.community.feed.invalidate(),
        utils.community.postById.invalidate({ postId: post.id }),
        utils.community.clubs.feed.invalidate(),
        utils.community.ownPost.invalidate(),
      ])
      toast.success("Post aggiornato.")
      close(false)
    } catch (error) {
      toast.error(errorToastMessage(error, "Non riesco a salvare il post."))
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={close}>
      <SheetContent side="bottom" className="max-h-[88dvh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>Modifica post</SheetTitle>
          <SheetDescription>Cambia il testo, togli o aggiungi foto e video.</SheetDescription>
        </SheetHeader>

        {postQuery.isError ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Non trovo il post: forse è stato eliminato.</p>
        ) : !post ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">Caricamento del post…</p>
        ) : (
          <div className="flex flex-col gap-4 px-4 pb-4">
            <MentionTextarea
              aria-label="Testo del post"
              value={content}
              onValueChange={setContent}
              mentions={mentions}
              onMentionsChange={setMentions}
              maxLength={post.clubId != null ? CLUB_POST_CONTENT_MAX_LENGTH : POST_CONTENT_MAX_LENGTH}
              rows={5}
              className="min-h-[120px] resize-none"
            />

            {taggedApart.length > 0 ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">Persone taggate nel post</p>
                <ul className="flex flex-wrap gap-2" aria-label="Persone taggate nel post">
                  {taggedApart.map((user) => {
                    const label = user.name?.trim() || user.username?.trim() || "Nuotatore"
                    return (
                      <li
                        key={user.userId}
                        className="flex items-center gap-1 rounded-full border border-border bg-raised py-1 pl-3 pr-1 text-sm"
                      >
                        {label}
                        <button
                          type="button"
                          onClick={() => setTaggedApart((prev) => prev.filter((item) => item.userId !== user.userId))}
                          className="flex size-6 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
                          aria-label={`Togli ${label} dal post`}
                        >
                          <X className="size-3.5" aria-hidden />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => mediaInputRef.current?.click()}>
                <ImagePlus className="size-4" aria-hidden />
                Aggiungi foto/video
              </Button>
              <span className="text-xs text-muted-foreground">
                {media.length}/{MAX_POST_MEDIA_ITEMS} media
              </span>
            </div>
            <input
              ref={mediaInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp,video/mp4,video/webm,video/quicktime,video/x-m4v"
              className="hidden"
              aria-label="Scegli foto o video"
              onChange={(event) => {
                pickMedia(event.target.files)
                event.target.value = ""
              }}
            />

            {media.length > 0 ? (
              <ul className="grid grid-cols-2 gap-2" aria-label="Media del post">
                {media.map((item, index) => {
                  const url = item.source === "saved" ? item.url : item.previewUrl
                  const isVideo = item.source === "new" ? item.kind === "video" : isVideoUrl(url)
                  return (
                    <li key={item.id} className="relative overflow-hidden rounded-xl border border-border bg-raised">
                      {isVideo ? (
                        <video src={url} className="h-36 w-full object-cover" muted controls playsInline />
                      ) : (
                        <img src={url} alt={`Media ${index + 1}`} className="h-36 w-full object-cover" loading="lazy" />
                      )}
                      <button
                        type="button"
                        onClick={() => removeMedia(item.id)}
                        className="absolute right-1 top-1 rounded-full border border-border bg-background p-1 text-foreground"
                        aria-label={`Togli il media ${index + 1}`}
                      >
                        <X className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}

            <Button type="button" onClick={() => void save()} disabled={saving} className="w-full">
              {saving ? "Salvataggio…" : "Salva modifiche"}
            </Button>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
