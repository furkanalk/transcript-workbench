import type { ExportProfile, MeetingReport, ReportReference, ReportSection, TranscriptDocument, TranscriptFile, TranscriptSegment } from './types';
import { buildReportDocx } from './docx';

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


export interface ReportExportOptions {
  /** External is the customer-facing deliverable. Internal includes evidence and QA details. */
  profile?: ExportProfile;
  /** Optional override. External reports hide transcript filenames/timestamps by default. */
  includeReferences?: boolean;
}

export function reportToText(report: MeetingReport, options: ReportExportOptions = {}): string {
  const profile = options.profile ?? 'external';
  const includeReferences = options.includeReferences ?? profile === 'internal';
  const lines: string[] = [];
  lines.push(reportTitle(report));
  lines.push(reportMeta(report));
  lines.push('');
  for (const section of report.sections) {
    lines.push(section.title.toUpperCase());
    for (const paragraph of section.paragraphs) {
      lines.push(`${paragraph.text}${includeReferences ? referenceSuffix(paragraph.referenceIds) : ''}`);
      lines.push('');
    }
    for (const bullet of section.bullets) lines.push(`- ${bullet.text}${includeReferences ? referenceSuffix(bullet.referenceIds) : ''}`);
    if (section.bullets.length) lines.push('');
    for (const subsection of section.subsections ?? []) {
      lines.push(subsection.title);
      for (const paragraph of subsection.paragraphs) {
        lines.push(`${paragraph.text}${includeReferences ? referenceSuffix(paragraph.referenceIds) : ''}`);
        lines.push('');
      }
      for (const bullet of subsection.bullets) lines.push(`- ${bullet.text}${includeReferences ? referenceSuffix(bullet.referenceIds) : ''}`);
      lines.push('');
    }
  }
  if (report.requirementMatrix.length) {
    lines.push('REQUIREMENT MATRIX');
    for (const row of report.requirementMatrix) {
      lines.push(`- ${row.requirement}`);
      if (row.currentState) lines.push(`  Current State: ${row.currentState}`);
      if (row.position) lines.push(`  Assessment / Position: ${row.position}`);
      lines.push(`  Status: ${row.status}`);
      if (row.nextAction) lines.push(`  Next Action: ${row.nextAction}`);
    }
    lines.push('');
  }
  if (report.structuredOpenItems.length) {
    lines.push('OUTSTANDING ITEMS');
    for (const item of report.structuredOpenItems) lines.push(`- [${item.status}] ${item.text} · Owner: ${item.owner}`);
    lines.push('');
  }
  if (profile === 'internal') {
    lines.push('INTERNAL QA');
    lines.push(`Coverage: ${report.coverage.includedTopics}/${report.coverage.detectedTopics} topics (${report.coverage.coveragePercent}%)`);
    lines.push(`Confirmed claims: ${report.validation.confirmedClaims}; Supported: ${report.validation.supportedClaims}; Omitted: ${report.validation.omittedClaims}; Potential conflicts: ${report.conflicts.length}`);
    for (const conflict of report.conflicts) lines.push(`- ${conflict.summary}`);
    if (report.reviewQueue.length) {
      lines.push(`Review queue (${report.reviewQueue.length}):`);
      for (const item of report.reviewQueue) lines.push(`- [${item.status}] ${item.text}${item.reason ? ` — ${item.reason}` : ''}`);
    }
    lines.push('');
  }
  if (includeReferences) {
    lines.push(referencesTitle(report).toUpperCase());
    for (const reference of report.references) {
      lines.push(`[${reference.id}] ${reportReferenceSourceLabel(reference)}`);
    }
  }
  return `${lines.join('\n').trim()}\n`;
}

