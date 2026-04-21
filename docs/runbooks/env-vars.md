# Environment Variables

## Required in production

| Var | Example | Purpose |
|---|---|---|
| `COOKIE_SECRET` | `a1b2...` (64 hex chars) | Signs the `sid` session cookie. Server refuses to start in production if missing. Generate with `openssl rand -hex 32`. |
| `ANTHROPIC_API_KEY` | `sk-ant-...` | Claude API key for PDF parsing routes. |
| `DO_SPACES_KEY` | `DO00...` | DigitalOcean Spaces access key for Litestream. |
| `DO_SPACES_SECRET` | `...` | DigitalOcean Spaces secret key. |

## Optional

| Var | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Server listen port. |
| `NODE_ENV` | (unset) | Set to `production` on droplet to enable static client serving and strict env checks. |
| `COOKIE_SECURE` | `false` | Set to `true` once TLS ships. Causes browsers to refuse the cookie over plain HTTP. |
| `INVENTORY_STORE_DRIVER` | `sqlite` | Store implementation selector. |
