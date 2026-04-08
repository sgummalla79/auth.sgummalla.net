/**
 * Result<T, E> — a discriminated union representing either success (Ok) or failure (Err).
 *
 * Every fallible operation in this codebase returns a Result.
 * Callers are forced by the type system to handle both paths.
 *
 * Usage:
 *   const result = await findUser(id)
 *   if (isErr(result)) return reply.status(404).send(result.error)
 *   doSomethingWith(result.value)
 */

export type Result<T, E = unknown> = Ok<T, E> | Err<T, E>

// ─── Ok ──────────────────────────────────────────────────────────────────────

export class Ok<T, E> {
  readonly _tag = 'Ok' as const
  readonly isOk = true as const
  readonly isErr = false as const

  constructor(public readonly value: T) {}

  map<U>(fn: (value: T) => U): Result<U, E> {
    return ok(fn(this.value))
  }

  mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return ok(this.value)
  }

  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return fn(this.value)
  }

  unwrapOr(_fallback: T): T {
    return this.value
  }

  unwrap(): T {
    return this.value
  }
}

// ─── Err ─────────────────────────────────────────────────────────────────────

export class Err<T, E> {
  readonly _tag = 'Err' as const
  readonly isOk = false as const
  readonly isErr = true as const

  constructor(public readonly error: E) {}

  map<U>(_fn: (value: T) => U): Result<U, E> {
    return err(this.error)
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return err(fn(this.error))
  }

  andThen<U>(_fn: (value: T) => Result<U, E>): Result<U, E> {
    return err(this.error)
  }

  unwrapOr(fallback: T): T {
    return fallback
  }

  unwrap(): never {
    throw new Error(`Called unwrap() on an Err value: ${String(this.error)}`)
  }
}

// ─── Constructors ─────────────────────────────────────────────────────────────

export const ok = <T, E = never>(value: T): Result<T, E> => new Ok<T, E>(value)

export const err = <T = never, E = unknown>(error: E): Result<T, E> => new Err<T, E>(error)

// ─── Type guards ──────────────────────────────────────────────────────────────

export function isOk<T, E>(result: Result<T, E>): result is Ok<T, E> {
  return result._tag === 'Ok'
}

export function isErr<T, E>(result: Result<T, E>): result is Err<T, E> {
  return result._tag === 'Err'
}

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Wraps a promise that may throw into a Result.
 * Use at infrastructure boundaries (DB calls, HTTP calls) to convert
 * thrown exceptions into typed Err values.
 */
export async function fromPromise<T, E = unknown>(
  promise: Promise<T>,
  mapError: (e: unknown) => E,
): Promise<Result<T, E>> {
  try {
    return ok(await promise)
  } catch (e) {
    return err(mapError(e))
  }
}

/**
 * Collects an array of Results into a Result of an array.
 * Short-circuits on the first Err.
 */
export function collect<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const result of results) {
    if (result._tag === 'Err') return err(result.error)
    values.push(result.value)
  }
  return ok(values)
}