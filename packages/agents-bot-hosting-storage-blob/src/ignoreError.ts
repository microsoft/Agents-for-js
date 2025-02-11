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
