"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconLock, IconUpload, Logo } from "@/components/Icons";
import { MembersList, OcrNotice, PatientsPanel, SexSelect, toExport, type PatientRow } from "@/components/PatientsPanel";
import { PrintReport, type PrintJob } from "@/components/PrintReport";
import { PresetEditor } from "@/components/PresetEditor";
import { SectionHead } from "@/components/SectionHead";
import { Tour } from "@/components/Tour";
import { makeTourSteps } from "@/components/tour-steps";
import { Results } from "@/components/Results";
import { catalogWith } from "@/lib/custom-exams";
import { analyzeFiles, type Analysis } from "@/lib/analysis";
import { filterAndSort } from "@/lib/batch";
import { copyText } from "@/lib/clipboard";
import { buildSummaryText } from "@/lib/export";
import { buildGroups, findSuggestions, mergeGroups, separateMember, type Group, type Member, type Suggestion } from "@/lib/grouping";
import { ageAtExam, formatName, parsePatient } from "@/lib/patient";
import { terminateOcr } from "@/lib/ocr-browser";
import { isImageFile, isPdfFile, readFileInBrowser } from "@/lib/pdf-browser";
import { DEFAULT_PRESET, loadActivePresetId, newId, pickActivePreset, saveActivePresetId, type Preset } from "@/lib/presets";
import type { Storage } from "@/lib/storage";
import type { ExamDefinition, Sex, TextItem } from "@/lib/types";

const TOUR_KEY = "tolaris.tourSeen.v1";

// Três pacientes FICTÍCIOS (cada laudo em um layout diferente) para conhecer a análise em lote.
const EXAMPLE_FILES = ["paciente-joao.pdf", "paciente-maria.pdf", "paciente-jose.pdf"];

type PatientEntry = Member;

const READ_CONCURRENCY = 3;

const DEFAULT_ORDER = { status: "all", query: "", examId: "", sort: "critical" } as const;

export interface Account {
  email: string;
  clinicName: string;
  onSignOut: () => void;
}

interface Props {
  storage: Storage;
  /** Presente no modo com login; ausente no modo local. */
  account?: Account;
}

const SAVE_DELAY_MS = 600;

