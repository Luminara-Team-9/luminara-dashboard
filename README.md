Decathlon Web Performance Intelligent Benchmarking Dashboard
This repository is the official workspace for the 2026 Comprehensive Design Project, 'Decathlon Web Performance Optimization and Intelligent Benchmarking Dashboard'.

1. Project Folder Structure (Based on FSD v2.1)
Our project strictly follows the Feature-Sliced Design (FSD) architecture to prevent code entanglement. You must create your work exclusively in the designated directories below.

app/ : System global settings, global routing, and overall layout (The framework of the building).

pages/ : Actual page components that users will see (e.g., Main screen, Analytics dashboard).

widgets/ : Independent, large UI blocks (e.g., Top navigation bar, Performance metric card lists).

features/ : Business logic involving user interactions (e.g., PDF report download button, Apply AI improvements button).

entities/ : Core business data models and states (e.g., Performance score data structure, Competitor information).

shared/ : Reusable, common small components used throughout the project (e.g., Common API clients, Basic UI buttons, Font settings).

2. GitHub Workflow Rules (Must Read)
The main branch is the core framework of our project. It is strictly locked to prevent anyone from pushing code directly. When working on code, you must follow these rules:

Branch Creation: Before starting any work, create a new working branch from the main branch. (e.g., feat/dashboard-ui, fix/api-error)

Commit Rules: Write clear and descriptive commit messages so others can easily understand what was modified.

Pull Request (PR): Once your work is complete, create a Pull Request to merge your branch into the main branch.

Code Review and Approval: Code will only be merged into the main branch after the System Architect verifies the folder structure and approves the PR. Do not merge arbitrarily.

3. Data Communication Protocol
Performance data collected by the AI and automation bots (Python) will be transmitted to the frontend (Next.js) according to a predefined common API JSON specification. The communication protocol document will be updated in the Wiki later.

-----------------------------------------------------------------------------------------------------------------------------------------------------

데카트론 웹 성능 지능형 벤치마킹 대시보드
이 저장소는 2026년 종합설계프로젝트 '데카트론 웹 성능 최적화 및 지능형 벤치마킹 대시보드' 개발을 위한 공식 작업 공간입니다.

1. 프로젝트 폴더 구조 (FSD v2.1 기반)
우리 프로젝트는 코드의 엉킴을 방지하기 위해 Feature-Sliced Design(FSD) 아키텍처를 엄격하게 따릅니다. 각자의 작업물은 반드시 아래의 지정된 구역에만 생성해야 합니다.

app/ : 시스템 전역 설정, 글로벌 라우팅, 전체 레이아웃 (건물의 뼈대)

pages/ : 사용자가 보게 될 실제 페이지 컴포넌트 (메인 화면, 분석 대시보드 화면 등)

widgets/ : 독립적으로 동작하는 큼직한 UI 덩어리 (예: 상단 네비게이션 바, 성능 지표 카드 리스트)

features/ : 사용자 상호작용이 일어나는 비즈니스 로직 (예: PDF 리포트 다운로드 버튼, AI 개선안 적용 버튼)

entities/ : 비즈니스 핵심 데이터 모델 및 상태 (예: 성능 점수 데이터 구조, 경쟁사 정보)

shared/ : 프로젝트 전체에서 공통으로 쓰는 작은 부품들 (예: 공용 API 클라이언트, 기본 UI 버튼, 폰트 설정)

2. 깃허브 작업 규칙 (필독)
main 브랜치는 건물의 메인 뼈대입니다. 절대 개인이 직접 코드를 밀어 넣을 수 없도록 잠겨 있습니다. 코드를 작업할 때는 다음 규칙을 따릅니다.

브랜치 생성: 작업 시작 전 main 브랜치에서 자신의 작업용 브랜치를 새로 만듭니다. (예: feat/dashboard-ui, fix/api-error)

커밋 규칙: 무엇을 수정했는지 알아보기 쉽게 커밋 메시지를 작성합니다.

Pull Request (PR): 작업이 끝나면 main 브랜치로 합쳐달라는 PR 대기표를 뽑습니다.

코드 리뷰 및 승인: 시스템 아키텍트의 폴더 구조 확인 및 코드 리뷰 승인(Approve)이 떨어져야만 main에 코드가 병합됩니다. 임의로 병합하지 마세요.
