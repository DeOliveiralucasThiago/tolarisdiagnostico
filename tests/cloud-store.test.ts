import { describe, expect, it } from "vitest";
import { diffById, syncPresets } from "@/lib/cloud-store";
import type { Preset } from "@/lib/presets";

const p = (id: string, name = id, rules = {}): Preset => ({ id, name, rules });

describe("diffById", () => {
  it("só envia o que mudou e o que foi removido", () => {
    const prev = [p("a"), p("b"), p("c")];
    const next = [p("a"), p("b", "novo nome"), p("d")];
    const { upsert, remove } = diffById(prev, next);
    expect(upsert.map((x) => x.id).sort()).toEqual(["b", "d"]);
    expect(remove).toEqual(["c"]);
  });

  it("sem mudanças não envia nada", () => {
    expect(diffById([p("a")], [p("a")])).toEqual({ upsert: [], remove: [] });
  });
});

describe("syncPresets", () => {
  it("faz upsert com clinic_id e apaga só dentro da clínica", async () => {
    const calls: unknown[] = [];
    const table = (name: string) => ({
      upsert: async (rows: unknown) => (calls.push([name, "upsert", rows]), { error: null }),
      delete: () => ({
        eq: (col: string, val: string) => ({
          in: async (c2: string, ids: string[]) => (calls.push([name, "delete", col, val, c2, ids]), { error: null }),
        }),
      }),
    });
    const db = { from: table } as never;
    await syncPresets(db, "clinic-1", [p("a"), p("b")], [p("a", "x")]);
    expect(calls[0]).toMatchObject(["presets", "upsert", [{ id: "a", clinic_id: "clinic-1", name: "x" }]]);
    expect(calls[1]).toEqual(["presets", "delete", "clinic_id", "clinic-1", "id", ["b"]]);
  });

  it("propaga erro do servidor", async () => {
    const db = { from: () => ({ upsert: async () => ({ error: { message: "negado" } }) }) } as never;
    await expect(syncPresets(db, "c", [], [p("a")])).rejects.toThrow("negado");
  });
});
