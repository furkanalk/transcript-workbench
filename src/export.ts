import type { MeetingReport, ReportSection, TranscriptDocument, TranscriptFile, TranscriptSegment } from './types';

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


export function reportToText(report: MeetingReport): string {
  const lines: string[] = [];
  lines.push(reportTitle(report));
  lines.push(reportMeta(report));
  lines.push('');
  for (const section of report.sections) {
    lines.push(section.title.toUpperCase());
    for (const paragraph of section.paragraphs) {
      lines.push(`${paragraph.text}${referenceSuffix(paragraph.referenceIds)}`);
      lines.push('');
    }
    for (const bullet of section.bullets) lines.push(`- ${bullet.text}${referenceSuffix(bullet.referenceIds)}`);
    if (section.bullets.length) lines.push('');
  }
  lines.push(referencesTitle(report).toUpperCase());
  for (const reference of report.references) {
    lines.push(`[${reference.id}] ${reference.documentName} · ${formatSourceMoment(reference.documentName, reference.displayTime)} · segment #${reference.sequenceId}`);
  }
  return `${lines.join('\n').trim()}\n`;
}

export function reportToMarkdown(report: MeetingReport): string {
  const lines: string[] = [];
  lines.push(`# ${reportTitle(report)}`);
  lines.push('');
  lines.push(`_${reportMeta(report)}_`);
  lines.push('');
  for (const section of report.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    for (const paragraph of section.paragraphs) {
      lines.push(`${paragraph.text}${referenceSuffix(paragraph.referenceIds)}`);
      lines.push('');
    }
    for (const bullet of section.bullets) lines.push(`- ${bullet.text}${referenceSuffix(bullet.referenceIds)}`);
    if (section.bullets.length) lines.push('');
  }
  lines.push(`## ${referencesTitle(report)}`);
  lines.push('');
  for (const reference of report.references) {
    lines.push(`[${reference.id}]: ${reference.documentName} · ${formatSourceMoment(reference.documentName, reference.displayTime)} · segment #${reference.sequenceId}`);
  }
  return `${lines.join('\n').trim()}\n`;
}

export function reportToHtml(report: MeetingReport, wordCompatible = false): string {
  const sections = report.sections.map((section) => reportSectionHtml(section)).join('');
  const references = report.references.map((reference) => `
    <li id="ref-${reference.id}"><strong>[${reference.id}]</strong> ${escapeHtml(reference.documentName)} · ${escapeHtml(formatSourceMoment(reference.documentName, reference.displayTime))} · segment #${reference.sequenceId}</li>`).join('');
  const officeNamespaces = wordCompatible ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"' : '';
  return `<!doctype html>
<html${officeNamespaces} lang="${report.language === 'tr' ? 'tr' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(reportTitle(report))}</title>
<style>
@page{size:A4;margin:20mm 18mm 20mm 18mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;max-width:900px;margin:42px auto;padding:0 22px;color:#172033;line-height:1.62;font-size:11.2pt}h1{font-size:24pt;margin:0 0 6px}h2{font-size:15pt;margin:28px 0 10px;border-bottom:1px solid #dfe4ea;padding-bottom:6px}p{margin:0 0 12px}ul{margin:8px 0 16px 22px;padding:0}li{margin:0 0 8px}.meta{color:#667085;font-size:9.5pt;margin-bottom:28px}.refs{font-size:9pt;color:#475467}.ref{font-size:8pt;vertical-align:super;color:#344054;margin-left:2px}.report-section{break-inside:auto}.references{break-before:page}.footer-note{margin-top:28px;color:#98a2b3;font-size:8.5pt}@media print{body{margin:0;max-width:none;padding:0}h2{break-after:avoid}p,li{orphans:3;widows:3}}
</style>
</head>
<body>
<h1>${escapeHtml(reportTitle(report))}</h1>
<div class="meta">${escapeHtml(report.title)} · ${escapeHtml(reportMeta(report))}</div>
${sections}
<section class="references"><h2>${escapeHtml(referencesTitle(report))}</h2><ol class="refs">${references}</ol></section>
<div class="footer-note">${escapeHtml(report.language === 'tr' ? 'Seçili transcript kapsamından Transcript Workbench tarafından oluşturuldu.' : 'Generated by Transcript Workbench from the selected transcript scope.')}</div>
</body>
</html>`;
}

export function downloadWordReport(report: MeetingReport, filename: string): void {
  const html = reportToHtml(report, true);
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' });
  downloadBlob(blob, filename.endsWith('.doc') ? filename : `${filename}.doc`);
}

