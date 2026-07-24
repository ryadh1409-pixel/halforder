/**
 * Loud "Hi Emo" voice listen for the Emo AI Easter Egg.
 * Uses expo-av metering (shout threshold) + optional web STT, else Whisper via CF.
 */
import { Audio } from 'expo-av';
import { Platform } from 'react-native';

import {
  claimEmoHiEmoooReward,
  HI_EMOOO_SHOUT_THRESHOLD_DB,
  matchesHiEmoPhrase,
  type ClaimEmoHiEmoooResult,
} from '@/services/emoAi/emoAiHiEmoooReward';

export type EmoVoiceListenResult =
  | { kind: 'success'; claim: ClaimEmoHiEmoooResult }
  | { kind: 'denied'; message: string }
  | { kind: 'error'; message: string };

function fileToBase64(uri: string): Promise<string> {
  return new Promise(async (resolve, reject) => {
    try {
      const res = await fetch(uri);
      const blob = await res.blob();
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = String(reader.result ?? '');
        const base64 = dataUrl.includes(',')
          ? dataUrl.split(',')[1] ?? ''
          : dataUrl;
        if (!base64) {
          reject(new Error('Could not read recording'));
          return;
        }
        resolve(base64);
      };
      reader.onerror = () => reject(new Error('Could not read recording'));
      reader.readAsDataURL(blob);
    } catch (e) {
      reject(e instanceof Error ? e : new Error('Could not read recording'));
    }
  });
}

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal?: boolean;
    0?: { transcript?: string };
  }>;
};

async function samplePeakWhileRecording(
  recording: Audio.Recording,
  maxMs: number,
): Promise<number> {
  let peak = -160;
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    try {
      const st = await recording.getStatusAsync();
      if (st.isRecording && typeof st.metering === 'number') {
        peak = Math.max(peak, st.metering);
      }
    } catch {
      /* ignore */
    }
    await new Promise((r) => setTimeout(r, 60));
  }
  return peak;
}

/**
 * Record a short clip with metering; claim via CF (Whisper + atomic flag).
 * On web, also try SpeechRecognition for a faster transcript when loud enough.
 */
export async function listenForHiEmoShout(options?: {
  maxMs?: number;
}): Promise<EmoVoiceListenResult> {
  const maxMs = options?.maxMs ?? 4000;

  try {
    const perm = await Audio.requestPermissionsAsync();
    if (!perm.granted) {
      return {
        kind: 'denied',
        message: 'Microphone permission is required to shout “Hi Emo”.',
      };
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync({
      ...Audio.RecordingOptionsPresets.HIGH_QUALITY,
      isMeteringEnabled: true,
    });
    await recording.startAsync();

    let webTranscript = '';
    let webRec: SpeechRecognitionLike | null = null;
    if (Platform.OS === 'web') {
      const g = globalThis as unknown as {
        SpeechRecognition?: new () => SpeechRecognitionLike;
        webkitSpeechRecognition?: new () => SpeechRecognitionLike;
      };
      const Ctor = g.SpeechRecognition || g.webkitSpeechRecognition;
      if (Ctor) {
        try {
          webRec = new Ctor();
          webRec.lang = 'en-US';
          webRec.interimResults = true;
          webRec.continuous = true;
          webRec.maxAlternatives = 1;
          webRec.onresult = (event) => {
            let chunk = '';
            for (let i = event.resultIndex; i < event.results.length; i += 1) {
              const row = event.results[i];
              if (!row?.[0]?.transcript) continue;
              chunk += row[0].transcript;
              if (row.isFinal) {
                webTranscript = `${webTranscript} ${row[0].transcript}`.trim();
              }
            }
            if (matchesHiEmoPhrase(chunk)) {
              webTranscript = (webTranscript || chunk).trim();
            }
          };
          webRec.start();
        } catch {
          webRec = null;
        }
      }
    }

    const peak = await samplePeakWhileRecording(recording, maxMs);

    try {
      webRec?.stop();
    } catch {
      /* ignore */
    }

    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();

    if (peak < HI_EMOOO_SHOUT_THRESHOLD_DB) {
      const claim = await claimEmoHiEmoooReward({
        peakVolumeDb: peak,
        transcript: webTranscript,
      });
      return { kind: 'success', claim };
    }

    if (webTranscript && matchesHiEmoPhrase(webTranscript)) {
      const claim = await claimEmoHiEmoooReward({
        peakVolumeDb: peak,
        transcript: webTranscript,
      });
      return { kind: 'success', claim };
    }

    if (!uri) {
      return { kind: 'error', message: 'Could not capture audio. Try again.' };
    }

    const audioBase64 = await fileToBase64(uri);
    const mimeType = Platform.OS === 'web' ? 'audio/webm' : 'audio/m4a';
    const claim = await claimEmoHiEmoooReward({
      peakVolumeDb: peak,
      audioBase64,
      mimeType,
    });
    return { kind: 'success', claim };
  } catch (e) {
    const message =
      e instanceof Error ? e.message : 'Voice listen failed. Try again.';
    return { kind: 'error', message };
  }
}

export type { ClaimEmoHiEmoooResult };
