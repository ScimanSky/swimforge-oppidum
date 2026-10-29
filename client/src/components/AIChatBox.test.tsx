import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AIChatBox, type Message } from "./AIChatBox";

vi.mock("streamdown", () => ({ Streamdown: ({ children }: any) => <p>{children}</p> }));

afterEach(cleanup);

const messages: Message[] = [
  { role: "user", content: "Come va il passo?" },
  { role: "assistant", content: "Migliora del 4%." },
];

describe("AIChatBox", () => {
  it("annuncia i messaggi in un log con chi parla", () => {
    render(<AIChatBox messages={messages} onSendMessage={vi.fn()} />);
    const log = screen.getByRole("log");
    expect(log.getAttribute("aria-live")).toBe("polite");
    const bubbles = Array.from(log.querySelectorAll("[data-chat-message]"), (node) => node.textContent);
    expect(bubbles).toEqual(["Tu: Come va il passo?", "Coach: Migliora del 4%."]);
  });

  it("lo stato resta montato e cambia solo il testo", () => {
    const { rerender } = render(<AIChatBox messages={messages} onSendMessage={vi.fn()} />);
    const status = screen.getByRole("status");
    expect(status.textContent).toBe("");
    rerender(<AIChatBox messages={messages} onSendMessage={vi.fn()} isLoading />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe("Risposta in arrivo");
    rerender(<AIChatBox messages={[]} onSendMessage={vi.fn()} />);
    expect(screen.getByRole("status")).toBe(status);
    expect(status.textContent).toBe("");
  });
});
