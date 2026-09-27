import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AnalysisResult, Issue } from "@/lib/analysis";
import { sampleDiagram } from "@/lib/model";
import { useDiagramStore } from "@/store/diagram";
import { useSettingsStore } from "@/store/settings";
import { useUiStore } from "@/store/ui";
import { IssuesPanel } from "./IssuesPanel";

const mock = vi.hoisted(() => ({ result: null as AnalysisResult | null }));
vi.mock("@/hooks/useAnalysis", () => ({ useAnalysis: () => mock.result! }));

function result(issues: Issue[], extra: Partial<AnalysisResult> = {}): AnalysisResult {
  return {
    issues,
    highestForm: "BCNF",
    meetsTarget: true,
    byTable: {},
    flaggedColumns: new Set(issues.flatMap((i) => i.columnIds)),
    ...extra,
  };
}

const issue = (o: Partial<Issue>): Issue => ({
  id: Math.random().toString(36),
  rule: "3NF",
  severity: "error",
  certain: true,
  tableId: null,
  relId: null,
  columnIds: [],
  message: "",
  fix: "",
  ...o,
});

beforeEach(() => {
  useDiagramStore.getState().load(sampleDiagram());
  useSettingsStore.getState().reset();
  useUiStore.setState({ selection: null, tab: "issues" });
});
afterEach(cleanup);

describe("IssuesPanel", () => {
  it("lists issues with rule chips, Possible tags and fixes", () => {
    const [customers, orders] = useDiagramStore.getState().diagram.tables;
    mock.result = result(
      [
        issue({
          tableId: orders.id,
          message: "orders.city depends on postcode, which isn’t a key.",
          fix: "Move city into a table keyed by postcode.",
        }),
        issue({
          rule: "1NF",
          severity: "warning",
          certain: false,
          tableId: customers.id,
          message: "phone_1, phone_2 look like a repeating group in customers.",
          fix: "Create a phone table.",
        }),
      ],
      { highestForm: "1NF", meetsTarget: false },
    );
    render(<IssuesPanel />);

    expect(screen.getByText(/Highest form met/).textContent).toContain("1NF");
    expect(screen.getByText("2 things to look at")).toBeTruthy();
    expect(screen.getByText("orders.city depends on postcode, which isn’t a key.")).toBeTruthy();
    expect(screen.getByText("Move city into a table keyed by postcode.")).toBeTruthy();
    expect(screen.getByText("Possible")).toBeTruthy();
    expect(screen.getByText("3NF", { selector: "span" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Problems" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Possible problems" })).toBeTruthy();
  });

  it("clicking an issue reveals its table and switches to Edit", async () => {
    const user = userEvent.setup();
    const orders = useDiagramStore.getState().diagram.tables[1];
    mock.result = result([issue({ tableId: orders.id, message: "Look at orders" })]);
    render(<IssuesPanel />);
    await user.click(screen.getByRole("button", { name: /Look at orders/ }));
    const ui = useUiStore.getState();
    expect(ui.selection).toEqual({ kind: "table", id: orders.id });
    expect(ui.tab).toBe("edit");
    expect(ui.reveal?.target).toEqual({ kind: "table", id: orders.id });
  });

  it("groups by table", async () => {
    const user = userEvent.setup();
    const [customers, orders] = useDiagramStore.getState().diagram.tables;
    mock.result = result([
      issue({ tableId: orders.id, message: "A" }),
      issue({ tableId: customers.id, message: "B" }),
    ]);
    render(<IssuesPanel />);
    await user.click(screen.getByRole("radio", { name: "Table" }));
    expect(screen.getByRole("region", { name: "orders" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "customers" })).toBeTruthy();
  });

  it("shows the all-clear message and lets you change the target", async () => {
    const user = userEvent.setup();
    mock.result = result([]);
    render(<IssuesPanel />);
    expect(screen.getByText("No normalisation problems found.")).toBeTruthy();
    expect(screen.getByText("Meets 3NF")).toBeTruthy();
    await user.selectOptions(screen.getByLabelText("Target normal form"), "2NF");
    expect(useSettingsStore.getState().settings.targetNormalForm).toBe("2NF");
  });
});
