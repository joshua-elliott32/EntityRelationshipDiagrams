import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadFile, slugify } from "./download";
import { toJson, parseDiagramJson } from "./index";
import { sampleDiagram } from "@/lib/model";

describe("slugify", () => {
  it("makes file-name-safe slugs", () => {
    expect(slugify("Shop example")).toBe("shop-example");
    expect(slugify("  Ünïcode & Co!  ")).toBe("n-code-co");
    expect(slugify("")).toBe("diagram");
    expect(slugify("!!!")).toBe("diagram");
  });
});

describe("toJson", () => {
  it("round-trips through parseDiagramJson", () => {
    const d = sampleDiagram();
    expect(parseDiagramJson(toJson(d))).toEqual(d);
  });
});

describe("downloadFile", () => {
  afterEach(() => vi.restoreAllMocks());

  it("clicks a temporary link with a UTF-8 text blob", () => {
    const blobs: Blob[] = [];
    const create = vi.fn((b: Blob) => {
      blobs.push(b);
      return "blob:x";
    });
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    downloadFile("a.sql", "SELECT 1;", "text/plain");
    expect(click).toHaveBeenCalledOnce();
    expect(blobs[0].type).toBe("text/plain;charset=utf-8");
    expect(document.querySelector("a[download]")).toBeNull();
  });
});
