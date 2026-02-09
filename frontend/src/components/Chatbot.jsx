import React, { useState, useEffect, useRef } from "react";
import axios from "axios";
import { useTheme } from "../context/ThemeContext";
import { useLocation } from "react-router-dom";
import "./Chatbot.css";

const defaultMessages = [
  { from: "bot", text: "👋 Hi! I'm your RailSmart Assistant." },
  { from: "bot", text: "How can I help you today?" },
  { from: "bot", text: "You can ask me about booking, cancellation, Tatkal, PNR, tracking, refunds & more." },
];

// Quick-reply chips — default set
const defaultChips = [
  "How to book a ticket?",
  "Can I cancel my ticket?",
  "Track my train",
  "Tatkal rules",
  "Refund status",
];

// Page-aware contextual chips
const pageChips = {
  "/track": ["Track my train", "Delay status", "Arrival time", "Running status"],
  "/tickets": ["Cancel my ticket", "PNR status", "Refund status", "Track my train"],
  "/trains": ["How to book a ticket?", "Tatkal rules", "Seat selection help", "Payment methods"],
};

const Chatbot = () => {
  const { theme } = useTheme();
  const darkMode = theme === "dark";
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(defaultMessages);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const typingAudioRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Load chat history from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("railsmart_chat");
    if (saved) {
      setMessages(JSON.parse(saved));
    }
  }, []);

  // Save chat history to localStorage on every update
  useEffect(() => {
    localStorage.setItem("railsmart_chat", JSON.stringify(messages));
  }, [messages]);

  // Typing sound — plays/pauses with isTyping
  useEffect(() => {
    if (!typingAudioRef.current) {
      typingAudioRef.current = new Audio("/typing.mp3");
      typingAudioRef.current.loop = true;
    }
    if (isTyping) {
      typingAudioRef.current.play().catch(() => {});
    } else {
      typingAudioRef.current.pause();
      typingAudioRef.current.currentTime = 0;
    }
  }, [isTyping]);

  // PWA offline detection
  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Text-to-Speech
  const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "en-IN";
    window.speechSynthesis.speak(utterance);
  };

  const sendMessage = async () => {
    if (!input.trim()) return;

    const userMsg = { from: "user", text: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Offline fallback
    if (isOffline) {
      setMessages((prev) => [
        ...prev,
        { from: "bot", text: "You're offline. I can help with basic FAQs. Live data will resume when online." },
      ]);
      setIsTyping(false);
      return;
    }

    try {
      const res = await axios.post("http://localhost:5000/api/chatbot", {
        message: input,
      });

      const botMsg = { from: "bot", text: res.data.reply };
      setMessages((prev) => [...prev, botMsg]);
      speak(res.data.reply);
    } catch {
      setMessages((prev) => [
        ...prev,
        { from: "bot", text: "Sorry, I couldn't process that." },
      ]);
    } finally {
      setIsTyping(false);
    }
  };

  const startVoiceInput = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert("Your browser does not support voice input.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-IN";
    recognition.start();

    recognition.onresult = (event) => {
      const voiceText = event.results[0][0].transcript;
      setInput(voiceText);
    };
  };

  // Pick chips based on current page
  const chips = pageChips[location.pathname] || defaultChips;

  return (
    <>
      {/* Floating Chat Button */}
      <button className="chatbot-button" onClick={() => setOpen(!open)}>
        💬
      </button>

      {/* Chat Window */}
      {open && (
        <div className={`chatbot-window ${darkMode ? "dark" : ""}`}>
          <div className="chatbot-header">
            RailSmart Assistant
            <button onClick={() => setOpen(false)}>✖</button>
          </div>

          <div className="chatbot-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`chatbot-row ${msg.from}`}>
                <span className="avatar">
                  {msg.from === "bot" ? "🤖" : "👤"}
                </span>
                <div className={`chatbot-msg ${msg.from}-msg fade-in`}>
                  {msg.text}
                </div>
              </div>
            ))}
            {isTyping && (
              <div className="chatbot-typing">
                <span>Assistant is typing</span>
                <span className="dots">...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick-reply chips */}
          <div className="chips">
            {chips.map((q, idx) => (
              <button key={idx} onClick={() => setInput(q)} className="chip">
                {q}
              </button>
            ))}
          </div>

          <div className="chatbot-input">
            <input
              type="text"
              placeholder="Ask me something..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
            />
            <button onClick={startVoiceInput} title="Use voice">
              🎤
            </button>
            <button onClick={sendMessage}>Send</button>
          </div>
        </div>
      )}
    </>
  );
};

export default Chatbot;
