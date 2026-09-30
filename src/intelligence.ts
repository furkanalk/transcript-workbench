import type {
  AnswerResult,
  DetailedSummaryResult,
  NarrativeSummaryParagraph,
  NarrativeSummaryResult,
  Project,
  SearchHit,
  SummaryPoint,
  SummaryResult,
  SummaryMode,
  TranscriptDocument,
  TranscriptSegment,
} from './types';

const STOP_WORDS = new Set([
  'a','about','after','again','all','also','am','an','and','any','are','as','at','be','because','been','before','being','between','both','but','by','can','could','did','do','does','doing','down','during','each','for','from','further','had','has','have','having','he','her','here','hers','him','his','how','i','if','in','into','is','it','its','itself','just','me','more','most','my','no','nor','not','of','off','on','once','only','or','other','our','out','over','own','same','she','should','so','some','such','than','that','the','their','them','then','there','these','they','this','those','through','to','too','under','until','up','very','was','we','were','what','when','where','which','while','who','why','will','with','would','you','your',
  'acaba','ama','artık','aslında','az','bana','bazı','belki','ben','bence','beni','benim','beri','beş','bir','biraz','birçok','biri','birkaç','biz','bize','bizi','bizim','bu','buna','bunda','bundan','bunlar','bunları','bunun','da','daha','de','değil','diye','en','gibi','hem','hep','hepsi','her','hiç','için','ile','ise','işte','kadar','ki','kim','mı','mi','mu','mü','nasıl','ne','neden','nerede','niye','o','olan','olarak','oldu','oluyor','olur','ona','onlar','onu','onun','sana','sen','seni','senin','sonra','şey','şu','ve','veya','ya','yani','yok','var','çok','bizde','burada','bunu','böyle','şöyle'
]);

const NEGATIVE_CUES = [
  'not supported','not support','unsupported','cannot','can\'t','does not','doesn\'t','not available','impossible',
  'desteklenmiyor','desteklemiyor','mümkün değil','yapılamaz','yapamıyor','yok','bulunmuyor','mevcut değil'
];

const POSITIVE_CUES = [
  'supported','support','available','can be','we can','possible','provides','allows','enabled',
  'destekliyor','destekleniyor','mümkün','yapılabilir','var','mevcut','sağlıyor','izin veriyor'
];

const FOLLOW_UP_CUES = /(follow[- ]?up|action item|outstanding|open item|pending|need to confirm|need to check|will check|we will check|come back to you|get back to you|provide you with the answer|need to clarify|roadmap|timeline|availability date|not available yet|not supported yet|to be confirmed|tbd|aksiyon|teyit|netleştir|kontrol edip|geri döne|açık konu)/i;

const DECISION_CUES = /(we agreed|agreed that|we decided|decision is|confirmed that|we will use|we are going to|the approach (?:is|will be)|accepted|approved|will proceed|going forward|karar verdik|kararlaştır|mutabık|teyit edildi|kullanacağız|ilerleyeceğiz)/i;
const DEMONSTRATION_CUES = /(demo|demonstrat|showed|shown|walked through|walkthrough|tested|test(ed|ing)?|configured|implemented|created|deployed|reviewed|presented|göster|demo|test ett|konfigüre|uygula|devreye al)/i;

