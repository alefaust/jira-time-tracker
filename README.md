# ⏱ Jira Time Tracker

Registro de horas em cards do Jira Cloud — timer, lista semanal e calendário.

## Requisitos
- Node.js 18+ (https://nodejs.org) — sem dependências, não precisa de `npm install`.

## Como usar
1. Dê duplo clique em `iniciar.bat` (ou rode `npm start`).
2. Abra http://localhost:5178
3. No primeiro acesso, preencha **URL do Jira**, **e-mail** e **API token** e clique em Salvar.

## Token expirado
Quando o Jira recusar o token, o app abre ⚙ Configurações automaticamente.
Gere um novo em https://id.atlassian.com/manage-profile/security/api-tokens, cole e salve.
Entradas feitas enquanto o token estava inválido ficam como **pendentes** e são enviadas após salvar.

## Segurança
As credenciais ficam em `config.json` (local, ignorado pelo git) e nunca são enviadas ao navegador.
