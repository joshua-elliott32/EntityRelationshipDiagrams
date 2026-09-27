import { beforeEach, describe, expect, it } from "vitest";
import { blankDiagram, sampleDiagram } from "@/lib/model";
import { toShareHash } from "@/lib/io";
import { BEFORE_SHARE_KEY, DRAFT_KEY, loadInitialDiagram, openShareHash } from "./persistence";
import { useDiagramStore } from "./diagram";

function setHash(hash: string) {
  window.history.replaceState(null, "", `/${hash}`);
}

beforeEach(() => {
  localStorage.clear();
  setHash("");
});

describe("loadInitialDiagram", () => {
  it("opens the saved draft", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(blankDiagram("Mine")));
    const r = loadInitialDiagram();
    expect(r.source).toBe("draft");
    expect(r.diagram.name).toBe("Mine");
  });

  it("falls back to the example", () => {
    expect(loadInitialDiagram().source).toBe("sample");
  });

  it("keeps the existing draft when a share link is opened", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(blankDiagram("Mine")));
    setHash(toShareHash({ ...sampleDiagram(), name: "Theirs" }));
    const r = loadInitialDiagram();
    expect(r.source).toBe("share-link");
    expect(r.diagram.name).toBe("Theirs");
    expect(r.previous?.name).toBe("Mine");
    expect(JSON.parse(localStorage.getItem(BEFORE_SHARE_KEY)!).name).toBe("Mine");
  });

  it("opens a share link with nothing to keep", () => {
    setHash(toShareHash({ ...sampleDiagram(), name: "Theirs" }));
    const r = loadInitialDiagram();
    expect(r.previous).toBeUndefined();
    expect(localStorage.getItem(BEFORE_SHARE_KEY)).toBeNull();
  });

  it("ignores a broken share link and opens the draft", () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(blankDiagram("Mine")));
    setHash("#d=not-a-diagram");
    expect(loadInitialDiagram()).toMatchObject({ source: "draft", diagram: { name: "Mine" } });
  });
});

describe("openShareHash", () => {
  it("loads a shared diagram with the current one one undo away", () => {
    useDiagramStore.getState().load(blankDiagram("Mine"));
    expect(openShareHash(toShareHash({ ...sampleDiagram(), name: "Theirs" }))).toBe(true);
    expect(useDiagramStore.getState().diagram.name).toBe("Theirs");
    expect(JSON.parse(localStorage.getItem(BEFORE_SHARE_KEY)!).name).toBe("Mine");
    useDiagramStore.getState().undo();
    expect(useDiagramStore.getState().diagram.name).toBe("Mine");
  });

  it("ignores hashes that aren't share links", () => {
    useDiagramStore.getState().load(blankDiagram("Mine"));
    expect(openShareHash("#something-else")).toBe(false);
    expect(useDiagramStore.getState().diagram.name).toBe("Mine");
  });
});
