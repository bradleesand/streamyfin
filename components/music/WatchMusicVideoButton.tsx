import { Ionicons } from "@expo/vector-icons";
import type { BaseItemDto } from "@jellyfin/sdk/lib/generated-client/models";
import React from "react";
import { useTranslation } from "react-i18next";
import { Platform, StyleSheet, TouchableOpacity } from "react-native";
import { CastState, useCastState } from "react-native-google-cast";
import { Text } from "@/components/common/Text";
import { useMusicVideoPair } from "@/hooks/useMusicVideoPair";
import { useWatchMusicVideo } from "@/hooks/useWatchMusicVideo";

interface WatchMusicVideoButtonProps {
  /** The track that is playing now. */
  track: BaseItemDto | null;
  /**
   * `mini` is the icon in the mini player bar's controls; `full` is the pill
   * the now-playing screen shows under its transport controls.
   */
  variant?: "mini" | "full";
}

/**
 * Watch / Listen: the way into a track's music video, offered only for a track
 * the music videos library has a twin of.
 *
 * Nothing renders for a track without one, and nothing renders while casting:
 * the toggle closes the cast rather than moving it to the video, and a button
 * that silently ends what is playing in the next room is worse than no button.
 * Casting with the toggle is out of scope for now, so it is not offered.
 */
export const WatchMusicVideoButton: React.FC<WatchMusicVideoButtonProps> = ({
  track,
  variant = "full",
}) => {
  const { t } = useTranslation();
  const pair = useMusicVideoPair(track);
  const watch = useWatchMusicVideo();
  const castState = useCastState();

  // Music playback has no TV stack; the toggle rides on it.
  if (Platform.isTV) return null;
  if (!pair || castState === CastState.CONNECTED) return null;

  const label = t("music.watch_video");
  const onPress = () => {
    void watch(pair);
  };

  return variant === "mini" ? (
    <TouchableOpacity
      onPress={onPress}
      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      style={styles.controlButton}
      accessibilityRole='button'
      accessibilityLabel={label}
    >
      <Ionicons name='videocam' size={22} color='white' />
    </TouchableOpacity>
  ) : (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.7}
      style={styles.pill}
      accessibilityRole='button'
      accessibilityLabel={label}
    >
      <Ionicons name='videocam' size={16} color='white' />
      <Text style={styles.pillLabel}>{label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  controlButton: {
    padding: 8,
  },
  pill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 6,
    marginBottom: 24,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.25)",
  },
  pillLabel: {
    color: "white",
    fontSize: 13,
    fontWeight: "600",
  },
});
