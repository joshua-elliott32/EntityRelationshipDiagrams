import type { Diagram } from "@/lib/model";
import { NORMAL_FORMS, type NormalForm } from "@/lib/settings/types";
import { buildCtx } from "./context";
import {
  duplicateTableIssues,
  multiFkIssues,
  relationshipIssues,
  tableDesignIssues,
} from "./design";
import { namingIssues } from "./naming";
import { normalFormIssues } from "./normalForms";
import type { AnalysisOptions, AnalysisResult, Issue, RuleCategory, Severity } from "./types";

export * from "./types";
export { normaliseType } from "./design";
export { toConvention, matchesConvention } from "./naming";

/** Position of a normal form in `none < 1NF < 2NF < 3NF < BCNF`. */
export const formRank = (f: NormalForm): number => NORMAL_FORMS.indexOf(f);

const NF_RULES: ReadonlySet<RuleCategory> = new Set(["1NF", "2NF", "3NF", "BCNF"]);
export const isNormalFormRule = (r: RuleCategory): r is "1NF" | "2NF" | "3NF" | "BCNF" =>
  NF_RULES.has(r);

function pushAll(into: Issue[], items: Issue[]): void {
  for (const i of items) into.push(i);
}

const SEVERITY_RANK: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

/**
 * Normalisation and design checks. Pure: same diagram + options → same result.
 */
export function analyze(d: Diagram, opts: AnalysisOptions): AnalysisResult {
  const ctx = buildCtx(d);
  const target = formRank(opts.target);

  // NF issues are always computed: highestForm ignores the target.
  const nf: Issue[] = [];
  for (const t of d.tables) pushAll(nf, normalFormIssues(ctx, t));

  let highest = formRank("BCNF");
  for (const i of nf) {
    if (i.certain) highest = Math.min(highest, formRank(i.rule as NormalForm) - 1);
  }
  const highestForm = NORMAL_FORMS[highest];

  const all: Issue[] = nf.filter(
    (i) => formRank(i.rule as NormalForm) <= target && (i.certain || opts.heuristics),
  );

  if (opts.designChecks) {
    pushAll(all, duplicateTableIssues(d.tables));
    for (const t of d.tables) {
      pushAll(all, tableDesignIssues(t));
      pushAll(all, multiFkIssues(ctx, t));
    }
    for (const r of d.rels) pushAll(all, relationshipIssues(ctx, r));
  }
  if (opts.naming !== "off") {
    for (const t of d.tables) pushAll(all, namingIssues(t, opts.naming));
  }

  // Stable, unique ids even for malformed input (e.g. duplicated column ids).
  const seen = new Map<string, number>();
  for (const i of all) {
    const n = seen.get(i.id) ?? 0;
    seen.set(i.id, n + 1);
    if (n > 0) i.id = `${i.id}#${n + 1}`;
  }

  const order = (i: Issue): number => {
    if (i.tableId !== null) return ctx.tableOrder.get(i.tableId) ?? Number.MAX_SAFE_INTEGER;
    // Relationship-only issues follow the tables, in relationship order.
    return d.tables.length + (i.relId !== null ? (ctx.relOrder.get(i.relId) ?? 0) : 0);
  };
  const issues = all
    .map((issue, idx) => ({ issue, idx, sev: SEVERITY_RANK[issue.severity], pos: order(issue) }))
    .sort((a, b) => a.sev - b.sev || a.pos - b.pos || a.idx - b.idx)
    .map((x) => x.issue);

  const byTable: Record<string, number> = {};
  const flaggedColumns = new Set<string>();
  for (const i of issues) {
    if (i.tableId !== null) byTable[i.tableId] = (byTable[i.tableId] ?? 0) + 1;
    for (const c of i.columnIds) flaggedColumns.add(c);
  }

  return {
    issues,
    highestForm,
    meetsTarget: highest >= target,
    byTable,
    flaggedColumns,
  };
}
