import type { MeetingNoteBlock, MeetingNoteDocument } from './types';

export function parseMeetingNoteMarkdown(name: string, markdown: string, id: string, createdAt = new Date().toISOString()): MeetingNoteDocument {
  const normalized = markdown.replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  const blocks: MeetingNoteBlock[] = [];
  const headingStack: string[] = [];
  let paragraph: string[] = [];
  let paragraphStart = 0;
  let date: string | undefined;

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
    const unescaped = unescapeMarkdownSyntax(rawLine).trim();

    if (!unescaped) {
      if (paragraph.length) flushParagraph(index);
      continue;
    }

    if (/^---+$/.test(unescaped)) {
      if (paragraph.length) flushParagraph(index);
      continue;
    }

    const dateMatch = cleanInlineMarkdown(unescaped).match(/^date\s*:\s*(.+)$/i);
    if (dateMatch && !date) {
      date = dateMatch[1].trim();
      continue;
    }

    const heading = parseHeading(unescaped);
    if (heading) {
      if (paragraph.length) flushParagraph(index);
      const level = Math.max(1, Math.min(6, heading.level));
      headingStack[level - 1] = heading.text;
      headingStack.length = level;
      continue;
    }

    const boldHeading = parseStandaloneBoldHeading(unescaped);
    if (boldHeading) {
      if (paragraph.length) flushParagraph(index);
      const level = Math.min(6, Math.max(2, headingStack.length + 1));
      headingStack[level - 1] = boldHeading;
      headingStack.length = level;
      continue;
    }

    const listItem = parseListItem(unescaped);
    if (listItem) {
      if (paragraph.length) flushParagraph(index);
      const text = cleanInlineMarkdown(listItem);
      if (text) {
        blocks.push({
          id: `${id}-block-${blocks.length + 1}`,
          order: blocks.length,
          headingPath: headingStack.filter(Boolean),
          text,
          lineStart: index + 1,
          lineEnd: index + 1,
        });
      }
      continue;
    }

    if (!paragraph.length) paragraphStart = index;
    paragraph.push(unescaped);
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

function parseListItem(line: string): string | null {
  const match = line.match(/^\s*(?:[-*+]\s+|\d+[.)]\s+)(.+)$/);
  return match?.[1]?.trim() ?? null;
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
