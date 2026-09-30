import './styles.css';
import { downloadHtmlContent, downloadJson, downloadMarkdown, downloadMergedDocuments, downloadTextContent, downloadTranscriptLowMemory, downloadTxt, formatSourceMoment } from './export';
import { answerQuestion, generateDetailedSummary, generateNarrativeSummary, generateSummary } from './intelligence';
import { formatClock, makeId, mergeTranscriptsAsync, parseTranscript } from './parser';
import { loadWorkspace, saveWorkspace } from './storage';
import type {
  AnswerResult,
  AppTab,
  DetailedSummaryResult,
  NarrativeSummaryResult,
  ConfidenceFilter,
  Project,
  SummaryResult,
  SummaryMode,
  TranscriptDocument,
  TranscriptFile,
  TranscriptSegment,
  ViewMode,
  WorkspaceState,
} from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;

let workspace: WorkspaceState = { projects: [], activeProjectId: null, activeDocumentId: null };
let activeTab: AppTab = 'transcript';
let viewMode: ViewMode = 'raw';
let confidenceFilter: ConfidenceFilter = 'all';
let transcriptQuery = '';
let selectedSegmentId: string | null = null;
let mergeSelection = new Set<string>();
let summaryResult: SummaryResult | null = null;
let detailedSummaryResult: DetailedSummaryResult | null = null;
let narrativeSummaryResult: NarrativeSummaryResult | null = null;
let summaryMode: SummaryMode = 'general';
let exportCleanupEnabled = false;
let exportReadableEnabled = true;
let answerResult: AnswerResult | null = null;
let askQuery = '';
let saveTimer: number | null = null;
const SAVE_DEBOUNCE_MS = 1200;
const MAX_IN_MEMORY_MERGE_SEGMENTS = 35000;
let operationStatus: string | null = null;
let segmentPage = 0;
const SEGMENTS_PER_PAGE = 160;

void bootstrap();

async function bootstrap() {
  const saved = await loadWorkspace();
  workspace = saved ?? freshCollection();
  repairCollection();
  render();
}

function freshCollection(): WorkspaceState {
  const project = createProject('Transcript Collection');
  return { projects: [project], activeProjectId: project.id, activeDocumentId: null };
}

function repairCollection() {
  if (!workspace.projects.length) workspace = freshCollection();
  if (!workspace.projects.some((project) => project.id === workspace.activeProjectId)) {
    workspace.activeProjectId = workspace.projects[0]?.id ?? null;
  }
  const project = getActiveProject();
  if (project && !project.documents.some((document) => document.id === workspace.activeDocumentId)) {
    workspace.activeDocumentId = project.documents[0]?.id ?? null;
  }
}

function createProject(name: string): Project {
  const now = new Date().toISOString();
  return {
    id: makeId('project'),
    name: name.trim() || 'Untitled Collection',
    createdAt: now,
    updatedAt: now,
    documents: [],
  };
}

function getActiveProject(): Project | null {
  return workspace.projects.find((project) => project.id === workspace.activeProjectId) ?? null;
}

function getActiveDocument(): TranscriptDocument | null {
  const project = getActiveProject();
  return project?.documents.find((document) => document.id === workspace.activeDocumentId) ?? null;
}

function touchProject(project: Project) {
  project.updatedAt = new Date().toISOString();
  summaryResult = null;
  detailedSummaryResult = null;
  narrativeSummaryResult = null;
  scheduleSave();
}

function scheduleSave() {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => void saveWorkspace(workspace), SAVE_DEBOUNCE_MS);
}

function render() {
  const project = getActiveProject();
  const activeDocument = getActiveDocument();

  const sourceCount = project?.documents.filter((document) => document.kind === 'source').length ?? 0;
  const totalSegments = project?.documents.filter((document) => document.kind === 'source').reduce((sum, document) => sum + document.transcript.segments.length, 0) ?? 0;

  app.innerHTML = `
    <div class="app-shell min-h-screen">
      <header class="topbar sticky top-0 z-30">
        <div class="mx-auto flex max-w-[1900px] flex-wrap items-center justify-between gap-4 px-4 py-3.5 lg:px-7">
          <div class="flex min-w-0 items-center gap-3">
            <div class="brand-mark">TW</div>
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <div class="truncate text-[17px] font-semibold tracking-[-0.02em] text-white">Transcript Workbench</div>
                <span class="status-pill"><span class="status-dot"></span>LOCAL</span>
              </div>
              <div class="mt-0.5 flex min-w-0 items-center gap-2 text-[11px] text-slate-500">
                <span class="truncate">${project ? escapeHtml(project.name) : 'No collection'}</span>
                ${activeDocument ? `<span class="text-slate-700">/</span><span class="max-w-[420px] truncate">${escapeHtml(activeDocument.name)}</span>` : ''}
              </div>
            </div>
          </div>
          <div class="flex flex-wrap items-center gap-2">
            <div class="hidden items-center gap-4 rounded-xl border border-white/[0.06] bg-white/[0.025] px-3.5 py-2 lg:flex">
              <div><div class="text-[9px] uppercase tracking-[0.16em] text-slate-600">Sources</div><div class="text-xs font-semibold text-slate-300">${sourceCount}</div></div>
              <div class="h-6 w-px bg-white/[0.06]"></div>
              <div><div class="text-[9px] uppercase tracking-[0.16em] text-slate-600">Segments</div><div class="text-xs font-semibold text-slate-300">${totalSegments.toLocaleString()}</div></div>
            </div>
            <span data-operation-status class="operation-pill">${operationStatus ? escapeHtml(operationStatus) : 'Ready'}</span>
            <label class="primary-button cursor-pointer">
              <span class="text-base leading-none">+</span> Add transcripts
              <input id="add-files-input" type="file" accept="application/json,.json" multiple class="hidden" />
            </label>
          </div>
        </div>
      </header>

      <main class="mx-auto grid max-w-[1900px] grid-cols-1 gap-5 px-4 py-5 lg:grid-cols-[350px_minmax(0,1fr)] lg:px-7">
        <aside class="space-y-4">
          ${renderProjectPanel(project)}
          ${renderDocumentPanel(project)}
          ${renderMergePanel(project)}
        </aside>

        <section class="min-w-0">
          ${renderTabs()}
          <div id="main-panel" class="main-card mt-3 min-h-[72vh] rounded-2xl p-3 sm:p-5">
            ${renderMainPanel(project, activeDocument)}
          </div>
        </section>
      </main>
    </div>
  `;

  requestAnimationFrame(() => {
    document.querySelectorAll<HTMLTextAreaElement>('textarea[data-segment-id]').forEach(autoResize);
  });
}

function renderProjectPanel(project: Project | null): string {
  return `
    <section class="panel-card rounded-2xl p-4">
      <div class="flex items-center justify-between gap-3">
        <div>
          <div class="eyebrow">Collection</div>
          <div class="mt-1 text-sm font-semibold text-slate-200">Transcript set</div>
        </div>
        <button data-action="new-project" class="icon-button" title="New collection">+</button>
      </div>
      <select id="project-select" class="control mt-3 w-full">
        ${workspace.projects.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === workspace.activeProjectId ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
      </select>
      <p class="mt-2.5 text-[11px] leading-5 text-slate-600">Think of a collection as a folder. Put related transcript files together; Summary and Ask work across the whole collection.</p>
      <div class="mt-3 grid grid-cols-2 gap-2">
        <button data-action="rename-project" class="quiet-button" ${project ? '' : 'disabled'}>Rename</button>
        <button data-action="delete-project" class="quiet-button danger" ${project ? '' : 'disabled'}>Delete</button>
      </div>
    </section>
  `;
}

