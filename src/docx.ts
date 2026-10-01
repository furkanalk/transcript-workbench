import type { ExportProfile, MeetingReport, ReportReference } from './types';

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export async function buildReportDocx(report: MeetingReport, profile: ExportProfile = 'external'): Promise<Blob> {
  const entries: ZipEntry[] = [
    entry('[Content_Types].xml', contentTypesXml()),
    entry('_rels/.rels', rootRelsXml()),
    entry('docProps/core.xml', coreXml(report)),
    entry('docProps/app.xml', appXml()),
    entry('word/document.xml', documentXml(report, profile)),
    entry('word/styles.xml', stylesXml()),
    entry('word/_rels/document.xml.rels', documentRelsXml()),
  ];
  const zipBytes = buildStoredZip(entries);
  // BlobPart requires an ArrayBuffer-backed view. In newer TypeScript DOM typings,
  // a plain Uint8Array is typed as Uint8Array<ArrayBufferLike>, which may also
  // reference SharedArrayBuffer and is therefore rejected by the Blob constructor.
  // Copy into a concrete ArrayBuffer so the BlobPart type is unambiguous.
  const zipBuffer = new ArrayBuffer(zipBytes.byteLength);
  new Uint8Array(zipBuffer).set(zipBytes);

  return new Blob([zipBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  });
}

function entry(name: string, value: string): ZipEntry {
  return { name, data: new TextEncoder().encode(value) };
}

function documentXml(report: MeetingReport, profile: ExportProfile): string {
  const body: string[] = [];
  body.push(paragraph(reportTitle(report), 'Title'));
  body.push(paragraph(report.title, 'Subtitle'));
  body.push(paragraph(`Prepared ${formatDate(report.generatedAt)} · ${report.sourceCount} meeting session${report.sourceCount === 1 ? '' : 's'}${report.noteSourceCount ? ` · ${report.noteSourceCount} meeting note${report.noteSourceCount === 1 ? '' : 's'}` : ''}`, 'Meta'));
  body.push(paragraph('Classification: Confidential', 'Meta'));
  body.push(pageBreak());

  for (const section of report.sections) {
    body.push(paragraph(section.title, 'Heading1'));
    for (const item of section.paragraphs) body.push(paragraph(item.text, 'Normal'));
    for (const item of section.bullets) body.push(bullet(item.text));
    for (const subsection of section.subsections ?? []) {
      body.push(paragraph(subsection.title, 'Heading2'));
      for (const item of subsection.paragraphs) body.push(paragraph(item.text, 'Normal'));
      for (const item of subsection.bullets) body.push(bullet(item.text));
    }
  }

  if (report.requirementMatrix.length) {
    body.push(paragraph('Requirement Matrix', 'Heading1'));
    body.push(requirementTable(report));
  }

  if (report.structuredOpenItems.length) {
    body.push(paragraph('Outstanding Items', 'Heading1'));
    body.push(openItemsTable(report));
  }

  if (profile === 'internal') {
    body.push(pageBreak());
    body.push(paragraph('Internal QA & Evidence', 'Heading1'));
    body.push(paragraph(`Coverage: ${report.coverage.includedTopics}/${report.coverage.detectedTopics} detected topics (${report.coverage.coveragePercent}%).`, 'Normal'));
    body.push(paragraph(`Confirmed claims: ${report.validation.confirmedClaims}; supported claims: ${report.validation.supportedClaims}; omitted claims: ${report.validation.omittedClaims}; potential conflicts: ${report.conflicts.length}.`, 'Normal'));
    for (const conflict of report.conflicts) body.push(bullet(conflict.summary));
    if (report.reviewQueue.length) {
      body.push(paragraph('Review Queue', 'Heading2'));
      for (const item of report.reviewQueue) {
        body.push(bullet(`[${item.status}] ${item.text}${item.reason ? ` — ${item.reason}` : ''}`));
      }
    }
    body.push(paragraph('Sources & References', 'Heading2'));
    for (const ref of report.references) body.push(paragraph(`[${ref.id}] ${referenceLabel(ref)}`, 'Reference'));
  }

  body.push(`<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1021" w:bottom="1134" w:left="1021" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr>`);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}</w:body></w:document>`;
}

function referenceLabel(reference: ReportReference): string {
  if (reference.sourceType === 'meeting-note') {
    return [
      `Meeting note: ${reference.documentName}`,
      reference.sourceDate,
      reference.sourceSection,
    ].filter(Boolean).join(' · ');
  }
  return `${reference.documentName} · ${reference.displayTime} · segment #${reference.sequenceId}`;
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

