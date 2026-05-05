import {
  TurnContext
} from '@microsoft/agents-hosting'

import {
  TeamsInfo
} from '@microsoft/agents-hosting-extensions-teams'

import {
  PagedMembersResult,
  TeamsChannelAccount,
} from '@microsoft/teams.api'

export async function getTeamMembers (context: TurnContext) : Promise<TeamsChannelAccount[]> {
  const PAGE_SIZE = 100
  const pages: PagedMembersResult[] = [await TeamsInfo.getPagedMembers(context, PAGE_SIZE)]
  let continuationToken: string | undefined = pages[0].continuationToken
  while (continuationToken) {
    const nextPage = await TeamsInfo.getPagedMembers(context, PAGE_SIZE, continuationToken)
    continuationToken = nextPage.continuationToken
    pages.push(nextPage)
  }

  return pages.flatMap(page => page.members)
}
