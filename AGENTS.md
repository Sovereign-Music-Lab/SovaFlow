# Repository handoff instructions

Read CONTEXT.md and the English/Korean README before work. Maintain visible credits for Hee-sung Kang, Do-won Lee and Sungmo Park, followed by abstract and contents. Keep links to the organization and three projects.

The next coding stage uses local Gemma 4 (requested target: 26B / MLX / M5 Pro 24 GB). Inspect the actual runtime and context capacity; no successful local-model run is claimed by this handoff. Never silently substitute another model. The reusable mixed-tier strategy does not override this current policy or change Apache-2.0 permissions.

Work on one bounded task, preserve user data, inspect exact source, make reviewable edits and record actual checks. Update the English CONTEXT.md after each completed/blocked task and before ending a session. Archive details rather than growing that file without bound. Do not claim planned integrations as implemented. Do not publish private material or infer future push authorization from the initial handoff.

For this website, the source of truth is DeepChord's site/ subtree; validate both locales and reconcile the remote before publishing. For SovaFlow, read TASKS.md. The runtime is Node.js 22+ with built-in modules only; do not add npm dependencies without an explicit maintainer request. Run `npm test` before and after changes, keep the contract in `src/contract.mjs` and its docs (docs/CONTRACT.en.md/.ko.md) in sync, and never upgrade a step state beyond its evidence. Apply the instruction appropriate to this repository.
