# Deployment fixes

The project now includes:

- Heroku-compatible `Procfile`.
- Dashboard served directly by `server.js`.
- Frontend automatically uses the current host in production.
- Twilio webhook URLs no longer depend exclusively on a hard-coded/local `SERVER_URL`.
- `.gitignore` prevents `.env` and secrets from being committed.
- `.env.example` documents required variables.
- `HEROKU_SETUP.md` explains the new-laptop Heroku authentication/IP-mismatch situation.

## Important

A Heroku CLI browser-login "IP mismatch" is an authentication/network issue, not an application-code issue. Complete the `heroku login` browser flow from one stable public IP/network, without changing VPN/network during the login. See `HEROKU_SETUP.md`.
