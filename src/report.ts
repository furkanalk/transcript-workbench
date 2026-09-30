import type {
  MeetingReport,
  Project,
  ReportBullet,
  ReportParagraph,
  ReportReference,
  ReportSection,
  ReportSectionKind,
  ReportSubsection,
  ReportSubsectionKind,
  SearchHit,
  SummaryMode,
  TranscriptDocument,
  TranscriptSegment,
} from './types';

type FindingKind = 'requirement' | 'current-state' | 'assessment' | 'options' | 'decision' | 'risk' | 'open-item' | 'evidence';

interface ModeConfig {
  maxTopics: number;
  topicEvidence: number;
  subsectionItems: number;
  executiveFacts: number;
  keyPoints: number;
  decisions: number;
  risks: number;
  openItems: number;
}

const MODE_CONFIG: Record<SummaryMode, ModeConfig> = {
  general: {
    maxTopics: 7,
    topicEvidence: 7,
    subsectionItems: 1,
    executiveFacts: 5,
    keyPoints: 5,
    decisions: 3,
    risks: 3,
    openItems: 5,
  },
  detailed: {
    maxTopics: 10,
    topicEvidence: 10,
    subsectionItems: 1,
    executiveFacts: 7,
    keyPoints: 5,
    decisions: 4,
    risks: 4,
    openItems: 5,
  },
  report: {
    maxTopics: 10,
    topicEvidence: 16,
    subsectionItems: 1,
    executiveFacts: 8,
    keyPoints: 8,
    decisions: 6,
    risks: 5,
    openItems: 8,
  },
};

interface TopicRule {
  id: string;
  title: string;
  matcher: RegExp;
  overview: string;
}

const TOPIC_RULES: TopicRule[] = [
  {
    id: 'developer-portal',
    title: 'Developer Portal & Developer Experience',
    matcher: /(developer portal|api catalog|catalogue|onboarding|subscription|application registration|developer experience|organization admin|invite users|documentation|swagger|openapi|try[- ]?out|developer account)/i,
    overview: 'The Developer Portal discussion covered publication, onboarding, documentation, self-service access and delegated administration requirements.',
  },
  {
    id: 'auth',
    title: 'Authentication, Authorization & Credential Management',
    matcher: /(oidc|oauth|authentication|authorization|keycloak|vault|beyondtrust|credential|token|basic auth|client credential|identity provider|idp)/i,
    overview: 'The authentication and credential-management discussion focused on identity integration, token flows and the handling of backend credentials.',
  },
  {
    id: 'acl-ip',
    title: 'Access Control, ACL & Dynamic IP Whitelisting',
    matcher: /(database[- ]based acl|database.*acl|acl.*database|access control|ip restriction|ip whitelist|whitelist|cidr|dynamic ip|forbidden.*ip|allowed or denied.*ip)/i,
    overview: 'The access-control discussion covered database-backed ACLs, IP-based restrictions, runtime enforcement and alternatives for synchronizing policy into Kong.',
  },
  {
    id: 'event-gateway',
    title: 'Event Gateway & Async API',
    matcher: /(event gateway|async api|asyncapi|kafka|topic|virtual cluster|event data|masking|filtering|client identity|amqp|mqtt)/i,
    overview: 'The Event Gateway discussion addressed event access, Async API onboarding, data filtering, masking and roadmap capabilities.',
  },
  {
    id: 'konnect',
    title: 'Konnect Architecture, Security & Data Residency',
    matcher: /(konnect|control plane|data plane|cloud data|data sharing|kvkk|data residency|information security|hybrid|cloud control plane)/i,
    overview: 'The Konnect discussion focused on Control Plane/Data Plane data flow, information-security review and data-residency constraints.',
  },
  {
    id: 'rate-limit',
    title: 'Rate Limiting & Traffic Control',
    matcher: /(rate limit|rate limiting|throttl|rps|request per second|consumer limit|advanced rate limiting)/i,
    overview: 'The traffic-control discussion covered rate-limit scope, time windows, consumer-specific limits and operational behavior.',
  },
  {
    id: 'caching',
    title: 'Caching & In-Memory Data',
    matcher: /(cache|caching|in-memory|in memory|redis|hazelcast|ram cache|data store|memory cache)/i,
    overview: 'The caching discussion covered the role of in-memory data, runtime lookups and alternatives where Redis or another data store may be required.',
  },
  {
    id: 'cicd',
    title: 'CI/CD, Automation & Configuration Management',
    matcher: /(ci\/cd|cicd|pipeline|admin api|automation|gitops|deck|declarative|configuration|promotion|maker|checker|gitlab)/i,
    overview: 'The automation discussion covered configuration promotion, environment management and synchronizing Kong through CI/CD or administrative interfaces.',
  },
  {
    id: 'observability',
    title: 'Observability, Logging & Operations',
    matcher: /(observability|logging|logs|splunk|grafana|siem|apm|monitoring|debugger|metrics|telemetry|alerting|slo)/i,
    overview: 'The operational discussion covered logs, observability tooling, metrics and troubleshooting responsibilities across the gateway and infrastructure layers.',
  },
  {
    id: 'performance',
    title: 'Performance, Testing & Scalability',
    matcher: /(performance|latency|load test|throughput|rps|scal|high availability|benchmark|payload|virtual cpu|vCPU|cpu|capacity)/i,
    overview: 'The performance discussion covered latency, throughput, test results, payload handling and infrastructure sizing considerations.',
  },
  {
    id: 'transformation',
    title: 'API Transformation & Custom Extensions',
    matcher: /(data kit|custom plugin|soap|rest|transform|transformation|custom extension|plugin development|payload transformation)/i,
    overview: 'The transformation discussion compared native capabilities, Data Kit and custom plugins for cases requiring more specialized processing.',
  },
  {
    id: 'network-security',
    title: 'Network & Transport Security',
    matcher: /(tls|mtls|waf|load balancer|x-forwarded-for|proxy protocol|certificate|firewall|network flow|source ip|client ip)/i,
    overview: 'The network-security discussion covered TLS termination, client-IP propagation, certificates and the placement of security controls around Kong.',
  },
  {
    id: 'deployment',
    title: 'Deployment, Environments & Resilience',
    matcher: /(dev environment|uat|pre-prod|preprod|production|prod|drc|disaster recovery|active passive|failover|rollback|environment|openshift|kubernetes)/i,
    overview: 'The deployment discussion covered environment separation, promotion, resilience and operational behavior across production and recovery environments.',
  },
];

