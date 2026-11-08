# SovaFlow implementation queue

## F-001 — standalone workflow contract (todo)

Goal: define a versioned job/result contract before controlling an application.

Acceptance:
- Distinguish intention, proposed edits, accepted edits, verified state, output artifacts and human feedback.
- Define revision/capability checks, cancellation, retry identity and source preservation.
- Provide synthetic examples and a local dry-run validator with no sibling repository, LLM, dataset or external app required.
- Record missing capabilities as unavailable; never simulate a real MCP or audible-output success.
- Choose the runtime with the maintainer before adding dependencies.

## F-002 — optional SovaRoll adapter (planned, depends on F-001)
Read capabilities and state; dry-run a bounded command; preserve revisions and undo.

## F-003 — optional DeepChord / Logic handoff (planned, depends on F-001)
Inspect available interfaces and implement only the actually supported operations.

## F-004 — feedback iteration (planned, depends on F-002/F-003)
Store human feedback, version editable results, define stopping conditions, and replay a synthetic end-to-end workflow before a real composition run.
