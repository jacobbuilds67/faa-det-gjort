#!/bin/zsh
set -e
cd "$(dirname "$0")"
# Use the existing Codex runtime when Node/pnpm are not installed globally.
hverdagsro_runtime="$HOME/.cache/codex-runtimes/codex-primary-runtime/dependencies"
if ! command -v node >/dev/null 2>&1 && [ -x "$hverdagsro_runtime/node/bin/node" ]; then
  export PATH="$hverdagsro_runtime/node/bin:$PATH"
fi
if ! command -v pnpm >/dev/null 2>&1 && [ -x "$hverdagsro_runtime/bin/fallback/pnpm" ]; then
  export PATH="$hverdagsro_runtime/bin/fallback:$PATH"
fi
if ! command -v node >/dev/null 2>&1 || ! command -v pnpm >/dev/null 2>&1; then
  echo 'Installer Node.js 22+ og pnpm, og åbn filen igen.'
  read -r '?Tryk Enter for at lukke.'
  exit 1
fi
app_url='http://127.0.0.1:5173/'
if curl -fsS "$app_url" >/dev/null 2>&1; then
  echo 'Få det Gjort kører allerede. Åbner appen i browseren.'
  open "$app_url"
  exit 0
fi
if [ ! -d node_modules ]; then
  pnpm install --frozen-lockfile
fi
(
  for attempt in {1..40}; do
    if curl -fsS "$app_url" >/dev/null 2>&1; then
      open "$app_url"
      exit 0
    fi
    sleep 0.25
  done
) &
echo 'Starter Få det Gjort og åbner appen automatisk. Ctrl+C stopper appen.'
exec pnpm dev