const REQUIREMENT_CUES = /(requirement|need to|needs to|we need|we want|we would like|must |should |looking to|calls for|use case|expected to|require|mandatory|istiyor|gerekiyor|gerekli|zorunlu)/i;
const CURRENT_STATE_CUES = /(currently|current implementation|right now|today we|we currently|we use|we have|we are running|existing|in our environment|our integration|mevcut|şu anda|kullanıyoruz|çalışıyor|entegrasyonumuz)/i;
const ASSESSMENT_CUES = /(recommend|recommended|better approach|anti-pattern|antipattern|out of the box|native plugin|supported|not supported|not available|limitation|issue|problem|concern|prefer|preferred|best practice|öner|desteklen|sınırlama|uygun değil)/i;
const OPTION_CUES = /(option|approach|alternative|another way|can use|could use|can be built|custom plugin|native plugin|ci\/cd|admin api|either|one way|possible solution|seçenek|alternatif|yaklaşım)/i;
const DECISION_CUES = /(we agreed|agreed that|we decided|decision is|confirmed that|we will use|we are going to|the approach (?:is|will be)|accepted|approved|will proceed|going forward|probably be better|would be better|recommended approach|preferred approach|karar verdik|kararlaştır|mutabık|teyit edildi|kullanacağız|ilerleyeceğiz)/i;
const RISK_CUES = /(risk|latency|single point of failure|failure|outage|dependency|concern|security|compliance|data residency|performance|bottleneck|anti-pattern|antipattern|uncontrolled|availability|constraint|limitation|not available|not supported|riskli|gecikme|bağımlılık|güvenlik|kısıt|sınırlama)/i;
const OPEN_CUES = /(follow[- ]?up|action item|outstanding|open item|pending|need to confirm|need to check|will check|we will check|come back to you|get back to you|provide you with the answer|need to clarify|roadmap|timeline|availability date|not available yet|not supported yet|to be confirmed|tbd|share the details|share details|aksiyon|teyit|netleştir|kontrol edip|geri döne|açık konu)/i;
const DEMO_CUES = /(demo|demonstrat|showed|shown|walked through|walkthrough|tested|configured|implemented|created|deployed|reviewed|presented|göster|test ett|konfigüre|uygula|devreye al)/i;

interface EvidenceItem {
  document: TranscriptDocument;
  segment: TranscriptSegment;
  index: number;
  context: string;
  hit: SearchHit;
  score: number;
  kinds: Set<FindingKind>;
}

interface TopicEvidence {
  rule: TopicRule;
  items: EvidenceItem[];
}

interface DraftParagraph {
  text: string;
  references: SearchHit[];
}

interface DraftBullet {
  text: string;
  references: SearchHit[];
}

interface DraftSubsection {
  id: string;
  title: string;
  kind: ReportSubsectionKind;
  paragraphs: DraftParagraph[];
  bullets: DraftBullet[];
}

interface DraftSection {
  id: string;
  title: string;
  kind: ReportSectionKind;
  paragraphs: DraftParagraph[];
  bullets: DraftBullet[];
  subsections?: DraftSubsection[];
}

