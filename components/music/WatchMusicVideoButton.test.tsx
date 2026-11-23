import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react-native";
import { WatchMusicVideoButton } from "./WatchMusicVideoButton";

const TRACK: BaseItemDto = {
  Id: "track-1",
  Type: "Audio",
  Name: "Anti-Hero",
  Artists: ["Taylor Swift"],
};

const VIDEO: BaseItemDto = {
  Id: "video-1",
  Type: "MusicVideo",
  Name: "Anti-Hero",
  Artists: ["Taylor Swift"],
};

// The lookup is a search over the network; what it answers is what this spec
// varies. It has its own spec, and so does the pairing rule it applies.
const mockPair = jest.fn<BaseItemDto | null, []>();
jest.mock("@/hooks/useMusicVideoPair", () => ({
  useMusicVideoPair: () => mockPair(),
}));

// The player, with the toggle's half of it: the pause, and the position read
// from it once paused.
const mockPlayer = {
  currentTrack: TRACK as BaseItemDto | null,
  pause: jest.fn(async () => undefined),
  getCurrentPosition: jest.fn(async () => 74),
};
jest.mock("@/providers/MusicPlayerProvider", () => ({
  useMusicPlayer: () => mockPlayer,
}));

jest.mock(
  "@/hooks/useAppRouter",
  () => jest.requireActual("@/test-utils/stubModules").appRouterModule,
);

let mockCastState: string | undefined;
jest.mock("react-native-google-cast", () => ({
  __esModule: true,
  CastState: { CONNECTED: "connected" },
  useCastState: () => mockCastState,
}));

const { appRouter } = jest.requireActual("@/test-utils/stubModules");

beforeEach(() => {
  mockPair.mockReturnValue(null);
  mockCastState = undefined;
  mockPlayer.currentTrack = TRACK;
});

describe("WatchMusicVideoButton", () => {
  // Most tracks have no video, and that must look like nothing at all: no
  // button, no gap, no explanation asked for.
  test("offers nothing for a track with no music video", async () => {
    await render(<WatchMusicVideoButton track={TRACK} />);

    expect(screen.queryByLabelText("music.watch_video")).toBeNull();
  });

  test("offers Watch for a track with one", async () => {
    mockPair.mockReturnValue(VIDEO);
    await render(<WatchMusicVideoButton track={TRACK} />);

    expect(screen.getByLabelText("music.watch_video")).toBeTruthy();
  });

  // The toggle ends a cast rather than moving it to the video, so it is not
  // offered while one is running.
  test("stays away while casting", async () => {
    mockPair.mockReturnValue(VIDEO);
    mockCastState = "connected";
    await render(<WatchMusicVideoButton track={TRACK} />);

    expect(screen.queryByLabelText("music.watch_video")).toBeNull();
  });

  test("pauses the song and opens the video where the song was", async () => {
    mockPair.mockReturnValue(VIDEO);
    await render(<WatchMusicVideoButton track={TRACK} variant='mini' />);

    fireEvent.press(screen.getByLabelText("music.watch_video"));

    await waitFor(() => expect(appRouter.push).toHaveBeenCalledTimes(1));
    expect(mockPlayer.pause).toHaveBeenCalledTimes(1);

    const pushed = String(appRouter.push.mock.calls[0]?.[0]);
    const query = new URLSearchParams(pushed.slice(pushed.indexOf("?") + 1));
    expect(pushed.startsWith("/player/direct-player?")).toBe(true);
    expect(query.get("itemId")).toBe("video-1");
    // The video starts at 74 s of the song, in ticks.
    expect(query.get("playbackPosition")).toBe("740000000");
    expect(query.get("offline")).toBe("false");
  });

  // Nothing to switch to: the track it was pressed for is gone.
  test("does nothing without a track to switch from", async () => {
    mockPair.mockReturnValue(VIDEO);
    mockPlayer.currentTrack = null;
    await render(<WatchMusicVideoButton track={null} />);

    fireEvent.press(screen.getByLabelText("music.watch_video"));

    expect(mockPlayer.pause).not.toHaveBeenCalled();
    expect(appRouter.push).not.toHaveBeenCalled();
  });
});
