import React, { useEffect, useState } from "react";
import { X } from "lucide-react";
import "./SeatMap.css";

const API_BASE_URL = "http://localhost:5000";

function SeatMap({
  trainId,
  travelDate,       // "YYYY-MM-DD"
  selectedSeat,     // current selected seat from parent
  onSelect,         // function (seatId) => void
  onClose,          // function () => void
}) {
  const [rows, setRows] = useState(["A", "B", "C", "D"]);
  const [cols, setCols] = useState([1, 2, 3, 4, 5, 6, 7, 8]);
  const [bookedSeats, setBookedSeats] = useState([]);
  const [localSelectedSeat, setLocalSelectedSeat] = useState(
    selectedSeat || ""
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Load seat map (booked seats) for this train + date
  useEffect(() => {
    if (!trainId || !travelDate) return;

    const fetchSeatMap = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await fetch(
          `${API_BASE_URL}/api/seat-map?trainId=${trainId}&date=${travelDate}`
        );

        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();

        setRows(data.layout?.rows || ["A", "B", "C", "D"]);
        setCols(data.layout?.cols || [1, 2, 3, 4, 5, 6, 7, 8]);
        setBookedSeats(
          (data.bookedSeats || [])
            .map((s) => String(s || "").trim())
            .filter(Boolean)
        );
      } catch (err) {
        console.error("Error fetching seat map:", err);
        setError("Unable to load seat map.");
      } finally {
        setLoading(false);
      }
    };

    fetchSeatMap();
  }, [trainId, travelDate]);

  const handleSeatClick = (seatId) => {
    if (bookedSeats.includes(seatId)) return; // Ignore booked
    setLocalSelectedSeat(seatId);
    onSelect && onSelect(seatId);
  };

  const isBooked = (seatId) => bookedSeats.includes(seatId);

  return (
    <div className="rs-seat-overlay">
      <div className="rs-seat-modal">
        {/* header with train icon */}
        <div className="rs-seat-modal-header">
          <div className="rs-seat-title-wrap">
            <img
              src="/logo/train-icon.png"
              alt="Train"
              className="rs-seat-train-icon"
            />
            <div>
              <h3 className="rs-seat-title">Select Seat</h3>
              <p className="rs-seat-subtitle">
                Choose your preferred seat for this journey
              </p>
            </div>
          </div>

          <button
            type="button"
            className="rs-seat-close"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Legend */}
        <div className="rs-seat-legend">
          <span className="legend-item">
            <span className="legend-dot legend-dot--available" />
            Available
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-dot--selected" />
            Selected
          </span>
          <span className="legend-item">
            <span className="legend-dot legend-dot--booked" />
            Booked
          </span>
        </div>

        {/* Seat grid */}
        <div className="rs-seat-grid">
          {loading && (
            <p className="rs-seat-helper">Loading seat map…</p>
          )}
          {error && (
            <p className="rs-seat-error">{error}</p>
          )}

          {!loading &&
            !error &&
            rows.map((row) => (
            <div key={row} className="rs-seat-row">
              <div className="rs-seat-row-label">{row}</div>

              <div className="rs-seat-row-seats">
                {cols.map((col, index) => {
                  const seatId = `${row}${col}`;
                  const afterAisle = index === 4; // gap between 4 & 5

                  return (
                    <React.Fragment key={seatId}>
                      {afterAisle && <div className="rs-seat-aisle" />}

                      <button
                        type="button"
                        onClick={() => handleSeatClick(seatId)}
                        disabled={isBooked(seatId)}
                        className={[
                          "rs-seat-btn",
                          isBooked(seatId) && "rs-seat-btn--booked",
                          localSelectedSeat === seatId &&
                            !isBooked(seatId) &&
                            "rs-seat-btn--selected",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        {seatId}
                      </button>
                    </React.Fragment>
                  );
                })}
              </div>
            </div>
            ))}
        </div>

        {/* Footer */}
        <div className="rs-seat-footer">
          {localSelectedSeat ? (
            <span className="rs-seat-tip">
              Selected seat: <strong>{localSelectedSeat}</strong>
            </span>
          ) : (
            <span className="rs-seat-tip">
              Tip: click on any blue seat to select it.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export default SeatMap;
