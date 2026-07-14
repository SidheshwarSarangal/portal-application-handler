# Nodrica Resource Loop

## “Ask Nodrica” means return—not call

```mermaid
flowchart TD
    H[Handler is blocked] --> Q[Return typed ResourceRequest]
    Q --> N[Nodrica validates request]
    N --> R{Resolve in order}
    R --> A[1. Current run]
    A --> B[2. Run cache]
    B --> C[3. Approved DB repository]
    C --> D[4. Uni Auth Runtime]
    D --> E[5. Ask user]
    E --> X[ResourceResponse]
    X --> H2[Validate + resume handler]
```

The sequence stops as soon as an approved source resolves the resource.

## Request envelope

```mermaid
classDiagram
    class ResourceRequest {
      requestId
      runId
      kind
      key
      purpose
      providerAccount
      constraints
      sensitivity
      allowedSources
      cacheHint
      continuation
    }
```

| `kind` | Resolved by |
| --- | --- |
| `session` | Session cache → Uni Auth Runtime → user login |
| `field_value` | Run data → profile DB → user |
| `file` | Approved file repository → user |
| `manual_action` | User only |
| `review` | Policy engine → user when required |
| `confirmation` | User or explicit current-run policy |

## Database safety boundary

```mermaid
flowchart LR
    P[Untrusted portal text] --> M[Controlled field mapper]
    M --> K{Allowlisted key?}
    K -->|yes| N[Nodrica policy check]
    N --> R[Parameterized repository method]
    R --> D[(Database)]
    K -->|no| U[unknown field / review]
    P -. never .-> D
```

Portal text can never provide SQL, collection names, paths, prompts or database instructions.

## Response checks

```mermaid
flowchart LR
    R[ResourceResponse] --> I{runId + requestId match?}
    I -->|no| X[Reject]
    I -->|yes| E{Expected type and constraints?}
    E -->|no| X
    E -->|yes| C{Request still pending?}
    C -->|no| X
    C -->|yes| A[Accept once + resume]
```

## Reuse policy

| Resource | Default retention |
| --- | --- |
| Valid session | Same run/provider/account |
| Basic profile facts | Run; DB update only by Nodrica policy |
| Job-specific answer | Current job |
| Salary/sponsorship/relocation | Current policy + review |
| Demographic/legal answer | Never infer; normally do not store |
| Submit approval | One form fingerprint, one attempt |

