/**
 * What a sentence stating the years of experience may say (#49, pages-9 and live-14), shared by the
 * unit tests and the e2e row in `e2e/seo-surface.spec.ts` so both read the copy the same way.
 *
 * The total is the whole career, and the AI work is its most recent part (the About timeline starts
 * it in 2025), so the clause that states the total must not name AI work. A clause is the text
 * between two of `, . ; : ! ?` or a dash: the Person description and the /about summary both put
 * the recent work after a comma ("… in software engineering, now building AI-native systems …"),
 * and that is the separation this checks for. Its limit: a list that runs on past a comma ("13
 * years in TypeScript, AI and cloud") puts the AI word in the next clause, where this does not look.
 */

/** A count of years as the copy prints it: `13 years`, `10+ years`, `13 yrs`. */
const YEARS = /\b(\d+)\+? (?:years|yrs)\b/gi;

/** Words that make a clause about AI work, wherever they sit relative to the figure. */
const AI_WORDS =
  /\bAI\b|\bA\.I\.|\bLLMs?\b|\bagents?\b|\bagentic\b|\bmachine[- ]learning\b|\bML\b|\bGPT\b|\bgenerative\b/i;

/** Every figure the text states as a count of years, in order. */
export function yearsFigures(text: string): number[] {
  return [...text.matchAll(YEARS)].map(([, figure]) => Number(figure));
}

/** The clauses of `text` that state a count of years, trimmed. */
export function yearsClauses(text: string): string[] {
  return text
    .split(/[,.;:!?–—]/)
    .map((clause) => clause.trim())
    .filter((clause) => yearsFigures(clause).length > 0);
}

/** The clauses that state a count of years and name AI work in the same breath. */
export function yearsClausesAboutAi(text: string): string[] {
  return yearsClauses(text).filter((clause) => AI_WORDS.test(clause));
}
