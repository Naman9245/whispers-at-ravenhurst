// The fixed pool of questions a detective may put to any suspect. Shared by the
// client (renders the list) and the server (validates the questionId and looks up
// the answer in the case's dialogue tree). Questioning is GLOBAL — available
// anywhere — and capped per suspect by QUESTION_CAP.
//
// Tone: a sharp Victorian-era investigator pressing the household the night of the
// murder. Pointed, period, a little theatrical — never a generic survey form.
// NOTE: every `id` here MUST have a matching answer in EVERY suspect's
// dialogue_trees.<suspect>.questions in the case JSON, or validateCase() rejects.
export const QUESTION_POOL = [
  { id: "storm",       text: "What were you doing the moment the storm hit?" },
  { id: "knewhim",     text: "How well did you really know Lord Edmund?" },
  { id: "grievance",   text: "Who in this house has reason to wish him dead?" },
  { id: "lastsaw",     text: "When did you last see him alive?" },
  { id: "heard",       text: "Did you hear anything unusual that evening?" },
  { id: "gain",        text: "Tell me about your relationship with the other guests." },
  { id: "whereabouts", text: "Have you set foot in the library tonight?" },
  { id: "motive",      text: "Can anyone verify your alibi for the past hour?" },
  { id: "suspect",     text: "Is there someone here you suspect more than the others?" },
  { id: "account",     text: "What's your honest account of tonight's events?" },
];

export const QUESTION_IDS = QUESTION_POOL.map((q) => q.id);
