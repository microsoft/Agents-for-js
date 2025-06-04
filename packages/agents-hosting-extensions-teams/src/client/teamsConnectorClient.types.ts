/**
 * Copyright(c) Microsoft Corporation.All rights reserved.
 * Licensed under the MIT License.
 */

import { TeamsChannelAccount } from '../activity-extensions/teamsChannelAccount'

/**
 * Represents details of a Microsoft Teams team.
 */
export interface TeamDetails {
  /**
     * Unique identifier of the team.
     */
  id?: string;
  /**
     * Name of the team.
     */
  name?: string;
  /**
     * Azure Active Directory group ID of the team.
     */
  aadGroupId?: string;
  /**
     * Number of channels in the team.
     */
  channelCount?: number;
  /**
     * Number of members in the team.
     */
  memberCount?: number;
  /**
     * Type of the team.
     */
  type?: string;
}

/**
 * Represents a member in a Microsoft Teams team.
 */
export type TeamsMember = {
  /**
     * Unique identifier of the member.
     */
  id: string;
}

/**
 * Represents a paged result of Teams members.
 */
export interface TeamsPagedMembersResult {
  /**
   * Continuation token for fetching the next page of results.
   */
  continuationToken: string;
  /**
   * List of Teams channel accounts.
   */
  members: TeamsChannelAccount[];
}

/**
 * Represents a failed entry in a batch operation.
 */
export interface BatchFailedEntry {
  /**
     * Unique identifier of the failed entry.
     */
  id: string;
  /**
     * Error message associated with the failed entry.
     */
  error: string;
}

/**
 * Represents the response for failed entries in a batch operation.
 */
export interface BatchFailedEntriesResponse {
  /**
   * A token to retrieve the next page of results.
   */
  continuationToken: string;
  /**
   * A list of failed entry responses.
   */
  failedEntryResponses: BatchFailedEntry[];
}

/**
 * Represents the response of a batch operation.
 */
export interface BatchOperationResponse {
  /**
     * Unique identifier of the batch operation.
     */
  operationId: string;
}

/**
 * Represents the state of a batch operation.
 */
export interface BatchOperationStateResponse {
  /**
     * The state of the batch operation.
     */
  state: string;
  /**
     * A map of status codes to their counts.
     */
  statusMap: Record<number, number>;
  /**
     * The retry-after date for the batch operation.
     */
  retryAfter?: Date;
  /**
     * The total number of entries in the batch operation.
     */
  totalEntriesCount: number;
}

/**
 * Represents the response from a cancel operation.
 */
export type CancelOperationResponse = {
  /**
     * The response object.
     */
  _response: Response & {
    /**
       * The response body as text.
       */
    bodyAsText: string;
    /**
       * The parsed response body.
       */
    parsedBody: {};
  };
}

/**
 * Represents a response containing a resource ID.
 */
export interface ResourceResponse {
  /**
     * Unique identifier of the resource.
     */
  id: string;
}

/**
 * Represents a response from a batch operation in Teams.
 */
export type TeamsBatchOperationResponse = BatchOperationResponse & {
  /**
     * The raw response object.
     */
  _response: Response & {
    /**
       * The response body as text.
       */
    bodyAsText: string;
    /**
       * The parsed response body.
       */
    parsedBody: BatchOperationResponse | {};
  }
}