export function generateMeetingReport(
  project: Project,
  mode: SummaryMode,
  selectedDocumentIds: string[] = [],
): MeetingReport {
  const config = MODE_CONFIG[mode];
  const documents = resolveDocuments(project, selectedDocumentIds);
  const evidence = collectEvidence(documents);
  const topicGroups = selectTopicGroups(
    buildTopicGroups(evidence).filter((group) => group.items.length >= 2),
    config.maxTopics,
  );

  const allSelectedEvidence = uniqueEvidence(
    topicGroups.flatMap((group) => group.items),
    mode === 'report' ? 220 : mode === 'detailed' ? 130 : 70,
  );

  const decisions = pickByKind(allSelectedEvidence, 'decision', config.decisions);
  const risks = pickByKind(allSelectedEvidence, 'risk', config.risks);
  const openItems = pickByKind(allSelectedEvidence, 'open-item', config.openItems);
  const keyEvidence = uniqueEvidence(
    [
      ...pickByKind(allSelectedEvidence, 'requirement', config.keyPoints),
      ...pickByKind(allSelectedEvidence, 'assessment', config.keyPoints),
      ...pickByKind(allSelectedEvidence, 'options', config.keyPoints),
      ...decisions,
    ],
    config.keyPoints,
  );

  const sections: DraftSection[] = [];

  sections.push(buildExecutiveSection(topicGroups, keyEvidence, decisions, openItems, config.executiveFacts, mode));

  if (mode === 'general') {
    sections.push(buildGeneralTopicsSection(topicGroups));
    sections.push({
      id: 'key-outcomes',
      title: 'Key Outcomes',
      kind: 'takeaway',
      paragraphs: [],
      bullets: keyEvidence.slice(0, config.keyPoints).map((item) => evidenceToBullet(item, bestKind(item))),
    });
    if (decisions.length) {
      sections.push({
        id: 'decisions',
        title: 'Decisions & Agreed Direction',
        kind: 'decision',
        paragraphs: [],
        bullets: decisions.map((item) => evidenceToBullet(item, 'decision')),
      });
    }
    if (openItems.length) {
      sections.push({
        id: 'open-items',
        title: 'Outstanding Items',
        kind: 'follow-up',
        paragraphs: [],
        bullets: openItems.map((item) => evidenceToBullet(item, 'open-item')),
      });
    }
  } else {
    for (const group of topicGroups) {
      const section = buildTopicSection(group, mode, config);
      if (section) sections.push(section);
    }

    if (mode === 'report' && risks.length) {
      sections.push({
        id: 'cross-cutting-risks',
        title: 'Cross-Cutting Risks & Architectural Considerations',
        kind: 'risk',
        paragraphs: [buildCrossCuttingParagraph(risks, 'risk')],
        bullets: risks.map((item) => evidenceToBullet(item, 'risk')),
      });
    }

    if (mode === 'report' && decisions.length) {
      sections.push({
        id: 'decisions',
        title: 'Decisions & Agreed Direction',
        kind: 'decision',
        paragraphs: [],
        bullets: decisions.map((item) => evidenceToBullet(item, 'decision')),
      });
    }

    if (openItems.length) {
      sections.push({
        id: 'open-items',
        title: mode === 'report' ? 'Outstanding Items & Recommended Next Steps' : 'Outstanding Questions & Follow-up Actions',
        kind: 'follow-up',
        paragraphs: mode === 'report' ? [buildNextStepsParagraph(openItems)] : [],
        bullets: openItems.map((item) => evidenceToBullet(item, 'open-item')),
      });
    }

    if (mode === 'report') {
      sections.push({
        id: 'key-takeaways',
        title: 'Key Takeaways',
        kind: 'takeaway',
        paragraphs: [],
        bullets: keyEvidence.slice(0, config.keyPoints).map((item) => evidenceToBullet(item, bestKind(item))),
      });
    }
  }

  const segmentCount = documents.reduce((sum, document) => sum + document.transcript.segments.length, 0);
  return finalizeReport(
    project.name,
    mode,
    documents.length,
    segmentCount,
    documents.map((document) => document.id),
    sections,
    keyEvidence.map((item) => evidenceToBullet(item, bestKind(item))),
    decisions.map((item) => evidenceToBullet(item, 'decision')),
    openItems.map((item) => evidenceToBullet(item, 'open-item')),
  );
}

function resolveDocuments(project: Project, selectedDocumentIds: string[]): TranscriptDocument[] {
  const sources = project.documents.filter((document) => document.kind === 'source');
  if (!selectedDocumentIds.length) return sources;
  const selected = new Set(selectedDocumentIds);
  const scoped = sources.filter((document) => selected.has(document.id));
  return scoped.length ? scoped : sources;
}

function collectEvidence(documents: TranscriptDocument[]): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  for (const document of documents) {
    const segments = document.transcript.segments;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const raw = cleanText(segment.text);
      if (!isUsefulSegment(raw)) continue;

      const context = contextualText(segments, index);
      const rawKinds = classifyKinds(raw);
      const kinds = rawKinds.size ? rawKinds : classifyKinds(context);
      const topicMatchCount = TOPIC_RULES.reduce((sum, rule) => sum + (rule.matcher.test(context) ? 1 : 0), 0);
      if (!kinds.size && topicMatchCount === 0) continue;

      const score = evidenceScore(segment, context, kinds, topicMatchCount);
      items.push({
        document,
        segment,
        index,
        context,
        score,
        kinds,
        hit: {
          documentId: document.id,
          documentName: document.name,
          segmentId: segment.id,
          sequenceId: segment.sequence_id,
          displayTime: segment.display_time,
          confidence: segment.confidence,
          score,
          text: raw,
          context,
        },
      });
    }
  }

  return items;
}

function contextualText(segments: TranscriptSegment[], index: number): string {
  const current = cleanText(segments[index]?.text ?? '');
  const before = cleanText(segments[index - 1]?.text ?? '');
  const after = cleanText(segments[index + 1]?.text ?? '');
  const parts: string[] = [];

  if (current.length < 180 && before.length >= 20 && before.length <= 240) parts.push(before);
  parts.push(current);
  if (current.length < 260 && after.length >= 20 && after.length <= 320) parts.push(after);

  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 950);
}

