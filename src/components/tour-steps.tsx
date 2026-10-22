import type { TourStep } from "./Tour";

const Dot = ({ c }: { c: "green" | "orange" | "red" | "unknown" }) => (
  <i className={`dot ${c}`} style={{ width: 12, height: 12, marginRight: 6 }} />
);

export function makeTourSteps({ ensureSample, openPreset, expandFirst }: { ensureSample: () => Promise<void>; openPreset: () => Promise<void>; expandFirst: () => Promise<void> }): TourStep[] {
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
      title: "2. Envie os laudos em PDF",
      body: (
        <>
          <p>Arraste <strong>vários PDFs de uma vez</strong> (um por paciente) ou clique para escolher. A ferramenta encontra cada exame <strong>pelo nome</strong>, mesmo que cada laboratório organize o laudo de um jeito.</p>
          <p>Sem laudos à mão, use o botão de <strong>laudos de exemplo</strong>. Nesta versão são lidos laudos digitais; scans e fotos ainda não.</p>
        </>
      ),
    },
    {
      target: "summary",
      before: ensureSample,
      title: "3. Veja todos os pacientes de uma vez",
      body: (
        <>
          <p>Carregamos 3 laudos fictícios (João, Maria e José). O resumo mostra quantos pacientes estão em cada situação:</p>
          <ul>
            <li><Dot c="red" /> com exame acima do limite que você definiu</li>
            <li><Dot c="orange" /> para a sua análise</li>
            <li><Dot c="unknown" /> com exame não localizado no laudo</li>
            <li><Dot c="green" /> tudo dentro do padrão</li>
          </ul>
        </>
      ),
    },
    {
      target: "filters",
      title: "Filtre e encontre quem importa",
      body: (
        <>
          <p>Use os botões para ver só quem está <strong>acima do limite</strong>, <strong>para analisar</strong> ou <strong>tudo normal</strong>.</p>
          <p>Também dá para buscar um paciente pelo nome, ver só quem tem um <strong>exame específico alterado</strong> (ex.: glicose) e ordenar por criticidade ou por nome.</p>
        </>
      ),
    },
    {
      target: "table",
      title: "Um paciente por linha",
      body: (
        <>
          <p>Cada linha mostra o nome (lido do próprio laudo), a idade, a situação geral e <strong>quais exames precisam de atenção</strong>, já com o valor. Os mais críticos aparecem primeiro.</p>
          <p>Os números coloridos contam os exames: vermelhos, laranjas, verdes e não localizados.</p>
        </>
      ),
    },
    {
      target: "detail",
      before: expandFirst,
      title: "Abra o paciente, confira e corrija",
      body: (
        <>
          <p>Em <strong>Ver detalhes</strong> você vê todos os exames daquele paciente, com a faixa do laboratório, os seus critérios e a <strong>origem</strong> de cada valor no PDF.</p>
          <p>Se um valor foi lido errado ou ficou <strong>cinza (não localizado)</strong>, digite o correto e o semáforo se atualiza na hora. Um exame não localizado <strong>nunca</strong> aparece como verde. A decisão clínica é sempre do médico.</p>
        </>
      ),
    },
    {
      title: "Pronto!",
      body: (
        <>
          <p>Agora é só ajustar seus critérios e enviar os laudos dos pacientes. Os laudos de exemplo serão removidos ao concluir.</p>
          <p className="muted">Para rever este tour, use o botão “Ver tour” no topo da página.</p>
        </>
      ),
    },
  ];
}
