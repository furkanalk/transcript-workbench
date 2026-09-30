import type { TranscriptDocument, TranscriptFile, TranscriptSegment } from './types';

export type ExportFormat = 'json' | 'txt' | 'md';

export interface TextExportOptions {
  cleanText?: boolean;
  readableParagraphs?: boolean;
  sourceName?: string;
}

interface ReadableBlock {
  text: string;
  displayTime: string;
  sourceName: string;
  sourceDate: string | null;
  sequenceId: number;
  mergedOffset?: string;
}

export function transcriptToJson(data: TranscriptFile, pretty = true): string {
  return pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
}

export function transcriptToTxt(data: TranscriptFile, options: TextExportOptions = {}): string {
  return readableBlocks(data.segments, options)
    .map((block, index, blocks) => {
      const sourceChanged = index === 0 || blocks[index - 1]?.sourceName !== block.sourceName;
      const header = sourceChanged ? sourceHeaderTxt(block.sourceName, block.sourceDate) : '';
      return `${header}${humanTimeLabel(block)}\n${block.text}`;
    })
    .join('\n\n')
    .trim() + '\n';
}

export function transcriptToMarkdown(data: TranscriptFile, options: TextExportOptions = {}): string {
  const blocks = readableBlocks(data.segments, options);
  const body = blocks.map((block, index) => {
    const sourceChanged = index === 0 || blocks[index - 1]?.sourceName !== block.sourceName;
    const header = sourceChanged ? sourceHeaderMarkdown(block.sourceName, block.sourceDate) : '';
    return `${header}### ${humanTimeLabel(block, false)}\n\n${block.text}\n\n_Source: ${block.sourceName} · segment #${block.sequenceId}_`;
  }).join('\n\n');
  return `# Transcript\n\n${body}\n`;
}

export function downloadJson(data: TranscriptFile, filename = 'transcript-edited.json') {
  downloadBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), filename);
}

export function downloadTxt(data: TranscriptFile, filename = 'transcript-clean.txt', options: TextExportOptions = {}) {
  downloadBlob(new Blob([transcriptToTxt(data, options)], { type: 'text/plain;charset=utf-8' }), filename);
}

export function downloadMarkdown(data: TranscriptFile, filename = 'transcript-clean.md', options: TextExportOptions = {}) {
  downloadBlob(new Blob([transcriptToMarkdown(data, options)], { type: 'text/markdown;charset=utf-8' }), filename);
}

