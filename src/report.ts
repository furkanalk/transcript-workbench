import type {
  ClaimValidation,
  MeetingNoteDocument,
  MeetingReport,
  Project,
  ReportAttributionInfo,
  ReportConflict,
  ReportCoverage,
  ReportOpenItem,
  ReportReviewItem,
  RequirementMatrixRow,
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
import { meetingNoteSectionLabel } from './meeting-notes';

type FindingKind = 'requirement' | 'current-state' | 'assessment' | 'options' | 'recommendation' | 'decision' | 'risk' | 'open-item' | 'evidence';

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
    maxTopics: 12,
    topicEvidence: 10,
    subsectionItems: 2,
    executiveFacts: 7,
    keyPoints: 5,
    decisions: 4,
    risks: 4,
    openItems: 10,
  },
  report: {
    maxTopics: 20,
    topicEvidence: 16,
    subsectionItems: 3,
    executiveFacts: 8,
    keyPoints: 8,
    decisions: 6,
    risks: 5,
    openItems: 16,
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
    matcher: /(ci\/cd|cicd|pipeline|admin api|automation|gitops|deck|declarative configuration|configuration as code|promotion|maker|checker|gitlab)/i,
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
    matcher: /(performance test|load test|throughput|rps|requests per second|tps|transactions per second|high availability|benchmark|payload size|virtual cpu|vcpu|cpu utilization|capacity test)/i,
    overview: 'The performance discussion covered latency, throughput, test results, payload handling and infrastructure sizing considerations.',
  },
  {
    id: 'transformation',
    title: 'API Transformation & Custom Extensions',
    matcher: /(data kit|soap to rest|rest to soap|xml to json|json to xml|transform|transformation|payload transformation)/i,
    overview: 'The transformation discussion compared native capabilities, Data Kit and custom plugins for cases requiring more specialized processing.',
  },
  {
    id: 'network-security',
    title: 'Network & Transport Security',
    matcher: /(tls|mtls|waf|load balancer|x-forwarded-for|proxy protocol|certificate|firewall|network flow|source ip|client ip)/i,
    overview: 'The network-security discussion covered TLS termination, client-IP propagation, certificates and the placement of security controls around Kong.',
  },
  {
    id: 'migration',
    title: 'Migration & Platform Transition',
    matcher: /(migration|migrate|3scale|layer7|keycloak migration|product repository generator|repository generator|existing development lifecycle|migration automation)/i,
    overview: 'The migration discussion covered source-platform artifacts, account migration, routing behavior and how existing delivery automation can be preserved during the transition to Kong.',
  },
  {
    id: 'licensing',
    title: 'Licensing & Environment Counting',
    matcher: /(licens(?:e|ing)|service counting|api counting|counted across environments|production vs pre-production|commercial model)/i,
    overview: 'The commercial clarification discussion covered how environments and deployed services or APIs may be counted for licensing purposes.',
  },
  {
    id: 'deployment',
    title: 'Deployment, Environments & Resilience',
    matcher: /(dev environment|uat|pre-prod|preprod|production environment|prod environment|drc|disaster recovery|active passive|active-active|failover|rollback|openshift|kubernetes)/i,
    overview: 'The deployment discussion covered environment separation, promotion, resilience and operational behavior across production and recovery environments.',
  },
];

const REQUIREMENT_CUES = /(\brequirement\b|we need(?: to)?|we want(?: to)?|we would like(?: to)?|we require(?: to)?|\bmust\b|looking to|calls for|use case|mandatory|istiyor|gerekiyor|gerekli|zorunlu)/i;
const CURRENT_STATE_CUES = /(currently|current implementation|right now|today we|we currently|we use|we have|we are running|existing|in our environment|our integration|mevcut|şu anda|kullanıyoruz|çalışıyor|entegrasyonumuz)/i;
const ASSESSMENT_CUES = /(anti-pattern|antipattern|out of the box|native plugin|supported|not supported|not available|limitation|issue|problem|concern|desteklen|sınırlama|uygun değil)/i;
const RECOMMENDATION_CUES = /(recommend|recommended|recommendation|better approach|cleaner approach|preferred approach|best practice|probably be better|would be better|önerilen yaklaşım|daha iyi yaklaşım)/i;
const OPTION_CUES = /(option|approach|alternative|another way|can use|could use|can be built|custom plugin|native plugin|ci\/cd|admin api|either|one way|possible solution|seçenek|alternatif|yaklaşım)/i;
const DECISION_CUES = /(we agreed(?: that| to)?|agreed(?: that| to)|we decided(?: that| to)?|the decision (?:is|was)|decision was made|karar verdik|kararlaştırdık|mutabık kaldık)/i;
const RISK_CUES = /(risk|single point of failure|outage|dependency|concern|bottleneck|anti-pattern|antipattern|uncontrolled|constraint|limitation|riskli|bağımlılık|kısıt|sınırlama)/i;
const OPEN_CUES = /(follow[- ]?up|action item|outstanding|open item|\bpending\b|need to confirm|need to check (?:this|that|whether|if)|will check|we will check|come back to you|get back to you|provide you with the answer|need to clarify|roadmap.{0,40}(date|timeline|when|availability)|timeline.{0,40}(confirm|provide|share|roadmap)|availability date|to be confirmed|\btbd\b|share the details|share details|aksiyon|teyit|netleştir|kontrol edip|geri döne|açık konu)/i;
const DEMO_CUES = /(demo|demonstrat|showed|shown|walked through|walkthrough|tested|configured|implemented|created|deployed|reviewed|presented|göster|test ett|konfigüre|uygula|devreye al)/i;

