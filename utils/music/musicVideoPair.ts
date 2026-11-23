import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { MUSIC_VIDEO_MAX_DURATION_DELTA_TICKS } from "@/constants/Music";

/**
 * Marketing copy a music video's title carries and its audio twin does not.
 * Both files come from one download, but the video's tag can keep the words
 * the site put around the song name ("(Official Video)", "[Official Music
 * Video]"). Longest first, so a phrase is removed whole before its shorter
 * prefix is looked for.
 *
 * Deliberately not listed: "live", "remix", "acoustic", "lyric video". Those
 * name a different recording, and pairing them with the album track would
 * play a video that does not share the track's timeline.
 */
const IGNORABLE_TITLE_PHRASES = [
  "official music video",
  "official video",
  "official mv",
  "music video",
];

/**
 * Quality markers a title carries around the rest of its copy. Stripped
 * before the phrases above, so "(Official HD Video)" loses its "hd" and then
 * reads as "(Official Video)".
 */
const QUALITY_MARKER = /\b(?:hd|uhd|4k|8k|1080p|720p|2160p)\b/g;

/**
 * A name reduced to what it says, not how it is written: case, accents,
 * punctuation and the marketing copy above are dropped. "Anti-Hero (Official
 * Video)" and "anti hero" both come out as "anti hero".
 */
export const normalizeMusicVideoName = (name: string | null | undefined) => {
  let normalized = (name ?? "")
    .normalize("NFKD")
    // Diacritics, which the video's tag may spell and the audio's not.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    // Punctuation and symbols are word breaks, not characters: "Anti-Hero"
    // and "anti hero" are the same song, and so are "Rock & Roll" and
    // "rock roll".
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

  // Collapsed between the passes: each one removes a word and leaves the
  // spaces around it, and "official  video" is not the phrase being looked for.
  const collapse = (value: string) => value.replace(/\s+/g, " ").trim();

  normalized = collapse(normalized.replace(QUALITY_MARKER, " "));
  for (const phrase of IGNORABLE_TITLE_PHRASES) {
    normalized = collapse(normalized.replace(phrase, " "));
  }

  return normalized;
};

/**
 * The names a music video answers to: its own, and the one with the artist's
 * name in front of it, which is how a title tagged from a filename reads
 * ("Taylor Swift - Anti-Hero"). The track's own name drops the prefix.
 */
const candidateTitles = (
  candidate: BaseItemDto,
  artists: string[],
): string[] => {
  const titles = new Set<string>();
  const name = candidate.Name ?? "";
  titles.add(normalizeMusicVideoName(name));

  const separator = /^(.+?)\s[-–—]\s(.+)$/.exec(name);
  if (separator) {
    const [, prefix, rest] = separator;
    const prefixName = normalizeMusicVideoName(prefix);
    if (
      artists.length === 0 ||
      artists.some((artist) => normalizeMusicVideoName(artist) === prefixName)
    ) {
      titles.add(normalizeMusicVideoName(rest));
    }
  }

  titles.delete("");
  return [...titles];
};

/**
 * The artists a track is by. `Artists` is the list the server built from the
 * file's tags; `AlbumArtist` is the fallback for a file tagged with one name
 * only, but it reads "Various Artists" on a compilation, so it is used only
 * when the track carries no `Artists`.
 */
export const trackArtists = (track: BaseItemDto): string[] => {
  const artists = (track.Artists ?? []).filter(Boolean);
  if (artists.length > 0) return artists;
  return track.AlbumArtist ? [track.AlbumArtist] : [];
};

/**
 * Which music video is the audio twin of a track, or null when the library
 * holds none we can be sure of.
 *
 * The pairing rule is the plan's: same name and a shared artist, and when
 * more than one video answers to both, the one whose duration is closest to
 * the track's. Both files are made from one download (`-c:a copy`), so their
 * timelines are the same length; a video that is seconds off is a different
 * version — the extended cut, the live take — and playing it would land the
 * switch in the wrong place.
 *
 * A candidate with no `Artists` is still eligible when nothing else answers:
 * the server fills those from the file's tags, and a library scanned before
 * the downloader wrote them has items without artists at all. Such a match
 * ranks below any confirmed one, since the name and the duration had to carry
 * it alone.
 */
export const pickMusicVideoPair = (
  track: BaseItemDto,
  candidates: BaseItemDto[],
  {
    maxDurationDeltaTicks = MUSIC_VIDEO_MAX_DURATION_DELTA_TICKS,
  }: { maxDurationDeltaTicks?: number } = {},
): BaseItemDto | null => {
  const artists = trackArtists(track);
  const trackTitle = normalizeMusicVideoName(track.Name);
  if (!trackTitle) return null;

  const named = candidates.filter((candidate) =>
    candidateTitles(candidate, artists).includes(trackTitle),
  );
  if (named.length === 0) return null;

  const normalizedArtists = artists
    .map(normalizeMusicVideoName)
    .filter(Boolean);
  const sharesAnArtist = (candidate: BaseItemDto) =>
    (candidate.Artists ?? [])
      .map(normalizeMusicVideoName)
      .some((artist) => artist && normalizedArtists.includes(artist));

  const artistConfirmed = named.filter(sharesAnArtist);
  const unattributed = named.filter(
    (candidate) => (candidate.Artists ?? []).length === 0,
  );
  const pool = artistConfirmed.length > 0 ? artistConfirmed : unattributed;

  if (pool.length === 0) return null;

  // A duration the server did not send cannot contradict the name and the
  // artist, which are what a single candidate already had to satisfy.
  const durationDelta = (candidate: BaseItemDto) =>
    track.RunTimeTicks && candidate.RunTimeTicks
      ? Math.abs(track.RunTimeTicks - candidate.RunTimeTicks)
      : null;

  if (pool.length === 1) {
    const [only] = pool;
    const delta = durationDelta(only);
    return delta !== null && delta > maxDurationDeltaTicks ? null : only;
  }

  // Several videos of the same song by the same artist (a remaster, a second
  // upload): the duration decides, and gives up when it cannot. An unknown
  // duration ranks last, and two of them are a tie.
  const ranked = pool
    .map((candidate) => ({
      candidate,
      delta: durationDelta(candidate) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.delta - b.delta);

  const [best, second] = ranked;
  if (!best || best.delta > maxDurationDeltaTicks) return null;
  // Two videos equally close, and the first was no nearer than the other: the
  // durations do not tell them apart, so neither can be called the twin.
  if (second && second.delta === best.delta) return null;

  return best.candidate;
};
