# Contributing

## Workflow

1. Branch from `main`: `feat/<short-name>`, `fix/<short-name>` or `chore/<short-name>`.
2. Keep commits focused and use [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
3. Run `npm run check` before pushing. For UI changes also run
   `npm run build && npm run test:e2e`.
4. Open a pull request using the template. CI must be green, and every PR gets
   a Vercel preview deployment to review in the browser.
5. Squash-merge into `main`; `main` deploys to production.

## Code guidelines

- `src/lib/**` is pure TypeScript: no React, no DOM, no network. Put tests
  next to the code (`*.test.ts`).
- All diagram edits go through actions in `src/store/diagram.ts` so undo,
  autosave and the checker see them.
- Foreign keys are relationships (`rel.to` / `rel.toCol`); don't add FK state to columns.
- Use the CSS variables in `src/app/globals.css` for every colour, and check
  light theme, dark theme and a 375px-wide viewport.
- Keep it client-only: no API routes, server actions or runtime network calls.
  User data must never leave the browser.
