# Design Decisions

## Decision map

```mermaid
flowchart TB
    P[Portal Handler] --> T[Standalone TypeScript package]
    P --> B[Playwright isolated browser]
    P --> N[Typed needs_input to Nodrica]
    P --> C[Hybrid continuation]
    P --> S[Central submit guard]
    P --> A[Known adapters only]
```

| Topic | Final choice |
| --- | --- |
| Repository | `portal-application-handler` |
| Database/UI/login | Owned by Nodrica and Uni Auth Runtime |
| Resource request | Returned result; no direct DB/UI callback |
| Continuation | Short live lease + durable replay checkpoint |
| Auto-submit | Off by default; adapters cannot bypass guard |
| Unknown portal | `unsupported_platform` |
| Initial portals | Naukri, Foundit, Internshala, Indeed, Glassdoor |
| Persistence | None inside package |
| Evidence | Off by default; explicit host policy |
| Concurrency | One browser flow by default |

## Non-negotiable rules

```mermaid
flowchart LR
    W[Webpage content] -->|untrusted data| M[Mapper]
    N[Nodrica policy] --> K[Safety kernel]
    M --> K
    A[Portal adapters] --> K
    K --> O[Single guarded action path]
```

1. Unknown never means safe.
2. Adapters cannot bypass session, domain or submit guards.
3. Webpages cannot reach Nodrica’s DB, tools or secrets.
4. Manual challenges and sensitive decisions are never guessed.
5. Submission is allowed once and independently verified.

## Later—not version one

`AI unknown-site adapter` · `Workday` · `Greenhouse` · `Lever` · `Wellfound` · `LinkedIn` · `direct DB integration` · `distributed browser migration`

