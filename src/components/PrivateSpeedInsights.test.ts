import { describe, expect, it } from "vitest";
import { stripUrl } from "./PrivateSpeedInsights";

describe("stripUrl", () => {
  it("drops the share-link fragment and query string", () => {
    expect(stripUrl("https://erd.example/#d=N4IgLg")).toBe("https://erd.example/");
    expect(stripUrl("https://erd.example/?utm=x#d=abc")).toBe("https://erd.example/");
  });

  it("leaves plain URLs unchanged", () => {
    expect(stripUrl("https://erd.example/")).toBe("https://erd.example/");
  });
});
