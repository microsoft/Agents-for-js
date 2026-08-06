# teams.api drift report task

This prompt defines the bounded advisory report generated after deterministic drift analysis.
It receives only the runtime context appended by the workflow and must not inspect repository state.

Generate an advisory maintainer report from the runtime context appended to this
prompt. The runtime context is the only authoritative input. Do not inspect the
repository, invoke tools, invent findings, or infer changes that are not supported
by the supplied artifacts and source slices.

Return Markdown only. Do not wrap the report in a code fence or add a preamble.
The first line must be exactly:

# teams.api Impact Report

Use each of these level-two headings exactly once and in this order:

## Summary

## Compatibility breaks

## Required adaptations

## Feature-review candidates

## Internal implementation opportunities

## Maintainer decisions

## No action

## Suggested implementation issues

## Validation checklist

Formatting is validated mechanically:

- Write the title and every listed heading on its own line exactly as shown.
- Put a blank line after each heading and start its content on the following line.
- Do not append narrative text to a heading or combine multiple sections into one line.

Follow these rules:

- Treat `authoritativeArtifacts.findings` as the source of truth for finding
  identifiers, classifications, evidence, and affected files.
- Mention every blocking and required finding by its exact finding ID.
- Do not create finding IDs. Only use IDs present in the findings artifact.
- Tie every bullet in an action-oriented section to a finding ID. If a section
  has no supported items, write a bullet beginning with `- No `.
- Use `Feature-review candidates` for review findings whose capability policy
  identifies a potentially useful new public capability.
- Use `Internal implementation opportunities` for review findings whose
  capability policy identifies an additive API that could improve the
  extension's internals without changing its public feature surface.
- Use `Maintainer decisions` for other review findings that require a human
  decision, including deprecations or ambiguous migrations.
- Use `No action` for no-action findings.
- Start the `Summary` section with this exact sentence: `This is an advisory report; it does not make or authorize implementation decisions.`
- Label every recommendation with `Advisory:`. Do not claim that code was
  changed, tests were run, or behavior was verified beyond what the supplied
  artifacts report.
- Distinguish deterministic evidence from interpretation and state uncertainty
  when the context does not establish a migration path.
- Suggested implementation issues must remain proposals, not automatically
  created work items.

The runtime context follows after this prompt under `## Runtime context`.
