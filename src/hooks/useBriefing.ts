import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Speaks a morning briefing via the Web Speech API. No audio assets, works
 * offline, and degrades gracefully where speech synthesis isn't available.
 */
export function useBriefing(): {
  supported: boolean;
  speaking: boolean;
  speak: (text: string) => void;
  stop: () => void;
} {
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const [speaking, setSpeaking] = useState(false);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, [supported]);

  const speak = useCallback(
    (text: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 1.02;
      u.pitch = 1;
      u.onend = () => setSpeaking(false);
      u.onerror = () => setSpeaking(false);
      utteranceRef.current = u;
      setSpeaking(true);
      window.speechSynthesis.speak(u);
    },
    [supported],
  );

  useEffect(() => () => stop(), [stop]);

  return { supported, speaking, speak, stop };
}
