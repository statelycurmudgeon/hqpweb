// Which note a row in the list shows. The app's soft notes paraphrase HQPlayer's manual
// (compat.ts); the guide follows Signalyst's newer posts, and the two can disagree (the
// manual pairs NS9 with 176.4/192k, while a 2026 post offers it for ladder DACs at 384k).
// On a row the guide recommends for your answers, the guide's reason wins over the soft
// note. Warnings (won't play here, failed here before) are never dropped.

export interface ListRow {
  name: string;
  warn?: string;
  note?: string;
}

export function withGuideNotes<T extends ListRow>(rows: readonly T[], recommended: ReadonlySet<string>): T[] {
  return rows.map((r) => (recommended.has(r.name) && !r.warn && r.note ? { ...r, note: "Suits your answers: see Guide" } : r));
}
