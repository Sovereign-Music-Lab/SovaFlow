# Sovereign Flow / SovaFlow

**Authors / Project credits:** [Hee-sung Kang · 강희성](https://ikoffices.com/) · [Do-won Lee · 이도원](https://music.bugs.co.kr/artist/80353758?wl_ref=list_ar_02_search) · [Sungmo Park · 박성모](mailto:vividsaebom@gmail.com)

[Organization](https://github.com/Sovereign-Music-Lab) · [Website](https://sovereign-music-lab.github.io/) · [DeepChord](https://github.com/Sovereign-Music-Lab/DeepChord) · [Sovereign DAW](https://github.com/Sovereign-Music-Lab/sovaroll-DAW) · [Sovereign Flow](https://github.com/Sovereign-Music-Lab/SovaFlow)

## 초록
[English](README.md) · **한국어**

인간–로컬 LLM–소버린 DAW–Logic Pro 피드백 순환을 조율하는 독립 프로젝트입니다. 초기 저장소에는 설계와 Gemma 인계를 공개하며, 아직 실행 가능한 오케스트레이션 엔진은 없습니다.

## 목차

- [제품 역할](#제품-역할)
- [작업 흐름](#작업-흐름)
- [독립 실행 원칙](#독립-실행-원칙)
- [시작하기](#시작하기)
- [개발 운영](#개발-운영)
- [라이선스](#라이선스)
- [개발 인계](#개발-인계)

## 제품 역할

- Sovereign DAW / SovaRoll: 편집 가능한 MIDI·오디오와 자체 실행 환경을 가진 프로급 오픈소스 DAW 개발 프로젝트.
- DeepChord: 로컬 LLM으로 Logic Pro를 사용하며 작곡하는 도구. 현재 MCP 관찰·전달 기능의 한계는 해당 문서를 따릅니다.
- Sovereign Flow: 명시적인 선택적 인터페이스와 인간 피드백으로 두 도구를 통합.

## 작업 흐름

```mermaid
flowchart LR
    H[인간의 의도] --> L[로컬 LLM / 선택적 RAG·LoRA]
    L --> D[소버린 DAW / SovaRoll]
    D --> A[자율형 작곡·수정]
    A --> M[Logic Pro MCP]
    M --> R[결과물]
    R --> F[인간 피드백]
    F --> L
```

이 순환은 목표 아키텍처입니다. 자율형 작곡에서도 편집 가능한 원본을 보존하고 요청·접수·가져오기 검증·소리가 나는 상태·인간의 음악적 평가를 구분합니다. MCP 요청 접수만으로 음악 결과가 완성됐다고 볼 수 없습니다.

## 독립 실행 원칙

각 저장소가 필수 기능을 자체 구현합니다. 연동은 버전이 있는 어댑터와 명시된 capability를 사용하며, 미래 SovaFlow 코어의 검사·테스트·단독 실행에 다른 저장소나 개인 자료가 필수가 되어서는 안 됩니다. 선택적 연동을 켰을 때는 해당 앱이 필요할 수 있습니다.

합성 데이터로 검사하는 독립 dry-run 어댑터부터 시작합니다. 현재 문서 공개 버전이 전체 순환을 실행할 수 있다고 표현하지 않습니다.

## 시작하기

```sh
git clone https://github.com/Sovereign-Music-Lab/SovaFlow.git
cd SovaFlow
```

[CONTEXT.md](CONTEXT.md), [AGENTS.md](AGENTS.md), [TASKS.md](TASKS.md)를 읽습니다. 아직 런타임 설치·시작 명령은 없습니다. 첫 구현 작업은 사람이 선택합니다. 이 문서 저장소를 삭제할 때에는 수정한 내용을 보존한 뒤 폴더를 휴지통으로 옮깁니다.

## 개발 운영

받는 환경은 사용자의 M5 Pro 24GB에서 실행할 로컬 Gemma 4 26B / MLX입니다. 정확한 ID·양자화·사용할 컨텍스트는 측정해야 합니다. [한국어 운영 방법](docs/MODEL_OPERATIONS.ko.md) · [English operations](docs/MODEL_OPERATIONS.en.md) · [재사용 스킬](skills/model-tier-handoff/SKILL.md).

## 라이선스

[Apache-2.0](LICENSE) · [NOTICE](NOTICE). 외부 앱·모델·사용자 콘텐츠는 각자의 조건을 유지합니다. 모델 운영 방침은 라이선스의 이용 권한을 제한하지 않습니다.

## 개발 인계

[CONTEXT.md](CONTEXT.md) · [Model operations / 모델 운영](docs/MODEL_OPERATIONS.ko.md) · [Reusable skill / 재사용 스킬](skills/model-tier-handoff/SKILL.md)
