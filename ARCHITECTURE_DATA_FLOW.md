# Ai-Cha Menu Architecture & Data Flow

This document contains the sequence diagram representing the production data flow of the system.
You can use this as a reference to draw your Excalidraw diagram.

```mermaid
sequenceDiagram
    autonumber
    
    actor Customer as Customer (WebApp)
    actor Staff as Staff (Staff App)
    participant CF_WAF as Cloudflare DNS & WAF
    participant Tunnel as Cloudflare Tunnel (Railway)
    participant API as Node.js API (Railway)
    participant Redis as Redis (Railway)
    participant DB as PostgreSQL (Railway)
    participant R2 as Cloudflare R2 (Storage)
    participant TG as Telegram API
    participant ABA as ABA Payway API

    %% 1. Ingress Flow
    rect rgb(240, 240, 240)
    Note over Customer, Tunnel: 1. Secure Ingress & WAF
    Customer->>CF_WAF: Visit menu.aichazhengdaarakawa.com
    Staff->>CF_WAF: Visit staff.aichazhengdaarakawa.com
    CF_WAF-->>Customer: Serve Static Assets (React/Vite)
    CF_WAF-->>Staff: Serve Static Assets (React/Vite)
    
    Customer->>CF_WAF: POST /api/orders (HTTPS)
    CF_WAF->>Tunnel: Route to Tunnel ID
    Tunnel->>API: Proxy to internal port 4000
    end

    %% 2. Auth & Rate Limiting
    rect rgb(230, 245, 255)
    Note over API, Redis: 2. Distributed Auth & Rate Limits
    API->>Redis: Check Rate Limit (IP)
    Redis-->>API: Allow/Deny
    API->>Redis: Get Session State / Validate Telegram ID
    Redis-->>API: Return User Identity
    end

    %% 3. Database Operations
    rect rgb(240, 255, 240)
    Note over API, DB: 3. Core Database Operations
    API->>DB: prisma.order.create()
    DB-->>API: Return Order Row
    API->>DB: prisma.menuItem.findMany()
    DB-->>API: Return Catalog Data
    end

    %% 4. File Uploads (Staff Only)
    rect rgb(255, 245, 230)
    Note over Staff, R2: 4. Image Uploads (Memory Safe)
    Staff->>API: POST /api/upload (Multipart Form)
    API->>API: Buffer to Disk (/tmp) to save RAM
    API->>R2: Stream file to S3 API (PutObject)
    R2-->>API: Return Public URL
    API->>API: Delete temporary /tmp file
    API-->>Staff: Return { url: publicUrl }
    end

    %% 5. External Integrations
    rect rgb(255, 240, 245)
    Note over API, ABA: 5. External Webhooks & APIs
    API->>ABA: Generate Transaction ID & KHQR
    ABA-->>API: Return KHQR Code
    
    API->>TG: sendMessage (Order Notification)
    TG-->>API: OK
    
    TG->>CF_WAF: Webhook (Customer clicks "My Orders")
    CF_WAF->>Tunnel: Proxy Webhook
    Tunnel->>API: POST /api/telegram-webhook
    API->>TG: Return message/menu layout
    end
```
