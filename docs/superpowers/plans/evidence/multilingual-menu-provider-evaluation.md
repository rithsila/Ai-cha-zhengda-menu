# Multilingual Menu Translation Provider Evaluation

**Date:** 2026-09-08  
**Scope:** Evaluation of AI translation providers for Ai-Cha (beverages/desserts) and Zhengda (fried chicken/meals) menu content across English (`en`), Khmer (`km`), and Chinese (`zh`).

---

## 1. Candidate Models Researched

| Provider | Candidate Model ID | API Contract | Prompt Caching / Structured Outputs | Pricing (Input / Output per 1M tokens) | Typical Latency (p50) |
|---|---|---|---|---|---|
| OpenAI | `gpt-4o-mini` | Chat Completions / Structured Outputs (`json_schema` / `response_format: { type: "json_object" }`) | Yes | $0.15 / $0.60 | ~800ms - 1500ms |
| OpenAI | `gpt-4o` | Chat Completions / Structured Outputs | Yes | $2.50 / $10.00 | ~1200ms - 2500ms |
| Google Cloud | `gemini-1.5-flash` | REST generateContent (`response_mime_type: "application/json"`) | Yes | $0.075 / $0.30 | ~700ms - 1400ms |
| Anthropic | `claude-3-5-haiku-20241022` | Messages API (`tool_choice` or prefilled JSON) | Yes | $0.80 / $4.00 | ~900ms - 1800ms |

---

## 2. Evaluation Criteria

1. **Khmer Language Quality Gate:**
   - Evaluated on 30 menu items/descriptions/modifiers in `apps/api/tests/fixtures/translation-evaluation.json`.
   - Meaning accuracy (1–5 scale).
   - Natural phrasing in Cambodian F&B context (1–5 scale).
   - **Zero tolerance** for changed ingredients, quantities, sizes (e.g. 500ml vs 700ml), or altered brand identity ("Ai-Cha", "Zhengda").
   - Minimum threshold: Mean score $\ge 4.0 / 5.0$ on target Khmer output.
2. **English and Chinese Quality:**
   - English: Natural menu descriptors, concise titles, standard capitalization.
   - Chinese: Standard Simplified Chinese culinary terms (matching existing brand dictionary).
   - Minimum threshold: Mean score $\ge 4.0 / 5.0$ on target outputs.
3. **Operational Criteria:**
   - Strict adherence to JSON schema output.
   - Request timeout $\le 20$ seconds.
   - Bounded token usage and predictable latency.

---

## 3. Reviewer Availability & Status

> **CRITICAL COMPLIANCE NOTICE:**  
> In accordance with project instructions:
> - Live AI API credentials and human fluent native Khmer/Chinese reviewers were **not provided for live paid execution** during this automated build.
> - **Quality scores and human ratings are NOT fabricated.**
> - Status: **UNVERIFIED (Pending Human Evaluation & API Credentials)**.
> - Default Operational State: `TRANSLATION_ENABLED="false"`.
> - Automated testing environment uses a deterministic/mocked adapter (`MockTranslationProvider`) ensuring complete test isolation with zero live cost.

---

## 4. Default Selected Adapter Specification

- **Selected Provider Protocol:** OpenAI Chat Completions-compatible endpoint (`/v1/chat/completions`) using model `gpt-4o-mini` (or configurable via `TRANSLATION_MODEL`).
- **Configuration Keys:**
  - `TRANSLATION_ENABLED` (boolean, default: `"false"`)
  - `TRANSLATION_MODEL` (string, default: `"gpt-4o-mini"`)
  - `TRANSLATION_API_KEY` (string, secret)
- **Fallback & Safety:**
  - When disabled (`TRANSLATION_ENABLED !== "true"` or missing key), API returns `503 Service Unavailable` with message `"Automatic translation is currently disabled or unconfigured."`
  - In unit and E2E tests, dependency injection allows plugging `MockTranslationProvider` or deterministic stubs.
