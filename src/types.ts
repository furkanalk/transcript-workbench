export interface SegmentSource {
  document_id: string;
  document_name: string;
  segment_id: string;
  sequence_id: number;
  display_time: string;
}

export interface TranscriptSegment {
  id: string;
  sequence_id: number;
  text: string;
  display_time: string;
  audio_start_time: number;
  audio_end_time: number;
  duration: number;
  confidence: number;
  _source?: SegmentSource;
  /** Continuous offset inside a generated merged timeline. Kept as metadata only. */
  _merged_offset?: string;
}

export interface TranscriptFile {
  last_updated?: string;
  segments: TranscriptSegment[];
  total_segments?: number;
  version?: string;
  [key: string]: unknown;
}

export type DocumentKind = 'source' | 'merged';

export interface TranscriptDocument {
  id: string;
  name: string;
  kind: DocumentKind;
  createdAt: string;
  transcript: TranscriptFile;
  sourceIds?: string[];
}

export interface Project {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  documents: TranscriptDocument[];
}

export interface WorkspaceState {
  projects: Project[];
  activeProjectId: string | null;
  activeDocumentId: string | null;
}

export interface SearchHit {
  documentId: string;
  documentName: string;
  segmentId: string;
  sequenceId: number;
  displayTime: string;
  confidence: number;
  score: number;
  text: string;
  context: string;
}

export interface SummaryPoint {
  text: string;
  score: number;
  reference: SearchHit;
}

export interface SummaryResult {
  generatedAt: string;
  sourceCount: number;
  segmentCount: number;
  points: SummaryPoint[];
}

export interface DetailedSummarySection {
  documentId: string;
  documentName: string;
  segmentCount: number;
  points: SummaryPoint[];
}

export interface DetailedSummaryResult {
  generatedAt: string;
  sourceCount: number;
  segmentCount: number;
  sections: DetailedSummarySection[];
  followUps: SummaryPoint[];
}

export type NarrativeSummaryKind = 'overview' | 'discussion' | 'decision' | 'follow-up' | 'conclusion';

export interface NarrativeSummaryParagraph {
  kind: NarrativeSummaryKind;
  text: string;
  references: SearchHit[];
}

export interface NarrativeSummaryResult {
  generatedAt: string;
  mode: SummaryMode;
  sourceCount: number;
  segmentCount: number;
  documentIds: string[];
  paragraphs: NarrativeSummaryParagraph[];
}

export type SummaryMode = 'general' | 'detailed' | 'report';
export type SummaryLanguage = 'original' | 'en' | 'tr';
export type ReportSectionKind = 'overview' | 'discussion' | 'technical' | 'decision' | 'risk' | 'follow-up' | 'takeaway';
export type ReportSubsectionKind = 'requirement' | 'current-state' | 'assessment' | 'options' | 'recommendation' | 'decision' | 'risk' | 'open-item' | 'evidence';
export type ClaimValidationStatus = 'confirmed' | 'supported' | 'ambiguous' | 'conflicting' | 'unsupported';
export type ReportAttribution = 'customer' | 'kong' | 'joint' | 'unknown';
export type AttributionConfidence = 'explicit' | 'inferred' | 'unknown';
export type RequirementStatus = 'Confirmed' | 'Proposed' | 'Open' | 'Discussed' | 'Identified';
export type ExportProfile = 'external' | 'internal';

export interface ReportAttributionInfo {
  party: ReportAttribution;
  confidence: AttributionConfidence;
  reason?: string;
}

export interface ReportConflict {
  id: string;
  topicId: string;
  topicTitle: string;
  summary: string;
  positiveReferenceIds: number[];
  negativeReferenceIds: number[];
}

export interface ReportCoverage {
  detectedTopics: number;
  includedTopics: number;
  coveragePercent: number;
  uncoveredTopics: string[];
  conflicts: number;
}

export interface RequirementMatrixRow {
  topicId: string;
  requirement: string;
  currentState?: string;
  position?: string;
  status: RequirementStatus;
  nextAction?: string;
  referenceIds: number[];
}

export interface ReportOpenItem {
  text: string;
  owner: 'Customer' | 'Kong' | 'Joint' | 'Unassigned';
  status: 'Open';
  referenceIds: number[];
}

export interface ReportReviewItem {
  text: string;
  status: ClaimValidationStatus;
  reason?: string;
  referenceIds: number[];
}


export interface ClaimValidation {
  status: ClaimValidationStatus;
  score: number;
  evidenceCount: number;
  reason?: string;
  attribution?: ReportAttributionInfo;
}

export interface ReportValidationSummary {
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


export interface ReportReference {
  id: number;
  documentId: string;
  documentName: string;
  segmentId: string;
  sequenceId: number;
  displayTime: string;
  text: string;
}

export interface ReportParagraph {
  text: string;
  referenceIds: number[];
  validation: ClaimValidation;
}

export interface ReportBullet {
  text: string;
  referenceIds: number[];
  validation: ClaimValidation;
}

export interface ReportSubsection {
  id: string;
  title: string;
  kind: ReportSubsectionKind;
  paragraphs: ReportParagraph[];
  bullets: ReportBullet[];
}

export interface ReportSection {
  id: string;
  title: string;
  kind: ReportSectionKind;
  paragraphs: ReportParagraph[];
  bullets: ReportBullet[];
  subsections?: ReportSubsection[];
}

export interface MeetingReport {
  generatedAt: string;
  title: string;
  mode: SummaryMode;
  language: SummaryLanguage;
  sourceCount: number;
  segmentCount: number;
  documentIds: string[];
  sections: ReportSection[];
  keyPoints: ReportBullet[];
  decisions: ReportBullet[];
  openItems: ReportBullet[];
  structuredOpenItems: ReportOpenItem[];
  requirementMatrix: RequirementMatrixRow[];
  conflicts: ReportConflict[];
  coverage: ReportCoverage;
  reviewQueue: ReportReviewItem[];
  references: ReportReference[];
  wordCount: number;
  validation: ReportValidationSummary;
}

export interface AnswerResult {
  answer: string;
  confidence: 'strong' | 'moderate' | 'weak' | 'not-found';
  references: SearchHit[];
}

export type ViewMode = 'raw' | 'clean';
export type ConfidenceFilter = 'all' | 'review' | 'warning' | 'good';
export type AppTab = 'transcript' | 'summary' | 'ask';
