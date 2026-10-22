/**
 * Confere se o projeto Supabase configurado em .env.local (ou nas variáveis de ambiente)
 * está acessível e protegido: visitantes sem login não podem ler nem criar nada.
 * Uso: npm run check:supabase
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Defina NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY (veja .env.example).");
  process.exit(2);
}
if (/service_role/i.test(Buffer.from(key.split(".")[1] ?? "", "base64url").toString())) {
  console.error("ERRO: essa é a chave service_role. Use somente a chave anon/publishable no app.");
  process.exit(2);
}

const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
const results = [];
const check = async (name, fn) => {
  try {
    const ok = await fn();
    results.push([ok, name]);
  } catch (e) {
    results.push([false, `${name} (${e.message})`]);
  }
};

await check("Servidor de login (Auth) responde", async () => (await fetch(`${url}/auth/v1/health`, { headers })).ok);

await check("Tabelas existem (migração aplicada)", async () => {
  const r = await fetch(`${url}/rest/v1/presets?select=id&limit=1`, { headers });
  // 404 = tabela inexistente. 401/403 ou 200 com [] = existe e está protegida.
  return r.status !== 404;
});

await check("Visitante NÃO consegue ler presets", async () => {
  const r = await fetch(`${url}/rest/v1/presets?select=id,name&limit=1`, { headers });
  if (!r.ok) return true; // negado por privilégio
  return (await r.json()).length === 0; // RLS devolve vazio
});

await check("Visitante NÃO consegue criar clínica", async () => {
  const r = await fetch(`${url}/rest/v1/rpc/create_clinic`, { method: "POST", headers, body: JSON.stringify({ clinic_name: "teste" }) });
  return !r.ok;
});

await check("Visitante NÃO consegue gravar preset", async () => {
  const r = await fetch(`${url}/rest/v1/presets`, {
    method: "POST",
    headers,
    body: JSON.stringify({ id: "x", clinic_id: "00000000-0000-0000-0000-000000000000", name: "x" }),
  });
  return !r.ok;
});

for (const [ok, name] of results) console.log(`${ok ? "✔" : "✘"} ${name}`);
process.exit(results.every(([ok]) => ok) ? 0 : 1);
