import { Link } from "react-router-dom";

export default function ContextPanel({ context, canProceedToBooking }) {
  const selectedTrain = context.selectedTrain;
  const baseFare = Number(selectedTrain?.base_price ?? selectedTrain?.price ?? 0);
  const fare = Number(selectedTrain?.price ?? 0);
  const multiplier = baseFare > 0 ? (fare / baseFare) : 1;

  return (
    <div>
      <h3 className="assistant-panel-title">Booking Summary</h3>

      <div className="context-card">
        <p><strong>Source:</strong> {context.source || "-"}</p>
        <p><strong>Destination:</strong> {context.destination || "-"}</p>
        <p><strong>Date:</strong> {context.date || "-"}</p>
        <p className="summary-row strong"><strong>Class:</strong> {context.travelClass || "-"}</p>
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
          <p className="assistant-subtext">Base Fare: ₹{baseFare.toFixed(2)}</p>
          <p className="assistant-subtext">Class Multiplier: {multiplier.toFixed(2)}x</p>
          <p className="assistant-subtext"><strong>Final Fare: ₹{fare.toFixed(2)}</strong></p>
        </div>
      )}

      {canProceedToBooking ? (
        <Link
          to={`/trains?from=${encodeURIComponent(context.source)}&to=${encodeURIComponent(context.destination)}&date=${encodeURIComponent(context.date)}&class=${encodeURIComponent(context.travelClass || "SL")}`}
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
