import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HistoryMetricCircle from "./HistoryMetricCircle";

describe("HistoryMetricCircle", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders label and value with default tone styling", () => {
    render(<HistoryMetricCircle label="Tempo" value={'1\'03"25'} />);

    expect(screen.getByText("Tempo")).toBeInTheDocument();
    expect(screen.getByText('1\'03"25')).toBeInTheDocument();

    const wrapper = screen.getByTitle('Tempo: 1\'03"25');
    expect(wrapper.className).toContain("h-20");
    expect(wrapper.className).toContain("w-20");
  });

  it("applies highlight pulse styling for record metrics", () => {
    render(<HistoryMetricCircle label="Record" value="SI" highlight />);

    const wrapper = screen.getByTitle("Record: SI");
    const ring = wrapper.firstElementChild as HTMLElement | null;

    expect(ring).not.toBeNull();
    expect(ring?.className).toContain("animate-pulse");
    expect(ring?.className).toContain("rgba(251,191,36,1)");
  });

  it("supports compact size", () => {
    render(<HistoryMetricCircle label="Punti" value="724.75" size="sm" tone="lime" />);

    const wrapper = screen.getByTitle("Punti: 724.75");
    expect(wrapper.className).toContain("h-16");
    expect(wrapper.className).toContain("w-16");
  });
});
