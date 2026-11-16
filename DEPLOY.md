# NovaHospeda — Documentação Técnica e Guia de Implantação

**Slogan:** Seu site no ar, grátis e sem complicação!  
**Domínio Principal:** `nh.com.br`  
**Endereços dos Sites:** `nomedosite.nh.com.br` (e acesso imediato em `/sites/nomedosite/`)

---

## 1. Arquitetura do Sistema

- **Frontend:** React 19 + TypeScript + Tailwind CSS v4 + Recharts + Lucide Icons.
- **Backend:** Node.js + Express (`server.ts`) com roteamento por subdomínio (`Host: slug.nh.com.br`) e caminho público (`/sites/:slug/`).
- **Autenticação & Banco de Dados:** Firebase Authentication + Cloud Firestore com regras de segurança auditadas (`firestore.rules`) e sincronização persistente em servidor (`data/platform-store.json`).
- **Armazenamento Estático:** Provedor desacoplado (`src/server/storage.ts`) com driver local persistente em disco (`data/storage/sites/`) e interface pronta para troca para Cloudflare R2 / S3.
- **Segurança:**
  - Extração segura de `.zip` com proteção contra ZIP bombs (limite de tamanho descompactado e máximo de 1.500 arquivos) e path traversal (`..`).
  - Bloqueio de extensões executáveis no servidor (`.php`, `.py`, `.sh`, `.exe`, `.bat`, `.cgi`, `.jsp`, `.asp`).
  - Cabeçalhos de isolamento estático (`X-Content-Type-Options: nosniff`, `Content-Security-Policy`, `Referrer-Policy`).
  - Rate limiting por IP para API, uploads e denúncias.

---

## 2. Variáveis de Ambiente

Copie `.env.example` para `.env` e ajuste conforme seu ambiente:

```env
PRIMARY_DOMAIN="nh.com.br"
FORCE_HTTPS="true"
PORT="3000"
```

---

## 3. Configuração de Domínio (`nh.com.br`), DNS, SSL e Cloudflare CDN

1. **Registros DNS na Cloudflare:**
   - Crie um registro `A` ou `CNAME` para `@` (`nh.com.br`) apontando para o servidor de produção (Proxy ativado - nuvem laranja).
   - Crie um registro wildcard `*` (`*.nh.com.br`) apontando para o mesmo destino (Proxy ativado).
   - Crie um registro `CNAME` `www` -> `nh.com.br`.
2. **SSL/TLS e HTTPS Automático:**
   - Em **SSL/TLS > Overview**, selecione **Full (Strict)**.
   - Em **SSL/TLS > Edge Certificates**, ative **Always Use HTTPS** e **Automatic HTTPS Rewrites**.
   - Para certificados wildcard gratuitos da borda Cloudflare, o Universal SSL cobre `nh.com.br` e `*.nh.com.br` automaticamente.
3. **Como o servidor responde:**
   - Quando uma requisição chega com `Host: loja.nh.com.br`, o middleware de `server.ts` identifica o subdomínio `loja`, verifica se o status está `online`, contabiliza a visita HTML real e serve o conteúdo estático com cabeçalhos seguros.

---

## 4. Autenticação por E-mail/Senha e Google

- O login com Google já funciona imediatamente.
- Para permitir também cadastro com **E-mail/Senha**, confirmação de e-mail e recuperação de senha diretamente pelos usuários:
  1. Acesse o **Firebase Console** do projeto (`gen-lang-client-0047499421`).
  2. Vá em **Authentication > Sign-in method**.
  3. Ative o provedor **E-mail/senha**.

---

## 5. Execução Local e Produção

```bash
npm install
npm run build
npm start
```

Em desenvolvimento:

```bash
npm run dev
```
