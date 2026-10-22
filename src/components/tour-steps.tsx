import type { TourStep } from "./Tour";

const Dot = ({ c }: { c: "green" | "orange" | "red" | "unknown" }) => (
  <i className={`dot ${c}`} style={{ width: 12, height: 12, marginRight: 6 }} />
);

export function makeTourSteps({ ensureSample, openPreset }: { ensureSample: () => Promise<void>; openPreset: () => Promise<void> }): TourStep[] {
  return [
    {
      title: "Bem-vindo ao Tolaris Diagnóstico",
      body: (
        <>
          <p>Esta ferramenta agiliza a triagem dos exames de sangue: você define seus critérios uma vez e ela mostra, em segundos, quais resultados merecem a sua atenção.</p>
          <p>O tour leva cerca de 1 minuto. Use <strong>Próximo</strong> ou as setas do teclado.</p>
        </>
      ),
    },
    {
      target: "privacy",
      title: "Seus dados de pacientes não são guardados",
      body: (
        <p>O PDF é lido aqui, no seu navegador. Ele <strong>não é enviado nem armazenado</strong>: ao trocar de arquivo ou fechar a página, os dados do paciente somem. Só os seus critérios ficam salvos.</p>
      ),
    },
    {
      target: "preset",
      before: openPreset,
      title: "1. Escolha ou crie um preset",
      body: (
        <>
          <p>Um preset é o seu conjunto de critérios. Você pode ter vários, por exemplo um por laboratório ou por tipo de exame ocupacional (admissional, periódico…), e escolher qual usar a cada análise.</p>
          <p>Use <strong>Duplicar</strong> para criar variações a partir de um preset existente.</p>
        </>
      ),
    },
    {
      target: "rule-row",
      before: openPreset,
      title: "Defina as faixas de cada exame",
      body: (
        <>
          <p>Informe a partir de que valor o resultado merece análise e a partir de que valor está acima do limite.</p>
          <p>Exemplo: glicose <strong>laranja a partir de 10</strong> e <strong>vermelho a partir de 20</strong>. Abaixo de 10 fica verde.</p>
          <p>Os campos “abaixo de” servem para valores baixos (ex.: hemoglobina abaixo de 12). O <strong>✕</strong> tira o exame do preset.</p>
          <p className="muted">Os números atuais são só de exemplo. Ajuste conforme o seu critério.</p>
        </>
      ),
    },
    {
      target: "add-exam",
      before: openPreset,
      title: "Precisa de outro exame? Use o “+”",
      body: (
        <>
          <p>Escolha um exame do catálogo ou crie um <strong>novo exame personalizado</strong>: informe o nome, o texto que a ferramenta deve procurar no laudo (ex.: “Vitamina C, Ácido ascórbico”) e a unidade.</p>
          <p>Depois é só preencher as faixas de laranja e vermelho.</p>
        </>
      ),
    },
    {
      target: "upload",
      title: "2. Envie o laudo em PDF",
      body: (
        <>
          <p>Arraste o PDF do paciente ou clique para escolher. A ferramenta encontra cada exame <strong>pelo nome</strong>, mesmo que cada laboratório organize o laudo de um jeito.</p>
          <p>Sem laudo à mão, use os botões de <strong>PDFs fictícios</strong> para testar. Nesta versão são lidos laudos digitais; scans e fotos ainda não.</p>
        </>
      ),
    },
    {
      target: "summary",
      before: ensureSample,
      title: "3. Veja o semáforo",
      body: (
        <>
          <p>Carregamos um laudo fictício para você ver. O resumo mostra, de uma vez:</p>
          <ul>
            <li><Dot c="red" /> acima do limite que você definiu</li>
            <li><Dot c="orange" /> requer a sua análise</li>
            <li><Dot c="green" /> dentro do padrão</li>
            <li><Dot c="unknown" /> não localizado no laudo</li>
          </ul>
        </>
      ),
    },
    {
      target: "table",
      title: "Do mais crítico ao mais tranquilo",
      body: (
        <>
          <p>Os exames vêm ordenados: vermelhos primeiro, verdes por último. Cada linha mostra:</p>
          <ul>
            <li>o resultado lido (e a faixa de referência do laboratório, quando clara);</li>
            <li>os seus critérios, para você lembrar da regra aplicada;</li>
            <li><strong>Origem</strong>: clique para ver a linha do PDF de onde o valor veio e conferir rapidamente.</li>
          </ul>
        </>
      ),
    },
    {
      target: "table",
      title: "Confira e corrija quando precisar",
      body: (
        <>
          <p>Se um valor foi lido errado, ou um exame ficou <strong>cinza (não localizado)</strong>, digite o valor no campo e o semáforo se atualiza na hora.</p>
          <p>Um exame não localizado <strong>nunca</strong> aparece como verde. A ferramenta é um apoio à triagem: a decisão clínica é sempre do médico.</p>
        </>
      ),
    },
    {
      title: "Pronto!",
      body: (
        <>
          <p>Agora é só ajustar seus presets e enviar os laudos. O laudo de exemplo será removido ao concluir.</p>
          <p className="muted">Para rever este tour, use o botão “Ver tour” no topo da página.</p>
        </>
      ),
    },
  ];
}