function renderDocumentPanel(project: Project | null): string {
  const documents = project?.documents ?? [];
  const sourceCount = documents.filter((document) => document.kind === 'source').length;
  return `
    <section class="panel-card rounded-2xl p-4">
      <div class="flex items-center justify-between gap-2">
        <div>
          <div class="eyebrow">Transcripts</div>
          <div class="mt-1 text-sm font-semibold text-slate-200">${sourceCount} source${sourceCount === 1 ? '' : 's'}</div>
        </div>
        <span class="counter-pill">${mergeSelection.size} selected</span>
      </div>

      <div class="mt-3 grid grid-cols-2 gap-2">
        <button data-action="select-all-documents" class="quiet-button" ${sourceCount ? '' : 'disabled'}>Select all</button>
        <button data-action="deselect-all-documents" class="quiet-button" ${mergeSelection.size ? '' : 'disabled'}>Clear selection</button>
      </div>

      <div id="drop-zone" class="drop-zone mt-3">
        <div class="text-sm font-medium text-slate-400">Drop transcript JSON files</div>
        <div class="mt-1 text-[11px] text-slate-600">Multiple files are supported</div>
      </div>

      <div class="mt-3 max-h-[44vh] space-y-2 overflow-y-auto pr-1">
        ${documents.length ? documents.map((document) => documentRow(document)).join('') : `
          <div class="empty-side-card">
            Add transcript JSON files to start this collection.
          </div>
        `}
      </div>
    </section>
  `;
}

function documentRow(document: TranscriptDocument): string {
  const active = document.id === workspace.activeDocumentId;
  const checked = mergeSelection.has(document.id);
  const kindLabel = document.kind === 'merged' ? `MERGED · ${document.sourceIds?.length ?? 0}` : 'SOURCE';
  return `
    <div class="group rounded-xl border ${active ? 'border-slate-500 bg-slate-800/70' : 'border-slate-800 bg-slate-950/40 hover:border-slate-700'} p-2.5 transition">
      <div class="flex items-start gap-2">
        <input data-merge-id="${escapeHtml(document.id)}" type="checkbox" ${checked ? 'checked' : ''} ${document.kind === 'merged' ? 'disabled' : ''} class="mt-1 h-4 w-4 accent-cyan-400 disabled:cursor-not-allowed disabled:opacity-20" title="${document.kind === 'merged' ? 'Merged outputs are not included in bulk selection' : 'Select transcript'}" />
        <button data-action="select-document" data-document-id="${escapeHtml(document.id)}" class="min-w-0 flex-1 text-left">
          <div class="truncate text-sm font-medium ${active ? 'text-white' : 'text-slate-300'}">${escapeHtml(document.name)}</div>
          <div class="mt-1 flex flex-wrap items-center gap-1.5 text-[10px] text-slate-600">
            <span class="rounded border border-slate-800 px-1.5 py-0.5">${kindLabel}</span>
            <span>${document.transcript.segments.length} segments</span>
          </div>
        </button>
        <button data-action="remove-document" data-document-id="${escapeHtml(document.id)}" class="rounded px-1.5 py-1 text-xs text-slate-700 opacity-0 transition hover:bg-red-950/50 hover:text-red-300 group-hover:opacity-100" title="Remove">×</button>
      </div>
    </div>
  `;
}

function renderMergePanel(project: Project | null): string {
  const selected = project?.documents.filter((document) => document.kind === 'source' && mergeSelection.has(document.id)) ?? [];
  const selectedSegments = selected.reduce((sum, document) => sum + document.transcript.segments.length, 0);
  const canOpenMerged = selected.length >= 2 && selectedSegments <= MAX_IN_MEMORY_MERGE_SEGMENTS;
  return `
    <section class="panel-card rounded-2xl p-4">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="eyebrow">Bulk actions</div>
          <div class="mt-1 text-sm font-semibold text-slate-200">${selected.length ? `${selected.length} transcript${selected.length === 1 ? '' : 's'} selected` : 'Nothing selected'}</div>
        </div>
        ${selected.length ? `<span class="selection-badge">${selected.length}</span>` : ''}
      </div>

      <div class="mt-4 rounded-xl border border-white/[0.06] bg-black/10 p-3">
        <div class="flex items-center justify-between gap-2">
          <div>
            <div class="text-xs font-semibold text-slate-300">Merge transcripts</div>
            <div class="mt-0.5 text-[10px] leading-4 text-slate-600">Visible time uses each source file's real timestamp. Continuous merge time is kept only as metadata.</div>
          </div>
        </div>
        <div class="mt-3 grid grid-cols-2 gap-2">
          <button data-action="merge-selected" class="secondary-button justify-center disabled:opacity-30" ${canOpenMerged ? '' : 'disabled'} title="${selectedSegments > MAX_IN_MEMORY_MERGE_SEGMENTS ? 'Large merge: use Merge & download to avoid browser memory pressure' : ''}">Merge & open</button>
          <button data-action="merge-download" class="primary-button justify-center disabled:opacity-30" ${selected.length >= 2 ? '' : 'disabled'}>Merge & download</button>
        </div>
        ${selected.length ? `<div class="mt-2 flex items-center justify-between text-[10px] text-slate-600"><span>${selectedSegments.toLocaleString()} selected segments</span>${selectedSegments > MAX_IN_MEMORY_MERGE_SEGMENTS ? '<span class="text-amber-400/80">Download-only recommended</span>' : ''}</div>` : ''}
      </div>

      <div class="mt-3 rounded-xl border border-white/[0.06] bg-black/10 p-3">
        <div class="flex items-center justify-between gap-3">
          <div class="text-xs font-semibold text-slate-300">Human-readable export</div>
          <span class="text-[9px] uppercase tracking-[0.14em] text-slate-700">TXT / MD</span>
        </div>
        <div class="mt-3 space-y-2">
          ${exportSetting('readable', 'Readable paragraphs', 'Join nearby transcript fragments into readable paragraphs.', exportReadableEnabled)}
          ${exportSetting('cleanup', 'Light text cleanup', 'Normalize spacing and remove filler-only fragments without rewriting meaning.', exportCleanupEnabled)}
        </div>
        <div class="mt-3 flex gap-2">
          <select id="bulk-export-format" class="control min-w-0 flex-1 text-xs">
            <option value="json">JSON</option>
            <option value="txt">Plain text</option>
            <option value="md">Markdown</option>
          </select>
          <button data-action="export-selected" class="secondary-button whitespace-nowrap disabled:opacity-30" ${selected.length ? '' : 'disabled'}>Download</button>
        </div>
        <p class="mt-2 text-[10px] leading-4 text-slate-600">JSON always preserves the original segment text. Cleanup only affects TXT/MD exports.</p>
      </div>
    </section>
  `;
}

function exportSetting(id: 'readable' | 'cleanup', title: string, description: string, checked: boolean): string {
  return `
    <label class="flex cursor-pointer items-start gap-2.5 rounded-lg border border-white/[0.05] bg-black/10 px-2.5 py-2">
      <input data-export-setting="${id}" type="checkbox" ${checked ? 'checked' : ''} class="mt-0.5 h-4 w-4 accent-cyan-400" />
      <span class="min-w-0">
        <span class="block text-[11px] font-medium text-slate-300">${title}</span>
        <span class="mt-0.5 block text-[9px] leading-4 text-slate-600">${description}</span>
      </span>
    </label>
  `;
}