function classifyKinds(value: string): Set<FindingKind> {
  const kinds = new Set<FindingKind>();
  if (REQUIREMENT_CUES.test(value)) kinds.add('requirement');
  if (CURRENT_STATE_CUES.test(value)) kinds.add('current-state');
  if (ASSESSMENT_CUES.test(value)) kinds.add('assessment');
  if (OPTION_CUES.test(value)) kinds.add('options');
  if (DECISION_CUES.test(value)) kinds.add('decision');
  if (RISK_CUES.test(value)) kinds.add('risk');
  if (OPEN_CUES.test(value)) kinds.add('open-item');
  if (DEMO_CUES.test(value)) kinds.add('evidence');
  return kinds;
}

function evidenceScore(segment: TranscriptSegment, context: string, kinds: Set<FindingKind>, topicMatchCount: number): number {
  let score = 0.8 + Math.max(0, Math.min(1, segment.confidence)) * 0.9;
  score += Math.min(1.5, context.length / 360);
  score += Math.min(1.6, kinds.size * 0.28);
  score += Math.min(1.2, topicMatchCount * 0.24);
  if (DECISION_CUES.test(context) || OPEN_CUES.test(context)) score += 0.55;
  if (/(we want|we need|current implementation|recommended|custom plugin|native plugin|ci\/cd|admin api|roadmap|not supported|not available)/i.test(context)) score += 0.45;
  return score;
}

function buildTopicGroups(evidence: EvidenceItem[]): TopicEvidence[] {
  return TOPIC_RULES.map((rule) => ({
    rule,
    items: uniqueEvidence(
      evidence
        .filter((item) => rule.matcher.test(item.context))
        .map((item) => focusEvidenceForTopic(item, rule))
        .filter((item) => item.context.length >= 20),
      60,
    ),
  }));
}

function focusEvidenceForTopic(item: EvidenceItem, rule: TopicRule): EvidenceItem {
  const sentences = splitSentences(item.context);
  const matching = new Set<number>();
  sentences.forEach((sentence, index) => {
    if (rule.matcher.test(sentence)) {
      matching.add(index);
      if (index > 0 && hasFindingCue(sentences[index - 1] ?? '')) matching.add(index - 1);
      if (index + 1 < sentences.length && hasFindingCue(sentences[index + 1] ?? '')) matching.add(index + 1);
    }
  });
  const focused = [...matching].sort((a, b) => a - b).map((index) => sentences[index]).join(' ').trim();
  const context = focused || sentences.find((sentence) => rule.matcher.test(sentence)) || item.context;
  const kinds = classifyKinds(context);
  return {
    ...item,
    context,
    kinds: kinds.size ? kinds : item.kinds,
    hit: { ...item.hit, context },
  };
}

function hasFindingCue(value: string): boolean {
  return REQUIREMENT_CUES.test(value)
    || CURRENT_STATE_CUES.test(value)
    || ASSESSMENT_CUES.test(value)
    || OPTION_CUES.test(value)
    || DECISION_CUES.test(value)
    || RISK_CUES.test(value)
    || OPEN_CUES.test(value);
}


function selectTopicGroups(groups: TopicEvidence[], limit: number): TopicEvidence[] {
  const ranked = [...groups].sort((a, b) => topicWeight(b) - topicWeight(a));
  const selected: TopicEvidence[] = [];
  const add = (group: TopicEvidence) => {
    if (!selected.some((item) => item.rule.id === group.rule.id) && selected.length < limit) selected.push(group);
  };

  // Preserve requirement-heavy and explicitly unresolved subjects even when a broad topic
  // (for example deployment or CI/CD) has many more transcript mentions.
  ranked
    .filter((group) => group.items.some((item) => item.kinds.has('open-item'))
      && group.items.some((item) => item.kinds.has('requirement') || item.kinds.has('current-state')))
    .slice(0, Math.min(4, limit))
    .forEach(add);
  ranked
    .filter((group) => group.items.some((item) => item.kinds.has('open-item') || item.kinds.has('decision')))
    .slice(0, Math.min(4, limit))
    .forEach(add);
  ranked
    .filter((group) => group.items.some((item) => item.kinds.has('requirement') || item.kinds.has('current-state')))
    .slice(0, Math.min(5, limit))
    .forEach(add);
  ranked.forEach(add);

  return selected.sort((a, b) => topicWeight(b) - topicWeight(a));
}

function topicWeight(group: TopicEvidence): number {
  if (!group.items.length) return 0;
  const categories = new Set(group.items.flatMap((item) => [...item.kinds]));
  const explicitFollowUps = group.items.filter((item) => item.kinds.has('open-item')).length;
  const explicitDecisions = group.items.filter((item) => item.kinds.has('decision')).length;
  const requirements = group.items.filter((item) => item.kinds.has('requirement') || item.kinds.has('current-state')).length;
  const assessments = group.items.filter((item) => item.kinds.has('assessment') || item.kinds.has('risk')).length;
  const topAverage = group.items.slice(0, 6).reduce((sum, item) => sum + item.score, 0) / Math.max(1, Math.min(6, group.items.length));
  const discoveryCriticalBonus = explicitFollowUps > 0 && requirements > 0 ? 5 : 0;
  return topAverage * 2
    + Math.log2(group.items.length + 1) * 1.5
    + categories.size * 2.2
    + Math.min(3, explicitFollowUps) * 2.4
    + Math.min(3, explicitDecisions) * 1.5
    + Math.min(3, requirements) * 1.1
    + Math.min(3, assessments) * 1.1
    + discoveryCriticalBonus;
}

