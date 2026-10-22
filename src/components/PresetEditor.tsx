"use client";

import { useState } from "react";
import { IconChevron, IconPlus } from "@/components/Icons";
import { SectionHead } from "@/components/SectionHead";
import { makeCustomExam } from "@/lib/custom-exams";
import { newId, type Preset } from "@/lib/presets";
import type { ExamDefinition, Rule } from "@/lib/types";

const FIELDS: { key: keyof Rule; label: string }[] = [
  { key: "attentionFrom", label: "Laranja a partir de" },
  { key: "alertFrom", label: "Vermelho a partir de" },
  { key: "attentionBelow", label: "Laranja abaixo de" },
  { key: "alertBelow", label: "Vermelho abaixo de" },
];

interface Props {
  presets: Preset[];
  activeId: string;
  catalog: ExamDefinition[];
  onChange: (presets: Preset[], activeId: string) => void;
  customExams: ExamDefinition[];
  onCustomExamsChange: (list: ExamDefinition[]) => void;
  open: boolean;
  onToggle: () => void;
}

export function PresetEditor({ presets, activeId, catalog, onChange, customExams, onCustomExamsChange, open, onToggle }: Props) {
  const active = presets.find((p) => p.id === activeId) ?? presets[0];
  const [form, setForm] = useState({ open: false, name: "", search: "", unit: "" });

  const update = (patch: Partial<Preset>) =>
    onChange(presets.map((p) => (p.id === active.id ? { ...p, ...patch } : p)), active.id);

  const setField = (examId: string, key: keyof Rule, raw: string) => {
    const rule = { ...(active.rules[examId] ?? {}) };
    const n = raw.trim() === "" ? undefined : Number(raw.replace(",", "."));
    if (n === undefined || Number.isNaN(n)) delete rule[key];
    else rule[key] = n;
    update({ rules: { ...active.rules, [examId]: rule } });
  };

  const addExam = (examId: string) => {
    if (examId && !active.rules[examId]) update({ rules: { ...active.rules, [examId]: {} } });
  };

  const removeExam = (examId: string) => {
    const rules = { ...active.rules };
    delete rules[examId];
    update({ rules });
  };

  const addCustom = () => {
    if (!form.name.trim()) return;
    const exam = makeCustomExam(form.name, form.search, form.unit);
    onCustomExamsChange([...customExams, exam]);
    update({ rules: { ...active.rules, [exam.id]: {} } });
    setForm({ open: false, name: "", search: "", unit: "" });
  };

  const deleteCustom = (examId: string) => {
    onCustomExamsChange(customExams.filter((e) => e.id !== examId));
    onChange(
      presets.map((p) => {
        const rules = { ...p.rules };
        delete rules[examId];
        return { ...p, rules };
      }),
      active.id,
    );
  };

  const duplicate = () => {
    const id = newId();
    const copy: Preset = { ...active, id, name: `${active.name} (cópia)`, rules: structuredClone(active.rules) };
    onChange([...presets, copy], id);
  };

  const remove = () => {
    if (presets.length < 2) return;
    const rest = presets.filter((p) => p.id !== active.id);
    onChange(rest, rest[0].id);
  };

  const inPreset = catalog.filter((e) => e.id in active.rules);
  const available = catalog.filter((e) => !(e.id in active.rules));
  const isCustom = (id: string) => customExams.some((e) => e.id === id);

  const analysed = inPreset.filter((e) => Object.keys(active.rules[e.id] ?? {}).length > 0).length;

  return (
    <section className="card">
      <SectionHead
        n={1}
        title="Seus critérios"
        hint="Para cada exame, defina a partir de quando o resultado merece análise (laranja) ou está acima do limite (vermelho)."
      />

      <div className="preset-bar" data-tour="preset">
        <select value={active.id} onChange={(e) => onChange(presets, e.target.value)} aria-label="Preset ativo">
          {presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span className="muted preset-summary">{analysed} {analysed === 1 ? "exame configurado" : "exames configurados"}</span>
        <button onClick={onToggle} aria-expanded={open}>
          {open ? "Recolher" : "Editar critérios"}
          <IconChevron width={16} height={16} className={`chev${open ? " open" : ""}`} />
        </button>
      </div>

      {open && (
        <div className="preset-body">
          <div className="row" style={{ marginBottom: 12 }}>
            <input type="text" value={active.name} onChange={(e) => update({ name: e.target.value })} aria-label="Nome do preset" style={{ minWidth: 240 }} />
            <button className="small" onClick={duplicate}>Duplicar preset</button>
            <button className="small" onClick={remove} disabled={presets.length < 2}>Excluir preset</button>
          </div>
          <p className="muted" style={{ marginBottom: 10 }}>
            Deixe em branco o que não usar. Exames sem nenhuma faixa não são avaliados.
          </p>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Exame</th>
                  {FIELDS.map((f) => (
                    <th key={f.key}>{f.label}</th>
                  ))}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {inPreset.length === 0 && (
                  <tr><td colSpan={6} className="muted">Nenhum exame neste preset. Use o “+” abaixo para adicionar.</td></tr>
                )}
                {inPreset.map((exam, i) => (
                  <tr key={exam.id} data-tour={i === 0 ? "rule-row" : undefined}>
                    <td>
                      <span className="exam-name">{exam.name}</span> {exam.unit && <span className="muted">({exam.unit})</span>}
                      {isCustom(exam.id) && <div className="muted">procura por: {exam.aliases.join(", ")}</div>}
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
                    <td style={{ whiteSpace: "nowrap" }}>
                      <button className="small ghost" onClick={() => removeExam(exam.id)} title="Tirar do preset" aria-label={`Remover ${exam.name} do preset`}>✕</button>
                      {isCustom(exam.id) && (
                        <button className="small ghost" onClick={() => deleteCustom(exam.id)} title="Apagar este exame personalizado" aria-label={`Apagar exame personalizado ${exam.name}`}>🗑</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row card-foot" data-tour="add-exam">
            <select value="" onChange={(e) => addExam(e.target.value)} aria-label="Adicionar exame do catálogo">
              <option value="">＋ Adicionar exame do catálogo…</option>
              {available.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
            <button onClick={() => setForm((f) => ({ ...f, open: !f.open }))}>
              <IconPlus width={16} height={16} /> Novo exame personalizado
            </button>
          </div>

          {form.open && (
            <div className="sub-card">
              <h2 style={{ marginBottom: 10 }}>Novo exame</h2>
              <div className="row">
                <input type="text" placeholder="Nome (ex.: Vitamina C)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Nome do novo exame" />
                <input type="text" style={{ minWidth: 280 }} placeholder="Texto a procurar no laudo (separe variações com vírgula)" value={form.search} onChange={(e) => setForm({ ...form, search: e.target.value })} aria-label="Texto a procurar no laudo" />
                <input type="text" style={{ width: 110 }} placeholder="Unidade" value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} aria-label="Unidade" />
                <button className="primary" onClick={addCustom} disabled={!form.name.trim()}>Adicionar</button>
              </div>
              <p className="muted" style={{ marginTop: 10 }}>
                O nome do exame deve aparecer no começo da linha do laudo. Se deixar o texto em branco, usamos o nome.
                Depois de adicionar, preencha as faixas (laranja/vermelho) na tabela acima.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
