// Standard circuit-diagram symbols (as taught in school) for the parts palette.

import type { PartKind } from "@/lib/engine/circuit";

const paths: Record<PartKind | "erase" | "select", React.ReactNode> = {
  wire: <path d="M2 12h28" />,
  battery: <><path d="M2 12h10M20 12h10" /><path d="M12 5v14" strokeWidth={2.4} /><path d="M17 8v8" strokeWidth={2.4} /><path d="M8 6v4M6 8h4" strokeWidth={1.2} /></>,
  resistor: <><path d="M2 12h7M23 12h7" /><rect x={9} y={8} width={14} height={8} rx={0.5} /></>,
  bulb: <><path d="M2 12h7M23 12h7" /><circle cx={16} cy={12} r={7} /><path d="M11 7l10 10M21 7L11 17" /></>,
  switch: <><path d="M2 12h8M22 12h8" /><circle cx={10} cy={12} r={1.4} fill="currentColor" /><circle cx={22} cy={12} r={1.4} fill="currentColor" /><path d="M10 12l11-6" /></>,
  led: <><path d="M2 12h9M21 12h9" /><path d="M11 6v12l10-6z" /><path d="M21 6v12" /><path d="M17 4l3-3M20 6l3-3M20 1h0" strokeWidth={1.2} /></>,
  diode: <><path d="M2 12h9M21 12h9" /><path d="M11 6v12l10-6z" fill="currentColor" /><path d="M21 6v12" /></>,
  capacitor: <><path d="M2 12h12M18 12h12" /><path d="M14 5v14M18 5v14" strokeWidth={2.2} /></>,
  fuse: <><path d="M2 12h28" /><rect x={9} y={8} width={14} height={8} rx={0.5} /></>,
  motor: <><path d="M2 12h7M23 12h7" /><circle cx={16} cy={12} r={7} /><text x={16} y={15.5} textAnchor="middle" fontSize={9} fontWeight={800} fill="currentColor" stroke="none">M</text></>,
  buzzer: <><path d="M2 12h9M21 12h9" /><path d="M11 17V9a5 5 0 0 1 10 0v8z" /></>,
  ammeter: <><path d="M2 12h7M23 12h7" /><circle cx={16} cy={12} r={7} /><text x={16} y={15.5} textAnchor="middle" fontSize={9} fontWeight={800} fill="currentColor" stroke="none">A</text></>,
  voltmeter: <><path d="M2 12h7M23 12h7" /><circle cx={16} cy={12} r={7} /><text x={16} y={15.5} textAnchor="middle" fontSize={9} fontWeight={800} fill="currentColor" stroke="none">V</text></>,
  ldr: <><path d="M2 12h7M23 12h7" /><rect x={9} y={8} width={14} height={8} rx={0.5} /><path d="M10 1l4 4M14 1l4 4" strokeWidth={1.2} /></>,
  thermistor: <><path d="M2 12h7M23 12h7" /><rect x={9} y={8} width={14} height={8} rx={0.5} /><path d="M7 19l18-14M25 5h-3" strokeWidth={1.2} /></>,
  erase: <><path d="M9 19h16" /><path d="M6 15l9-9 7 7-6 6H10z" /></>,
  select: <path d="M10 4l12 8-6 1 3 6-2 1-3-6-4 4z" fill="currentColor" />,
};

export function CircuitSymbol({ kind, size = 32 }: { kind: PartKind | "erase" | "select"; size?: number }) {
  return (
    <svg viewBox="0 0 32 24" width={size} height={(size * 3) / 4} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[kind]}
    </svg>
  );
}
