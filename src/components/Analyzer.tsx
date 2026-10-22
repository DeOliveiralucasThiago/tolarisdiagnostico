"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { IconFile, IconLock, IconUpload, Logo } from "@/components/Icons";
import { PresetEditor } from "@/components/PresetEditor";
import { SectionHead } from "@/components/SectionHead";
import { Tour } from "@/components/Tour";
import { makeTourSteps } from "@/components/tour-steps";
import { Results } from "@/components/Results";
import { catalogWith } from "@/lib/custom-exams";
import { extractResults } from "@/lib/extract";
import { readPdfInBrowser } from "@/lib/pdf-browser";
import { DEFAULT_PRESET, newId, type Preset } from "@/lib/presets";
import type { Storage } from "@/lib/storage";
import type { ExamDefinition, ExtractionOutput, TextItem } from "@/lib/types";

const TOUR_KEY = "tolaris.tourSeen.v1";

const EXAMPLE_FILE = "exemplo-layout-a.pdf";

// Variações de layout existem só para desenvolvimento/testes de leitura; o médico vê apenas o exemplo principal.
const DEV_SAMPLES =
  process.env.NODE_ENV !== "production"
    ? [
        { file: "exemplo-layout-b.pdf", label: "Layout B" },
        { file: "exemplo-layout-c.pdf", label: "Layout C" },
      ]
    : [];

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
  const [items, setItems] = useState<TextItem[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [presetOpen, setPresetOpen] = useState(true);
  const [ready, setReady] = useState(false);
  const [saveError, setSaveError] = useState("");
  const loaded = useRef(false);
  const savedPresets = useRef<Preset[]>([]);
  const savedExams = useRef<ExamDefinition[]>([]);
  const itemsRef = useRef<TextItem[] | null>(null);
  const tourLoadedSample = useRef(false);
  itemsRef.current = items;

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
        setActiveId(initial[0].id);
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

  const catalog = catalogWith(customExams);
  const active = presets.find((p) => p.id === activeId) ?? presets[0];

  const openPdf = useCallback(async (source: File | ArrayBuffer, name: string) => {
    setBusy(true);
    setError("");
    try {
      setItems(await readPdfInBrowser(source));
      setFileName(name);
      setOverrides({});
    } catch {
      setItems(null);
      setError("Não foi possível ler este PDF. Verifique se é um laudo digital (não protegido por senha).");
    } finally {
      setBusy(false);
    }
  }, []);

  const loadSample = async (file: string) => {
    const buf = await (await fetch(`/samples/${file}`)).arrayBuffer();
    await openPdf(buf, file);
  };

  const ensureSample = async () => {
    if (itemsRef.current) return;
    await loadSample(EXAMPLE_FILE);
    tourLoadedSample.current = true;
  };

  // estável entre renders: o Tour reage à identidade dos passos
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tourSteps = useMemo(
    () =>
      makeTourSteps({
        ensureSample,
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
    // não deixa o laudo de exemplo na tela depois do tour
    if (tourLoadedSample.current) {
      tourLoadedSample.current = false;
      setItems(null);
      setFileName("");
      setOverrides({});
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const output: ExtractionOutput | null = items ? extractResults(items, Object.keys(active.rules), catalog) : null;
  const noText = items !== null && items.length === 0;

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
        <SectionHead n={2} title="Laudo do paciente" hint="Envie o PDF do exame; a ferramenta encontra cada resultado pelo nome do exame." />
        <label
          className={`drop${over ? " over" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) openPdf(f, f.name);
          }}
        >
          <span className="drop-icon"><IconUpload /></span>
          <strong>{busy ? "Lendo o laudo…" : "Arraste o PDF aqui"}</strong>
          <span className="muted">ou clique para escolher o arquivo</span>
          <input
            type="file"
            accept="application/pdf"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) openPdf(f, f.name);
              e.target.value = "";
            }}
          />
        </label>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="small" onClick={() => loadSample(EXAMPLE_FILE)}>Testar com um laudo de exemplo</button>
          {DEV_SAMPLES.map((s) => (
            <button key={s.file} className="small ghost" onClick={() => loadSample(s.file)}>{s.label}</button>
          ))}
          <span className="muted">Nesta versão são lidos laudos digitais (PDF com texto), não fotos nem scans.</span>
        </div>
        {fileName && (
          <span className="file-pill"><IconFile width={16} height={16} /> {fileName}</span>
        )}
        {error && <p className="err">{error}</p>}
        {noText && (
          <p className="err">
            Este PDF não tem texto selecionável (provavelmente é um scan ou foto). Nesta versão só laudos digitais são lidos.
          </p>
        )}
      </section>

      {output && !noText && (
        <Results
          output={output}
          catalog={catalog}
          rules={active.rules}
          overrides={overrides}
          onOverride={(id, v) => setOverrides((o) => ({ ...o, [id]: v }))}
        />
      )}
      <p className="app-foot">Ferramenta de apoio à triagem. A interpretação e a decisão clínica são sempre do médico.</p>
      {tourOpen && <Tour steps={tourSteps} onClose={closeTour} />}
    </main>
  );
}
