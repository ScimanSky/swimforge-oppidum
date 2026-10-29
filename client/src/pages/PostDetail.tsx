import { useRoute } from "wouter";
import AppLayout from "@/components/AppLayout";
import { LoadError, LoadingSkeleton, Notice } from "@/components/corsia/LoadState";
import FeedPost from "@/components/social/FeedPost";
import type { FeedPostRecord } from "@/components/social/feed-types";
import { trpc } from "@/lib/trpc";
import { errorToastMessage } from "@/lib/trpc-errors";

/** `/post/:id` (notifications, shared links): one feed post; the shell header has «Post» and the back button. */
export default function PostDetail() {
  const [match, params] = useRoute("/post/:postId");
  const postId = Number(params?.postId);
  const validId = match && Number.isInteger(postId) && postId > 0;

  const profileQuery = trpc.profile.get.useQuery();
  const currentUserId = profileQuery.data?.userId;
  const autoplayVideos = (() => {
    const value = (profileQuery.data?.preferences as Record<string, unknown> | null | undefined)?.autoplayVideos;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() !== "false";
    if (typeof value === "number") return value !== 0;
    return true;
  })();

  const postQuery = trpc.community.postById.useQuery({ postId }, { enabled: validId });

  const notFound = <Notice backHref="/home" backLabel="Torna al feed">Post non trovato.</Notice>;
  let content;
  if (!validId) {
    content = notFound;
  } else if (postQuery.isPending) {
    content = <LoadingSkeleton label="Caricamento del post…" count={1} itemClassName="h-64 w-full rounded-2xl" />;
  } else if (postQuery.isError) {
    const code = postQuery.error.data?.code;
    content =
      code === "NOT_FOUND" ? (
        notFound
      ) : code === "FORBIDDEN" ? (
        // The server's reason when it gives one (a club post: «Devi iscriverti al club…»).
        <Notice backHref="/home" backLabel="Torna al feed">
          {errorToastMessage(postQuery.error, "Questo post non è visibile per te.")}
        </Notice>
      ) : (
        <LoadError onRetry={() => void postQuery.refetch()} />
      );
  } else if (!postQuery.data) {
    content = notFound;
  } else {
    content = (
      <FeedPost
        post={postQuery.data as unknown as FeedPostRecord}
        currentUserId={currentUserId}
        autoplayVideos={autoplayVideos}
      />
    );
  }

  return (
    <AppLayout>
      <div className="max-w-2xl">{content}</div>
    </AppLayout>
  );
}
