// Fixed values keep server and client markup identical (no hydration mismatch).
// Optional: render <Petals paused={activeIndex !== null} /> to freeze them behind the lightbox.
const petals = [
  [6, 14, 9, 0],
  [14, 18, 12, 3],
  [23, 12, 10, 6],
  [31, 20, 14, 1],
  [40, 15, 11, 8],
  [48, 22, 13, 4],
  [57, 13, 9, 7],
  [65, 19, 12, 2],
  [73, 16, 10, 9],
  [81, 21, 14, 5],
  [89, 14, 11, 10],
  [95, 18, 13, 3],
];

export default function Petals({ paused = false }) {
  return (
    <div className={`petals${paused ? " is-paused" : ""}`} aria-hidden="true">
      {petals.map(([left, size, dur, delay], i) => (
        <span
          key={i}
          className={i % 2 ? "p-extra" : undefined}
          style={{
            left: `${left}%`,
            width: size,
            height: size * 1.3,
            animationDuration: `${dur + 6}s`,
            animationDelay: `-${delay + 2}s`,
          }}
        />
      ))}
    </div>
  );
}
