export default function Skeleton({ className = "", style }) {
  return <div className={`skeleton skeleton-ui ${className}`.trim()} style={style} />;
}