function buildExecutiveSection(
  groups: TopicEvidence[],
  keyEvidence: EvidenceItem[],
  decisions: EvidenceItem[],
  openItems: EvidenceItem[],
  factLimit: number,
  mode: SummaryMode,
): DraftSection {
  const topicTitles = groups.slice(0, mode === 'general' ? 5 : 7).map((group) => group.rule.title);
  const overviewRefs = uniqueHits(groups.slice(0, 5).flatMap((group) => group.items.slice(0, 1).map((item) => item.hit)));

  const paragraphs: DraftParagraph[] = [];
  if (topicTitles.length) {
    paragraphs.push({
      text: `The selected sessions focused on ${joinNaturalList(topicTitles)}. The discussions were treated as a set of requirements, current-state observations, implementation options, architectural considerations and follow-up items rather than as a chronological replay of the conversation.`,
      references: overviewRefs,
    });
  }

  const executiveFacts = uniqueEvidence([...decisions, ...keyEvidence, ...openItems], factLimit);
  if (executiveFacts.length) {
    const statements = executiveFacts
      .slice(0, mode === 'report' ? 6 : mode === 'detailed' ? 5 : 3)
      .map((item) => factSentence(item, bestKind(item)))
      .filter(Boolean);
    if (statements.length) {
      paragraphs.push({
        text: `${statements.join(' ')} ${openItems.length ? 'Several items remain subject to confirmation, additional customer detail or product-roadmap clarification.' : ''}`.replace(/\s+/g, ' ').trim(),
        references: uniqueHits(executiveFacts.map((item) => item.hit)),
      });
    }
  }

  return {
    id: 'executive-summary',
    title: 'Executive Summary',
    kind: 'overview',
    paragraphs,
    bullets: [],
  };
}

function buildGeneralTopicsSection(groups: TopicEvidence[]): DraftSection {
  return {
    id: 'main-topics',
    title: 'Main Topics Discussed',
    kind: 'discussion',
    paragraphs: [],
    bullets: groups.slice(0, 7).map((group) => ({
      text: `${group.rule.title} — ${group.rule.overview}`,
      references: uniqueHits(group.items.slice(0, 2).map((item) => item.hit)),
    })),
  };
}

function buildTopicSection(group: TopicEvidence, mode: SummaryMode, config: ModeConfig): DraftSection | null {
  const items = uniqueEvidence(group.items, Math.max(config.topicEvidence, 50));
  if (items.length < 2) return null;

  const requirementItems = selectTopicKind(items, ['requirement', 'current-state'], config.subsectionItems);
  const assessmentItems = selectTopicKind(excludeEvidence(items, requirementItems), ['assessment', 'risk'], config.subsectionItems);
  const optionItems = selectTopicKind(excludeEvidence(items, [...requirementItems, ...assessmentItems]), ['options', 'evidence'], config.subsectionItems);
  const decisionItems = selectTopicKind(excludeEvidence(items, [...requirementItems, ...assessmentItems, ...optionItems]), ['decision'], config.subsectionItems);
  const openItems = selectTopicKind(excludeEvidence(items, [...requirementItems, ...assessmentItems, ...optionItems, ...decisionItems]), ['open-item'], config.subsectionItems);

  const overviewEvidence = uniqueEvidence([
    ...requirementItems.slice(0, 2),
    ...assessmentItems.slice(0, 2),
    ...optionItems.slice(0, 2),
    ...decisionItems.slice(0, 1),
    ...openItems.slice(0, 1),
  ], mode === 'report' ? 8 : 5);

  const overviewParagraphs: DraftParagraph[] = [{
    text: buildTopicOverview(group.rule, requirementItems, assessmentItems, optionItems, decisionItems, openItems),
    references: uniqueHits(overviewEvidence.map((item) => item.hit)),
  }];

  const subsections: DraftSubsection[] = [];
  pushSubsection(subsections, 'requirement-current', 'Requirement & Current State', 'requirement', requirementItems, 'requirement');
  pushSubsection(subsections, 'assessment', 'Assessment & Considerations', 'assessment', assessmentItems, 'assessment');
  pushSubsection(subsections, 'options', 'Implementation Options', 'options', optionItems, 'options');
  pushSubsection(subsections, 'decisions', 'Decisions / Agreed Direction', 'decision', decisionItems, 'decision');
  pushSubsection(subsections, 'open-points', 'Open Points', 'open-item', openItems, 'open-item');

  if (!subsections.length) return null;

  return {
    id: group.rule.id,
    title: group.rule.title,
    kind: 'technical',
    paragraphs: overviewParagraphs,
    bullets: [],
    subsections,
  };
}

function pushSubsection(
  subsections: DraftSubsection[],
  id: string,
  title: string,
  kind: ReportSubsectionKind,
  items: EvidenceItem[],
  factKind: FindingKind,
): void {
  if (!items.length) return;
  subsections.push({
    id,
    title,
    kind,
    paragraphs: [],
    bullets: items.map((item) => evidenceToBullet(
      item,
      factKind === 'requirement' && !item.kinds.has('requirement') && item.kinds.has('current-state') ? 'current-state' : factKind,
    )),
  });
}