export function searchProject(project: Project, question: string, limit = 8): SearchHit[] {
  const documents = searchableDocuments(project);
  const corpus = flattenCorpus(documents);
  const queryTokens = unique(tokenize(question));
  if (!queryTokens.length || !corpus.length) return [];

  const documentFrequency = new Map<string, number>();
  for (const item of corpus) {
    const seen = new Set(item.tokens);
    for (const token of seen) documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
  }

  const normalizedQuestion = normalizeText(question);
  const scored = corpus.map((item) => {
    let score = 0;
    let matched = 0;

    for (const queryToken of queryTokens) {
      const match = bestTokenMatch(queryToken, item.tokens);
      if (!match) continue;
      matched += 1;
      const df = approximateDocumentFrequency(queryToken, documentFrequency);
      const idf = Math.log(1 + (corpus.length - df + 0.5) / (df + 0.5));
      const tf = item.tokens.reduce((count, token) => count + (token === match.token ? 1 : 0), 0);
      const saturation = (tf * 2.2) / (tf + 1.2);
      score += idf * saturation * match.similarity;
    }

    const coverage = matched / queryTokens.length;
    score *= 0.45 + coverage * 1.25;

    const normalizedSegment = normalizeText(item.segment.text);
    if (normalizedQuestion.length > 7 && normalizedSegment.includes(normalizedQuestion)) score += 8;
    if (coverage >= 0.75) score += 2.2;
    else if (coverage >= 0.5) score += 0.9;

    score *= 0.85 + item.segment.confidence * 0.15;
    return { item, score, coverage };
  });

  const ranked = scored
    .filter((entry) => entry.score > 0.12 && entry.coverage > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(limit * 3, limit));

  const diversified: typeof ranked = [];
  const perDocument = new Map<string, number>();
  for (const entry of ranked) {
    const current = perDocument.get(entry.item.document.id) ?? 0;
    if (current >= 3) continue;
    diversified.push(entry);
    perDocument.set(entry.item.document.id, current + 1);
    if (diversified.length >= limit) break;
  }

  return diversified.map(({ item, score }) => toHit(item.document, item.segment, item.index, score));
}

export function answerQuestion(project: Project, question: string): AnswerResult {
  const references = searchProject(project, question, 6);
  if (!references.length) {
    return {
      answer: 'Transcriptlerde bu soruyu doğrulayacak yeterli bir ifade bulamadım.',
      confidence: 'not-found',
      references: [],
    };
  }

  const top = references[0];
  const topText = normalizeText(top.context);
  const secondScore = references[1]?.score ?? 0;
  const strong = top.score >= 4.2 || (top.score >= 2.5 && secondScore >= 1.8);
  const moderate = top.score >= 1.35;
  const isExistenceQuestion = /(var\s*m[ıiuü]|support|supported|available|is there|does .* support|can .*|feature|özellik|mümkün mü|mevcut mu)/i.test(question);

  let answer: string;
  if (isExistenceQuestion) {
    const negative = NEGATIVE_CUES.find((cue) => topText.includes(normalizeText(cue)));
    const positive = POSITIVE_CUES.find((cue) => topText.includes(normalizeText(cue)));

    if (negative && !positive) {
      answer = `Transcriptte bunun desteklenmediğine veya mevcut olmadığına işaret eden bir ifade var: “${compact(top.context, 300)}”`;
    } else if (positive && !negative) {
      answer = `Transcriptte bu özelliğin veya yeteneğin mevcut/destekleniyor olduğuna işaret eden bir ifade var: “${compact(top.context, 300)}”`;
    } else {
      answer = `Transcriptte bu konuyla doğrudan ilişkili bilgi bulundu. En güçlü eşleşme: “${compact(top.context, 300)}”`;
    }
  } else {
    answer = `Transcriptteki en ilgili açıklama şu: “${compact(top.context, 340)}”`;
  }

  if (!strong && !moderate) {
    answer += ' Eşleşme zayıf olduğu için bunu kesin bir doğrulama olarak değerlendirmemek gerekir.';
  }

  return {
    answer,
    confidence: strong ? 'strong' : moderate ? 'moderate' : 'weak',
    references,
  };
}

export function generateSummary(project: Project, maxPoints = 10, selectedDocumentIds: string[] = []): SummaryResult {
  const documents = resolveSummaryDocuments(project, selectedDocumentIds);
  const corpus = flattenCorpus(documents);
  return {
    generatedAt: new Date().toISOString(),
    sourceCount: documents.length,
    segmentCount: corpus.length,
    points: selectSummaryPoints(documents, maxPoints, true),
  };
}

