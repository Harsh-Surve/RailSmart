import { useEffect, useRef, useState } from "react";

type OnResult = (text: string) => void;

export function useSpeechToText() {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const SpeechRecognition =
      (window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setSupported(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognitionRef.current = recognition;
    setSupported(true);
  }, []);

  const startListening = (onResult: OnResult) => {
    if (!supported || !recognitionRef.current) return;

    setError(null);
    const recognition = recognitionRef.current;

    recognition.onstart = () => setListening(true);

    recognition.onerror = (event: any) => {
      console.error("Speech recognition error:", event);

      let msg = "Speech recognition error";
      if (event.error === "no-speech") {
        msg = "No speech detected. Please try again and speak clearly near the mic.";
      } else if (event.error === "not-allowed") {
        msg = "Microphone access blocked. Please allow mic permission in the browser.";
      } else if (event.error === "audio-capture") {
        msg = "No microphone found. Check your audio settings.";
      } else if (event.error === "network") {
        msg = "Network error. Check your internet connection.";
      } else if (event.error === "aborted") {
        msg = "Speech recognition was aborted.";
      } else {
        msg = `Speech error: ${event.error}`;
      }

      setError(msg);
      setListening(false);
    };

    recognition.onend = () => setListening(false);

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      onResult(transcript);
    };

    recognition.start();
  };

  return { startListening, listening, supported, error };
}
