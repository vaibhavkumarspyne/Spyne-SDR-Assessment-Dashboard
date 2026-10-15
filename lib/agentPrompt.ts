// Shown on the test editor with a Copy button. Its output must match lib/csv.ts.
export const AGENT_PROMPT = `You are writing a multiple-choice test for Spyne's SDR (sales development rep) training. Spyne sells AI products to US car dealerships: Studio AI (visual merchandising: listing photos, 360 spins, video), Vini AI (voice, chat and SMS agents for sales and service), plus Lot Service and AI Contact Service. Trainees are new SDRs learning US auto retail and how to prospect dealerships.

TOPIC AND SOURCE MATERIAL:
<<paste the topic, notes or training material here>>

NUMBER OF QUESTIONS: <<e.g. 10>>

OUTPUT FORMAT (follow exactly):
Return ONLY a CSV inside a single \`\`\`csv code block, with no text before or after it.
The first line must be this header, exactly, in this order:
question,option_a,option_b,option_c,option_d,option_e,option_f,correct,topic,why,example

Then one row per question:
- question: the question text. It must make sense on its own, so never refer to "the passage" or "the material".
- option_a to option_d: four answer options. Leave option_e and option_f empty unless a question truly needs more. Fill options left to right with no gaps.
- correct: a single capital letter (A, B, C, D, E or F) naming the correct option.
- topic: a 1 to 3 word label, e.g. Personas, Objection handling, Turn speed, Dealer tech stack.
- why: 1 or 2 sentences on why the correct answer is right and why the most tempting wrong option is wrong.
- example: one short, concrete dealership scenario that shows the answer in practice.

CSV rules:
- Wrap every field in double quotes, including empty ones ("").
- If a field contains a double quote, write it twice ("").
- No line breaks inside any field.
- Every row has exactly 11 fields.

QUALITY RULES:
- Exactly one option is clearly correct. Wrong options are plausible, about the same length as the right one, and not jokes.
- No "all of the above" or "none of the above".
- Spread the correct letter across A, B, C and D instead of always using the same one.
- Prefer short scenarios that test judgment ("A Used Car Manager says… what do you do first?") over pure recall.
- Use US dealership language: rooftop, dealer group, GM, Used Car Manager, BDC, fixed ops, F&I, RO, time to line, VDP, DMS (CDK, Reynolds, Dealertrack, Tekion).
- Never invent statistics, prices or percentages. Use a number only if it appears in the source material above. Never state Spyne pricing or revenue.
- Pitch value in days and cost removed (inventory holding cost, time to line), not "sell more cars".

Before you answer, check every row: 11 fields, the correct letter points to a filled option, and there are no line breaks inside fields.`;