export function downloadTextContent(content: string, filename: string, markdown = false) {
  downloadBlob(new Blob([content], { type: markdown ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' }), filename);
}

export function downloadHtmlContent(content: string, filename: string) {
  downloadBlob(new Blob([content], { type: 'text/html;charset=utf-8' }), filename);
}

export async function downloadTranscriptLowMemory(
  data: TranscriptFile,
  format: ExportFormat,
  filename: string,
  options: TextExportOptions = {},
): Promise<void> {
  if (format === 'json') {
    const parts: BlobPart[] = [];
    parts.push(`{\n  "version": ${JSON.stringify(data.version ?? '1.0')},\n  "last_updated": ${JSON.stringify(data.last_updated ?? new Date().toISOString())},\n  "segments": [\n`);
    for (let index = 0; index < data.segments.length; index += 1) {
      parts.push(`${index ? ',\n' : ''}    ${JSON.stringify(data.segments[index])}`);
      if (index > 0 && index % 700 === 0) await yieldToBrowser();
    }
    parts.push(`\n  ],\n  "total_segments": ${data.segments.length}\n}\n`);
    downloadBlob(new Blob(parts, { type: 'application/json' }), filename);
    return;
  }

  const parts: BlobPart[] = [];
  const blocks = readableBlocks(data.segments, options);
  if (format === 'md') parts.push('# Transcript\n\n');

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index];
    const sourceChanged = index === 0 || blocks[index - 1]?.sourceName !== block.sourceName;
    if (format === 'txt') {
      if (index) parts.push('\n\n');
      if (sourceChanged) parts.push(sourceHeaderTxt(block.sourceName, block.sourceDate));
      parts.push(`${humanTimeLabel(block)}\n${block.text}`);
    } else {
      if (index) parts.push('\n\n');
      if (sourceChanged) parts.push(sourceHeaderMarkdown(block.sourceName, block.sourceDate));
      parts.push(`### ${humanTimeLabel(block, false)}\n\n${block.text}\n\n_Source: ${block.sourceName} · segment #${block.sequenceId}_`);
    }
    if (index > 0 && index % 350 === 0) await yieldToBrowser();
  }
  if (format === 'md') parts.push('\n');
  else parts.push('\n');

  downloadBlob(new Blob(parts, { type: format === 'md' ? 'text/markdown;charset=utf-8' : 'text/plain;charset=utf-8' }), filename);
}

/**
 * Builds a merged download incrementally. Human-readable exports use each
 * source file's real display_time. The synthetic merged offset is preserved only
 * in JSON as _merged_offset metadata.
 */
export async function downloadMergedDocuments(
  documents: TranscriptDocument[],
  format: ExportFormat,
  filename: string,
  onProgress?: (done: number, total: number) => void,
  options: TextExportOptions = {},
): Promise<void> {
  if (documents.length < 2) throw new Error('Select at least two transcripts to merge.');

  const parts: BlobPart[] = [];
  let offset = 0;
  let sequence = 1;
  let emitted = 0;

  if (format === 'json') {
    parts.push(`{\n  "version": "1.1",\n  "last_updated": ${JSON.stringify(new Date().toISOString())},\n  "segments": [\n`);
  } else if (format === 'md') {
    parts.push('# Transcript\n\n');
  }

  for (let documentIndex = 0; documentIndex < documents.length; documentIndex += 1) {
    const document = documents[documentIndex];
    const segments = document.transcript.segments;
    if (segments.length) {
      const base = segments[0]?.audio_start_time ?? 0;
      let documentEnd = base;
      for (const segment of segments) documentEnd = Math.max(documentEnd, segment.audio_end_time);

      if (format === 'txt') {
        if (emitted) parts.push('\n\n');
        parts.push(sourceHeaderTxt(document.name, parseDateFromFilename(document.name)));
      } else if (format === 'md') {
        if (emitted) parts.push('\n\n');
        parts.push(sourceHeaderMarkdown(document.name, parseDateFromFilename(document.name)));
      }

      if (format === 'json') {
        for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
          const segment = segments[segmentIndex];
          const adjustedStart = offset + Math.max(0, segment.audio_start_time - base);
          const adjustedEnd = offset + Math.max(adjustedStart, segment.audio_end_time - base);
          const source = segment._source ?? {
            document_id: document.id,
            document_name: document.name,
            segment_id: segment.id,
            sequence_id: segment.sequence_id,
            display_time: segment.display_time,
          };
          const mergedSegment: TranscriptSegment = {
            ...segment,
            id: `merge_${sequence}_${source.document_id}_${source.segment_id}`,
            sequence_id: sequence,
            display_time: source.display_time,
            audio_start_time: adjustedStart,
            audio_end_time: adjustedEnd,
            duration: Math.max(0, adjustedEnd - adjustedStart),
            _source: source,
            _merged_offset: formatClock(adjustedStart),
          };
          parts.push(`${emitted ? ',\n' : ''}${indentJson(JSON.stringify(mergedSegment), 4)}`);
          emitted += 1;
          sequence += 1;
          if (segmentIndex > 0 && segmentIndex % 500 === 0) await yieldToBrowser();
        }
      } else {
        const blocks = readableBlocks(segments, { ...options, sourceName: document.name });
        for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
          const block = blocks[blockIndex];
          if (blockIndex) parts.push('\n\n');
          if (format === 'txt') {
            parts.push(`${humanTimeLabel(block)}\n${block.text}`);
          } else {
            parts.push(`### ${humanTimeLabel(block, false)}\n\n${block.text}\n\n_Source: ${document.name} · segment #${block.sequenceId}_`);
          }
          emitted += 1;
          if (blockIndex > 0 && blockIndex % 350 === 0) await yieldToBrowser();
        }
        sequence += segments.length;
      }

      offset += Math.max(0, documentEnd - base) + 1;
    }

    onProgress?.(documentIndex + 1, documents.length);
    await yieldToBrowser();
  }

  if (format === 'json') parts.push(`\n  ],\n  "total_segments": ${emitted}\n}\n`);
  else parts.push('\n');

  const mime = format === 'json'
    ? 'application/json'
    : format === 'md'
      ? 'text/markdown;charset=utf-8'
      : 'text/plain;charset=utf-8';
  downloadBlob(new Blob(parts, { type: mime }), filename);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2500);
}

