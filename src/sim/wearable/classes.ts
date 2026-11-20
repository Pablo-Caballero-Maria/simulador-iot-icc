/** Clases de ritmo que distingue la red del wearable (RF-02). */
export const RHYTHM_CLASSES = ["normal", "af", "vt", "ectopy", "noise"] as const;
export type RhythmClass = (typeof RHYTHM_CLASSES)[number];

export const CLASS_LABELS: Record<RhythmClass, string> = {
  normal: "Normal",
  af: "FA o flúter",
  vt: "Taquiarritmia ventricular",
  ectopy: "Extrasistolia frecuente",
  noise: "Ruido",
};
