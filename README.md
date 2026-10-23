# Tolaris Diagnóstico

Ferramenta de apoio à triagem de exames de sangue para a medicina do trabalho.
O médico define seus critérios (presets) por exame; ao carregar um laudo em PDF, a ferramenta
localiza cada exame e mostra um semáforo (verde / laranja / vermelho / cinza = não localizado).

## Análise em lote
Envie vários PDFs de uma vez (um laudo por paciente). A ferramenta lê o nome e a data de nascimento do cabeçalho, analisa cada laudo com o preset escolhido e mostra uma lista ordenada do mais crítico ao menos crítico, com filtros (situação, exame alterado, busca por nome) e detalhe por paciente. Tudo acontece no navegador e **nada é guardado**: ao recarregar a página, a lista some.

### Laudos escaneados e fotos (OCR)
PDFs sem texto (escaneados) e imagens (JPG/PNG) passam por **reconhecimento de texto no próprio navegador** (tesseract.js, com os arquivos em `public/ocr`, copiados de `node_modules` por `scripts/copy-ocr-assets.mjs` antes do `dev`/`build`): nenhuma imagem sai do computador e nada vem de CDN de terceiros. O fluxo é: renderizar a página, **endireitar** (`estimateSkew`), ler duas vezes (imagem normal e com limiarização adaptativa) e comparar. Valores em que as duas leituras divergem, ou que destoam muito da faixa do laboratório (ex.: vírgula perdida), ganham **⚠ conferir** (`src/lib/plausibility.ts`); todo laudo lido por OCR leva um aviso, e a planilha, o resumo e a impressão registram "OCR (conferir)". Nomes de exame aproximados (ex.: `ALTITGP` → TGP) só valem em OCR.

Medição com 224 valores em 21 imagens degradadas (100/200 dpi, JPEG ruim, torta, com sombra, foto de celular): 95% certos, 2% não lidos (ficam cinza), 3% errados, dos quais a maioria sinalizada. Fotos reais podem ser piores.

### Exames em arquivos separados
Se os exames de um mesmo paciente vierem em PDFs diferentes, a ferramenta reúne os arquivos em **um só paciente** (`src/lib/grouping.ts`): pelo **CPF**, quando o laudo traz um CPF válido (dígitos verificadores conferidos; mesmo CPF une mesmo com o nome escrito um pouco diferente), ou por **nome e data de nascimento** iguais. O CPF serve **somente para vincular arquivos**: fica só em memória e nunca é exibido, exportado nem impresso. CPFs diferentes nunca são unidos; mesmo CPF com nomes ou nascimentos bem diferentes, ou laudo sem CPF que combina com mais de um paciente, geram um aviso para o médico decidir. Nome igual com um dos laudos sem data de nascimento **não é unido sozinho**: aparece "Possível mesmo paciente", com **Unir** e **São pessoas diferentes**. Homônimos (nascimentos diferentes) nunca são sugeridos. Em qualquer paciente reunido, **Separar** desfaz. Cada exame vem do primeiro arquivo em que aparece; se outro arquivo trouxer o mesmo exame com valor diferente, aparece o selo "valor repetido" com o outro valor.

## Exportar resultados
- **Baixar planilha (CSV):** uma linha por paciente (respeita os filtros), com situação geral, contagens, exames para atenção e, para cada exame do preset, valor e situação. Abre direto no Excel em português (`;` e UTF-8). Textos vindos dos PDFs são neutralizados contra fórmulas (`src/lib/export.ts`).
- **Copiar resumo:** texto do paciente (atenção, dentro do padrão, não localizados) para colar no ASO ou em outro sistema.
- **Imprimir / PDF:** relatório do paciente ou do lote pelo diálogo de impressão do navegador ("Salvar como PDF").
Tudo é gerado no navegador; nada é enviado a servidor.

## Presets: criar, baixar e importar
Em **Criar preset** o médico monta um novo conjunto de critérios (cópia do atual ou em branco). **Baixar este preset / Baixar todos** gera um arquivo `.json` só com critérios e os exames personalizados usados (nunca dados de pacientes), e **Importar arquivo** o carrega em outro computador, sem sobrescrever nada (`src/lib/preset-file.ts`, com validação rigorosa do arquivo recebido).

## Princípios
- **Privacidade:** o PDF é lido no navegador (pdf.js) e nunca é enviado nem armazenado. Só os presets (faixas, sem dados de paciente) ficam no `localStorage`.
- **Leitura independente de layout:** cada exame é encontrado pelo nome/sinônimos (`src/lib/exams.ts`), não pela posição; o resultado é separado da faixa de referência do laboratório (`src/lib/extract.ts`).
- **Segurança:** exame não localizado fica cinza, nunca verde. O médico confere a origem de cada valor e pode corrigi-lo.
- Os valores do preset de exemplo são apenas demonstração; não são critério clínico.

- **Tour guiado:** abre sozinho na primeira visita e pode ser revisto em “Ver tour”. Passos em `src/components/tour-steps.tsx`; o componente é `src/components/Tour.tsx` (sem dependências). O laudo fictício carregado pelo tour é removido ao concluir.

## Desenvolvimento
```bash
npm install
npm run dev          # http://localhost:3000
npm test             # testes de leitura (3 layouts de PDF), números e semáforo
npm run gen:samples  # regenera os PDFs fictícios em public/samples
```

## Login e presets na nuvem (Supabase)
Sem configuração, o app roda em **modo local** (presets só neste navegador). Com Supabase, cada clínica tem login e os presets/exames personalizados são compartilhados entre os médicos dela. **Nenhum dado de paciente é gravado**: o banco só tem clínicas, usuários e critérios.

1. Crie um projeto em https://supabase.com.
2. No **SQL Editor**, rode o conteúdo de `supabase/migrations/0001_init.sql` (cria as tabelas com RLS: cada clínica só enxerga os próprios dados).
3. Em **Authentication → Providers → Email**, decida se exige confirmação de e-mail; em **URL Configuration**, informe a URL do site.
4. Copie `.env.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (chave pública). **Nunca** use a chave `service_role` no app.
5. Na hospedagem (ex.: Vercel), defina as mesmas duas variáveis de ambiente.

Para publicar um ambiente de testes (Render + Supabase + Brevo para e-mails), veja [docs/ambiente-de-testes.md](docs/ambiente-de-testes.md). `npm run check:supabase` confere se o projeto está acessível e protegido.

`npm test` inclui testes de isolamento entre clínicas que rodam a migração em um Postgres real (PGlite).

## Próximos passos
Validar com laudos reais anonimizados, ampliar o catálogo/sinônimos, faixas por sexo/idade, convite de outros médicos para a clínica, cobrança/planos.
