# Sakshya frontend

Install with `npm install`, then run `npm run dev`; Vite proxies `/api` to the backend at `http://127.0.0.1:8000`.
Use `npm run gen:api` while the backend is running, followed by `npm run typecheck` and `npm run build`.
Create a feature folder under `src/features/` with `routes.tsx` exporting `routes` and `nav.ts` exporting `navItems`.
The shell discovers those exports automatically; feature route paths are relative to the authenticated app shell.
Export navigation items with `label`, `path`, and optional `roles` to control which roles see them.
Reusable components live in `src/ui/`; authenticated user, role and demo clock state live in `src/shell/`.
API calls go through `src/api/client.ts`, which attaches the session token and exposes structured `ApiError`s.
Use integer paise for amounts and `formatINR`; use `formatDate` for readable dates.
With authentication enabled, the role switcher logs in as the selected demo user and prompts for that user's password; it never bypasses backend auth.
The English / हिन्दी switch is available before and after login; use `useLanguage()` and `t('key')` for translated feature UI.
`/ui-kit` is the interactive component and state showcase.

The institute portal lives in `src/features/institute/` and provides obligation coverage, FDR preview/review/submission, instrument details and renewal, release requests, and notifications. It calls the endpoints in `docs/CONTRACT.md`; live workflows require the corresponding backend routes to be implemented and available.

Public release-letter verification is available at `/verify` and `/verify/:code?h=...` without the authenticated shell. Requests use the public API client (no authorization header); no-match responses intentionally use one uniform message without returning record details.

The PA-4 release authority workspace is available to `RELEASE_AUTHORITY` at `/release-desk`; it reviews pending signatures, requires step-up before signing, shows the release payload and fingerprint, opens the signed PDF, and supports reasoned revocation. Finance officers use `/finance/settlements` to reconcile credited amounts, document mismatches, and review closed cases. Both workspaces call the endpoints in `docs/CONTRACT.md`; end-to-end actions require those backend routes to be implemented and available.

In Vite development, authentication is bypassed by default so the UI can be previewed without signing in; use the role selector to switch preview workspaces. Set `VITE_AUTH_BYPASS=false` in the frontend environment and restart Vite to restore local sign-in. The bypass is disabled in production builds and does not mock or bypass backend API authentication.
