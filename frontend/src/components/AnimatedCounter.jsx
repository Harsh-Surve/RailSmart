import { useEffect, useRef, useState } from "react";

/**
 * Smoothly counts from 0 → value over `duration` ms.
 * Handles integers and decimals; caller controls formatting via `prefix`/`formatter`.
 *
 * Usage:
 *   <AnimatedCounter value={4500} />
 *   <AnimatedCounter value={45200.5} prefix="₹" formatter={formatCurrency} />
 */
export default function AnimatedCounter({
  value,
  duration = 900,
  prefix = "",
  formatter,
}) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    const end = Number(value);
    if (!Number.isFinite(end) || end === 0) {
      setDisplay(0);
      return;
    }

    const start = performance.now();

    const step = (now) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out quad for a decelerating feel
      const eased = 1 - (1 - progress) * (1 - progress);
      setDisplay(eased * end);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        setDisplay(end); // snap to exact final value
      }
    };

    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value, duration]);

  const formatted = formatter
    ? formatter(display)
    : Number.isInteger(Number(value))
    ? Math.round(display).toLocaleString("en-IN")
    : display.toLocaleString("en-IN", { maximumFractionDigits: 2 });

  return (
    <span>
      {prefix}
      {formatted}
    </span>
  );
}
