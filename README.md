# Transcript Workbench

A local-first browser workspace for importing, merging, reviewing, searching, summarizing, and exporting meeting transcript JSON files.

The application is designed for large multi-part meeting transcripts. Transcript content stays in the browser: there is no application backend and no transcript data is uploaded to this repository.

## Features

- Import one or many transcript JSON files
- Select all / clear selection for bulk operations
- Merge unlimited source transcripts while preserving source-file provenance
- Preserve the original source `display_time` instead of presenting synthetic merge offsets as real clock time
- Detect dates from source filenames such as `30-09-2026_part_2.json`
- General, Detailed, and Full Report summary modes
- Likely open/follow-up item detection
- Source-aware transcript search
- Local transcript-grounded Q&A with source references
- Raw and clean transcript views
- Confidence filtering and inline editing
- Readable paragraph-based TXT/Markdown exports
- Optional conservative text cleanup for human-readable exports
- Summary/report export to TXT, Markdown, HTML, Word-compatible DOC, and PDF
- Output-language normalization for Original, English, and Türkçe
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

## Summaries and reports

Three report depths are available and operate on the currently selected source transcripts:

- **General** — executive-style overview targeting roughly one page when enough material is available.
- **Detailed** — structured technical assessment organized by topic, including requirement/current state, assessment, implementation options, decisions, and open points.
- **Full Report** — broader discovery-style analysis covering the main technical areas plus cross-cutting risks, decisions, follow-up actions, and key takeaways.

The report engine is finding-oriented rather than conversation-oriented: it extracts structured findings from the selected transcript scope instead of reproducing the meeting chronology. Source filenames never appear as section openers in the professional report body.

Source filenames and original timestamps remain available inside the application for traceability. They are **excluded from exported reports by default** and can be enabled explicitly with the `Include source references in exported report` option when an internal evidence copy is required.

Output can be generated in **Original**, **English**, or **Türkçe**. English/Türkçe normalization uses the browser's on-device Translator API when available, while technical terms such as Kong, OIDC, ACL, CIDR, Event Gateway, Redis, and Hazelcast are protected from literal word-by-word translation.

Summary/report generation remains local and does not call an external LLM.

## Report exports

Generated summaries can be exported as:

- Plain text (`.txt`)
- Markdown (`.md`)
- HTML (`.html`)
- Word-compatible document (`.doc`)
- PDF (`.pdf`)

PDF export loads the pdfmake rendering library in the browser when needed. Transcript content is rendered client-side and is not uploaded by the application. Professional exports omit transcript filenames and timestamp references by default; internal evidence references are opt-in.

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


### Enterprise report safeguards

- Strict evidence gate for generated report claims
- Recommendations are separated from explicit decisions / agreements
- Ambiguous or fragmentary claims are omitted from the report
- Internal evidence references remain available even when references are hidden in exported files
- Detailed and Full Report modes use multiple evidence items per topic to preserve more nuance

## Enterprise Report v2

Enterprise Report v2 hardens report generation for customer-facing discovery and assessment deliverables.

### Evidence & claim safety

- Separates recommendations from confirmed decisions.
- Decisions require explicit agreement/decision wording.
- Claims are classified as `confirmed`, `supported`, `ambiguous`, `conflicting`, or `unsupported`.
- Ambiguous/unsupported claims are omitted from customer-facing report content and retained in an internal review queue.
- Attribution is tracked as Customer / Kong / Joint / Unknown, with explicit vs inferred confidence. Inferred attribution is not treated as an explicit statement of ownership.

### Coverage & conflict QA

- Full Report covers all detected report topics rather than silently truncating to the first ten.
- Topic coverage percentage is calculated and displayed.
- Potentially conflicting capability statements are detected within the same capability facet and exposed only as internal QA warnings.
- Internal Review Queue preserves omitted claims and the reason they were rejected.

### Structured enterprise deliverables

Full Report now also produces:

- Requirement Matrix
- Structured Outstanding Items
- Explicit status (`Confirmed`, `Proposed`, `Open`, `Discussed`, `Identified`)
- Safe owner attribution for open items (only explicit attribution becomes Customer / Kong / Joint; otherwise `Unassigned`)

### Export profiles

Two export profiles are available:

- **External / Customer** — clean customer-facing report; transcript filenames, timestamps, QA diagnostics and evidence metadata are hidden.
- **Internal / Evidence** — includes source references, coverage, conflict warnings, review queue and claim-quality information for validation.

### DOCX

Word export now creates a real `.docx` Open XML package instead of an HTML file with a `.doc` extension. It is generated locally without an external DOCX library and includes:

- cover metadata
- Word heading styles
- structured sections
- requirement matrix
- outstanding-items table
- internal QA appendix when Internal / Evidence is selected

### PDF

PDF export no longer downloads `pdfmake` or fonts from a CDN. It opens a print-ready A4 report generated entirely from local data and invokes the browser print flow, where **Save as PDF** can be used. This keeps the export path offline and avoids third-party runtime dependencies.

### Current trust model

The report engine is intentionally conservative. It is still a local heuristic/extractive system rather than a semantic LLM reviewer. Enterprise Report v2 prioritizes traceability and avoiding overstatement over forcing every transcript sentence into the final report. Customer-facing deliverables should still receive a human review before being treated as final contractual or architectural documentation.

## AI Enhanced reports (BYOK prototype)

AI enhancement is optional and **off by default**. The local evidence engine always builds the evidence-backed report first. When AI Enhanced is enabled, the selected model is used only to refine the wording and optionally normalize the report to English or Turkish.

### Cost controls

- No API key is bundled with the application.
- Every user must provide their own API key.
- AI never runs automatically when the report mode or output language changes.
- A paid AI request is made only when the user explicitly clicks **Test** or **Generate with AI**.
- If AI fails, the application keeps the local evidence-backed report and does not automatically retry the paid request.

### Data scope

The current AI Enhanced mode sends the **structured report draft only**. Raw transcript segments are not sent to the AI provider by this mode.

The AI layer is deliberately constrained:

1. Local deterministic evidence extraction runs first.
2. Unsupported/ambiguous findings remain filtered by the local evidence gate.
3. AI receives report text with stable item IDs.
4. AI is instructed to improve language only, without adding facts or strengthening certainty.
5. Returned text is checked conservatively for new numbers and stronger decision/confirmation language before it is accepted.
6. Internal references, claim validation, coverage and evidence mappings remain local and unchanged.

### API key handling

Browser BYOK is an **advanced prototype mode**, not the intended final enterprise secret-management design.

- The key is kept only in the running page's memory.
- It is not written to WorkspaceState, IndexedDB, exports, or the repository.
- Refreshing or closing the page clears it.
- The UI provides explicit **Show / Hide**, **Test**, and **Forget** actions.

For production and enterprise deployments, move provider credentials out of the browser entirely. The planned desktop application should store secrets in the operating-system keychain and perform provider calls from the Tauri/Rust backend. A hosted deployment should use a backend proxy / secret store instead of exposing API keys to client-side JavaScript.

### Models

The initial OpenAI presets are:

- `gpt-5.6-luna` — economy / high-volume
- `gpt-5.6-terra` — balanced quality and cost (default)
- `gpt-5.6-sol` — highest quality

The provider layer is intentionally isolated in `src/ai.ts` so local models, a desktop provider, Azure-hosted models, or other enterprise providers can be added later without coupling report logic to a single vendor.
