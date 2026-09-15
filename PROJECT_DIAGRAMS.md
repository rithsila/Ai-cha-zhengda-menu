# Ai-Cha Menu Project Diagrams

This document contains standard Mermaid.js diagrams mapping the complete infrastructure, database, and system architecture of the Ai-Cha Menu platform. You can copy the code blocks into [Excalidraw](https://excalidraw.com/) (using the "Insert -> Mermaid" feature), draw.io, or view them directly on GitHub.

## 1. System Architecture & Data Flow

This diagram shows how the user interacts with the system, how data moves through the network, and how the external APIs are connected.

```mermaid
flowchart TD
    %% Actors
    Customer[Customer / WebApp]
    Staff[Staff / Admin Hub]
    
    %% Cloudflare Layer
    subgraph Cloudflare["Cloudflare Edge"]
        WAF[Cloudflare WAF / DNS]
        Pages[Cloudflare Pages - Static Hosting]
        R2[(Cloudflare R2 Storage)]
    end
    
    %% Railway Layer
    subgraph Railway["Railway Internal Network"]
        Tunnel[Cloudflare Tunnel]
        API[Node.js Express API]
        Redis[(Redis - Auth & Rate Limiting)]
        Postgres[(PostgreSQL Database)]
    end
    
    %% External APIs
    subgraph External["External Services"]
        Telegram[Telegram Bot API]
        ABA[ABA Payway]
    end

    %% Connections
    Customer -->|Visits menu.domain.com| Pages
    Staff -->|Visits staff.domain.com| Pages
    
    Customer -->|POST /api/orders| WAF
    Staff -->|GET /api/orders| WAF
    
    WAF -->|Secure Proxy| Tunnel
    Tunnel -->|Proxy to Port 4000| API
    
    API <-->|Check Sessions & Rate Limits| Redis
    API <-->|Read/Write Data| Postgres
    API -->|Upload Images| R2
    
    API -->|Create KHQR| ABA
    ABA -->|Payment Webhook| WAF
    
    API -->|Send Notifications| Telegram
    Telegram -->|User Clicks /start| WAF
```

---

## 2. Entity-Relationship (ER) Diagram

This diagram maps the core Prisma database schema, showing how orders, users, menu items, and localized text relate to one another.

```mermaid
erDiagram
    User ||--o{ Order : places
    User ||--o{ PrizeClaim : wins
    Order }|--|| Branch : assigned_to
    Order ||--|{ OrderItem : contains
    OrderItem }|--|| MenuItem : references
    MenuItem ||--|{ ModifierGroup : has
    ModifierGroup ||--|{ ModifierOption : has
    PrizeClaim }|--o| StaffAccount : claimed_by

    User {
        String telegramUserId PK
        String firstName
        String phone
        Int loyaltyPoints
        Int luckyTickets
    }

    Order {
        String id PK
        Float totalAmount
        String paymentMethod
        String status
        String orderType
        String pickupCode
        Float discountApplied
        Int pointsEarned
        Int pointsRedeemed
    }

    MenuItem {
        String id PK
        String category
        String name
        Float basePrice
        Boolean isSoldOut
        Boolean isActive
    }

    ModifierGroup {
        String id PK
        String name
        String type "single/multiple"
        Boolean required
    }

    ModifierOption {
        String id PK
        String name
        Float priceDelta
    }

    StaffAccount {
        String id PK
        String name
        String role "staff/manager"
        Boolean isActive
    }

    PrizeClaim {
        String id PK
        String code
        String prizeName
        String status "pending/claimed/expired"
        DateTime claimedAt
    }
```

---

## 3. Localization & Audit Subsystem

A closer look at the advanced subsystems tracking translations and security audits.

```mermaid
erDiagram
    LocalizedText ||--|{ LocalizedTextValue : has_translations
    AuditLog }|--o| StaffAccount : performed_by
    AuditLog }|--o| User : performed_by

    LocalizedText {
        String id PK
        String ownerType "item/category/modifier"
        String ownerKey "target_id"
        String field "name/description"
        String sourceText
        Int sourceRevision
    }

    LocalizedTextValue {
        String id PK
        String locale "en/km/zh"
        String text
        String origin "manual/ai"
        Boolean reviewed
    }

    AuditLog {
        String id PK
        String action "PAYMENT_INITIATED/ORDER_STATUS_CHANGED/etc"
        String entityType
        String entityId
        String oldValue
        String newValue
        String metadata
        DateTime createdAt
    }
```
