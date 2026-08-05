export interface NormalizedYoutubeTopic {
  rawIdea: string;
  title: string;
  topic: string;
  hook: string;
  centralTension: string;
  entities: string[];
  people: string[];
  places: string[];
  organizations: string[];
  dates: string[];
  concepts: string[];
  viewerTakeaway: string;
  searchKeywords: string[];
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'how', 'in', 'into', 'is', 'it',
  'of', 'on', 'or', 'that', 'the', 'their', 'this', 'to', 'was', 'were', 'what', 'when', 'where',
  'which', 'who', 'why', 'with', '1',
]);

const LABEL_PATTERN = /\b(?:the\s+)?(?:hook|topic|central tension|tension|takeaway|viewer takeaway)\s*:/i;

function tidy(value: string, max = 500): string {
  return value.replace(/[\u201c\u201d]/g, '"').replace(/\s+/g, ' ').trim().slice(0, max);
}

function sentence(value: string, fallback: string): string {
  let text = tidy(value.replace(/^(?:the\s+)?hook\s*:\s*/i, ''), 420);
  const quoteCount = (text.match(/"/g) || []).length;
  if (quoteCount % 2) text = text.replace(/"([^".]*)$/, '$1');
  if (text.split(/\s+/).length < 7 || /(?:\b(?:and|but|because|while|that|which|who|to|of|a|an|the))$/i.test(text)) {
    text = fallback;
  }
  if (!/[.!?]$/.test(text)) text += '.';
  return text;
}

function cleanTitle(raw: string): string {
  const beforeLabel = raw.split(LABEL_PATTERN)[0];
  return tidy(beforeLabel, 180)
    .replace(/^\s*(?:idea|title)\s*:\s*/i, '')
    .replace(/^\s*\d+\s*[.)-]\s*/, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/[\s:;,.-]+$/, '') || 'Untitled production';
}

function labeledValue(raw: string, labels: string[]): string {
  const names = labels.join('|').replace(/\s/g, '\\s+');
  const match = raw.match(new RegExp(`(?:the\\s+)?(?:${names})\\s*:\\s*([\\s\\S]+?)(?=\\b(?:the\\s+)?(?:hook|topic|central\\s+tension|tension|takeaway|viewer\\s+takeaway)\\s*:|$)`, 'i'));
  return tidy(match?.[1] || '', 500);
}

