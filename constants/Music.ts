/**
 * Which server gain evens out the loudness of music tracks. `album` keeps the
 * level differences inside an album and falls back to `track` when the album
 * has no gain; `track` falls back to leaving the track alone.
 */
export const MUSIC_NORMALIZATION_MODES = ["off", "track", "album"] as const;
export type MusicNormalizationMode = (typeof MUSIC_NORMALIZATION_MODES)[number];

/**
 * Off, so an update does not make everyone's music quieter: almost every gain
 * is negative, since the server levels to -18 LUFS and most masters are louder.
 */
export const DEFAULT_MUSIC_NORMALIZATION_MODE: MusicNormalizationMode = "off";

/**
 * Ceiling on the linear gain applied to a track. The player volume cannot
 * amplify, and a gain above 1 would clip a full scale master anyway, so a
 * track the server wants louder plays untouched instead.
 */
export const MUSIC_NORMALIZATION_MAX_VOLUME = 1;

/**
 * How far a music video's duration may sit from its audio twin's and still be
 * taken for the same recording. The audio is copied out of the video
 * (`-c:a copy`), so the two run the same length; anything seconds off is
 * another version, and switching into it would land in the wrong place.
 */
export const MUSIC_VIDEO_MAX_DURATION_DELTA_TICKS = 2 * 10_000_000;

/**
 * How many items one "does this track have a music video?" search may answer
 * with. The name and the artist decide among them; the ask is small because
 * every track the player shows makes it once per session.
 */
export const MUSIC_VIDEO_SEARCH_LIMIT = 25;

/**
 * How many resolved tracks the session keeps, a miss included. Only the track
 * being played is resolved, so this fills over a long listening session, and a
 * bounded cache means a shuffle through a huge library does not keep every id
 * it saw.
 */
export const MUSIC_VIDEO_CACHE_LIMIT = 200;

/** MMKV key of the index of stored tracks: user downloads and the look-ahead cache. */
export const AUDIO_STORAGE_INDEX_KEY = "audio_storage.v1.json";

/** How many upcoming songs the music cache can fetch ahead, as its settings offer. */
export const MUSIC_LOOKAHEAD_COUNTS = [1, 2, 3, 5] as const;
