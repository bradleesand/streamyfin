import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { useCallback } from "react";
import useRouter from "@/hooks/useAppRouter";
import { useMusicPlayer } from "@/providers/MusicPlayerProvider";
import { beginMusicVideoRoundTrip } from "@/utils/music/musicVideoRoundTrip";
import { toDirectPlayerQuery } from "@/utils/nativePlayer/playRequest";
import { secondsToTicks } from "@/utils/time";

/**
 * The Watch half of the toggle: pause the song where it is, open its music
 * video at that same position, and leave the audio queue untouched so the
 * music player can carry on when the video closes (see
 * musicVideoRoundTrip.ts and the music provider's return handler).
 */
export const useWatchMusicVideo = () => {
  const router = useRouter();
  const { currentTrack, getCurrentPosition, pause } = useMusicPlayer();

  return useCallback(
    async (video: BaseItemDto | null | undefined) => {
      if (!video?.Id || !currentTrack?.Id) return;
      // Paused first: the position is read from the native player, and one
      // read while it still plays is already a moment behind by the time the
      // video starts on it.
      await pause();
      const positionSec = await getCurrentPosition();

      beginMusicVideoRoundTrip({
        trackId: currentTrack.Id,
        videoItemId: video.Id,
      });

      // The page player, not the native one: the native chrome is a presented
      // view controller with no JS of its own, so the position could not come
      // back from it.
      router.push(
        `/player/direct-player?${toDirectPlayerQuery({
          itemId: video.Id,
          offline: false,
          playbackPositionTicks: secondsToTicks(positionSec),
        })}`,
      );
    },
    [currentTrack?.Id, getCurrentPosition, pause, router],
  );
};
