export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div>
      <div className="text-[28px] leading-none font-extrabold tracking-tight text-white">
        DEVENISH<sup className="text-[10px] align-super">™</sup>
      </div>
      <div className="mt-1 text-[12px] font-semibold italic text-accent">The Agri-Technology Company</div>
      {!compact && <div className="mt-3 text-[12px] font-semibold tracking-[0.18em] text-white/70">INSIGHTS PORTAL</div>}
    </div>
  );
}
