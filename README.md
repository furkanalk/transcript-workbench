# Transcript Workbench

A local-first browser workspace for importing, merging, reviewing, searching, summarizing, and exporting meeting transcript JSON files.

The application is designed for large multi-part meeting transcripts. Transcript content stays in the browser: there is no application backend and no transcript data is uploaded to this repository.

## Features

- Import one or many transcript JSON files
- Select all / clear selection for bulk operations
- Merge unlimited source transcripts while preserving source-file provenance
- Preserve the original source `display_time` instead of presenting synthetic merge offsets as real clock time
- Detect dates from source filenames such as `30-09-2026_part_2.json`
- General and detailed extractive summaries
- Likely open/follow-up item detection
- Source-aware transcript search
- Local transcript-grounded Q&A with source references
- Raw and clean transcript views
- Confidence filtering and inline editing
- Readable paragraph-based TXT/Markdown exports
- Optional conservative text cleanup for human-readable exports
- JSON, TXT, and Markdown export
- IndexedDB persistence for local collections
- Pagination and lower-memory paths for large transcript sets
- No backend required

## Timestamp model

Merged transcripts keep two different concepts separate:

- **Source timestamp** — the original `display_time` from the source transcript. This is what the UI and human-readable exports display.
- **Merge offset** — the continuous position inside a merged transcript. This is retained only as `_merged_offset` metadata where needed.

For a source such as `30-09-2026_part_2.json`, human-readable output can therefore display:

```text
30 Sep 2026 · 08:47:07
```

instead of incorrectly presenting a synthetic merged value as a wall-clock timestamp.

## Summaries

Two local extractive summary modes are available:

- **General Summary** — compact key points across the selected transcript set.
- **Detailed Summary** — source-by-source key points plus likely open/follow-up items detected from transcript language such as `pending`, `roadmap`, `need to confirm`, and `get back to you`.

Summary generation does not call an external LLM.

## Text cleanup

`Light text cleanup` is optional for TXT/Markdown exports. It performs conservative normalization only, such as whitespace/punctuation cleanup and removal of unmistakable filler-only fragments. It does not semantically rewrite the transcript.

JSON exports always preserve the stored segment text.

## Run locally

```bash
npm install
npm run dev
```

## Production build

```bash
npm install
npm run build
npm run preview
```

## GitHub Pages

The repository includes a GitHub Actions workflow under `.github/workflows/deploy.yml`.

Every push to `main` builds the Vite application and deploys `dist/` to GitHub Pages. Vite uses `base: './'`, so generated assets work from the repository Pages path.

## Input format

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

## Privacy

Transcript files are handled locally in the browser. Do not commit customer transcripts, meeting exports, credentials, or other confidential data to the repository.
