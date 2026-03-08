# prumo-android-client

Aplicativo Android (Expo + React Native) conectado ao Supabase do Prumo.

## Escopo atual
- Login por e-mail/senha.
- Leitura do acesso do usuário (`profiles`, `user_roles`, `user_obras`).
- Listagem simples de obras vinculadas.

## Configuração
1. Copie `.env.example` para `.env`.
2. Defina `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
3. Rode:

```bash
npm install
npm run start
```

Para rodar em Android:

```bash
npm run android
```
