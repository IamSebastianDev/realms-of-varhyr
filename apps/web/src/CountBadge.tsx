/** A gold medallion with a number: how many of something the player has. */
export function CountBadge({
  count,
  big = false,
  className = "",
}: {
  count: number;
  big?: boolean;
  className?: string;
}) {
  return (
    <span className={`count-badge ${big ? "big" : "small"} ${className}`} aria-hidden="true">
      <i />
      {big && <small>×</small>}
      <b>{count}</b>
    </span>
  );
}
