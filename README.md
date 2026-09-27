# ERD Studio

Sketch database tables, mark primary and foreign keys, connect them with
crow's-foot relationships and check the design against 1NF → BCNF — entirely
in your browser. Your diagrams are never uploaded: they live in `localStorage`,
in files you export, or inside share links. The hosted site uses Vercel Speed
Insights for anonymous, cookie-free page-speed measurements (no diagram data or
share-link contents are sent — see `src/components/PrivateSpeedInsights.tsx`).

Grown from the single-file prototype kept in [`docs/original-demo.html`](docs/original-demo.html).

## Features

- **Tables and columns** — types, primary keys (including composite), unique,
  nullable, "holds a list", defaults and notes; header colours.
- **Foreign keys** — tick _Foreign key_ on a column and pick what it references,
  drag between tables in link mode, or let linking create the `<parent>_id`
  column for you.
- **Relationships** — 1:1, 1:N, N:M with optionality (crow's foot or `1`/`N`
  notation), ON DELETE / ON UPDATE actions, one-click junction tables.
- **Routed lines** — orthogonal lines that attach to the key rows and avoid
  other tables (curved and straight styles too).
- **Normalisation checker** — choose a target (1NF, 2NF, 3NF, BCNF) and get
  specific, fixable issues, plus key/relationship and naming checks.
- **Import** — diagram JSON, or `CREATE TABLE` scripts from PostgreSQL, MySQL,
  SQLite and SQL Server.
- **Export** — PNG, SVG, Excel workbook, SQL DDL (4 dialects), Mermaid, DBML,
  JSON, and share links that carry the whole diagram.
- Undo/redo, auto-layout, keyboard shortcuts, light and dark themes.

## Getting started

Requires Node.js 20.9+ (22 recommended — see `.nvmrc`).

```bash
npm ci
npm run dev        # http://localhost:3000
```

| Script                  | What it does                                                      |
| ----------------------- | ----------------------------------------------------------------- |
| `npm run dev`           | Development server                                                |
| `npm run build`         | Static export to `out/`                                           |
| `npm start`             | Serve `out/` locally                                              |
| `npm run check`         | Typecheck, lint, format check and unit tests (run before pushing) |
| `npm run test:e2e`      | Playwright tests against the built site (`npm run build` first)   |
| `npm run test:coverage` | Unit tests with coverage                                          |

## Project layout

```
src/
  app/                 Next.js entry (layout, global CSS tokens, page)
  components/          React UI — canvas/, panel/, toolbar/, dialogs/, ui/
  hooks/               useAnalysis, useLayout, keyboard shortcuts, theme
  lib/                 Pure TypeScript, unit tested, no React
    model/             Diagram types, factories, queries, import validation
    analysis/          Normalisation and design checks
    geometry/          Table sizing, line routing, markers, auto-layout
    io/                SQL/Mermaid/DBML/XLSX/JSON import-export, share links
    export/            SVG and PNG rendering
    settings/          Settings types and defaults
  store/               Zustand stores: diagram (with undo), ui, settings
e2e/                   Playwright smoke tests
docs/                  Deployment checklist, roadmap, original prototype
```

The app is a static export (`output: "export"`): there is no server code, so
every feature runs client-side and the site can be hosted anywhere.

## Deployment

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for the Vercel setup and the
pre-launch checklist.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

[MIT](LICENSE) © 2026 Joshua Elliott
