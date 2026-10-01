import type { MeetingNoteBlock, MeetingNoteDocument } from './types';

interface ParsedListItem {
  indent: number;
  text: string;
}

export function parseMeetingNoteMarkdown(name: string, markdown: string, id: string, createdAt = new Date().toISOString()): MeetingNoteDocument {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const blocks: MeetingNoteBlock[] = [];
  const headingStack: string[] = [];
  const listStack: Array<{ indent: number; blockIndex: number }> = [];
  let paragraph: string[] = [];
  let paragraphStart = 0;
  let date: string | undefined;
  let lastExplicitHeadingLevel = 0;

  const flushParagraph = (endLine: number) => {
    const text = cleanInlineMarkdown(paragraph.join(' ').replace(/\s+/g, ' ').trim());
    if (text) {
      blocks.push({
        id: `${id}-block-${blocks.length + 1}`,
        order: blocks.length,
        headingPath: headingStack.filter(Boolean),
        text,
        lineStart: paragraphStart + 1,
        lineEnd: endLine,
      });
    }
    paragraph = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const rawLine = lines[index] ?? '';
    const unescapedRaw = unescapeMarkdownSyntax(rawLine);
    const trimmed = unescapedRaw.trim();

    if (!trimmed) {
      if (paragraph.length) flushParagraph(index);
      listStack.length = 0;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      if (paragraph.length) flushParagraph(index);
      listStack.length = 0;
      continue;
    }

    const dateMatch = cleanInlineMarkdown(trimmed).match(/^date\s*:\s*(.+)$/i);
    if (dateMatch && !date) {
      date = dateMatch[1].trim();
      continue;
    }

    const heading = parseHeading(trimmed);
    if (heading) {
      if (paragraph.length) flushParagraph(index);
      listStack.length = 0;
      const level = Math.max(1, Math.min(6, heading.level));
      lastExplicitHeadingLevel = level;
      headingStack[level - 1] = heading.text;
      headingStack.length = level;
      continue;
    }

    const boldHeading = parseStandaloneBoldHeading(trimmed);
    if (boldHeading) {
      if (paragraph.length) flushParagraph(index);
      listStack.length = 0;
      const level = Math.min(6, Math.max(2, lastExplicitHeadingLevel + 1));
      headingStack[level - 1] = boldHeading;
      headingStack.length = level;
      continue;
    }

    const listItem = parseListItem(unescapedRaw);
    if (listItem) {
      if (paragraph.length) flushParagraph(index);
      const text = cleanInlineMarkdown(listItem.text);
      if (!text) continue;

      while (listStack.length && listStack[listStack.length - 1].indent >= listItem.indent) listStack.pop();
      const parent = listStack[listStack.length - 1];

      if (parent && listItem.indent > parent.indent) {
        const parentBlock = blocks[parent.blockIndex];
        if (parentBlock) {
          parentBlock.details ??= [];
          parentBlock.details.push(text);
          parentBlock.lineEnd = index + 1;
        }
        continue;
      }

      blocks.push({
        id: `${id}-block-${blocks.length + 1}`,
        order: blocks.length,
        headingPath: headingStack.filter(Boolean),
        text,
        details: [],
        listDepth: 0,
        lineStart: index + 1,
        lineEnd: index + 1,
      });
      listStack.push({ indent: listItem.indent, blockIndex: blocks.length - 1 });
      continue;
    }

    listStack.length = 0;
    if (!paragraph.length) paragraphStart = index;
    paragraph.push(trimmed);
  }

  if (paragraph.length) flushParagraph(lines.length);

  return {
    id,
    name,
    createdAt,
    date,
    includeInReports: true,
    rawMarkdown: normalized,
    blocks,
  };
}

export function meetingNoteSectionLabel(block: MeetingNoteBlock): string {
  return block.headingPath.join(' › ');
}

/**
 * Returns the report/evidence representation of one curated note block.
 * Nested Markdown bullets stay attached to their parent action instead of
 * becoming independent actions or findings.
 */
export function meetingNoteBlockEvidenceText(block: MeetingNoteBlock): string {
  const details = (block.details ?? []).filter(Boolean).map((item) => item.replace(/[.;:]+$/, '').trim());
  if (!details.length) return block.text;
  const parent = block.text.replace(/:\s*$/, '');
  return `${parent}: ${details.join('; ')}.`;
}

function parseHeading(line: string): { level: number; text: string } | null {
  const stripped = unwrapWholeLineBold(line);
  const match = stripped.match(/^(#{1,6})\s+(.+)$/);
  if (!match) return null;
  return { level: match[1].length, text: cleanInlineMarkdown(match[2]) };
}

function parseStandaloneBoldHeading(line: string): string | null {
  const match = line.match(/^\*\*(.+)\*\*$/);
  if (!match) return null;
  const text = cleanInlineMarkdown(match[1]);
  if (!text || text.length > 140 || /[.!?]$/.test(text)) return null;
  return text;
}

function parseListItem(line: string): ParsedListItem | null {
  const expanded = line.replace(/\t/g, '    ');
  const match = expanded.match(/^(\s*)(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
  if (!match) return null;
  return { indent: match[1].length, text: match[2].trim() };
}

function unwrapWholeLineBold(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4
    ? trimmed.slice(2, -2).trim()
    : trimmed;
}

function unescapeMarkdownSyntax(value: string): string {
  return value.replace(/\\([#*_`\[\]()+.\-])/g, '$1');
}

function cleanInlineMarkdown(value: string): string {
  return unescapeMarkdownSyntax(value)
    .replace(/^\*\*(.+)\*\*$/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}
