import { Link } from "react-router-dom";

export default function ContextPanel({ context, canProceedToBooking }) {
  const selectedTrain = context.selectedTrain;

  return (
    <div>
      <h3 className="assistant-panel-title">Booking Summary</h3>

      <div className="context-card">
        <p><strong>Source:</strong> {context.source || "-"}</p>
        <p><strong>Destination:</strong> {context.destination || "-"}</p>
        <p><strong>Date:</strong> {context.date || "-"}</p>
        <p><strong>Class:</strong> {context.travelClass || "-"}</p>
      </div>

      {selectedTrain && (
        <div className="context-card">
          <h4>Selected Train</h4>
          <p>{selectedTrain.train_name}</p>
          <p className="assistant-subtext">
            {selectedTrain.source} → {selectedTrain.destination}
          </p>
          <p className="assistant-subtext">
            {selectedTrain.departure_display || selectedTrain.departure_time} • ₹{selectedTrain.price}
          </p>
        </div>
      )}

      {canProceedToBooking ? (
        <Link
          to={`/trains?from=${encodeURIComponent(context.source)}&to=${encodeURIComponent(context.destination)}&date=${encodeURIComponent(context.date)}`}
          className="assistant-proceed-btn"
        >
          Proceed to Booking
        </Link>
      ) : (
        <button type="button" className="assistant-proceed-btn" disabled>
          Proceed to Booking
        </button>
      )}
    </div>
  );
}
