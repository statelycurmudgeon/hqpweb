// How a rule's source reads in the guide: "Sep 2026", linking to the post.
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-09" → "Sep 2026"; anything else comes back unchanged. */
export function monthLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(date);
  const month = m ? MONTHS[Number(m[2]) - 1] : undefined;
  return m && month ? `${month} ${m[1]}` : date;
}