function unique(values: string[], limit = 12): string[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = value.toLowerCase();
    if (!value || STOP_WORDS.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

function extractCapitalizedPhrases(raw: string): string[] {
  return Array.from(raw.matchAll(/\b(?:[A-Z][a-z]+|[A-Z]{2,})(?:\s+(?:[A-Z][a-z]+|[A-Z]{2,}|War|University|Institute|Company)){0,3}\b/g))
    .map((match) => tidy(match[0], 90))
    .filter((value) => !/^(The|A|An|In|On|At|Hook|Title)$/i.test(value));
}

function conceptPhrases(raw: string): string[] {
  const lower = raw.toLowerCase();
  const known = [
    'chemical warfare', 'antibiotics', 'pharmaceutical chemistry', 'sulfonamide drugs', 'dual-use science',
    'artificial intelligence', 'climate change', 'nuclear weapons', 'public health', 'industrial revolution',
    'civil rights', 'medical research', 'scientific ethics', 'world war i', 'world war ii',
  ];
  const matches = known.filter((phrase) => lower.includes(phrase));
  if (/chemical weapon|weapon so toxic|poison gas|wartime chem/.test(lower)) matches.push('chemical warfare');
  if (/antibiotic|life-saving medicine|saved millions of lives/.test(lower)) matches.push('antibiotics');
  if (/pharmaceutical|medicinal chem/.test(lower)) matches.push('pharmaceutical chemistry');
  if (/\b1914\b|first world war|world war i/.test(lower)) matches.push('World War I');
  const quoted = Array.from(raw.matchAll(/["“]([^"”]{3,70})["”]/g)).map((match) => tidy(match[1], 70));
  return unique([...matches, ...quoted], 10);
}

function deriveTopic(title: string, hook: string, concepts: string[]): string {
  const lower = `${title} ${hook}`.toLowerCase();
  if (/poison|toxic|chemical weapon/.test(lower) && /medic|antibiotic|saved|life|lives/.test(lower)) {
    return 'The relationship between wartime chemistry and life-saving medicine';
  }
  if (concepts.length >= 2) return `The relationship between ${concepts[0]} and ${concepts[1]}`;
  if (concepts.length === 1) return `The hidden consequences and contested history of ${concepts[0]}`;
  return title.replace(/^(The|A|An)\s+/i, 'The history and consequences of ');
}

function deriveTension(topic: string, title: string): string {
  const lower = `${topic} ${title}`.toLowerCase();
  if (/war|weapon|poison|destruction/.test(lower) && /medic|saved|life|antibiotic/.test(lower)) {
    return 'How can the same scientific system produce both mass destruction and medical breakthroughs?';
  }
  return `Which parts of the familiar story about ${topic.replace(/^The\s+/i, '')} are supported by evidence, and which conceal its consequences?`;
}

export function normalizeYoutubeIdea(rawValue: unknown, statedTakeaway?: string): NormalizedYoutubeTopic {
  const rawIdea = tidy(String(rawValue || ''), 4_000);
  const title = cleanTitle(rawIdea);
  const explicitHook = labeledValue(rawIdea, ['hook']);
  const bodyAfterTitle = tidy(rawIdea.slice(Math.min(rawIdea.length, rawIdea.indexOf(title) + title.length)), 500);
  const concepts = conceptPhrases(rawIdea);
  const topic = labeledValue(rawIdea, ['topic']) || deriveTopic(title, explicitHook || bodyAfterTitle, concepts);
  const centralTension = labeledValue(rawIdea, ['central tension', 'tension']) || deriveTension(topic, title);
  const hook = sentence(explicitHook || bodyAfterTitle, `The familiar story of ${topic.replace(/^The\s+/i, '')} leaves out the evidence that changes its meaning.`);
  const dates = unique(Array.from(rawIdea.matchAll(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g)).map((match) => match[0]), 8);
  const detailText = explicitHook || rawIdea.replace(title, '');
  const properNames = extractCapitalizedPhrases(detailText)
    .filter((value) => value.toLowerCase() !== title.toLowerCase())
    .filter((value) => !/^(German|British|French|American|European)$/i.test(value));
  const organizations = properNames.filter((value) => /University|Institute|Company|Agency|Army|Navy|Government|Laborator/i.test(value));
  const places = properNames.filter((value) => /War|Europe|America|Germany|France|Britain|China|India|Africa|Asia/i.test(value));
  const people = properNames.filter((value) => value.split(' ').length >= 2 && !organizations.includes(value) && !places.includes(value));
  const entities = unique([...people, ...organizations, ...concepts, ...places, ...dates], 16);
  const takeawayFromTension = centralTension
    .replace(/^How can (.+?) produce (.+)\?$/i, 'Viewers should understand how $1 can produce $2.')
    .replace(/^Which (.+)\?$/i, 'Viewers should understand which $1.');
  const viewerTakeaway = sentence(
    labeledValue(rawIdea, ['viewer takeaway', 'takeaway']) || statedTakeaway || '',
    takeawayFromTension.startsWith('Viewers should')
      ? takeawayFromTension
      : `Viewers should understand the evidence needed to resolve this question: ${centralTension}`,
  );
  const searchKeywords = unique([
    ...entities,
    topic,
    ...concepts.map((concept) => `history of ${concept}`),
    centralTension.toLowerCase().includes('scientific') ? 'dual-use science' : '',
  ], 14);

  return { rawIdea, title, topic, hook, centralTension, entities, people, places, organizations, dates, concepts, viewerTakeaway, searchKeywords };
}

export function isMalformedGeneratedText(value: unknown, rawIdea?: string): boolean {
  const text = tidy(String(value || ''), 2_000);
  if (!text || text.split(/\s+/).length < 4) return true;
  if ((text.match(/"/g) || []).length % 2 !== 0) return true;
  if (/(?:\b(?:and|but|because|while|that|which|who|to|of|a|an|the))$/i.test(text)) return true;
  if (/^(?:\d+\s*[.)-]|(?:the\s+)?hook\s*:)/i.test(text)) return true;
  if (rawIdea && rawIdea.length > 80 && text.includes(rawIdea)) return true;
  return false;
}

export function cleanGeneratedTitle(value: unknown, fallback: string): string {
  const title = cleanTitle(tidy(String(value || ''), 180));
  const words = title.toLowerCase().split(/\s+/);
  const midpoint = words.length / 2;
  const repeated = Number.isInteger(midpoint) && words.slice(0, midpoint).join(' ') === words.slice(midpoint).join(' ');
  if (title.length < 4 || words.length < 2 || repeated || /(?:the\s+)?hook\s*:/i.test(String(value || ''))) return fallback;
  return title;
}
