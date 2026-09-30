# Transcript Workbench

[![Deploy to GitHub Pages](https://github.com/furkanalk/transcript-workbench/actions/workflows/deploy.yml/badge.svg)](https://github.com/furkanalk/transcript-workbench/actions/workflows/deploy.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-GitHub%20Pages-2ea44f?logo=github)](https://furkanalk.github.io/transcript-workbench/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-7.x-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4.x-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![Local First](https://img.shields.io/badge/Architecture-Local--First-111827)](#privacy--data-handling)
[![No Backend](https://img.shields.io/badge/Backend-None-111827)](#architecture)

A **local-first transcript analysis workspace** for importing, merging, reviewing, searching, summarizing, and exporting large meeting transcript datasets directly in the browser.

Transcript Workbench is designed for multi-part meeting recordings where traceability matters. It preserves source-file provenance and original source timestamps, while providing local search, extractive summaries, follow-up detection, and readable exports without requiring an application backend.

> **Privacy-first by design:** transcript content stays in the browser. The application does not upload meeting data to this repository or to an external application service.

## Live Demo

**https://furkanalk.github.io/transcript-workbench/**

## Highlights

- Import one or many transcript JSON files
- Organize related transcripts into local **Collections**
- Select all / clear selection for bulk operations
- Merge multiple source transcripts while preserving source provenance
- Preserve original source `display_time` values instead of presenting synthetic merge offsets as wall-clock timestamps
- Detect dates from filenames such as `30-09-2026_part_2.json`
- Generate separate **General** and **Detailed** summaries
- Detect likely open questions, roadmap items, pending confirmations, and follow-up actions
- Search across transcript content with source references
- Ask transcript-grounded questions and jump back to supporting segments
- Review transcripts in **Raw** or **Clean** mode
- Filter by confidence and edit transcript segments inline
- Export readable paragraph-based TXT and Markdown
- Optionally apply conservative text cleanup to human-readable exports
- Export JSON while preserving stored segment text
- Persist source transcripts and edits locally with IndexedDB
- Paginate large transcripts and use lower-memory export/merge paths
- Run entirely as a static web application

## Architecture

Transcript Workbench is a client-side application built with:

- **TypeScript**
- **Vite**
- **Tailwind CSS**
- **IndexedDB** for browser-local persistence

There is no application server, transcript API, or database service behind the application.

```text
Transcript JSON files
        │
        ▼
┌──────────────────────────┐
│      Browser / Vite      │
│                          │
│  Import & Parse          │
│  Merge & Provenance      │
│  Search & Q&A            │
│  Summaries               │
│  Review & Editing        │
│  TXT / MD / JSON Export  │
└────────────┬─────────────┘
             │
             ▼
        IndexedDB
      (local browser)
```

## Timestamp Model

Merged meeting transcripts contain two different notions of time, and the application keeps them intentionally separate.

### Source timestamp

The original `display_time` supplied by the source transcript. This is the timestamp shown in the UI and in human-readable exports.

### Merge offset

The continuous position of a segment inside a merged transcript. This value is useful for internal ordering, but it is **not** a real wall-clock timestamp.

Where required, it is retained as `_merged_offset` metadata rather than being presented as the meeting time.

For example, a source named:

```text
30-09-2026_part_2.json
```

can be rendered as:

```text
30 Sep 2026 · 08:47:07
```

instead of incorrectly displaying a synthetic merged value such as `14:18:34` as the original meeting time.

## Summary Modes

Transcript Workbench provides two local extractive summary modes.

### General Summary

A concise overview of the most relevant points across the active transcript collection.

Useful for:

- meeting recaps
- high-level management summaries
- quickly understanding the main topics discussed

### Detailed Summary

A deeper source-aware summary that includes key points per transcript and highlights likely outstanding items.

The follow-up detector looks for transcript language associated with unresolved work, for example:

- `pending`
- `roadmap`
- `need to confirm`
- `need to check`
- `get back to you`
- `follow-up`

Summary generation is **local and extractive**. It does not call an external LLM.

## Transcript-Grounded Search & Q&A

The Ask view searches the original transcript sources and returns supporting references so the user can navigate back to the relevant transcript segment.

This feature is intentionally local. It currently uses heuristic / extractive retrieval rather than an external embedding or LLM service.

## Human-Readable Exports

TXT and Markdown exports can be optimized for reading rather than mirroring the raw segment structure.

When **Readable paragraphs** is enabled, nearby transcript segments are grouped into cleaner paragraphs with source/date/time context.

Example:

```text
30 Sep 2026 · 08:47:07

And Friday is free I think. There is no sessions left for Friday...

Source: 30-09-2026_part_2.json
```

### Light text cleanup

`Light text cleanup` is optional for TXT and Markdown exports.

It performs conservative normalization such as:

- whitespace cleanup
- basic punctuation normalization
- removal of unmistakable filler-only fragments

It does **not** semantically rewrite the transcript or intentionally change the speaker's meaning.

JSON exports always preserve the stored segment text.

## Collections

A **Collection** is a browser-local group of related transcript files, similar to a workspace or folder.

For example, all transcript parts from the same customer workshop can be imported into a single Collection. Search, Summary, and Ask can then operate across those source files together.

## Input Format

The application expects transcript JSON in the following general structure:

```json
{
  "last_updated": "2026-09-28T07:34:54.613029+00:00",
  "segments": [
    {
      "audio_end_time": 7.36,
      "audio_start_time": 0.99,
      "confidence": 1.0,
      "display_time": "06:06:49",
      "duration": 6.37,
      "id": "seg_1163",
      "sequence_id": 1163,
      "text": "The second element is the airline expertise..."
    }
  ],
  "total_segments": 468,
  "version": "1.0"
}
```

## Run Locally

### Requirements

- Node.js 20+
- npm

### Development

```bash
npm install
npm run dev
```

Vite will print the local development URL in the terminal.

## Production Build

```bash
npm install
npm run build
npm run preview
```

The production bundle is generated under `dist/`.

## GitHub Pages Deployment

The repository includes a GitHub Actions workflow at:

```text
.github/workflows/deploy.yml
```

Every push to `main` builds the Vite application and publishes `dist/` to GitHub Pages.

The project uses:

```ts
base: './'
```

so generated assets work correctly from the repository-specific GitHub Pages path.

### Initial GitHub Pages setup

In the repository:

1. Open **Settings → Pages**
2. Set **Build and deployment → Source** to **GitHub Actions**
3. Push to `main`
4. Follow the deployment from the **Actions** tab

The deployed application is available at:

**https://furkanalk.github.io/transcript-workbench/**

## Privacy & Data Handling

Transcript files are processed locally inside the browser.

- No transcript backend is required
- No transcript content is committed automatically
- No application service receives uploaded transcript content
- Collections and edits are stored locally in the browser

Do **not** commit customer transcripts, meeting exports, credentials, secrets, or other confidential material to the repository.

> Browser-local processing does not replace your organization's own information-security, retention, or data-classification requirements.

## Repository Structure

```text
transcript-workbench/
├── .github/
│   └── workflows/
│       └── deploy.yml
├── src/
│   ├── export.ts
│   ├── intelligence.ts
│   ├── main.ts
│   ├── parser.ts
│   ├── storage.ts
│   ├── styles.css
│   └── types.ts
├── index.html
├── package.json
├── tsconfig.json
└── vite.config.ts
```

## Current Scope

Transcript Workbench intentionally remains a local-first static application.

The current summarization and Q&A capabilities are heuristic / extractive and do not use an external LLM, vector database, or embedding API. This keeps the application easy to deploy and avoids sending transcript content outside the browser.

---

Built as an internal productivity tool for working with large, multi-part technical meeting transcripts.
