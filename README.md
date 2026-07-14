# Portal Application Handler

> A reusable TypeScript + Playwright worker for safely completing supported job-portal applications.

**Status:** visual architecture and implementation plan only—no runtime code yet.

## How it works

```mermaid
flowchart LR
    N[Nodrica<br/>link + known resources] --> H[Portal Handler]
    H --> P[Open portal]
    P --> F[Reach and fill form]
    F --> Q{Need something?}
    Q -->|yes| R[Ask Nodrica<br/>needs_input]
    R --> N
    Q -->|no| G{Submit guard}
    G -->|review| R
    G -->|safe + allowed| S[Submit once]
    S --> V[Verify result]
    V --> N
```

## Clear ownership

| Component | Responsibility |
| --- | --- |
| **Portal Handler** | Navigate, fill, pause, resume, guard and verify |
| **Nodrica** | Orchestrate, query DB/cache, ask user and store results |
| **Uni Auth Runtime** | Create, validate and refresh sessions |
| **User** | CAPTCHA/OTP, sensitive answers and approvals |

```mermaid
flowchart TB
    H[Portal Handler needs resource] --> N[Nodrica]
    N --> C[(Run cache / DB)]
    N --> A[Uni Auth Runtime]
    N --> U[User]
    C --> N
    A --> N
    U --> N
    N -->|resume| H
```

The handler never accesses Nodrica’s database or the user directly.

## Version-one scope

`Naukri` · `Foundit` · `Internshala` · `Indeed` · `Glassdoor`

Unknown destinations stop as `unsupported_platform`. Auto-submit is off by default.

## Visual documentation

- [Architecture](docs/architecture.md)
- [Nodrica Resource Loop](docs/nodrica-resource-protocol.md)
- [Pause and Resume](docs/contracts-and-continuation.md)
- [Safety and Security](docs/safety-and-security.md)
- [Implementation Roadmap](docs/implementation-plan.md)
- [Decisions](docs/design-decisions.md)

# portal-application-handler