function renderTabs(): string {
  const tabs: Array<[AppTab, string, string]> = [
    ['transcript', 'Transcript', 'Browse & edit'],
    ['summary', 'Summary', 'Collection overview'],
    ['ask', 'Ask', 'Grounded Q&A'],
  ];
  return `
    <nav class="tab-shell grid grid-cols-3 overflow-hidden rounded-xl p-1">
      ${tabs.map(([id, title, subtitle]) => `
        <button data-action="set-tab" data-tab="${id}" class="rounded-lg px-3 py-2.5 text-left transition ${activeTab === id ? 'bg-white/[0.08] text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}">
          <div class="text-sm font-semibold">${title}</div>
          <div class="mt-0.5 hidden text-[10px] text-slate-600 sm:block">${subtitle}</div>
        </button>
      `).join('')}
    </nav>
  `;
}

function renderMainPanel(project: Project | null, document: TranscriptDocument | null): string {
  if (!project) return emptyMain('No collection', 'Create a collection to continue.');
  if (activeTab === 'summary') return renderSummary(project);
  if (activeTab === 'ask') return renderAsk(project);
  return renderTranscript(document);
}

function renderTranscript(document: TranscriptDocument | null): string {
  if (!document) return emptyMain('No transcript selected', 'Add one or more JSON transcript files to this collection.');

  const filtered = document.transcript.segments.filter(matchesTranscriptFilters);
  const avgConfidence = document.transcript.segments.length
    ? document.transcript.segments.reduce((sum, segment) => sum + segment.confidence, 0) / document.transcript.segments.length
    : 0;
  let duration = 0;
  for (const segment of document.transcript.segments) {
    if (segment.audio_end_time > duration) duration = segment.audio_end_time;
  }
  const pageCount = Math.max(1, Math.ceil(filtered.length / SEGMENTS_PER_PAGE));
  segmentPage = Math.min(segmentPage, pageCount - 1);
  const startIndex = segmentPage * SEGMENTS_PER_PAGE;
  const visible = filtered.slice(startIndex, startIndex + SEGMENTS_PER_PAGE);

  return `
    <div class="mb-4 flex flex-col gap-3 border-b border-slate-800 pb-4 xl:flex-row xl:items-center xl:justify-between">
      <div class="min-w-0">
        <div class="truncate text-lg font-semibold text-white">${escapeHtml(document.name)}</div>
        <div class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
          <span>${document.transcript.segments.length} segments</span>
          <span>${formatClock(duration)}</span>
          <span>${Math.round(avgConfidence * 100)}% avg confidence</span>
          ${document.kind === 'merged' ? `<span>${document.sourceIds?.length ?? 0} merged sources</span>` : ''}
        </div>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <input id="transcript-search" value="${escapeHtml(transcriptQuery)}" type="search" placeholder="Search this transcript..." class="w-full min-w-48 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-200 placeholder:text-slate-600 xl:w-64" />
        <select id="confidence-filter" class="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-300">
          ${confidenceOption('all', 'All confidence')}
          ${confidenceOption('review', '< 70%')}
          ${confidenceOption('warning', '70–90%')}
          ${confidenceOption('good', '90%+')}
        </select>
        <div class="flex rounded-lg border border-slate-700 bg-slate-950 p-1 text-xs">
          ${viewButton('raw', 'Raw')}${viewButton('clean', 'Clean')}
        </div>
        <div class="flex rounded-lg border border-slate-700 bg-slate-950 p-1 text-xs">
          <button data-action="export-document" data-format="json" class="rounded-md px-2.5 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">JSON</button>
          <button data-action="export-document" data-format="txt" class="rounded-md px-2.5 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">TXT</button>
          <button data-action="export-document" data-format="md" class="rounded-md px-2.5 py-1.5 text-slate-400 hover:bg-slate-800 hover:text-white">MD</button>
        </div>
      </div>
    </div>
    ${filtered.length ? `${renderPagination(filtered.length, pageCount, startIndex, visible.length)}${viewMode === 'raw' ? renderRawSegments(visible, document) : renderCleanSegments(visible)}${renderPagination(filtered.length, pageCount, startIndex, visible.length)}` : emptyMain('No matching segments', 'Change the search or confidence filter.')}
  `;
}

function renderPagination(total: number, pageCount: number, startIndex: number, visibleCount: number): string {
  if (pageCount <= 1) return '';
  return `
    <div class="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-950/35 px-3 py-2 text-xs text-slate-500">
      <span>Showing ${startIndex + 1}–${startIndex + visibleCount} of ${total} segments</span>
      <div class="flex items-center gap-2">
        <button data-action="segment-page-prev" class="rounded-md border border-slate-800 px-2.5 py-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-30" ${segmentPage <= 0 ? 'disabled' : ''}>Previous</button>
        <span class="min-w-20 text-center">Page ${segmentPage + 1} / ${pageCount}</span>
        <button data-action="segment-page-next" class="rounded-md border border-slate-800 px-2.5 py-1.5 text-slate-400 hover:bg-slate-800 disabled:opacity-30" ${segmentPage >= pageCount - 1 ? 'disabled' : ''}>Next</button>
      </div>
    </div>
  `;
}

function confidenceOption(value: ConfidenceFilter, label: string): string {
  return `<option value="${value}" ${confidenceFilter === value ? 'selected' : ''}>${label}</option>`;
}

function viewButton(value: ViewMode, label: string): string {
  return `<button data-action="set-view" data-view="${value}" class="rounded-md px-3 py-1.5 ${viewMode === value ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}">${label}</button>`;
}

function renderRawSegments(segments: TranscriptSegment[], document: TranscriptDocument): string {
  return `<div class="space-y-2">${segments.map((segment) => segmentCard(segment, document)).join('')}</div>`;
}

function segmentCard(segment: TranscriptSegment, document: TranscriptDocument): string {
  const confidence = Math.round(segment.confidence * 100);
  const selected = selectedSegmentId === segment.id;
  const source = segment._source;
  const visibleTime = source ? formatSourceMoment(source.document_name, source.display_time) : segment.display_time;
  const mergeOffset = document.kind === 'merged' ? segment._merged_offset : undefined;
  return `
    <article id="segment-${safeDomId(segment.id)}" data-select-segment="${escapeHtml(segment.id)}" class="rounded-xl border ${selected ? 'border-slate-500 bg-slate-800/65' : 'border-slate-800 bg-slate-950/35'} p-4 transition hover:border-slate-700">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-mono text-xs font-semibold text-slate-300">${escapeHtml(visibleTime)}</span>
          <span class="rounded-md px-2 py-1 text-[11px] font-medium ${confidenceClass(segment.confidence)}">${confidence}%</span>
          ${source ? `<span class="rounded-md border border-cyan-900/50 bg-cyan-950/20 px-2 py-1 text-[10px] text-cyan-300">${escapeHtml(source.document_name)}</span>` : ''}
        </div>
        <div class="text-[11px] text-slate-600">#${source?.sequence_id ?? segment.sequence_id} · ${segment.duration.toFixed(2)}s${mergeOffset ? ` · merged +${escapeHtml(mergeOffset)}` : ''}</div>
      </div>
      <textarea data-segment-id="${escapeHtml(segment.id)}" class="min-h-12 w-full resize-none overflow-hidden bg-transparent text-[15px] leading-7 text-slate-200 placeholder:text-slate-700 focus:text-white">${escapeHtml(segment.text)}</textarea>
      ${selected ? `<div class="mt-3 border-t border-slate-800 pt-3 font-mono text-[11px] text-slate-600">audio start ${segment.audio_start_time.toFixed(2)}s · end ${segment.audio_end_time.toFixed(2)}s · ${escapeHtml(segment.id)}</div>` : ''}
    </article>
  `;
}