export function reportToMarkdown(report: MeetingReport, options: ReportExportOptions = {}): string {
  const profile = options.profile ?? 'external';
  const includeReferences = options.includeReferences ?? profile === 'internal';
  const lines: string[] = [];
  lines.push(`# ${reportTitle(report)}`);
  lines.push('');
  lines.push(`_${reportMeta(report)}_`);
  lines.push('');
  for (const section of report.sections) {
    lines.push(`## ${section.title}`);
    lines.push('');
    for (const paragraph of section.paragraphs) {
      lines.push(`${paragraph.text}${includeReferences ? referenceSuffix(paragraph.referenceIds) : ''}`);
      lines.push('');
    }
    for (const bullet of section.bullets) lines.push(`- ${bullet.text}${includeReferences ? referenceSuffix(bullet.referenceIds) : ''}`);
    if (section.bullets.length) lines.push('');
    for (const subsection of section.subsections ?? []) {
      lines.push(`### ${subsection.title}`);
      lines.push('');
      for (const paragraph of subsection.paragraphs) {
        lines.push(`${paragraph.text}${includeReferences ? referenceSuffix(paragraph.referenceIds) : ''}`);
        lines.push('');
      }
      for (const bullet of subsection.bullets) lines.push(`- ${bullet.text}${includeReferences ? referenceSuffix(bullet.referenceIds) : ''}`);
      lines.push('');
    }
  }
  if (report.requirementMatrix.length) {
    lines.push('## Requirement Matrix', '');
    lines.push('| Requirement | Current State | Assessment / Position | Status | Next Action |');
    lines.push('|---|---|---|---|---|');
    for (const row of report.requirementMatrix) {
      lines.push(`| ${escapeMarkdownCell(row.requirement)} | ${escapeMarkdownCell(row.currentState ?? '')} | ${escapeMarkdownCell(row.position ?? '')} | ${row.status} | ${escapeMarkdownCell(row.nextAction ?? '')} |`);
    }
    lines.push('');
  }
  if (report.structuredOpenItems.length) {
    lines.push('## Outstanding Items', '');
    lines.push('| Item | Owner | Status |');
    lines.push('|---|---|---|');
    for (const item of report.structuredOpenItems) lines.push(`| ${escapeMarkdownCell(item.text)} | ${item.owner} | ${item.status} |`);
    lines.push('');
  }
  if (profile === 'internal') {
    lines.push('## Internal QA', '');
    lines.push(`- Coverage: ${report.coverage.includedTopics}/${report.coverage.detectedTopics} topics (${report.coverage.coveragePercent}%)`);
    lines.push(`- Confirmed claims: ${report.validation.confirmedClaims}`);
    lines.push(`- Supported claims: ${report.validation.supportedClaims}`);
    lines.push(`- Omitted claims: ${report.validation.omittedClaims}`);
    lines.push(`- Potential conflicts: ${report.conflicts.length}`);
    for (const conflict of report.conflicts) lines.push(`  - ${conflict.summary}`);
    if (report.reviewQueue.length) {
      lines.push(`- Review queue: ${report.reviewQueue.length} omitted claim${report.reviewQueue.length === 1 ? '' : 's'}`);
      for (const item of report.reviewQueue) lines.push(`  - **${item.status}** — ${escapeMarkdownCell(item.text)}${item.reason ? ` — ${escapeMarkdownCell(item.reason)}` : ''}`);
    }
    lines.push('');
  }
  if (includeReferences) {
    lines.push(`## ${referencesTitle(report)}`);
    lines.push('');
    for (const reference of report.references) {
      lines.push(`[${reference.id}]: ${reportReferenceSourceLabel(reference)}`);
    }
  }
  return `${lines.join('\n').trim()}\n`;
}

