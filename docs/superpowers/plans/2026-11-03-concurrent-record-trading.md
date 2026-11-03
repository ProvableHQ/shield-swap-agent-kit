# Concurrent record trading implementation plan

**Goal:** Independent concurrent Aleo swaps with durable shared record reservations, scoped recovery, and per-token inventory maintenance.

**Architecture:** SDKs retain protocol logic and transaction construction. Operation lifetime locks prevent duplicate writers and concurrent recovery; short identity locks coordinate shared identity updates. One optional maintainer process services independent token jobs.

**Spec:** Approved chat design: separate execute calls with distinct quotes and inputs; seven operation statuses; existing SDK reservation states; per-token start/stop and targets; manual and timer passes share coordination; uncertain submissions never release inputs without evidence.

**Constraints:** Start from master; preserve Zod 4.6.6; pin Veil 0.16.1 and compatible SDK. No attribution, secrets, or live spending without account/network/action authorization. Legacy ambiguity stays conservative. No repeated-quote batch API required.

## Tasks

1. Baseline and foundation: verify master; reuse #10 inventory integration and upgrade to Veil 0.16.1. Preserve master dependency fixes. Run existing suites.
2. Ownership and coordination: operation context, owner-tagged reservations, per-operation locks, process-safe identity allocation/writes. Tests prove distinct resources and preservation of live reservations.
3. Runtime execution/recovery: independent swaps; scoped claims and inventory; conservative bridge/legacy exclusion; idempotency and per-operation limits; periodic bounded reconciliation without new submissions. Test timeout, failure, restart and multi-process behavior.
4. Maintenance: durable per-token targets, enabled state, current operation; one worker with independent token jobs; manual/timer shared locks; recover before replanning; stop only new work. Test contention, independent tokens, uncertain and failed operations, restart.
5. Interfaces and docs: schemas, terminal lifecycle, statuses, recipes, validation evidence.
6. Validate and deliver: full root/MCP suites, typecheck/build, installed-copy smoke, independent review, fixes, replacement PR. Live trades require separate explicit authorization.

## Review focus

- Independent processes and profile aliases cannot allocate duplicate identities or lose whole-list store updates.
- Recovery never cancels a live writer before its proof is ready.
- Confirmed inputs remain spent across scanner lag; timeout/404 is not non-submission.
- Duplicate claim output and legacy uncertainty remain protected.
- Manual/timer maintenance cannot overlap or overwrite another owner; failed/uncertain outcomes stay visible.

## Verification

New behavior is exercised by failing regression tests first, then implementation and passing focused tests. Full verification: root npm test; MCP pnpm test, pnpm typecheck, pnpm run build; installed tarball smokes using disposable offline state. Tests do not use existing wallet credentials.
