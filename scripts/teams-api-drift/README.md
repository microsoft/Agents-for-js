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
