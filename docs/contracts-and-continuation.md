# Contracts and Continuation

## Input → output

```mermaid
flowchart LR
    subgraph I[Input]
        L[Link]
        S[Session artifacts]
        D[Available data]
        F[File references]
        P[Policy + limits]
        C[Continuation response]
    end
    I --> H[Portal Handler]
    H --> O{Output}
    O --> SU[submitted]
    O --> NI[needs_input]
    O --> RR[review_required]
    O --> AA[already_applied]
    O --> JE[job_expired]
    O --> UP[unsupported_platform]
    O --> FL[failed]
```

Raw passwords are never accepted. Session artifacts remain separate from durable checkpoints.

## Lifecycle

```mermaid
stateDiagram-v2
    [*] --> Running
    Running --> Paused: needs_input
    Paused --> Running: valid resource response
    Running --> Review: sensitive / uncertain / approval
    Review --> Running: approved
    Running --> Submitted: verified
    Running --> Unconfirmed: submit clicked, proof missing
    Running --> AlreadyApplied
    Running --> Expired
    Running --> Unsupported
    Running --> Failed
    Submitted --> [*]
```

## Hybrid pause and resume

```mermaid
flowchart TD
    P[Pause] --> L{Live lease active?}
    L -->|yes| S[Resume same isolated page]
    L -->|no| D[Load durable checkpoint]
    D --> O[Open with approved session]
    O --> R[Re-detect + replay safe actions]
    R --> F{Form fingerprint matches?}
    F -->|yes| C[Continue]
    F -->|no| V[review_required]
```

| Live lease | Durable checkpoint |
| --- | --- |
| Opaque run handle | Run/job/provider identifiers |
| Short TTL | Adapter version + safe URL |
| Browser stays isolated | Form fingerprint |
| Best for quick answers | Action IDs + counters |
| Closed on timeout/cancel | Value hashes, never sensitive values |

Never persisted: Playwright objects, DOM handles, cookies, tokens, passwords or raw session state.

## Duplicate-action protection

```mermaid
flowchart LR
    A[Proposed action] --> K[runId + actionId]
    K --> Q{Already observed?}
    Q -->|yes| N[Do not repeat]
    Q -->|no| V[Verify page state]
    V --> X[Execute once]
    X --> E[Record outcome]
```

Final approval is bound to `job + account + form fingerprint + expiry`. `submitted_unconfirmed` is reviewed, never blindly retried.

