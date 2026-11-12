# Teams API drift metadata

The Teams API drift checks use two independent metadata documents for
`packages/agents-hosting-extensions-msteams`:

- [`teams-api-usage-manifest.json`](../../packages/agents-hosting-extensions-msteams/teams-api-usage-manifest.json)
  records concrete consumption of
  `@microsoft/teams.api`. Each usage identifies an upstream symbol, its source
  files, how it is used, any statically known members, and whether the type is
  exposed through the package's public API.
- [`config/teams-capabilities.yaml`](../../packages/agents-hosting-extensions-msteams/config/teams-capabilities.yaml)
  maps source ownership to Teams feature
  areas. Each capability records its owner paths, upstream API areas, and the
  adoption policy used to classify upstream additions. Descriptions provide
  additional context for maintainers and automated review.

Repo Doctor validates the current contents of both documents. When Git history
is available, it also checks whether relevant source changes received a
document-specific metadata review.

## Which document should change?

Update `teams-api-usage-manifest.json` when a source change affects a concrete
Teams API usage fact, including:

- adding or removing a direct import from `@microsoft/teams.api`;
- moving a usage to another source file or adding another file that uses it;
- reading, writing, calling, or validating a different upstream member;
- exposing an upstream type through the package's public exports, or making a
  previously public type internal; or
- changing the declared `@microsoft/teams.api` dependency version.

Update `teams-capabilities.yaml` when a source change affects feature ownership
or compatibility policy, including:

- adding, deleting, renaming, or moving source paths covered by a capability;
- changing which capability owns a source path;
- changing the Teams API areas imported by a capability-owned file; or
- changing a capability's `upstreamAreas` or `adoptionPolicy`.

An ordinary internal refactor can still require review when static analysis
cannot prove that metadata is unaffected. Examples include dynamic property
access and schema-based validation. In that case, use the acknowledgment for
the document named by the Repo Doctor finding.

## Source review acknowledgments

Use `sourceReview` only after checking the relevant source change and
confirming that the document's substantive metadata remains accurate. An
acknowledgment does not suppress provable errors such as a missing import,
missing file, stale dependency version, invalid owner pattern, missing static
member, or incorrect public exposure.

The acknowledgment is document-specific. A capability acknowledgment cannot
satisfy a usage-manifest review, and a usage acknowledgment cannot satisfy a
capability review.

For `teams-api-usage-manifest.json`, add or update this top-level property:

```json
{
  "usages": [],
  "sourceReview": {
    "outcome": "no-usage-metadata-change",
    "reason": "Explain specifically why the changed source does not alter Teams API usage metadata."
  }
}
```

Keep the existing `usages` entries; the empty array above only shows where the
top-level property belongs.

For `config/teams-capabilities.yaml`, add or update this top-level section:

```yaml
sourceReview:
  outcome: "no-capability-metadata-change"
  reason: "Explain specifically why the changed source does not alter capability ownership or upstream areas."
```

The record must differ from the version at the Git base. If `sourceReview`
already exists, update its reason for the current change; copying or retaining
an unchanged acknowledgment does not pass. The reason must be non-empty and
specific to the source change.

The acknowledgment must also be at least as recent as the source change. In a
commit series, commit it with or after the relevant source change. While
testing local working-tree changes, edit the corresponding metadata document
in the working tree as well. Whitespace-only metadata changes do not count.

Prefer updating the substantive metadata whenever the change can be described
accurately. The acknowledgment is for a reviewed non-impact conclusion, not a
general waiver.

## Reviewed compatibility changes

Record an accepted blocking or required upstream change in the usage manifest's
optional `compatibilityReviews` array. This follows the .NET counterpart's review
format, without its .NET-specific `targetFrameworks` field:

```json
{
  "compatibilityReviews": [
    {
      "fromVersion": "2.1.0",
      "toVersion": "2.2.0",
      "upstreamSymbol": "IMeetingStartEventActivity",
      "member": "value",
      "kind": "property-type-changed",
      "before": "{ Id: string; MeetingType: string; JoinUrl: string; Title: string; StartTime: Date; }",
      "after": "{ Id: string; MeetingType: string; JoinUrl?: string | null; Title: string; StartTime: Date; }",
      "reason": "Reviewed the public event-type correction. Meeting.onStart passes the payload through; meeting.test.ts covers an omitted JoinUrl and teamsApi.contract.ts checks the optional/nullable type. The migration is documented and the public API baseline updated."
    }
  ]
}
```

Keep the manifest's other fields and existing usages. Copy the exact symbol,
member, kind, and signatures from `raw-api-diff.json`. Set `member`, `before`, or
`after` to `null` when the corresponding raw field is absent. All review fields
are required; versions, symbol, kind, and reason must be non-empty strings.
Malformed reviews fail classification.

A review applies only when the version pair and every change field match
exactly. Finding IDs are deliberately excluded because they can change when
unrelated upstream changes are added. Historical reviews may remain in the
manifest; they do not approve different versions or signatures.

A match changes a blocking or required finding to `no-action` with category
`reviewed-compatible`, adds `compatibility-review` evidence, and includes the
reason in the deterministic report's **Reviewed compatibility changes** section.
The raw API diff and reviewed finding remain available for auditing. The
`--fail-on-drift` gate still fails for any unmatched blocking or required finding.
Reviews do not suppress advisory feature reviews or public API report findings.

Use the reason to identify the reviewed behavior, supporting tests, and any
intentional public contract change and migration guidance. This is separate from
`sourceReview`, which only acknowledges metadata maintenance. Compatibility
reviews do not bypass metadata validation, builds, contract tests, runtime tests,
or the normal review of public API baselines.

## Run the checks

From the repository root, run:

```shell
npm run repo:doctor
```

To compare explicitly against a pull request target while testing locally:

```shell
npm run repo:doctor -- --base-ref main
```

Repo Doctor includes committed, staged, unstaged, and untracked changes. If it
is run outside a Git checkout, current-state validation still runs, but the
change-review rules are skipped.
