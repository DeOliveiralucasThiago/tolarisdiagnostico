# Ambiente de testes: Render + Supabase + Brevo

Resultado: uma URL pública (Render) onde o médico acessa a ferramenta, com login por e-mail
(Supabase) e e-mails enviados pelo Brevo. Nenhum dado de paciente passa por esses serviços:
o PDF é lido só no navegador; o banco guarda apenas contas, clínicas e critérios.

## 1. Supabase (banco e login)
1. Crie o projeto em https://supabase.com (região mais próxima, ex.: São Paulo).
2. **SQL Editor** → cole e rode `supabase/migrations/0001_init.sql`.
3. **Project Settings → API**: anote a **Project URL** e a chave **anon / publishable**.
   Nunca use a chave `service_role` no app.
4. Verifique: `npm run check:supabase` (com as duas variáveis em `.env.local`). Todos os itens devem sair ✔.

## 2. Brevo (e-mails)
1. Crie conta em https://www.brevo.com (plano gratuito: ~300 e-mails/dia).
2. **Senders, Domains & Dedicated IPs**: valide o e-mail remetente (ou, melhor, o domínio, com SPF/DKIM) —
   sem isso os e-mails podem cair no spam ou ser recusados.
3. **SMTP & API → SMTP**: anote o *login SMTP* (algo como `xxxx@smtp-brevo.com`) e gere uma **chave SMTP**.
   - Servidor: `smtp-relay.brevo.com` — Porta: `587`

## 3. Ligar o Brevo ao Supabase
No Supabase: **Authentication → Emails → SMTP Settings → Enable custom SMTP**
- Sender email / name: o remetente validado no Brevo (ex.: `nao-responda@seudominio.com` / "Tolaris Diagnóstico")
- Host `smtp-relay.brevo.com`, porta `587`, usuário = login SMTP, senha = chave SMTP.

Em **Authentication → Emails → Templates**, cole o conteúdo de `supabase/templates/confirm-signup.html`
(Confirm signup) e `supabase/templates/recovery.html` (Reset password), com os assuntos em português.

## 4. Render (hospedagem)
1. Envie este repositório ao GitHub e, no Render: **New → Blueprint** → escolha o repositório.
   (O Render usa o `render.yaml`; confirme que a branch escolhida tem o código.)
2. Quando pedir, informe `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Aguarde o deploy e copie a URL (`https://tolaris-diagnostico-teste.onrender.com` ou similar).
4. De volta ao Supabase: **Authentication → URL Configuration**
   - *Site URL*: a URL do Render. *Redirect URLs*: a mesma URL (e `http://localhost:3000` para desenvolvimento).

> Plano gratuito do Render: o serviço "dorme" após alguns minutos sem uso; a primeira visita pode levar ~1 minuto.
> Variáveis `NEXT_PUBLIC_*` são embutidas no build: ao alterá-las, faça novo deploy.
> A faixa laranja "Ambiente de testes" (`NEXT_PUBLIC_ENV_LABEL`) some se a variável for removida (produção).

## 5. Roteiro de teste (checklist)
- [ ] Abrir a URL: aparece o aviso "Ambiente de testes" e a tela de login (logo à esquerda, formulário à direita).
- [ ] Criar conta → chega o e-mail de confirmação (verifique o spam) → confirmar → entrar.
- [ ] Criar a clínica → o preset de exemplo aparece.
- [ ] Editar um critério, recarregar a página: o valor continua.
- [ ] Abrir em outro navegador/aba anônima, entrar com a mesma conta: os presets são os mesmos.
- [ ] Criar uma segunda conta (outro e-mail) e outra clínica: ela **não** vê os presets da primeira.
- [ ] Usar "Esqueci minha senha": chega o e-mail, o link abre a tela de nova senha e, depois de salvar, o app abre.
- [ ] Enviar um PDF fictício (botão "Testar com um laudo de exemplo") e conferir o semáforo.
- [ ] Na aba Network do navegador, confirmar que o PDF não é enviado a nenhum servidor.

## Limitações conhecidas desta versão
Não há ainda convite de outros médicos para a mesma clínica.

"Esqueci minha senha" já existe na tela de login: o link enviado por e-mail abre uma tela para criar a nova senha.
Para isso funcionar, a URL do site precisa estar em **Authentication → URL Configuration** (Site URL e Redirect URLs)
e o e-mail precisa chegar (configure o SMTP do Brevo).
