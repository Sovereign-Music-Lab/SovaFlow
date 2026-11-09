# SovaFlow implementation queue

Runtime decision (2026-11-09, maintainer request "do SovaFlow design and tasks and finish"): **Node.js 22+, built-in modules only, no npm dependencies** — the same runtime as SovaRoll, so non-programmers install one thing. DeepChord stays a separate Python program reached through its CLI.

## F-001 — standalone workflow contract (done 2026-11-09)

- `src/contract.mjs`: `sovaflow.job/1` and `sovaflow.record/1`, step states, retry identity, record validator, stop rules. Spec: [docs/CONTRACT.en.md](docs/CONTRACT.en.md).
- Synthetic examples in `examples/`; local dry-run validator `sovaflow validate` and `sovaflow run JOB --dry-run`; works with no sibling repository, LLM, dataset or app.
- Missing capabilities are recorded `unavailable`; no simulated MCP or audible success.
- Evidence: `npm test` (contract tests).

## F-002 — optional SovaRoll adapter (done 2026-11-09)

- `src/adapters/sovaroll.mjs`: `state`, `import-midi`, `command` (SovaRoll dry-run validation first), `export-midi`, `undo` of an edit from the same run.
- Revision + document guards on every write; `revision.after` taken from SovaRoll's response; undo refuses after foreign edits.
- Evidence: tests with an HTTP test double; real SovaRoll 0.129 server run (import verified, export verified, rename + undo verified).

## F-003 — optional DeepChord / Logic handoff (done 2026-11-09)

- `src/adapters/deepchord.mjs`: only documented CLI operations `demo`, `compose`, `validate`, `feedback`, `logic open`.
- `logic-open` is capped at `accepted`; import and sound are not claimed.
- Evidence: tests with a CLI test double; real `deepchord demo` run. Not exercised: real `compose` with a local model, real Logic opening.

## F-004 — feedback iteration (done 2026-11-09)

- `sovaflow feedback` (rating, note, `--heard`, `--stop`), `sovaflow iterate` with stop rules, `previousRun` lineage, feedback history in the next job, DeepChord `--previous-run`.
- Synthetic end-to-end replay across iterations in tests; CLI end-to-end test.

## Environment configuration fix (done 2026-11-10)

- Bundled jobs no longer hard-code adapter defaults, so environment overrides work; explicit job settings retain priority. `npm test`: 11 passed. Real DeepChord demo and isolated SovaRoll server verified import and export.

## Next (planned, not started)

- **F-005 — real composition trial (human):** run `deepchord-compose-loop` with the maintainer's local model and Logic Pro; record which steps reached `verified`/`accepted` and the human's listening notes.
- **F-006 — SovaRoll render step:** add `render-mix` using SovaRoll's render job API, copying the WAV as an artifact (still `not-verified` audibly).
- **F-007 — job editor in the menu:** let a non-programmer create a job (intention text, bars, which apps) from the menu without editing JSON.
- **F-008 — DeepChord session/edit operations:** consider `logic edit-note` / `move-region` (project copies) once their outputs are stable; keep project-copy semantics.
- **F-009 — Windows check:** verify `Start SovaFlow.bat` and paths on Windows.
