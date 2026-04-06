export type Result<T, E = unknown> = Ok<T, E> | Err<T, E>

export class Ok<T, E = never> {
  readonly _tag = 'ok' as const
  constructor(public readonly value: T) {}
  isOk(): this is Ok<T, E> { return true }
  isErr(): this is Err<T, E> { return false }
  map<U>(fn: (value: T) => U): Result<U, E> { return ok(fn(this.value)) }
  mapErr<F>(_fn: (error: E) => F): Result<T, F> { return ok(this.value) }
  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> { return fn(this.value) }
  unwrapOr(_fallback: T): T { return this.value }
  unwrap(): T { return this.value }
}

export class Err<T = never, E = unknown> {
  readonly _tag = 'err' as const
  constructor(public readonly error: E) {}
  isOk(): this is Ok<T, E> { return false }
  isErr(): this is Err<T, E> { return true }
  map<U>(_fn: (value: T) => U): Result<U, E> { return err(this.error) }
  mapErr<F>(fn: (error: E) => F): Result<T, F> { return err(fn(this.error)) }
  andThen<U>(_fn: (value: T) => Result<U, E>): Result<U, E> { return err(this.error) }
  unwrapOr(fallback: T): T { return fallback }
  unwrap(): never { throw new Error(`Unwrap called on Err: ${String(this.error)}`) }
}

export const ok = <T, E = never>(value: T): Result<T, E> => new Ok<T, E>(value)
export const err = <T = never, E = unknown>(error: E): Result<T, E> => new Err<T, E>(error)

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

export function collect<T, E>(results: Result<T, E>[]): Result<T[], E> {
  const values: T[] = []
  for (const result of results) {
    if (result.isErr()) return err(result.error)
    values.push(result.value)
  }
  return ok(values)
}