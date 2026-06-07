export default function UncertaintyGauge({
  label,
  score,
}: {
  label: string;
  score?: number;
}) {
  const s = score ?? 0;
  const pct = Math.round(s * 100);
  return (
    <div className="uncertainty-gauge">
      <span>{label}</span>
      <span className="num">{s.toFixed(2)}</span>
      <div className="bar" style={{ flex: 1, ["--c" as string]: "#ffcf5c" }}>
        <div style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
