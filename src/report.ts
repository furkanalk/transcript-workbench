import { generateDetailedSummary, generateSummary } from './intelligence';
import type {
  MeetingReport,
  Project,
  ReportBullet,
  ReportParagraph,
  ReportReference,
  ReportSection,
  ReportSectionKind,
  SearchHit,
  SummaryMode,
  SummaryPoint,
} from './types';

interface ModeConfig {
  generalPoints: number;
  pointsPerSource: number;
  executiveParagraphs: number;
  maxTopics: number;
  paragraphsPerTopic: number;
  pointsPerParagraph: number;
  maxKeyPoints: number;
  maxDecisions: number;
  maxRisks: number;
  maxOpenItems: number;
}

const MODE_CONFIG: Record<SummaryMode, ModeConfig> = {
  general: {
    generalPoints: 12,
    pointsPerSource: 3,
    executiveParagraphs: 1,
    maxTopics: 2,
    paragraphsPerTopic: 1,
    pointsPerParagraph: 3,
    maxKeyPoints: 4,
    maxDecisions: 3,
    maxRisks: 3,
    maxOpenItems: 4,
  },
  detailed: {
    generalPoints: 24,
    pointsPerSource: 5,
    executiveParagraphs: 3,
    maxTopics: 5,
    paragraphsPerTopic: 1,
    pointsPerParagraph: 3,
    maxKeyPoints: 8,
    maxDecisions: 5,
    maxRisks: 5,
    maxOpenItems: 7,
  },
  report: {
    generalPoints: 42,
    pointsPerSource: 8,
    executiveParagraphs: 4,
    maxTopics: 8,
    paragraphsPerTopic: 1,
    pointsPerParagraph: 3,
    maxKeyPoints: 12,
    maxDecisions: 9,
    maxRisks: 8,
    maxOpenItems: 12,
  },
};

const DECISION_CUES = /(we agreed|agreed that|we decided|decision is|confirmed that|we will use|we are going to|the approach (?:is|will be)|accepted|approved|will proceed|going forward|karar verdik|kararlaştır|mutabık|teyit edildi|kullanacağız|ilerleyeceğiz|we recommend|recommended approach|preferred approach)/i;
const RISK_CUES = /(risk|latency|single point of failure|failure|outage|dependency|concern|security|compliance|data residency|performance|bottleneck|anti-pattern|antipattern|uncontrolled|availability|constraint|limitation|not available|not supported|riskli|gecikme|bağımlılık|güvenlik|kısıt|sınırlama)/i;
const DEMO_CUES = /(demo|demonstrat|showed|shown|walked through|walkthrough|tested|configured|implemented|created|deployed|reviewed|presented|göster|test ett|konfigüre|uygula|devreye al)/i;

interface TopicRule {
  id: string;
  title: string;
  matcher: RegExp;
}

const TOPIC_RULES: TopicRule[] = [
  { id: 'developer-portal', title: 'Developer Portal & Developer Experience', matcher: /(developer portal|api catalog|catalogue|onboarding|subscription|application registration|developer experience|organization admin|invite users|documentation|swagger|openapi)/i },
  { id: 'auth', title: 'Authentication, Authorization & Credential Flows', matcher: /(oidc|oauth|authentication|authorization|keycloak|vault|beyondtrust|credential|token|basic auth|client credential)/i },
  { id: 'acl-ip', title: 'ACL, CIDR & IP Restriction', matcher: /(acl|access control|ip restriction|ip whitelist|whitelist|cidr|database-based acl|database based acl|dynamic ip)/i },
  { id: 'event-gateway', title: 'Event Gateway & Async APIs', matcher: /(event gateway|async api|asyncapi|kafka|topic|virtual cluster|event data|masking|filtering|client identity|amqp|mqtt)/i },
  { id: 'konnect', title: 'Konnect Architecture, Security & Data Residency', matcher: /(konnect|control plane|data plane|cloud data|data sharing|kvkk|data residency|information security|hybrid)/i },
  { id: 'rate-limit', title: 'Rate Limiting & Traffic Control', matcher: /(rate limit|rate limiting|throttl|rps|request per second|consumer limit|redis)/i },
  { id: 'caching', title: 'Caching & In-Memory Data', matcher: /(cache|caching|in-memory|in memory|redis|hazelcast|ram cache|data store)/i },
  { id: 'cicd', title: 'CI/CD, Automation & Configuration Management', matcher: /(ci\/cd|cicd|pipeline|admin api|automation|gitops|deck|declarative|configuration|promotion|maker|checker)/i },
  { id: 'observability', title: 'Observability, Logging & Operations', matcher: /(observability|logging|logs|splunk|grafana|siem|apm|monitoring|debugger|metrics|telemetry)/i },
  { id: 'performance', title: 'Performance, Testing & Scalability', matcher: /(performance|latency|load test|throughput|rps|scal|high availability|ha |benchmark|payload|vm|cpu)/i },
  { id: 'transformation', title: 'API Transformation & Custom Extensions', matcher: /(data kit|custom plugin|soap|rest|transform|transformation|plugin|custom extension)/i },
  { id: 'network-security', title: 'Network & Transport Security', matcher: /(tls|mtls|waf|load balancer|x-forwarded-for|proxy protocol|certificate|firewall|network)/i },
];

