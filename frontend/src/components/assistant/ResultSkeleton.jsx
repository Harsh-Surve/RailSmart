export default function ResultSkeleton() {
  return (
    <div className="assistant-message bot">
      <p className="assistant-message-text">Loading AI-ranked train options...</p>
      <div className="assistant-results-skeleton" aria-hidden="true">
        <div className="assistant-skeleton-card" />
        <div className="assistant-skeleton-card" />
        <div className="assistant-skeleton-card" />
      </div>
    </div>
  );
}
