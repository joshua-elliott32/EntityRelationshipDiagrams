import { beforeEach, describe, expect, it } from "vitest";
import { blankDiagram, sampleDiagram } from "@/lib/model";
import { useDiagramStore } from "@/store/diagram";
import { useUiStore } from "@/store/ui";
import { useToastStore } from "@/hooks/useToast";
import { addTableAtCentre, deleteSelection, findFreeSpot } from "./actions";

const D = () => useDiagramStore.getState();

beforeEach(() => {
  D().load(blankDiagram());
  useUiStore.setState({ selection: null });
  useToastStore.setState({ queue: [] });
});

describe("findFreeSpot", () => {
  it("keeps the wanted spot when it is free", () => {
    expect(findFreeSpot({ x: 0, y: 0 }, [{ x: 500, y: 500, w: 200, h: 100 }])).toEqual({
      x: 0,
      y: 0,
    });
  });

  it("moves off an existing table", () => {
    const box = { x: 0, y: 0, w: 200, h: 100 };
    const p = findFreeSpot({ x: 0, y: 0 }, [box]);
    const overlaps =
      p.x < box.x + box.w && p.x + 200 > box.x && p.y < box.y + box.h && p.y + 80 > box.y;
    expect(overlaps).toBe(false);
  });
});

describe("addTableAtCentre / deleteSelection", () => {
  it("adds and selects a table, then deletes it with an Undo toast", () => {
    D().load(sampleDiagram());
    const id = addTableAtCentre();
    expect(D().diagram.tables).toHaveLength(4);
    expect(useUiStore.getState().selection).toEqual({ kind: "table", id });

    expect(deleteSelection()).toBe(true);
    expect(D().diagram.tables).toHaveLength(3);
    const t = useToastStore.getState().queue.at(-1)!;
    expect(t.message).toMatch(/^Deleted table_4/);
    t.action!.run();
    expect(D().diagram.tables.map((x) => x.id)).toContain(id);
  });
});
