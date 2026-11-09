# SovaFlow 작업 계약 v1

[English](CONTRACT.en.md) · [README](../README.ko.md) · 기준 코드: `src/contract.mjs`

계약은 SovaFlow가 정직하게 동작하는 방법입니다. 자동화가 흐리기 쉬운 여섯 가지를 구분합니다.

| 개념 | 위치 | 누가 정하나 |
|---|---|---|
| **의도** — 사람이 원하는 것 | `job.intention` | 사람(작업 파일) |
| **제안된 편집** — 보낼 내용 그대로 | `record.steps[].proposed` | 어댑터(dry run과 실제 호출 전) |
| **수락된 편집** — 프로그램이 "적용됨"이라 응답 | `record.steps[].accepted` | 어댑터(프로그램 자체 응답) |
| **검증된 상태** — 다시 읽어 확인 | `record.steps[].verified` | 어댑터(새로 읽은 상태, 디스크 파일) |
| **결과물** — 만들어진 파일 | `record.steps[].artifacts[]`(복사, 해시) | 실행기 |
| **사람의 피드백** — 점수, 메모, 들음 | `record.feedback[]`, `record.audible` | `sovaflow feedback`만 |

## 작업 (`sovaflow.job/1`)

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

| 항목 | 규칙 |
|---|---|
| `id` | `A–Z a–z 0–9 . _ -` 1–64자. 재시도 식별자의 일부 |
| `intention.text` | 필수. `bars`는 선택 1–64. `feedbackHistory`는 `iterate`가 덧붙임 |
| `adapters` | 어댑터별 선택 설정. `sovaroll.url`은 로컬 주소만 |
| `steps` | 1–32단계, 고유 `id`, `adapter` ∈ {synthetic, deepchord, sovaroll}, `action`은 그 어댑터가 지원해야 함 |
| `steps[].input` | **앞선** 단계를 가리키는 `"단계ID:결과물종류"`(예: `sketch:midi`) |
| `policy.maxIterations` | 1–20(기본 3) |
| `policy.targetRating` | 1–5(기본 4) |
| `policy.onUnavailable` | `block`(기본: 멈추고 뒤 단계는 `skipped`) 또는 `skip`(계속) |

지원 작업:

| 어댑터 | 작업 |
|---|---|
| `synthetic` | `compose`(결정적이고 합성 표시가 붙은 MIDI 스케치), `note` |
| `deepchord` | `demo`, `compose`, `validate`, `feedback`, `logic-open` |
| `sovaroll` | `state`, `import-midi`, `command`, `export-midi`, `undo` |

## 기록 (`sovaflow.record/1`)

단계마다 `record.json`에 원자적으로 기록하므로, 중단된 실행도 언제나 확인할 수 있습니다.

| 항목 | 뜻 |
|---|---|
| `status` | `running`, `completed`, `dry-run-completed`, `blocked`, `failed`, `cancelled` |
| `iteration`, `previousRun` | 버전 번호와 개선 대상 실행 링크 |
| `capabilities` | 어댑터별 점검 결과(`available`, `detail`) |
| `steps[]` | `state`, `retryKey`, `proposed`, `accepted`, `verified`, `artifacts`, `revision {before, after, observed}`, `undoable`, `error`, `unavailable` |
| `feedback[]` | `{at, rating?, note, heard, stop, by: "human"}` |
| `audible.status` | `not-verified` 또는 `human-heard`(`heard: true` 피드백이 있어야 함) |

## 단계 상태

```
requested → proposed → accepted → verified
            └ proposed-only (dry run)
다른 종료 상태: unavailable · failed · cancelled · skipped
```

- `verified`에는 `verified` 근거, `accepted`에는 `accepted` 근거, `unavailable`에는 이유가 있어야 합니다. `recordProblems()`가 강제합니다.
- Logic Pro 열기는 최대 `accepted`. 소리를 들었다고 표시할 수 있는 것은 사람뿐입니다.

## 리비전·취소·재시도·원본 보존

- **리비전 검사**: SovaRoll 쓰기에는 `expectedRevision`과 `X-Newdaw-Document`가 들어가 오래된 계획은 SovaRoll이 거부합니다. `revision.after`는 *이* 편집에 대해 SovaRoll이 알려 준 리비전이라, 프로젝트가 그 뒤로 바뀌었으면 `undo`가 거부합니다(다른 사람의 편집은 절대 되돌리지 않음).
- **쓰기 전 검증**: `command` 단계는 먼저 SovaRoll의 `dryRun`으로 보냅니다.
- **취소**: Ctrl+C 또는 `sovaflow cancel 실행`(`CANCEL` 파일)이 다음 단계 전에 멈추고, 그 단계는 `cancelled`로 기록합니다.
- **재시도 식별자**: `retryKey = sha256(canonical({jobId, iteration, id, adapter, action, args, input}))`. `sovaflow resume`은 같은 키로 이미 `accepted`/`verified`된 단계를 건너뛰어, 가져오기가 두 번 적용되지 않습니다.
- **원본 보존**: 결과물은 SHA-256과 크기와 함께 `artifacts/<단계>/`로 복사하고, 원본 파일은 옮기거나 고치지 않습니다. DeepChord는 실행의 `work/` 폴더나 자체 실행 폴더에 쓰고, SovaRoll은 자체 실행 취소 이력과 원본 미디어를 유지합니다.

## 반복과 멈춤 (F-004)

`stopDecision(job, lineage)`는 마지막 피드백에 `stop`이 있을 때, 점수 ≥ `targetRating`일 때, `iteration ≥ maxIterations`일 때, 마지막 실행이 실패·차단·취소됐을 때, 아직 피드백이 없을 때 멈춥니다. 아니면 `iterate`가 피드백을 `intention.feedbackHistory`에 덧붙여 *n+1*번째 반복을 시작하고, DeepChord `compose`에는 이전 반복의 DeepChord 결과를 `--previous-run`으로 넘깁니다.

## 다른 프로그램 없이 검증

`npm test`는 합성 어댑터와, 테스트 대역임을 분명히 표시한 SovaRoll HTTP API·DeepChord CLI 대역(`tests/fixtures/`)으로 계약 전체를 시험합니다. 이 대역은 테스트에만 쓰고 실제 연동 결과를 주장하는 데 쓰지 않습니다.
