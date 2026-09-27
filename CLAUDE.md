@AGENTS.md

# ERD Studio — notes for AI agents

- Client-only app: `next.config.ts` sets `output: "export"`. No route handlers,
  server actions, cookies or `next/headers` — they break the static export.
- Data model lives in `src/lib/model` (plain JSON). A column is a foreign key
  when a relationship's `to`/`toCol` points at it; never store FK state on the column.
- All edits go through actions in `src/store/diagram.ts` (history + autosave).
- `src/lib/**` is pure TypeScript with Vitest tests next to the code. Keep it
  free of React and DOM access (inject measurers etc.).
- Colours come from CSS variables in `src/app/globals.css`; check both themes.
- Run `npm run check` before committing; `npm run build && npm run test:e2e` for UI changes.
