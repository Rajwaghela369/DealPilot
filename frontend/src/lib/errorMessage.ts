import { ApiError, NetworkError } from './api'

/**
 * Turn any thrown value into a sentence.
 *
 * `ApiError.message` is already one -- `api.ts` flattens both of this
 * backend's `detail` shapes into it, and for an `HTTPException` that string is
 * the backend's own actionable message, which the plan is explicit about not
 * replacing (4.2). So the real work here is only the cases where there is no
 * message to show.
 *
 * In `lib/` rather than beside `ErrorState`, because it is a plain function
 * and a module that exports both a component and a helper breaks fast refresh
 * for the component.
 */
export function errorMessage(error: unknown): string {
  if (error instanceof NetworkError) return error.message
  if (error instanceof ApiError) return error.message
  if (error instanceof Error && error.message) return error.message
  return 'Something went wrong.'
}
