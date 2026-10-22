# API compatibility

`npm run compat` builds declarations and checks publishable packages in parallel. Semantic checks distinguish harmless API changes from potential breaks; a changed report alone does not flag a package.

## Commands

```sh
npm run compat
npm run compat -- agents-hosting
npm run compat -- --base origin/main
npm run compat -- --concurrency 3
npm run compat -- --skip-build
npm run compat -- agents-hosting --update
```

`--skip-build` reuses an already completed build. The quality runner supplies it automatically after building. `--skip-build` and `--concurrency` are advanced options in `--help`; ordinary checks need neither. `--no-color`, `NO_COLOR`, and plain redirected output are supported. `--local` and `--verbose` are no longer supported; diagnostics are always available in `compat/generated/report.json`.

`npm run quality` keeps successful compatibility output compact: it adds a notice when packages need review or baselines are outdated, even when compat exits successfully. Outdated baselines fail the check until refreshed; possible breaks are advisory. Failed checks show their command output. If a prerequisite prevents compatibility analysis, the JSON report records that it was skipped instead of retaining an earlier successful result.

## Output and review

Execution logs live under the Git-ignored `scripts/logs/` directory: standalone compat writes `compat/build.log`, and quality retains one log per check in `quality/`. Logs are refreshed each run; `compat/generated/report.json` remains the structured compatibility result consumed by quality.

The terminal shows one row per package: name, status, and elapsed analysis time. During execution, a subtle spinner appears beside Analyzing. Short terminals follow active packages. Completed rows say **No breaks detected**, **Baseline outdated**, **Possible breaks**, **Baseline current**, **Analysis error**, or **Skipped**. Baseline current means changes found against the Git reference are already included in the working baseline; they do not need another pending review. With `--update`, the heading reads **API compatibility · Updating baselines…**. After a successful update, changed packages show **Baseline updated** in green and unchanged packages show **Already current** in dim text. Packages with findings also retain **· Possible breaks** in yellow and their comparison links. Updates are only labeled successful after all baseline writes finish. Baseline freshness is separate from compatibility: harmless additions may require a refresh without flagging a package.

