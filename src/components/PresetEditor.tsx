"use client";

import { EXAMS } from "@/lib/exams";
import type { Preset } from "@/lib/presets";
import type { Rule } from "@/lib/types";

const FIELDS: { key: keyof Rule; label: string; hint: string }[] = [
  { key: "attentionFrom", label: "Laranja a partir de", hint: "valor ≥" },
  { key: "alertFrom", label: "Vermelho a partir de", hint: "valor ≥" },
  { key: "attentionBelow", label: "Laranja abaixo de", hint: "valor <" },
  { key: "alertBelow", label: "Vermelho abaixo de", hint: "valor <" },
];

interface Props {
  presets: Preset[];
  activeId: string;
  onChange: (presets: Preset[], activeId: string) => void;
}

export function PresetEditor({ presets, activeId, onChange }: Props) {
  const active = presets.find((p) => p.id === activeId) ?? presets[0];

  const update = (patch: Partial<Preset>) =>
    onChange(presets.map((p) => (p.id === active.id ? { ...p, ...patch } : p)), active.id);

  const setField = (examId: string, key: keyof Rule, raw: string) => {
    const rule = { ...(active.rules[examId] ?? {}) };
    const n = raw.trim() === "" ? undefined : Number(raw.replace(",", "."));
    if (n === undefined || Number.isNaN(n)) delete rule[key];
    else rule[key] = n;
    const rules = { ...active.rules };
    if (Object.keys(rule).length) rules[examId] = rule;
    else delete rules[examId];
    update({ rules });
  };

  const duplicate = () => {
    const id = Math.random().toString(36).slice(2, 10);
    const copy: Preset = { ...active, id, name: `${active.name} (cópia)`, rules: structuredClone(active.rules) };
    onChange([...presets, copy], id);
  };

  const remove = () => {
    if (presets.length < 2) return;
    const rest = presets.filter((p) => p.id !== active.id);
    onChange(rest, rest[0].id);
  };

  return (
    <section className="card">
      <h2>1. Preset de critérios</h2>
      <p className="muted">
        Defina por exame a partir de quando o resultado merece análise (laranja) ou está acima do limite (vermelho).
        Deixe em branco o que não usar; exames sem nenhuma faixa não entram na análise.
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={active.id} onChange={(e) => onChange(presets, e.target.value)} aria-label="Preset ativo">
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <input type="text" value={active.name} onChange={(e) => update({ name: e.target.value })} aria-label="Nome do preset" />
        <button onClick={duplicate}>Duplicar</button>
        <button onClick={remove} disabled={presets.length < 2}>Excluir</button>
      </div>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Exame</th>
              {FIELDS.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {EXAMS.map((exam) => (
              <tr key={exam.id}>
                <td>
                  {exam.name} <span className="muted">({exam.unit})</span>
                </td>
                {FIELDS.map((f) => (
                  <td key={f.key}>
                    <input
                      type="number"
                      step="any"
                      value={active.rules[exam.id]?.[f.key] ?? ""}
                      onChange={(e) => setField(exam.id, f.key, e.target.value)}
                      aria-label={`${exam.name} - ${f.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