export function reportToHtml(report: MeetingReport, wordCompatible = false, options: ReportExportOptions = {}): string {
  const profile = options.profile ?? 'external';
  const includeReferences = options.includeReferences ?? profile === 'internal';
  const sections = report.sections.map((section) => reportSectionHtml(section, includeReferences)).join('');
  const requirementMatrix = report.requirementMatrix.length ? requirementMatrixHtml(report) : '';
  const openItems = report.structuredOpenItems.length ? openItemsHtml(report) : '';
  const qa = profile === 'internal' ? internalQaHtml(report) : '';
  const references = includeReferences
    ? `<section class="references"><h2>${escapeHtml(referencesTitle(report))}</h2><ol class="refs">${report.references.map((reference) => `
    <li id="ref-${reference.id}"><strong>[${reference.id}]</strong> ${escapeHtml(reportReferenceSourceLabel(reference))}</li>`).join('')}</ol></section>`
    : '';
  const officeNamespaces = wordCompatible ? ' xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"' : '';
  return `<!doctype html>
<html${officeNamespaces} lang="${report.language === 'tr' ? 'tr' : 'en'}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(reportTitle(report))}</title>
<style>
@page{size:A4;margin:20mm 18mm 20mm 18mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;max-width:900px;margin:42px auto;padding:0 22px;color:#172033;line-height:1.62;font-size:11.2pt}h1{font-size:24pt;margin:0 0 6px}h2{font-size:15pt;margin:28px 0 10px;border-bottom:1px solid #dfe4ea;padding-bottom:6px}h3{font-size:11.5pt;margin:18px 0 8px;color:#344054}p{margin:0 0 12px}ul{margin:8px 0 16px 22px;padding:0}li{margin:0 0 8px}.meta{color:#667085;font-size:9.5pt;margin-bottom:28px}.refs{font-size:9pt;color:#475467}.ref{font-size:8pt;vertical-align:super;color:#344054;margin-left:2px}.report-section{break-inside:auto}.report-subsection{margin:14px 0 4px}.references{break-before:page}.footer-note{margin-top:28px;color:#98a2b3;font-size:8.5pt}table{width:100%;border-collapse:collapse;margin:10px 0 22px;font-size:9.3pt}th,td{border:1px solid #d0d5dd;padding:7px 8px;vertical-align:top;text-align:left}th{background:#f2f4f7;color:#344054}.qa-box{border:1px solid #d0d5dd;background:#f8fafc;padding:12px 14px;margin:12px 0 20px}.status{white-space:nowrap;font-weight:600}@media print{body{margin:0;max-width:none;padding:0}h2,h3{break-after:avoid}p,li{orphans:3;widows:3}}
</style>
</head>
<body>
<h1>${escapeHtml(reportTitle(report))}</h1>
<div class="meta">${escapeHtml(report.title)} · ${escapeHtml(reportMeta(report))}</div>
${sections}
${requirementMatrix}
${openItems}
${qa}
${references}
<div class="footer-note">${escapeHtml(report.language === 'tr' ? 'Seçili toplantı transcript kapsamı temel alınarak hazırlanmıştır.' : 'Prepared from the selected meeting transcript scope.')}</div>
</body>
</html>`;
}

export async function downloadWordReport(report: MeetingReport, filename: string, options: ReportExportOptions = {}): Promise<void> {
  const profile = options.profile ?? 'external';
  const blob = await buildReportDocx(report, profile);
  downloadBlob(blob, filename.endsWith('.docx') ? filename : `${filename}.docx`);
}

export async function downloadPdfReport(report: MeetingReport, filename: string, options: ReportExportOptions = {}): Promise<void> {
  const profile = options.profile ?? 'external';
  const html = reportToHtml(report, false, {
    ...options,
    profile,
    includeReferences: options.includeReferences ?? profile === 'internal',
  });
  const popup = window.open('', '_blank', 'noopener,noreferrer,width=1000,height=800');
  if (!popup) throw new Error('The PDF print window was blocked by the browser. Allow pop-ups and try again.');
  popup.document.open();
  popup.document.write(html.replace(
    '</head>',
    `<style>@media print{.no-print{display:none!important}}</style><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),150));</script></head>`,
  ));
  popup.document.close();
  popup.document.title = filename.replace(/\.pdf$/i, '');
}

function reportSectionHtml(section: ReportSection, includeReferences: boolean): string {
  const paragraphs = section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph.text)}${includeReferences ? referenceLinks(paragraph.referenceIds) : ''}</p>`).join('');
  const bullets = section.bullets.length ? `<ul>${section.bullets.map((bullet) => `<li>${escapeHtml(bullet.text)}${includeReferences ? referenceLinks(bullet.referenceIds) : ''}</li>`).join('')}</ul>` : '';
  const subsections = (section.subsections ?? []).map((subsection) => {
    const subsectionParagraphs = subsection.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph.text)}${includeReferences ? referenceLinks(paragraph.referenceIds) : ''}</p>`).join('');
    const subsectionBullets = subsection.bullets.length ? `<ul>${subsection.bullets.map((bullet) => `<li>${escapeHtml(bullet.text)}${includeReferences ? referenceLinks(bullet.referenceIds) : ''}</li>`).join('')}</ul>` : '';
    return `<div class="report-subsection"><h3>${escapeHtml(subsection.title)}</h3>${subsectionParagraphs}${subsectionBullets}</div>`;
  }).join('');
  return `<section class="report-section"><h2>${escapeHtml(section.title)}</h2>${paragraphs}${bullets}${subsections}</section>`;
}


