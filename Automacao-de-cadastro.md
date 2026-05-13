# NEXUS AI — AUTONOMOUS GAM INGESTION ARCHITECTURE

# Adsnap Cloud

# Vision: Fully Automated AdOps Registration Pipeline

---

# OBJECTIVE

Transform the Nexus AI from a:

- screenshot composition system

Into:

- an autonomous AdOps operational runtime

The new Nexus flow must allow the operator to provide ONLY:

- Client Name
- Agency
- PI
- Flight Date
- Google Ad Manager Setup Link

Everything else must be discovered automatically by the system.

---

# FINAL GOAL

The Nexus AI should autonomously:

1. Open the Google Ad Manager setup
2. Understand the campaign structure
3. Detect line items
4. Detect formats automatically
5. Detect creatives automatically
6. Generate preview links automatically
7. Open real GAM previews
8. Render the ads inside real environments
9. Capture screenshots automatically
10. Save all captures into Adsnap Timeline
11. Create campaign scheduling automatically
12. Register the campaign automatically

WITHOUT manual operational input.

---

# CORE PHILOSOPHY CHANGE

OLD MODEL:

```txt
AI + Vision + Image Composition

NEW MODEL:

AI + Browser Automation + DOM Intelligence

The browser becomes the source of truth.

The Nexus no longer "simulates" ads.
The Nexus consumes REAL GAM previews.

WHY THIS IS SUPERIOR

Current assembly systems suffer from:

coordinate mismatches
CSS layering issues
viewport inconsistencies
browser offset problems
responsive rendering drift
image composition artifacts

The GAM preview system already solves all of this internally.

Therefore:
The Nexus should leverage the official render pipeline instead of rebuilding it artificially.

NEW NEXUS ARCHITECTURE

graph TD

A[User Input]
--> B[Nexus Chat]

B --> C[Intent Parser]

C --> D[Campaign Intake Engine]

D --> E[GAM Automation Runtime]

E --> F[Playwright Persistent Session]

F --> G[Extract Line Items]

G --> H[Extract Formats]

H --> I[Extract Creatives]

I --> J[Generate Preview Links]

J --> K[Render Official Preview]

K --> L[Capture Screenshot]

L --> M[Save Timeline]

M --> N[Schedule Campaign]



IMPORTANT

Browser workers must:

reuse sessions
persist cookies
isolate jobs
retry failures automatically
PHASE 9 — AI RESPONSIBILITIES

The AI should:

orchestrate
interpret
summarize
validate

The AI should NOT:

infer coordinates
compose images manually
detect layouts visually
reconstruct ad rendering

The browser already handles rendering correctly.

REMOVE FROM PRIMARY PIPELINE

The following should become optional/fallback systems:

Vision AI coordinate detection
compositionBox logic
CSS overlay assembly
manual raster positioning

The official GAM preview becomes the primary rendering source.

PHASE 10 — FUTURE EXPANSION

Future Nexus capabilities:

automatic reporting
delivery validation
campaign anomaly detection
viewability analysis
creative compliance verification
broken preview detection
historical preview timeline
autonomous QA
FINAL ARCHITECTURAL PRINCIPLE

The Nexus AI is no longer:

an AI montage system

The Nexus AI becomes:

an autonomous AdOps operating system

The browser becomes:

the rendering engine
the source of truth
the operational runtime

The AI becomes:

the orchestrator
the operator
the intelligence layer
```
