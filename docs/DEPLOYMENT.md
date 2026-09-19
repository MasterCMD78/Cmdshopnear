# Deployment

The web app and API use managed artifact workflows. The API workflow provides the runtime port and the web workflow provides the Vite base path.

## Required runtime configuration

- `DATABASE_URL`
- `SESSION_SECRET`
- Optional `JWT_SECRET`
- Optional `OTP_PROVIDER` (`local` for development)
- Object storage variables when uploads are enabled

Do not print or commit secret values. Apply database schema changes through the development database workflow before publishing.