# ⏱ Jira Time Tracker

Registro de horas em cards do Jira Cloud — timer, lista semanal e calendário.

## Download (Windows, Linux, macOS)
Baixe o executável para o seu sistema em [Releases](https://github.com/alefaust/jira-time-tracker/releases/latest):

- **🪟 Windows**: Baixe `JiraTimeTracker.exe` e dê duplo clique.
  > O Windows SmartScreen pode avisar por ser um executável não assinado: clique em **Mais informações → Executar assim mesmo**.
- **🐧 Linux**: Baixe `JiraTimeTracker-linux-x64`:
  ```bash
  chmod +x JiraTimeTracker-linux-x64
  ./JiraTimeTracker-linux-x64
  ```
- **🍎 macOS**: Baixe `JiraTimeTracker-macos-arm64` (Apple Silicon M1/M2/M3/M4):
  ```bash
  chmod +x JiraTimeTracker-macos-arm64
  xattr -cr JiraTimeTracker-macos-arm64  # se o macOS avisar sobre desenvolvedor não verificado
  ./JiraTimeTracker-macos-arm64
  ```

O app abre automaticamente em uma janela própria de aplicativo (Edge/Chrome em modo `--app`). Mantenha a janela do console minimizada; fechá-la encerra o app.

A configuração (URL, e-mail e token) é salva automaticamente no caminho do seu sistema:
- **Windows**: `%APPDATA%\JiraTimeTracker\config.json`
- **macOS**: `~/Library/Application Support/JiraTimeTracker/config.json`
- **Linux**: `~/.config/jira-time-tracker/config.json`

## Rodar pelo código
- Node.js 18+ (https://nodejs.org) — sem dependências, não precisa de `npm install`.
1. Dê duplo clique em `iniciar.bat` (ou rode `npm start`).
2. Abra http://localhost:5178
3. No primeiro acesso, preencha **URL do Jira**, **e-mail** e **API token** e clique em Salvar.

## Compilar localmente
`npm run build` → gera o binário do seu sistema operacional na pasta `dist/`.
Para publicar uma nova versão com binários para todas as plataformas: `git tag v1.x.x && git push --tags` (o GitHub Actions compila em runners Windows, Linux e macOS e anexa todos na Release).

## Token expirado
Quando o Jira recusar o token, o app abre ⚙ Configurações automaticamente.
Gere um novo em https://id.atlassian.com/manage-profile/security/api-tokens, cole e salve.
Entradas feitas enquanto o token estava inválido ficam como **pendentes** e são enviadas após salvar.

## Segurança
As credenciais ficam em `config.json` (local, ignorado pelo git) e nunca são enviadas ao navegador.
