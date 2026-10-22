/** Faixa de aviso mostrada só quando NEXT_PUBLIC_ENV_LABEL está definida (ex.: ambiente de testes). */
export function EnvBanner() {
  const label = process.env.NEXT_PUBLIC_ENV_LABEL;
  if (!label) return null;
  return (
    <div className="env-banner" role="note">
      {label}: use apenas para avaliação. Seus critérios de teste podem ser apagados a qualquer momento.
    </div>
  );
}