interface EvidenceItem {
  sourceType: 'transcript' | 'meeting-note';
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

interface DraftConflict {
  id: string;
  topicId: string;
  topicTitle: string;
  summary: string;
  positiveHits: SearchHit[];
  negativeHits: SearchHit[];
}

interface DraftParagraph {
  text: string;
  references: SearchHit[];
  validation: ClaimValidation;
}

interface DraftBullet {
  text: string;
  references: SearchHit[];
  validation: ClaimValidation;
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

interface ClaimAuditState {
  candidateClaims: number;
  includedClaims: number;
  omittedClaims: number;
  reviewNeededClaims: number;
  confirmedClaims: number;
  supportedClaims: number;
  ambiguousClaims: number;
  conflictingClaims: number;
  unsupportedClaims: number;
}

function emptyClaimAudit(): ClaimAuditState {
  return {
    candidateClaims: 0,
    includedClaims: 0,
    omittedClaims: 0,
    reviewNeededClaims: 0,
    confirmedClaims: 0,
    supportedClaims: 0,
    ambiguousClaims: 0,
    conflictingClaims: 0,
    unsupportedClaims: 0,
  };
}

let claimAudit: ClaimAuditState = emptyClaimAudit();
let reviewQueueDraft: Array<DraftParagraph | DraftBullet> = [];

export function generateMeetingReport(
  project: Project,
  mode: SummaryMode,
  selectedDocumentIds: string[] = [],
): MeetingReport {
  claimAudit = emptyClaimAudit();
  reviewQueueDraft = [];
  const config = MODE_CONFIG[mode];
  const documents = resolveDocuments(project, selectedDocumentIds);
  const meetingNotes = mode === 'general' ? [] : resolveMeetingNotes(project);
  const evidence = [
    ...collectEvidence(documents),
    ...collectMeetingNoteEvidence(meetingNotes),
  ];
  const detectedTopicGroups = buildTopicGroups(evidence).filter((group) =>
    group.items.length >= 2 || group.items.some((item) => item.sourceType === 'meeting-note'),
  );
  const topicGroups = selectTopicGroups(detectedTopicGroups, config.maxTopics);
  const draftConflicts = detectTopicConflicts(detectedTopicGroups);
  claimAudit.conflictingClaims = draftConflicts.length;

  const curatedNoteEvidence = evidence.filter((item) => item.sourceType === 'meeting-note' && (
    item.kinds.has('requirement')
    || item.kinds.has('current-state')
    || item.kinds.has('recommendation')
    || item.kinds.has('decision')
    || item.kinds.has('open-item')
  ));
  const allSelectedEvidence = uniqueEvidence(
    [...topicGroups.flatMap((group) => group.items), ...curatedNoteEvidence],
    mode === 'report' ? 240 : mode === 'detailed' ? 150 : 70,
  );

  const decisions = pickByKind(allSelectedEvidence, 'decision', config.decisions);
  const risks = pickByKind(allSelectedEvidence, 'risk', config.risks);
  const openItems = pickByKind(allSelectedEvidence, 'open-item', config.openItems);
  const keyEvidence = uniqueEvidence(
    [
      ...pickByKind(allSelectedEvidence, 'requirement', config.keyPoints),
      ...pickByKind(allSelectedEvidence, 'assessment', config.keyPoints),
      ...pickByKind(allSelectedEvidence, 'recommendation', config.keyPoints),
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
      bullets: uniqueEvidence([
        ...pickByKind(allSelectedEvidence, 'recommendation', config.keyPoints),
        ...decisions,
        ...openItems,
      ], config.keyPoints).map((item) => evidenceToBullet(item, bestKind(item))),
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
        title: mode === 'report' ? 'Outstanding Items & Next Steps' : 'Outstanding Questions & Follow-up Actions',
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
        bullets: uniqueEvidence([
          ...pickByKind(allSelectedEvidence, 'recommendation', config.keyPoints),
          ...decisions,
          ...openItems,
          ...pickByKind(allSelectedEvidence, 'assessment', config.keyPoints),
        ], config.keyPoints).map((item) => evidenceToBullet(item, bestKind(item))),
      });
    }
  }

  const strictSections = filterReviewNeededDraft(sections);
  const segmentCount = documents.reduce((sum, document) => sum + document.transcript.segments.length, 0);
  return finalizeReport(
    project.name,
    mode,
    documents.length,
    segmentCount,
    meetingNotes.length,
    documents.map((document) => document.id),
    meetingNotes.map((note) => note.id),
    strictSections,
    keyEvidence.map((item) => evidenceToBullet(item, bestKind(item))),
    decisions.map((item) => evidenceToBullet(item, 'decision')),
    openItems.map((item) => evidenceToBullet(item, 'open-item')),
    claimAudit,
    detectedTopicGroups,
    topicGroups,
    draftConflicts,
  );
}

function resolveDocuments(project: Project, selectedDocumentIds: string[]): TranscriptDocument[] {
  const sources = project.documents.filter((document) => document.kind === 'source');
  if (!selectedDocumentIds.length) return sources;
  const selected = new Set(selectedDocumentIds);
  const scoped = sources.filter((document) => selected.has(document.id));
  return scoped.length ? scoped : sources;
}

function resolveMeetingNotes(project: Project): MeetingNoteDocument[] {
  return (project.meetingNotes ?? []).filter((note) => note.includeInReports !== false);
}

function collectEvidence(documents: TranscriptDocument[]): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  for (const document of documents) {
    const segments = document.transcript.segments;
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index];
      const raw = cleanText(segment.text);
      if (!isUsefulSegment(raw)) continue;

      const sentences = splitSentences(raw);
      for (const sentence of sentences) {
        const focused = normalizeTranscriptText(sentence);
        if (!isUsefulFindingText(focused)) continue;

        const kinds = classifyKinds(focused);
        const topicMatchCount = TOPIC_RULES.reduce((sum, rule) => sum + (rule.matcher.test(focused) ? 1 : 0), 0);
        if (!kinds.size && topicMatchCount === 0) continue;

        // Avoid generic meeting-management sentences that happen to contain "need", "check", etc.
        if (isMeetingMetaSentence(focused) && !OPEN_CUES.test(focused)) continue;
        if (/(anything else that is open beyond|only thing (?:you are )?still needed|only thing pending)/i.test(focused)) {
          kinds.add('open-item');
          kinds.delete('requirement');
        }
        if (kinds.has('requirement') && isTrivialRequirement(focused)) kinds.delete('requirement');
        if (kinds.has('open-item') && isTrivialOpenItem(focused)) kinds.delete('open-item');
        if (!kinds.size && topicMatchCount === 0) continue;

        const score = evidenceScore(segment, focused, kinds, topicMatchCount);
        items.push({
          sourceType: 'transcript',
          segment,
          index,
          context: focused,
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
            context: focused,
            sourceType: 'transcript',
          },
        });
      }
    }
  }

  return items;
}

