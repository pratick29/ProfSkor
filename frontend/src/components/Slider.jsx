export default function Slider({ label, value, onChange, min = 0, max = 100 }) {
  return (
    <div>
      <label className="text-sm text-slate-300">{label}</label>
      <div className="flex items-center gap-3 mt-2">
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="flex-1"
        />
        <span className="text-white font-semibold w-8">{value}</span>
      </div>
    </div>
  );
}
