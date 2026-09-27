# Reading an ER diagram picture

How to turn what you see into the spec. Read this when the picture uses a
notation you're unsure of, or before writing relationships.

## Contents

1. Crow's-foot line ends
2. Which table is the parent
3. Other notations (Chen, UML, 1/N labels)
4. Keys, types and nullability
5. Positions and sizes
6. Common mistakes

## 1. Crow's-foot line ends

Each end of a line says how many rows of the table _at that end_ can relate
to one row at the other end. Read the two symbols nearest the table: the one
closest to the table is the maximum, the outer one is the minimum.

| Symbol at the table  | Meaning      | Spec token    |
| -------------------- | ------------ | ------------- |
| two bars `‖`         | exactly one  | `\|\|`        |
| circle + bar `○│`    | zero or one  | `\|o` / `o\|` |
| bar + crow's foot    | one or many  | `\|{` / `}\|` |
| circle + crow's foot | zero or many | `o{` / `}o`   |

Write `ends` as `"<parent end>--<child end>"`, parent first, e.g.
`"||--o{"` (each child row has exactly one parent; a parent has zero or more
children). The build script derives:

- `type`: both ends many → `N:M`; child end many → `1:N`; otherwise `1:1`.
- `fromOptional` = the parent end has a circle (a child may exist without a parent).
- `toOptional` = the child end has a circle (a parent may have no children).

If you can't make out a circle, prefer mandatory parent (`||`) and optional
children (`o{`); that's the most common design. Mention the guess.

## 2. Which table is the parent

The parent (`from`) is the side the foreign key _points to_: its primary key
(or a unique column). The child (`to`) holds the foreign-key column. Clues:

- The crow's foot sits at the child.
- The child has a column named like the parent's key (`CustomerID`,
  `customer_id`), often badged `FK`.
- Lines drawn by ERD Studio attach at the exact rows of the two columns.

For a one-to-one line, the child is the table whose column is marked FK or is
nullable. For N:M lines with no junction table, pick either direction and
leave both columns off: `"from": "Orders", "to": "Products"` (table names
only are allowed).

## 3. Other notations

- **1 / N / M labels**: `1` at a table = one, `N`/`M`/`*` = many. `0..1`,
  `0..*` add optionality. Convert to crow's-foot tokens.
- **UML** (`1`, `0..1`, `1..*`, `*` at line ends): same mapping as labels.
- **Chen** (diamonds for relationships, ovals for attributes): each rectangle
  is a table; ovals attached to it are its columns (underlined = PK); the
  diamond's side labels give cardinality. Double rectangles are weak
  entities: their key includes the parent's key.
- **Arrows**: an arrow usually points from the FK column to the referenced
  key, i.e. from child to parent.

## 4. Keys, types and nullability

- `PK` badge, a key icon or an underlined name → `PK`. Several PK columns = a
  composite key: mark each one.
- `FK` badge → add `FK` to the column and make sure a relationship points at
  it (the FK flag itself is only a hint; the relationship is what counts).
- `UK`/`U`/`unique` → `UK`.
- A trailing `?`, `NULL`, `nullable`, or an unfilled/hollow marker → nullable.
  ERD Studio draws nullable types as `INT?`, and the spec accepts that form.
- Keep types exactly as shown (`VARCHAR(100)`, `DECIMAL(10,2)`, `NUMC(10)`).
  If none is shown, leave the type empty rather than guessing.

## 5. Positions and sizes

`at` is the table's top-left corner and `size` its width and height, both in
picture pixels as you estimate them. Rough numbers are fine. The script
scales them to the canvas using the median of `picture width ÷ expected
canvas width` over all tables, so relative layout is preserved. If the
verify screenshot shows overlaps, increase the gap in `at` between the
overlapping tables and rebuild.

Header colours: pick the nearest of `slate` (dark navy, the default), `teal`,
`blue`, `violet`, `rose`, `amber`, `green`. Omit `color` for the default.

## 6. Common mistakes

- Parent and child swapped: the FK column must be in `to`. The build script
  warns when a many end is on the parent side.
- A relationship referencing a column that isn't in the table list (typos,
  `Id` vs `ID`): names are matched case-insensitively but otherwise exactly.
- Forgetting the second of two lines between the same pair of tables.
- Reading a self-referencing loop (a line leaving and re-entering the same
  table) as decoration: it's a relationship, e.g. `Employees.EmployeeID →
Employees.ManagerID`.
- Text cut off at the picture's edge: say which values you had to guess.