export function generateDetailedSummary(project: Project, pointsPerSource = 7, selectedDocumentIds: string[] = []): DetailedSummaryResult {
  const documents = resolveSummaryDocuments(project, selectedDocumentIds);
  const corpus = flattenCorpus(documents);
  const sections = documents.map((document) => ({
    documentId: document.id,
    documentName: document.name,
    segmentCount: document.transcript.segments.length,
    points: selectSummaryPoints([document], pointsPerSource, false),
  }));

  const followUps = corpus
    .filter((item) => FOLLOW_UP_CUES.test(item.segment.text))
    .map((item) => ({
      text: compact(item.segment.text, 430),
      score: 1 + item.segment.confidence,
      reference: toHit(item.document, item.segment, item.index, 1 + item.segment.confidence),
    }))
    .filter((point, index, all) => all.findIndex((other) => similarity(normalizeText(other.text), normalizeText(point.text)) > 0.75) === index)
    .slice(0, 18);

  return {
    generatedAt: new Date().toISOString(),
    sourceCount: documents.length,
    segmentCount: corpus.length,
    sections,
    followUps,
  };
}

export function generateNarrativeSummary(
  project: Project,
  mode: SummaryMode,
  selectedDocumentIds: string[] = [],
): NarrativeSummaryResult {
  const documents = resolveSummaryDocuments(project, selectedDocumentIds);
  const corpus = flattenCorpus(documents);
  const paragraphLimit = mode === 'general' ? 4 : 10;
  const points = selectSummaryPoints(documents, mode === 'general' ? 12 : 24, true);
  const decisionItems = selectCueItems(corpus, DECISION_CUES, mode === 'general' ? 3 : 7);
  const demonstrationItems = selectCueItems(corpus, DEMONSTRATION_CUES, mode === 'general' ? 4 : 8);
  const followUpItems = selectCueItems(corpus, FOLLOW_UP_CUES, mode === 'general' ? 4 : 8);

  const paragraphs = mode === 'general'
    ? buildGeneralNarrative(points, demonstrationItems, decisionItems, followUpItems)
    : buildDetailedNarrative(documents, points, demonstrationItems, decisionItems, followUpItems);

  return {
    generatedAt: new Date().toISOString(),
    mode,
    sourceCount: documents.length,
    segmentCount: corpus.length,
    documentIds: documents.map((document) => document.id),
    paragraphs: paragraphs.slice(0, paragraphLimit),
  };
}

function resolveSummaryDocuments(project: Project, selectedDocumentIds: string[]): TranscriptDocument[] {
  const sourceDocuments = searchableDocuments(project);
  if (!selectedDocumentIds.length) return sourceDocuments;
  const selected = new Set(selectedDocumentIds);
  const scoped = sourceDocuments.filter((document) => selected.has(document.id));
  return scoped.length ? scoped : sourceDocuments;
}

function selectCueItems(corpus: CorpusItem[], cue: RegExp, limit: number): SummaryPoint[] {
  const candidates = corpus
    .filter((item) => cue.test(item.segment.text))
    .map((item) => ({
      text: compact(contextFor(item.document, item.index), 520),
      score: 1 + item.segment.confidence,
      reference: toHit(item.document, item.segment, item.index, 1 + item.segment.confidence),
    }))
    .filter((point) => normalizeText(point.text).length >= 45)
    .filter((point, index, all) => all.findIndex((other) => similarity(normalizeText(other.text), normalizeText(point.text)) > 0.72) === index);

  return candidates.slice(0, limit);
}

