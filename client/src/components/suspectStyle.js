// Shared portrait styling for the suspect cast.
//
// This table used to be copy-pasted verbatim into DeductionNotebook, SuspectModal
// and AccusationModal, and all three derived both the colour and the visible label
// from the suspect's ARRAY INDEX. That works only while every surface renders the
// list in the same server order — the moment one of them sorted or filtered, its
// chips would silently disagree with the others about who "S3" is.
export const PORTRAIT_COLORS = ["#7a3a8c", "#c79a3a", "#b03a4a", "#3a5ab0", "#3a8c4a", "#9a6a3a"];

/** Colour + short label for the suspect at `index` in the case's cast list. */
export function suspectChip(index) {
  return { color: PORTRAIT_COLORS[index % PORTRAIT_COLORS.length], label: `S${index + 1}` };
}
