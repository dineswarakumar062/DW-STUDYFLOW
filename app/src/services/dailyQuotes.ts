export const CALM_QUOTES: string[] = [
  "Rest is part of the work, not a break from it.",
  "One focused session is enough for today.",
  "You don't have to finish everything to have done well.",
  "Slow breaths. The next step will still be there.",
  "Progress often looks like a quiet, steady afternoon.",
  "Put the phone down. The page will wait.",
  "Be as patient with your learning as you would be with a friend.",
  "A calm mind learns more than a rushed one.",
  "Stepping away is a way of coming back stronger.",
  "Today's effort counts, even if it feels small.",
  "Drink some water. Stretch your shoulders. Then begin again.",
  "You are allowed to take things one page at a time.",
  "Not every hour needs to be productive to be worthwhile.",
  "Your attention is valuable. Give it to what matters most.",
  "Let the evening be quiet. Tomorrow you can pick up the thread.",
  "Small, steady steps beat a single exhausting push.",
  "Breathe in for four, out for six. Notice where you are.",
  "It is okay to be unfinished today.",
  "Care for your focus the way you would care for a plant: regularly and gently.",
  "Enough is enough for today. Rest well.",
];

// Returns the same two quotes for the whole local day.
// Quotes come in pairs, so each day shows the next pair in the list.
export function getDailyQuotes(date: Date = new Date(), count = 2): string[] {
  const start = new Date(date.getFullYear(), 0, 0);
  const dayOfYear = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  const n = CALM_QUOTES.length;
  return Array.from({ length: count }, (_, i) =>
    CALM_QUOTES[(dayOfYear * count + i) % n]
  );
}
