# ⏱ Jira Time Tracker

Registro de horas em cards do Jira Cloud — timer, lista semanal e calendário.

## Download (Windows)
Baixe **JiraTimeTracker.exe** em [Releases](https://github.com/alefaust/jira-time-tracker/releases/latest) e dê duplo clique.
O app abre em uma janela própria (Edge/Chrome em modo aplicativo). Mantenha a janela do console minimizada; fechá-la encerra o app.
A configuração fica em `%APPDATA%\JiraTimeTracker\config.json`.

> O Windows SmartScreen pode avisar por ser um executável não assinado: clique em **Mais informações → Executar assim mesmo**.

## Rodar pelo código
- Node.js 18+ (https://nodejs.org) — sem dependências, não precisa de `npm install`.
1. Dê duplo clique em `iniciar.bat` (ou rode `npm start`).
2. Abra http://localhost:5178
3. No primeiro acesso, preencha **URL do Jira**, **e-mail** e **API token** e clique em Salvar.

## Gerar o .exe
`npm run build` → `dist/JiraTimeTracker.exe`.
Para publicar uma nova versão: `git tag v1.x.x && git push --tags` (o GitHub Actions gera e anexa o .exe na Release).

## Token expirado
Quando o Jira recusar o token, o app abre ⚙ Configurações automaticamente.
Gere um novo em https://id.atlassian.com/manage-profile/security/api-tokens, cole e salve.
Entradas feitas enquanto o token estava inválido ficam como **pendentes** e são enviadas após salvar.

## Segurança
As credenciais ficam em `config.json` (local, ignorado pelo git) e nunca são enviadas ao navegador.
