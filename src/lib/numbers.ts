/**
 * Converte números no formato dos laudos brasileiros.
 * "5,2" -> 5.2 | "1.234,5" -> 1234.5 | "250.000" -> 250000 | "4.5" -> 4.5
 */
export function parseNumberBR(raw: string): number | null {
  const s = raw.trim();
  if (!/^\d+(?:[.,]\d+)*$/.test(s)) return null;

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");

  if (lastComma !== -1) {
    // vírgula é o separador decimal; pontos são milhares
    return Number(s.replace(/\./g, "").replace(",", "."));
  }
  if (lastDot !== -1) {
    const dots = s.split(".");
    const last = dots[dots.length - 1];
    const isThousands = (dots.length > 2 || last.length === 3) && dots[0] !== "0";
    return Number(isThousands ? s.replace(/\./g, "") : s);
  }
  return Number(s);
}
