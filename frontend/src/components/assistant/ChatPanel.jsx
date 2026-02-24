import { useEffect } from "react";
import { useState } from "react";
import AssistantInput from "./AssistantInput";
import MessageBubble from "./MessageBubble";
import TrainResults from "./TrainResults";
import TypingBubble from "./TypingBubble";
import ResultSkeleton from "./ResultSkeleton";
import { rerankTrainsByClass } from "../../utils/classAwareRanking";

const API_BASE_URL = "http://localhost:5000";
const MIN_TYPING_MS = 700;

export default function ChatPanel({
  messages,
  setMessages,
  context,
  setContext,
  isLoading,
  setIsLoading,
  voiceEnabled,
}) {
  const [isMicListening, setIsMicListening] = useState(false);

  const appendMessage = (message) => {
    setMessages((prev) => [...prev, message]);
  };

  const speakText = (text) => {
    if (!voiceEnabled || isMicListening || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const value = String(text || "").trim();
    if (!value) return;

    try {
      const utterance = new SpeechSynthesisUtterance(value);
      utterance.lang = "en-IN";
      utterance.rate = 1;
      utterance.pitch = 1;

      const voices = window.speechSynthesis.getVoices();
      const indianVoice = voices.find((voice) => voice.lang === "en-IN");
      if (indianVoice) {
        utterance.voice = indianVoice;
      }

      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      // ignore TTS errors and continue normal chat flow
    }
  };

  useEffect(() => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      return undefined;
    }

    if (!voiceEnabled) {
      window.speechSynthesis.cancel();
    }

    return () => {
      window.speechSynthesis.cancel();
    };
  }, [voiceEnabled]);

  const appendBotText = (text, shouldSpeak = true) => {
    const value = String(text || "").trim();
    if (!value) return;

    const lastMessage = messages[messages.length - 1];
    if (lastMessage?.sender === "bot" && lastMessage?.type === "text" && lastMessage?.text === value) {
      return;
    }

    appendMessage({ sender: "bot", type: "text", text: value });
    if (shouldSpeak) {
      speakText(value);
    }
  };

  const handleSelectTrain = (train) => {
    setContext((prev) => ({ ...prev, selectedTrain: train }));
    appendBotText(`${train.train_name} selected. You can proceed to booking from the summary panel.`);
  };

  const loadRecommendations = async (updatedContext) => {
    if (!updatedContext?.source || !updatedContext?.destination || !updatedContext?.date) {
      return;
    }

    const query = new URLSearchParams({
      from: updatedContext.source,
      to: updatedContext.destination,
      date: updatedContext.date,
    });

    const response = await fetch(`${API_BASE_URL}/api/trains?${query.toString()}`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Unable to load train recommendations");
    }

    const trains = await response.json();
    return Array.isArray(trains) ? trains : [];
  };

  const sendMessage = async (text) => {
    if (!text?.trim() || isLoading) return;

    appendMessage({ sender: "user", type: "text", text });
    appendMessage({ sender: "bot", type: "typing" });
    setIsLoading(true);
    const startTime = Date.now();

    try {
      const response = await fetch(`${API_BASE_URL}/api/assistant/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          message: text,
          context: {
            intent: context.intent,
            source: context.source,
            destination: context.destination,
            date: context.date,
            travelClass: context.travelClass,
            trainNumber: context.trainNumber,
          },
        }),
      });

      if (!response.ok) {
        const errPayload = await response.json().catch(() => ({}));
        throw new Error(errPayload.error || "Assistant request failed");
      }

      const data = await response.json();
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_TYPING_MS) {
        await new Promise((resolve) => {
          setTimeout(resolve, MIN_TYPING_MS - elapsed);
        });
      }

      setMessages((prev) => prev.filter((msg) => msg.type !== "typing"));

      const updatedContext = {
        ...(data.context || data.updatedContext || {}),
        selectedTrain: context.selectedTrain,
      };

      setContext((prev) => ({ ...prev, ...updatedContext }));

      appendBotText(data.reply || "I am here to help.");

      if (data.status === "READY_TO_SEARCH") {
        appendMessage({ sender: "bot", type: "loading_results" });
        const trains = await loadRecommendations(updatedContext);
        const rankedTrains = rerankTrainsByClass(trains, updatedContext.travelClass || context.travelClass || "SL");
        setMessages((prev) => prev.filter((msg) => msg.type !== "loading_results"));

        if (rankedTrains.length === 0) {
          appendBotText("No trains found for this route/date.");
        } else {
          appendMessage({
            sender: "bot",
            type: "train_results",
            text: "Top AI-ranked train options:",
            trains: rankedTrains,
          });
        }
      }
    } catch (error) {
      setMessages((prev) => prev.filter((msg) => msg.type !== "typing" && msg.type !== "loading_results"));
      appendBotText(error?.message || "Something went wrong while contacting the assistant.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="assistant-chat-wrap">
      <div className="assistant-messages" role="log" aria-live="polite">
        {messages.map((msg, index) => (
          msg.type === "train_results" ? (
            <div key={`${msg.sender}-${index}-${msg.text}`} className="assistant-message bot">
              <p className="assistant-message-text">{msg.text}</p>
              <TrainResults
                trains={msg.trains}
                onSelect={handleSelectTrain}
                selectedClass={context.travelClass || "SL"}
              />
            </div>
          ) : msg.type === "typing" ? (
            <TypingBubble key={`typing-${index}`} />
          ) : msg.type === "loading_results" ? (
            <ResultSkeleton key={`loading-${index}`} />
          ) : (
            <MessageBubble key={`${msg.type || "text"}-${msg.sender || "sys"}-${index}`} message={msg} />
          )
        ))}
      </div>

      <AssistantInput onSend={sendMessage} disabled={isLoading} onListeningChange={setIsMicListening} />
    </div>
  );
}
