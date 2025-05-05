/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * The converter converts objects from one type to another.
 *
 * @typeParam From - The type of the input value to be converted.
 * @typeParam To - The type of the output value after conversion.
 */
export interface Converter<From = unknown, To = unknown> {
  convert(value: From | To): To;
}

/**
 * A factory type for creating instances of a `Converter`.
 *
 * @typeParam From - The type of the input value to be converted.
 * @typeParam To - The type of the output value after conversion.
 */
export type ConverterFactory<From = unknown, To = unknown> = {
  new (...args: unknown[]): Converter<From, To>;
}
