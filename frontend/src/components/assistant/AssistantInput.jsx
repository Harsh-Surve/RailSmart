import { useEffect, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { useSpeechToText } from "../../hooks/useSpeechToText";

export default function AssistantInput({ onSend, disabled, onListeningChange }) {
  const [input, setInput] = useState("");
  const [voiceMode, setVoiceMode] = useState("auto");
  const { startListening, stopListening, listening, supported, error: voiceError } = useSpeechToText();

  useEffect(() => {
    if (typeof onListeningChange === "function") {
      onListeningChange(listening);
    }
  }, [listening, onListeningChange]);

  const submitText = (value) => {
    const trimmed = String(value || "").trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setInput("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    submitText(input);
  };

  const handleMicClick = () => {
    if (disabled || !supported) return;

    if (listening) {
      stopListening();
      return;
    }

    startListening((spokenText) => {
      const transcript = String(spokenText || "").trim();
      if (!transcript) return;

      if (voiceMode === "auto") {
        submitText(transcript);
      } else {
        setInput(transcript);
      }
    });
  };

  return (
    <div className="assistant-input-wrap">
      <form className="assistant-input" onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Type or speak your message..."
          disabled={disabled}
        />

        <button type="submit" disabled={disabled || !input.trim()}>
          Send
        </button>

        <div className="assistant-voice-controls">
          <button
            type="button"
            className={`assistant-mic-btn ${listening ? "listening" : ""}`}
            onClick={handleMicClick}
            disabled={disabled || !supported}
            aria-label={listening ? "Stop voice input" : "Start voice input"}
            title={listening ? "Stop listening" : "Speak message"}
          >
            {listening ? <MicOff size={20} strokeWidth={2.4} /> : <Mic size={20} strokeWidth={2.4} />}
          </button>

          <div className="assistant-voice-segmented" role="group" aria-label="Voice input mode">
            <button
              type="button"
              className={`assistant-voice-mode-btn ${voiceMode === "auto" ? "active" : ""}`}
              onClick={() => setVoiceMode("auto")}
              disabled={disabled || !supported}
              title="Automatically sends speech after recognition"
            >
              Auto
            </button>
            <button
              type="button"
              className={`assistant-voice-mode-btn ${voiceMode === "manual" ? "active" : ""}`}
              onClick={() => setVoiceMode("manual")}
              disabled={disabled || !supported}
              title="Lets you edit speech before sending"
            >
              Manual
            </button>
          </div>
        </div>
      </form>

      {!supported ? <p className="assistant-voice-hint">Voice input not supported in this browser.</p> : null}
      {voiceError ? <p className="assistant-voice-hint assistant-voice-hint--error">{voiceError}</p> : null}
    </div>
  );
}