function collectMeetingNoteEvidence(notes: MeetingNoteDocument[]): EvidenceItem[] {
  const items: EvidenceItem[] = [];

  for (const note of notes) {
    for (const block of note.blocks) {
      const sourceSection = meetingNoteSectionLabel(block);
      const raw = cleanText(block.text);
      if (!raw) continue;

      for (const sentence of splitMeetingNoteSentences(raw)) {
        const focused = normalizeTranscriptText(sentence);
        if (!isUsefulFindingText(focused)) continue;

        const kinds = classifyNoteKinds(focused, sourceSection);
        const topicContext = `${sourceSection} ${focused}`.trim();
        const topicMatchCount = TOPIC_RULES.reduce((sum, rule) => sum + (rule.matcher.test(topicContext) ? 1 : 0), 0);
        if (!kinds.size && topicMatchCount === 0) continue;
        if (!kinds.size) kinds.add('evidence');

        const segment: TranscriptSegment = {
          id: block.id,
          sequence_id: block.order + 1,
          text: raw,
          display_time: note.date ?? 'Meeting note',
          audio_start_time: 0,
          audio_end_time: 0,
          duration: 0,
          confidence: 1,
        };
        const score = evidenceScore(segment, focused, kinds, topicMatchCount) + 0.45;

        items.push({
          sourceType: 'meeting-note',
          segment,
          index: block.order,
          context: focused,
          score,
          kinds,
          hit: {
            documentId: note.id,
            documentName: note.name,
            segmentId: block.id,
            sequenceId: block.order + 1,
            displayTime: note.date ?? 'Meeting note',
            confidence: 1,
            score,
            text: raw,
            context: focused,
            sourceType: 'meeting-note',
            sourceSection: sourceSection || undefined,
            sourceDate: note.date,
          },
        });
      }
    }
  }

  return items;
}

function splitMeetingNoteSentences(value: string): string[] {
  const placeholders: Array<[RegExp, string]> = [
    [/\bvs\./gi, 'vs<dot>'],
    [/\be\.g\./gi, 'e<dot>g<dot>'],
    [/\bi\.e\./gi, 'i<dot>e<dot>'],
    [/\betc\./gi, 'etc<dot>'],
  ];
  let protectedText = value;
  for (const [pattern, replacement] of placeholders) protectedText = protectedText.replace(pattern, replacement);
  return splitSentences(protectedText).map((sentence) => sentence.replace(/<dot>/g, '.'));
}

function classifyNoteKinds(value: string, sourceSection: string): Set<FindingKind> {
  const kinds = classifyKinds(value);
  const path = sourceSection.toLocaleLowerCase('en-US');
  kinds.add('evidence');

  if (/(open items?|outstanding|follow[- ]?up|required actions?)/i.test(path)) kinds.add('open-item');
  if (/(current architecture|current state|existing .*lifecycle|existing development lifecycle)/i.test(path)) kinds.add('current-state');
  if (/requirements?/i.test(path)) kinds.add('requirement');

  if (/thy confirmations?/i.test(path) && /\bTHY confirmed\b/i.test(value)) {
    if (/\b(currently|current|use|uses|manages|has|have)\b/i.test(value)) kinds.add('current-state');
    if (/\b(satisf(?:y|ies|ied)|meets?|accepted|approved|will use|will proceed)\b/i.test(value)) kinds.add('decision');
  }

  if (/\bKong (confirmed|explained|clarified|demonstrated|presented|stated|indicated|referenced)\b/i.test(value)) kinds.add('assessment');
  if (/\bTHY (asked|requested|would like|requires?|needs?)\b/i.test(value)) kinds.add('requirement');
  if (/\bTHY (stated|explained|mentioned|currently|uses?|manages?)\b/i.test(value)) kinds.add('current-state');

  return kinds;
}

function classifyKinds(value: string): Set<FindingKind> {
  const kinds = new Set<FindingKind>();
  if (REQUIREMENT_CUES.test(value)) kinds.add('requirement');
  if (CURRENT_STATE_CUES.test(value)) kinds.add('current-state');
  if (ASSESSMENT_CUES.test(value)) kinds.add('assessment');
  if (RECOMMENDATION_CUES.test(value)) kinds.add('recommendation');
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
  if (RECOMMENDATION_CUES.test(context)) score += 0.35;
  if (/(we want|we need|current implementation|recommended|custom plugin|native plugin|ci\/cd|admin api|roadmap|not supported|not available)/i.test(context)) score += 0.45;
  return score;
}

function buildTopicGroups(evidence: EvidenceItem[]): TopicEvidence[] {
  return TOPIC_RULES.map((rule) => ({
    rule,
    items: uniqueEvidence(
      evidence.filter((item) => rule.matcher.test(`${item.hit.sourceSection ?? ''} ${item.context}`) && item.context.length >= 20),
      60,
    ),
  }));
}


const POSITIVE_CAPABILITY_CUES = /\b(supported|available|we can|can be|able to|out[- ]of[- ]the[- ]box|already available|is possible|can support)\b/i;
const NEGATIVE_CAPABILITY_CUES = /\b(not supported|not available|cannot|can't|does not support|doesn't support|not yet|will be available soon|roadmap|future release)\b/i;

const CAPABILITY_FACETS: Array<{ id: string; matcher: RegExp }> = [
  { id: 'rate-limiting', matcher: /\brate limit(?:ing)?\b|\bthrottl/i },
  { id: 'authentication', matcher: /\bauthentication\b|\bauthorization\b|\boidc\b|\boauth\b|\bmtls\b/i },
  { id: 'developer-portal', matcher: /\bdeveloper portal\b|\bportal onboarding\b/i },
  { id: 'async-onboarding', matcher: /\basync api\b|\basyncapi\b|\bonboarding\b/i },
  { id: 'masking', matcher: /\bmask(?:ing)?\b|\bsensitive data\b/i },
  { id: 'filtering', matcher: /\bfilter(?:ing)?\b|\bclient identity\b/i },
  { id: 'ip-restriction', matcher: /\bip restriction\b|\bwhitelist\b|\bcidr\b/i },
  { id: 'acl', matcher: /\bacl\b|\baccess control\b/i },
  { id: 'redis', matcher: /\bredis\b|\bhazelcast\b|\bin-memory\b/i },
  { id: 'vault', matcher: /\bvault\b|\bbeyondtrust\b/i },
  { id: 'transformation', matcher: /\bdata kit\b|\btransform(?:ation)?\b|\bsoap\b|\bxml\b/i },
  { id: 'observability', matcher: /\bobservability\b|\bdebugger\b|\banalytics\b|\bmetrics\b/i },
  { id: 'tls', matcher: /\btls\b|\bmtls\b|\bcertificate\b/i },
];

