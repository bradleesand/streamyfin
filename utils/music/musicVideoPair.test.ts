import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { MUSIC_VIDEO_MAX_DURATION_DELTA_TICKS } from "@/constants/Music";
import {
  normalizeMusicVideoName,
  pickMusicVideoPair,
  trackArtists,
} from "./musicVideoPair";

/** Five minutes, in ticks: both files are copies of one recording. */
const DURATION = 30_000_000_000;

const track = (overrides: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: "track-1",
  Type: "Audio",
  Name: "Anti-Hero",
  Artists: ["Taylor Swift"],
  RunTimeTicks: DURATION,
  ...overrides,
});

const video = (overrides: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: "video-1",
  Type: "MusicVideo",
  Name: "Anti-Hero",
  Artists: ["Taylor Swift"],
  RunTimeTicks: DURATION,
  ...overrides,
});

describe("normalizeMusicVideoName", () => {
  test.each([
    ["Anti-Hero", "anti hero"],
    ["  ANTI   HERO  ", "anti hero"],
    ["Anti-Hero (Official Video)", "anti hero"],
    ["Anti-Hero [Official Music Video]", "anti hero"],
    ["Anti-Hero (Official HD Video)", "anti hero"],
    ["Anti-Hero (Official Video) (HD)", "anti hero"],
    ["Rock & Roll", "rock roll"],
    ["Beyoncé", "beyonce"],
  ])("reads %s as %s", (name, expected) => {
    expect(normalizeMusicVideoName(name)).toBe(expected);
  });

  // A different recording, not marketing copy around the same one.
  test.each([
    ["Anti-Hero (Live)"],
    ["Anti-Hero (Remix)"],
    ["Anti-Hero (Acoustic)"],
    ["Anti-Hero (Lyric Video)"],
  ])("keeps %s distinct from the album track", (name) => {
    expect(normalizeMusicVideoName(name)).not.toBe(
      normalizeMusicVideoName("Anti-Hero"),
    );
  });

  test("an empty name normalizes to nothing", () => {
    expect(normalizeMusicVideoName(undefined)).toBe("");
    expect(normalizeMusicVideoName("  ...  ")).toBe("");
  });
});

describe("trackArtists", () => {
  test("uses the track's artists", () => {
    expect(trackArtists(track())).toEqual(["Taylor Swift"]);
  });

  // An album artist on a compilation reads "Various Artists", so it is only a
  // stand-in when the file has no artist of its own.
  test("falls back to the album artist", () => {
    expect(
      trackArtists(track({ Artists: [], AlbumArtist: "Taylor Swift" })),
    ).toEqual(["Taylor Swift"]);
  });

  test("has none when the track names no one", () => {
    expect(trackArtists(track({ Artists: [], AlbumArtist: null }))).toEqual([]);
  });
});

