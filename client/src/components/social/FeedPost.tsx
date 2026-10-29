import { useState } from "react"
import { Link } from "wouter"
import FeedPostHeader from "./FeedPostHeader"
import FeedPostMetrics from "./FeedPostMetrics"
import FeedPostActions from "./FeedPostActions"
import FeedPostComments from "./FeedPostComments"
import { isVideoUrl } from "@/lib/post-media"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { extractFirstUrl, LinkPreviewCard, renderSocialText } from "@/lib/social-content"
import type { FeedPostRecord } from "./feed-types"

interface FeedPostProps {
  post: FeedPostRecord
  currentUserId?: number
  autoplayVideos?: boolean
}

function normalizeArrayField(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((item) => String(item)).filter((item) => item.trim().length > 0)
  }
  if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}")) {
    return raw
      .slice(1, -1)
      .split(",")
      .map((item) => item.replace(/^"|"$/g, "").trim())
      .filter((item) => item.length > 0)
  }
  return []
}

function parseTaggedUsers(raw: unknown): Array<{ user_id: number; name?: string | null; username?: string | null }> {
  if (Array.isArray(raw)) return raw as Array<{ user_id: number; name?: string | null; username?: string | null }>
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed as Array<{ user_id: number; name?: string | null; username?: string | null }>
    } catch {
      return []
    }
  }
  return []
}

/** Hashtags, mentions and links in the action colour (Corsia). */
const SOCIAL_TEXT_CLASSES = {
  hashtagClassName: "font-medium text-action-text",
  mentionClassName: "font-medium text-action-text",
  linkClassName: "font-medium text-action-text underline decoration-dotted underline-offset-2 hover:opacity-85",
}

/** «Nuotata in vasca» / «Nuotata in acque libere»; just «Nuotata» when the type is unknown. */
function activityTitle(isOpenWater: boolean | null | undefined) {
  if (isOpenWater == null) return "Nuotata"
  return isOpenWater ? "Nuotata in acque libere" : "Nuotata in vasca"
}

/**
 * One feed post (Corsia, `renders/Feed.png`): header, text, compact activity card, media at
 * full width (never text on top), reactions; posts are separated by a rule, not boxed.
 */
export default function FeedPost({ post, currentUserId, autoplayVideos = true }: FeedPostProps) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [openMediaUrl, setOpenMediaUrl] = useState<string | null>(null)
  const isOwner = !!(currentUserId && post.user_id === currentUserId)
  const isActivityPost =
    Boolean(post.activity_id) ||
    Boolean(post.activity_source) ||
    post.activity_is_open_water != null ||
    Number(post.activity_distance_meters ?? 0) > 0 ||
    Number(post.activity_duration_seconds ?? 0) > 0
  const mediaUrls = normalizeArrayField(post.media_urls)
  const allMedia = mediaUrls.length > 0
    ? mediaUrls
    : (post.media_url ? [String(post.media_url)] : [])
  /** « 1 di 3» when the post has several media, nothing for a single one. */
  const mediaPosition = (idx: number, separator = "") =>
    allMedia.length > 1 ? `${separator} ${idx + 1} di ${allMedia.length}` : ""
  const taggedUsers = parseTaggedUsers(post.tagged_users)
  const hashtags = normalizeArrayField(post.hashtags)
  const firstLink = post.content ? extractFirstUrl(post.content) : null

  return (
    <article className="border-b border-border pb-1">
      <FeedPostHeader post={post} isOwner={isOwner} isFollowing={post.is_following} />

      <div className="space-y-3 pt-2">
        {post.content ? (
          <p className="whitespace-pre-wrap text-[15px] text-foreground">
            {renderSocialText(post.content, SOCIAL_TEXT_CLASSES)}
          </p>
        ) : null}
        {firstLink ? <LinkPreviewCard url={firstLink} /> : null}

        {isActivityPost ? (
          <FeedPostMetrics
            title={activityTitle(post.activity_is_open_water)}
            distanceMeters={post.activity_distance_meters}
            durationSeconds={post.activity_duration_seconds}
            heartRate={post.activity_heart_rate}
            swolf={post.activity_swolf}
          />
        ) : null}

        {taggedUsers.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {taggedUsers.map((user) => (
              <Link
                key={user.user_id}
                href={`/u/${user.user_id}`}
                className="inline-flex h-7 items-center rounded-full bg-raised px-3 text-xs font-semibold text-action-text hover:bg-raised/70"
              >
                @{user.username || user.name || `u${user.user_id}`}
              </Link>
            ))}
          </div>
        ) : null}

        {allMedia.length > 0 ? (
          <div className={`grid gap-1.5 ${allMedia.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
            {allMedia.map((url, idx) => (
              <div key={`${url}-${idx}`} className="overflow-hidden rounded-xl bg-raised">
                {isVideoUrl(url) ? (
                  <video
                    src={url}
                    className="max-h-[420px] w-full object-cover"
                    controls
                    playsInline
                    preload="metadata"
                    autoPlay={autoplayVideos}
                    muted={autoplayVideos}
                    loop={autoplayVideos}
                  />
                ) : (
                  <button
                    type="button"
                    className="block w-full cursor-zoom-in"
                    onClick={() => setOpenMediaUrl(url)}
                    aria-label={`Apri la foto${mediaPosition(idx)}`}
                  >
                    <img
                      src={url}
                      alt={`Foto del post${mediaPosition(idx, ",")}`}
                      className="max-h-[420px] w-full object-cover"
                      loading="lazy"
                    />
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : null}

        {!post.content && hashtags.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {hashtags.map((tag) => (
              <span key={tag} className="text-sm font-medium text-action-text">
                #{tag}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <FeedPostActions
        post={post}
        onToggleComments={() => setCommentsOpen(!commentsOpen)}
        commentsOpen={commentsOpen}
      />

      <FeedPostComments postId={post.id} isOpen={commentsOpen} />

      <Dialog open={Boolean(openMediaUrl)} onOpenChange={(open) => !open && setOpenMediaUrl(null)}>
        <DialogContent className="max-w-5xl border-border bg-background p-2">
          <DialogTitle className="sr-only">Anteprima immagine</DialogTitle>
          <DialogDescription className="sr-only">Visualizzazione dell'immagine del post.</DialogDescription>
          {openMediaUrl ? (
            <img
              src={openMediaUrl}
              alt="Anteprima immagine del post"
              className="max-h-[82vh] w-full rounded-xl object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </article>
  )
}
