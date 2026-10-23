"use client";

import { Fragment, useState } from "react";
import { useRef } from "react";
import { IconChevron, IconDownload, IconPlus, IconUpload } from "@/components/Icons";
import { SectionHead } from "@/components/SectionHead";
import { makeCustomExam } from "@/lib/custom-exams";
import { buildPresetFile, mergeImport, parsePresetFile, presetFileName } from "@/lib/preset-file";
import { newId, type Preset } from "@/lib/presets";
import { variantLabel } from "@/lib/status";
import type { ExamDefinition, Rule, RuleVariant, Thresholds } from "@/lib/types";

const FIELDS: { key: keyof Thresholds; label: string }[] = [
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
  const [create, setCreate] = useState<{ open: boolean; name: string; from: "copy" | "blank" }>({ open: false, name: "", from: "copy" });
  const [notice, setNotice] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<Preset>) =>
    onChange(presets.map((p) => (p.id === active.id ? { ...p, ...patch } : p)), active.id);

  const setField = (examId: string, key: keyof Thresholds, raw: string) => {
    const rule = { ...(active.rules[examId] ?? {}) };
    const n = raw.trim() === "" ? undefined : Number(raw.replace(",", "."));
    if (n === undefined || Number.isNaN(n)) delete rule[key];
    else rule[key] = n;
    update({ rules: { ...active.rules, [examId]: rule } });
  };

  // --- faixas por sexo e idade ---
  const [openVariants, setOpenVariants] = useState<Set<string>>(new Set());
  const toggleVariants = (id: string) =>
    setOpenVariants((o) => {
      const n = new Set(o);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const setVariants = (examId: string, fn: (v: RuleVariant[]) => RuleVariant[]) => {
    const rule = active.rules[examId] ?? {};
    const variants = fn(rule.variants ?? []);
    const next: Rule = { ...rule };
    if (variants.length) next.variants = variants;
    else delete next.variants;
    update({ rules: { ...active.rules, [examId]: next } });
  };
  const addVariant = (examId: string) => {
    setOpenVariants((o) => new Set(o).add(examId));
    // sugere Mulheres e depois Homens, que é o caso mais comum
    setVariants(examId, (v) => [...v, v.some((x) => x.sex === "F") ? (v.some((x) => x.sex === "M") ? {} : { sex: "M" }) : { sex: "F" }]);
  };
  const patchVariant = (examId: string, idx: number, patch: Partial<RuleVariant>) =>
    setVariants(examId, (v) => v.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  const setVariantNumber = (examId: string, idx: number, key: keyof Thresholds | "ageMin" | "ageMax", raw: string) =>
    setVariants(examId, (v) =>
      v.map((x, i) => {
        if (i !== idx) return x;
        const next = { ...x };
        const n = raw.trim() === "" ? undefined : Number(raw.replace(",", "."));
        if (n === undefined || Number.isNaN(n)) delete next[key];
        else next[key] = n;
        return next;
      }),
    );

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

  const createPreset = () => {
    const id = newId();
    const rules = create.from === "copy" ? structuredClone(active.rules) : {};
    onChange([...presets, { id, name: create.name.trim() || "Novo preset", rules }], id);
    setCreate({ open: false, name: "", from: "copy" });
    setNotice(null);
  };

  const download = (list: Preset[]) => {
    const blob = new Blob([JSON.stringify(buildPresetFile(list, catalog), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = presetFileName(list);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice({ kind: "ok", text: `Arquivo “${a.download}” baixado. Guarde-o em local seguro ou leve para outro computador e use “Importar arquivo”.` });
  };

  const importFile = async (file: File) => {
    if (file.size > 1_000_000) {
      setNotice({ kind: "err", text: "O arquivo é grande demais para ser um preset." });
      return;
    }
    const parsed = parsePresetFile(await file.text());
    if (!parsed.ok) {
      setNotice({ kind: "err", text: parsed.error });
      return;
    }
    const out = mergeImport(parsed.file, { presets, customExams }, newId);
    onCustomExamsChange(out.customExams);
    onChange(out.presets, out.importedIds[0]);
    const r = out.report;
    setNotice({
      kind: "ok",
      text:
        `${r.presets} ${r.presets === 1 ? "preset importado" : "presets importados"}` +
        (r.addedExams ? ` e ${r.addedExams} ${r.addedExams === 1 ? "exame personalizado adicionado" : "exames personalizados adicionados"}` : "") +
        "." +
        (r.skippedRules ? ` ${r.skippedRules} ${r.skippedRules === 1 ? "faixa foi ignorada" : "faixas foram ignoradas"} por serem de exames que este sistema não conhece.` : ""),
    });
  };

  const remove = () => {
    if (presets.length < 2) return;
    if (!window.confirm(`Excluir o preset “${active.name}”? Esta ação não pode ser desfeita.`)) return;
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
          <div className="toolbar">
            <label className="inline-field">
              <span>Nome do preset</span>
              <input type="text" value={active.name} onChange={(e) => update({ name: e.target.value })} aria-label="Nome do preset" style={{ minWidth: 240 }} />
            </label>
            <button className="small" onClick={() => setCreate((c) => ({ ...c, open: !c.open }))} aria-expanded={create.open}>
              <IconPlus width={16} height={16} /> Criar preset
            </button>
            <button className="small" onClick={remove} disabled={presets.length < 2}>Excluir preset</button>
          </div>

          {create.open && (
            <div className="sub-card">
              <h2 style={{ marginBottom: 10 }}>Novo preset</h2>
              <div className="row">
                <input type="text" placeholder="Nome (ex.: Exame admissional)" value={create.name} onChange={(e) => setCreate({ ...create, name: e.target.value })} aria-label="Nome do novo preset" style={{ minWidth: 260 }} />
              </div>
              <fieldset className="choices">
                <legend className="muted">Começar com</legend>
                <label><input type="radio" name="from" checked={create.from === "copy"} onChange={() => setCreate({ ...create, from: "copy" })} /> Uma cópia do preset atual (“{active.name}”), para ajustar só o que muda</label>
                <label><input type="radio" name="from" checked={create.from === "blank"} onChange={() => setCreate({ ...create, from: "blank" })} /> Em branco, adicionando os exames um a um</label>
              </fieldset>
              <div className="row">
                <button className="primary" onClick={createPreset}>Criar preset</button>
                <button className="ghost" onClick={() => setCreate({ open: false, name: "", from: "copy" })}>Cancelar</button>
              </div>
            </div>
          )}

          <div className="toolbar backup">
            <span className="muted">Levar seus critérios para outro computador:</span>
            <button className="small" onClick={() => download([active])}><IconDownload width={16} height={16} /> Baixar este preset</button>
            <button className="small" onClick={() => download(presets)} disabled={presets.length < 2}>Baixar todos</button>
            <button className="small" onClick={() => fileRef.current?.click()}><IconUpload width={16} height={16} /> Importar arquivo</button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              aria-label="Importar arquivo de preset"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) importFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {notice && (
            <p className={notice.kind === "ok" ? "notice" : "err"} role={notice.kind === "ok" ? "status" : "alert"} style={{ marginBottom: 12 }}>
              {notice.text}
            </p>
          )}
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
                {inPreset.map((exam, i) => {
                  const variants = active.rules[exam.id]?.variants ?? [];
                  const open = openVariants.has(exam.id) || variants.length > 0;
                  return (
                    <Fragment key={exam.id}>
                      <tr data-tour={i === 0 ? "rule-row" : undefined}>
                        <td>
                          <span className="exam-name">{exam.name}</span> {exam.unit && <span className="muted">({exam.unit})</span>}
                          {variants.length > 0 && <span className="muted"> · faixa geral</span>}
                          {isCustom(exam.id) && <div className="muted">procura por: {exam.aliases.join(", ")}</div>}
                          <div>
                            <button className="small ghost" onClick={() => (open && variants.length === 0 ? toggleVariants(exam.id) : addVariant(exam.id))} title="Definir limites diferentes por sexo e idade">
                              ＋ Sexo / idade{variants.length ? ` (${variants.length})` : ""}
                            </button>
                          </div>
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
                      {open && variants.length > 0 && (
                        <>
                          {variants.map((v, idx) => (
                            <tr key={`${exam.id}-v${idx}`} className="variant-row">
                              <td>
                                <div className="variant-cell">
                                  <span className="muted">↳</span>
                                  <select value={v.sex ?? ""} onChange={(e) => patchVariant(exam.id, idx, { sex: (e.target.value || undefined) as RuleVariant["sex"] })} aria-label={`${exam.name} - faixa ${idx + 1}: sexo`}>
                                    <option value="">Todos os sexos</option>
                                    <option value="M">Homens</option>
                                    <option value="F">Mulheres</option>
                                  </select>
                                  <span className="muted">idade</span>
                                  <input type="number" min={0} max={130} placeholder="de" value={v.ageMin ?? ""} onChange={(e) => setVariantNumber(exam.id, idx, "ageMin", e.target.value)} aria-label={`${exam.name} - faixa ${idx + 1}: idade mínima`} style={{ width: 64 }} />
                                  <input type="number" min={0} max={130} placeholder="até" value={v.ageMax ?? ""} onChange={(e) => setVariantNumber(exam.id, idx, "ageMax", e.target.value)} aria-label={`${exam.name} - faixa ${idx + 1}: idade máxima`} style={{ width: 64 }} />
                                </div>
                              </td>
                              {FIELDS.map((f) => (
                                <td key={f.key}>
                                  <input
                                    type="number"
                                    step="any"
                                    value={v[f.key] ?? ""}
                                    onChange={(e) => setVariantNumber(exam.id, idx, f.key, e.target.value)}
                                    aria-label={`${exam.name} (${variantLabel(v)}) - ${f.label}`}
                                  />
                                </td>
                              ))}
                              <td>
                                <button className="small ghost" onClick={() => setVariants(exam.id, (list) => list.filter((_, i) => i !== idx))} title="Remover esta faixa" aria-label={`Remover faixa ${idx + 1} de ${exam.name}`}>✕</button>
                              </td>
                            </tr>
                          ))}
                          <tr className="variant-row">
                            <td colSpan={6}>
                              <button className="small" onClick={() => addVariant(exam.id)}>＋ Outra faixa</button>{" "}
                              <span className="muted">Vale a primeira faixa que combinar com o paciente; se nenhuma combinar, vale a faixa geral acima. Sem o sexo ou a idade do paciente, a faixa específica não é aplicada.</span>
                            </td>
                          </tr>
                        </>
                      )}
                    </Fragment>
                  );
                })}
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
