"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconLock, IconUpload, Logo } from "@/components/Icons";
import { PatientsPanel, type PatientRow } from "@/components/PatientsPanel";
import { PresetEditor } from "@/components/PresetEditor";
import { SectionHead } from "@/components/SectionHead";
import { Tour } from "@/components/Tour";
import { makeTourSteps } from "@/components/tour-steps";
import { Results } from "@/components/Results";
import { catalogWith } from "@/lib/custom-exams";
import { analyze, type Analysis } from "@/lib/analysis";
import { filterAndSort } from "@/lib/batch";
import { ageFrom, formatName, parsePatient, type PatientInfo } from "@/lib/patient";
import { readPdfInBrowser } from "@/lib/pdf-browser";
import { DEFAULT_PRESET, loadActivePresetId, newId, pickActivePreset, saveActivePresetId, type Preset } from "@/lib/presets";
import type { Storage } from "@/lib/storage";
import type { ExamDefinition, TextItem } from "@/lib/types";

const TOUR_KEY = "tolaris.tourSeen.v1";

// Três pacientes FICTÍCIOS (cada laudo em um layout diferente) para conhecer a análise em lote.
const EXAMPLE_FILES = ["paciente-joao.pdf", "paciente-maria.pdf", "paciente-jose.pdf"];

interface PatientEntry {
  id: string;
  fileName: string;
  items: TextItem[];
  info: PatientInfo;
  /** Motivo, quando o PDF não pôde ser analisado. */
  problem?: string;
}

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
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [over, setOver] = useState(false);
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
        const items = await readPdfInBrowser(s.source);
        added[i] =
          items.length === 0
            ? { id, fileName: s.name, items, info: {}, problem: "Sem texto selecionável (provavelmente é um scan ou foto)." }
            : { id, fileName: s.name, items, info: parsePatient(items) };
      } catch {
        added[i] = { id, fileName: s.name, items: [], info: {}, problem: "Não foi possível ler este PDF (protegido por senha ou corrompido?)." };
      }
      setProgress({ done: ++done, total: sources.length });
    };

    // lê alguns PDFs ao mesmo tempo para aproveitar os núcleos do computador
    const worker = async () => {
      while (next < sources.length) await readOne(next++);
    };
    await Promise.all(Array.from({ length: Math.min(READ_CONCURRENCY, sources.length) }, worker));

    setPatients((prev) => [...prev, ...added]);
    setProgress(null);
  }, []);

  const addFileList = (files: FileList | File[]) =>
    addFiles(Array.from(files).filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name)).map((f) => ({ source: f, name: f.name })));

  const clearAll = useCallback(() => {
    analysisCache.current.clear();
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

  const removePatient = (id: string) => {
    analysisCache.current.delete(id);
    setPatients((ps) => ps.filter((p) => p.id !== id));
    setOverrides(({ [id]: _drop, ...rest }) => rest);
    setExpanded((e) => {
      const n = new Set(e);
      n.delete(id);
      return n;
    });
  };

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

  // Corrigir um valor reanalisa só aquele paciente; mudar critérios reanalisa todos.
  const analysisCache = useRef(new Map<string, { rules: object; catalog: object; overrides: object | undefined; analysis: Analysis }>());
  const cachedAnalysis = (p: PatientEntry): Analysis => {
    const hit = analysisCache.current.get(p.id);
    const ov = overrides[p.id];
    if (hit && hit.rules === active.rules && hit.catalog === catalog && hit.overrides === ov) return hit.analysis;
    const analysis = analyze(p.items, active.rules, catalog, ov);
    analysisCache.current.set(p.id, { rules: active.rules, catalog, overrides: ov, analysis });
    return analysis;
  };

  const rows: PatientRow[] = useMemo(
    () =>
      patients.map((p) => {
        const age = p.info.birth ? ageFrom(p.info.birth) : null;
        return {
          id: p.id,
          label: p.info.name ? formatName(p.info.name) : p.fileName.replace(/\.pdf$/i, ""),
          fileName: p.fileName,
          subtitle: age != null ? `${age} anos` : "",
          problem: p.problem,
          analysis: p.problem ? null : cachedAnalysis(p),
        };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [patients, active.rules, catalog, overrides],
  );
  rowsRef.current = rows;

  const exams = Object.keys(active.rules)
    .map((id) => catalog.find((e) => e.id === id))
    .filter((e): e is ExamDefinition => !!e)
    .map((e) => ({ id: e.id, name: e.name }));

  const setOverride = (patientId: string, examId: string, value: string) =>
    setOverrides((o) => ({ ...o, [patientId]: { ...(o[patientId] ?? {}), [examId]: value } }));

  const busy = progress !== null;
  const single = rows.length === 1 ? rows[0] : null;

  if (!ready) {
    return (
      <main>
        <p className={saveError ? "err" : "muted"}>{saveError || "Carregando seus critérios…"}</p>
      </main>
    );
  }

  return (
    <main>
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
        <SectionHead n={2} title="Laudos dos pacientes" hint="Envie um ou vários PDFs de uma vez (um laudo por paciente). A ferramenta encontra cada resultado pelo nome do exame." />
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
          <strong>{busy ? `Lendo laudos… ${progress.done} de ${progress.total}` : "Arraste os PDFs aqui"}</strong>
          <span className="muted">{busy ? "Aguarde, a leitura acontece no seu computador." : "ou clique para escolher um ou vários arquivos"}</span>
          {busy && <progress className="bar" value={progress.done} max={progress.total} />}
          <input
            type="file"
            accept="application/pdf"
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
          <span className="muted">Nesta versão são lidos laudos digitais (PDF com texto), não fotos nem scans.</span>
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
                <div className="muted">{[single.subtitle, single.fileName].filter(Boolean).join(" · ")}</div>
              </div>
              <button className="small ghost" onClick={() => removePatient(single.id)}>Remover</button>
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
  );
}
