# Collections Copilot: System Design Diagrams

Assumptions are labelled A1, A2 and so on, and are listed in the TDD.

## 1. System context (who uses it, what it touches)

```mermaid
flowchart LR
    officer([Field officer<br/>phone, one hand, weak signal])
    manager([Branch manager<br/>desktop])
    borrower([Borrower<br/>receives reminders])

    subgraph cc[Collections Copilot]
        app[PWA + API + Database]
    end

    los[(Loan system<br/>daily overdue CSV)]
    msg[[SMS / WhatsApp gateway<br/>MOCKED]]
    maps[[Maps and dialler<br/>device deep links]]

    manager -->|uploads CSV, views roll rates| app
    officer -->|views list, logs outcomes| app
    los -.->|export, manual upload| manager
    app -.->|reminder after officer taps send| msg
    msg -.-> borrower
    officer -->|tel: and geo: links| maps
```

## 2. High-level architecture (containers)

```mermaid
flowchart TB
    subgraph device[Officer phone - React PWA]
        ui[UI: list, detail, 3-tap outcome<br/>Hindi / English]
        sw[Service worker<br/>app shell cache]
        idb[(IndexedDB<br/>cached list + outbox queue)]
        sync[Sync engine<br/>retry with backoff]
        ui --> idb
        idb --> sync
        sw --- ui
    end

    subgraph web[Manager browser - React]
        dash[Dashboard, CSV import,<br/>promise tracker, activity log]
    end

    subgraph api[FastAPI modular monolith]
        direction TB
        gw[HTTP layer: routers,<br/>JWT auth, role + scope checks,<br/>Pydantic validation]
        subgraph mods[Service modules]
            auth[auth]
            imp[imports]
            asg[assignment]
            scr[scoring]
            out[outcomes]
            prm[promises]
            win[contact_window]
            rep[reports]
            tpl[templates + word filter]
        end
        gw --> mods
    end

    db[(PostgreSQL)]
    enc[Field encryption<br/>borrower phone and name]

    sync -->|POST /outcomes/batch<br/>idempotent| gw
    ui -->|GET /my/list| gw
    dash --> gw
    mods --> db
    mods --- enc
```

## 3. Request layering inside the backend

```mermaid
flowchart LR
    r[Router<br/>HTTP only] --> s[Service<br/>business rules<br/>pure where possible]
    s --> repo[Repository<br/>SQLAlchemy queries]
    repo --> d[(PostgreSQL)]
    s --> pure[Pure functions<br/>score, window check,<br/>roll rate, word filter]
```

Business rules never import FastAPI, so they are unit-testable without a server.

## 4. Database design (ERD)

```mermaid
erDiagram
    BRANCH ||--o{ USER : employs
    BRANCH ||--o{ LOAN : owns
    USER ||--o{ ASSIGNMENT : receives
    LOAN ||--o{ ASSIGNMENT : "assigned via"
    LOAN ||--o{ OUTCOME : has
    LOAN ||--o{ PROMISE : has
    LOAN ||--o{ SCORE_SNAPSHOT : scored
    LOAN ||--o{ CONTACT_ATTEMPT : audited
    USER ||--o{ OUTCOME : logs
    USER ||--o{ CONTACT_ATTEMPT : makes
    OUTCOME ||--o| PROMISE : creates
    IMPORT_BATCH ||--o{ LOAN : loaded
    USER ||--o{ IMPORT_BATCH : uploads
    REMINDER_TEMPLATE ||--o{ REMINDER_DRAFT : basis
    LOAN ||--o{ REMINDER_DRAFT : for

    BRANCH {
        int id PK
        string name
        string pincode_range
    }
    USER {
        int id PK
        string username UK
        string password_hash
        string role "officer or manager"
        int branch_id FK
        string language
    }
    LOAN {
        string loan_id PK
        string borrower_name_enc
        string phone_enc
        string pincode
        int branch_id FK
        decimal outstanding
        int dpd
        date last_payment_date
        int batch_id FK
        string status
    }
    ASSIGNMENT {
        int id PK
        string loan_id FK
        int officer_id FK
        boolean active
        int manual_rank "manager reorder"
        datetime assigned_at
    }
    OUTCOME {
        uuid client_id PK "idempotency key"
        string loan_id FK
        int officer_id FK
        string result "paid promise unreachable dispute"
        decimal lat
        decimal lng
        datetime occurred_at "device time"
        datetime received_at "server time"
        string note
    }
    PROMISE {
        int id PK
        string loan_id FK
        uuid outcome_id FK
        date promise_date
        decimal amount
        string state "open kept broken"
    }
    SCORE_SNAPSHOT {
        int id PK
        string loan_id FK
        float score
        json reasons "top 3"
        date scored_on
    }
    CONTACT_ATTEMPT {
        int id PK
        string loan_id FK
        int officer_id FK
        string channel "call sms whatsapp visit"
        datetime attempted_at
        boolean allowed
        string block_reason
    }
    IMPORT_BATCH {
        int id PK
        int uploaded_by FK
        int rows_ok
        int rows_rejected
        datetime created_at
    }
    REMINDER_TEMPLATE {
        int id PK
        string language
        string body
        boolean approved
    }
    REMINDER_DRAFT {
        int id PK
        string loan_id FK
        int template_id FK
        string text
        string state "draft sent blocked"
    }
```

