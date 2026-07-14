# Implementation Roadmap

This roadmap delivers one module of the wider automated job-application platform. Completion means the module integrates safely with Nodrica, Uni Auth Runtime, candidate data and application tracking—not that it operates as a separate end-user product.

## Build order

```mermaid
flowchart LR
    A[1 Contracts] --> B[2 Resume engine]
    B --> C[3 Safety kernel]
    C --> D[4 Form engine]
    D --> E[5 Adapter framework]
    E --> F[6 Portal adapters]
    F --> G[7 Nodrica integration]
    G --> H[8 Hardening]
```

## Phases and gates

| Phase | Main deliverables | Must pass before moving on |
| --- | --- | --- |
| **1 Contracts** | Versioned schemas, statuses, errors, limits, field taxonomy | Portal text cannot become DB/tool/policy instructions |
| **2 Resume** | Run machine, live lease, checkpoint, action ledger | Restart/resume never duplicates actions |
| **3 Safety** | Domain/session/browser policies, submit guard | No credentials, bypass, unsafe redirect or unguarded submit |
| **4 Forms** | Extract, map, validate, fill, upload, step control | Unknown/sensitive required fields stop safely |
| **5 Framework** | Detector, adapter switch, selector versions | Adapters cannot bypass the safety kernel |
| **6 Portals** | Fixture adapter, then five real adapters | Each portal passes fixtures and current manual verification |
| **7 Nodrica** | DB/cache/session/user resolution loop | Ask once, reuse safely, no DB credentials in handler |
| **8 Release** | CI, audits, drift signals, operational guide | Security, recovery and Windows/Linux gates pass |

## System integration gate

```mermaid
flowchart LR
    N[Nodrica contract tests] --> S[Session-runtime tests]
    S --> P[Portal-handler tests]
    P --> T[Tracking/result tests]
    T --> E[Complete job-application journey]
```

The module is release-ready only after this complete journey works without leaking responsibilities across component boundaries.

## Portal rollout

```mermaid
flowchart LR
    F[Local hostile/normal fixtures] --> N[Naukri]
    N --> O[Foundit]
    O --> I[Internshala]
    I --> D[Indeed]
    D --> G[Glassdoor]
```

Every portal needs these scenarios:

```mermaid
mindmap
  root((Adapter tests))
    Direct apply
    External redirect
    Missing session
    Expired session
    Multi-step form
    Manual challenge
    Already applied
    Expired job
    Changed page
    Confirmed submit
    Unconfirmed submit
```

## Test pyramid

```mermaid
flowchart TB
    X[Windows/Linux + current portal checks]
    I[Integration: redirects, sessions, pause/resume]
    F[Fixtures: normal, changing and hostile pages]
    C[Contracts: adapters + Nodrica resources]
    U[Unit: schemas, mapping, guards, redaction]
    U --> C --> F --> I --> X
```

## Critical failure matrix

| Test | Safe result |
| --- | --- |
| Portal asks for secrets/DB access | Ignore + unknown/review |
| Wrong or expired account session | `needs_input: session` |
| Unknown redirect/protocol/popup | `unsupported_platform` or blocked |
| Stale/duplicate resource response | Reject |
| Lease expires while paused | Durable replay or review |
| Unknown required field | `needs_input: field_value` |
| Legal/sensitive question | Explicit value + review |
| CAPTCHA/OTP | `needs_input: manual_action` |
| Submit clicked, proof missing | `submitted_unconfirmed` |
| Completed run replayed | No action |
| Cancellation/forced failure | Context and locks cleaned |

## Completion path

```mermaid
flowchart LR
    C[Contracts pass] --> R[Resume tests pass]
    R --> S[Security tests pass]
    S --> P[Portal fixtures pass]
    P --> N[Nodrica end-to-end passes]
    N --> X[Windows/Linux passes]
    X --> V[Version-one candidate]
```

## Version-one checklist

- [x] Direct application through a deterministic adapter
- [x] Safe known-platform redirect switching in the central controller
- [x] Missing session/data/file/manual/review request and live resume
- [x] Nodrica DB/cache-first resource contract and integration example
- [x] Uni Auth Runtime-compatible browser-session boundary
- [x] Live continuation, durable checkpoint contract and duplicate-action guard
- [x] Auto-submit off by default and central submit guard
- [x] Distinct verified/unconfirmed/already-applied/expired outcomes
- [x] Prompt-injection, isolation, redirect, redaction and replay guards/tests
- [ ] Windows/Linux and current-portal verification