Each distinct potential break has one line of source links beneath its package, for example `baseline:235  →  generated:235`. Removed declarations have only a baseline link. Findings without source locations link to the whole file or to the JSON details; no line numbers are invented. Interactive terminals use OSC 8 hyperlinks with visible line numbers. In the VS Code integrated terminal (`TERM_PROGRAM=vscode`), links use [VS Code editor URLs](https://code.visualstudio.com/docs/configure/command-line#_opening-vs-code-with-urls) with an explicit line and column. Other terminals use file URLs with line fragments; navigation depends on their file handler. Redirected output and dumb terminals show full relative paths and line numbers without escape sequences.

The footer shows packages analyzed, packages needing review, pending possible breaks, errors, total time, and baseline updates. Review counts and terminal links always compare the current API with the working baseline. Historical findings are not counted as pending review. Inherited findings referring to the same declaration are grouped; independent findings remain separate. The possible-break count matches the displayed groups. Updating a baseline does not hide findings from that run. Failed or skipped packages do not contribute to either count. The tip includes `npm run compat -- --update` when baselines need refreshing. A successful update summarizes baselines updated and already current on one line, including review counts when findings exist. Updates with possible breaks show a warning reminding you to review them.

Generated API reports are saved directly as `compat/generated/<report>.api.md`. Ordinary checks link to the actual files in `compat/baseline/` and `compat/generated/`. With `--update`, the working baseline is saved under `compat/generated/baseline-reference/` before replacement. With `--base` (including `COMPAT_BASE`), the Git baseline is saved separately under `compat/generated/baseline-reference/git/`. This keeps historical context and pre-update comparison links distinct. This is a temporary comparison reference; `--update` still writes approved changes to `compat/baseline/`. Each invocation removes stale generated API reports, baseline snapshots, the previous build log, and the legacy `compat/generated/comparison/` and `compat/generated/baseline/` folders; unrelated logs remain. A failed run writes an error report instead of leaving stale success results. No Markdown or HTML review files are generated.

`compat/generated/report.json` contains original findings with reasons, before/after declarations, finding IDs, diagnostics, source locations, per-package timing, and comparison metadata. With `--base`, top-level `reference` identifies the Git reference and commit; each `results[].reference` contains its historical findings, comparisons, and grouped breaks. The main `results[].findings` and summary contain pending changes against the working baseline. Historical comparison errors are recorded in `results[].reference.error` without obscuring the working-baseline result. Each result also contains `comparisons` (entry-point file paths) and `breaks` (display groups with source references and original finding IDs). Grouping changes presentation only. Package and dependency metadata changes link to the JSON details, which contain their original before/after values. GitHub Actions and Azure Pipelines retain the JSON, generated reports, baselines, workflow documentation, and build log together. Paths in the JSON are relative to the repository root and to the downloaded artifact root.

## Exit behavior and baselines

| Exit | Meaning |
| --- | --- |
| 0 | Working baselines are current, or the requested update succeeded; possible breaks are warnings |
| 1 | Working baselines need updating, including harmless API changes |
| 2 | Analysis, configuration, build, missing-baseline, or write failure |
| 130 | Interrupted |

The terminal deliberately combines confirmed and uncertain findings as **Possible breaks**. The JSON findings distinguish `breaking` from `possible` for review; both are advisory. Baseline freshness determines exit code 1, independently of finding severity. An analysis error never means compatibility passed.

Normal checks do not modify `compat/baseline`. After review, `--update` validates all selected packages before replacing reports and inventory. Failed or incomplete analyses never update baselines. Writes roll back on failure and do not stage Git changes. Local `--update` can establish an initial missing baseline.

Running `--update` is the explicit decision to adopt the current API for the selected package or all packages. No acknowledgement file or extra acceptance flag is required. Findings remain visible in the report and terminal, and a successful update with possible breaks shows:

```text
Warning: Baselines were updated, but possible breaking changes still need your review.
```

Review the comparisons and baseline diff before committing. Analysis errors, interrupted or skipped packages, and write failures still prevent a successful update.

Local checks and CI use working baselines for pending findings and freshness. PR CI also supplies a fixed target-branch SHA through `COMPAT_BASE` to retain historical context in the JSON report. After adopting an API with `--update`, its historical findings remain available there but no longer appear in the terminal or pending-review counts. CI still fails on stale baselines or analysis errors; new API changes are compared against the adopted baseline. `inventory.json` tracks package names and explicit type entry points, including removals. Historical commits without inventory retain their original root-entry coverage. The initial inventory preserves approved reports; telemetry's two type conditions start from the same previously approved contract.

Keep `compat/baseline/inventory.json` with the approved baselines: compat reads it during comparisons, updates it with `--update`, and repository doctor uses it to validate baseline coverage. The canonical root entry keeps `<package>.api.md`; alternate root `import` and `require` entries use readable suffixes, such as `agents-telemetry-require.api.md`. Other export paths and nested conditions retain hashed suffixes to avoid ambiguous filenames. Historical inventories continue to reference their original report names.

## Scope

API Extractor generates the public reports; the semantic checker and regression-tested adapters identify potential source compatibility problems. Known harmless additions, import aliases, internal names behind public export aliases, and index-parameter renames do not trigger warnings. Changes to public export names remain subject to compatibility checks. Current declarations resolve inherited constructors omitted from reports; missing historical information remains uncertain.

Conditional exports need explicit type coverage for each reachable import and require branch, including nested custom conditions. A shared `types` entry can cover sibling runtime targets. Types declared only for `import` do not cover an untyped `require` branch; analysis fails instead of silently skipping it. A later `default` fallback needs no separate entry when earlier branches already cover both resolution modes.

This is not a guarantee of runtime compatibility. Generic-dependent and overloaded changes may remain uncertain. External types resolve from installed dependencies on both sides; declared dependency changes warn, while lockfile-only changes, runtime behavior, and package contents need separate review/tests. Unsupported export patterns and missing declarations fail analysis.

Keep the detector's regression tests when simplifying presentation. Re-run them before upgrading API Extractor, the semantic checker, or TypeScript:

```sh
node --test scripts/test/compat.test.mjs scripts/test/compat-flow.test.mjs scripts/test/quality.test.mjs scripts/test/repo-doctor.test.mjs
npm run repo:doctor
```