export function Analyzer({ storage, account }: Props) {
  const [presets, setPresets] = useState<Preset[]>([DEFAULT_PRESET]);
  const [activeId, setActiveId] = useState(DEFAULT_PRESET.id);
  const [customExams, setCustomExams] = useState<ExamDefinition[]>([]);
  const [patients, setPatients] = useState<PatientEntry[]>([]);
  const [overrides, setOverrides] = useState<Record<string, Record<string, string>>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // união de arquivos do mesmo paciente: escolhas do médico sobre a regra automática
  const [manualGroups, setManualGroups] = useState<Record<string, string>>({});
  // sexo informado pelo médico (vale sobre o do laudo); o sexo nunca é deduzido pelo nome
  const [sexOverrides, setSexOverrides] = useState<Record<string, Sex>>({});
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const [progress, setProgress] = useState<{ done: number; total: number; note?: string } | null>(null);
  const [over, setOver] = useState(false);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);
  const [copiedSingle, setCopiedSingle] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const loaded = useRef(false);
  const prefScope = account?.email ?? "local";
  const savedPresets = useRef<Preset[]>([]);
  const savedExams = useRef<ExamDefinition[]>([]);
  const patientsRef = useRef<PatientEntry[]>([]);
  const rowsRef = useRef<PatientRow[]>([]);
  const tourLoadedSample = useRef(false);
  patientsRef.current = patients;

  useEffect(() => {
    let cancelled = false;
    storage
      .load()
      .then((w) => {
        if (cancelled) return;
        // clínica nova: começa com o preset de exemplo (será gravado pelo efeito de salvamento)
        const initial = w.presets.length ? w.presets : [{ ...DEFAULT_PRESET, id: newId() }];
        savedPresets.current = w.presets;
        savedExams.current = w.customExams;
        setPresets(initial);
        setActiveId(pickActivePreset(initial, loadActivePresetId(prefScope)).id);
        setCustomExams(w.customExams);
        loaded.current = true;
        setReady(true);
        try {
          if (!localStorage.getItem(TOUR_KEY)) setTimeout(() => setTourOpen(true), 600);
          else setPresetOpen(false); // quem já conhece a ferramenta vê os critérios recolhidos
        } catch {
          /* sem armazenamento: não abre sozinho */
        }
      })
      .catch((e: Error) => !cancelled && setSaveError(`Não foi possível carregar seus critérios: ${e.message}`));
    return () => {
      cancelled = true;
    };
  }, [storage]);

  // lembra o último preset escolhido (por usuário, neste navegador)
  useEffect(() => {
    if (loaded.current) saveActivePresetId(prefScope, activeId);
  }, [activeId, prefScope]);

  // salva (com pequena espera) só depois de carregar; grava apenas o que mudou
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      storage
        .savePresets(savedPresets.current, presets)
        .then(() => {
          savedPresets.current = presets;
          setSaveError("");
        })
        .catch((e: Error) => setSaveError(`Não foi possível salvar os presets: ${e.message}`));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [presets, storage]);

  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      storage
        .saveCustomExams(savedExams.current, customExams)
        .then(() => {
          savedExams.current = customExams;
          setSaveError("");
        })
        .catch((e: Error) => setSaveError(`Não foi possível salvar os exames personalizados: ${e.message}`));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [customExams, storage]);

  const catalog = useMemo(() => catalogWith(customExams), [customExams]);
  const active = presets.find((p) => p.id === activeId) ?? presets[0];

  const addFiles = useCallback(async (sources: { source: File | ArrayBuffer; name: string }[]) => {
    if (!sources.length) return;
    setProgress({ done: 0, total: sources.length });
    const added: PatientEntry[] = new Array(sources.length);
    let next = 0;
    let done = 0;

    const readOne = async (i: number) => {
      const s = sources[i];
      const id = newId();
      try {
        const r = await readFileInBrowser(s.source, s.name, {
          onStatus: (note) => setProgress((p) => (p ? { ...p, note } : p)),
        });
        added[i] =
          r.items.length === 0
            ? { id, fileName: s.name, items: [], info: {}, ocr: r.ocr, problem: r.ocr ? "Não foi possível reconhecer texto neste arquivo (imagem muito escura, torta ou de baixa qualidade?)." : "Sem texto no arquivo." }
            : { id, fileName: s.name, items: r.items, altItems: r.altItems, info: parsePatient(r.items), ocr: r.ocr };
      } catch (e) {
        const msg = (e as Error).message ?? "";
        added[i] = {
          id,
          fileName: s.name,
          items: [],
          info: {},
          problem: /mais de \d+ páginas/.test(msg) ? `${msg}.` : "Não foi possível ler este arquivo (protegido por senha, corrompido ou formato não suportado).",
        };
      }
      setProgress((p) => ({ ...(p ?? { total: sources.length }), done: ++done, total: sources.length }));
    };

    // lê alguns PDFs ao mesmo tempo para aproveitar os núcleos do computador
    const worker = async () => {
      while (next < sources.length) await readOne(next++);
    };
    await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, sources.length) }, worker));

    setPatients((prev) => [...prev, ...added]);
    setProgress(null);
    void terminateOcr(); // libera a memória do OCR ao terminar o lote
  }, []);

  const addFileList = (files: FileList | File[]) =>
    addFiles(Array.from(files).filter((f) => isPdfFile(f) || isImageFile(f)).map((f) => ({ source: f, name: f.name })));

  const clearAll = useCallback(() => {
    analysisCache.current.clear();
    setManualGroups({});
    setSexOverrides({});
    setDismissed(new Set());
    setPatients([]);
    setOverrides({});
    setExpanded(new Set());
  }, []);

  const loadExamples = useCallback(async () => {
    clearAll();
    const sources = await Promise.all(
      EXAMPLE_FILES.map(async (file) => ({ source: await (await fetch(`/samples/${file}`)).arrayBuffer(), name: file })),
    );
    await addFiles(sources);
  }, [addFiles, clearAll]);

  const removePatient = (groupId: string) => {
    const ids = new Set(groups.find((g) => g.id === groupId)?.members.map((m) => m.id) ?? []);
    analysisCache.current.delete(groupId);
    setPatients((ps) => ps.filter((p) => !ids.has(p.id)));
    setManualGroups((m) => Object.fromEntries(Object.entries(m).filter(([k]) => !ids.has(k))));
    setOverrides(({ [groupId]: _drop, ...rest }) => rest);
    setSexOverrides(({ [groupId]: _s, ...rest }) => rest);
    setExpanded((e) => {
      const n = new Set(e);
      n.delete(groupId);
      return n;
    });
  };

  const mergeSuggestion = (sg: Suggestion) => {
    setManualGroups((m) => mergeGroups(m, sg.a, sg.b));
    // as correções já feitas em cada lado passam para o paciente unido (as do primeiro prevalecem)
    setOverrides(({ [sg.b.id]: fromB, ...rest }) => ({ ...rest, [sg.a.id]: { ...(fromB ?? {}), ...(rest[sg.a.id] ?? {}) } }));
    setSexOverrides(({ [sg.b.id]: fromB, ...rest }) => (rest[sg.a.id] || !fromB ? rest : { ...rest, [sg.a.id]: fromB }));
    analysisCache.current.delete(sg.a.id);
  };
  const dismissSuggestion = (sg: Suggestion) => setDismissed((d) => new Set(d).add(sg.key));
  const separate = (memberId: string) => setManualGroups((m) => separateMember(m, memberId));

  const toggle = (id: string) =>
    setExpanded((e) => {
      const n = new Set(e);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const ensureSample = async () => {
    if (patientsRef.current.length) return;
    await loadExamples();
    tourLoadedSample.current = true;
  };

  const expandFirst = async () => {
    const first = filterAndSort(rowsRef.current, DEFAULT_ORDER).find((p) => p.analysis);
    if (first) setExpanded(new Set([first.id]));
    await new Promise((r) => setTimeout(r, 150));
  };

  // estável entre renders: o Tour reage à identidade dos passos
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tourSteps = useMemo(
    () =>
      makeTourSteps({
        ensureSample,
        expandFirst,
        openPreset: async () => {
          setPresetOpen(true);
          await new Promise((r) => setTimeout(r, 120));
        },
      }),
    [],
  );

  const closeTour = () => {
    setTourOpen(false);
    try {
      localStorage.setItem(TOUR_KEY, "1");
    } catch {
      /* ignora */
    }
    // não deixa os laudos de exemplo na tela depois do tour
    if (tourLoadedSample.current) {
      tourLoadedSample.current = false;
      clearAll();
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const groups: Group[] = useMemo(() => buildGroups(patients, manualGroups), [patients, manualGroups]);
  const suggestions = useMemo(() => findSuggestions(groups, dismissed), [groups, dismissed]);

  // Corrigir um valor reanalisa só aquele paciente; mudar critérios ou arquivos reanalisa o que mudou.
  const analysisCache = useRef(new Map<string, { sig: string; rules: object; catalog: object; overrides: object | undefined; analysis: Analysis }>());
  const cachedAnalysis = (g: Group, readable: Member[], sex: Sex | undefined, age: number | null): Analysis => {
    // a chave inclui sexo e idade: mudar qualquer um reanalisa só este paciente
    const sig = `${readable.map((m) => m.id).join(",")}|${sex ?? ""}|${age ?? ""}`;
    const hit = analysisCache.current.get(g.id);
    const ov = overrides[g.id];
    if (hit && hit.sig === sig && hit.rules === active.rules && hit.catalog === catalog && hit.overrides === ov) return hit.analysis;
    const analysis = analyzeFiles(readable.map((m) => ({ fileName: m.fileName, items: m.items, altItems: m.altItems, ocr: m.ocr })), active.rules, catalog, ov, { sex, age });
    analysisCache.current.set(g.id, { sig, rules: active.rules, catalog, overrides: ov, analysis });
    return analysis;
  };

  const rows: PatientRow[] = useMemo(
    () =>
      groups.map((g) => {
        const age = ageAtExam(g.birth, g.examDate);
        const sex = sexOverrides[g.id] ?? g.sex;
        const readable = g.members.filter((m) => !m.problem);
        const files = g.members.map((m) => m.fileName);
        return {
          id: g.id,
          label: g.name ? formatName(g.name) : files[0].replace(/\.pdf$/i, ""),
          fileName: files.join(" | "),
          subtitle: [age != null ? `${age} anos` : "", sex ? (sex === "F" ? "feminino" : "masculino") : "", files.length > 1 ? `${files.length} arquivos` : ""].filter(Boolean).join(" · "),
          sex,
          sexSource: sexOverrides[g.id] ? ("manual" as const) : g.sex ? ("laudo" as const) : undefined,
          sexConflict: g.sexConflict && !sexOverrides[g.id],
          birth: g.birth,
          age,
          members: g.members.map((m) => ({ id: m.id, fileName: m.fileName })),
          ocr: readable.some((m) => m.ocr),
          via: g.via,
          problem: readable.length ? undefined : g.members[0].problem,
          analysis: readable.length ? cachedAnalysis(g, readable, sex, age) : null,
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, active.rules, catalog, overrides, sexOverrides],
  );
  rowsRef.current = rows;

  const usesSex = Object.values(active.rules).some((r) => r.variants?.some((v) => v.sex));
  const setSex = (id: string, sex: Sex | "") => setSexOverrides((o) => (sex ? { ...o, [id]: sex } : (({ [id]: _drop, ...rest }) => rest)(o)));

  const exams = Object.keys(active.rules)
    .map((id) => catalog.find((e) => e.id === id))
    .filter((e): e is ExamDefinition => !!e);

  const setOverride = (patientId: string, examId: string, value: string) =>
    setOverrides((o) => ({ ...o, [patientId]: { ...(o[patientId] ?? {}), [examId]: value } }));

  // Imprime / salva em PDF: monta o relatório oculto e abre o diálogo de impressão do navegador.
  const printDate = useRef(new Date());
  const startPrint = (kind: PrintJob["kind"], ids: string[]) => {
    printDate.current = new Date();
    setPrintJob({ kind, ids });
  };
  useEffect(() => {
    if (!printJob) return;
    const title = document.title;
    const first = rowsRef.current.find((r) => r.id === printJob.ids[0]);
    document.title = printJob.kind === "patient" && first ? `Triagem - ${first.label}` : "Triagem de exames";
    const done = () => {
      document.title = title;
      setPrintJob(null);
    };
    window.addEventListener("afterprint", done, { once: true });
    const t = setTimeout(() => window.print(), 60);
    return () => {
      clearTimeout(t);
      window.removeEventListener("afterprint", done);
      document.title = title;
    };
  }, [printJob]);

  const busy = progress !== null;
  const single = rows.length === 1 ? rows[0] : null;
  const copySingle = async (p: PatientRow) => {
    if (await copyText(buildSummaryText(toExport(p), active.name))) {
      setCopiedSingle(true);
      setTimeout(() => setCopiedSingle(false), 2500);
    }
  };

  if (!ready) {
    return (
      <main>
        <p className={saveError ? "err" : "muted"}>{saveError || "Carregando seus critérios…"}</p>
      </main>
    );
  }

  return (
    <>
    <main className="screen-only">
      <header className="header">
        <div className="brand">
          <Logo size={38} />
          <div>
            <div className="brand-name">Tolaris Diagnóstico</div>
            <div className="brand-tag">Triagem rápida de exames de sangue</div>
          </div>
        </div>
        <div className="header-actions">
          {account && (
            <span className="chip" title={account.email}>
              <strong>{account.clinicName}</strong>
            </span>
          )}
          <button className="ghost" onClick={() => setTourOpen(true)}>Ver tour</button>
          {account && <button onClick={account.onSignOut}>Sair</button>}
        </div>
      </header>
      {saveError && <p className="err" role="alert">{saveError}</p>}

      <div className="card privacy" data-tour="privacy">
        <IconLock />
        <div>
          <strong>Os dados do paciente não saem do seu computador.</strong> O PDF é lido aqui no navegador, não é enviado nem
          armazenado e some ao trocar de arquivo. Só os seus critérios (presets) são salvos, {account ? "na sua clínica" : "neste navegador"}.
        </div>
      </div>

      <PresetEditor
        presets={presets}
        activeId={active.id}
        catalog={catalog}
        customExams={customExams}
        onCustomExamsChange={setCustomExams}
        open={presetOpen}
        onToggle={() => setPresetOpen((o) => !o)}
        onChange={(p, id) => {
          setPresets(p);
          setActiveId(id);
        }}
      />

      <section className="card" data-tour="upload">
        <SectionHead n={2} title="Laudos dos pacientes" hint="Envie um ou vários laudos de uma vez (PDF ou foto). A ferramenta encontra cada resultado pelo nome do exame." />
        <label
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            addFileList(e.dataTransfer.files);
          }}
        >
          <span className="drop-icon"><IconUpload /></span>
          <strong>{busy ? `Lendo laudos… ${progress.done} de ${progress.total}` : "Arraste os laudos aqui"}</strong>
          <span className="muted">{busy ? progress.note ?? "Aguarde, a leitura acontece no seu computador." : "PDF digital, PDF escaneado ou foto (JPG, PNG) · ou clique para escolher"}</span>
          {busy && <progress className="bar" value={progress.done} max={progress.total} />}
          <input
            type="file"
            accept="application/pdf,image/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) addFileList(e.target.files);
              e.target.value = "";
            }}
          />
        </label>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="small" onClick={loadExamples} disabled={busy}>Testar com 3 laudos de exemplo</button>
          <span className="muted">Escaneados e fotos usam reconhecimento de imagem (OCR), no seu computador, e levam mais tempo. Podem ter erros: confira os valores.</span>
        </div>
      </section>

      {single && single.analysis && (
        <Results
          analysis={single.analysis}
          overrides={overrides[single.id] ?? {}}
          onOverride={(examId, v) => setOverride(single.id, examId, v)}
          header={
            <div className="patient-head">
              <div>
                <div className="patient-name big">{single.label}</div>
                <div className="muted">{[single.subtitle, single.members.length > 1 ? "" : single.fileName].filter(Boolean).join(" · ")}</div>
                <MembersList members={single.members} onSeparate={separate} via={single.via} />
                <div className="profile">
                  <span className="muted">Sexo:</span>
                  <SexSelect value={single.sex} source={single.sexSource} conflict={single.sexConflict} onChange={(v) => setSex(single.id, v)} />
                  {usesSex && !single.sex && <span className="hint">Seus critérios têm faixas por sexo: informe para aplicá-las.</span>}
                </div>
                {single.ocr && <OcrNotice />}
              </div>
              <div className="row">
                <button className="small" onClick={() => copySingle(single)}>{copiedSingle ? "✓ Resumo copiado" : "Copiar resumo"}</button>
                <button className="small" onClick={() => startPrint("patient", [single.id])}>Imprimir / PDF</button>
                <button className="small ghost" onClick={() => removePatient(single.id)}>Remover</button>
              </div>
            </div>
          }
        />
      )}
      {single && !single.analysis && (
        <section className="card">
          <p className="err" style={{ margin: 0 }}>{single.fileName}: {single.problem}</p>
          <button className="small" style={{ marginTop: 10 }} onClick={() => removePatient(single.id)}>Remover</button>
        </section>
      )}
      {rows.length > 1 && (
        <PatientsPanel
          patients={rows}
          exams={exams}
          presetName={active.name}
          usesSex={usesSex}
          onSex={setSex}
          suggestions={suggestions}
          onMerge={mergeSuggestion}
          onDismiss={dismissSuggestion}
          onSeparate={separate}
          onPrint={startPrint}
          expanded={expanded}
          onToggle={toggle}
          overrides={overrides}
          onOverride={setOverride}
          onRemove={removePatient}
          onClear={clearAll}
        />
      )}
      <p className="app-foot">Ferramenta de apoio à triagem. A interpretação e a decisão clínica são sempre do médico.</p>
      {tourOpen && <Tour steps={tourSteps} onClose={closeTour} />}
    </main>
    {printJob && (
      <div className="print-only">
        <PrintReport job={printJob} rows={rows} presetName={active.name} date={printDate.current} />
      </div>
    )}
    </>
  );
}
