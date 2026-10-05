/**
 * Drop one key from a record of field errors, leaving the object untouched
 * when the key is not there.
 *
 * Returning the same reference when nothing changed is the point: these
 * setters run on every keystroke, and a fresh object each time would
 * re-render the form for a field that had no error to clear.
 *
 * Written as a function rather than inline rest-destructuring
 * (`({[key]: _drop, ...rest}) => rest`) because that binds a variable solely
 * to discard it, which the lint rules reject and which reads as a mistake.
 */
export function clearKey<T extends Record<string, unknown>>(record: T, key: keyof T | string): T {
  if (!(key in record)) return record
  const next = { ...record }
  delete next[key as keyof T]
  return next
}