## 5. Daily flow: import and assignment

```mermaid
sequenceDiagram
    actor M as Manager
    participant API as FastAPI
    participant IMP as imports
    participant ASG as assignment
    participant SCR as scoring
    participant DB as PostgreSQL

    M->>API: POST /imports (CSV)
    API->>IMP: parse and validate rows
    IMP->>DB: upsert valid loans in one transaction
    IMP-->>API: ok count + rejected rows with reasons
    API->>ASG: assign unassigned loans
    ASG->>DB: officers in branch + current load
    ASG->>DB: write assignments (pincode match, then least loaded)
    API->>SCR: score all open loans
    SCR->>DB: save score snapshots with top 3 reasons
    API-->>M: summary: loaded, rejected, assigned
```

## 6. Offline outcome logging and sync (the hard part)

```mermaid
sequenceDiagram
    actor O as Officer
    participant UI as PWA UI
    participant Q as IndexedDB outbox
    participant S as Sync engine
    participant API as FastAPI
    participant DB as PostgreSQL

    O->>UI: tap result (paid / promise / unreachable / dispute)
    UI->>UI: capture GPS, create client UUID
    UI->>Q: save outcome as pending
    UI-->>O: shown immediately as "pending sync"

    loop while online and queue not empty
        S->>Q: read oldest pending items
        S->>API: POST /outcomes/batch with items
        API->>API: validate, check scope and contact window
        alt UUID already stored
            API->>DB: no change (duplicate retry)
            API-->>S: item status duplicate-ok
        else new UUID
            API->>DB: insert outcome and promise, one transaction
            API-->>S: item status created
        else invalid or forbidden
            API-->>S: item status rejected with reason
        end
        S->>Q: mark synced or failed per item
    end
    S-->>UI: update badge: all synced
```

Each item gets its own status, so one bad item never blocks the rest of the batch.

## 7. Contact-window rule (RBI, 8 am to 7 pm IST)

```mermaid
flowchart TD
    A([Officer taps Call or Send reminder]) --> B[Server converts now to IST]
    B --> C{08:00 <= time < 19:00?}
    C -->|Yes| D[Allow]
    C -->|No| E[Block with reason]
    D --> F[(Write contact_attempt allowed=true)]
    E --> G[(Write contact_attempt allowed=false)]
    F --> H([Open dialler / allow send])
    G --> I([Show "contact not permitted until 8 am"])
```

The server clock decides, never the phone clock. Blocked attempts are recorded too.

## 8. Promise to pay lifecycle

```mermaid
stateDiagram-v2
    [*] --> Open: officer logs promise
    Open --> Kept: payment outcome on or before date
    Open --> Broken: promise date passed, no payment
    Broken --> Open: new promise logged
    Kept --> [*]
    Broken --> [*]: loan closed or escalated
```

## 9. Reminder draft safety flow

```mermaid
flowchart TD
    A([Officer taps Draft reminder]) --> B[Pick approved template by language]
    B --> C[Fill fields: name, amount, date]
    C --> D{Word filter:<br/>threatening language?}
    D -->|Yes| E[Block draft and log]
    D -->|No| F[Show draft to officer]
    F --> G{Officer taps Send?}
    G -->|No| H([Nothing sent])
    G -->|Yes| I{Inside contact window?}
    I -->|No| J([Blocked and logged])
    I -->|Yes| K([Sent via mock gateway and logged])
```

## 10. Deployment

```mermaid
flowchart LR
    dev[Developer<br/>git push] --> gh[GitHub public repo]
    gh --> fe[Frontend host<br/>static PWA + CDN]
    gh --> be[Backend host<br/>Docker, FastAPI]
    be --> pg[(Managed Postgres)]
    phone[Officer phone] --> fe
    phone --> be
    mgr[Manager browser] --> fe
    mgr --> be
    env[[Environment variables<br/>SECRET_KEY, DATABASE_URL,<br/>FIELD_ENC_KEY, CORS_ORIGINS]] -.-> be
```
