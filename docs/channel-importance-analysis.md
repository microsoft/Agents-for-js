# Channel Analysis Report for microsoft/Agents-for-js

**Analysis Date:** 2026-01-31

## Executive Summary

- **Total Issues Analyzed:** 249
- **Open Issues:** 49
- **Closed Issues:** 200

## Channel Importance Analysis

This analysis examines mentions of various channels in issue titles and descriptions to understand their relative importance in the Agents-for-js repository.

### Channel Mentions Summary

| Rank | Channel | Mentions | % of Total Issues |
|------|---------|----------|------------------|
| 1 | **copilot** | 41 | 16.47% |
| 2 | **msteams** | 27 | 10.84% |
| 3 | **webchat** | 22 | 8.84% |
| 4 | **email** | 3 | 1.20% |
| 5 | **slack** | 1 | 0.40% |

### Key Findings

1. **copilot** is the most mentioned channel with 41 mentions (16.47% of all issues)
   - This confirms that Microsoft Teams/Copilot is a primary focus channel for this SDK
2. **msteams** is the second most mentioned with 27 mentions
3. **Teams-related issues (msteams + copilot)** account for 72.3% of all channel-related issues

### Microsoft Teams (msteams) Analysis

**Total msteams-related issues:** 27

- Open: 6
- Closed: 21

#### Sample msteams Issues:

- [#892](https://github.com/microsoft/Agents-for-js/issues/892) - [BUG] TeamsInfo cannot find ConnectorClient (OPEN)
- [#890](https://github.com/microsoft/Agents-for-js/issues/890) - TeamsInfo.getTeamChannels(context, teamId) doesn't return the channel details (OPEN)
- [#805](https://github.com/microsoft/Agents-for-js/issues/805) - Link Unfurling Not Working in Outlook with Agent SDK (Python & Node.js) (OPEN)
- [#584](https://github.com/microsoft/Agents-for-js/issues/584) - MS Teams deduplication on multiple clients (OPEN)
- [#538](https://github.com/microsoft/Agents-for-js/issues/538) - Attachments Error in Sample Basic Bot from Microsoft 365 Agents Toolkit VS Code extension (OPEN)
- [#488](https://github.com/microsoft/Agents-for-js/issues/488) - Support for bots and agents in shared channels (OPEN)
- [#829](https://github.com/microsoft/Agents-for-js/issues/829) - Bug: SSO/Consent fails in M365 Copilot within Teams only (CLOSED)
- [#770](https://github.com/microsoft/Agents-for-js/issues/770) - Agentic Requests + teams Channel do not support streaming responses at this time. (CLOSED)
- [#760](https://github.com/microsoft/Agents-for-js/issues/760) - Messaging Extension Link Unfurling card not displayed in Teams when using Agents SDK (@microsoft/agents-hosting-extensions-teams) (CLOSED)
- [#756](https://github.com/microsoft/Agents-for-js/issues/756) - TeamsInfo.getMember throws an error code 400 (CLOSED)

*... and 17 more issues*

### Other Channels

#### webchat
**Mentions:** 22

Sample issues:
- [#881](https://github.com/microsoft/Agents-for-js/issues/881) - [Bug] "Analyzing data..." (Typing activity) persists and does not disappear when using AI Builder topics (OPEN)
- [#832](https://github.com/microsoft/Agents-for-js/issues/832) - When using nodejs/copilotstudio-webclient to connect to Copilot Studio, the prompt "Do you allow AI suggestions to use your data?" appears, but the options cannot be clicked. How can this issue be resolved? (OPEN)
- [#602](https://github.com/microsoft/Agents-for-js/issues/602) - Message and file upload failures and Inconsistent responses (OPEN)

*... and 19 more*

#### email
**Mentions:** 3

Issues:
- [#805](https://github.com/microsoft/Agents-for-js/issues/805) - Link Unfurling Not Working in Outlook with Agent SDK (Python & Node.js) (OPEN)
- [#488](https://github.com/microsoft/Agents-for-js/issues/488) - Support for bots and agents in shared channels (OPEN)
- [#500](https://github.com/microsoft/Agents-for-js/issues/500) - Support of agents-hosting-extensions-teams package (CLOSED)

#### slack
**Mentions:** 1

Issues:
- [#193](https://github.com/microsoft/Agents-for-js/issues/193) - Support the extension pattern (CLOSED)

## Conclusions

Based on the analysis of 249 issues in the microsoft/Agents-for-js repository:

1. **Microsoft Teams (including msteams and copilot) is highly important**, representing 72.3% of all channel-related discussions
   - msteams specifically: 27 issues
   - Copilot (Teams-based): 41 issues
2. The SDK appears to be **primarily** focused on Teams/Copilot integration
3. Other channels combined have 26 mentions compared to Teams' 68

### Importance Ranking

Based on issue mentions, the channels rank as follows:

1. **copilot**: 41 issues (16.47% of all issues)
2. **msteams**: 27 issues (10.84% of all issues)
3. **webchat**: 22 issues (8.84% of all issues)
4. **email**: 3 issues (1.20% of all issues)
5. **slack**: 1 issue (0.40% of all issues)

## Methodology

This analysis was performed by:
1. Fetching all open and closed issues from the microsoft/Agents-for-js repository using the GitHub API
2. Searching issue titles and descriptions for channel-specific keywords
3. Categorizing and counting mentions of each channel
4. Calculating percentages and relative importance

### Channel Keywords Used

- **msteams**: msteams, ms teams, microsoft teams, teams channel, teams bot, teamsinfo, teams ai
- **copilot**: copilot, m365 copilot, microsoft 365 copilot
- **webchat**: webchat, web chat, directline
- **slack**: slack
- **telegram**: telegram
- **facebook**: facebook, fb messenger
- **discord**: discord
- **email**: email
- **sms**: sms
- **alexa**: alexa

## Summary

The analysis clearly demonstrates that **Microsoft Teams (msteams) is critically important** to the Agents-for-js SDK:

- **Combined Teams presence (msteams + copilot)**: 68 out of 94 channel mentions (72.3%)
- **msteams alone**: Ranks 2nd with 27 issues (10.84% of all issues)
- **copilot (Teams-based)**: Ranks 1st with 41 issues (16.47% of all issues)

The msteams channel is approximately:
- **27x more important** than Slack (27 vs 1 mentions)
- **9x more important** than Email (27 vs 3 mentions)
- **1.2x more important** than Webchat (27 vs 22 mentions)

When including Copilot (which runs on Teams), Teams-related channels represent over **72%** of all channel-specific discussions in the repository, confirming that Microsoft Teams is by far the most important channel for this SDK.
