import { useState } from "react";
import { Info } from "lucide-react";

interface MetricInfo {
  title: string;
  description: string;
  formula: string;
  interpretation: {
    excellent: string;
    good: string;
    fair: string;
    poor: string;
  };
  howToImprove: string[];
}

interface MetricBoxProps {
  label: string;
  value: number | null;
  max?: number;
  icon?: string;
  info: MetricInfo;
}

export function MetricBox({ label, value, max = 100, icon, info }: MetricBoxProps) {
  const [showModal, setShowModal] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <>
      <div
        className="relative rounded-xl p-4 text-center"
        style={{
          background: "oklch(0.18 0.03 250)",
          border: "1px solid oklch(0.25 0.03 250)",
        }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1">
            {icon && <span className="text-sm">{icon}</span>}
            <div className="text-sm text-[oklch(0.70_0.05_250)]">{label}</div>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="p-0.5 rounded hover:bg-[oklch(0.25_0.03_250)] transition-colors"
            title="Info"
          >
            <Info className="w-3.5 h-3.5 text-[oklch(0.60_0.05_250)]" />
          </button>
        </div>

        {value !== null ? (
          <>
            <div className="text-3xl font-bold text-[oklch(0.90_0.05_220)]">
              {value}
            </div>
            <div className="text-xs text-[oklch(0.60_0.05_250)]">/{max}</div>
          </>
        ) : (
          <div className="text-2xl text-[oklch(0.50_0.05_250)]">N/D</div>
        )}

        {/* Tooltip */}
        {showTooltip && (
          <div
            className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 rounded-lg shadow-lg z-10 w-56 pointer-events-none text-left"
            style={{
              background: "oklch(0.20 0.03 250)",
              border: "1px solid oklch(0.30 0.03 250)",
            }}
          >
            <div className="text-xs text-[oklch(0.85_0.05_220)]">
              {info.description.substring(0, 120)}...
            </div>
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div
                className="border-4 border-transparent"
                style={{ borderTopColor: "oklch(0.20 0.03 250)" }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Info Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            style={{
              background: "oklch(0.15 0.03 250)",
              border: "1px solid oklch(0.25 0.03 250)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div
              className="sticky top-0 border-b p-6"
              style={{
                background: "oklch(0.15 0.03 250)",
                borderColor: "oklch(0.25 0.03 250)",
              }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-[oklch(0.90_0.05_220)]">
                  {info.title}
                </h2>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-[oklch(0.60_0.05_250)] hover:text-[oklch(0.80_0.05_220)]"
                >
                  <svg
                    className="w-6 h-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="p-6 space-y-6">
              {/* Description */}
              <div>
                <h3 className="text-lg font-semibold text-[oklch(0.85_0.05_220)] mb-2">
                  Cos'è?
                </h3>
                <p className="text-[oklch(0.75_0.05_220)]">{info.description}</p>
              </div>

              {/* Formula */}
              <div>
                <h3 className="text-lg font-semibold text-[oklch(0.85_0.05_220)] mb-2">
                  Come viene calcolato
                </h3>
                <div
                  className="p-4 rounded-lg font-mono text-sm text-[oklch(0.80_0.05_220)] overflow-x-auto whitespace-pre-wrap"
                  style={{
                    background: "oklch(0.12 0.03 250)",
                    border: "1px solid oklch(0.20 0.03 250)",
                  }}
                >
                  {info.formula}
                </div>
              </div>

              {/* Interpretation */}
              <div>
                <h3 className="text-lg font-semibold text-[oklch(0.85_0.05_220)] mb-3">
                  Interpretazione
                </h3>
                <div className="space-y-2">
                  <div
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{
                      background: "oklch(0.18 0.03 250)",
                      border: "1px solid oklch(0.25 0.03 250)",
                    }}
                  >
                    <span className="text-green-400 font-semibold min-w-[80px]">
                      85-100:
                    </span>
                    <span className="text-[oklch(0.75_0.05_220)]">
                      {info.interpretation.excellent}
                    </span>
                  </div>
                  <div
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{
                      background: "oklch(0.18 0.03 250)",
                      border: "1px solid oklch(0.25 0.03 250)",
                    }}
                  >
                    <span className="text-blue-400 font-semibold min-w-[80px]">
                      70-84:
                    </span>
                    <span className="text-[oklch(0.75_0.05_220)]">
                      {info.interpretation.good}
                    </span>
                  </div>
                  <div
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{
                      background: "oklch(0.18 0.03 250)",
                      border: "1px solid oklch(0.25 0.03 250)",
                    }}
                  >
                    <span className="text-yellow-400 font-semibold min-w-[80px]">
                      50-69:
                    </span>
                    <span className="text-[oklch(0.75_0.05_220)]">
                      {info.interpretation.fair}
                    </span>
                  </div>
                  <div
                    className="flex items-start gap-3 p-3 rounded-lg"
                    style={{
                      background: "oklch(0.18 0.03 250)",
                      border: "1px solid oklch(0.25 0.03 250)",
                    }}
                  >
                    <span className="text-red-400 font-semibold min-w-[80px]">
                      0-49:
                    </span>
                    <span className="text-[oklch(0.75_0.05_220)]">
                      {info.interpretation.poor}
                    </span>
                  </div>
                </div>
              </div>

              {/* How to Improve */}
              <div>
                <h3 className="text-lg font-semibold text-[oklch(0.85_0.05_220)] mb-3">
                  Come migliorare
                </h3>
                <ul className="space-y-2">
                  {info.howToImprove.map((tip, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-[oklch(0.75_0.05_220)]"
                    >
                      <span className="text-blue-400 mt-1">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Modal Footer */}
            <div
              className="sticky bottom-0 border-t p-4"
              style={{
                background: "oklch(0.12 0.03 250)",
                borderColor: "oklch(0.25 0.03 250)",
              }}
            >
              <button
                onClick={() => setShowModal(false)}
                className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
              >
                Chiudi
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
