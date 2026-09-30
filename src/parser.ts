import type { SegmentSource, TranscriptDocument, TranscriptFile, TranscriptSegment } from './types';

export function parseTranscript(raw: string): TranscriptFile {
  const parsed = JSON.parse(raw) as TranscriptFile;
  if (!parsed || !Array.isArray(parsed.segments)) {
    throw new Error('Invalid transcript file: expected a "segments" array.');
  }

  parsed.segments = parsed.segments.map((segment, index) => normalizeSegment(segment, index));
  parsed.total_segments = parsed.segments.length;
  return parsed;
}

/**
 * Merge files into a continuous audio timeline while preserving the real source
 * display_time. The synthetic merge offset is stored separately in _merged_offset
 * so it is never mistaken for the meeting's clock time.
 */
export function mergeTranscripts(documents: TranscriptDocument[]): TranscriptFile {
  if (documents.length < 2) throw new Error('Select at least two transcripts to merge.');

  const merged: TranscriptSegment[] = [];
  let offset = 0;
  let sequence = 1;

  for (const document of documents) {
    const segments = document.transcript.segments;
    if (!segments.length) continue;

    const base = segments[0]?.audio_start_time ?? 0;
    let documentEnd = base;
    for (const segment of segments) {
      if (segment.audio_end_time > documentEnd) documentEnd = segment.audio_end_time;
    }

    for (const segment of segments) {
      const adjustedStart = offset + Math.max(0, segment.audio_start_time - base);
      const adjustedEnd = offset + Math.max(adjustedStart, segment.audio_end_time - base);
      const source = segment._source ?? sourceFrom(document, segment);

      merged.push({
        ...segment,
        id: `merge_${sequence}_${source.document_id}_${source.segment_id}`,
        sequence_id: sequence,
        // Keep the source wall-clock timestamp as the visible timestamp.
        display_time: source.display_time,
        audio_start_time: adjustedStart,
        audio_end_time: adjustedEnd,
        duration: Math.max(0, adjustedEnd - adjustedStart),
        _source: source,
        _merged_offset: formatClock(adjustedStart),
      });
      sequence += 1;
    }

    offset += Math.max(0, documentEnd - base) + 1;
  }

  return {
    version: '1.1',
    last_updated: new Date().toISOString(),
    total_segments: merged.length,
    segments: merged,
  };
}

export async function mergeTranscriptsAsync(
  documents: TranscriptDocument[],
  onProgress?: (done: number, total: number) => void,
): Promise<TranscriptFile> {
  if (documents.length < 2) throw new Error('Select at least two transcripts to merge.');

  const merged: TranscriptSegment[] = [];
  let offset = 0;
  let sequence = 1;

  for (let documentIndex = 0; documentIndex < documents.length; documentIndex += 1) {
    const document = documents[documentIndex];
    const segments = document.transcript.segments;
    if (segments.length) {
      const base = segments[0]?.audio_start_time ?? 0;
      let documentEnd = base;
      for (const segment of segments) {
        if (segment.audio_end_time > documentEnd) documentEnd = segment.audio_end_time;
      }

      for (let segmentIndex = 0; segmentIndex < segments.length; segmentIndex += 1) {
        const segment = segments[segmentIndex];
        const adjustedStart = offset + Math.max(0, segment.audio_start_time - base);
        const adjustedEnd = offset + Math.max(adjustedStart, segment.audio_end_time - base);
        const source = segment._source ?? sourceFrom(document, segment);
        merged.push({
          ...segment,
          id: `merge_${sequence}_${source.document_id}_${source.segment_id}`,
          sequence_id: sequence,
          display_time: source.display_time,
          audio_start_time: adjustedStart,
          audio_end_time: adjustedEnd,
          duration: Math.max(0, adjustedEnd - adjustedStart),
          _source: source,
          _merged_offset: formatClock(adjustedStart),
        });
        sequence += 1;
        if (segmentIndex > 0 && segmentIndex % 1200 === 0) await yieldToBrowser();
      }

      offset += Math.max(0, documentEnd - base) + 1;
    }
    onProgress?.(documentIndex + 1, documents.length);
    await yieldToBrowser();
  }

  return {
    version: '1.1',
    last_updated: new Date().toISOString(),
    total_segments: merged.length,
    segments: merged,
  };
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function sourceFrom(document: TranscriptDocument, segment: TranscriptSegment): SegmentSource {
  return {
    document_id: document.id,
    document_name: document.name,
    segment_id: segment.id,
    sequence_id: segment.sequence_id,
    display_time: segment._source?.display_time ?? segment.display_time,
  };
}

function normalizeSegment(segment: Partial<TranscriptSegment>, index: number): TranscriptSegment {
  const start = Number(segment.audio_start_time ?? 0);
  const end = Number(segment.audio_end_time ?? start);
  const source = normalizeSource(segment._source);

  return {
    id: String(segment.id ?? `seg_${index + 1}`),
    sequence_id: Number(segment.sequence_id ?? index + 1),
    text: String(segment.text ?? ''),
    display_time: String(segment.display_time ?? source?.display_time ?? formatClock(start)),
    audio_start_time: start,
    audio_end_time: end,
    duration: Number(segment.duration ?? Math.max(0, end - start)),
    confidence: clamp(Number(segment.confidence ?? 0), 0, 1),
    ...(source ? { _source: source } : {}),
    ...(segment._merged_offset ? { _merged_offset: String(segment._merged_offset) } : {}),
  };
}

function normalizeSource(source: SegmentSource | undefined): SegmentSource | undefined {
  if (!source || typeof source !== 'object') return undefined;
  if (!source.document_id || !source.document_name) return undefined;
  return {
    document_id: String(source.document_id),
    document_name: String(source.document_name),
    segment_id: String(source.segment_id ?? ''),
    sequence_id: Number(source.sequence_id ?? 0),
    display_time: String(source.display_time ?? '00:00:00'),
  };
}

export function formatClock(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((value) => String(value).padStart(2, '0')).join(':');
}

export function makeId(prefix = 'id'): string {
  if (globalThis.crypto?.randomUUID) return `${prefix}_${globalThis.crypto.randomUUID()}`;
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
