export default function TypingBubble() {
  return (
    <div className="assistant-message bot assistant-message--typing" aria-label="Assistant is typing">
      <div className="assistant-typing">
        <span className="assistant-typing-dot" />
        <span className="assistant-typing-dot" />
        <span className="assistant-typing-dot" />
      </div>
    </div>
  );
}
