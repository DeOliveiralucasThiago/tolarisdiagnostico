"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { PresetEditor } from "@/components/PresetEditor";
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

const SAMPLES = [
  { file: "exemplo-layout-a.pdf", label: "Exemplo layout A" },
  { file: "exemplo-layout-b.pdf", label: "Exemplo layout B" },
  { file: "exemplo-layout-c.pdf", label: "Exemplo layout C" },
];

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
    await loadSample("exemplo-layout-a.pdf");
    tourLoadedSample.current = true;
  };

  // estável entre renders: o Tour reage à identidade dos passos
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tourSteps = useMemo(() => makeTourSteps(ensureSample), []);

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
      <div className="header">
        <div>
          <h1>Tolaris Diagnóstico</h1>
          <p className="sub">Triagem rápida de exames de sangue: encontra cada resultado no laudo e aplica os seus critérios.</p>
        </div>
        <div className="row">
          {account && (
            <span className="muted">
              {account.clinicName} · {account.email}
            </span>
          )}
          <button onClick={() => setTourOpen(true)}>Ver tour</button>
          {account && <button onClick={account.onSignOut}>Sair</button>}
        </div>
      </div>
      {saveError && <p className="err" role="alert">{saveError}</p>}

      <div className="card privacy" data-tour="privacy">
        <strong>Privacidade:</strong> o PDF é lido aqui no seu navegador e <strong>não é enviado nem armazenado</strong>.
        Ao fechar ou trocar o arquivo, os dados do paciente desaparecem. Só os seus critérios (presets) são salvos, {account ? "na sua clínica" : "neste navegador"}, nunca dados de pacientes.
      </div>

      <PresetEditor
        presets={presets}
        activeId={active.id}
        catalog={catalog}
        customExams={customExams}
        onCustomExamsChange={setCustomExams}
        onChange={(p, id) => {
          setPresets(p);
          setActiveId(id);
        }}
      />

      <section className="card" data-tour="upload">
        <h2>2. Laudo do paciente</h2>
        <label
          className={`drop${over ? " over" : ""}`}
          style={{ display: "block", cursor: "pointer" }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files[0];
            if (f) openPdf(f, f.name);
          }}
        >
          {busy ? "Lendo…" : "Arraste o PDF aqui ou clique para escolher"}
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
        <div className="row" style={{ marginTop: 10 }}>
          <span className="muted">Sem laudo à mão? Teste com PDFs fictícios:</span>
          {SAMPLES.map((s) => (
            <button key={s.file} onClick={() => loadSample(s.file)}>{s.label}</button>
          ))}
        </div>
        {fileName && <p className="muted">Arquivo: {fileName}</p>}
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
      {tourOpen && <Tour steps={tourSteps} onClose={closeTour} />}
    </main>
  );
}
