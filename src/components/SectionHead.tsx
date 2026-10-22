export function SectionHead({ n, title, hint, right }: { n: number; title: string; hint?: string; right?: React.ReactNode }) {
  return (
    <div className="section-head">
      <span className="step-num" aria-hidden="true">{n}</span>
      <div className="section-title">
        <h2>{title}</h2>
        {hint && <p className="muted">{hint}</p>}
      </div>
      {right && <div className="section-right">{right}</div>}
    </div>
  );
}
