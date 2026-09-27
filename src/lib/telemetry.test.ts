import { describe, expect, it } from "vitest";
import { stripUrl, withoutQueryOrFragment } from "./telemetry";

describe("stripUrl", () => {
  it("drops the share-link fragment and query string", () => {
    expect(stripUrl("https://erd.example/#d=N4IgLg")).toBe("https://erd.example/");
    expect(stripUrl("https://erd.example/?utm=x#d=abc")).toBe("https://erd.example/");
  });

  it("leaves plain URLs unchanged", () => {
    expect(stripUrl("https://erd.example/")).toBe("https://erd.example/");
  });
});

describe("withoutQueryOrFragment", () => {
  it("keeps the event and strips its url", () => {
    expect(withoutQueryOrFragment({ type: "pageview", url: "https://erd.example/#d=x" })).toEqual({
      type: "pageview",
      url: "https://erd.example/",
    });
  });
});
