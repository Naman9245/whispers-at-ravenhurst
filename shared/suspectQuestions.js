// The interrogation catalogue: what a detective may PUT to each suspect.
//
// Replaces the old model where one flat pool of 10 questions was asked of all
// six suspects, so everyone answered the same prompts and nobody sounded like
// anybody. Now:
//
//   CORE_QUESTIONS      — ~12, every suspect must answer (the shared spine)
//   SUSPECT_QUESTIONS   — ~15 per suspect, written to THAT person's role,
//                         secret and alibi. Nobody else is ever asked them.
//
// ~100 questions total, but only ~170 answers to write instead of the ~600 a
// flat pool of 100 would have demanded — and the per-suspect sets are where the
// characterisation actually lives.
//
// SPLIT OF RESPONSIBILITY, unchanged from before: the QUESTION TEXT is shared
// (the client has to render it) while the ANSWERS live in the case JSON,
// server-side only, and reach the client one branch at a time through tryAsk.
// Nothing here reveals anything — these are the questions, never the replies.
//
// FIELDS
//   id            unique across core + every suspect set; the wire value
//   text          what the detective says
//   category      alibi | motive | relationships | room | weapon | pressure
//   requiresClue  optional clue id — the question only exists once the player
//                 has FOUND that clue. The client filters on it for display and
//                 `tryAsk` re-checks it server-side, because the client's list
//                 is advisory and a crafted socket message must not bypass it.
//
// BUDGET: core questions cost one of the player's QUESTION_CAP asks per suspect.
// Clue-unlocked questions are FREE — you already paid for them by finding the
// evidence. That is the whole loop: investigating buys interrogation leverage.
//
// ⚠️ `storm` and `motive` must stay in CORE with their exact current wording —
// `.shots/overhaul-test.mjs` matches both strings verbatim.

export const CORE_QUESTIONS = [
  { id: "storm",       category: "alibi",         text: "What were you doing the moment the storm hit?" },
  { id: "knewhim",     category: "relationships", text: "How well did you really know Lord Edmund?" },
  { id: "grievance",   category: "motive",        text: "Who in this house has reason to wish him dead?" },
  { id: "lastsaw",     category: "alibi",         text: "When did you last see him alive?" },
  { id: "heard",       category: "room",          text: "Did you hear anything unusual that evening?" },
  { id: "gain",        category: "relationships", text: "Tell me about your relationship with the other guests." },
  { id: "whereabouts", category: "room",          text: "Have you set foot in the library tonight?" },
  { id: "motive",      category: "alibi",         text: "Can anyone verify your alibi for the past hour?" },
  { id: "suspect",     category: "relationships", text: "Is there someone here you suspect more than the others?" },
  { id: "account",     category: "alibi",         text: "What's your honest account of tonight's events?" },
  { id: "quarrel",     category: "motive",        text: "When did you last raise your voice to him?" },
  { id: "leaving",     category: "room",          text: "Did you step outside at any point this evening?" },
];

