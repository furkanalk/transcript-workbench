import type { AIEnhancementMeta, AIModelPreset, AnswerResult, MeetingReport, Project, SearchHit, SummaryLanguage } from './types';
import { searchProject } from './intelligence';

export interface AIEnhancementSettings {
  provider: 'openai';
  model: AIModelPreset;
}

export interface AIEnhancementProgress {
  completed: number;
  total: number;
}

export const AI_MODEL_OPTIONS: Array<{ id: AIModelPreset; label: string; description: string }> = [
  { id: 'gpt-5.6-luna', label: 'Luna', description: 'Economy / high-volume' },
  { id: 'gpt-5.6-terra', label: 'Terra', description: 'Balanced quality and cost' },
  { id: 'gpt-5.6-sol', label: 'Sol', description: 'Highest quality' },
];

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const MAX_CHARS_PER_BATCH = 11_000;
const MAX_OUTPUT_TOKENS = 8_000;

interface TextSlot {
  id: string;
  text: string;
  set: (value: string) => void;
}

interface RewriteResult {
  id: string;
  text: string;
}


export interface AIAskSettings {
  provider: 'openai';
  model: AIModelPreset;
  evidenceLimit?: number;
}

interface AIAskPayload {
  answer?: unknown;
  reference_ids?: unknown;
  confidence?: unknown;
}

export async function answerQuestionWithAI(
  project: Project,
  question: string,
  apiKey: string,
  settings: AIAskSettings,
): Promise<AnswerResult> {
  if (!apiKey.trim()) throw new Error('AI Enhanced Ask is enabled, but no API key is configured.');

  const evidenceLimit = Math.max(3, Math.min(10, settings.evidenceLimit ?? 8));
  const references = searchProject(project, question, evidenceLimit);
  if (!references.length) {
    return {
      answer: looksTurkish(question)
        ? 'Seçili transcriptlerde bu soruyu güvenilir biçimde yanıtlayacak yeterli kanıt bulunamadı.'
        : 'The selected transcripts do not contain enough evidence to answer this question reliably.',
      confidence: 'not-found',
      references: [],
    };
  }

  const evidence = references.map((hit, index) => ({
    id: `R${index + 1}`,
    source: hit.documentName,
    timestamp: hit.displayTime,
    confidence: Math.round(hit.confidence * 100),
    text: compactAskEvidence(hit.context || hit.text, 1400),
  }));

  const input = {
    task: 'grounded_transcript_question_answering',
    question,
    rules: [
      'Answer only from the supplied transcript evidence. Do not use outside knowledge, web knowledge, product documentation, or assumptions.',
      'If the evidence is insufficient, contradictory, tentative, or only discusses a proposal, say so clearly.',
      'Do not turn a recommendation, possibility, roadmap item, question, or proposed approach into a confirmed capability or decision.',
      'Preserve product names, technical terminology, numbers, dates, qualifiers, and uncertainty exactly in meaning.',
      'Do not invent owners, decisions, implementation details, benchmark conditions, timelines, or product support statements.',
      'Answer in the same language as the user question unless the question explicitly requests another language.',
      'Use only evidence IDs from the supplied evidence list.',
      'Return JSON only: {"answer":"...","reference_ids":["R1"],"confidence":"strong|moderate|weak|not-found"}.',
    ],
    evidence,
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model: settings.model,
      input: JSON.stringify(input),
      max_output_tokens: 1800,
    }),
  });
  if (!response.ok) throw await apiError(response);

  const payload = await response.json();
  const parsed = parseJsonObject(readResponseText(payload)) as AIAskPayload;
  const answer = typeof parsed.answer === 'string' ? parsed.answer.replace(/\s+/g, ' ').trim() : '';
  if (!answer) throw new Error('The AI provider returned an empty grounded answer.');

  const allowedIds = new Map(evidence.map((item, index) => [item.id, references[index]]));
  const requestedIds = Array.isArray(parsed.reference_ids)
    ? parsed.reference_ids.filter((value): value is string => typeof value === 'string')
    : [];
  const selectedReferences = requestedIds
    .map((id) => allowedIds.get(id))
    .filter((hit): hit is SearchHit => Boolean(hit));

  const safeReferences = selectedReferences.length ? uniqueAskReferences(selectedReferences) : references.slice(0, 3);
  const evidenceText = `${question}\n${safeReferences.map((hit) => hit.context || hit.text).join('\n')}`;
  if (!numbersAreGrounded(answer, evidenceText)) {
    throw new Error('The AI answer introduced a number that was not present in the retrieved evidence.');
  }

  const confidence = normalizeAskConfidence(parsed.confidence, safeReferences);
  return {
    answer,
    confidence,
    references: safeReferences,
  };
}