function renderCleanSegments(segments: TranscriptSegment[]): string {
  return `
    <div class="mx-auto max-w-5xl rounded-2xl border border-slate-800 bg-slate-950/40 px-6 py-8 sm:px-10">
      ${segments.map((segment) => {
        const source = segment._source;
        const visibleTime = source ? formatSourceMoment(source.document_name, source.display_time) : segment.display_time;
        return `
        <div class="mb-7" id="segment-${safeDomId(segment.id)}">
          <div class="mb-2 flex flex-wrap items-center gap-2 font-mono text-xs text-slate-600">
            <span>${escapeHtml(visibleTime)}</span>
            ${source ? `<span class="text-cyan-700">${escapeHtml(source.document_name)}</span>` : ''}
            ${segment._merged_offset ? `<span class="text-slate-700">merged +${escapeHtml(segment._merged_offset)}</span>` : ''}
          </div>
          <p class="text-base leading-8 text-slate-200">${highlight(segment.text, transcriptQuery)}</p>
        </div>`;
      }).join('')}
    </div>
  `;
}

function renderSummary(project: Project): string {
  if (!project.documents.length) return emptyMain('Nothing to summarize', 'Add transcript files to the collection first.');
  const selectedIds = selectedDocumentIdsForSummary(project);
  if (!summaryResult) summaryResult = generateSummary(project, 10, selectedIds);
  if (!detailedSummaryResult) detailedSummaryResult = generateDetailedSummary(project, 7, selectedIds);
  if (!narrativeSummaryResult || narrativeSummaryResult.mode !== summaryMode) {
    narrativeSummaryResult = generateNarrativeSummary(project, summaryMode, selectedIds);
  }

  const activeCount = summaryMode === 'general'
    ? summaryResult.points.length
    : detailedSummaryResult.sections.reduce((sum, section) => sum + section.points.length, 0);
  const selectionCount = project.documents.filter((document) => document.kind === 'source' && mergeSelection.has(document.id)).length;
  const scopeLabel = selectionCount
    ? `${selectionCount} selected transcript${selectionCount === 1 ? '' : 's'}`
    : 'All source transcripts';

  return `
    <div class="mx-auto max-w-6xl">
      <div class="flex flex-col gap-4 border-b border-slate-800 pb-5 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div class="text-lg font-semibold text-white">Transcript Summary</div>
          <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Local summary synthesis built from the selected source transcripts. General provides an executive-level narrative; Detailed expands the meeting story, source context and likely follow-up items.</p>
          <div class="mt-2 text-[11px] text-cyan-300/70">Scope: ${scopeLabel} · ${summaryResult.segmentCount.toLocaleString()} segments</div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex rounded-lg border border-slate-700 bg-slate-950 p-1 text-xs">
            <button data-action="set-summary-mode" data-summary-mode="general" class="rounded-md px-3 py-1.5 ${summaryMode === 'general' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}">General</button>
            <button data-action="set-summary-mode" data-summary-mode="detailed" class="rounded-md px-3 py-1.5 ${summaryMode === 'detailed' ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}">Detailed</button>
          </div>
          <button data-action="regenerate-summary" class="quiet-button">Regenerate</button>
          <button data-action="export-summary" data-format="txt" class="quiet-button">TXT</button>
          <button data-action="export-summary" data-format="md" class="quiet-button">MD</button>
          <button data-action="export-summary" data-format="html" class="quiet-button">HTML</button>
        </div>
      </div>

      <div class="my-5 grid grid-cols-3 gap-3">
        ${metricCard('Sources', String(summaryResult.sourceCount))}
        ${metricCard('Segments', String(summaryResult.segmentCount))}
        ${metricCard(summaryMode === 'general' ? 'Key points' : 'Detailed points', String(activeCount))}
      </div>

      ${renderNarrativeSummary(narrativeSummaryResult)}
      <div class="mt-7">${summaryMode === 'general' ? renderGeneralSummary(summaryResult) : renderDetailedSummary(detailedSummaryResult)}</div>
    </div>
  `;
}

function renderNarrativeSummary(result: NarrativeSummaryResult): string {
  return `
    <section class="rounded-2xl border border-cyan-900/25 bg-cyan-950/[0.08] p-5">
      <div class="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div class="text-sm font-semibold text-slate-100">Meeting Summary</div>
          <div class="mt-1 text-[11px] leading-5 text-slate-600">${result.mode === 'general' ? 'Concise narrative of what was discussed, reviewed, decided and left open.' : 'Expanded narrative across the selected meeting scope, with source-aware synthesis.'}</div>
        </div>
        <span class="counter-pill">${result.paragraphs.length} paragraphs</span>
      </div>
      <div class="mt-4 space-y-4">
        ${result.paragraphs.length ? result.paragraphs.map((paragraph) => `
          <p class="text-[15px] leading-8 text-slate-300">${escapeHtml(paragraph.text)}</p>
        `).join('') : `<p class="text-sm leading-6 text-slate-600">Not enough transcript content was found to produce a useful narrative summary.</p>`}
      </div>
      <div class="mt-4 border-t border-white/[0.05] pt-3 text-[10px] leading-5 text-slate-600">Generated locally with extractive and heuristic synthesis. Review source references in the key points and follow-up sections before treating inferred decisions as formal project decisions.</div>
    </section>
  `;
}

function renderGeneralSummary(result: SummaryResult): string {
  return `
    <section>
      <div class="mb-3 flex items-center justify-between gap-3">
        <div><div class="text-sm font-semibold text-slate-200">General summary</div><div class="mt-0.5 text-[11px] text-slate-600">A compact overview across the whole collection.</div></div>
      </div>
      <div class="space-y-3">
        ${result.points.length ? result.points.map((point, index) => summaryPointCard(point, index)).join('') : emptyMain('No summary points', 'The transcript does not contain enough text to build a useful summary.')}
      </div>
    </section>
  `;
}

function renderDetailedSummary(result: DetailedSummaryResult): string {
  return `
    <div class="space-y-6">
      ${result.followUps.length ? `
        <section class="rounded-2xl border border-amber-900/30 bg-amber-950/10 p-4">
          <div class="text-sm font-semibold text-amber-200">Possible open / follow-up items</div>
          <p class="mt-1 text-[11px] leading-5 text-amber-200/45">Detected from phrases such as “come back to you”, “pending”, “roadmap”, or “need to confirm”. Review before treating these as formal action items.</p>
          <div class="mt-3 space-y-2">
            ${result.followUps.map((point, index) => `
              <div class="rounded-xl border border-amber-900/20 bg-black/10 p-3">
                <div class="flex gap-3"><span class="mt-0.5 text-[10px] font-bold text-amber-500/70">${index + 1}</span><div class="min-w-0 flex-1"><p class="text-sm leading-6 text-slate-300">${escapeHtml(point.text)}</p>${referenceButton(point.reference.documentId, point.reference.segmentId, point.reference.documentName, point.reference.displayTime)}</div></div>
              </div>
            `).join('')}
          </div>
        </section>
      ` : ''}

      ${result.sections.map((section) => `
        <section>
          <div class="mb-3 flex flex-wrap items-end justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div><div class="text-sm font-semibold text-slate-200">${escapeHtml(section.documentName)}</div><div class="mt-0.5 text-[10px] text-slate-600">${section.segmentCount.toLocaleString()} segments</div></div>
            <span class="counter-pill">${section.points.length} points</span>
          </div>
          <div class="space-y-2.5">${section.points.map((point, index) => summaryPointCard(point, index)).join('') || `<div class="text-sm text-slate-600">No detailed points found for this source.</div>`}</div>
        </section>
      `).join('')}
    </div>
  `;
}

function summaryPointCard(point: SummaryResult['points'][number], index: number): string {
  return `
    <article class="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div class="flex items-start gap-3">
        <div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-xs font-bold text-slate-400">${index + 1}</div>
        <div class="min-w-0 flex-1">
          <p class="text-sm leading-7 text-slate-200">${escapeHtml(point.text)}</p>
          ${referenceButton(point.reference.documentId, point.reference.segmentId, point.reference.documentName, point.reference.displayTime)}
        </div>
      </div>
    </article>
  `;
}

