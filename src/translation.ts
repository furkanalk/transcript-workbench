import type { MeetingReport, ReportBullet, ReportParagraph, ReportSection, SummaryLanguage } from './types';

interface TranslatorInstance {
  translate(text: string): Promise<string>;
  destroy?: () => void;
}

interface TranslatorConstructor {
  availability(options: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(options: {
    sourceLanguage: string;
    targetLanguage: string;
    monitor?: (monitor: EventTarget) => void;
  }): Promise<TranslatorInstance>;
}

declare global {
  interface Window {
    Translator?: TranslatorConstructor;
  }
}

const PROTECTED_TERMS = [
  'THY', 'Desoft', 'Kong', 'Konnect', 'Developer Portal', 'Event Gateway', 'Control Plane', 'Data Plane',
  'OIDC', 'OAuth', 'OAuth 2.0', 'ACL', 'CIDR', 'IP Restriction', 'API', 'APIs', 'Admin API',
  'Vault', 'HashiCorp Vault', 'BeyondTrust', 'Redis', 'Hazelcast', 'CI/CD', 'GitOps', 'decK',
  'consumer', 'consumer group', 'plugin', 'route', 'service', 'upstream', 'OpenAPI', 'AsyncAPI',
  'Kafka', 'mTLS', 'TLS', 'WAF', 'SIEM', 'APM', 'JSON', 'REST', 'SOAP', 'HTTP', 'HTTPS',
  'GitLab', 'OpenShift', 'Kubernetes', 'Data Kit', 'KVKK', 'RPS', 'RAM',
].sort((a, b) => b.length - a.length);

const SECTION_TITLES_TR: Record<string, string> = {
  'Executive Summary': 'Yönetici Özeti',
  'Developer Portal & Developer Experience': 'Developer Portal ve Developer Experience',
  'Authentication, Authorization & Credential Flows': 'Kimlik Doğrulama, Yetkilendirme ve Credential Akışları',
  'ACL, CIDR & IP Restriction': 'ACL, CIDR ve IP Restriction',
  'Event Gateway & Async APIs': 'Event Gateway ve Async API’ler',
  'Konnect Architecture, Security & Data Residency': 'Konnect Mimarisi, Güvenlik ve Veri Yerleşimi',
  'Rate Limiting & Traffic Control': 'Rate Limiting ve Trafik Kontrolü',
  'Caching & In-Memory Data': 'Caching ve In-Memory Veri',
  'CI/CD, Automation & Configuration Management': 'CI/CD, Otomasyon ve Konfigürasyon Yönetimi',
  'Observability, Logging & Operations': 'Observability, Logging ve Operasyon',
  'Performance, Testing & Scalability': 'Performans, Test ve Ölçeklenebilirlik',
  'API Transformation & Custom Extensions': 'API Dönüşümü ve Custom Extension’lar',
  'Network & Transport Security': 'Network ve Transport Güvenliği',
  'Additional Technical Discussions': 'Ek Teknik Görüşmeler',
  'Approaches Reviewed': 'Değerlendirilen Yaklaşımlar',
  'Approaches Evaluated & Demonstrated': 'Değerlendirilen ve Demo Edilen Yaklaşımlar',
  'Risks, Constraints & Architectural Considerations': 'Riskler, Kısıtlar ve Mimari Değerlendirmeler',
  'Decisions & Agreed Direction': 'Kararlar ve Mutabık Kalınan Yön',
  'Outstanding Questions & Follow-up Actions': 'Açık Sorular ve Takip Aksiyonları',
  'Key Points': 'Öne Çıkan Noktalar',
  'Key Takeaways': 'Öne Çıkan Sonuçlar',
};

export class TranslationUnavailableError extends Error {
  constructor(message = 'On-device translation is not available in this browser.') {
    super(message);
    this.name = 'TranslationUnavailableError';
  }
}

export async function translateMeetingReport(
  report: MeetingReport,
  language: SummaryLanguage,
  onProgress?: (done: number, total: number) => void,
): Promise<MeetingReport> {
  if (language === 'original') return { ...report, language: 'original' };

  const translatorApi = window.Translator;
  if (!translatorApi) throw new TranslationUnavailableError();

  const strings = collectTranslatableStrings(report);
  const translated = new Map<string, string>();
  const translatorCache = new Map<string, TranslatorInstance>();
  let completed = 0;

  try {
    for (const value of strings) {
      translated.set(value, await translateMixedText(value, language, translatorApi, translatorCache));
      completed += 1;
      onProgress?.(completed, strings.length);
      if (completed % 5 === 0) await yieldToBrowser();
    }
  } finally {
    for (const translator of translatorCache.values()) translator.destroy?.();
  }

  const mapParagraph = (paragraph: ReportParagraph): ReportParagraph => ({
    ...paragraph,
    text: translated.get(paragraph.text) ?? paragraph.text,
  });
  const mapBullet = (bullet: ReportBullet): ReportBullet => ({
    ...bullet,
    text: translated.get(bullet.text) ?? bullet.text,
  });
  const sections = report.sections.map<ReportSection>((section) => ({
    ...section,
    title: localizeSectionTitle(section.title, language, translated),
    paragraphs: section.paragraphs.map(mapParagraph),
    bullets: section.bullets.map(mapBullet),
  }));

  const output: MeetingReport = {
    ...report,
    language,
    sections,
    keyPoints: report.keyPoints.map(mapBullet),
    decisions: report.decisions.map(mapBullet),
    openItems: report.openItems.map(mapBullet),
  };
  output.wordCount = countReportWords(output);
  return output;
}

function collectTranslatableStrings(report: MeetingReport): string[] {
  const values = [
    ...report.sections.flatMap((section) => [
      ...section.paragraphs.map((paragraph) => paragraph.text),
      ...section.bullets.map((bullet) => bullet.text),
    ]),
    ...report.keyPoints.map((bullet) => bullet.text),
    ...report.decisions.map((bullet) => bullet.text),
    ...report.openItems.map((bullet) => bullet.text),
  ].filter((value) => value.trim().length > 0);
  return [...new Set(values)];
}

function localizeSectionTitle(title: string, language: SummaryLanguage, translated: Map<string, string>): string {
  if (language === 'tr') return SECTION_TITLES_TR[title] ?? translated.get(title) ?? title;
  return title;
}

async function translateMixedText(
  value: string,
  target: Exclude<SummaryLanguage, 'original'>,
  translatorApi: TranslatorConstructor,
  translatorCache: Map<string, TranslatorInstance>,
): Promise<string> {
  const protectedValue = protectTerms(value);
  const sentences = splitSentences(protectedValue.text);
  const results: string[] = [];

  for (const sentence of sentences) {
    const source = detectSentenceLanguage(sentence);
    if (!source || source === target) {
      results.push(sentence);
      continue;
    }
    const key = `${source}->${target}`;
    let translator = translatorCache.get(key);
    if (!translator) {
      const availability = await translatorApi.availability({ sourceLanguage: source, targetLanguage: target });
      if (availability === 'unavailable' || availability === 'no') {
        results.push(sentence);
        continue;
      }
      translator = await translatorApi.create({ sourceLanguage: source, targetLanguage: target });
      translatorCache.set(key, translator);
    }
    results.push(await translator.translate(sentence));
  }

  return restoreTerms(results.join(' ').replace(/\s+/g, ' ').trim(), protectedValue.terms);
}

function protectTerms(value: string): { text: string; terms: string[] } {
  let text = value;
  const terms: string[] = [];
  for (const term of PROTECTED_TERMS) {
    const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, 'gi');
    text = text.replace(pattern, (match) => {
      const index = terms.push(match) - 1;
      return `ZXQTERM${index}QXZ`;
    });
  }
  return { text, terms };
}

