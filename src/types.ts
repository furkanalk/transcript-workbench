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
}

export interface ReportBullet {
  text: string;
  referenceIds: number[];
}

export interface ReportSection {
  id: string;
  title: string;
  kind: ReportSectionKind;
  paragraphs: ReportParagraph[];
  bullets: ReportBullet[];
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
  references: ReportReference[];
  wordCount: number;
}

export interface AnswerResult {
  answer: string;
  confidence: 'strong' | 'moderate' | 'weak' | 'not-found';
  references: SearchHit[];
}

export type ViewMode = 'raw' | 'clean';
export type ConfidenceFilter = 'all' | 'review' | 'warning' | 'good';
export type AppTab = 'transcript' | 'summary' | 'ask';