function buildTopicOverview(
  rule: TopicRule,
  requirements: EvidenceItem[],
  assessments: EvidenceItem[],
  options: EvidenceItem[],
  decisions: EvidenceItem[],
  openItems: EvidenceItem[],
): string {
  const parts = [rule.overview];

  const requirement = requirements[0];
  if (requirement) parts.push(factSentence(requirement, requirement.kinds.has('requirement') ? 'requirement' : 'current-state'));
  const assessment = assessments[0];
  if (assessment) parts.push(factSentence(assessment, assessment.kinds.has('risk') ? 'risk' : 'assessment'));
  const option = options[0];
  if (option) parts.push(factSentence(option, option.kinds.has('options') ? 'options' : 'evidence'));
  const decision = decisions[0];
  if (decision) parts.push(factSentence(decision, 'decision'));
  if (openItems.length) parts.push('At least one point in this area remained open for confirmation or further detail.');

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function buildCrossCuttingParagraph(items: EvidenceItem[], kind: FindingKind): DraftParagraph {
  const selected = uniqueEvidence(items, 5);
  return {
    text: `Several cross-cutting considerations affect the target architecture beyond any single feature area. ${selected.map((item) => factSentence(item, kind)).join(' ')}`,
    references: uniqueHits(selected.map((item) => item.hit)),
  };
}

function buildNextStepsParagraph(items: EvidenceItem[]): DraftParagraph {
  const selected = uniqueEvidence(items, 6);
  return {
    text: 'The remaining work should focus on closing the explicitly unresolved items, obtaining missing implementation detail, and confirming any product or roadmap dependencies before the target design is treated as final.',
    references: uniqueHits(selected.map((item) => item.hit)),
  };
}


function excludeEvidence(items: EvidenceItem[], excluded: EvidenceItem[]): EvidenceItem[] {
  const keys = new Set(excluded.map(evidenceKey));
  return items.filter((item) => !keys.has(evidenceKey(item)));
}

function selectTopicKind(items: EvidenceItem[], kinds: FindingKind[], limit: number): EvidenceItem[] {
  const set = new Set(kinds);
  const candidates = items
    .filter((item) => [...item.kinds].some((kind) => set.has(kind)))
    .sort((a, b) => kindSelectionScore(b, kinds) - kindSelectionScore(a, kinds));
  return dedupeEvidenceInOrder(candidates, limit);
}

function kindSelectionScore(item: EvidenceItem, kinds: FindingKind[]): number {
  const value = item.context;
  let score = item.score;
  if (kinds.includes('requirement')) {
    if (item.kinds.has('requirement')) score += 2.4;
    if (/(query .*database|retrieve .*acl|enforce .*acl|ip whitelist|dynamic ip|we need|we want|looking to|requirement)/i.test(value)) score += 2.2;
  }
  if (kinds.includes('current-state')) {
    if (/(current implementation|currently|we use|we have an? integration|we are running|existing)/i.test(value)) score += 1.8;
  }
  if (kinds.includes('assessment') || kinds.includes('risk')) {
    if (/(anti-pattern|antipattern)/i.test(value)) score += 4.5;
    if (/(latency|single point of failure|outage|dependency|better approach|recommend|not supported|not available)/i.test(value)) score += 2.5;
  }
  if (kinds.includes('options') || kinds.includes('evidence')) {
    if (/(custom plugin|ci\/cd|admin api|source-controlled)/i.test(value)) score += 5;
    if (/(native plugin|out-of-the-box|standard .*plugin|alternative|option)/i.test(value)) score += 2.7;
  }
  if (kinds.includes('decision')) {
    if (/(probably be better|would be better|recommend|preferred|we agreed|we decided|will proceed)/i.test(value)) score += 2.7;
  }
  if (kinds.includes('open-item')) {
    if (/(share .*details|details.*integration|need to confirm|need to check|get back|come back|roadmap|timeline|pending)/i.test(value)) score += 4;
  }
  return score;
}


function dedupeEvidenceInOrder(items: EvidenceItem[], limit: number): EvidenceItem[] {
  const chosen: EvidenceItem[] = [];
  for (const item of items) {
    const normalized = normalize(item.context);
    if (!normalized) continue;
    if (chosen.some((other) => similarity(normalized, normalize(other.context)) > 0.72)) continue;
    chosen.push(item);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

function pickByKind(items: EvidenceItem[], kind: FindingKind, limit: number): EvidenceItem[] {
  return uniqueEvidence(items.filter((item) => item.kinds.has(kind)), limit);
}

function evidenceToBullet(item: EvidenceItem, kind: FindingKind): DraftBullet {
  return {
    text: factSentence(item, kind),
    references: [item.hit],
  };
}

function factSentence(item: EvidenceItem, kind: FindingKind): string {
  const known = normalizeKnownTechnicalFact(item, kind);
  if (known) return known;
  const sentence = bestSentence(item.context, kind);
  const cleaned = stripConversationalLead(sentence);
  const body = sentenceCase(trimSentence(cleaned, 190));
  if (!body) return '';

  const lower = /^[A-Z]{2}/.test(body) ? body : body.charAt(0).toLocaleLowerCase('en-US') + body.slice(1);
  const alreadyReported = /^(The |A |An |Kong |THY |Konnect |Developer Portal|Event Gateway|Redis|Hazelcast|CIDR|ACL|OIDC|OAuth)/.test(body);

  switch (kind) {
    case 'requirement':
      if (/^(we|they) (need|want|would like|require)/i.test(body)) {
        return ensurePeriod(`The requirement discussed is to ${body.replace(/^(we|they) (need|want|would like|require)(?: to)?\s+/i, '')}`);
      }
      if (/^this scenario calls for/i.test(body)) return ensurePeriod(body.replace(/^this scenario calls for\s+/i, 'The requirement calls for '));
      if (/^looking to\s+/i.test(body)) return ensurePeriod(`The requirement is to ${body.replace(/^looking to\s+/i, '')}`);
      return ensurePeriod(alreadyReported ? body : `The requirement discussion identified that ${lower}`);
    case 'current-state':
      if (/^(we|they) have an? integration/i.test(body)) {
        return ensurePeriod(`The current implementation includes ${body.replace(/^(we|they) have\s+/i, '')}`);
      }
      if (/^(we|they) use/i.test(body)) {
        return ensurePeriod(`The current implementation uses ${body.replace(/^(we|they) use\s+/i, '')}`);
      }
      if (/^(we|they) are running/i.test(body)) {
        return ensurePeriod(`The current implementation is running ${body.replace(/^(we|they) are running\s+/i, '')}`);
      }
      if (/^(we|they) currently/i.test(body)) {
        return ensurePeriod(`The current implementation ${body.replace(/^(we|they) currently\s+/i, '')}`);
      }
      return ensurePeriod(alreadyReported ? body : `The current-state discussion noted that ${lower}`);
    case 'assessment':
      return ensurePeriod(alreadyReported ? body : `The assessment highlighted that ${lower}`);
    case 'options':
      if (/^(we|you|they) can\s+/i.test(body)) return ensurePeriod(`An implementation option discussed is to ${body.replace(/^(we|you|they) can\s+/i, '')}`);
      return ensurePeriod(alreadyReported ? body : `An implementation option discussed is that ${lower}`);
    case 'decision':
      if (/^we (agreed|decided|will|are going to)/i.test(body)) {
        return ensurePeriod(`The agreed direction was to ${body.replace(/^we (agreed(?: that)?|decided(?: that)?|will|are going to)\s+/i, '')}`);
      }
      return ensurePeriod(alreadyReported ? body : `The discussion recorded the following direction: ${lower}`);
    case 'risk':
      return ensurePeriod(alreadyReported ? body : `The architectural consideration is that ${lower}`);
    case 'open-item':
      if (/^(we|i) (need to|will) (check|confirm|share|provide|get back|come back)/i.test(body)) {
        return ensurePeriod(`Follow-up is required to ${body.replace(/^(we|i) (need to|will)\s+/i, '')}`);
      }
      return ensurePeriod(alreadyReported ? body : `Follow-up remained open regarding ${lower.replace(/[?]+$/g, '')}`);
    case 'evidence':
      return ensurePeriod(alreadyReported ? body : `The capability was reviewed through discussion or demonstration: ${lower}`);
  }
}


function normalizeKnownTechnicalFact(item: EvidenceItem, kind: FindingKind): string | null {
  const value = item.context.replace(/\s+/g, ' ').trim();

  if (kind === 'requirement'
    && /query (?:these )?databases?.*acl information/i.test(value)
    && /enforce .*acl/i.test(value)) {
    return 'The requirement is to retrieve ACL information from an external database and enforce access based on IP or another configured access characteristic.';
  }

  if (kind === 'current-state' && /integration with database/i.test(value)) {
    return 'The current implementation includes a database integration used as part of the access-control flow.';
  }

  if (kind === 'assessment'
    && /depending on an external source/i.test(value)
    && /(better approach|maintain .*plugin)/i.test(value)) {
    return 'Runtime dependence on an external source was identified as an architectural concern, with native plugin configuration maintained through CI/CD discussed as the cleaner approach.';
  }

  if (kind === 'assessment' && /anti-pattern/i.test(value)) {
    return 'The runtime external-database lookup pattern was described as an anti-pattern because it introduces an additional dependency into request processing.';
  }

  if (kind === 'assessment' && /ip restriction out of the box plugin option.*no cache/i.test(value)) {
    return 'The native IP Restriction plugin does not require an external lookup cache because the restriction list is maintained in the plugin configuration.';
  }

  if (kind === 'options' && /custom plugin/i.test(value) && /fetches? the list from a database/i.test(value)) {
    return 'A custom plugin can preserve the runtime database model by fetching the access list from the database and applying the resulting policy at the gateway.';
  }

  if (kind === 'options'
    && /out-of-the-box plugins? for ip restriction/i.test(value)
    && /ci-?cd pipeline/i.test(value)) {
    return 'The native option is to use the standard IP Restriction and authentication plugins and update their configuration automatically through a CI/CD pipeline when the source access data changes.';
  }

  if (kind === 'decision'
    && /standard out-of-the-box ip restriction plugin/i.test(value)
    && /source-controlled repo/i.test(value)) {
    return 'The preferred approach discussed was to use the native IP Restriction plugin with the approved IP list kept in source control and synchronized automatically through CI/CD.';
  }

  if (kind === 'open-item' && /share .*details/i.test(value) && /integration with database/i.test(value)) {
    return 'Additional details of the existing database integration are to be shared so that the target implementation can be evaluated further.';
  }

  if (kind === 'open-item' && /ip restrictions?.*need to check/i.test(value)) {
    return 'The IP restriction scenario remained subject to follow-up confirmation.';
  }

  return null;
}

function bestSentence(value: string, kind: FindingKind): string {
  const sentences = splitSentences(value);
  if (!sentences.length) return value;
  const cue = kindMatcher(kind);
  let best = sentences[0];
  let bestScore = -1;

  for (const sentence of sentences) {
    let score = sentence.length / 180;
    if (cue.test(sentence)) score += 3;
    if (TOPIC_RULES.some((rule) => rule.matcher.test(sentence))) score += 1;
    if (sentence.length >= 45 && sentence.length <= 360) score += 0.7;
    if (score > bestScore) {
      best = sentence;
      bestScore = score;
    }
  }
  return best;
}

function kindMatcher(kind: FindingKind): RegExp {
  if (kind === 'requirement') return REQUIREMENT_CUES;
  if (kind === 'current-state') return CURRENT_STATE_CUES;
  if (kind === 'assessment') return ASSESSMENT_CUES;
  if (kind === 'options') return OPTION_CUES;
  if (kind === 'decision') return DECISION_CUES;
  if (kind === 'risk') return RISK_CUES;
  if (kind === 'open-item') return OPEN_CUES;
  return DEMO_CUES;
}

function bestKind(item: EvidenceItem): FindingKind {
  const priority: FindingKind[] = ['decision', 'open-item', 'requirement', 'current-state', 'assessment', 'options', 'risk', 'evidence'];
  return priority.find((kind) => item.kinds.has(kind)) ?? 'evidence';
}

function stripConversationalLead(value: string): string {
  return value
    .replace(/\bCICV\b/gi, 'CI/CD')
    .replace(/\bCI-CD\b/gi, 'CI/CD')
    .replace(/\bKog\b/g, 'Kong')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(okay|ok|yeah|yes|right|so|well|basically|actually|i think|we think|you know|by the way|let me|all right|alright)[,.:;!?\s-]+/i, '')
    .replace(/^(can you|could you|would you|do you|did you|are you|is it|what about)\s+/i, '')
    .trim();
}

function sentenceCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase('en-US') + value.slice(1);
}

function trimSentence(value: string, max: number): string {
  let text = value.replace(/\s+/g, ' ').trim();
  if (text.length > max) text = `${text.slice(0, max - 1).trimEnd()}…`;
  return text;
}

function ensurePeriod(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim().replace(/[?]+$/g, '.');
  if (!text) return '';
  return /[.!…]$/.test(text) ? text : `${text}.`;
}

function isUsefulSegment(value: string): boolean {
  if (value.length < 18) return false;
  if (/^(thank you|thanks|bye|bye-bye|hello|okay|ok|yeah|yes|no|uh|um|hmm)[.!?,\s-]*$/i.test(value)) return false;
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 4;
}

function splitSentences(value: string): string[] {
  return (value.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g) ?? [value])
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function uniqueEvidence(items: EvidenceItem[], limit: number): EvidenceItem[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const chosen: EvidenceItem[] = [];
  for (const item of sorted) {
    const normalized = normalize(item.context);
    if (!normalized) continue;
    if (chosen.some((other) => similarity(normalized, normalize(other.context)) > 0.72)) continue;
    chosen.push(item);
    if (chosen.length >= limit) break;
  }
  return chosen;
}

function uniqueHits(hits: SearchHit[]): SearchHit[] {
  const map = new Map<string, SearchHit>();
  for (const hit of hits) map.set(`${hit.documentId}:${hit.segmentId}`, hit);
  return [...map.values()];
}

function evidenceKey(item: EvidenceItem): string {
  return `${item.document.id}:${item.segment.id}`;
}

function joinNaturalList(values: string[]): string {
  const clean = values.filter(Boolean);
  if (!clean.length) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
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

  const mapParagraph = (paragraph: DraftParagraph): ReportParagraph => ({
    text: paragraph.text,
    referenceIds: mapReferences(paragraph.references),
  });
  const mapBullet = (bullet: DraftBullet): ReportBullet => ({
    text: bullet.text,
    referenceIds: mapReferences(bullet.references),
  });
  const mapSubsection = (subsection: DraftSubsection): ReportSubsection => ({
    id: subsection.id,
    title: subsection.title,
    kind: subsection.kind,
    paragraphs: subsection.paragraphs.map(mapParagraph),
    bullets: subsection.bullets.map(mapBullet),
  });

  const sections: ReportSection[] = draftSections.map((section) => ({
    id: section.id,
    title: section.title,
    kind: section.kind,
    paragraphs: section.paragraphs.map(mapParagraph),
    bullets: section.bullets.map(mapBullet),
    subsections: section.subsections?.map(mapSubsection),
  }));

  const mappedKeyPoints = keyPoints.map(mapBullet);
  const mappedDecisions = decisions.map(mapBullet);
  const mappedOpenItems = openItems.map(mapBullet);

  const wordCount = countWords(
    sections.flatMap((section) => [
      section.title,
      ...section.paragraphs.map((paragraph) => paragraph.text),
      ...section.bullets.map((bullet) => bullet.text),
      ...(section.subsections ?? []).flatMap((subsection) => [
        subsection.title,
        ...subsection.paragraphs.map((paragraph) => paragraph.text),
        ...subsection.bullets.map((bullet) => bullet.text),
      ]),
    ]).join(' '),
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
