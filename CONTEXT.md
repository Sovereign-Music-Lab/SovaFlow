# CONTEXT — Sovereign Flow / SovaFlow

Updated: 2026-11-08 handoff. This file is part of the initial design/documentation release.

## Identity
- Repository: Sovereign-Music-Lab/SovaFlow, intended branch main.
- Role: optional orchestration of DeepChord, Sovereign DAW and the human feedback loop.
- Status: design and task queue only. No executable workflow engine is implemented or verified yet.

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

## Next task
- Read AGENTS.md and TASKS.md. F-001 defines a versioned workflow job/result contract and synthetic dry-run validator.
- The runtime choice is unresolved; obtain the maintainer's choice before adding dependencies.
- First core tests must run without sibling checkouts, an LLM, private data, Logic Pro or network services.
- Keep requested action, acceptance, verified import, audible output and human quality judgment as separate states.
- Later adapters are optional and must inspect actual capabilities, revisions and cancellation behavior.

## Evidence boundary
- This release validates documentation, links and the reusable skill; no workflow runtime tests exist yet.
- No Gemma coding session or autonomous composition run is claimed.

## Navigation
- [Organization](https://github.com/Sovereign-Music-Lab)
- [Website](https://sovereign-music-lab.github.io/)
- [DeepChord](https://github.com/Sovereign-Music-Lab/DeepChord)
- [Sovereign DAW](https://github.com/Sovereign-Music-Lab/sovaroll-DAW)
- [Sovereign Flow](https://github.com/Sovereign-Music-Lab/SovaFlow)

## Update rule
Read AGENTS.md, this file, Git status, then one task. Update this English file after each completed/blocked task and before ending a session. Keep it short; archive detail under docs/context/. Recheck the working directory and remote whenever switching repositories. Git and actual test output outrank stale summaries. Publication must be verified against the remote; this document alone is not proof of a push.