interface DraftParagraph {
  text: string;
  references: SearchHit[];
}

interface DraftBullet {
  text: string;
  references: SearchHit[];
}

interface DraftSection {
  id: string;
  title: string;
  kind: ReportSectionKind;
  paragraphs: DraftParagraph[];
  bullets: DraftBullet[];
}

export function generateMeetingReport(
  project: Project,
  mode: SummaryMode,
  selectedDocumentIds: string[] = [],
): MeetingReport {
  const config = MODE_CONFIG[mode];
  const general = generateSummary(project, config.generalPoints, selectedDocumentIds);
  const detailed = generateDetailedSummary(project, config.pointsPerSource, selectedDocumentIds);
  const selectedDocumentIdsResolved = resolveSelectedDocumentIds(project, selectedDocumentIds);

  const rawPoints = uniquePoints([
    ...general.points,
    ...detailed.sections.flatMap((section) => section.points),
  ], mode === 'report' ? 140 : mode === 'detailed' ? 84 : 44);
  const relevantPoints = rawPoints.filter((point) => isReportRelevant(point.text));
  const allPoints = relevantPoints.length >= Math.min(12, rawPoints.length) ? relevantPoints : rawPoints;

  const decisions = uniquePoints(allPoints.filter((point) => DECISION_CUES.test(point.text)), config.maxDecisions);
  const risks = uniquePoints(allPoints.filter((point) => RISK_CUES.test(point.text)), config.maxRisks);
  const demonstrations = uniquePoints(allPoints.filter((point) => DEMO_CUES.test(point.text)), mode === 'report' ? 24 : mode === 'detailed' ? 14 : 8);
  const openItems = uniquePoints(detailed.followUps, config.maxOpenItems);

  const draftSections: DraftSection[] = [];
  const executivePoints = uniquePoints([...allPoints, ...decisions, ...openItems], config.executiveParagraphs * config.pointsPerParagraph + 4);
  draftSections.push({
    id: 'executive-summary',
    title: 'Executive Summary',
    kind: 'overview',
    paragraphs: buildParagraphSeries(
      executivePoints,
      config.executiveParagraphs,
      config.pointsPerParagraph,
      [
        'The selected sessions focused on the principal requirements, implementation options and product capabilities discussed during the meeting scope.',
        'Across the discussions, the participants compared the current operating model with the corresponding Kong capabilities and identified areas that could be handled natively, automated through platform interfaces, or require additional design work.',
        'The sessions also combined requirement clarification with practical demonstrations, architecture discussion and follow-up questions that remained open for confirmation.',
        'A recurring theme was to preserve operational flexibility while avoiding unnecessary runtime dependencies in the API request path and keeping security, availability and maintainability considerations visible.',
        'The resulting discussion established a clearer view of the available approaches, the areas already demonstrated, and the items that still require validation, roadmap information or additional customer detail.',
      ],
    ),
    bullets: [],
  });

  const topicGroups = groupByTopic(allPoints)
    .filter((group) => group.points.length >= 2)
    .sort((a, b) => {
      if (a.rule.id === 'other-discussions') return 1;
      if (b.rule.id === 'other-discussions') return -1;
      return b.points.length - a.points.length;
    })
    .slice(0, config.maxTopics);

  for (const group of topicGroups) {
    draftSections.push({
      id: group.rule.id,
      title: group.rule.title,
      kind: 'technical',
      paragraphs: buildTopicParagraphs(group.rule.title, group.points, config.paragraphsPerTopic, config.pointsPerParagraph),
      bullets: [],
    });
  }

  if (demonstrations.length) {
    draftSections.push({
      id: 'approaches-demonstrated',
      title: mode === 'general' ? 'Approaches Reviewed' : 'Approaches Evaluated & Demonstrated',
      kind: 'discussion',
      paragraphs: buildParagraphSeries(
        demonstrations,
        mode === 'report' ? 2 : 1,
        config.pointsPerParagraph,
        [
          'The practical walkthroughs were used to validate how the discussed requirements map to concrete platform behavior and configuration options.',
          'Several implementation paths were compared during the sessions, including native capabilities, automation-driven configuration and custom extensions where the standard behavior did not directly mirror the existing model.',
          'The demonstrations and tests provided evidence for capabilities that can be implemented directly while also exposing the areas where additional engineering or product confirmation is still required.',
        ],
      ),
      bullets: [],
    });
  }

  if (risks.length && mode !== 'general') {
    draftSections.push({
      id: 'risks-constraints',
      title: 'Risks, Constraints & Architectural Considerations',
      kind: 'risk',
      paragraphs: buildParagraphSeries(
        risks,
        mode === 'report' ? 2 : 1,
        config.pointsPerParagraph,
        [
          'The architecture discussion highlighted several constraints that can affect runtime behavior, operational resilience and the maintainability of the target solution.',
          'The main concerns were associated with dependencies introduced into request processing, security and data-handling requirements, product limitations, and the operational impact of failure or latency in external systems.',
          'These considerations should be reflected in the target design and in the evaluation of native plugins, automation patterns and custom extensions before implementation choices are finalized.',
        ],
      ),
      bullets: [],
    });
  }

  if (decisions.length) {
    draftSections.push({
      id: 'decisions',
      title: 'Decisions & Agreed Direction',
      kind: 'decision',
      paragraphs: mode === 'report'
        ? buildParagraphSeries(decisions, 1, config.pointsPerParagraph, [
          'Several statements in the sessions indicated an agreed direction, confirmed behavior or a preferred implementation approach.',
          'Taken together, these decision-like statements provide the clearest record of the direction established during the discussions, although formal project approvals should still be validated against the original context.',
        ])
        : [],
      bullets: decisions.map(pointToBullet),
    });
  }

  if (openItems.length) {
    draftSections.push({
      id: 'open-items',
      title: 'Outstanding Questions & Follow-up Actions',
      kind: 'follow-up',
      paragraphs: mode === 'report'
        ? buildParagraphSeries(openItems, 1, config.pointsPerParagraph, [
          'The sessions left a number of items open for confirmation, additional information or product follow-up.',
          'These items are the strongest candidates for the next action list because they were identified from explicit pending, roadmap, confirmation or return-with-an-answer language in the transcripts.',
        ])
        : [],
      bullets: openItems.map(pointToBullet),
    });
  }

  const takeawayPoints = uniquePoints([...allPoints, ...decisions, ...risks], config.maxKeyPoints);
  draftSections.push({
    id: 'key-takeaways',
    title: mode === 'general' ? 'Key Points' : 'Key Takeaways',
    kind: 'takeaway',
    paragraphs: [],
    bullets: takeawayPoints.map(pointToBullet),
  });

  return finalizeReport(
    project.name,
    mode,
    general.sourceCount,
    general.segmentCount,
    selectedDocumentIdsResolved,
    draftSections,
    allPoints.slice(0, config.maxKeyPoints).map(pointToBullet),
    decisions.map(pointToBullet),
    openItems.map(pointToBullet),
  );
}

