# Monorepo Design: Personal Portfolio

**Date:** 2026-01-27
**Status:** Approved

## Overview

Monorepo setup for personal website with room for experiments and future growth. Optimized for zero hosting cost.

## Decision Summary

| Aspect          | Choice                  |
| --------------- | ----------------------- |
| Monorepo tool   | Turborepo               |
| Package manager | pnpm 9                  |
| Framework       | Next.js 15 (App Router) |
| Styling         | Tailwind CSS 4          |
| Language        | TypeScript 5            |
| Hosting         | Vercel (free tier)      |

## Project Structure

```
portfolio/
├── apps/
│   ├── web/                 # Main personal website (Next.js)
│   └── playground/          # Experiments sandbox
├── packages/
│   └── ui/                  # Shared components (add when needed)
├── docs/
│   └── plans/               # Design documents
├── turbo.json               # Turborepo config
├── pnpm-workspace.yaml      # Workspace definitions
├── package.json             # Root package.json
└── .gitignore
```

### Apps

- **`web`** — Main personal site, deploys to primary domain
- **`playground`** — Experiments, deploys to subdomain or Vercel preview URLs

### Packages

- **`ui`** — Shared components between apps (add when duplication emerges)

## Tech Stack

### Runtime & Package Manager

- **Node.js 20 LTS** — Stable, long-term support
- **pnpm 9** — Fast installs, strict dependency resolution

### Framework & Build

- **Next.js 15** — App Router, React Server Components, static export capability
- **Turborepo** — Build orchestration, local + remote caching
- **TypeScript 5** — Type safety across all apps/packages

### Styling

- **Tailwind CSS 4** — Utility-first, zero runtime

### Code Quality

- **ESLint** — Flat config
- **Prettier** — Formatting

## Deployment

### Vercel Setup

- One Vercel project per app in `apps/`
- `web` → `yourdomain.com`
- `playground` → `playground.yourdomain.com` or auto-generated URL

### Branch Strategy

- `main` — Production deploys
- Feature branches — Preview deploys (auto-generated URLs)

### Environment Variables

- Managed in Vercel dashboard per project
- `.env.local` for local development (gitignored)
- `.env.example` checked in as reference

### Turborepo Caching

- Local caching enabled by default
- Remote caching free via Vercel (`npx turbo login`)

## Scripts

```json
{
  "scripts": {
    "dev": "turbo dev",
    "build": "turbo build",
    "lint": "turbo lint",
    "dev:web": "turbo dev --filter=web",
    "dev:playground": "turbo dev --filter=playground"
  }
}
```

## Flexibility: Compatible Apps & Stacks

This monorepo can accommodate various technologies:

| Category            | Options                                  |
| ------------------- | ---------------------------------------- |
| React frameworks    | Next.js, Remix, Vite + React, Gatsby     |
| Other UI frameworks | Vue/Nuxt, Svelte/SvelteKit, Solid, Astro |
| Backend/API         | Express, Fastify, Hono, Node.js scripts  |
| Full-stack          | Next.js API routes, tRPC, GraphQL server |
| Static sites        | Vite, Astro, plain HTML/CSS/JS           |
| Mobile              | React Native, Expo                       |
| Desktop             | Electron, Tauri                          |
| CLI tools           | Node.js CLI scripts                      |
| Packages            | Shared UI components, utilities, configs |

### Adding New Apps

```bash
cd apps
pnpm create next-app experiment-name
# or: pnpm create vite experiment-name
# or: pnpm create svelte experiment-name
```

### Bun Compatibility

Bun can be used within this monorepo:

- **Bun as runtime**: Keep pnpm + Turborepo at root, use `bun run` for specific apps
- **Bun for experiments**: Mix Node and Bun apps freely
- **Bun-native frameworks**: Hono, Elysia work great

Example Bun app scripts:

```json
{
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "build": "bun build src/index.ts --outdir=dist"
  }
}
```

Turborepo orchestrates builds regardless of runtime — it just calls npm scripts.

**Note:** Next.js runs on Node in Vercel production, but Bun can run it locally.

## Not Included (YAGNI)

Adding later when needed:

- Testing framework
- Storybook
- CI/CD beyond Vercel
- Husky + lint-staged