function normalizeAskConfidence(value: unknown, references: SearchHit[]): AnswerResult['confidence'] {
  if (value === 'not-found') return 'not-found';
  if (value === 'weak') return 'weak';
  if (value === 'moderate') return 'moderate';
  if (value === 'strong') {
    const top = references[0]?.score ?? 0;
    const second = references[1]?.score ?? 0;
    return top >= 4.2 || (top >= 2.5 && second >= 1.8) ? 'strong' : 'moderate';
  }
  const top = references[0]?.score ?? 0;
  return top >= 4.2 ? 'strong' : top >= 1.35 ? 'moderate' : 'weak';
}

function compactAskEvidence(value: string, limit: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length <= limit) return text;
  const prefix = text.slice(0, limit);
  const boundary = Math.max(prefix.lastIndexOf('. '), prefix.lastIndexOf('? '), prefix.lastIndexOf('! '));
  return (boundary > limit * 0.55 ? prefix.slice(0, boundary + 1) : prefix).trim();
}

function uniqueAskReferences(references: SearchHit[]): SearchHit[] {
  const seen = new Set<string>();
  return references.filter((hit) => {
    const key = `${hit.documentId}:${hit.segmentId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numbersAreGrounded(answer: string, evidence: string): boolean {
  const sourceNumbers = new Set(evidence.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []);
  const answerNumbers = answer.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? [];
  return answerNumbers.every((value) => sourceNumbers.has(value));
}

function looksTurkish(value: string): boolean {
  return /[çğıöşüÇĞİÖŞÜ]|\b(ve|bir|bu|için|mı|mi|mu|mü|nedir|nasıl|destek|var mı|ne dedi)\b/i.test(value);
}

export async function testOpenAIKey(apiKey: string, model: string): Promise<void> {
  if (!apiKey.trim()) throw new Error('Enter an API key first.');
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model,
      input: 'Reply with exactly: OK',
      max_output_tokens: 16,
    }),
  });
  if (!response.ok) throw await apiError(response);
  const payload = await response.json();
  const text = readResponseText(payload).trim();
  if (!text) throw new Error('The AI provider returned an empty response.');
}

export async function enhanceMeetingReportWithAI(
  report: MeetingReport,
  apiKey: string,
  settings: AIEnhancementSettings,
  language: SummaryLanguage,
  onProgress?: (progress: AIEnhancementProgress) => void,
): Promise<MeetingReport> {
  if (!apiKey.trim()) throw new Error('AI Enhanced is enabled, but no API key is configured.');

  const next = structuredClone(report);
  const slots = collectTextSlots(next);
  const batches = makeBatches(slots, MAX_CHARS_PER_BATCH);
  let accepted = 0;
  let rejected = 0;

  for (let index = 0; index < batches.length; index += 1) {
    const batch = batches[index];
    const rewrites = await rewriteBatch(batch, apiKey, settings, language);
    const byId = new Map(rewrites.map((item) => [item.id, item.text]));

    for (const slot of batch) {
      const candidate = byId.get(slot.id);
      if (!candidate || !isSafeRewrite(slot.text, candidate, language)) {
        rejected += 1;
        continue;
      }
      slot.set(candidate.trim());
      accepted += 1;
    }

    onProgress?.({ completed: index + 1, total: batches.length });
  }

  next.language = language;
  next.generatedAt = new Date().toISOString();
  next.ai = {
    provider: settings.provider,
    model: settings.model,
    enhancedAt: new Date().toISOString(),
    itemsProcessed: slots.length,
    itemsAccepted: accepted,
    itemsRejected: rejected,
    rawTranscriptShared: false,
  } satisfies AIEnhancementMeta;
  next.wordCount = countReportWords(next);
  return next;
}

function collectTextSlots(report: MeetingReport): TextSlot[] {
  const slots: TextSlot[] = [];
  const add = (id: string, getter: () => string, setter: (value: string) => void) => {
    const text = getter().trim();
    if (text) slots.push({ id, text, set: setter });
  };

  report.sections.forEach((section, sectionIndex) => {
    section.paragraphs.forEach((item, itemIndex) => add(
      `section.${sectionIndex}.paragraph.${itemIndex}`,
      () => item.text,
      (value) => { item.text = value; },
    ));
    section.bullets.forEach((item, itemIndex) => add(
      `section.${sectionIndex}.bullet.${itemIndex}`,
      () => item.text,
      (value) => { item.text = value; },
    ));
    (section.subsections ?? []).forEach((subsection, subsectionIndex) => {
      subsection.paragraphs.forEach((item, itemIndex) => add(
        `section.${sectionIndex}.subsection.${subsectionIndex}.paragraph.${itemIndex}`,
        () => item.text,
        (value) => { item.text = value; },
      ));
      subsection.bullets.forEach((item, itemIndex) => add(
        `section.${sectionIndex}.subsection.${subsectionIndex}.bullet.${itemIndex}`,
        () => item.text,
        (value) => { item.text = value; },
      ));
    });
  });

  report.requirementMatrix.forEach((row, index) => {
    add(`matrix.${index}.requirement`, () => row.requirement, (value) => { row.requirement = value; });
    if (row.currentState) add(`matrix.${index}.currentState`, () => row.currentState ?? '', (value) => { row.currentState = value; });
    if (row.position) add(`matrix.${index}.position`, () => row.position ?? '', (value) => { row.position = value; });
    if (row.nextAction) add(`matrix.${index}.nextAction`, () => row.nextAction ?? '', (value) => { row.nextAction = value; });
  });

  report.structuredOpenItems.forEach((item, index) => {
    add(`openItem.${index}`, () => item.text, (value) => { item.text = value; });
  });

  report.keyPoints.forEach((item, index) => add(`keyPoint.${index}`, () => item.text, (value) => { item.text = value; }));
  report.decisions.forEach((item, index) => add(`decision.${index}`, () => item.text, (value) => { item.text = value; }));
  report.openItems.forEach((item, index) => add(`open.${index}`, () => item.text, (value) => { item.text = value; }));

  return slots;
}

function makeBatches(slots: TextSlot[], limit: number): TextSlot[][] {
  const batches: TextSlot[][] = [];
  let current: TextSlot[] = [];
  let size = 0;
  for (const slot of slots) {
    const contribution = slot.text.length + slot.id.length + 80;
    if (current.length && size + contribution > limit) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(slot);
    size += contribution;
  }
  if (current.length) batches.push(current);
  return batches;
}

async function rewriteBatch(
  slots: TextSlot[],
  apiKey: string,
  settings: AIEnhancementSettings,
  language: SummaryLanguage,
): Promise<RewriteResult[]> {
  const target = language === 'tr'
    ? 'professional Turkish'
    : language === 'en'
      ? 'professional English'
      : 'the original language of each item';

  const input = {
    task: 'enterprise_report_refinement',
    target_language: target,
    rules: [
      'Rewrite only for clarity, professional tone and natural enterprise consulting language.',
      'Do not add, infer, remove or strengthen factual claims.',
      'A recommendation must never become a decision or agreement.',
      'An open question must remain open.',
      'Preserve uncertainty, attribution, product names, technical terms, numbers, dates and status language.',
      'Do not introduce speaker names, owners, organizations or implementation details that are not already present.',
      'Do not mention transcript filenames, source files, prompts, AI, or the rewriting process.',
      'Do not use ellipses or incomplete sentences.',
      'Keep API/infrastructure terms such as consumer, upstream, route, OIDC, OAuth, ACL, CIDR, Kong, Konnect, Data Plane and Control Plane natural in context; do not translate them literally when that would sound wrong.',
      'Return JSON only in the form {"items":[{"id":"...","text":"..."}]}. Every input id must appear exactly once.',
    ],
    items: slots.map((slot) => ({ id: slot.id, text: slot.text })),
  };

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: authHeaders(apiKey),
    body: JSON.stringify({
      model: settings.model,
      input: JSON.stringify(input),
      max_output_tokens: MAX_OUTPUT_TOKENS,
    }),
  });
  if (!response.ok) throw await apiError(response);
  const payload = await response.json();
  const outputText = readResponseText(payload);
  const parsed = parseJsonObject(outputText) as { items?: unknown };
  if (!Array.isArray(parsed.items)) throw new Error('The AI provider returned an unexpected response format.');

  return parsed.items
    .filter((item): item is { id: string; text: string } => Boolean(
      item && typeof item === 'object'
      && typeof (item as { id?: unknown }).id === 'string'
      && typeof (item as { text?: unknown }).text === 'string',
    ))
    .map((item) => ({ id: item.id, text: item.text }));
}

function isSafeRewrite(original: string, candidate: string, language: SummaryLanguage): boolean {
  const next = candidate.replace(/\s+/g, ' ').trim();
  const source = original.replace(/\s+/g, ' ').trim();
  if (!next || /(?:\.\.\.|…)\s*$/.test(next)) return false;
  if (next.length > Math.max(420, source.length * 2.6)) return false;
  if (next.length < Math.min(24, source.length * 0.28)) return false;

  const sourceNumbers = new Set(source.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []);
  const candidateNumbers = new Set(next.match(/\b\d+(?:[.,]\d+)?%?\b/g) ?? []);
  for (const value of candidateNumbers) if (!sourceNumbers.has(value)) return false;

  if (!containsAny(source, DECISION_WORDS) && containsAny(next, language === 'tr' ? DECISION_WORDS_TR : DECISION_WORDS)) return false;
  if (!containsAny(source, CONFIRMATION_WORDS) && containsAny(next, language === 'tr' ? CONFIRMATION_WORDS_TR : CONFIRMATION_WORDS)) return false;
  return true;
}

const DECISION_WORDS = /\b(agreed|decided|approved|agreement|decision)\b/i;
const DECISION_WORDS_TR = /\b(kararlaştırıldı|karar verildi|mutabık|onaylandı|karar)\b/i;
const CONFIRMATION_WORDS = /\b(confirmed|definitively|finalized)\b/i;
const CONFIRMATION_WORDS_TR = /\b(teyit edildi|kesinleşti|nihai hale getirildi)\b/i;

function containsAny(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}

function authHeaders(apiKey: string): HeadersInit {
  return {
    Authorization: `Bearer ${apiKey.trim()}`,
    'Content-Type': 'application/json',
  };
}

async function apiError(response: Response): Promise<Error> {
  let detail = '';
  try {
    const payload = await response.json() as { error?: { message?: string } };
    detail = payload.error?.message ?? '';
  } catch {
    detail = await response.text().catch(() => '');
  }
  const suffix = detail ? ` ${detail}` : '';
  if (response.status === 401) return new Error(`API key was rejected.${suffix}`);
  if (response.status === 429) return new Error(`AI provider rate or quota limit reached.${suffix}`);
  return new Error(`AI request failed (${response.status}).${suffix}`);
}

function readResponseText(payload: any): string {
  if (typeof payload?.output_text === 'string') return payload.output_text;
  const texts: string[] = [];
  for (const item of payload?.output ?? []) {
    for (const content of item?.content ?? []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') texts.push(content.text);
    }
  }
  return texts.join('\n').trim();
}

function parseJsonObject(value: string): unknown {
  const trimmed = value.trim();
  const withoutFence = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  try {
    return JSON.parse(withoutFence);
  } catch {
    const start = withoutFence.indexOf('{');
    const end = withoutFence.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(withoutFence.slice(start, end + 1));
    throw new Error('The AI provider returned invalid JSON.');
  }
}

function countReportWords(report: MeetingReport): number {
  const values: string[] = [];
  for (const section of report.sections) {
    values.push(section.title);
    values.push(...section.paragraphs.map((item) => item.text));
    values.push(...section.bullets.map((item) => item.text));
    for (const subsection of section.subsections ?? []) {
      values.push(subsection.title);
      values.push(...subsection.paragraphs.map((item) => item.text));
      values.push(...subsection.bullets.map((item) => item.text));
    }
  }
  values.push(...report.requirementMatrix.flatMap((item) => [item.requirement, item.currentState ?? '', item.position ?? '', item.nextAction ?? '']));
  values.push(...report.structuredOpenItems.map((item) => item.text));
  return values.join(' ').trim().split(/\s+/).filter(Boolean).length;
}