function paragraph(text: string, style = 'Normal'): string {
  return `<w:p><w:pPr><w:pStyle w:val="${style}"/></w:pPr><w:r><w:t xml:space="preserve">${xml(text)}</w:t></w:r></w:p>`;
}

function bullet(text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="Normal"/><w:ind w:left="360" w:hanging="180"/></w:pPr><w:r><w:t xml:space="preserve">• ${xml(text)}</w:t></w:r></w:p>`;
}

function pageBreak(): string {
  return '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
}

function requirementTable(report: MeetingReport): string {
  const rows = [
    tableRow(['Requirement', 'Current State', 'Assessment / Position', 'Status', 'Next Action'], true),
    ...report.requirementMatrix.map((row) => tableRow([
      row.requirement,
      row.currentState ?? '',
      row.position ?? '',
      row.status,
      row.nextAction ?? '',
    ])),
  ];
  return table(rows.join(''), [2500, 2200, 2600, 1200, 2200]);
}

function openItemsTable(report: MeetingReport): string {
  const rows = [
    tableRow(['Outstanding Item', 'Owner', 'Status'], true),
    ...report.structuredOpenItems.map((item) => tableRow([item.text, item.owner, item.status])),
  ];
  return table(rows.join(''), [6500, 1700, 1300]);
}

function table(rows: string, widths: number[]): string {
  const grid = widths.map((width) => `<w:gridCol w:w="${width}"/>`).join('');
  return `<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/></w:tblPr><w:tblGrid>${grid}</w:tblGrid>${rows}</w:tbl>`;
}

function tableRow(cells: string[], header = false): string {
  return `<w:tr>${cells.map((value) => `<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>${header ? '<w:shd w:fill="E9EEF5"/>' : ''}</w:tcPr><w:p><w:r>${header ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(value)}</w:t></w:r></w:p></w:tc>`).join('')}</w:tr>`;
}

function stylesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:sz w:val="21"/><w:color w:val="344054"/></w:rPr><w:pPr><w:spacing w:after="140" w:line="300" w:lineRule="auto"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:rPr><w:b/><w:sz w:val="44"/><w:color w:val="172033"/></w:rPr><w:pPr><w:spacing w:after="120"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="26"/><w:color w:val="475467"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Meta"><w:name w:val="Meta"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="18"/><w:color w:val="667085"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Reference"><w:name w:val="Reference"/><w:basedOn w:val="Normal"/><w:rPr><w:sz w:val="17"/><w:color w:val="667085"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="280" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:sz w:val="30"/><w:color w:val="172033"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="100"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/><w:color w:val="344054"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="D0D5DD"/><w:left w:val="single" w:sz="4" w:color="D0D5DD"/><w:bottom w:val="single" w:sz="4" w:color="D0D5DD"/><w:right w:val="single" w:sz="4" w:color="D0D5DD"/><w:insideH w:val="single" w:sz="4" w:color="D0D5DD"/><w:insideV w:val="single" w:sz="4" w:color="D0D5DD"/></w:tblBorders></w:tblPr></w:style>
</w:styles>`;
}

function contentTypesXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}

function documentRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
}

function coreXml(report: MeetingReport): string {
  const now = new Date(report.generatedAt).toISOString();
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(reportTitle(report))}</dc:title><dc:subject>${xml(report.title)}</dc:subject><dc:creator>Transcript Workbench</dc:creator><cp:lastModifiedBy>Transcript Workbench</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}

function appXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Transcript Workbench</Application></Properties>`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { year: 'numeric', month: 'long', day: 'numeric' }).format(date);
}

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char] ?? char));
}

function buildStoredZip(entries: ZipEntry[]): Uint8Array {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date());

  for (const item of entries) {
    const name = new TextEncoder().encode(item.name);
    const crc = crc32(item.data);
    const local = new Uint8Array(30 + name.length + item.data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, item.data.length, true);
    lv.setUint32(22, item.data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(item.data, 30 + name.length);
    localParts.push(local);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, item.data.length, true);
    cv.setUint32(24, item.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centralParts.push(central);
    offset += local.length;
  }

  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true);

  const total = offset + centralSize + end.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const part of localParts) { out.set(part, cursor); cursor += part.length; }
  for (const part of centralParts) { out.set(part, cursor); cursor += part.length; }
  out.set(end, cursor);
  return out;
}

function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}
