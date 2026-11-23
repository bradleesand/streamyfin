import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import { MUSIC_VIDEO_SEARCH_LIMIT } from "@/constants/Music";
import { makeApi } from "@/test-utils/jellyfinApi";
import {
  findMusicVideoPair,
  resetMusicVideoLookupCache,
} from "./musicVideoLookup";

const DURATION = 21_000_000_000;

const track: BaseItemDto = {
  Id: "track-1",
  Type: "Audio",
  Name: "Anti-Hero",
  Artists: ["Taylor Swift"],
  RunTimeTicks: DURATION,
};

const musicVideo = (overrides: Partial<BaseItemDto> = {}): BaseItemDto => ({
  Id: "video-1",
  Type: "MusicVideo",
  Name: "Anti-Hero",
  Artists: ["Taylor Swift"],
  RunTimeTicks: DURATION,
  ...overrides,
});

/** The one request the api sent: its path and its query. */
const sentRequest = (api: ReturnType<typeof makeApi>) => {
  expect(api.mock.history.get).toHaveLength(1);
  const url = new URL(api.mock.history.get[0].url ?? "");
  return { path: url.pathname, query: url.searchParams };
};

beforeEach(() => {
  resetMusicVideoLookupCache();
});

describe("findMusicVideoPair", () => {
  test("asks the library for music videos named like the track", async () => {
    const api = makeApi({ Items: [musicVideo()] });

    const pair = await findMusicVideoPair({ api, userId: "user-1", track });

    expect(pair?.Id).toBe("video-1");
    const { path, query } = sentRequest(api);
    expect(path).toBe("/Items");
    expect(query.get("includeItemTypes")).toBe("MusicVideo");
    expect(query.get("searchTerm")).toBe("Anti-Hero");
    expect(query.get("recursive")).toBe("true");
    expect(query.get("userId")).toBe("user-1");
    expect(query.get("limit")).toBe(String(MUSIC_VIDEO_SEARCH_LIMIT));
    // RunTimeTicks rides on every item; the artists behind the People field
    // are what the pairing rule reads.
    expect(query.getAll("fields")).toContain("People");
  });

  // Most tracks have no video: the answer is a miss, and re-rendering the
  // player must not ask again.
  test("remembers a track with no video", async () => {
    const api = makeApi({ Items: [] });

    expect(
      await findMusicVideoPair({ api, userId: "user-1", track }),
    ).toBeNull();
    expect(
      await findMusicVideoPair({ api, userId: "user-1", track }),
    ).toBeNull();

    expect(api.mock.history.get).toHaveLength(1);
  });

  test("remembers a track with one", async () => {
    const api = makeApi({ Items: [musicVideo()] });

    const first = await findMusicVideoPair({ api, userId: "user-1", track });
    const second = await findMusicVideoPair({ api, userId: "user-1", track });

    expect(second?.Id).toBe(first?.Id);
    expect(api.mock.history.get).toHaveLength(1);
  });

  // Two players, or a re-render before the first answer: one request, and both
  // callers get its result.
  test("joins a search already in flight", async () => {
    const api = makeApi({ Items: [musicVideo()] });

    const [first, second] = await Promise.all([
      findMusicVideoPair({ api, userId: "user-1", track }),
      findMusicVideoPair({ api, userId: "user-1", track }),
    ]);

    expect(first?.Id).toBe("video-1");
    expect(second?.Id).toBe("video-1");
    expect(api.mock.history.get).toHaveLength(1);
  });

  test("remembers per account", async () => {
    const api = makeApi({ Items: [musicVideo()] });

    await findMusicVideoPair({ api, userId: "user-1", track });
    await findMusicVideoPair({ api, userId: "user-2", track });

    expect(api.mock.history.get).toHaveLength(2);
  });

  // A server without a music videos library answers with an error, or the
  // request fails outright. Either is a miss: the player shows nothing, and
  // nothing is asked of the user.
  test("treats a failed search as a miss, and asks again later", async () => {
    const api = makeApi();
    api.mock.onGet(/\/Items/).networkError();

    expect(
      await findMusicVideoPair({ api, userId: "user-1", track }),
    ).toBeNull();
    expect(
      await findMusicVideoPair({ api, userId: "user-1", track }),
    ).toBeNull();

    expect(api.mock.history.get).toHaveLength(2);
  });

  test("does not ask about an item that is not a track", async () => {
    const api = makeApi({ Items: [musicVideo()] });

    const pair = await findMusicVideoPair({
      api,
      userId: "user-1",
      track: musicVideo(),
    });

    expect(pair).toBeNull();
    expect(api.mock.history.get).toHaveLength(0);
  });

  test("does not ask without a track, a user or a server", async () => {
    const api = makeApi({ Items: [musicVideo()] });

    expect(
      await findMusicVideoPair({ api, userId: "user-1", track: null }),
    ).toBeNull();
    expect(
      await findMusicVideoPair({ api, userId: undefined, track }),
    ).toBeNull();
    expect(
      await findMusicVideoPair({ api: null, userId: "user-1", track }),
    ).toBeNull();
    expect(api.mock.history.get).toHaveLength(0);
  });
});