export async function downloadPdfReport(report: MeetingReport, filename: string): Promise<void> {
  const pdfMake = await ensurePdfMake();
  const content: unknown[] = [
    { text: reportTitle(report), style: 'title' },
    { text: `${report.title} · ${reportMeta(report)}`, style: 'meta' },
  ];

  for (const section of report.sections) {
    content.push({ text: section.title, style: 'heading', margin: [0, 14, 0, 7] });
    for (const paragraph of section.paragraphs) {
      content.push({ text: [{ text: paragraph.text }, { text: referenceSuffix(paragraph.referenceIds), style: 'reference' }], style: 'paragraph' });
    }
    if (section.bullets.length) {
      content.push({
        ul: section.bullets.map((bullet) => ({ text: [{ text: bullet.text }, { text: referenceSuffix(bullet.referenceIds), style: 'reference' }] })),
        margin: [8, 2, 0, 10],
      });
    }
  }

  content.push({ text: referencesTitle(report), style: 'heading', pageBreak: 'before', margin: [0, 0, 0, 7] });
  content.push({
    ol: report.references.map((reference) => `${reference.documentName} · ${formatSourceMoment(reference.documentName, reference.displayTime)} · segment #${reference.sequenceId}`),
    style: 'references',
  });

  const definition = {
    pageSize: 'A4',
    pageMargins: [52, 54, 52, 54],
    defaultStyle: { font: 'Roboto', fontSize: 10.5, lineHeight: 1.32 },
    content,
    styles: {
      title: { fontSize: 22, bold: true, color: '#172033', margin: [0, 0, 0, 4] },
      meta: { fontSize: 9, color: '#667085', margin: [0, 0, 0, 16] },
      heading: { fontSize: 14, bold: true, color: '#172033' },
      paragraph: { fontSize: 10.5, color: '#344054', margin: [0, 0, 0, 9] },
      reference: { fontSize: 7.5, color: '#667085' },
      references: { fontSize: 8.5, color: '#475467' },
    },
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        { text: 'Transcript Workbench', alignment: 'left', color: '#98a2b3', fontSize: 8 },
        { text: `Page ${currentPage} of ${pageCount}`, alignment: 'right', color: '#98a2b3', fontSize: 8 },
      ],
      margin: [52, 0, 52, 0],
    }),
  };

  const outputName = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
  pdfMake.createPdf(definition).download(outputName);
}

function reportSectionHtml(section: ReportSection): string {
  const paragraphs = section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph.text)}${referenceLinks(paragraph.referenceIds)}</p>`).join('');
  const bullets = section.bullets.length ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet.text)}${referenceLinks(bullet.referenceIds)}</li>`).join('')}</ul>` : '';
  return `<section class="report-section"><h2>${escapeHtml(section.title)}</h2>${paragraphs}${bullets}</section>`;
}

function reportTitle(report: MeetingReport): string {
  if (report.language === 'tr') {
    if (report.mode === 'report') return 'Toplantı Analiz Raporu';
    if (report.mode === 'detailed') return 'Detaylı Toplantı Özeti';
    return 'Genel Toplantı Özeti';
  }
  if (report.mode === 'report') return 'Meeting Analysis Report';
  if (report.mode === 'detailed') return 'Detailed Meeting Summary';
  return 'General Meeting Summary';
}

function referencesTitle(report: MeetingReport): string {
  return report.language === 'tr' ? 'Kaynaklar ve Referanslar' : 'Sources & References';
}

function reportMeta(report: MeetingReport): string {
  if (report.language === 'tr') {
    return `Kaynak: ${report.sourceCount} · Segment: ${report.segmentCount.toLocaleString()} · Kelime: ${report.wordCount.toLocaleString()}`;
  }
  return `Sources: ${report.sourceCount} · Segments: ${report.segmentCount.toLocaleString()} · Words: ${report.wordCount.toLocaleString()}`;
}

function referenceSuffix(referenceIds: number[]): string {
  return referenceIds.length ? ` ${referenceIds.map((id) => `[${id}]`).join('')}` : '';
}

function referenceLinks(referenceIds: number[]): string {
  return referenceIds.map((id) => `<a class="ref" href="#ref-${id}">[${id}]</a>`).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character));
}

async function ensurePdfMake(): Promise<any> {
  const globalWindow = window as unknown as { pdfMake?: any };
  if (globalWindow.pdfMake?.createPdf) return globalWindow.pdfMake;
  await loadScript('https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/pdfmake.min.js');
  await loadScript('https://cdn.jsdelivr.net/npm/pdfmake@0.2.20/build/vfs_fonts.js');
  if (!globalWindow.pdfMake?.createPdf) throw new Error('PDF engine could not be loaded. Check your network connection and try again.');
  return globalWindow.pdfMake;
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(`script[data-tw-src="${src}"]`);
  if (existing?.dataset.loaded === 'true') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = existing ?? document.createElement('script');
    script.src = src;
    script.async = true;
    script.dataset.twSrc = src;
    script.addEventListener('load', () => { script.dataset.loaded = 'true'; resolve(); }, { once: true });
    script.addEventListener('error', () => reject(new Error(`Could not load ${src}`)), { once: true });
    if (!existing) document.head.appendChild(script);
  });
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
