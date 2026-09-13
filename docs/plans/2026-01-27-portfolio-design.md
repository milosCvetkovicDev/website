# Portfolio Website Design

**Date:** 2026-01-27
**Status:** Approved

## Overview

Personal portfolio website for Milos Cvetkovic, Senior Full-Stack Software Engineer with 10+ years experience. The site serves multiple goals: job opportunities, freelance/consulting clients, and personal brand building.

## Goals & Audience

| Goal                    | Target Audience             |
| ----------------------- | --------------------------- |
| Land new roles          | Recruiters, hiring managers |
| Attract consulting work | Potential clients, CTOs     |
| Build personal brand    | Developer community, peers  |

## Brand Identity

### Tone

- **Innovative & bold** — Highlight AI-native approach, forward-thinking
- **Approachable & human** — Friendly, relatable, easy to connect with

### Visual Identity

| Element          | Value                               |
| ---------------- | ----------------------------------- |
| Theme            | Dark/light toggle (user preference) |
| Dark background  | `#0a0a0a`                           |
| Light background | `#fafafa`                           |
| Dark text        | `#fafafa`                           |
| Light text       | `#171717`                           |
| Accent color     | `#8b5cf6` (purple)                  |
| Headings font    | Geist                               |
| Body font        | Geist                               |
| Code font        | Geist Mono                          |

### Why Purple?

Purple conveys innovation and AI-forward thinking, aligning with the pioneering work in AI-assisted development.

## Information Architecture

```
/                     → Home (Hero + highlights)
/about                → Extended bio, philosophy, journey
/work                 → Case studies overview
/work/[slug]          → Individual case study pages
/skills               → Interactive tech stack grid
/blog                 → Articles/writing (placeholder for now)
/contact              → Social links (no email displayed)
```

## Page Designs

### Home Page (/)

```
┌─────────────────────────────────────────────────────────┐
│  [Dark/Light Toggle]        [About | Work | Skills | Blog | Contact]
│
│  Hi, I'm Milos Cvetkovic
│
│  ← Rotating text animation →
│  "AI-Native Engineer"
│  "Legacy Modernization Expert"
│  "Full-Stack Architect"
│
│  I turn legacy codebases into cloud-native solutions
│  and pioneer AI-assisted development workflows.
│
│  [View My Work]  [Get In Touch]
│
│  10+ years · Belgrade, Serbia
└─────────────────────────────────────────────────────────┘
```

**Sections:**

1. Hero with rotating taglines
2. Highlights (3 cards: AI Innovation, Modernization, Full-Stack)
3. Featured Work (2-3 case study previews)
4. Tech Stack (visual grid)
5. CTA (contact prompt)

### About Page (/about)

**Sections:**

1. Professional photo/avatar placeholder
2. Short bio (2-3 sentences)
3. Journey timeline (2013 → 2026)
4. What drives me (values)
5. Certifications (Angular Certified Architect)

### Work Page (/work)

Grid of case study cards with:

- Project name
- One-line description
- Tech stack badges
- Link to full case study

### Case Study Pages (/work/[slug])

**Template structure:**

```
→ THE CHALLENGE
  Brief problem statement (2-3 sentences)

→ MY APPROACH
  Technical decisions, architecture choices

→ KEY CONTRIBUTIONS
  Bullet points of personal contributions

→ TECHNICAL DEEP-DIVE
  Architecture diagram, code patterns

→ IMPACT
  Metrics where shareable

→ TECH STACK
  Visual badges for technologies
```

### Skills Page (/skills)

Interactive grid with:

- Hover for technology details
- Click to filter related projects
- Grouped by category

**Categories:**

- AI & Automation (Claude Code, Claude Agent SDK, AI-Native Dev)
- Languages (TypeScript, JavaScript, SQL)
- Frontend (React, Next.js, Angular, Tailwind)
- Backend (Node.js, NestJS, Express, Elysia, Bun)
- Cloud & Infrastructure (Azure, AWS, Terraform, Kubernetes, Docker)
- DevOps & CI/CD (GitHub Actions, Nx, Monorepos)
- Architecture (Clean Architecture, DDD, Microservices)

### Blog Page (/blog)

Placeholder with:

- "Coming soon" message
- Topics preview (AI workflows, modernization, architecture, DevOps)
- Social follow CTA

### Contact Page (/contact)

- Opening line: "Open to opportunities, consulting, and collaboration"
- Social links only (LinkedIn, Twitter, GitHub)
- No email displayed (spam protection)
- Location: "Based in Belgrade, Serbia · Available remotely"