function renderAsk(project: Project): string {
  const sourceCount = project.documents.filter((document) => document.kind === 'source').length || project.documents.length;
  return `
    <div class="mx-auto max-w-5xl">
      <div class="border-b border-slate-800 pb-5">
        <div class="text-lg font-semibold text-white">Ask the transcripts</div>
        <p class="mt-1 max-w-3xl text-sm leading-6 text-slate-500">Searches ${sourceCount} source transcript${sourceCount === 1 ? '' : 's'} locally and answers only from matching transcript evidence. References link back to the exact source segment.</p>
      </div>

      <form id="ask-form" class="mt-5 rounded-2xl border border-slate-800 bg-slate-950/45 p-4">
        <label class="text-xs font-medium uppercase tracking-wider text-slate-500">Question</label>
        <div class="mt-2 flex flex-col gap-2 sm:flex-row">
          <input id="ask-input" value="${escapeHtml(askQuery)}" type="text" autocomplete="off" placeholder="e.g. Does the developer portal support CIDR restriction?" class="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:border-slate-500" />
          <button class="rounded-lg bg-white px-5 py-3 text-sm font-semibold text-slate-950 hover:bg-slate-200">Ask</button>
        </div>
        <div class="mt-2 text-[11px] text-slate-600">No external API is called. Typos and close technical terms are matched with a lightweight local relevance engine.</div>
      </form>

      ${answerResult ? renderAnswer(answerResult) : `
        <div class="mt-6 grid gap-3 sm:grid-cols-3">
          ${promptExample('Feature check', 'Is there CIDR/IP restriction support?')}
          ${promptExample('Capability', 'Can the portal create client credentials?')}
          ${promptExample('Discovery', 'What was said about TLS termination?')}
        </div>
      `}
    </div>
  `;
}

function renderAnswer(result: AnswerResult): string {
  const confidenceLabel = {
    strong: 'Strong match',
    moderate: 'Moderate match',
    weak: 'Weak match',
    'not-found': 'Not found',
  }[result.confidence];

  return `
    <section class="mt-5 rounded-2xl border border-slate-800 bg-slate-950/45 p-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div class="text-xs font-medium uppercase tracking-wider text-slate-500">Answer</div>
        <span class="rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-[11px] text-slate-400">${confidenceLabel}</span>
      </div>
      <p class="mt-3 text-[15px] leading-7 text-slate-100">${escapeHtml(result.answer)}</p>
    </section>

    <section class="mt-5">
      <div class="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">References · ${result.references.length}</div>
      <div class="space-y-3">
        ${result.references.map((hit, index) => `
          <article class="rounded-xl border border-slate-800 bg-slate-950/35 p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2">
                <span class="flex h-6 w-6 items-center justify-center rounded-md bg-slate-800 text-[10px] font-bold text-slate-500">${index + 1}</span>
                ${referenceButton(hit.documentId, hit.segmentId, hit.documentName, hit.displayTime)}
              </div>
              <span class="text-[10px] text-slate-700">score ${hit.score.toFixed(2)} · ${Math.round(hit.confidence * 100)}% confidence</span>
            </div>
            <p class="mt-3 text-sm leading-6 text-slate-400">${escapeHtml(hit.context)}</p>
          </article>
        `).join('') || `<div class="rounded-xl border border-slate-800 bg-slate-950/35 p-4 text-sm text-slate-600">No references found.</div>`}
      </div>
    </section>
  `;
}

function promptExample(title: string, question: string): string {
  return `<button data-action="use-example" data-question="${escapeHtml(question)}" class="rounded-xl border border-slate-800 bg-slate-950/35 p-4 text-left transition hover:border-slate-700 hover:bg-slate-950/60"><div class="text-xs font-semibold text-slate-400">${escapeHtml(title)}</div><div class="mt-2 text-sm leading-6 text-slate-600">${escapeHtml(question)}</div></button>`;
}

function referenceButton(documentId: string, segmentId: string, documentName: string, displayTime: string): string {
  const moment = formatSourceMoment(documentName, displayTime);
  return `<button data-action="jump-reference" data-document-id="${escapeHtml(documentId)}" data-segment-id="${escapeHtml(segmentId)}" class="mt-2 inline-flex items-center gap-1.5 rounded-md border border-cyan-900/50 bg-cyan-950/15 px-2 py-1 text-[11px] font-medium text-cyan-300 hover:bg-cyan-950/35">${escapeHtml(documentName)} · ${escapeHtml(moment)} ↗</button>`;
}

function metricCard(label: string, value: string): string {
  return `<div class="rounded-xl border border-slate-800 bg-slate-950/45 p-4"><div class="text-[10px] uppercase tracking-wider text-slate-600">${label}</div><div class="mt-1 text-lg font-semibold text-slate-200">${value}</div></div>`;
}

function matchesTranscriptFilters(segment: TranscriptSegment): boolean {
  const confidenceMatch =
    confidenceFilter === 'all' ||
    (confidenceFilter === 'review' && segment.confidence < 0.7) ||
    (confidenceFilter === 'warning' && segment.confidence >= 0.7 && segment.confidence < 0.9) ||
    (confidenceFilter === 'good' && segment.confidence >= 0.9);

  const haystack = `${segment.text} ${segment.display_time} ${segment._source?.document_name ?? ''} ${segment._source?.display_time ?? ''}`.toLocaleLowerCase('tr-TR');
  const queryMatch = !transcriptQuery || haystack.includes(transcriptQuery.toLocaleLowerCase('tr-TR'));
  return confidenceMatch && queryMatch;
}

app.addEventListener('click', (event) => {
  const target = event.target as HTMLElement;
  const actionElement = target.closest<HTMLElement>('[data-action]');
  if (!actionElement) {
    const segment = target.closest<HTMLElement>('[data-select-segment]');
    if (segment && !target.closest('textarea')) {
      selectedSegmentId = segment.dataset.selectSegment ?? null;
      render();
    }
    return;
  }

  const action = actionElement.dataset.action;
  if (action === 'new-project') newProject();
  if (action === 'rename-project') renameProject();
  if (action === 'delete-project') deleteProject();
  if (action === 'select-document') selectDocument(actionElement.dataset.documentId ?? '');
  if (action === 'remove-document') removeDocument(actionElement.dataset.documentId ?? '');
  if (action === 'select-all-documents') selectAllDocuments();
  if (action === 'deselect-all-documents') deselectAllDocuments();
  if (action === 'merge-selected') void mergeSelected(false);
  if (action === 'merge-download') void mergeSelected(true);
  if (action === 'export-selected') void exportSelected();
  if (action === 'segment-page-prev') { segmentPage = Math.max(0, segmentPage - 1); render(); }
  if (action === 'segment-page-next') { segmentPage += 1; render(); }
  if (action === 'set-tab') {
    activeTab = actionElement.dataset.tab as AppTab;
    render();
  }
  if (action === 'set-view') {
    viewMode = actionElement.dataset.view as ViewMode;
    segmentPage = 0;
    render();
  }
  if (action === 'regenerate-summary') {
    const project = getActiveProject();
    if (project) {
      const selectedIds = selectedDocumentIdsForSummary(project);
      summaryResult = generateSummary(project, 10, selectedIds);
      detailedSummaryResult = generateDetailedSummary(project, 7, selectedIds);
      narrativeSummaryResult = generateNarrativeSummary(project, summaryMode, selectedIds);
    }
    render();
  }
  if (action === 'set-summary-mode') {
    summaryMode = actionElement.dataset.summaryMode === 'detailed' ? 'detailed' : 'general';
    narrativeSummaryResult = null;
    render();
  }
  if (action === 'export-summary') exportSummary(actionElement.dataset.format ?? 'md');
  if (action === 'jump-reference') jumpToReference(actionElement.dataset.documentId ?? '', actionElement.dataset.segmentId ?? '');
  if (action === 'use-example') useExample(actionElement.dataset.question ?? '');
  if (action === 'export-document') exportDocument(actionElement.dataset.format ?? 'json');
});

