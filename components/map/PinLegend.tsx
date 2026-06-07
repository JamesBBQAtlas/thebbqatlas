import { STYLE_LEGEND } from "@/lib/constants/styles";

export function PinLegend() {
  return (
    <div className="rounded-lg border border-white/20 bg-black/70 backdrop-blur-sm p-3 text-xs">
      <p className="font-semibold text-white/80 mb-2">BBQ Styles</p>
      <div className="flex flex-col gap-1.5">
        {STYLE_LEGEND.map(({ style, label, color }) => (
          <div key={style} className="flex items-center gap-2">
            <span
              className="h-3 w-3 rounded-full shrink-0"
              style={{ backgroundColor: color }}
            />
            <span className="text-white/70">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}