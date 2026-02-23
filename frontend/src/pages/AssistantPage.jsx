import { useMemo, useState } from "react";
import ChatPanel from "../components/assistant/ChatPanel";
import ContextPanel from "../components/assistant/ContextPanel";
import "../styles/assistant.css";

const INITIAL_CONTEXT = {
  intent: null,
  source: null,
  destination: null,
  date: null,
  travelClass: null,
  trainNumber: null,
  selectedTrain: null,
};

const INITIAL_MESSAGES = [
  {
    sender: "bot",
    type: "text",
    text: "Hi! I can help you book smarter. Tell me where you want to travel.",
  },
];

export default function AssistantPage() {
  const [context, setContext] = useState(INITIAL_CONTEXT);
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const [isLoading, setIsLoading] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);

  const canProceedToBooking = useMemo(() => {
    return Boolean(context.source && context.destination && context.date && context.travelClass && context.selectedTrain);
  }, [context.date, context.destination, context.selectedTrain, context.source, context.travelClass]);

  return (
    <div className="assistant-page">
      <div className="assistant-header">
        <div className="assistant-header-row">
          <div>
            <h1>RailSmart AI Assistant</h1>
            <p>Context-aware booking with explainable recommendations.</p>
          </div>

          <button
            type="button"
            className={`tts-toggle ${voiceEnabled ? "active" : ""}`}
            onClick={() => setVoiceEnabled((prev) => !prev)}
            title={voiceEnabled ? "Spoken replies enabled" : "Enable spoken replies"}
            aria-label={voiceEnabled ? "Disable spoken replies" : "Enable spoken replies"}
          >
            🔊
          </button>
        </div>
      </div>

      <div className="assistant-container">
        <div className="assistant-chat">
          <ChatPanel
            messages={messages}
            setMessages={setMessages}
            context={context}
            setContext={setContext}
            isLoading={isLoading}
            setIsLoading={setIsLoading}
            voiceEnabled={voiceEnabled}
          />
        </div>

        <div className="assistant-context">
          <ContextPanel context={context} canProceedToBooking={canProceedToBooking} />
        </div>
      </div>
    </div>
  );
}
