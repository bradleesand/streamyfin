/**
 * The Watch toggle's hand-over between the two players.
 *
 * The music player is paused, the video opens at the audio's position, and
 * when the video closes the audio continues from where the video stopped. The
 * video route and the music provider are on opposite sides of a navigation
 * push, so neither can hand the position to the other directly: this module is
 * the one thing both hold, and the position lives here while the video plays.
 *
 * Module state, not an atom: nothing renders from it. The button reads the
 * resolved pair (see useMusicVideoPair), and the only reader of this is the
 * music provider, on the event below.
 */

interface RoundTrip {
  trackId: string;
  videoItemId: string;
}

let active: RoundTrip | null = null;
let lastVideoPositionSec: number | null = null;

/** What the music player needs to pick the audio back up where the video left it. */
export interface MusicVideoRoundTripEnd {
  /** The track that was paused when the toggle opened the video. */
  trackId: string;
  /** The video's last position, in seconds. */
  positionSec: number;
}

const finished = new Set<(end: MusicVideoRoundTripEnd) => void>();

/** Marks a pair as the thing on screen, before the video route opens. */
export const beginMusicVideoRoundTrip = (trip: RoundTrip) => {
  active = trip;
  lastVideoPositionSec = null;
};

/** Whether a video opened by the toggle is what the app is playing. */
export const isMusicVideoRoundTrip = () => active !== null;

/**
 * Whether this item is the video the toggle opened. A music video played
 * straight from its library is not, and must hand nothing back to the music
 * player — which may well be on an unrelated song.
 */
export const isMusicVideoRoundTripFor = (
  videoItemId: string | null | undefined,
) => !!active && !!videoItemId && active.videoItemId === videoItemId;

/**
 * The video player's position, in seconds. Ignored unless the item is the one
 * the toggle opened: every other video plays through the same page, and its
 * position is none of the music player's business.
 */
export const reportMusicVideoPosition = (
  videoItemId: string | null | undefined,
  positionSec: number,
) => {
  if (!active || !videoItemId || active.videoItemId !== videoItemId) return;
  if (!Number.isFinite(positionSec) || positionSec < 0) return;
  lastVideoPositionSec = positionSec;
};

/**
 * The video closed: tell the music player where to continue from, once. A
 * video that never reported a position (closed before the first tick) hands
 * back nothing, and the audio stays where it was paused.
 */
export const endMusicVideoRoundTrip = () => {
  if (!active) return;
  const trip = active;
  const positionSec = lastVideoPositionSec;
  active = null;
  lastVideoPositionSec = null;
  if (positionSec === null) return;
  const end = { trackId: trip.trackId, positionSec };
  for (const listener of finished) listener(end);
};

/**
 * Listens for a finished round trip: which track it was, and the video's last
 * position in seconds.
 */
export const onMusicVideoRoundTripFinished = (
  listener: (end: MusicVideoRoundTripEnd) => void,
) => {
  finished.add(listener);
  return () => {
    finished.delete(listener);
  };
};
