# Sakshya frontend

Install with `npm install`, then run `npm run dev`; Vite proxies `/api` to the backend at `http://127.0.0.1:8000`.
Use `npm run gen:api` while the backend is running, followed by `npm run typecheck` and `npm run build`.
Create a feature folder under `src/features/` with `routes.tsx` exporting `routes` and `nav.ts` exporting `navItems`.
The shell discovers those exports automatically; feature route paths are relative to the authenticated app shell.
Export navigation items with `label`, `path`, and optional `roles` to control which roles see them.
Reusable components live in `src/ui/`; authenticated user, role and demo clock state live in `src/shell/`.
API calls go through `src/api/client.ts`, which attaches the session token and exposes structured `ApiError`s.
Use integer paise for amounts and `formatINR`; use `formatDate` for readable dates.
The role switcher logs in as the selected demo user and prompts for that user's password; it never bypasses backend auth.
The English / हिन्दी switch is available before and after login; use `useLanguage()` and `t('key')` for translated feature UI.
`/ui-kit` is the interactive component and state showcase.