export function cleanTranscriptText(value: string): string {
  let text = value.replace(/\s+/g, ' ').trim();
  if (!text) return '';

  // Drop only unmistakable filler-only fragments. Semantic words such as yes/no/okay are kept.
  if (/^(?:um+|uh+|hmm+|mm+|erm+|er+|ah+)[.!?,\s-]*$/i.test(text)) return '';

  text = text
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:!?])(\S)/g, '$1 $2')
    .replace(/\b(um|uh|erm)(?:\s*[,.-]?\s*\1)+\b/gi, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text;
}

export function formatSourceMoment(filename: string, displayTime: string): string {
  const date = parseDateFromFilename(filename);
  return date ? `${date} · ${displayTime}` : displayTime;
}

export function parseDateFromFilename(filename: string): string | null {
  const base = filename.replace(/\.[^.]+$/, '');
  const dmy = base.match(/(?:^|\D)(\d{1,2})[-_.](\d{1,2})[-_.](\d{4})(?:\D|$)/);
  const ymd = base.match(/(?:^|\D)(\d{4})[-_.](\d{1,2})[-_.](\d{1,2})(?:\D|$)/);

  let day: number;
  let month: number;
  let year: number;
  if (dmy) {
    day = Number(dmy[1]); month = Number(dmy[2]); year = Number(dmy[3]);
  } else if (ymd) {
    year = Number(ymd[1]); month = Number(ymd[2]); day = Number(ymd[3]);
  } else {
    return null;
  }
  if (!isValidDate(year, month, day)) return null;
  return new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(Date.UTC(year, month - 1, day)));
}

function readableBlocks(segments: TranscriptSegment[], options: TextExportOptions): ReadableBlock[] {
  const readable = options.readableParagraphs !== false;
  const clean = options.cleanText === true;
  const blocks: ReadableBlock[] = [];
  let current: ReadableBlock | null = null;
  let previousSegment: TranscriptSegment | null = null;

  for (const segment of segments) {
    const text = clean ? cleanTranscriptText(segment.text) : segment.text.replace(/\s+/g, ' ').trim();
    if (!text) continue;

    const sourceName = segment._source?.document_name ?? options.sourceName ?? 'Transcript';
    const displayTime = segment._source?.display_time ?? segment.display_time;
    const sourceDate = parseDateFromFilename(sourceName);
    const sameSource = current !== null ? current.sourceName === sourceName : false;
    const gap = previousSegment ? Math.max(0, segment.audio_start_time - previousSegment.audio_end_time) : Number.POSITIVE_INFINITY;
    const canJoin = readable && current !== null && sameSource && gap <= 14 && current.text.length + text.length <= 1050;

    if (canJoin && current) {
      current.text = joinText(current.text, text);
    } else {
      current = {
        text,
        displayTime,
        sourceName,
        sourceDate,
        sequenceId: segment._source?.sequence_id ?? segment.sequence_id,
        mergedOffset: segment._merged_offset,
      };
      blocks.push(current);
    }
    previousSegment = segment;
  }
  return blocks;
}

function joinText(left: string, right: string): string {
  if (!left) return right;
  if (!right) return left;
  return `${left.trimEnd()} ${right.trimStart()}`.replace(/\s+/g, ' ');
}

function humanTimeLabel(block: ReadableBlock, brackets = true): string {
  return brackets ? `[${block.displayTime}]` : block.displayTime;
}

function sourceHeaderTxt(sourceName: string, sourceDate: string | null): string {
  const dateLine = sourceDate ? `\nDate: ${sourceDate}` : '';
  return `=== ${sourceName} ===${dateLine}\n\n`;
}

function sourceHeaderMarkdown(sourceName: string, sourceDate: string | null): string {
  const date = sourceDate ? ` · ${sourceDate}` : '';
  return `## ${sourceName}${date}\n\n`;
}

function indentJson(value: string, spaces: number): string {
  return `${' '.repeat(spaces)}${value}`;
}

function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((value) => String(value).padStart(2, '0')).join(':');
}

function isValidDate(year: number, month: number, day: number): boolean {
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}
