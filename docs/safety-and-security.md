# Safety and Security

## Submit gate

```mermaid
flowchart TD
    S[Final step] --> A{autoSubmit?}
    A -->|no| R[review_required]
    A -->|yes| T{Trusted adapter/domain?}
    T -->|no| R
    T -->|yes| F{Required fields verified?}
    F -->|no| N[needs_input]
    F -->|yes| Q{Sensitive/manual/ambiguous?}
    Q -->|yes| R
    Q -->|no| C{High confidence + current fingerprint?}
    C -->|no| R
    C -->|yes| P[Submit once]
    P --> V[Verify outcome]
```

Auto-submit defaults to **off**.

## Threat map

| Risk | Guard |
| --- | --- |
| Portal prompt injection | Portal content is data only; controlled key taxonomy |
| Unsafe redirect | Exact-domain adapter registry + redirect budget |
| Session/account mixing | One isolated context per provider/account |
| Accidental duplicate submit | Action ledger + one-time fingerprinted approval |
| Guessed sensitive answer | Mandatory explicit value/review |
| CAPTCHA/OTP | Pause for user; never bypass |
| Arbitrary file access | Host-approved references + type/size checks |
| PII/secret leakage | Redacted structured logging; evidence off by default |
| Infinite/hostile flow | Time, step, click, redirect, field and upload limits |
| Adapter drift | Versioned selectors + fail-closed unknown state |

## Sensitive-answer route

```mermaid
flowchart LR
    F[Detected question] --> C{Sensitive category?}
    C -->|no| M[Normal mapping rules]
    C -->|yes| E{Explicit approved value?}
    E -->|yes| R[review policy]
    E -->|no| U[ask user]
    R --> G[fill only if permitted]
    U --> G
```

Sensitive categories: legal declarations, authorization/sponsorship, compensation, disability/demographics, relocation/travel, consent and electronic signatures.

## Browser boundary

```mermaid
flowchart TB
    S[Approved session artifact] --> C[New isolated context]
    C --> P[Registered application flow]
    P --> E[Redacted events]
    P --> X[Optional policy-controlled evidence]
    P --> Z[Guaranteed cleanup]
```

- No personal browser profiles or credentials
- No raw sessions in frontend, output or logs
- Popups/downloads/permissions denied unless explicitly scoped
- One application page by default
- Screenshots only for opted-in review/failure policy

Portal terms, rate limits and permitted automation remain the adopter’s responsibility.

