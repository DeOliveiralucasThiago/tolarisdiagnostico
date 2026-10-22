import { IconLock } from "./Icons";

/** Tela dividida: marca à esquerda, formulário à direita (empilha no celular). */
export function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="auth-split">
      <aside className="auth-aside">
        <div className="auth-aside-inner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="auth-logo" src="/brand/logo-full.png" alt="Tolaris — Tecnologia Integrada" width={260} />
          <div className="auth-product">Tolaris Diagnóstico</div>
          <h1 className="auth-headline">Triagem de exames de sangue em segundos.</h1>
          <p className="auth-lead">
            Defina seus critérios uma vez e veja de imediato quais resultados merecem a sua atenção, em qualquer laudo.
          </p>
          <ul className="auth-points">
            <li><IconLock width={18} height={18} /> O PDF do paciente nunca é enviado nem armazenado.</li>
            <li><span className="dot green" /> <span className="dot orange" /> <span className="dot red" /> Semáforo conforme os seus critérios.</li>
          </ul>
        </div>
      </aside>
      <section className="auth-main">
        <div className="auth-card">{children}</div>
      </section>
    </div>
  );
}