function resolveSelectedDocumentIds(project: Project, selectedDocumentIds: string[]): string[] {
  const sourceDocuments = project.documents.filter((document) => document.kind === 'source');
  if (!selectedDocumentIds.length) return sourceDocuments.map((document) => document.id);
  const selected = new Set(selectedDocumentIds);
  const resolved = sourceDocuments.filter((document) => selected.has(document.id)).map((document) => document.id);
  return resolved.length ? resolved : sourceDocuments.map((document) => document.id);
}

function groupByTopic(points: SummaryPoint[]): Array<{ rule: TopicRule; points: SummaryPoint[] }> {
  const buckets = new Map<string, SummaryPoint[]>();
  for (const rule of TOPIC_RULES) buckets.set(rule.id, []);
  const other: SummaryPoint[] = [];

  for (const point of points) {
    const rule = TOPIC_RULES.find((candidate) => candidate.matcher.test(point.text));
    if (rule) buckets.get(rule.id)?.push(point);
    else other.push(point);
  }

  const groups = TOPIC_RULES.map((rule) => ({
    rule,
    points: uniquePoints(buckets.get(rule.id) ?? [], 30),
  }));
  const uniqueOther = uniquePoints(other, 16);
  if (uniqueOther.length >= 3) {
    groups.push({
      rule: { id: 'other-discussions', title: 'Additional Technical Discussions', matcher: /.*/ },
      points: uniqueOther,
    });
  }
  return groups;
}