## Case Studies

### Data Protection Rules

**CRITICAL:** No sensitive employer data.

- No company names in public content
- Use generic domain descriptions
- Focus on personal technical contributions
- No screenshots, URLs, or identifiable details from employer projects

### Featured Projects

| Public Name             | Hook                                                        |
| ----------------------- | ----------------------------------------------------------- |
| Self-Healing Agent      | "Built an AI that fixes its own bugs"                       |
| Enterprise B2B Platform | "Modernized legacy to cloud-native with Clean Architecture" |
| Nx Remote Cache Server  | "High-performance build infrastructure with Bun"            |

> **Redacted 2026-09-12.** This table had a third column naming, for each public case study, the
> internal employer project it stands for, and the Content Sources section below cited a CV PDF
> tracked under `docs/` that carried personal contact details. Both were removed, and the PDF was
> deleted from the repository, because this repository is public and each contradicted the Data
> Protection Rules stated immediately above and the "No email displayed" rule under Contact Page.
> The public names and hooks are unchanged. This is a Shipped design document kept as history, so
> the redaction is recorded here rather than made silently; see
> [ADR 0012](../adr/0012-correcting-accepted-records.md) for the lifecycle rule.

### Case Study 1: Self-Healing Agent

**Public description:**
AI-powered system that monitors production errors and autonomously proposes fixes via pull requests.

**Tech stack:**

- Runtime: Bun
- Framework: Elysia
- AI: Claude Agent SDK (Anthropic)
- Monitoring: Azure Log Analytics
- Storage: Azure Table Storage
- VCS: GitHub API

**Key contributions:**

- Designed autonomous error analysis using Claude AI
- Implemented automatic PR creation with fixes
- Built CI pipeline monitoring with retry logic (max 3 attempts)
- Added safety constraints (daily limits, budget caps, confidence thresholds)
- Created kill switch and emergency override controls

**Impact:**

- Reduced mean time to resolution (MTTR)
- 24/7 automated incident response
- Human oversight maintained via approval gates

### Case Study 2: Enterprise B2B Platform

**Public description:**
Full-stack modernization of a legacy enterprise platform, applying Clean Architecture and DDD principles.

**Tech stack:**

- Frontend: React 18, Material-UI, Vite, TypeScript
- Backend: Express.js/Node.js, TypeORM, PostgreSQL, Zod
- Testing: Jest, Playwright (4-way sharding)
- Infrastructure: Microsoft Azure (Container Apps, PostgreSQL Flexible Server)
- IaC: Terraform (multi-environment)
- CI/CD: GitHub Actions, Nx monorepo

**Key contributions:**

- Migrated flat file structure to Clean Architecture layers
- Replaced manual validation with Zod schemas
- Built background job system with pg-boss
- Architected modular CI/CD with reusable GitHub composite actions
- Implemented security scanning (Gitleaks, npm audit, Trivy)
- Designed multi-environment Terraform architecture

**Impact:**

- Faster development cycles through automation
- Reduced CI time with affected-only deployments
- Improved code quality through comprehensive testing

### Case Study 3: Nx Remote Cache Server

**Public description:**
High-performance remote cache server for Nx build artifacts, dramatically reducing CI/CD build times.

**Tech stack:**

- Runtime: Bun
- Framework: Elysia
- Storage: Azure Blob Storage + LRU in-memory cache
- Auth: Dual-token (read/write) with timing-safe comparison

**Key contributions:**

- Built LRU in-memory caching for hot artifacts
- Implemented Azure Blob Storage for persistence
- Added rate limiting (1000 req/min)
- Created health checks for container orchestration

**Impact:**

- Cache hits skip rebuilds entirely
- Consistent builds across developer machines
- Reduced cloud compute costs

## Technical Implementation

### Stack

- Framework: Next.js 15 (App Router)
- Styling: Tailwind CSS 4
- Language: TypeScript 5
- Hosting: Vercel (free tier)

### Features to Implement

- Dark/light mode toggle with system preference detection
- Rotating text animation in hero
- Interactive skills grid with filtering
- Case study pages with MDX or structured data
- SEO optimization (meta tags, Open Graph)
- Responsive design (mobile-first)

### Not Included (YAGNI)

- Contact form (add later if needed)
- Analytics (add later)
- CMS integration (static content for now)
- Blog functionality (placeholder only)

## Content Sources

- All content derived from the author’s CV, sanitized for public display. The CV itself is not
  tracked in this repository (see the redaction note under Featured Projects).
