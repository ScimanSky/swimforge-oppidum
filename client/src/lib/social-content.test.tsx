import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractFirstUrl, LinkPreviewCard, normalizeTagSearchQuery, renderSocialText } from "./social-content";

afterEach(cleanup);

describe("social-content helpers", () => {
  it("normalizes tag search query with leading @", () => {
    expect(normalizeTagSearchQuery("@valdaster")).toBe("valdaster");
    expect(normalizeTagSearchQuery("  @@val daster  ")).toBe("val daster");
  });

  it("extracts first valid http url and trims trailing punctuation", () => {
    const text = "Guarda questo link https://swimforge.app/path/to/page). e poi dimmi";
    expect(extractFirstUrl(text)).toBe("https://swimforge.app/path/to/page");
  });

  it("extracts bare domains and normalizes them to https", () => {
    const text = "Link club: eamasters26.com/eventi";
    expect(extractFirstUrl(text)).toBe("https://eamasters26.com/eventi");
  });

  it("extracts urls even when pasted text contains invisible chars", () => {
    const text = `https://eamasters26.com/\u200Beventi`;
    expect(extractFirstUrl(text)).toBe("https://eamasters26.com/eventi");
  });

  it("renders links as clickable anchors", () => {
    render(<p>{renderSocialText("Link https://swimforge.app ora")}</p>);
    const link = screen.getByRole("link", { name: "https://swimforge.app" });
    expect(link).toHaveAttribute("href", "https://swimforge.app");
  });

  it("renders bare-domain links as clickable anchors", () => {
    render(<p>{renderSocialText("Vai su eamasters26.com ora")}</p>);
    const link = screen.getByRole("link", { name: "eamasters26.com" });
    expect(link).toHaveAttribute("href", "https://eamasters26.com");
  });
});

describe("LinkPreviewCard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const answer = (title: string) => ({
    ok: true,
    json: async () => ({
      requestedUrl: "x",
      resolvedUrl: `https://example.org/${title}`,
      host: "example.org",
      siteName: "Esempio",
      title,
      description: null,
    }),
  });

  it("shows the address at once, then the page title from the server", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer("Gara sociale"));
    vi.stubGlobal("fetch", fetchMock);
    render(<LinkPreviewCard url="https://first.example/gara" />);
    expect(screen.getByRole("link")).toHaveTextContent("first.example");
    expect(screen.getByRole("link")).toHaveTextContent("/gara");
    expect(await screen.findByText("Gara sociale")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://example.org/Gara sociale");
  });

  it("a new link never shows the previous link's title while its own loads", async () => {
    let release: (value: unknown) => void = () => {};
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(answer("Primo titolo"))
      .mockReturnValueOnce(new Promise(resolve => (release = resolve)));
    vi.stubGlobal("fetch", fetchMock);
    const { rerender } = render(<LinkPreviewCard url="https://one.example/a" />);
    expect(await screen.findByText("Primo titolo")).toBeInTheDocument();

    rerender(<LinkPreviewCard url="https://two.example/b" />);
    expect(screen.queryByText("Primo titolo")).toBeNull();
    expect(screen.getByRole("link")).toHaveTextContent("two.example");
    release(answer("Secondo titolo"));
    expect(await screen.findByText("Secondo titolo")).toBeInTheDocument();
  });

  it("an unsafe address from the server is never the link: the post's own address instead", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          requestedUrl: "x",
          resolvedUrl: "javascript:alert(1)",
          host: "four.example",
          siteName: "Quattro",
          title: "Pagina quattro",
          description: null,
        }),
      })
    );
    render(<LinkPreviewCard url="https://four.example/d" />);
    expect(await screen.findByText("Pagina quattro")).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", "https://four.example/d");
  });

  it("an unsafe link renders nothing, also after a valid one", () => {
    vi.stubGlobal("fetch", vi.fn().mockReturnValue(new Promise(() => {})));
    const { container, rerender } = render(<LinkPreviewCard url="https://three.example/c" />);
    expect(screen.getByRole("link")).toBeInTheDocument();
    rerender(<LinkPreviewCard url="javascript:alert(1)" />);
    expect(container).toBeEmptyDOMElement();
  });
});