function isReportRelevant(value: string): boolean {
  return TOPIC_RULES.some((rule) => rule.matcher.test(value))
    || DECISION_CUES.test(value)
    || RISK_CUES.test(value)
    || DEMO_CUES.test(value);
}

function buildTopicParagraphs(title: string, points: SummaryPoint[], paragraphCount: number, pointsPerParagraph: number): DraftParagraph[] {
  const intros = [
    `The discussion around ${title} examined the relevant requirement, the current operating model and the available implementation options.`,
    `Further detail on ${title} focused on how the capability would behave operationally and how it could be integrated into the target architecture.`,
    `The participants also considered the practical implications of ${title}, including configuration, automation, runtime behavior and any limitations that still require confirmation.`,
  ];
  return buildParagraphSeries(points, paragraphCount, pointsPerParagraph, intros);
}

function buildParagraphSeries(
  points: SummaryPoint[],
  paragraphCount: number,
  pointsPerParagraph: number,
  intros: string[],
): DraftParagraph[] {
  const paragraphs: DraftParagraph[] = [];
  const unique = uniquePoints(points, paragraphCount * pointsPerParagraph + 4);
  for (let index = 0; index < paragraphCount; index += 1) {
    const slice = unique.slice(index * pointsPerParagraph, (index + 1) * pointsPerParagraph);
    if (!slice.length) break;
    paragraphs.push({
      text: composeReportedParagraph(intros[index % intros.length] ?? intros[0] ?? '', slice),
      references: slice.map((point) => point.reference),
    });
  }
  return paragraphs;
}

function composeReportedParagraph(intro: string, points: SummaryPoint[]): string {
  const sentences = points
    .map((point) => reportedSentence(point.text))
    .filter(Boolean)
    .slice(0, 5);
  if (!sentences.length) return intro;
  return `${intro} ${sentences.join(' ')}`.replace(/\s+/g, ' ').trim();
}

function reportedSentence(value: string): string {
  let text = value.replace(/\s+/g, ' ').trim();
  text = text
    .replace(/^(okay|ok|yeah|yes|right|so|well|basically|actually|i think|we think|you know|by the way)[,.:;!?\s-]+/i, '')
    .replace(/^(can you|could you|would you|do you|did you|are you|is it|what about)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!text) return '';
  if (text.length > 220) text = `${text.slice(0, 217).trimEnd()}…`;

  text = text
    .replace(/^we can\b/i, 'The team discussed the ability to')
    .replace(/^we have\b/i, 'The discussion noted that the platform has')
    .replace(/^we will\b/i, 'The agreed next step was to')
    .replace(/^you can\b/i, 'The platform can')
    .replace(/^you will\b/i, 'The expected behavior is that')
    .replace(/^i will\b/i, 'A follow-up was recorded to')
    .replace(/^i can\b/i, 'The capability discussed can')
    .replace(/[?]+$/g, '.')
    .trim();

  if (!/[.!…]$/.test(text)) text += '.';
  const alreadyReported = /^(The team|The discussion|The platform|The agreed|A follow-up|The capability|The expected behavior)/i.test(text);
  if (alreadyReported) return text.charAt(0).toUpperCase() + text.slice(1);

  const clause = text.charAt(0).toLocaleLowerCase('en-US') + text.slice(1);
  if (/^(the |kong |thy |it |this |that |there |they |we |i )/i.test(text)) {
    return `It was noted that ${clause}`;
  }
  return `The discussion addressed ${clause}`;
}

