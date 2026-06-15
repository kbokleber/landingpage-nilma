# AGENTS.md

## Cursor Cloud specific instructions

This repo is a single static marketing landing page for a Brazilian lawyer ("Dra. Nilma") plus a password-protected admin panel for managing client testimonials. It is a Node.js/Express app with no database and no build step — persistence is flat JSON files on disk.

### Services

There is exactly **one service**: the Node/Express server (`server/index.js`). It serves both the public landing page and the admin panel and exposes all `/api/*` endpoints.

- Run (dev): `npm run dev` (identical to `npm start`; both run `node server/index.js`). There is no separate build step and no hot-reload/watcher — restart the process manually after editing server code.
- Port: `3001` when `.env` exists (from `.env.example`); the code itself defaults to `3000` if `PORT` is unset.
- URLs: landing page `http://localhost:3001/`, admin `http://localhost:3001/admin/`.
- Admin password: value of `ADMIN_PASSWORD` (defaults to `nilma-admin` in `.env.example` and as the in-code fallback).

### Environment file

Copy `.env.example` to `.env` before running (`.env` is gitignored). Defaults are sufficient for full local testing; the Google OAuth vars can stay blank.

### Lint / test / build

There are **no lint, test, or build scripts** in this repo (only `start`/`dev` in `package.json`, and no test framework or config). Validation is done by running the server and exercising the flow manually or via the API.

### End-to-end ("hello world") flow without Google

The Google Business Profile / OAuth integration is **optional** and requires real Google Cloud credentials, so it cannot be exercised here. Everything else works without it: log in at `/admin/`, add a testimonial manually, click **Publicar no site**, then confirm it appears in the **Depoimentos** section at `/`.

### Gotcha: testing mutates tracked JSON files

Publishing/editing testimonials writes to `assets/reviews.json` and `data/reviews-draft.json`, both of which are tracked in git. After manual testing, restore them with `git checkout -- assets/reviews.json data/reviews-draft.json` so you don't commit throwaway test data. `data/oauth-tokens.json` and `client_secret*.json` are gitignored.
