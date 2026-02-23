export default function MessageBubble({ message }) {
  return (
    <div className={`assistant-message ${message.sender === "user" ? "user" : "bot"}`}>
      <p className="assistant-message-text">{message.text}</p>
      {message.meta ? <p className="assistant-message-meta">{message.meta}</p> : null}
    </div>
  );
}