function buildGeneralNarrative(
  points: SummaryPoint[],
  demonstrations: SummaryPoint[],
  decisions: SummaryPoint[],
  followUps: SummaryPoint[],
): NarrativeSummaryParagraph[] {
  const paragraphs: NarrativeSummaryParagraph[] = [];
  const overviewPoints = points.slice(0, 5);
  if (overviewPoints.length) {
    paragraphs.push({
      kind: 'overview',
      text: composeNarrativeParagraph(
        'The selected sessions focused on',
        overviewPoints,
        'The discussion covered the main requirements, capabilities and implementation considerations reflected in these topics.',
      ),
      references: overviewPoints.map((point) => point.reference),
    });
  }

  const activityPoints = uniqueSummaryPoints([...demonstrations, ...points.slice(5, 9)], 5);
  if (activityPoints.length) {
    paragraphs.push({
      kind: 'discussion',
      text: composeNarrativeParagraph(
        'During the sessions, the participants reviewed and worked through',
        activityPoints,
        'These exchanges captured what was demonstrated, tested, configured or evaluated during the selected transcript scope.',
      ),
      references: activityPoints.map((point) => point.reference),
    });
  }

  if (decisions.length) {
    const selected = uniqueSummaryPoints(decisions, 4);
    paragraphs.push({
      kind: 'decision',
      text: composeNarrativeParagraph(
        'The discussion also recorded agreed directions or confirmed approaches around',
        selected,
        'These statements represent the clearest decision-like language found in the transcripts and should still be read in their original context before being treated as formal approval.',
      ),
      references: selected.map((point) => point.reference),
    });
  }

  if (followUps.length) {
    const selected = uniqueSummaryPoints(followUps, 5);
    paragraphs.push({
      kind: 'follow-up',
      text: composeNarrativeParagraph(
        'A number of items remained open or required additional follow-up, including',
        selected,
        'These were identified from explicit pending, roadmap, confirmation or return-with-an-answer language in the meeting transcript.',
      ),
      references: selected.map((point) => point.reference),
    });
  }

  return paragraphs;
}

function buildDetailedNarrative(
  documents: TranscriptDocument[],
  points: SummaryPoint[],
  demonstrations: SummaryPoint[],
  decisions: SummaryPoint[],
  followUps: SummaryPoint[],
): NarrativeSummaryParagraph[] {
  const paragraphs: NarrativeSummaryParagraph[] = [];
  const overview = points.slice(0, 5);
  if (overview.length) {
    paragraphs.push({
      kind: 'overview',
      text: composeNarrativeParagraph(
        'Across the selected transcript set, the sessions concentrated on',
        overview,
        'The material reflects both requirement clarification and hands-on discussion of how the relevant capabilities would be implemented or operated.',
      ),
      references: overview.map((point) => point.reference),
    });
  }

  for (const document of documents) {
    const documentPoints = selectSummaryPoints([document], 5, false);
    if (!documentPoints.length) continue;
    paragraphs.push({
      kind: 'discussion',
      text: composeNarrativeParagraph(
        `In ${document.name}, the discussion covered`,
        documentPoints,
        'This section captures the main technical subjects and explanations from that part of the meeting without reproducing the conversational back-and-forth.',
      ),
      references: documentPoints.map((point) => point.reference),
    });
  }

  const activity = uniqueSummaryPoints(demonstrations, 7);
  if (activity.length) {
    paragraphs.push({
      kind: 'discussion',
      text: composeNarrativeParagraph(
        'The practical walkthroughs and demonstrations included',
        activity,
        'These items represent the strongest evidence of capabilities that were shown, tested, configured or reviewed during the sessions.',
      ),
      references: activity.map((point) => point.reference),
    });
  }

  const confirmed = uniqueSummaryPoints(decisions, 7);
  if (confirmed.length) {
    paragraphs.push({
      kind: 'decision',
      text: composeNarrativeParagraph(
        'Decision-like or explicitly confirmed statements were found around',
        confirmed,
        'They indicate the directions agreed or confirmed in the discussion, although the source references should be checked before treating them as final project governance decisions.',
      ),
      references: confirmed.map((point) => point.reference),
    });
  }

  const open = uniqueSummaryPoints(followUps, 8);
  if (open.length) {
    paragraphs.push({
      kind: 'follow-up',
      text: composeNarrativeParagraph(
        'The main unresolved areas and next-step discussions concerned',
        open,
        'These items were detected from explicit follow-up, confirmation, pending or roadmap language and therefore represent the strongest candidates for outstanding actions.',
      ),
      references: open.map((point) => point.reference),
    });
  }

  return paragraphs;
}

