import type { Api } from "@jellyfin/sdk";
import {
  type BaseItemDto,
  ItemFields,
} from "@jellyfin/sdk/lib/generated-client/models";
import { getLibraryApi } from "@jellyfin/sdk/lib/utils/api";
import {
  MUSIC_VIDEO_CACHE_LIMIT,
  MUSIC_VIDEO_SEARCH_LIMIT,
} from "@/constants/Music";
import { pickMusicVideoPair } from "@/utils/music/musicVideoPair";

/**
 * What a track id resolved to, for the rest of the session. `null` is a miss
 * and is kept: a track with no music video must not send its search again
 * every time the player re-renders.
 */
const resolved = new Map<string, BaseItemDto | null>();

/** Searches still in flight, so a re-render joins the one request, not a new. */
const inFlight = new Map<string, Promise<BaseItemDto | null>>();

const cacheKey = (userId: string, trackId: string) => `${userId}:${trackId}`;

/** Drops the session's answers. Only for specs: the app keeps them until it exits. */
export const resetMusicVideoLookupCache = () => {
  resolved.clear();
  inFlight.clear();
};

const remember = (key: string, pair: BaseItemDto | null) => {
  // Oldest out first: Map iteration is insertion order.
  if (resolved.size >= MUSIC_VIDEO_CACHE_LIMIT) {
    const oldest = resolved.keys().next();
    if (!oldest.done) resolved.delete(oldest.value);
  }
  resolved.set(key, pair);
};

const searchMusicVideos = async (
  api: Api,
  userId: string,
  track: BaseItemDto,
): Promise<BaseItemDto[]> => {
  const response = await getLibraryApi(api).getItems({
    userId,
    recursive: true,
    includeItemTypes: ["MusicVideo"],
    searchTerm: track.Name ?? undefined,
    // `Artists` rides on the People field (the SDK has no ItemFields.Artists
    // of its own), and RunTimeTicks comes on every item.
    fields: [ItemFields.Path, ItemFields.People],
    // The name and the artist narrow the answer below; a relevance order is
    // not something the resolver relies on.
    limit: MUSIC_VIDEO_SEARCH_LIMIT,
    enableTotalRecordCount: false,
  });
  return response.data.Items ?? [];
};

/**
 * The music video that is the audio twin of `track`, or null.
 *
 * A track with no twin is the normal case: the library was grabbed as audio
 * only, or the video is there without its pair. Nothing is thrown and nothing
 * is reported — the caller shows no button, which is the whole treatment.
 */
export const findMusicVideoPair = async ({
  api,
  userId,
  track,
}: {
  api: Api | null | undefined;
  userId: string | undefined;
  track: BaseItemDto | null | undefined;
}): Promise<BaseItemDto | null> => {
  // A music video has no twin of its own, and a track without a name or an id
  // cannot be asked about.
  if (!api || !userId || !track?.Id || !track.Name) return null;
  if (track.Type && track.Type !== "Audio") return null;

  const key = cacheKey(userId, track.Id);
  if (resolved.has(key)) return resolved.get(key) ?? null;

  const pending = inFlight.get(key);
  if (pending) return pending;

  const request = searchMusicVideos(api, userId, track)
    .then((candidates) => {
      // Only an answer is remembered: a search that failed (no music videos
      // library, a server that blinked) leaves nothing to remember, so the
      // next render asks again.
      const pair = pickMusicVideoPair(track, candidates);
      remember(key, pair);
      return pair;
    })
    .catch(() => null)
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, request);
  return request;
};