function detectTopicConflicts(groups: TopicEvidence[]): DraftConflict[] {
  const conflicts: DraftConflict[] = [];
  for (const group of groups) {
    for (const facet of CAPABILITY_FACETS) {
      const facetItems = group.items.filter((item) => facet.matcher.test(item.context));
      const positive = facetItems.filter((item) => POSITIVE_CAPABILITY_CUES.test(item.context) && !NEGATIVE_CAPABILITY_CUES.test(item.context));
      const negative = facetItems.filter((item) => NEGATIVE_CAPABILITY_CUES.test(item.context));
      if (!positive.length || !negative.length) continue;

      const positiveHits = uniqueHits(positive.slice(0, 3).map((item) => item.hit));
      const negativeHits = uniqueHits(negative.slice(0, 3).map((item) => item.hit));
      conflicts.push({
        id: `conflict-${group.rule.id}-${facet.id}`,
        topicId: group.rule.id,
        topicTitle: group.rule.title,
        summary: `Potentially conflicting statements were detected for the ${facet.id.replace(/-/g, ' ')} capability within ${group.rule.title}. Review the linked evidence before treating the capability status as final.`,
        positiveHits,
        negativeHits,
      });
    }
  }
  return conflicts;
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
      text: `The selected sessions focused on ${joinNaturalList(topicTitles)}. This report consolidates the principal requirements, current-state observations, implementation considerations, recommendations, confirmed decisions and outstanding items identified across those discussions.`,
      references: overviewRefs,
      validation: { status: 'supported', score: 0.8, evidenceCount: overviewRefs.length, attribution: { party: 'unknown', confidence: 'unknown' } },
    });
  }

  const executiveFacts = uniqueEvidence([...decisions, ...openItems, ...keyEvidence.filter((item) => item.kinds.has('recommendation'))], factLimit);
  const statementItems = executiveFacts
    .filter((item) => validateEvidenceClaim(item, bestKind(item), factSentence(item, bestKind(item))).status === 'confirmed' || validateEvidenceClaim(item, bestKind(item), factSentence(item, bestKind(item))).status === 'supported')
    .slice(0, mode === 'report' ? 5 : mode === 'detailed' ? 4 : 2);
  const statements = statementItems.map((item) => factSentence(item, bestKind(item))).filter(Boolean);
  if (statements.length || openItems.length) {
    const text = [
      ...statements,
      openItems.length ? 'Several items remained open for confirmation, additional implementation detail or roadmap clarification.' : '',
    ].filter(Boolean).join(' ');
    paragraphs.push({
      text,
      references: uniqueHits(statementItems.map((item) => item.hit)),
      validation: statementItems.length ? aggregateValidation(statementItems, 'evidence') : { status: 'supported', score: 0.75, evidenceCount: openItems.length, attribution: { party: 'unknown', confidence: 'unknown' } },
    });
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
      validation: aggregateValidation(group.items.slice(0, 2), 'evidence'),
    })),
  };
}