function composeNarrativeParagraph(prefix: string, points: SummaryPoint[], closing: string): string {
  const statements = points
    .map((point) => narrativeClause(point.text))
    .filter(Boolean)
    .slice(0, 7);

  if (!statements.length) return closing;
  const joined = joinNaturalList(statements);
  return `${prefix} ${joined}. ${closing}`.replace(/\s+/g, ' ').trim();
}

function narrativeClause(value: string): string {
  let text = value.replace(/\s+/g, ' ').trim();
  text = text
    .replace(/^(okay|ok|yeah|yes|right|so|well|basically|actually|i think|we think|you know|by the way)[,.:;!?\s-]+/i, '')
    .replace(/^(can you|could you|would you|do you|did you|are you|is it|what about)\s+/i, '')
    .replace(/[?!.]+$/g, '')
    .trim();
  if (!text) return '';
  if (text.length > 210) text = `${text.slice(0, 207).trimEnd()}…`;
  return text.charAt(0).toLocaleLowerCase('en-US') + text.slice(1);
}

function joinNaturalList(values: string[]): string {
  if (values.length === 1) return values[0];
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join('; ')}; and ${values[values.length - 1]}`;
}

function uniqueSummaryPoints(points: SummaryPoint[], limit: number): SummaryPoint[] {
  const chosen: SummaryPoint[] = [];
  for (const point of points) {
    const normalized = normalizeText(point.text);
    if (!normalized || chosen.some((other) => similarity(normalized, normalizeText(other.text)) > 0.72)) continue;
    chosen.push(point);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

function selectSummaryPoints(documents: TranscriptDocument[], maxPoints: number, diversify: boolean): SummaryPoint[] {
  const corpus = flattenCorpus(documents);
  if (!corpus.length) return [];

  const termFrequency = new Map<string, number>();
  for (const item of corpus) {
    for (const token of unique(item.tokens)) {
      termFrequency.set(token, (termFrequency.get(token) ?? 0) + 1);
    }
  }

  const scored = corpus.map((item) => {
    const meaningfulTokens = item.tokens.filter((token) => token.length > 2);
    const informativeness = meaningfulTokens.reduce((sum, token) => {
      const df = termFrequency.get(token) ?? 1;
      return sum + Math.log(1 + corpus.length / df);
    }, 0) / Math.max(1, meaningfulTokens.length);

    const lengthBonus = Math.min(1.5, item.segment.text.trim().length / 180);
    const specificity = unique(meaningfulTokens).length / Math.max(1, meaningfulTokens.length);
    const followUpBonus = FOLLOW_UP_CUES.test(item.segment.text) ? 0.35 : 0;
    const score = (informativeness + followUpBonus) * (0.65 + lengthBonus * 0.35) * (0.75 + specificity * 0.25) * (0.8 + item.segment.confidence * 0.2);
    return { item, score };
  }).sort((a, b) => b.score - a.score);

  const chosen: Array<{ item: CorpusItem; score: number }> = [];
  const perDocument = new Map<string, number>();
  for (const candidate of scored) {
    const text = normalizeText(candidate.item.segment.text);
    if (text.length < 45) continue;
    if (chosen.some((entry) => similarity(text, normalizeText(entry.item.segment.text)) > 0.72)) continue;

    if (diversify) {
      const count = perDocument.get(candidate.item.document.id) ?? 0;
      const softCap = Math.max(2, Math.ceil(maxPoints / Math.max(1, documents.length)) + 1);
      if (count >= softCap) continue;
      perDocument.set(candidate.item.document.id, count + 1);
    }

    chosen.push(candidate);
    if (chosen.length >= maxPoints) break;
  }

  return chosen
    .sort((a, b) => {
      if (a.item.document.createdAt !== b.item.document.createdAt) return a.item.document.createdAt.localeCompare(b.item.document.createdAt);
      return a.item.index - b.item.index;
    })
    .map(({ item, score }) => ({
      text: compact(item.segment.text, 420),
      score,
      reference: toHit(item.document, item.segment, item.index, score),
    }));
}

function searchableDocuments(project: Project): TranscriptDocument[] {
  const sourceDocuments = project.documents.filter((document) => document.kind === 'source');
  return sourceDocuments.length ? sourceDocuments : project.documents;
}

interface CorpusItem {
  document: TranscriptDocument;
  segment: TranscriptSegment;
  index: number;
  tokens: string[];
}

function flattenCorpus(documents: TranscriptDocument[]): CorpusItem[] {
  return documents.flatMap((document) => document.transcript.segments.map((segment, index) => ({
    document,
    segment,
    index,
    tokens: tokenize(segment.text),
  })));
}

function toHit(document: TranscriptDocument, segment: TranscriptSegment, index: number, score: number): SearchHit {
  const source = segment._source;
  const sourceDocument = source?.document_id ?? document.id;
  const sourceName = source?.document_name ?? document.name;
  const sourceSegment = source?.segment_id ?? segment.id;
  const sourceSequence = source?.sequence_id ?? segment.sequence_id;
  const sourceTime = source?.display_time ?? segment.display_time;
  const context = contextFor(document, index);

  return {
    documentId: sourceDocument,
    documentName: sourceName,
    segmentId: sourceSegment,
    sequenceId: sourceSequence,
    displayTime: sourceTime,
    confidence: segment.confidence,
    score,
    text: segment.text,
    context,
  };
}

function contextFor(document: TranscriptDocument, index: number): string {
  const segments = document.transcript.segments;
  const before = segments[index - 1]?.text?.trim() ?? '';
  const current = segments[index]?.text?.trim() ?? '';
  const after = segments[index + 1]?.text?.trim() ?? '';
  return [before, current, after].filter(Boolean).join(' ');
}

function tokenize(value: string): string[] {
  return normalizeText(value)
    .split(/\s+/)
    .map(cleanToken)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function normalizeText(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9+#./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanToken(token: string): string {
  const stripped = token.replace(/^[^a-z0-9]+|[^a-z0-9+#./-]+$/g, '');
  if (stripped.length <= 4) return stripped;
  return stripped
    .replace(/(lari|leri|lar|ler)$/i, '')
    .replace(/(ing|ed)$/i, '');
}

function bestTokenMatch(queryToken: string, tokens: string[]): { token: string; similarity: number } | null {
  if (tokens.includes(queryToken)) return { token: queryToken, similarity: 1 };
  let best: { token: string; similarity: number } | null = null;
  for (const token of tokens) {
    if (queryToken.length >= 4 && (token.includes(queryToken) || queryToken.includes(token))) {
      const score = Math.min(token.length, queryToken.length) / Math.max(token.length, queryToken.length);
      if (!best || score > best.similarity) best = { token, similarity: Math.max(0.78, score) };
      continue;
    }
    if (queryToken.length >= 5 && token.length >= 5) {
      const distance = levenshtein(queryToken, token);
      const allowed = Math.max(queryToken.length, token.length) >= 8 ? 2 : 1;
      if (distance <= allowed) {
        const score = 1 - distance / Math.max(queryToken.length, token.length);
        if (!best || score > best.similarity) best = { token, similarity: score * 0.8 };
      }
    }
  }
  return best;
}

function approximateDocumentFrequency(queryToken: string, documentFrequency: Map<string, number>): number {
  const exact = documentFrequency.get(queryToken);
  if (exact !== undefined) return exact;
  let total = 0;
  for (const [token, count] of documentFrequency) {
    if (token.includes(queryToken) || queryToken.includes(token)) total += count;
  }
  return Math.max(1, total);
}

function levenshtein(a: string, b: string): number {
  const previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        current[j - 1] + 1,
        previous[j] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[b.length];
}

function similarity(a: string, b: string): number {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function compact(value: string, limit: number): string {
  const cleaned = value.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= limit) return cleaned;
  return `${cleaned.slice(0, limit - 1).trimEnd()}…`;
}
