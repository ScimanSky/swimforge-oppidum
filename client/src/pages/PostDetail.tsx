import { useRoute } from "wouter";
import { ArrowLeft } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import FeedPost from "@/components/social/FeedPost";
import type { FeedPostRecord } from "@/components/social/feed-types";
import { trpc } from "@/lib/trpc";

export default function PostDetail() {
  const [match, params] = useRoute("/post/:postId");
  const postId = Number(params?.postId);

  const profileQuery = trpc.profile.get.useQuery();
  const currentUserId = profileQuery.data?.userId;
  const autoplayVideos = (() => {
    const value = (profileQuery.data?.preferences as Record<string, unknown> | null | undefined)?.autoplayVideos;
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return value.toLowerCase() !== "false";
    if (typeof value === "number") return value !== 0;
    return true;
  })();

  const postQuery = trpc.community.postById.useQuery(
    { postId },
    { enabled: match && Number.isFinite(postId) && postId > 0 }
  );

  return (
    <AppLayout>
      <div className="compact-shell space-y-3 lg:space-y-4">
        <div>
          <Button variant="outline-neon" size="sm" onClick={() => window.history.back()}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Indietro
          </Button>
        </div>

        {!match || !Number.isFinite(postId) || postId <= 0 ? (
          <div className="surface-panel p-6 text-sm text-muted-foreground">Post non valido.</div>
        ) : postQuery.isLoading ? (
          <div className="surface-panel p-6 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : postQuery.error ? (
          <div className="surface-panel p-6 text-sm text-muted-foreground">
            {postQuery.error.message || "Post non disponibile."}
          </div>
        ) : postQuery.data ? (
          <FeedPost
            post={postQuery.data as unknown as FeedPostRecord}
            currentUserId={currentUserId}
            autoplayVideos={autoplayVideos}
          />
        ) : (
          <div className="surface-panel p-6 text-sm text-muted-foreground">Post non trovato.</div>
        )}
      </div>
    </AppLayout>
  );
}
