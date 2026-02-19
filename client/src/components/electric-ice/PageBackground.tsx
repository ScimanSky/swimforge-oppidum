import { cn } from "@/lib/utils"

export default function PageBackground({ className }: { className?: string }) {
  return (
    <div className={cn("pointer-events-none fixed inset-0 overflow-hidden", className)}>
      <div className="absolute inset-0 bg-gradient-to-b from-background via-background to-[oklch(0.12_0.03_250)]" />
      <div
        className="absolute -right-[10%] -top-[20%] h-[60%] w-[50%] rounded-full opacity-[0.07]"
        style={{
          background: "radial-gradient(circle, var(--electric-cyan), transparent 70%)",
          filter: "blur(80px)",
        }}
      />
      <div
        className="absolute -bottom-[15%] -left-[10%] h-[50%] w-[45%] rounded-full opacity-[0.05]"
        style={{
          background: "radial-gradient(circle, var(--electric-lime), transparent 70%)",
          filter: "blur(90px)",
        }}
      />
    </div>
  )
}
