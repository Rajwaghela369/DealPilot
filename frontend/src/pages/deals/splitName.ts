/**
 * Split a transcript speaker label into first and last name.
 *
 * Deliberately crude, and prefilled rather than assumed: "Dana Whitfield"
 * splits cleanly, "Dana (procurement)" does not, and a single-word label has
 * no surname at all. The point is to save typing in the common case while
 * leaving both fields editable -- guessing silently would create a contact
 * surnamed "(procurement)".
 *
 * In its own module so `ResolveDialog.tsx` exports only its component, and so
 * this is unit-testable without rendering a drawer.
 */
export function splitName(raw: string): { first: string; last: string } {
  // Drop a trailing parenthetical role, which speaker labels often carry.
  const cleaned = raw.replace(/\s*\([^)]*\)\s*$/, '').trim()
  const parts = cleaned.split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { first: '', last: '' }
  if (parts.length === 1) return { first: parts[0], last: '' }
  return { first: parts[0], last: parts.slice(1).join(' ') }
}
