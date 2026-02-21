# RailSmart Deployment Checklist

## Environment
- Set `NODE_ENV=production`
- Set strong `JWT_SECRET`
- Set `FRONTEND_URL` to deployed frontend origin (or comma-separated allowlist)
- Configure database credentials (`DATABASE_URL` or `DB_HOST`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`/`DB_PORT`)
- Configure DB pool tuning (`DB_POOL_MAX`, `DB_IDLE_TIMEOUT_MS`, `DB_CONNECTION_TIMEOUT_MS`) as needed
- Configure `PORT` from hosting platform

## Security
- Ensure HTTPS is enabled on deployed frontend/backend domains
- Verify cookies are secure in production (`httpOnly`, `secure`, `sameSite=strict`)
- Verify CORS only allows configured frontend origin(s)
- Keep `.env` out of Git (already ignored)
- Ensure `logs/` is writable by runtime user

## Runtime
- Install dependencies with `npm ci`
- Build frontend using `npm run build` inside `frontend`
- Start backend using `npm start` inside `backend`
- Confirm reverse proxy/header forwarding is enabled (backend sets `trust proxy` in production)

## Verification
- Check health endpoint: `GET /api/health`
- Check metrics endpoint: `GET /api/metrics`
- Check admin audit endpoint: `GET /api/admin/audit-logs` (authenticated admin)
- Verify login cookie/session and protected admin routes

## Logging and Monitoring
- Confirm structured logs are produced to console and `backend/logs/*.log`
- Monitor 4xx/5xx rates and request durations from metrics/log output
- Optional future improvement: add log rotation (`winston-daily-rotate-file`)