// Per-suspect sets. Written against each character's blurb, alibi and secret —
// and, where a clue exists to justify it, gated behind that evidence.
export const SUSPECT_QUESTIONS = {
  // --- s1 Lady Vivienne Ashworth — the widow, freshly written out of the will
  s1: [
    { id: "s1_will",      category: "motive",        text: "You were written out of the will a fortnight ago. Were you told, or did you find out?" },
    { id: "s1_marriage",  category: "relationships", text: "When did your husband last speak to you as a husband?" },
    { id: "s1_maid",      category: "alibi",         text: "Your maid drew your bath at ten. Where was she before that?" },
    { id: "s1_veil",      category: "pressure",      text: "You dressed for mourning very quickly, my lady." },
    { id: "s1_vale",      category: "relationships", text: "How would you describe Mr. Vale's attentions to you?" },
    { id: "s1_debts",     category: "motive",        text: "Did you know the state of Edmund's finances?" },
    { id: "s1_children",  category: "relationships", text: "Where were the children kept this evening?" },
    { id: "s1_letters",   category: "motive",        text: "Was there correspondence between you and Mr. Vale?" },
    { id: "s1_solicitor", category: "motive",        text: "Had you spoken to a solicitor of your own?" },
    { id: "s1_scream",    category: "room",          text: "You said the screaming began. Whose scream was it?" },
    { id: "s1_hand",      category: "pressure",      requiresClue: "p1-1", text: "Which hand do you favour, my lady? Take the pen." },
    { id: "s1_garden",    category: "room",          requiresClue: "shared-1", text: "There is garden mud tracked to the body. Your hem is spotless — did you change?" },
    { id: "s1_cravat",    category: "weapon",        requiresClue: "shared-2", text: "He was strangled with something soft. You knew his wardrobe. What is missing from it?" },
    { id: "s1_lamp",      category: "room",          requiresClue: "shared-3", text: "Only the west wing was lit. Your chambers — which wing are they?" },
    { id: "s1_lounge",    category: "pressure",      requiresClue: "rh-p2",   text: "A footman places Mr. Vale in the lounge with you at the fatal hour. Was he?" },
  ],

  // --- s2 Dr. Aloysius Crane — physician; called away before the soup
  s2: [
    { id: "s2_sickbed",   category: "alibi",         text: "You were called to a sickbed. Whose, and who carried the message?" },
    { id: "s2_return",    category: "alibi",         text: "You never returned to the table. Why not?" },
    { id: "s2_health",    category: "motive",        text: "What was Lord Edmund's health, in truth?" },
    { id: "s2_laudanum",  category: "weapon",        text: "What is in your bag tonight, doctor?" },
    { id: "s2_body",      category: "weapon",        text: "You examined the body first. What did you find?" },
    { id: "s2_prescribe", category: "motive",        text: "Did you prescribe anything to anyone else under this roof?" },
    { id: "s2_fees",      category: "motive",        text: "Were your fees paid promptly?" },
    { id: "s2_secrets",   category: "relationships", text: "A physician learns things. What did you learn here that you have not said?" },
    { id: "s2_widow",     category: "relationships", text: "How is Lady Vivienne's health, since you attend her too?" },
    { id: "s2_time",      category: "room",          text: "You fixed the hour of death. How certain are you of it?" },
    { id: "s2_hands",     category: "pressure",      requiresClue: "p1-1", text: "The bruising falls left. You are right-handed — so demonstrate the grip for me." },
    { id: "s2_soup",      category: "alibi",         requiresClue: "p2-1", text: "The killer dined here. You left before the soup. Who saw you go?" },
    { id: "s2_marks",     category: "weapon",        requiresClue: "shared-2", text: "No blade, no shot, no poker. As a medical man — what leaves those marks?" },
    { id: "s2_mud",       category: "room",          requiresClue: "shared-1", text: "Your boots, doctor. Were they wet when you were fetched?" },
    { id: "s2_bolt",      category: "room",          requiresClue: "p2-4",   text: "The study was bolted from the corridor. Who in this house bolts it, and when?" },
  ],

  // --- s3 Mr. Sebastian Vale — the partner. The culprit. Lounge alibi, cravat.
  s3: [
    { id: "s3_ruin",      category: "motive",        text: "He meant to ruin you to save himself. Say it plainly." },
    { id: "s3_books",     category: "motive",        text: "Who else has seen the shipping accounts?" },
    { id: "s3_shouting",  category: "motive",        text: "The whole table heard you shouting at dinner. About what?" },
    { id: "s3_lounge",    category: "alibi",         text: "The lounge, all evening. Who was with you, and for how long?" },
    { id: "s3_fire",      category: "alibi",         text: "You say you never moved from the fire. Who tended it?" },
    { id: "s3_widow",     category: "relationships", text: "Lady Vivienne leans on you. Since when?" },
    { id: "s3_partner",   category: "relationships", text: "Were you friends, once, or only ever partners?" },
    { id: "s3_creditors", category: "motive",        text: "Who do you owe, and how badly?" },
    { id: "s3_dress",     category: "weapon",        text: "You dress carefully, Mr. Vale. What are you wearing at your throat?" },
    { id: "s3_stair",     category: "room",          text: "Do you know the servants' stair?" },
    { id: "s3_collar",    category: "pressure",      requiresClue: "shared-2", text: "Strangled with something soft. Your hand went to your own collar just now — why?" },
    { id: "s3_cravat",    category: "weapon",        requiresClue: "rh-p1",   text: "A maid says your silk cravat went back to the tailor weeks ago. Yet here it is not. Where is it?" },
    { id: "s3_west",      category: "room",          requiresClue: "shared-3", text: "The lounge is in the east. It was dark and locked. So where were you sitting?" },
    { id: "s3_boots",     category: "room",          requiresClue: "shared-1", text: "Garden mud, from the door to the body. Show me your boots." },
    { id: "s3_alone",     category: "pressure",      requiresClue: "rh-p2",   text: "Lady Vivienne does not remember you in the lounge at the fatal hour. Care to try again?" },
  ],

  // --- s4 Miss Cordelia Frost — governess, owed three months' wages
  s4: [
    { id: "s4_wages",     category: "motive",        text: "Three months' wages owed. How did you raise that with him?" },
    { id: "s4_nursery",   category: "alibi",         text: "You were reading to the children. From when, exactly, and until?" },
    { id: "s4_witness",   category: "alibi",         text: "Who else was in the nursery to speak for you?" },
    { id: "s4_observe",   category: "relationships", text: "You watch this house closely. What have you seen that troubles you?" },
    { id: "s4_position",  category: "motive",        text: "Was your position secure after tonight?" },
    { id: "s4_children",  category: "relationships", text: "What do the children know of their father's temper?" },
    { id: "s4_widow",     category: "relationships", text: "How does Lady Vivienne treat you?" },
    { id: "s4_letters",   category: "motive",        text: "Did you ever carry letters for anyone in this house?" },
    { id: "s4_leaving",   category: "motive",        text: "Had you made arrangements to leave Ravenhurst?" },
    { id: "s4_noise",     category: "room",          text: "The nursery is above. What travels up through this house at night?" },
    { id: "s4_hand",      category: "pressure",      requiresClue: "p1-1", text: "The killer was left-handed. Which hand holds your book, Miss Frost?" },
    { id: "s4_alibi2",    category: "alibi",         requiresClue: "p2-2", text: "Three witnesses put you upstairs from nine. Tell me who they are." },
    { id: "s4_vale",      category: "pressure",      requiresClue: "rh-p2",   text: "From the stairs you would see the lounge door. Was Mr. Vale behind it?" },
    { id: "s4_mud",       category: "room",          requiresClue: "shared-1", text: "Did anyone come in from the garden while you sat with the children?" },
    { id: "s4_dark",      category: "room",          requiresClue: "shared-3", text: "The centre of the house was dark. How did you light your way down?" },
  ],

  // --- s5 Capt. Reginald Hawk — sea captain, war wound, gambling debt
  s5: [
    { id: "s5_debt",      category: "motive",        text: "How much do you owe, Captain, and to whom?" },
    { id: "s5_forgiven",  category: "motive",        text: "A debt to a dead man — is that a debt forgiven?" },
    { id: "s5_docks",     category: "alibi",         text: "You were at the harbour. Until what hour, and who kept the log?" },
    { id: "s5_wound",     category: "alibi",         text: "Your wound — what can you not do with it?" },
    { id: "s5_war",       category: "relationships", text: "You served with Edmund, or under him?" },
    { id: "s5_ship",      category: "motive",        text: "Did Lord Edmund hold a share in your ship?" },
    { id: "s5_vale",      category: "relationships", text: "You keep your distance from Mr. Vale. Why?" },
    { id: "s5_drink",     category: "pressure",      text: "How much had you drunk before you came back to this house?" },
    { id: "s5_temper",    category: "motive",        text: "You have a reputation for your temper. Earned?" },
    { id: "s5_sea",       category: "weapon",        text: "A sailor knows knots and cord. Humour me — what would you use?" },
    { id: "s5_log",       category: "alibi",         requiresClue: "p1-2", text: "The harbourmaster's log has you at the docks past midnight. Who signed it?" },
    { id: "s5_stair",     category: "room",          requiresClue: "p2-3", text: "The killer used the servants' stair. Could you manage those steps tonight?" },
    { id: "s5_mud",       category: "room",          requiresClue: "shared-1", text: "You came in from the storm. Where did you leave your boots?" },
    { id: "s5_cord",      category: "weapon",        requiresClue: "shared-2", text: "No blade, no shot. You said cord. Say more." },
    { id: "s5_lounge",    category: "pressure",      requiresClue: "rh-p2",   text: "Did you pass the lounge when you returned? Who was in it?" },
  ],

  // --- s6 Mrs. Agnes Holloway — housekeeper, thirty years, misses nothing
  s6: [
    { id: "s6_years",     category: "relationships", text: "Thirty years in this house. What has changed in the last of them?" },
    { id: "s6_keys",      category: "room",          text: "Who else holds keys to the locked rooms?" },
    { id: "s6_staff",     category: "relationships", text: "Which of your staff were in the house tonight?" },
    { id: "s6_dinner",    category: "alibi",         text: "Who sat down to dinner, and who did not?" },
    { id: "s6_cleaning",  category: "room",          text: "When were the floors last done?" },
    { id: "s6_gossip",    category: "relationships", text: "What do the servants say about Mr. Vale and her ladyship?" },
    { id: "s6_wages",     category: "motive",        text: "Was anyone in this house unpaid?" },
    { id: "s6_laundry",   category: "weapon",        text: "What passes through your laundry from the gentlemen's rooms?" },
    { id: "s6_doors",     category: "room",          text: "Which doors are bolted at night, and by whom?" },
    { id: "s6_edmund",    category: "relationships", text: "What manner of master was he, honestly?" },
    { id: "s6_mud",       category: "room",          requiresClue: "shared-1", text: "Mud in your hall, Mrs. Holloway. You would have had it scrubbed. When was it tracked?" },
    { id: "s6_missing",   category: "weapon",        requiresClue: "shared-2", text: "Something soft, and it is not on the body. What is missing from this house?" },
    { id: "s6_lamps",     category: "room",          requiresClue: "shared-3", text: "You put out the lamps. Why was the west wing still burning?" },
    { id: "s6_bolt",      category: "room",          requiresClue: "p2-4",   text: "The study was bolted from the corridor all evening. Who drew that bolt?" },
    { id: "s6_tailor",    category: "weapon",        requiresClue: "rh-p1",   text: "A maid says Mr. Vale's cravat went to the tailor. Did it leave this house?" },
  ],
};

export const CORE_QUESTION_IDS = CORE_QUESTIONS.map((q) => q.id);

// The full list a given suspect can be asked: the shared spine plus their own.
export function questionsFor(suspectId) {
  return [...CORE_QUESTIONS, ...(SUSPECT_QUESTIONS[suspectId] || [])];
}
export function questionIdsFor(suspectId) {
  return questionsFor(suspectId).map((q) => q.id);
}
export function findQuestion(suspectId, questionId) {
  return questionsFor(suspectId).find((q) => q.id === questionId) || null;
}
// Core questions consume the per-suspect budget; clue-unlocked ones are free.
export const isFreeQuestion = (q) => Boolean(q && q.requiresClue);

export const QUESTION_CATEGORIES = ["alibi", "motive", "relationships", "room", "weapon", "pressure"];
export const CATEGORY_LABEL = {
  alibi: "Alibi", motive: "Motive", relationships: "The Household",
  room: "The House", weapon: "The Weapon", pressure: "Press Them",
};

export const TOTAL_QUESTION_COUNT =
  CORE_QUESTIONS.length + Object.values(SUSPECT_QUESTIONS).reduce((n, l) => n + l.length, 0);
