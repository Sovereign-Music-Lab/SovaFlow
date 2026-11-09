# SovaFlow workflow contract v1

[한국어](CONTRACT.ko.md) · [README](../README.md) · Source of truth: `src/contract.mjs`

The contract is how SovaFlow stays honest. It separates six things that automation tends to blur:

| Concept | Where it lives | Who can set it |
|---|---|---|
| **Intention** — what the human wants | `job.intention` | the human (job file) |
| **Proposed edit** — exactly what would be sent | `record.steps[].proposed` | adapter, in dry run and before real calls |
| **Accepted edit** — the app said "applied" | `record.steps[].accepted` | adapter, from the app's own response |
| **Verified state** — re-read and confirmed | `record.steps[].verified` | adapter, from a fresh read (state, file on disk) |
| **Output artifacts** — files produced | `record.steps[].artifacts[]` (copied, hashed) | runner |
| **Human feedback** — rating, note, heard | `record.feedback[]`, `record.audible` | only `sovaflow feedback` |

## Job (`sovaflow.job/1`)

```json
{
  "schema": "sovaflow.job/1",
  "id": "deepchord-to-sovaroll",
  "title": "DeepChord demo sketch → SovaRoll project",
  "intention": {"text": "Bring a DeepChord piano sketch into SovaRoll", "bars": 4},
  "adapters": {"deepchord": {"command": "deepchord"}, "sovaroll": {"url": "http://127.0.0.1:4317"}},
  "steps": [
    {"id": "sketch", "adapter": "deepchord", "action": "demo"},
    {"id": "import", "adapter": "sovaroll", "action": "import-midi", "input": "sketch:midi"}
  ],
  "policy": {"maxIterations": 3, "targetRating": 4, "onUnavailable": "block"}
}
```

| Field | Rule |
|---|---|
| `id` | 1–64 of `A–Z a–z 0–9 . _ -`; part of the retry identity |
| `intention.text` | required; `bars` optional 1–64; `feedbackHistory` is appended by `iterate` |
| `adapters` | optional per-adapter settings; `sovaroll.url` must be a local address |
| `steps` | 1–32 steps; unique `id`; `adapter` ∈ {synthetic, deepchord, sovaroll}; `action` must be supported by that adapter |
| `steps[].input` | `"stepId:artifactKind"` referring to an **earlier** step (for example `sketch:midi`) |
| `policy.maxIterations` | 1–20 (default 3) |
| `policy.targetRating` | 1–5 (default 4) |
| `policy.onUnavailable` | `block` (default: stop and mark later steps `skipped`) or `skip` (continue) |

Supported actions:

| Adapter | Actions |
|---|---|
| `synthetic` | `compose` (deterministic labelled MIDI sketch), `note` |
| `deepchord` | `demo`, `compose`, `validate`, `feedback`, `logic-open` |
| `sovaroll` | `state`, `import-midi`, `command`, `export-midi`, `undo` |

## Record (`sovaflow.record/1`)

Written to `record.json` after every step (atomic write), so an interrupted run is always inspectable.

| Field | Meaning |
|---|---|
| `status` | `running`, `completed`, `dry-run-completed`, `blocked`, `failed`, `cancelled` |
| `iteration`, `previousRun` | version number and link to the run it improves |
| `capabilities` | each adapter's probe result (`available`, `detail`) |
| `steps[]` | `state`, `retryKey`, `proposed`, `accepted`, `verified`, `artifacts`, `revision {before, after, observed}`, `undoable`, `error`, `unavailable` |
| `feedback[]` | `{at, rating?, note, heard, stop, by: "human"}` |
| `audible.status` | `not-verified` or `human-heard` (requires a feedback entry with `heard: true`) |

## Step states

```
requested → proposed → accepted → verified
            └ proposed-only (dry run)
terminal alternatives: unavailable · failed · cancelled · skipped
```

- `verified` requires `verified` evidence; `accepted` requires `accepted` evidence; `unavailable` requires a reason. `recordProblems()` enforces this.
- Logic Pro opening is capped at `accepted`. Nothing in SovaFlow can mark sound as heard except the human.

## Revisions, cancellation, retry, source preservation

- **Revision checks**: SovaRoll writes include `expectedRevision` and `X-Newdaw-Document`; a stale plan is rejected by SovaRoll. `revision.after` is the revision SovaRoll reported for *this* edit, so `undo` refuses when the project has moved on (someone else's edit is never undone).
- **Validation before writes**: `command` steps are first sent with SovaRoll's `dryRun`.
- **Cancellation**: Ctrl+C or `sovaflow cancel RUN` (a `CANCEL` file) stops before the next step; the step is recorded `cancelled`.
- **Retry identity**: `retryKey = sha256(canonical({jobId, iteration, id, adapter, action, args, input}))`. `sovaflow resume` skips steps already `accepted`/`verified` with the same key, so an import is never applied twice.
- **Source preservation**: artifacts are copied into `artifacts/<step>/` with SHA-256 and size; source files are never moved or modified. DeepChord writes into the run's `work/` folder or its own run folder; SovaRoll keeps its own undo history and source media.

## Iteration and stopping (F-004)

`stopDecision(job, lineage)` stops when the last feedback has `stop`, when its rating ≥ `targetRating`, when `iteration ≥ maxIterations`, when the last run failed/blocked/cancelled, or when no feedback exists yet. Otherwise `iterate` starts iteration *n+1* with the feedback appended to `intention.feedbackHistory`, and DeepChord `compose` receives the previous iteration's DeepChord run as `--previous-run`.

## Validation without any other program

`npm test` exercises the whole contract with a synthetic adapter and clearly labelled test doubles for the SovaRoll HTTP API and the DeepChord CLI (`tests/fixtures/`). These doubles exist only for tests; they are never used to claim a real integration result.