function requirementMatrixHtml(report: MeetingReport): string {
  const rows = report.requirementMatrix.map((row) => `<tr>
    <td>${escapeHtml(row.requirement)}</td>
    <td>${escapeHtml(row.currentState ?? '')}</td>
    <td>${escapeHtml(row.position ?? '')}</td>
    <td class="status">${escapeHtml(row.status)}</td>
    <td>${escapeHtml(row.nextAction ?? '')}</td>
  </tr>`).join('');
  return `<section class="report-section"><h2>Requirement Matrix</h2><table><thead><tr><th>Requirement</th><th>Current State</th><th>Assessment / Position</th><th>Status</th><th>Next Action</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function openItemsHtml(report: MeetingReport): string {
  const rows = report.structuredOpenItems.map((item) => `<tr><td>${escapeHtml(item.text)}</td><td>${escapeHtml(item.owner)}</td><td class="status">${escapeHtml(item.status)}</td></tr>`).join('');
  return `<section class="report-section"><h2>Outstanding Items</h2><table><thead><tr><th>Item</th><th>Owner</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function internalQaHtml(report: MeetingReport): string {
  const conflicts = report.conflicts.length
    ? `<ul>${report.conflicts.map((conflict) => `<li>${escapeHtml(conflict.summary)}</li>`).join('')}</ul>`
    : '<p>No potential cross-session capability conflicts were detected.</p>';
  return `<section class="report-section references"><h2>Internal QA</h2><div class="qa-box">
    <p><strong>Topic coverage:</strong> ${report.coverage.includedTopics}/${report.coverage.detectedTopics} (${report.coverage.coveragePercent}%)</p>
    <p><strong>Claims:</strong> ${report.validation.confirmedClaims} confirmed · ${report.validation.supportedClaims} supported · ${report.validation.omittedClaims} omitted</p>
    <p><strong>Potential conflicts:</strong> ${report.conflicts.length}</p>
    ${conflicts}
    ${report.reviewQueue.length ? `<h3>Review Queue</h3><ul>${report.reviewQueue.map((item) => `<li><strong>${escapeHtml(item.status)}</strong> — ${escapeHtml(item.text)}${item.reason ? ` — ${escapeHtml(item.reason)}` : ''}</li>`).join('')}</ul>` : ''}
  </div></section>`;
}

function escapeMarkdownCell(value: string): string {
  return value.replace(/\|/g, '\\\\|').replace(/\r?\n/g, ' ').trim();
}

function reportTitle(report: MeetingReport): string {
  if (report.language === 'tr') {
    if (report.mode === 'report') return 'Toplantı Analiz Raporu';
    if (report.mode === 'detailed') return 'Detaylı Toplantı Değerlendirmesi';
    return 'Genel Toplantı Özeti';
  }
  if (report.mode === 'report') return 'Meeting Analysis Report';
  if (report.mode === 'detailed') return 'Detailed Meeting Assessment';
  return 'General Meeting Summary';
}

function referencesTitle(report: MeetingReport): string {
  return report.language === 'tr' ? 'Kaynaklar ve Referanslar' : 'Sources & References';
}

function reportMeta(report: MeetingReport): string {
  const date = new Date(report.generatedAt);
  const prepared = Number.isNaN(date.getTime())
    ? ''
    : new Intl.DateTimeFormat(report.language === 'tr' ? 'tr-TR' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
  const noteCount = report.noteSourceCount ?? 0;
  if (report.language === 'tr') {
    return `${report.sourceCount} seçili toplantı oturumu${noteCount ? ` · ${noteCount} toplantı notu` : ''}${prepared ? ` · Hazırlanma: ${prepared}` : ''}`;
  }
  return `${report.sourceCount} selected meeting session${report.sourceCount === 1 ? '' : 's'}${noteCount ? ` · ${noteCount} meeting note${noteCount === 1 ? '' : 's'}` : ''}${prepared ? ` · Prepared: ${prepared}` : ''}`;
}

function reportReferenceSourceLabel(reference: ReportReference): string {
  if (reference.sourceType === 'meeting-note') {
    const parts = [`Meeting note: ${reference.documentName}`];
    if (reference.sourceDate) parts.push(reference.sourceDate);
    if (reference.sourceSection) parts.push(reference.sourceSection);
    return parts.join(' · ');
  }
  return `${reference.documentName} · ${formatSourceMoment(reference.documentName, reference.displayTime)} · segment #${reference.sequenceId}`;
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
  parts.push('\n');

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
