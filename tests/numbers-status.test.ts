import { describe, expect, it } from "vitest";
import { parseNumberBR } from "@/lib/numbers";
import { evaluate } from "@/lib/status";

describe("parseNumberBR", () => {
  it.each([
    ["92", 92],
    ["5,2", 5.2],
    ["1.234,5", 1234.5],
    ["250.000", 250000],
    ["4.5", 4.5],
    ["0.125", 0.125],
  ])("%s -> %s", (raw, expected) => expect(parseNumberBR(raw)).toBe(expected));

  it("rejeita texto", () => {
    expect(parseNumberBR("abc")).toBeNull();
    expect(parseNumberBR("12/03/2024")).toBeNull();
  });
});

describe("evaluate (exemplo do médico: glicose 1-9 verde, 10-19 laranja, 20+ vermelho)", () => {
  const rule = { attentionFrom: 10, alertFrom: 20 };
  it.each([
    [1, "green"],
    [9, "green"],
    [10, "orange"],
    [19, "orange"],
    [20, "red"],
    [35, "red"],
  ])("%s -> %s", (v, s) => expect(evaluate(v, rule)).toBe(s));

  it("sem valor ou sem regra fica 'unknown', nunca verde", () => {
    expect(evaluate(null, rule)).toBe("unknown");
    expect(evaluate(5, undefined)).toBe("unknown");
  });

  it("suporta limite inferior", () => {
    const low = { attentionBelow: 40, alertBelow: 30 };
    expect(evaluate(45, low)).toBe("green");
    expect(evaluate(38, low)).toBe("orange");
    expect(evaluate(25, low)).toBe("red");
  });
});

it("regra vazia (exame adicionado sem faixas) não vira verde", () => {
  expect(evaluate(50, {})).toBe("unknown");
});

import { pickActivePreset } from "@/lib/presets";

describe("pickActivePreset", () => {
  const ps = [{ id: "a", name: "A", rules: {} }, { id: "b", name: "B", rules: {} }];
  it("usa o preset lembrado se ainda existir", () => expect(pickActivePreset(ps, "b").id).toBe("b"));
  it("cai no primeiro se o lembrado foi excluído ou não existe", () => {
    expect(pickActivePreset(ps, "zzz").id).toBe("a");
    expect(pickActivePreset(ps, null).id).toBe("a");
  });
});
