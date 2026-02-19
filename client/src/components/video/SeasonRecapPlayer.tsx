import { Player } from "@remotion/player";
import { SeasonRecapComposition, type SeasonRecapCompositionProps } from "./SeasonRecapComposition";
import {
  SEASON_RECAP_DURATION_FRAMES,
  SEASON_RECAP_FPS,
  SEASON_RECAP_HEIGHT,
  SEASON_RECAP_WIDTH,
} from "./season-recap-constants";

type SeasonRecapData = SeasonRecapCompositionProps["data"];

export function SeasonRecapPlayer({ data }: { data: SeasonRecapData }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/70 shadow-[0_0_34px_var(--neon-soft)]">
      <Player
        component={SeasonRecapComposition}
        durationInFrames={SEASON_RECAP_DURATION_FRAMES}
        fps={SEASON_RECAP_FPS}
        compositionHeight={SEASON_RECAP_HEIGHT}
        compositionWidth={SEASON_RECAP_WIDTH}
        controls
        loop
        autoPlay={false}
        inputProps={{ data }}
        style={{
          width: "100%",
          maxHeight: "72vh",
          aspectRatio: `${SEASON_RECAP_WIDTH} / ${SEASON_RECAP_HEIGHT}`,
        }}
      />
    </div>
  );
}

