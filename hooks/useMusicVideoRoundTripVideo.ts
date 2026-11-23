import { useEffect } from "react";
import {
  endMusicVideoRoundTrip,
  isMusicVideoRoundTripFor,
} from "@/utils/music/musicVideoRoundTrip";

/**
 * Ties a Watch-toggled video's presence on screen to the audio's return: while
 * the page is up the video reports its position (the player does that from its
 * own progress handler), and when it goes away the music player is told where
 * to continue.
 *
 * The item id is a dependency on purpose: a music video library can be played
 * as a queue, and the in-place swap to the next one ends the round trip of the
 * one the toggle opened.
 */
export const useMusicVideoRoundTripVideo = (
  videoItemId: string | null | undefined,
) => {
  useEffect(() => {
    if (!isMusicVideoRoundTripFor(videoItemId)) return;
    return () => endMusicVideoRoundTrip();
  }, [videoItemId]);
};
