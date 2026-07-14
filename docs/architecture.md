# Architecture

## System map

```mermaid
flowchart LR
    subgraph N[Nodrica]
        O[Orchestrator]
        R[Resource resolver]
        D[(DB / cache)]
        U[User channel]
        A[Uni Auth Runtime]
    end

    subgraph H[Portal Application Handler]
        C[Flow controller]
        P[Platform detector]
        X[Portal adapter]
        F[Form engine]
        G[Submit guard]
        V[Result verifier]
        K[Continuation]
    end

    O --> C --> P --> X --> F --> G --> V
    C <--> K
    V --> O
    C -->|needs_input| R
    R --> D
    R --> A
    R --> U
    R -->|resource| C
```

## One application journey

```mermaid
sequenceDiagram
    participant N as Nodrica
    participant H as Handler
    participant P as Portal

    N->>H: start(link, sessions, data, files, policy)
    H->>P: open with supplied session
    H->>P: reach real application form
    loop Safe form steps
        H->>P: detect + fill known fields
        alt Resource missing
            H-->>N: needs_input + checkpoint
            N-->>H: resource + resume
        else Step ready
            H->>P: next / continue
        end
    end
    H->>H: submit guard
    H->>P: submit once, if allowed
    H-->>N: verified result
```

## Two engines

```mermaid
flowchart TB
    L[Application link] --> A[Navigation adapter]
    A -->|login wall| S[Request session]
    A -->|known redirect| B[Switch adapter]
    A -->|form reached| F[Common form engine]
    F --> M[Map fields]
    M --> I[Fill safe values]
    I --> G[Guard next / submit]
```

| Portal-specific | Shared across portals |
| --- | --- |
| Login/apply controls | Field extraction and mapping |
| Already applied/expired detection | Missing-data requests |
| Redirect and form arrival | Step limits and continuation |
| Confirmation signals | Submit safety and result model |

## Redirect rule

```mermaid
flowchart LR
    C[URL changed] --> D{Registered domain?}
    D -->|same portal| K[Continue]
    D -->|another known portal| S[Switch adapter]
    S --> Q{Session valid?}
    Q -->|yes| K
    Q -->|no| R[needs_input: session]
    D -->|unknown| U[unsupported_platform]
```

Every new top-level domain is re-evaluated. Trust is never inherited through a redirect.