function restoreTerms(value: string, terms: string[]): string {
  return value.replace(/ZXQTERM\s*(\d+)\s*QXZ/gi, (_match, rawIndex: string) => terms[Number(rawIndex)] ?? _match);
}

function splitSentences(value: string): string[] {
  const matches = value.match(/[^.!?…]+[.!?…]+|[^.!?…]+$/g);
  return (matches ?? [value]).map((part) => part.trim()).filter(Boolean);
}

function detectSentenceLanguage(value: string): 'en' | 'tr' | null {
  const lower = value.toLocaleLowerCase('tr-TR');
  const turkishChars = (lower.match(/[çğıöşü]/g) ?? []).length;
  const turkishWords = (lower.match(/\b(ve|ile|için|olarak|değil|ancak|ayrıca|üzerinden|gerekiyor|kullanıl|yapıl|mevcut|konuşuldu|görüşüldü|tarafında|olduğu|edildi|edilecek|kaldı|karar)\b/g) ?? []).length;
  const englishWords = (lower.match(/\b(the|and|with|for|that|this|from|was|were|will|would|should|can|could|during|discussion|approach|requirement|implementation|available|support|reviewed|confirmed)\b/g) ?? []).length;
  const trScore = turkishChars * 2 + turkishWords;
  const enScore = englishWords;
  if (trScore === 0 && enScore === 0) return null;
  return trScore > enScore ? 'tr' : 'en';
}

function countReportWords(report: MeetingReport): number {
  const value = report.sections
    .flatMap((section) => [section.title, ...section.paragraphs.map((paragraph) => paragraph.text), ...section.bullets.map((bullet) => bullet.text)])
    .join(' ');
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function yieldToBrowser(): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, 0));
}