function buildTopicSection(group: TopicEvidence, mode: SummaryMode, config: ModeConfig): DraftSection | null {
  const items = uniqueEvidence(group.items, Math.max(config.topicEvidence, 50));
  if (items.length < 2) return null;

  const requirementItems = selectTopicKind(items, ['requirement', 'current-state'], config.subsectionItems);
  const assessmentItems = selectTopicKind(excludeEvidence(items, requirementItems), ['assessment', 'risk'], config.subsectionItems);
  const recommendationItems = selectTopicKind(excludeEvidence(items, [...requirementItems, ...assessmentItems]), ['recommendation'], config.subsectionItems);
  const optionItems = selectTopicKind(excludeEvidence(items, [...requirementItems, ...assessmentItems, ...recommendationItems]), ['options', 'evidence'], config.subsectionItems);
  const decisionItems = selectTopicKind(excludeEvidence(items, [...requirementItems, ...assessmentItems, ...recommendationItems, ...optionItems]), ['decision'], config.subsectionItems);
  const openItems = selectTopicKind(excludeEvidence(items, [...requirementItems, ...assessmentItems, ...recommendationItems, ...optionItems, ...decisionItems]), ['open-item'], config.subsectionItems);

  const overviewEvidence = uniqueEvidence([
    ...requirementItems.slice(0, 2),
    ...assessmentItems.slice(0, 2),
    ...recommendationItems.slice(0, 2),
    ...optionItems.slice(0, 2),
    ...decisionItems.slice(0, 1),
    ...openItems.slice(0, 1),
  ], mode === 'report' ? 8 : 5);

  const overviewParagraphs: DraftParagraph[] = [{
    text: buildTopicOverview(group.rule, requirementItems, assessmentItems, recommendationItems, optionItems, decisionItems, openItems),
    references: uniqueHits(overviewEvidence.map((item) => item.hit)),
    validation: aggregateValidation(overviewEvidence, 'evidence'),
  }];

  const subsections: DraftSubsection[] = [];
  pushSubsection(subsections, 'requirement-current', 'Requirement & Current State', 'requirement', requirementItems, 'requirement');
  pushSubsection(subsections, 'assessment', 'Assessment & Considerations', 'assessment', assessmentItems, 'assessment');
  pushSubsection(subsections, 'recommendations', 'Recommendations / Preferred Approach', 'recommendation', recommendationItems, 'recommendation');
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
  recommendations: EvidenceItem[],
  options: EvidenceItem[],
  decisions: EvidenceItem[],
  openItems: EvidenceItem[],
): string {
  const parts = [rule.overview];

  const appendValidated = (item: EvidenceItem | undefined, kind: FindingKind) => {
    if (!item) return;
    const text = factSentence(item, kind);
    if (isExternallySafeValidation(validateEvidenceClaim(item, kind, text)) && text) parts.push(text);
  };

  const requirement = requirements[0];
  appendValidated(requirement, requirement?.kinds.has('requirement') ? 'requirement' : 'current-state');
  const assessment = assessments[0];
  appendValidated(assessment, assessment?.kinds.has('risk') ? 'risk' : 'assessment');
  appendValidated(recommendations[0], 'recommendation');
  const option = options[0];
  appendValidated(option, option?.kinds.has('options') ? 'options' : 'evidence');
  appendValidated(decisions[0], 'decision');
  if (openItems.length) parts.push('At least one point in this area remained open for confirmation or further detail.');

  return parts.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function buildCrossCuttingParagraph(items: EvidenceItem[], kind: FindingKind): DraftParagraph {
  const selected = uniqueEvidence(items, 5);
  return {
    text: `Several cross-cutting considerations affect the target architecture beyond any single feature area. ${selected.map((item) => factSentence(item, kind)).join(' ')}`,
    references: uniqueHits(selected.map((item) => item.hit)),
    validation: aggregateValidation(selected, kind),
  };
}

function buildNextStepsParagraph(items: EvidenceItem[]): DraftParagraph {
  const selected = uniqueEvidence(items, 6);
  return {
    text: 'The next steps are the unresolved follow-up items captured below, including the remaining confirmations, implementation details and roadmap dependencies explicitly raised during the selected sessions.',
    references: uniqueHits(selected.map((item) => item.hit)),
    validation: aggregateValidation(selected, 'open-item'),
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
    if (/(latency|single point of failure|outage|dependency|not supported|not available)/i.test(value)) score += 2.5;
  }
  if (kinds.includes('recommendation')) {
    if (RECOMMENDATION_CUES.test(value)) score += 4.2;
  }
  if (kinds.includes('options') || kinds.includes('evidence')) {
    if (/(custom plugin|ci\/cd|admin api|source-controlled)/i.test(value)) score += 5;
    if (/(native plugin|out-of-the-box|standard .*plugin|alternative|option)/i.test(value)) score += 2.7;
  }
  if (kinds.includes('decision')) {
    if (DECISION_CUES.test(value)) score += 5;
    else score -= 6;
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
  claimAudit.candidateClaims += 1;
  const text = factSentence(item, kind);
  const validation = validateEvidenceClaim(item, kind, text);
  recordValidation(validation);
  return { text, references: [item.hit], validation };
}

function recordValidation(validation: ClaimValidation): void {
  if (validation.status === 'confirmed') {
    claimAudit.confirmedClaims += 1;
    claimAudit.includedClaims += 1;
    return;
  }
  if (validation.status === 'supported') {
    claimAudit.supportedClaims += 1;
    claimAudit.includedClaims += 1;
    return;
  }
  claimAudit.reviewNeededClaims += 1;
  if (validation.status === 'ambiguous') claimAudit.ambiguousClaims += 1;
  if (validation.status === 'conflicting') claimAudit.conflictingClaims += 1;
  if (validation.status === 'unsupported') claimAudit.unsupportedClaims += 1;
}

function extractFindingClause(value: string, kind: FindingKind): string {
  const text = normalizeTranscriptText(value);
  if (!text) return '';
  const cue = kindMatcher(kind);
  const clauses = text
    .split(/(?:;|\s+and then\s+|\s+but then\s+|\s+however\s+|\s+so then\s+)/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const matched = clauses.find((part) => cue.test(part));
  const chosen = matched ?? text;
  const words = chosen.split(/\s+/).filter(Boolean);
  if (words.length > 60) return '';
  return chosen;
}

function factSentence(item: EvidenceItem, kind: FindingKind): string {
  if (!isUsefulFindingText(item.context) || isMeetingMetaSentence(item.context)) return '';
  const known = normalizeKnownTechnicalFact(item, kind);
  if (known) return known;
  const focusedClause = item.sourceType === 'meeting-note' ? item.context : extractFindingClause(item.context, kind);
  if (!focusedClause) return '';
  const sentence = item.sourceType === 'meeting-note' ? focusedClause : bestSentence(focusedClause, kind);
  const cleaned = stripConversationalLead(sentence);
  const body = sentenceCase(trimSentence(cleaned, 190));
  if (!body) return '';
  if (item.sourceType === 'meeting-note') return ensurePeriod(body);

  const lower = /^[A-Z]{2}/.test(body) ? body : body.charAt(0).toLocaleLowerCase('en-US') + body.slice(1);
  const alreadyReported = /^(The |A |An |Kong |THY |Konnect |Developer Portal|Event Gateway|Redis|Hazelcast|CIDR|ACL|OIDC|OAuth)/.test(body);

  switch (kind) {
    case 'requirement':
      if (/^(we|they) (need|want|wanted|would like|require)/i.test(body)) {
        return ensurePeriod(`The requirement discussed is to ${body.replace(/^(we|they) (need|want|wanted|would like|require)(?: to)?\s+/i, '')}`);
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
    case 'recommendation':
      if (/^(we|you|they) (recommend|prefer)\s+/i.test(body)) return ensurePeriod(`The recommended direction is to ${body.replace(/^(we|you|they) (recommend|prefer)(?: to)?\s+/i, '')}`);
      return ensurePeriod(alreadyReported ? body : `The recommendation discussed is that ${lower}`);
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


function inferAttribution(item: EvidenceItem, kind: FindingKind): ReportAttributionInfo {
  const evidence = normalizeTranscriptText(item.context);
  const sourceSection = item.hit.sourceSection ?? '';
  const combined = `${sourceSection} ${evidence}`;

  if (item.sourceType === 'meeting-note') {
    if (/required actions?.*\bkong\b/i.test(sourceSection)) {
      return { party: 'kong', confidence: 'explicit', reason: 'The meeting-note action is explicitly grouped under Kong.' };
    }
    if (/required actions?.*\bthy\b/i.test(sourceSection)) {
      return { party: 'customer', confidence: 'explicit', reason: 'The meeting-note action is explicitly grouped under THY.' };
    }
    if ((kind === 'assessment' || kind === 'recommendation' || kind === 'options' || kind === 'evidence')
      && /\bKong (confirmed|explained|clarified|demonstrated|presented|stated|indicated|referenced)\b/i.test(evidence)) {
      return { party: 'kong', confidence: 'explicit', reason: 'The meeting note explicitly attributes the statement to Kong.' };
    }
    if (/\bTHY (confirmed|asked|requested|stated|explained|mentioned|would like|requires?|needs?)\b/i.test(evidence)
      || /\bTHY\b/i.test(sourceSection)) {
      return { party: 'customer', confidence: 'explicit', reason: 'The meeting note explicitly attributes the statement or section to THY.' };
    }
    if (kind !== 'open-item' && /\bKong\b/i.test(combined)) {
      return { party: 'kong', confidence: 'explicit', reason: 'The meeting note explicitly identifies Kong.' };
    }
    if (kind === 'open-item') {
      return { party: 'unknown', confidence: 'unknown', reason: 'The meeting note lists the item as open but does not explicitly assign an owner.' };
    }
  }

  if (/\b(THY|Turkish Airlines)\b/i.test(evidence)) {
    return { party: 'customer', confidence: 'explicit', reason: 'Customer name is explicitly present in the linked evidence.' };
  }
  if (/\bKong\b/i.test(evidence)) {
    return { party: 'kong', confidence: 'explicit', reason: 'Kong is explicitly named in the linked evidence.' };
  }
  if (kind === 'decision' && /\bwe agreed\b|\bagreed that\b|\bagreed to\b/i.test(evidence)) {
    return { party: 'joint', confidence: 'explicit', reason: 'The evidence contains explicit agreement language.' };
  }
  if ((kind === 'requirement' || kind === 'current-state') && /\b(we|our)\b/i.test(evidence)) {
    return { party: 'customer', confidence: 'inferred', reason: 'First-person requirement/current-state wording suggests the customer side, but the speaker is not explicitly identified.' };
  }
  if ((kind === 'recommendation' || kind === 'assessment' || kind === 'options') && /\b(recommend|better approach|native plugin|out of the box|supported|not supported)\b/i.test(evidence)) {
    return { party: 'kong', confidence: 'inferred', reason: 'Product/recommendation wording suggests the Kong side, but the speaker is not explicitly identified.' };
  }
  return { party: 'unknown', confidence: 'unknown' };
}

function validateEvidenceClaim(item: EvidenceItem, kind: FindingKind, text: string): ClaimValidation {
  const evidence = normalizeTranscriptText(item.context);
  const attribution = inferAttribution(item, kind);
  if (!text || !isUsefulFindingText(evidence) || looksLikeFragment(text) || isMeetingMetaSentence(evidence)) {
    return { status: 'unsupported', score: 0.1, evidenceCount: 1, reason: 'Fragmentary, low-quality or meeting-management text.', attribution };
  }
  const quality = findingQualityScore(evidence, kind);
  if (quality < 0.5) {
    return { status: 'ambiguous', score: quality, evidenceCount: 1, reason: 'The transcript wording is too conversational, ambiguous or noisy for automatic external-report use.', attribution };
  }

  const cue = kindMatcher(kind);
  const explicitKindCue = cue.test(evidence) || (item.sourceType === 'meeting-note' && item.kinds.has(kind));
  const normalizedKnown = normalizeKnownTechnicalFact(item, kind);
  const knownMatch = !!normalizedKnown && normalizedKnown === text;
  let score = (kind === 'evidence' ? 0.56 : 0.24) + quality * 0.18;
  if (knownMatch) score += 0.28;
  if (kind === 'evidence' || explicitKindCue) score += 0.42;
  if (item.sourceType === 'meeting-note') score += 0.08;
  if (item.segment.confidence >= 0.75) score += 0.12;
  else if (item.segment.confidence < 0.45) score -= 0.18;
  if (text.length >= 35) score += 0.06;

  if (kind !== 'evidence' && !explicitKindCue && !knownMatch) {
    return { status: 'unsupported', score: Math.max(0, score - 0.3), evidenceCount: 1, reason: `No explicit ${kind} cue in the linked evidence.`, attribution };
  }
  if (kind === 'decision' && !DECISION_CUES.test(evidence) && !(item.sourceType === 'meeting-note' && item.kinds.has('decision')) && !knownMatch) {
    return { status: 'unsupported', score: 0.1, evidenceCount: 1, reason: 'No explicit decision/agreement cue in the linked evidence.', attribution };
  }
  if (kind === 'recommendation' && !RECOMMENDATION_CUES.test(evidence) && !(item.sourceType === 'meeting-note' && item.kinds.has('recommendation')) && !knownMatch) {
    return { status: 'unsupported', score: 0.1, evidenceCount: 1, reason: 'No explicit recommendation/preference cue in the linked evidence.', attribution };
  }

  if (kind === 'decision' && score >= 0.68) {
    return { status: 'confirmed', score: Math.min(1, score), evidenceCount: 1, attribution };
  }
  return score >= 0.68
    ? { status: 'supported', score: Math.min(1, score), evidenceCount: 1, attribution }
    : { status: 'ambiguous', score: Math.max(0, score), evidenceCount: 1, reason: 'The evidence is not strong enough for automatic external inclusion.', attribution };
}

function aggregateValidation(items: EvidenceItem[], kind: FindingKind): ClaimValidation {
  if (!items.length) return { status: 'unsupported', score: 0, evidenceCount: 0, reason: 'No linked evidence.', attribution: { party: 'unknown', confidence: 'unknown' } };
  if (kind === 'evidence') {
    const good = items.filter((item) => isUsefulFindingText(item.context) && !isMeetingMetaSentence(item.context));
    const score = good.length / items.length;
    return good.length
      ? { status: 'supported', score: Math.max(0.72, score), evidenceCount: good.length, attribution: { party: 'unknown', confidence: 'unknown' } }
      : { status: 'unsupported', score: 0.2, evidenceCount: items.length, reason: 'No sufficiently clean evidence.', attribution: { party: 'unknown', confidence: 'unknown' } };
  }
  const validations = items.map((item) => validateEvidenceClaim(item, kind, factSentence(item, kind)));
  const good = validations.filter((item) => item.status === 'confirmed' || item.status === 'supported');
  const average = validations.reduce((sum, item) => sum + item.score, 0) / validations.length;
  const explicitParties = validations.map((v) => v.attribution).filter((a): a is ReportAttributionInfo => !!a && a.confidence === 'explicit');
  const attribution = explicitParties[0] ?? validations.find((v) => v.attribution)?.attribution ?? { party: 'unknown', confidence: 'unknown' as const };
  if (good.length >= Math.ceil(items.length / 2)) {
    return {
      status: kind === 'decision' ? 'confirmed' : 'supported',
      score: Math.min(1, average),
      evidenceCount: good.length,
      attribution,
    };
  }
  return {
    status: 'ambiguous',
    score: Math.max(0, average),
    evidenceCount: items.length,
    reason: 'The combined evidence requires human review.',
    attribution,
  };
}

function isExternallySafeValidation(validation: ClaimValidation): boolean {
  return validation.status === 'confirmed' || validation.status === 'supported';
}

function findingQualityScore(value: string, kind: FindingKind): number {
  const text = normalizeTranscriptText(value);
  const words = text.split(/\s+/).filter(Boolean);
  let score = 0.72;
  if (words.length > 48) score -= 0.18;
  if (/[?]$/.test(text) && kind !== 'open-item') score -= 0.3;
  if (/^(is|are|can|could|do|does|did|what|why|how|when|where)\b/i.test(text) && kind !== 'open-item') score -= 0.28;
  if (/(let'?s say|as you can see|if you recall|you know|so on so forth|so on and so forth|just want to|quick look|for my demonstration|for the demo)/i.test(text)) score -= 0.22;
  if (/\b(yesterday|today)\b/i.test(text) && /(demo|resource|issue|machine)/i.test(text)) score -= 0.18;
  const firstPersonCount = (text.match(/\b(i|we|our|my)\b/gi) ?? []).length;
  if (firstPersonCount >= 5) score -= 0.18;
  const commaCount = (text.match(/,/g) ?? []).length;
  if (commaCount >= 5 && words.length > 35) score -= 0.14;
  if (/\b(this|that) is the first thing\b/i.test(text)) score -= 0.08;
  return Math.max(0, Math.min(1, score));
}

function isUsefulFindingText(value: string): boolean {
  const text = normalizeTranscriptText(value);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length < 5 || words.length > 70) return false;
  if (/[^\u0000-\u024F\u1E00-\u1EFF\s\d.,:;!?()\[\]{}'"/+&%#@=_-]/u.test(text)) return false;
  if (/^(thank|thanks|hello|good morning|good afternoon|okay|ok|yes|yeah|no|sorry)\b/i.test(text) && words.length < 12) return false;
  return true;
}

function isMeetingMetaSentence(value: string): boolean {
  return /(before we start|after the break|take a break|finish the day|how long do you|remaining scenario|move on to the next|go back to our list|overall plan for the week|wanted to show you|i can share all of these|review at your own time|let's see|do you have any question|any questions|thank you|most welcome|for the demo|during the demo|we've asked|we asked .* to show|scenario s\d+|point number)/i.test(value);
}

function isTrivialRequirement(value: string): boolean {
  return /(we need to (check|see|talk|move|start|finish|go back)|we want to (show|see|check|start)|need to check that|need to see why)/i.test(value);
}

function isTrivialOpenItem(value: string): boolean {
  return /(check that and see why|need to check live|let's check|i'll take it|we need to talk about)/i.test(value);
}

function looksLikeFragment(value: string): boolean {
  const text = normalizeTranscriptText(value);
  if (!text) return true;
  if (/\b(and|but|because|which|that|to|with|of|for|from|or)\s*$/i.test(text)) return true;
  if (/^(and|but|because|which|so that)\b/i.test(text) && text.split(/\s+/).length < 10) return true;
  return false;
}

function filterReviewNeededDraft(sections: DraftSection[]): DraftSection[] {
  const keep = (item: DraftParagraph | DraftBullet): boolean => {
    if (isExternallySafeValidation(item.validation)) return true;
    claimAudit.omittedClaims += 1;
    reviewQueueDraft.push(item);
    return false;
  };
  return sections
    .map((section) => ({
      ...section,
      paragraphs: section.paragraphs.filter(keep),
      bullets: section.bullets.filter(keep),
      subsections: section.subsections?.map((subsection) => ({
        ...subsection,
        paragraphs: subsection.paragraphs.filter(keep),
        bullets: subsection.bullets.filter(keep),
      })).filter((subsection) => subsection.paragraphs.length || subsection.bullets.length),
    }))
    .filter((section) => section.paragraphs.length || section.bullets.length || (section.subsections?.length ?? 0) > 0);
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

  if (kind === 'recommendation'
    && /depending on an external source/i.test(value)
    && /(better approach|maintain .*plugin)/i.test(value)) {
    return 'A preferred approach discussed was to avoid runtime dependence on an external source and maintain the native plugin configuration through CI/CD.';
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

  if (kind === 'recommendation'
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

  if (kind === 'open-item' && /masking sensitive data/i.test(value) && /filtering/i.test(value)) {
    return 'Follow-up is required to confirm the supported approaches for masking sensitive event data in transit and filtering event data based on client identity.';
  }

  if (kind === 'open-item' && /(add (?:a |the )?video|video or image|image or video)/i.test(value) && /(openapi|developer portal|api)/i.test(value)) {
    return 'Follow-up is required to confirm the supported approach for adding image or video content to API documentation in the Developer Portal.';
  }

  if (kind === 'open-item' && /(organization|organisational|partner).{0,80}(admin|administrator)/i.test(value) && /(get back|need to think|specific answer)/i.test(value)) {
    return 'Follow-up is required to confirm the delegated organization-administrator model, including whether external administrators can invite and manage their own team members without unrestricted administrative access.';
  }

  if (kind === 'open-item' && /onboarding for async api/i.test(value) && /(dates|information security|data sharing)/i.test(value)) {
    return 'Follow-up is required to provide roadmap timing for Async API onboarding through the Developer Portal and the requested information-security and data-sharing details.';
  }

  if (kind === 'assessment' && /we don'?t manage the authentication of async api through the developer portal/i.test(value)) {
    return 'Async API documentation can be published through the Developer Portal, but authentication for Async API is not currently managed through the Developer Portal.';
  }

  if (kind === 'requirement' && /understand clearly why we need redis/i.test(value)) {
    return 'The requirement is to clarify where Redis is required in the proposed architecture and which use cases depend on it.';
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
  if (kind === 'recommendation') return RECOMMENDATION_CUES;
  if (kind === 'options') return OPTION_CUES;
  if (kind === 'decision') return DECISION_CUES;
  if (kind === 'risk') return RISK_CUES;
  if (kind === 'open-item') return OPEN_CUES;
  return DEMO_CUES;
}

function bestKind(item: EvidenceItem): FindingKind {
  const priority: FindingKind[] = ['decision', 'open-item', 'recommendation', 'requirement', 'current-state', 'assessment', 'options', 'risk', 'evidence'];
  return priority.find((kind) => item.kinds.has(kind)) ?? 'evidence';
}

function stripConversationalLead(value: string): string {
  return value
    .replace(/\bCICV\b/gi, 'CI/CD')
    .replace(/\bCI-CD\b/gi, 'CI/CD')
    .replace(/\bKog\b/g, 'Kong')
    .replace(/(?:\.{2,}|…+)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(okay|ok|yeah|yes|right|so|well|basically|actually|i think|we think|you know|by the way|let me|all right|alright)[,.:;!?\s-]+/i, '')
    .replace(/^(can you|could you|would you|do you|did you|are you|is it|what about)\s+/i, '')
    .replace(/^(and|but|so)\s+/i, '')
    .trim();
}

function sentenceCase(value: string): string {
  if (!value) return value;
  return value.charAt(0).toLocaleUpperCase('en-US') + value.slice(1);
}

function trimSentence(value: string, _max: number): string {
  return normalizeTranscriptText(value);
}

function ensurePeriod(value: string): string {
  const text = value.replace(/\s+/g, ' ').trim().replace(/[?]+$/g, '.');
  if (!text) return '';
  return /[.!]$/.test(text) ? text : `${text}.`;
}

function isUsefulSegment(value: string): boolean {
  if (value.length < 18) return false;
  if (/^(thank you|thanks|bye|bye-bye|hello|okay|ok|yeah|yes|no|uh|um|hmm)[.!?,\s-]*$/i.test(value)) return false;
  const words = value.split(/\s+/).filter(Boolean);
  return words.length >= 4;
}

function splitSentences(value: string): string[] {
  const normalized = normalizeTranscriptText(value);
  return (normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalized])
    .map((part) => part.trim())
    .filter(Boolean);
}

function cleanText(value: string): string {
  return normalizeTranscriptText(value);
}

function normalizeTranscriptText(value: string): string {
  return value
    .replace(/(?:\.{2,}|…+)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  return `${item.hit.documentId}:${item.segment.id}`;
}

function joinNaturalList(values: string[]): string {
  const clean = values.filter(Boolean);
  if (!clean.length) return '';
  if (clean.length === 1) return clean[0];
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return `${clean.slice(0, -1).join(', ')}, and ${clean[clean.length - 1]}`;
}


function ownerFromAttribution(attribution?: ReportAttributionInfo): ReportOpenItem['owner'] {
  if (!attribution || attribution.confidence !== 'explicit') return 'Unassigned';
  if (attribution.party === 'customer') return 'Customer';
  if (attribution.party === 'kong') return 'Kong';
  if (attribution.party === 'joint') return 'Joint';
  return 'Unassigned';
}

function firstSubsectionBullet(section: ReportSection, kind: ReportSubsectionKind): ReportBullet | undefined {
  return section.subsections?.find((subsection) => subsection.kind === kind)?.bullets[0];
}

function allSubsectionReferences(section: ReportSection): number[] {
  return [...new Set([
    ...section.paragraphs.flatMap((paragraph) => paragraph.referenceIds),
    ...section.bullets.flatMap((bullet) => bullet.referenceIds),
    ...(section.subsections ?? []).flatMap((subsection) => [
      ...subsection.paragraphs.flatMap((paragraph) => paragraph.referenceIds),
      ...subsection.bullets.flatMap((bullet) => bullet.referenceIds),
    ]),
  ])];
}

function buildRequirementMatrix(sections: ReportSection[]): RequirementMatrixRow[] {
  return sections
    .filter((section) => section.kind === 'technical')
    .map((section) => {
      const requirement = firstSubsectionBullet(section, 'requirement')
        ?? firstSubsectionBullet(section, 'current-state');
      const currentState = firstSubsectionBullet(section, 'current-state');
      const recommendation = firstSubsectionBullet(section, 'recommendation');
      const assessment = firstSubsectionBullet(section, 'assessment');
      const option = firstSubsectionBullet(section, 'options');
      const decision = firstSubsectionBullet(section, 'decision');
      const open = firstSubsectionBullet(section, 'open-item');

      const status: RequirementMatrixRow['status'] = decision
        ? 'Confirmed'
        : open
          ? 'Open'
          : recommendation
            ? 'Proposed'
            : assessment || option
              ? 'Discussed'
              : 'Identified';

      return {
        topicId: section.id,
        requirement: requirement?.text ?? section.title,
        currentState: currentState?.text,
        position: decision?.text ?? recommendation?.text ?? assessment?.text ?? option?.text,
        status,
        nextAction: open?.text,
        referenceIds: allSubsectionReferences(section),
      };
    });
}

function finalizeReport(
  title: string,
  mode: SummaryMode,
  sourceCount: number,
  segmentCount: number,
  noteSourceCount: number,
  documentIds: string[],
  meetingNoteIds: string[],
  draftSections: DraftSection[],
  keyPoints: DraftBullet[],
  decisions: DraftBullet[],
  openItems: DraftBullet[],
  audit: ClaimAuditState,
  detectedTopicGroups: TopicEvidence[],
  includedTopicGroups: TopicEvidence[],
  draftConflicts: DraftConflict[],
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
          sourceType: hit.sourceType ?? 'transcript',
          sourceSection: hit.sourceSection,
          sourceDate: hit.sourceDate,
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
    validation: paragraph.validation,
  });
  const mapBullet = (bullet: DraftBullet): ReportBullet => ({
    text: bullet.text,
    referenceIds: mapReferences(bullet.references),
    validation: bullet.validation,
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

  const mappedKeyPoints = keyPoints.filter((item) => isExternallySafeValidation(item.validation)).map(mapBullet);
  const mappedDecisions = decisions.filter((item) => isExternallySafeValidation(item.validation)).map(mapBullet);
  const mappedOpenItems = openItems.filter((item) => isExternallySafeValidation(item.validation)).map(mapBullet);

  const conflicts: ReportConflict[] = draftConflicts.map((conflict) => ({
    id: conflict.id,
    topicId: conflict.topicId,
    topicTitle: conflict.topicTitle,
    summary: conflict.summary,
    positiveReferenceIds: mapReferences(conflict.positiveHits),
    negativeReferenceIds: mapReferences(conflict.negativeHits),
  }));

  const coverage: ReportCoverage = {
    detectedTopics: detectedTopicGroups.length,
    includedTopics: includedTopicGroups.length,
    coveragePercent: detectedTopicGroups.length
      ? Math.round((includedTopicGroups.length / detectedTopicGroups.length) * 100)
      : 100,
    uncoveredTopics: detectedTopicGroups
      .filter((group) => !includedTopicGroups.some((included) => included.rule.id === group.rule.id))
      .map((group) => group.rule.title),
    conflicts: conflicts.length,
  };

  const structuredOpenItems: ReportOpenItem[] = mappedOpenItems.map((item) => ({
    text: item.text,
    owner: ownerFromAttribution(item.validation.attribution),
    status: 'Open',
    referenceIds: item.referenceIds,
  }));

  const reviewQueue: ReportReviewItem[] = reviewQueueDraft.map((item) => ({
    text: item.text,
    status: item.validation.status,
    reason: item.validation.reason,
    referenceIds: mapReferences(item.references),
  }));

  const requirementMatrix = buildRequirementMatrix(sections);

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
    noteSourceCount,
    documentIds,
    meetingNoteIds,
    sections,
    keyPoints: mappedKeyPoints,
    decisions: mappedDecisions,
    openItems: mappedOpenItems,
    structuredOpenItems,
    requirementMatrix,
    conflicts,
    coverage,
    reviewQueue,
    references: [...referenceMap.values()].sort((a, b) => a.id - b.id),
    wordCount,
    validation: {
      candidateClaims: audit.candidateClaims,
      includedClaims: audit.includedClaims,
      omittedClaims: audit.omittedClaims,
      reviewNeededClaims: audit.reviewNeededClaims,
      confirmedClaims: audit.confirmedClaims,
      supportedClaims: audit.supportedClaims,
      ambiguousClaims: audit.ambiguousClaims,
      conflictingClaims: audit.conflictingClaims,
      unsupportedClaims: audit.unsupportedClaims,
    },
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
