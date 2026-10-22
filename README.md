# Tolaris Diagnóstico

Ferramenta de apoio à triagem de exames de sangue para a medicina do trabalho.
O médico define seus critérios (presets) por exame; ao carregar um laudo em PDF, a ferramenta
localiza cada exame e mostra um semáforo (verde / laranja / vermelho / cinza = não localizado).

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

## Próximos passos
Validar com laudos reais anonimizados, ampliar o catálogo/sinônimos, faixas por sexo/idade, login e presets por clínica (SaaS).
