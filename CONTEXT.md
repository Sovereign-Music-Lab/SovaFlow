# CONTEXT — Sovereign Flow / SovaFlow

Updated: 2026-11-10. Version 0.1.0: F-001–F-004 implemented and tested (Node.js 22+, no dependencies).

## Identity
- Repository: Sovereign-Music-Lab/SovaFlow, intended branch main.
- Role: optional orchestration of DeepChord, Sovereign DAW and the human feedback loop.
- Status: executable CLI (`bin/sovaflow.mjs`): contract, synthetic adapter, optional SovaRoll and DeepChord/Logic adapters, feedback iteration, bilingual menu and double-click starters.

## Operating policy
- Receiving coding environment: Gemma 4 26B, MLX, M5 Pro, 24 GB unified memory (user-specified target).
- Exact model artifact, quantization, runtime tool support, context cap and performance: not verified by this handoff.
- Use local Gemma 4 for the next coding stage. No silent model substitution or automatic cloud escalation.
- The High/Middle/Low method is reusable planning guidance; it does not override the current model lock or license.
- Read one task and bounded source excerpts. Measure real context/memory usage; do not assume a safe token count from RAM alone.

## Durable decisions
- Credits: Hee-sung Kang, Do-won Lee, Sungmo Park; keep them under README titles.
- README structure: title, authors/credits, abstract, contents, then details; maintain English and Korean editions.
- Tools remain independently usable. Cross-links are navigation, not hidden runtime dependencies.
- Target loop: human → local LLM (optional RAG/LoRA) → Sovereign DAW → autonomous composition → Logic Pro MCP → result → human feedback → repeat.
- Current capability and future architecture are separate. Preserve editable sources and actual evidence.

## Current state and evidence
- Runtime chosen 2026-11-09 at the maintainer's request: Node.js 22+, built-in modules only (see TASKS.md).
- `npm test`: 10 tests pass (contract, synthetic loop, iteration/stop rules, SovaRoll adapter vs HTTP test double, DeepChord adapter vs CLI test double, cancel/resume, CLI).
- Real check 2026-11-09: SovaRoll 0.129 server (temporary project) + real `deepchord demo`: import verified, MIDI export verified, rename + undo verified. Not exercised: `deepchord compose` with a real local model, Logic Pro opening, Windows starter.
- This session was a Claude cloud session explicitly requested by the maintainer on 2026-11-09 ("finish SovaFlow … then commit and push everything"); the repository default policy (local Gemma 4) is unchanged for later sessions.
- Docs: README (en/ko) includes copyable CLI and menu commands; docs/CONTRACT.en.md/.ko.md. All referenced terminal screenshots were replaced with text on 2026-11-10. The 2026-11-10 follow-up `npm test` completed successfully with 10 passing tests.

## Next task
- F-005 (human trial with a real local model and Logic), then F-006 render step. See TASKS.md.

## Navigation
- [Organization](https://github.com/Sovereign-Music-Lab)
- [Website](https://sovereign-music-lab.github.io/)
- [DeepChord](https://github.com/Sovereign-Music-Lab/DeepChord)
- [Sovereign DAW](https://github.com/Sovereign-Music-Lab/sovaroll-DAW)
- [Sovereign Flow](https://github.com/Sovereign-Music-Lab/SovaFlow)

## Update rule
Read AGENTS.md, this file, Git status, then one task. Update this English file after each completed/blocked task and before ending a session. Keep it short; archive detail under docs/context/. Recheck the working directory and remote whenever switching repositories. Git and actual test output outrank stale summaries. Publication must be verified against the remote; this document alone is not proof of a push.
