import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useAtom } from "jotai";
import { useEffect, useState } from "react";
import { apiAtom, userAtom } from "@/providers/JellyfinProvider";
import { findMusicVideoPair } from "@/utils/music/musicVideoLookup";

/**
 * The music video that is the audio twin of `track`, or null when it has none.
 *
 * Null is the answer for most tracks, and it stays quiet: no button, no error,
 * no request once the track has been asked about — the lookup keeps its
 * answers for the session.
 *
 * The answer is kept with the track it belongs to, so a re-render during the
 * next lookup does not make the button flicker out and back.
 */
export const useMusicVideoPair = (track: BaseItemDto | null | undefined) => {
  const [api] = useAtom(apiAtom);
  const [user] = useAtom(userAtom);
  const [answer, setAnswer] = useState<{
    trackId: string;
    pair: BaseItemDto | null;
  } | null>(null);

  const trackId = track?.Id ?? null;

  useEffect(() => {
    if (!trackId) return;
    let live = true;
    void findMusicVideoPair({ api, userId: user?.Id, track }).then((pair) => {
      if (live) setAnswer({ trackId, pair });
    });
    return () => {
      live = false;
    };
  }, [api, user?.Id, track, trackId]);

  return answer?.trackId === trackId ? answer.pair : null;
};