app.addEventListener('change', (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;

  if (target.id === 'project-select') {
    workspace.activeProjectId = target.value;
    const project = getActiveProject();
    workspace.activeDocumentId = project?.documents[0]?.id ?? null;
    mergeSelection = new Set();
    summaryResult = null;
    detailedSummaryResult = null;
    narrativeSummaryResult = null;
    answerResult = null;
    selectedSegmentId = null;
    segmentPage = 0;
    scheduleSave();
    render();
    return;
  }

  if (target.id === 'add-files-input' && target instanceof HTMLInputElement) {
    const files = Array.from(target.files ?? []);
    if (files.length) void importFiles(files);
    return;
  }

  if (target.matches('[data-merge-id]') && target instanceof HTMLInputElement) {
    const id = target.dataset.mergeId;
    if (!id) return;
    if (target.checked) mergeSelection.add(id);
    else mergeSelection.delete(id);
    invalidateSummaryCache();
    render();
    return;
  }

  if (target.matches('[data-export-setting]') && target instanceof HTMLInputElement) {
    const setting = target.dataset.exportSetting;
    if (setting === 'readable') exportReadableEnabled = target.checked;
    if (setting === 'cleanup') exportCleanupEnabled = target.checked;
    render();
    return;
  }

  if (target.id === 'confidence-filter') {
    confidenceFilter = target.value as ConfidenceFilter;
    segmentPage = 0;
    render();
  }
});

app.addEventListener('input', (event) => {
  const target = event.target as HTMLInputElement | HTMLTextAreaElement;

  if (target.id === 'transcript-search' && target instanceof HTMLInputElement) {
    transcriptQuery = target.value;
    segmentPage = 0;
    const cursor = target.selectionStart ?? target.value.length;
    render();
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement>('#transcript-search');
      input?.focus();
      input?.setSelectionRange(cursor, cursor);
    });
    return;
  }

  if (target.id === 'ask-input' && target instanceof HTMLInputElement) {
    askQuery = target.value;
    return;
  }

  if (target.matches('textarea[data-segment-id]') && target instanceof HTMLTextAreaElement) {
    const document = getActiveDocument();
    const segment = document?.transcript.segments.find((item) => item.id === target.dataset.segmentId);
    if (!segment || !document) return;
    segment.text = target.value;
    autoResize(target);
    const project = getActiveProject();
    if (project) touchProject(project);
  }
});

app.addEventListener('submit', (event) => {
  const form = event.target as HTMLFormElement;
  if (form.id !== 'ask-form') return;
  event.preventDefault();
  const input = form.querySelector<HTMLInputElement>('#ask-input');
  askQuery = input?.value.trim() ?? '';
  const project = getActiveProject();
  if (!project || !askQuery) return;
  answerResult = answerQuestion(project, askQuery);
  render();
});

app.addEventListener('dragover', (event) => {
  const target = (event.target as HTMLElement).closest('#drop-zone');
  if (!target) return;
  event.preventDefault();
  target.classList.add('border-slate-400', 'bg-slate-800/80');
});

app.addEventListener('dragleave', (event) => {
  const target = (event.target as HTMLElement).closest('#drop-zone');
  if (!target) return;
  target.classList.remove('border-slate-400', 'bg-slate-800/80');
});

app.addEventListener('drop', (event) => {
  const target = (event.target as HTMLElement).closest('#drop-zone');
  if (!target) return;
  event.preventDefault();
  target.classList.remove('border-slate-400', 'bg-slate-800/80');
  const files = Array.from(event.dataTransfer?.files ?? []).filter((file) => file.name.toLowerCase().endsWith('.json'));
  if (files.length) void importFiles(files);
});

async function importFiles(files: File[]) {
  const project = getActiveProject();
  if (!project || operationStatus) return;

  const imported: TranscriptDocument[] = [];
  const errors: string[] = [];

  try {
    operationStatus = `Importing 0/${files.length}…`;
    render();
    await yieldToBrowser();

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      operationStatus = `Importing ${index + 1}/${files.length}…`;
      updateOperationStatus();
      try {
        const raw = await file.text();
        const transcript = parseTranscript(raw);
        imported.push({
          id: makeId('doc'),
          name: file.name,
          kind: 'source',
          createdAt: new Date().toISOString(),
          transcript,
        });
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
      }
      await yieldToBrowser();
    }

    if (imported.length) {
      project.documents.push(...imported);
      workspace.activeDocumentId = imported[0].id;
      activeTab = 'transcript';
      touchProject(project);
    }

    if (errors.length) window.alert(`Some files could not be imported:\n\n${errors.join('\n')}`);
  } finally {
    operationStatus = null;
    render();
  }
}

function newProject() {
  const name = window.prompt('Collection name:', `Collection ${workspace.projects.length + 1}`)?.trim();
  if (!name) return;
  const project = createProject(name);
  workspace.projects.push(project);
  workspace.activeProjectId = project.id;
  workspace.activeDocumentId = null;
  mergeSelection = new Set();
  summaryResult = null;
  detailedSummaryResult = null;
  narrativeSummaryResult = null;
  answerResult = null;
  scheduleSave();
  render();
}

function renameProject() {
  const project = getActiveProject();
  if (!project) return;
  const name = window.prompt('Collection name:', project.name)?.trim();
  if (!name || name === project.name) return;
  project.name = name;
  touchProject(project);
  render();
}

function deleteProject() {
  const project = getActiveProject();
  if (!project) return;
  if (!window.confirm(`Delete collection "${project.name}" and its local transcript data?`)) return;
  workspace.projects = workspace.projects.filter((item) => item.id !== project.id);
  if (!workspace.projects.length) workspace.projects.push(createProject('Transcript Collection'));
  workspace.activeProjectId = workspace.projects[0].id;
  workspace.activeDocumentId = workspace.projects[0].documents[0]?.id ?? null;
  mergeSelection = new Set();
  summaryResult = null;
  detailedSummaryResult = null;
  narrativeSummaryResult = null;
  answerResult = null;
  scheduleSave();
  render();
}

function selectDocument(documentId: string) {
  const project = getActiveProject();
  if (!project?.documents.some((document) => document.id === documentId)) return;
  workspace.activeDocumentId = documentId;
  activeTab = 'transcript';
  selectedSegmentId = null;
  transcriptQuery = '';
  segmentPage = 0;
  scheduleSave();
  render();
}

function removeDocument(documentId: string) {
  const project = getActiveProject();
  const document = project?.documents.find((item) => item.id === documentId);
  if (!project || !document) return;
  if (!window.confirm(`Remove "${document.name}" from this collection?`)) return;
  project.documents = project.documents.filter((item) => item.id !== documentId);
  mergeSelection.delete(documentId);
  if (workspace.activeDocumentId === documentId) workspace.activeDocumentId = project.documents[0]?.id ?? null;
  touchProject(project);
  answerResult = null;
  render();
}

