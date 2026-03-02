import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { extractFirstUrl, normalizeTagSearchQuery, renderSocialText } from "./social-content";

describe("social-content helpers", () => {
  it("normalizes tag search query with leading @", () => {
    expect(normalizeTagSearchQuery("@valdaster")).toBe("valdaster");
    expect(normalizeTagSearchQuery("  @@val daster  ")).toBe("val daster");
  });

  it("extracts first valid http url and trims trailing punctuation", () => {
    const text = "Guarda questo link https://swimforge.app/path/to/page). e poi dimmi";
    expect(extractFirstUrl(text)).toBe("https://swimforge.app/path/to/page");
  });

  it("renders links as clickable anchors", () => {
    render(<p>{renderSocialText("Link https://swimforge.app ora")}</p>);
    const link = screen.getByRole("link", { name: "https://swimforge.app" });
    expect(link).toHaveAttribute("href", "https://swimforge.app");
  });
});
