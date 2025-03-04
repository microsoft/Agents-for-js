/**
 * A function type that determines whether an error should be ignored.
 * @param err - The error to check.
 * @returns A boolean indicating whether the error should be ignored.
 */
export type IgnoreError = (err: Error) => boolean

export async function ignoreError<T> (promise: Promise<T>, ignore: IgnoreError): Promise<T | null> {
  try {
    return await promise
  } catch (err: any) {
    if (!ignore(err)) {
      throw err
    } else {
      return null
    }
  }
}

/**
 * An interface representing an error with an optional status code.
 */
interface ErrorWithStatusCode {
  statusCode?: number;
}

export function isStatusCodeError (...codes: number[]): IgnoreError {
  const ignoredCodes = new Set(codes)
  return function (err) {
    return (
      typeof (err as ErrorWithStatusCode).statusCode === 'number' &&
            ignoredCodes.has((err as ErrorWithStatusCode).statusCode!)
    )
  }
}