async function mergeSelected(downloadAfterMerge: boolean) {
  const project = getActiveProject();
  if (!project || operationStatus) return;
  const documents = project.documents.filter((document) => document.kind === 'source' && mergeSelection.has(document.id));
  if (documents.length < 2) return;

  const totalSegments = documents.reduce((sum, document) => sum + document.transcript.segments.length, 0);
  if (!downloadAfterMerge && totalSegments > MAX_IN_MEMORY_MERGE_SEGMENTS) {
    window.alert(`This merge contains ${totalSegments.toLocaleString()} segments. Opening a generated copy in memory may overload the browser. Use \"Merge & download\" instead.`);
    return;
  }

  const defaultName = `Merged ${documents.length} transcripts`;
  const name = window.prompt('Merged transcript name:', defaultName)?.trim();
  if (!name) return;

  try {
    operationStatus = `Merging ${documents.length} files…`;
    render();
    await yieldToBrowser();

    if (downloadAfterMerge) {
      const format = getBulkExportFormat();
      const stem = name.replace(/\.(json|txt|md)$/i, '') || `merged-${documents.length}-transcripts`;
      operationStatus = `Preparing merged download 0/${documents.length}…`;
      updateOperationStatus();
      await downloadMergedDocuments(documents, format, `${stem}.${format}`, (done, total) => {
        operationStatus = `Preparing merged download ${done}/${total}…`;
        updateOperationStatus();
      }, currentTextExportOptions());
      mergeSelection = new Set();
    } else {
      const transcript = await mergeTranscriptsResponsive(documents, (done, total) => {
        operationStatus = `Merging ${done}/${total}…`;
        updateOperationStatus();
      });
      const sourceIds = [...new Set(documents.flatMap((document) => document.kind === 'source' ? [document.id] : (document.sourceIds ?? [document.id])))];
      const mergedDocument: TranscriptDocument = {
        id: makeId('merged'),
        name: name.toLowerCase().endsWith('.json') ? name : `${name}.json`,
        kind: 'merged',
        createdAt: new Date().toISOString(),
        transcript,
        sourceIds,
      };
      project.documents.push(mergedDocument);
      workspace.activeDocumentId = mergedDocument.id;
      mergeSelection = new Set();
      selectedSegmentId = null;
      transcriptQuery = '';
      activeTab = 'transcript';
      project.updatedAt = new Date().toISOString();
      summaryResult = null;
      detailedSummaryResult = null;
      narrativeSummaryResult = null;
      scheduleSave();
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Merge failed.');
  } finally {
    operationStatus = null;
    render();
  }
}

function jumpToReference(documentId: string, segmentId: string) {
  const project = getActiveProject();
  if (!project) return;
  const document = project.documents.find((item) => item.id === documentId);
  if (!document) {
    window.alert('The referenced source transcript is no longer in this collection.');
    return;
  }

  workspace.activeDocumentId = document.id;
  activeTab = 'transcript';
  viewMode = 'raw';
  confidenceFilter = 'all';
  transcriptQuery = '';
  selectedSegmentId = segmentId;
  const targetIndex = document.transcript.segments.findIndex((segment) => segment.id === segmentId);
  segmentPage = targetIndex >= 0 ? Math.floor(targetIndex / SEGMENTS_PER_PAGE) : 0;
  render();
  requestAnimationFrame(() => {
    documentQueryBySegmentId(segmentId)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
}

function useExample(question: string) {
  askQuery = question;
  const project = getActiveProject();
  if (project) answerResult = answerQuestion(project, question);
  render();
}

function selectedDocumentIdsForSummary(project: Project): string[] {
  return project.documents
    .filter((document) => document.kind === 'source' && mergeSelection.has(document.id))
    .map((document) => document.id);
}

function invalidateSummaryCache() {
  summaryResult = null;
  detailedSummaryResult = null;
  narrativeSummaryResult = null;
}

function exportSummary(format: string) {
  const project = getActiveProject();
  if (!project) return;
  const selectedIds = selectedDocumentIdsForSummary(project);
  if (!summaryResult) summaryResult = generateSummary(project, 10, selectedIds);
  if (!detailedSummaryResult) detailedSummaryResult = generateDetailedSummary(project, 7, selectedIds);
  if (!narrativeSummaryResult || narrativeSummaryResult.mode !== summaryMode) {
    narrativeSummaryResult = generateNarrativeSummary(project, summaryMode, selectedIds);
  }

  const safeName = project.name.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'transcript-collection';
  if (format === 'html') {
    const html = summaryMode === 'general'
      ? buildGeneralSummaryHtml(project.name, summaryResult, narrativeSummaryResult)
      : buildDetailedSummaryHtml(project.name, detailedSummaryResult, narrativeSummaryResult);
    downloadHtmlContent(html, `${safeName}-${summaryMode}-summary.html`);
    return;
  }

  const markdown = format === 'md';
  const content = summaryMode === 'general'
    ? buildGeneralSummaryExport(project.name, summaryResult, narrativeSummaryResult, markdown)
    : buildDetailedSummaryExport(project.name, detailedSummaryResult, narrativeSummaryResult, markdown);
  downloadTextContent(content, `${safeName}-${summaryMode}-summary.${markdown ? 'md' : 'txt'}`, markdown);
}

function buildGeneralSummaryExport(name: string, result: SummaryResult, narrative: NarrativeSummaryResult, markdown: boolean): string {
  const narrativeText = narrative.paragraphs.map((paragraph) => paragraph.text).join('\n\n');
  if (markdown) {
    const points = result.points.map((point, index) => `${index + 1}. ${point.text}\n   - Source: ${point.reference.documentName} · ${formatSourceMoment(point.reference.documentName, point.reference.displayTime)}`).join('\n');
    return `# General Summary — ${name}\n\nSources: ${result.sourceCount} · Segments: ${result.segmentCount}\n\n## Meeting Summary\n\n${narrativeText || '_No narrative summary generated._'}\n\n## Key Points\n\n${points || '_No key points found._'}\n`;
  }
  const points = result.points.map((point, index) => `${index + 1}. ${point.text}\n   Source: ${point.reference.documentName} · ${formatSourceMoment(point.reference.documentName, point.reference.displayTime)}`).join('\n\n');
  return `GENERAL SUMMARY — ${name}\nSources: ${result.sourceCount} · Segments: ${result.segmentCount}\n\nMEETING SUMMARY\n${narrativeText || 'No narrative summary generated.'}\n\nKEY POINTS\n${points || 'No key points found.'}\n`;
}

function buildDetailedSummaryExport(name: string, result: DetailedSummaryResult, narrative: NarrativeSummaryResult, markdown: boolean): string {
  const narrativeText = narrative.paragraphs.map((paragraph) => paragraph.text).join('\n\n');
  const followUps = result.followUps.map((point, index) => {
    const source = `${point.reference.documentName} · ${formatSourceMoment(point.reference.documentName, point.reference.displayTime)}`;
    return markdown ? `${index + 1}. ${point.text}\n   - Source: ${source}` : `${index + 1}. ${point.text}\n   Source: ${source}`;
  }).join(markdown ? '\n' : '\n\n');

  const sections = result.sections.map((section) => {
    const points = section.points.map((point, index) => {
      const source = `${point.reference.documentName} · ${formatSourceMoment(point.reference.documentName, point.reference.displayTime)}`;
      return markdown ? `${index + 1}. ${point.text}\n   - Source: ${source}` : `${index + 1}. ${point.text}\n   Source: ${source}`;
    }).join(markdown ? '\n' : '\n\n');
    return markdown
      ? `## ${section.documentName}\n\n${points || '_No summary points._'}`
      : `=== ${section.documentName} ===\n${points || 'No summary points.'}`;
  }).join('\n\n');

  if (markdown) {
    return `# Detailed Summary — ${name}\n\nSources: ${result.sourceCount} · Segments: ${result.segmentCount}\n\n## Meeting Summary\n\n${narrativeText || '_No narrative summary generated._'}\n\n## Possible Open / Follow-up Items\n\n${followUps || '_None detected._'}\n\n## Source Details\n\n${sections}\n`;
  }
  return `DETAILED SUMMARY — ${name}\nSources: ${result.sourceCount} · Segments: ${result.segmentCount}\n\nMEETING SUMMARY\n${narrativeText || 'No narrative summary generated.'}\n\nPOSSIBLE OPEN / FOLLOW-UP ITEMS\n${followUps || 'None detected.'}\n\nSOURCE DETAILS\n${sections}\n`;
}

function buildGeneralSummaryHtml(name: string, result: SummaryResult, narrative: NarrativeSummaryResult): string {
  const points = result.points.map((point) => `<li><p>${escapeHtml(point.text)}</p><small>${escapeHtml(point.reference.documentName)} · ${escapeHtml(formatSourceMoment(point.reference.documentName, point.reference.displayTime))}</small></li>`).join('');
  return summaryHtmlDocument(name, 'General Meeting Summary', result.sourceCount, result.segmentCount, narrative, `<section><h2>Key Points</h2><ol>${points}</ol></section>`);
}

function buildDetailedSummaryHtml(name: string, result: DetailedSummaryResult, narrative: NarrativeSummaryResult): string {
  const followUps = result.followUps.map((point) => `<li><p>${escapeHtml(point.text)}</p><small>${escapeHtml(point.reference.documentName)} · ${escapeHtml(formatSourceMoment(point.reference.documentName, point.reference.displayTime))}</small></li>`).join('');
  const sections = result.sections.map((section) => {
    const points = section.points.map((point) => `<li><p>${escapeHtml(point.text)}</p><small>${escapeHtml(formatSourceMoment(point.reference.documentName, point.reference.displayTime))}</small></li>`).join('');
    return `<section><h2>${escapeHtml(section.documentName)}</h2><ol>${points}</ol></section>`;
  }).join('');
  return summaryHtmlDocument(name, 'Detailed Meeting Summary', result.sourceCount, result.segmentCount, narrative, `<section><h2>Possible Open / Follow-up Items</h2><ol>${followUps || '<li>None detected.</li>'}</ol></section>${sections}`);
}

function summaryHtmlDocument(
  name: string,
  title: string,
  sourceCount: number,
  segmentCount: number,
  narrative: NarrativeSummaryResult,
  extraContent: string,
): string {
  const paragraphs = narrative.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph.text)}</p>`).join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)} — ${escapeHtml(name)}</title>
<style>body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;max-width:920px;margin:48px auto;padding:0 24px;color:#172033;line-height:1.7}h1{font-size:30px;margin-bottom:6px}h2{margin-top:34px;font-size:19px}.meta{color:#667085;font-size:14px;margin-bottom:32px}.narrative{font-size:16px;background:#f7f9fc;border:1px solid #e5e9f0;border-radius:14px;padding:20px 24px}.narrative p{margin:0 0 16px}.narrative p:last-child{margin-bottom:0}li{margin-bottom:14px}li p{margin:0}small{color:#667085}section{margin-top:28px}@media print{body{margin:0;max-width:none}.narrative{break-inside:avoid}}</style>
</head>
<body>
<h1>${escapeHtml(title)}</h1>
<div class="meta">${escapeHtml(name)} · ${sourceCount} sources · ${segmentCount.toLocaleString()} segments</div>
<section><h2>Meeting Summary</h2><div class="narrative">${paragraphs || '<p>No narrative summary generated.</p>'}</div></section>
${extraContent}
</body>
</html>`;
}

function exportDocument(format: string) {
  const document = getActiveDocument();
  if (!document) return;
  exportOneDocument(document, normalizeExportFormat(format));
}

function exportOneDocument(document: TranscriptDocument, format: 'json' | 'txt' | 'md') {
  const stem = document.name.replace(/\.json$/i, '') || 'transcript';
  if (format === 'json') downloadJson(document.transcript, `${stem}.json`);
  if (format === 'txt') downloadTxt(document.transcript, `${stem}.txt`, currentTextExportOptions(document));
  if (format === 'md') downloadMarkdown(document.transcript, `${stem}.md`, currentTextExportOptions(document));
}

function selectAllDocuments() {
  const project = getActiveProject();
  if (!project) return;
  // "Select all" intentionally means original/source files only. Including a large
  // generated merge would duplicate the same transcript data and can explode memory.
  mergeSelection = new Set(project.documents.filter((document) => document.kind === 'source').map((document) => document.id));
  invalidateSummaryCache();
  render();
}

function deselectAllDocuments() {
  mergeSelection.clear();
  invalidateSummaryCache();
  render();
}

async function exportSelected() {
  const project = getActiveProject();
  if (!project || operationStatus) return;
  const selected = project.documents.filter((document) => document.kind === 'source' && mergeSelection.has(document.id));
  if (!selected.length) return;
  const format = getBulkExportFormat();

  try {
    operationStatus = `Converting 0/${selected.length}…`;
    render();
    await yieldToBrowser();

    for (let index = 0; index < selected.length; index += 1) {
      operationStatus = `Converting ${index + 1}/${selected.length}…`;
      updateOperationStatus();
      const document = selected[index];
      const stem = document.name.replace(/\.json$/i, '') || `transcript-${index + 1}`;
      await downloadTranscriptLowMemory(document.transcript, format, `${stem}.${format}`, currentTextExportOptions(document));
      // Give the browser a chance to flush each download before serializing the next file.
      await new Promise((resolve) => window.setTimeout(resolve, 180));
    }
  } catch (error) {
    window.alert(error instanceof Error ? error.message : 'Bulk export failed.');
  } finally {
    operationStatus = null;
    render();
  }
}

async function mergeTranscriptsResponsive(
  documents: TranscriptDocument[],
  onProgress: (done: number, total: number) => void,
): Promise<TranscriptFile> {
  return mergeTranscriptsAsync(documents, onProgress);
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}

function updateOperationStatus() {
  const badge = document.querySelector<HTMLElement>('[data-operation-status]');
  if (badge) badge.textContent = operationStatus ?? 'Ready';
}

function getBulkExportFormat(): 'json' | 'txt' | 'md' {
  const select = document.querySelector<HTMLSelectElement>('#bulk-export-format');
  return normalizeExportFormat(select?.value ?? 'json');
}

function normalizeExportFormat(format: string): 'json' | 'txt' | 'md' {
  return format === 'txt' || format === 'md' ? format : 'json';
}

function currentTextExportOptions(document?: TranscriptDocument) {
  return {
    cleanText: exportCleanupEnabled,
    readableParagraphs: exportReadableEnabled,
    sourceName: document?.name,
  };
}

function confidenceClass(value: number): string {
  if (value >= 0.9) return 'bg-emerald-500/10 text-emerald-300 ring-1 ring-inset ring-emerald-500/20';
  if (value >= 0.7) return 'bg-amber-500/10 text-amber-300 ring-1 ring-inset ring-amber-500/20';
  return 'bg-red-500/10 text-red-300 ring-1 ring-inset ring-red-500/20';
}

function emptyMain(title: string, text: string): string {
  return `<div class="flex min-h-[52vh] items-center justify-center text-center"><div><div class="font-medium text-slate-300">${escapeHtml(title)}</div><div class="mt-1 text-sm text-slate-600">${escapeHtml(text)}</div></div></div>`;
}

function autoResize(textarea: HTMLTextAreaElement) {
  textarea.style.height = '0px';
  textarea.style.height = `${textarea.scrollHeight}px`;
}

function highlight(text: string, search: string): string {
  const escaped = escapeHtml(text);
  if (!search) return escaped;
  const pattern = new RegExp(`(${escapeRegExp(search)})`, 'ig');
  return escaped.replace(pattern, '<mark class="rounded bg-slate-700 px-1 text-white">$1</mark>');
}

function safeDomId(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '_');
}

function documentQueryBySegmentId(segmentId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`#segment-${CSS.escape(safeDomId(segmentId))}`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
