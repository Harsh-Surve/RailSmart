import { useState } from "react";

export default function TrainResults({ trains, onSelect }) {
  const [expanded, setExpanded] = useState(false);

  const list = Array.isArray(trains) ? trains : [];
  const visibleTrains = expanded ? list : list.slice(0, 3);
  const topTrainId = list[0]?.train_id;

  if (list.length === 0) {
    return null;
  }

  return (
    <div className="assistant-train-results">
      {visibleTrains.map((train) => {
        const isTop = train.train_id === topTrainId;
        const reasons = Array.isArray(train.ai_reason) ? train.ai_reason : [];

        return (
          <div key={train.train_id} className={`assistant-train-card ${isTop ? "assistant-train-card--recommended" : ""}`}>
            {isTop ? <div className="assistant-recommended">AI Recommended</div> : null}

            <div className="assistant-train-card-head">
              <div>
                <strong>{train.train_name}</strong>
                <p className="assistant-subtext">{train.source} → {train.destination}</p>
              </div>
            </div>

            <div className="assistant-train-meta">
              <span>{train.departure_display || train.departure_time} - {train.arrival_display || train.arrival_time}</span>
              <span>₹{train.price}</span>
            </div>

            <div className="assistant-train-meta">
              <span>Available Seats: {train.available_seats}</span>
              <span>Delay: {train.delay_minutes} min</span>
            </div>

            {isTop && reasons.length > 0 ? (
              <div className="assistant-ai-reason">
                <strong>Why recommended?</strong>
                <ul className="assistant-reason-list">
                  {reasons.map((reason) => (
                    <li key={`${train.train_id}-${reason}`}>{reason}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <button type="button" className="assistant-select-btn" onClick={() => onSelect(train)}>
              Select Train
            </button>
          </div>
        );
      })}

      {list.length > 3 ? (
        <button type="button" className="assistant-toggle-btn" onClick={() => setExpanded((prev) => !prev)}>
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}
