import {
  beginMusicVideoRoundTrip,
  endMusicVideoRoundTrip,
  isMusicVideoRoundTripFor,
  onMusicVideoRoundTripFinished,
  reportMusicVideoPosition,
} from "./musicVideoRoundTrip";

const TRACK = "track-1";
const VIDEO = "video-1";

/** Everything the music player would do with the hand-over, in order. */
const listen = () => {
  const returned: { trackId: string; positionSec: number }[] = [];
  const stop = onMusicVideoRoundTripFinished((end) => returned.push(end));
  return { returned, stop };
};

afterEach(() => {
  // Nothing is listening any more; the module's own round trip state is reset
  // by ending whatever a test left open.
  endMusicVideoRoundTrip();
});

describe("music video round trip", () => {
  test("hands the video's last position back to the same track", () => {
    const { returned, stop } = listen();
    beginMusicVideoRoundTrip({ trackId: TRACK, videoItemId: VIDEO });

    reportMusicVideoPosition(VIDEO, 63);
    endMusicVideoRoundTrip();

    expect(returned).toEqual([{ trackId: TRACK, positionSec: 63 }]);
    stop();
  });

  test("hands back the position the video stopped at, not its first", () => {
    const { returned, stop } = listen();
    beginMusicVideoRoundTrip({ trackId: TRACK, videoItemId: VIDEO });

    reportMusicVideoPosition(VIDEO, 12);
    reportMusicVideoPosition(VIDEO, 74.5);
    endMusicVideoRoundTrip();

    expect(returned[0]?.positionSec).toBe(74.5);
    stop();
  });

  // The video page plays every video, music videos from the library included.
  // A position it reports for anything but the toggle's own video is none of
  // the music player's business.
  test("ignores another video's position", () => {
    const { returned, stop } = listen();
    beginMusicVideoRoundTrip({ trackId: TRACK, videoItemId: VIDEO });

    reportMusicVideoPosition("someone-elses-video", 300);
    endMusicVideoRoundTrip();

    expect(returned).toEqual([]);
    stop();
  });

  test("ignores a position reported after the round trip ended", () => {
    const { returned, stop } = listen();
    beginMusicVideoRoundTrip({ trackId: TRACK, videoItemId: VIDEO });
    endMusicVideoRoundTrip();

    reportMusicVideoPosition(VIDEO, 30);
    endMusicVideoRoundTrip();

    expect(returned).toEqual([]);
    stop();
  });

  // Closed before its first tick: there is no position to continue from, and
  // the audio stays where the toggle paused it rather than jumping to 0.
  test("hands back nothing when the video never reported a position", () => {
    const { returned, stop } = listen();
    beginMusicVideoRoundTrip({ trackId: TRACK, videoItemId: VIDEO });

    endMusicVideoRoundTrip();

    expect(returned).toEqual([]);
    stop();
  });

  test("ignores a position that is not a number", () => {
    const { returned, stop } = listen();
    beginMusicVideoRoundTrip({ trackId: TRACK, videoItemId: VIDEO });

    reportMusicVideoPosition(VIDEO, Number.NaN);
    reportMusicVideoPosition(VIDEO, -1);
    endMusicVideoRoundTrip();

    expect(returned).toEqual([]);
    stop();
  });

  test("knows which item is the round trip's video", () => {
    beginMusicVideoRoundTrip({ trackId: TRACK, videoItemId: VIDEO });

    expect(isMusicVideoRoundTripFor(VIDEO)).toBe(true);
    expect(isMusicVideoRoundTripFor("another-video")).toBe(false);
    expect(isMusicVideoRoundTripFor(undefined)).toBe(false);

    endMusicVideoRoundTrip();

    expect(isMusicVideoRoundTripFor(VIDEO)).toBe(false);
  });

  test("a second round trip starts from a clean position", () => {
    const { returned, stop } = listen();
    beginMusicVideoRoundTrip({ trackId: TRACK, videoItemId: VIDEO });
    reportMusicVideoPosition(VIDEO, 40);
    endMusicVideoRoundTrip();

    beginMusicVideoRoundTrip({ trackId: "track-2", videoItemId: "video-2" });
    endMusicVideoRoundTrip();

    expect(returned).toEqual([{ trackId: TRACK, positionSec: 40 }]);
    stop();
  });

  test("a listener that stopped listening hears nothing", () => {
    const { returned, stop } = listen();
    stop();
    beginMusicVideoRoundTrip({ trackId: TRACK, videoItemId: VIDEO });
    reportMusicVideoPosition(VIDEO, 10);

    endMusicVideoRoundTrip();

    expect(returned).toEqual([]);
  });
});
