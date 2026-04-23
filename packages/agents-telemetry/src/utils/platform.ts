/**
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License.
 */

/**
 * Indicates whether the current runtime looks like a browser with DOM access.
 */
export const isBrowser = typeof window !== 'undefined' && typeof window.document !== 'undefined'
