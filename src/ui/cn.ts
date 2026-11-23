export type ClassValue = string | false | null | undefined | 0;

/** Joins class names, skipping falsy values. (No tailwind-merge: keep variant classes non-overlapping.) */
export function cn(...parts: ClassValue[]): string {
  return parts.filter(Boolean).join(" ");
}
