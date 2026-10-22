"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export interface TourStep {
  /** Valor do atributo data-tour do elemento a destacar; sem ele, o passo aparece centralizado. */
  target?: string;
  title: string;
  body: React.ReactNode;
  /** Prepara a tela antes de mostrar o passo (ex.: carregar um laudo de exemplo). */
  before?: () => Promise<void> | void;
}

interface Props {
  steps: TourStep[];
  onClose: (reason: "finished" | "skipped") => void;
}

const PAD = 8;
const MARGIN = 12;

async function waitFor(selector: string, ms = 3000): Promise<HTMLElement | null> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const el = document.querySelector<HTMLElement>(`[data-tour="${selector}"]`);
    if (el) return el;
    await new Promise((r) => setTimeout(r, 80));
  }
  return null;
}

export function Tour({ steps, onClose }: Props) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const step = steps[index];
  const last = index === steps.length - 1;

  const measure = useCallback(async () => {
    if (!step.target) {
      setRect(null);
      return;
    }
    const el = await waitFor(step.target);
    if (!el) {
      setRect(null);
      return;
    }
    el.scrollIntoView({ block: "center", behavior: "smooth" });
    // espera a rolagem assentar antes de medir
    await new Promise((r) => setTimeout(r, 350));
    setRect(el.getBoundingClientRect());
  }, [step.target]);

  // prepara e mede a cada passo
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await step.before?.();
      if (!cancelled) await measure();
    })();
    return () => {
      cancelled = true;
    };
  }, [step, measure]);

  // reposiciona ao redimensionar ou rolar
  useEffect(() => {
    if (!step.target) return;
    const update = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, { passive: true });
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update);
    };
  }, [step.target]);

  // posição do balão: abaixo do alvo, senão acima, senão fixo no pé da tela
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    if (!rect) {
      setTipPos({ top: Math.max(MARGIN, (vh - h) / 2), left: Math.max(MARGIN, (vw - w) / 2) });
      return;
    }
    const left = Math.min(Math.max(MARGIN, rect.left), vw - w - MARGIN);
    if (vh - rect.bottom - PAD >= h + MARGIN) setTipPos({ top: rect.bottom + PAD + MARGIN, left });
    else if (rect.top - PAD >= h + MARGIN) setTipPos({ top: rect.top - PAD - MARGIN - h, left });
    else setTipPos({ top: vh - h - MARGIN, left: Math.max(MARGIN, (vw - w) / 2) });
  }, [rect, index]);

  const next = useCallback(() => (last ? onClose("finished") : setIndex((i) => i + 1)), [last, onClose]);
  const prev = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose("skipped");
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onClose]);

  return (
    <div className="tour-root">
      {/* bloqueia cliques na página durante o tour */}
      <div className="tour-block" onClick={(e) => e.stopPropagation()} />
      {rect ? (
        <div
          className="tour-spot"
          style={{
            top: rect.top - PAD,
            left: rect.left - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      ) : (
        <div className="tour-dim" />
      )}
      <div
        ref={tipRef}
        className="tour-tip"
        role="dialog"
        aria-modal="true"
        aria-label={`Tour: ${step.title}`}
        style={{ top: tipPos?.top ?? 0, left: tipPos?.left ?? 0, visibility: tipPos ? "visible" : "hidden" }}
      >
        <div className="muted">Passo {index + 1} de {steps.length}</div>
        <h2 style={{ margin: "4px 0 8px" }}>{step.title}</h2>
        <div className="tour-body">{step.body}</div>
        <div className="row" style={{ marginTop: 14, justifyContent: "space-between" }}>
          <button onClick={() => onClose("skipped")}>Pular tour</button>
          <span className="row">
            <button onClick={prev} disabled={index === 0}>Voltar</button>
            <button className="primary" onClick={next} autoFocus>{last ? "Concluir" : "Próximo"}</button>
          </span>
        </div>
      </div>
    </div>
  );
}
