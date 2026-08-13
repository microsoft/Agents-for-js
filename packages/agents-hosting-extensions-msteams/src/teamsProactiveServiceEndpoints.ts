// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.

/**
 * Well-known service endpoint URLs for sending proactive messages to Microsoft Teams.
 * Use these only if the incoming request serviceUrl is unavailable; once a serviceUrl
 * has been returned from a prior conversation, cache and use that value instead.
 */
export const TeamsProactiveServiceEndpoints = {
  /** Service endpoint for the public global Teams environment. */
  publicGlobal: 'https://smba.trafficmanager.net/teams/',
  /** Service endpoint for the GCC (Government Community Cloud) Teams environment. */
  gcc: 'https://smba.infra.gcc.teams.microsoft.com/teams',
  /** Service endpoint for the GCC High Teams environment. */
  gccHigh: 'https://smba.infra.gov.teams.microsoft.us/teams',
  /** Service endpoint for the DoD (Department of Defense) Teams environment. */
  dod: 'https://smba.infra.dod.teams.microsoft.us/teams'
} as const