describe("pickMusicVideoPair", () => {
  test("finds the video of the same song by the same artist", () => {
    const pair = pickMusicVideoPair(track(), [
      video({ Id: "other", Name: "Adele - Someone Like You" }),
      video(),
    ]);

    expect(pair?.Id).toBe("video-1");
  });

  // The downloader writes the title tag from the site's copy; the audio twin's
  // tag is the song's own name.
  test("ignores the marketing copy around the video's title", () => {
    const pair = pickMusicVideoPair(track(), [
      video({ Name: "Anti-Hero (Official Music Video)" }),
    ]);

    expect(pair?.Id).toBe("video-1");
  });

  test("accepts a title tagged from the filename", () => {
    const pair = pickMusicVideoPair(track(), [
      video({ Name: "Taylor Swift - Anti-Hero" }),
    ]);

    expect(pair?.Id).toBe("video-1");
  });

  test("ignores case, accents and punctuation", () => {
    const pair = pickMusicVideoPair(
      track({ Name: "Beyonce - Halo", Artists: ["Beyoncé"] }),
      [
        video({
          Name: "BEYONCE -- HALO (Official Video)",
          Artists: ["beyonce"],
        }),
      ],
    );

    expect(pair?.Id).toBe("video-1");
  });

  test("gives up on a song by someone else", () => {
    const pair = pickMusicVideoPair(track(), [video({ Artists: ["Adele"] })]);

    expect(pair).toBeNull();
  });

  test("gives up on a song the library has no video of", () => {
    expect(
      pickMusicVideoPair(track(), [video({ Name: "Adele - Hello" })]),
    ).toBeNull();
  });

  test("gives up on a track with no name or no artists", () => {
    expect(pickMusicVideoPair(track({ Name: null }), [video()])).toBeNull();
    expect(pickMusicVideoPair(track({ Artists: [] }), [video()])).toBeNull();
  });

  // A remaster, a second upload, a live cut: the closest duration is the twin,
  // and the others are other versions.
  test("takes the video whose duration is closest to the track's", () => {
    const pair = pickMusicVideoPair(track(), [
      video({
        Id: "extended",
        Name: "Anti-Hero",
        RunTimeTicks: DURATION + 60 * 10_000_000,
      }),
      video({
        Id: "twin",
        Name: "Anti-Hero",
        RunTimeTicks: DURATION + 3_000_000,
      }),
    ]);

    expect(pair?.Id).toBe("twin");
  });

  // The audio is copied out of the video, so the two run the same length. A
  // couple of seconds off is a different version, and starting it would put
  // the video somewhere the song is not.
  test("gives up when the nearest video is seconds off", () => {
    const pair = pickMusicVideoPair(track(), [
      video({
        RunTimeTicks: DURATION + MUSIC_VIDEO_MAX_DURATION_DELTA_TICKS + 1,
      }),
    ]);

    expect(pair).toBeNull();
  });

  // A single candidate is still checked: the only video of that name by that
  // artist can be the extended cut, and starting it lands somewhere the song
  // is not.
  test("accepts a lone video whose duration is unknown", () => {
    const pair = pickMusicVideoPair(track(), [video({ RunTimeTicks: null })]);

    expect(pair?.Id).toBe("video-1");
  });

  test("accepts a video within the tolerance", () => {
    const pair = pickMusicVideoPair(track(), [
      video({ RunTimeTicks: DURATION + MUSIC_VIDEO_MAX_DURATION_DELTA_TICKS }),
    ]);

    expect(pair?.Id).toBe("video-1");
  });

  test("gives up when two videos are equally close", () => {
    const pair = pickMusicVideoPair(track(), [
      video({ Id: "one", RunTimeTicks: DURATION - 4_000_000 }),
      video({ Id: "two", RunTimeTicks: DURATION + 4_000_000 }),
    ]);

    expect(pair).toBeNull();
  });

  test("gives up when neither video carries a duration", () => {
    const pair = pickMusicVideoPair(track(), [
      video({ Id: "one", RunTimeTicks: null }),
      video({ Id: "two", RunTimeTicks: null }),
    ]);

    expect(pair).toBeNull();
  });

  // A library scanned before the downloader wrote its artist tags has items
  // with no artists at all. The name and the duration can still carry the
  // match, but a confirmed one always wins.
  test("falls back to an item without artists", () => {
    const pair = pickMusicVideoPair(track(), [
      video({ Id: "unattributed", Artists: [] }),
    ]);

    expect(pair?.Id).toBe("unattributed");
  });

  test("prefers an item with the artist over one without", () => {
    const pair = pickMusicVideoPair(track(), [
      video({ Id: "unattributed", Artists: [], RunTimeTicks: DURATION }),
      video({ Id: "confirmed", RunTimeTicks: DURATION + 5_000_000 }),
    ]);

    expect(pair?.Id).toBe("confirmed");
  });

  // Jellyfin names a single-video artist folder after the folder on some
  // servers; that name is not the song's, so it cannot be mistaken for it.
  test("gives up when the name only shares a word", () => {
    const pair = pickMusicVideoPair(track(), [video({ Name: "Anti-Heroes" })]);

    expect(pair).toBeNull();
  });
});
