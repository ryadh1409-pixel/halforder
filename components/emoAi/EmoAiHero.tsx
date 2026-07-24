import React from 'react';
import { StyleSheet, View } from 'react-native';

import { EmoAiLiveCompanion } from './live/EmoAiLiveCompanion';
import { useEmoAiLiveEngine } from './live/useEmoAiLiveEngine';

type Props = {
  typing?: boolean;
  streaming?: boolean;
  /** Bumps while tokens stream so mouth stays in sync. */
  streamingTick?: number;
  lastUserMessage?: string | null;
  wakeNonce?: number;
};

/** Hero slot — same layout chrome; character is a live companion. */
export function EmoAiHero({
  typing = false,
  streaming = false,
  streamingTick = 0,
  lastUserMessage = null,
  wakeNonce = 0,
}: Props) {
  const engine = useEmoAiLiveEngine({
    typing,
    streaming,
    lastUserMessage,
    wakeNonce,
  });

  return (
    <View style={styles.wrap}>
      <EmoAiLiveCompanion {...engine} streamingTick={streamingTick} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    borderRadius: 22,
    overflow: 'hidden',
    height: 200,
    backgroundColor: '#171923',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.22)',
  },
});
