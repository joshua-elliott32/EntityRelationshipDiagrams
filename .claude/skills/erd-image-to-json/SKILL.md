---
name: erd-image-to-json
description: Convert a picture of an entity relationship diagram (screenshot, photo, whiteboard, PNG/SVG export, exam paper, or a diagram from another tool such as dbdiagram, Lucidchart, draw.io, MySQL Workbench or ERD Studio itself) into an ERD Studio diagram file (.json) that opens with Import → Diagram file. Use this whenever someone shares an image of tables and relationships and wants it in ERD Studio, wants it "as JSON", "in the required format", "importable", or wants to edit, check or normalise a diagram they only have as a picture, even if they don't say "JSON".
---

# ER diagram picture → ERD Studio JSON

Turn a picture of an ER diagram into a file ERD Studio can import, faithful
to what's drawn: the same tables, columns, keys, line ends, colours and rough
layout. Then prove the file loads by importing it into the app.

The file format is ERD Studio's diagram format, version 2 (the model lives in
`src/lib/model/types.ts` and import validation in `src/lib/model/schema.ts`).
It has many required fields and cross-referencing ids. Don't hand-write it:
write a short **spec** and let `scripts/build-diagram.mjs` produce the file.
That avoids the typos and dangling ids that make an import fail.

## Workflow

1. **Read the picture carefully.** List every table, then every column in
   order with its type, key badges (PK, FK, UK) and nullability (`INT?`).
   Then list every line: which two columns it joins and the symbol at each
   end. Count the lines, since missing one is the most common error. If the
   notation isn't plain crow's foot, or you're unsure which side is the
   parent, read `references/reading-diagrams.md`.

2. **Write the spec** as JSON (format below). Put it in a scratch location,
   not the repo. Estimate each table's top-left corner (`at`) and size
   (`size`) in picture pixels. Rough is fine; they're only used for layout.

3. **Build the file:**

   ```bash
   node .claude/skills/erd-image-to-json/scripts/build-diagram.mjs spec.json diagram.json
   ```

   Fix every `error:` line. Read the `warning:` lines. Each is either a
   mistake to fix (e.g. a parent/child swap, overlapping tables) or something
   genuinely in the picture to mention to the user.

4. **Verify it:**

   ```bash
   node .claude/skills/erd-image-to-json/scripts/verify-diagram.mjs diagram.json
   ```

   That runs the structural checks. When the repo is available, also import
   it into the real app. Run `npm run build` first if `out/` is missing or
   stale, then:

   ```bash
   node .claude/skills/erd-image-to-json/scripts/verify-diagram.mjs diagram.json --browser --screenshot check.png
   ```

   Look at the screenshot next to the original picture and compare tables,
   columns, line ends and layout. Fix the spec and rebuild if anything
   differs or tables overlap. (If Playwright's browser isn't installed, set
   `PLAYWRIGHT_CHROMIUM_PATH` to an existing Chromium, or run
   `npx playwright install chromium`.)

5. **Deliver** the `.json` file: give it to the user as a file. Don't commit it
   unless asked. Then summarise:
   - the counts (tables, relationships)
   - a table of the relationships (parent column → child column, type, optionality)
   - anything you had to guess (blurry text, unclear line ends)
   - what the Checks tab reports, and the one-line fix for each issue

   Report checker issues rather than silently fixing them. The file should
   match the picture, and the user decides whether to change the design.

## Spec format

```json
{
  "name": "Shop",
  "tables": [
    {
      "name": "customers",
      "color": "teal",
      "at": [40, 60],
      "size": [300, 160],
      "columns": ["customer_id INT PK", "email VARCHAR(255) UK", "phone VARCHAR(20)?"]
    },
    {
      "name": "orders",
      "at": [420, 60],
      "size": [300, 140],
      "columns": ["order_id INT PK", "customer_id INT FK", "placed_at TIMESTAMP"]
    }
  ],
  "relationships": [
    {
      "from": "customers.customer_id",
      "to": "orders.customer_id",
      "ends": "||--o{",
      "label": "places"
    }
  ]
}
```

**Columns** are strings: `"<name> <type> [flags]"`. The flags are:

- `PK`: primary key.
- `FK`: a hint that a relationship must point at this column.
- `UK` or `UNIQUE`: unique.
- `NULL`, or a `?` after the type: can be empty.
- `LIST`: holds a list of values.

Use the object form when you need more fields:
`{ "name": "city", "type": "VARCHAR(60)", "determinedBy": ["postcode"], "note": "…" }`.

**Relationships**:

- `from` is the parent, referenced column: `"Table.Column"`.
- `to` is the child, the column holding the foreign key.
- `ends` is the crow's-foot notation, parent end first. Each end is one of:
  - `||` exactly one
  - `|o` zero or one
  - `|{` one or many
  - `o{` zero or many

  The type and optionality are worked out from `ends`. You can instead give
  `type` (`1:1`, `1:N`, `N:M`), `fromOptional` and `toOptional` directly.

- Optional: `label`, `onDelete`, `onUpdate` (`NO ACTION`, `RESTRICT`,
  `CASCADE`, `SET NULL`, `SET DEFAULT`).

**Colours**: `slate` (the default dark header), `teal`, `blue`, `violet`,
`rose`, `amber`, `green`. Leave `color` out for the default.

`examples/scorecards.spec.json` is a complete worked example (6 tables,
5 relationships, including a nullable one-to-one) built from a real
screenshot.

## Why faithful rather than "fixed"

People convert pictures to check them, share them or keep working on them in
ERD Studio. A file that quietly "corrects" the design loses their work and
hides the problems the checker is there to point out. Copy what's drawn, and
flag anything that looks wrong in the summary.
