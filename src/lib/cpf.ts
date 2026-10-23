/**
 * CPF usado SOMENTE para vincular arquivos ao mesmo paciente. Nunca é exibido, exportado nem guardado.
 */
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(digits[9]) && check(10) === Number(digits[10]);
}

const CPF_RE = /\bcpf\b\s*(?:n[º°o.]*)?\s*:?\s*(\d{3}[.\s]?\d{3}[.\s]?\d{3}[-.\s]?\d{2})\b/i;

/** Procura "CPF: 000.000.000-00" num texto e devolve os 11 dígitos, só se forem válidos (dígitos verificadores). */
export function extractCpf(text: string): string | undefined {
  const m = CPF_RE.exec(text);
  if (!m) return undefined;
  const digits = m[1].replace(/\D/g, "");
  return isValidCpf(digits) ? digits : undefined;
}
