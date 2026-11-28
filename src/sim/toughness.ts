import type { DefenseLevel, PlacedDefense } from './layout';

/** Rough base strength: each tower and mine counts its level; the home level counts double. */
export function baseRating(base: { readonly defenses: readonly PlacedDefense[]; readonly homeLevel: DefenseLevel | number }): number {
  return base.defenses.reduce((sum, d) => sum + d.level, 0) + base.homeLevel * 2;
}

/** Ratings at or below each of these get 1, 2, 3 and 4 stars; anything stronger gets 5. */
const STAR_LIMITS = [6, 14, 24, 38] as const;

/**
 * How tough a base is to raid, 1 to 5 stars. A new captain's base (one level-1 tower) is 1 star;
 * a full level-3 base with every slot at level 3 is 5.
 */
export function toughnessStars(rating: number): number {
  const r = Number.isFinite(rating) ? rating : 0;
  const below = STAR_LIMITS.findIndex((limit) => r <= limit);
  return below === -1 ? 5 : below + 1;
}

/** A haunted fort's toughness: one star per fort level. */
export function fortToughness(level: number): number {
  return Math.min(5, Math.max(1, Math.round(Number.isFinite(level) ? level : 1)));
}

/** "★★★☆☆" for 3 of 5. */
export function starText(stars: number): string {
  const n = Math.min(5, Math.max(0, Math.round(stars)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
