# Branching Strategy

## Branch Types

### Main Branches
- **main** — Production-ready code, protected
- **develop** — Integration branch for completed phases

### Phase Branches
- **phase/01-job-model-and-store** — Job lifecycle, types, store interface
- **phase/02-producer-and-workers** — Producer script, worker processes
- **phase/03-worker-health-reclaim** — Heartbeats, dead detection, job reclaim
- **phase/04-rest-api** — REST endpoints for dashboard data
- **phase/05-websockets-dashboard** — WebSocket server, React dashboard
- **phase/06-tests-and-docs** — Final testing, README, architecture diagram

### Feature Branches (within phases)
- **feat/claim-mechanism** — Atomic job claiming
- **feat/heartbeat-system** — Worker heartbeat implementation
- **feat/reclaim-logic** — Dead worker job reclamation
- **feat/dashboard-components** — Individual dashboard views

### Fix Branches
- **fix/claim-race-condition** — Bug fixes for specific issues
- **fix/heartbeat-timing** — Timing-related fixes

## Workflow

1. Create phase branch from `develop`
2. Create feature branches from phase branch
3. Merge features into phase branch
4. Test phase branch thoroughly
5. Merge completed phase into `develop`
6. Create next phase branch from updated `develop`

## Commit Convention
type(scope): description

Types:

feat: New feature

fix: Bug fix

docs: Documentation

test: Adding tests

refactor: Code restructuring

style: Formatting changes

chore: Maintenance tasks

Scopes:

shared: Shared package

store: Store implementation

producer: Producer process

worker: Worker process

server: API/WebSocket server

dashboard: React frontend

tests: Testing infrastructure

Examples:
feat(shared): add job lifecycle state machine
fix(worker): resolve race condition in claim mechanism
test(store): add atomic claim concurrency tests
docs(readme): add architecture diagram

text

## Current Phase: Phase 1 — Job Model and Shared Store

Branch: `phase/01-job-model-and-store`

### Completed:
- ✅ Project structure
- ✅ Package configuration
- ✅ TypeScript setup
- ✅ Job types and state machine
- ✅ Worker types
- ✅ Store interface
- ✅ Redis store implementation
- ✅ Environment configuration

### In Progress:
- [ ] Atomic claim mechanism (Lua script)
- [ ] Job state history tracking
- [ ] Store interface tests
