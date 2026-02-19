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

interface MetricCardProps {
  title: string;
  value: number | null;
  max?: number;
  icon: string;
  color: "green" | "blue" | "yellow" | "red" | "gray";
  tooltip: string;
  info: MetricInfo;
  unit?: string;
}

const colorClasses = {
  green: {
    bg: "bg-green-50 dark:bg-transparent dark:shadow-[0_0_20px_rgba(34,197,94,0.15)]",
    border: "border-green-200 dark:border-green-500/30",
    text: "text-green-700 dark:text-green-400 dark:drop-shadow-[0_0_8px_rgba(34,197,94,0.6)]",
    gauge: "bg-green-500 dark:bg-green-400 dark:shadow-[0_0_12px_rgba(34,197,94,0.8)]",
  },
  blue: {
    bg: "bg-blue-50 dark:bg-transparent dark:shadow-[0_0_20px_var(--neon-soft)]",
    border: "border-blue-200 dark:border-primary/40",
    text: "text-blue-700 dark:text-primary dark:drop-shadow-[0_0_8px_var(--neon-glow)]",
    gauge: "bg-blue-500 dark:bg-primary dark:shadow-[0_0_12px_var(--neon-glow)]",
  },
  yellow: {
    bg: "bg-yellow-50 dark:bg-transparent dark:shadow-[0_0_20px_rgba(234,179,8,0.15)]",
    border: "border-yellow-200 dark:border-yellow-500/30",
    text: "text-yellow-700 dark:text-yellow-400 dark:drop-shadow-[0_0_8px_rgba(234,179,8,0.6)]",
    gauge: "bg-yellow-500 dark:bg-yellow-400 dark:shadow-[0_0_12px_rgba(234,179,8,0.8)]",
  },
  red: {
    bg: "bg-red-50 dark:bg-transparent dark:shadow-[0_0_20px_rgba(239,68,68,0.15)]",
    border: "border-red-200 dark:border-red-500/30",
    text: "text-red-700 dark:text-red-400 dark:drop-shadow-[0_0_8px_rgba(239,68,68,0.6)]",
    gauge: "bg-red-500 dark:bg-red-500 dark:shadow-[0_0_12px_rgba(239,68,68,0.8)]",
  },
  gray: {
    bg: "bg-gray-50 dark:bg-transparent",
    border: "border-gray-200 dark:border-border/50",
    text: "text-gray-500 dark:text-gray-400",
    gauge: "bg-gray-400 dark:bg-gray-600",
  },
};

export function MetricCard({
  title,
  value,
  max = 100,
  icon,
  color,
  tooltip,
  info,
  unit = "",
}: MetricCardProps) {
  const [showModal, setShowModal] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);

  const colors = colorClasses[value === null ? "gray" : color];
  const percentage = value !== null ? Math.min((value / max) * 100, 100) : 0;

  return (
    <>
      {/* Card */}
      <div
        className={`surface-panel relative p-4 rounded-xl border ${colors.bg} ${colors.border} transition-all hover:shadow-[0_8px_30px_var(--neon-soft)] group`}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{icon}</span>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
              {title}
            </h3>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Maggiori informazioni"
          >
            <Info className="w-4 h-4 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Value */}
        <div className="mb-2">
          {value !== null ? (
            <div className="flex items-baseline gap-1">
              <span className={`text-3xl font-bold ${colors.text}`}>
                {value}
              </span>
              {unit && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {unit}
                </span>
              )}
              {max !== 100 && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  / {max}
                </span>
              )}
            </div>
          ) : (
            <span className="text-2xl text-gray-400 dark:text-gray-500">
              N/D
            </span>
          )}
        </div>

        {/* Gauge Bar */}
        {value !== null && (
          <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className={`h-full ${colors.gauge} transition-all duration-500`}
              style={{ width: `${percentage}%` }}
            />
          </div>
        )}

        {/* Tooltip */}
        {showTooltip && (
          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg shadow-lg z-10 w-64 pointer-events-none">
            {tooltip}
            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
              <div className="border-4 border-transparent border-t-gray-900 dark:border-t-gray-700" />
            </div>
          </div>
        )}
      </div>

      {/* Info Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowModal(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="sticky top-0 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-3xl">{icon}</span>
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {info.title}
                  </h2>
                </div>
                <button
                  onClick={() => setShowModal(false)}
                  className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
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
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Cos'è?
                </h3>
                <p className="text-gray-700 dark:text-gray-300">
                  {info.description}
                </p>
              </div>

              {/* Formula */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                  Come viene calcolato
                </h3>
                <div className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg font-mono text-sm text-gray-800 dark:text-gray-200 overflow-x-auto">
                  {info.formula}
                </div>
              </div>

              {/* Interpretation */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Interpretazione
                </h3>
                <div className="space-y-2">
                  <div className="flex items-start gap-3 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                    <span className="text-green-600 dark:text-green-400 font-semibold min-w-[80px]">
                      85-100:
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {info.interpretation.excellent}
                    </span>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                    <span className="text-blue-600 dark:text-blue-400 font-semibold min-w-[80px]">
                      70-84:
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {info.interpretation.good}
                    </span>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                    <span className="text-yellow-600 dark:text-yellow-400 font-semibold min-w-[80px]">
                      50-69:
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {info.interpretation.fair}
                    </span>
                  </div>
                  <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <span className="text-red-600 dark:text-red-400 font-semibold min-w-[80px]">
                      0-49:
                    </span>
                    <span className="text-gray-700 dark:text-gray-300">
                      {info.interpretation.poor}
                    </span>
                  </div>
                </div>
              </div>

              {/* How to Improve */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                  Come migliorare
                </h3>
                <ul className="space-y-2">
                  {info.howToImprove.map((tip, index) => (
                    <li
                      key={index}
                      className="flex items-start gap-2 text-gray-700 dark:text-gray-300"
                    >
                      <span className="text-blue-500 mt-1">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4">
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
