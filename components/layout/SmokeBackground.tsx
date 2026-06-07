export function SmokeBackground({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen bg-brand-black text-white">
      <div className="pointer-events-none fixed inset-0 bg-smoke opacity-60" />
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_bottom,rgba(232,93,4,0.08)_0%,transparent_60%)]" />
      <div className="relative z-10 flex min-h-screen flex-col">{children}</div>
    </div>
  );
}