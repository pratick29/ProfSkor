export default function WeightControl({
  label,
  value,
  onChange,
  presets = {}
}) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-zinc-300">{label}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(Math.max(value - 5, 0))}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            −
          </button>
          <span className="w-12 text-center text-sm font-semibold text-teal-400">
            {value}%
          </span>
          <button
            onClick={() => onChange(Math.min(value + 5, 100))}
            className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 border border-white/5 text-zinc-400 hover:text-white transition-colors"
          >
            +
          </button>
        </div>
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 rounded-full appearance-none bg-white/10 accent-teal-500"
      />
      {Object.keys(presets).length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {Object.entries(presets).map(([name, val]) => (
            <button
              key={name}
              onClick={() => onChange(val)}
              className="text-xs px-2.5 py-1 rounded-md bg-teal-500/15 hover:bg-teal-500/25 text-teal-400 border border-teal-500/20 transition-colors"
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
