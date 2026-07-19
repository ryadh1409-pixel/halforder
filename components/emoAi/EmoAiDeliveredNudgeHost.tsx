import { useEmoAiDeliveredNudge } from '@/hooks/useEmoAiDeliveredNudge';

/** Mounts the post-delivery Emo AI nudge while customer tabs are active. */
export function EmoAiDeliveredNudgeHost() {
  useEmoAiDeliveredNudge(true);
  return null;
}
