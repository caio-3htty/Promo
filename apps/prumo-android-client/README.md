# Prumo Android Client

Aplicativo Android do Prumo (Expo + React Native + Supabase).

## Escopo atual
- Login com e-mail/senha.
- Carregamento de perfil, role e obras vinculadas.
- Exibicao de acesso efetivo do usuario.

## Requisitos
- Node.js 20+
- npm 10+
- Conta Expo para builds EAS

## Rodar local
```bash
npm install
cp .env.example .env
npm run start
```

## Variaveis de ambiente
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Validacao local
```bash
npm run typecheck
```

## Build Android (EAS)
```bash
npm run eas:build:preview
npm run eas:build:production
```

## GitHub Actions
Workflows incluidos:
- `android-ci`: instala e roda `npm run typecheck`
- `android-eas-build`: build EAS manual (`workflow_dispatch`)

Secret necessario para build remoto:
- `EXPO_TOKEN`