function pointToBullet(point: SummaryPoint): DraftBullet {
  return {
    text: cleanBullet(point.text),
    references: [point.reference],
  };
}

function cleanBullet(value: string): string {
  let text = value.replace(/\s+/g, ' ').trim();
  text = text.replace(/^(okay|ok|yeah|yes|right|so|well|basically|actually|i think|you know)[,.:;!?\s-]+/i, '').trim();
  if (text.length > 420) text = `${text.slice(0, 417).trimEnd()}…`;
  return text;
}

function uniquePoints(points: SummaryPoint[], limit: number): SummaryPoint[] {
  const chosen: SummaryPoint[] = [];
  for (const point of points) {
    const normalized = normalize(point.text);
    if (!normalized) continue;
    if (chosen.some((other) => similarity(normalized, normalize(other.text)) > 0.72)) continue;
    chosen.push(point);
    if (chosen.length >= limit) break;
  }
  return chosen;
}


function finalizeReport(
  title: string,
  mode: SummaryMode,
  sourceCount: number,
  segmentCount: number,
  documentIds: string[],
  draftSections: DraftSection[],
  keyPoints: DraftBullet[],
  decisions: DraftBullet[],
  openItems: DraftBullet[],
): MeetingReport {
  const referenceMap = new Map<string, ReportReference>();
  let nextReferenceId = 1;

  const mapReferences = (hits: SearchHit[]): number[] => {
    const ids: number[] = [];
    for (const hit of hits) {
      const key = `${hit.documentId}:${hit.segmentId}`;
      let reference = referenceMap.get(key);
      if (!reference) {
        reference = {
          id: nextReferenceId++,
          documentId: hit.documentId,
          documentName: hit.documentName,
          segmentId: hit.segmentId,
          sequenceId: hit.sequenceId,
          displayTime: hit.displayTime,
          text: hit.text,
        };
        referenceMap.set(key, reference);
      }
      ids.push(reference.id);
    }
    return [...new Set(ids)];
  };

  const sections: ReportSection[] = draftSections.map((section) => ({
    id: section.id,
    title: section.title,
    kind: section.kind,
    paragraphs: section.paragraphs.map<ReportParagraph>((paragraph) => ({
      text: paragraph.text,
      referenceIds: mapReferences(paragraph.references),
    })),
    bullets: section.bullets.map<ReportBullet>((bullet) => ({
      text: bullet.text,
      referenceIds: mapReferences(bullet.references),
    })),
  }));

  const mappedKeyPoints = keyPoints.map<ReportBullet>((bullet) => ({ text: bullet.text, referenceIds: mapReferences(bullet.references) }));
  const mappedDecisions = decisions.map<ReportBullet>((bullet) => ({ text: bullet.text, referenceIds: mapReferences(bullet.references) }));
  const mappedOpenItems = openItems.map<ReportBullet>((bullet) => ({ text: bullet.text, referenceIds: mapReferences(bullet.references) }));

  const wordCount = countWords(
    sections.flatMap((section) => [section.title, ...section.paragraphs.map((paragraph) => paragraph.text), ...section.bullets.map((bullet) => bullet.text)]).join(' '),
  );

  return {
    generatedAt: new Date().toISOString(),
    title,
    mode,
    language: 'original',
    sourceCount,
    segmentCount,
    documentIds,
    sections,
    keyPoints: mappedKeyPoints,
    decisions: mappedDecisions,
    openItems: mappedOpenItems,
    references: [...referenceMap.values()].sort((a, b) => a.id - b.id),
    wordCount,
  };
}

function countWords(value: string): number {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function normalize(value: string): string {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ı/g, 'i')
    .replace(/[^a-z0-9+#./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function similarity(a: string, b: string): number {
  const left = new Set(a.split(/\s+/).filter((token) => token.length > 2));
  const right = new Set(b.split(/\s+/).filter((token) => token.length > 2));
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}
