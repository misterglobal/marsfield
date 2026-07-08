export interface StoryboardPlanOptions {
  sceneCount: number;
  totalDurationSeconds: number;
  visualStyle?: string;
  aspectRatio?: string;
  continuity?: string;
}

export interface PlannedScene {
  index: number;
  title: string;
  prompt: string;
  notes: string;
  durationSeconds: number;
}

const SHOT_TYPES = ['Wide establishing shot', 'Medium shot', 'Close-up', 'Tracking shot', 'Over-the-shoulder shot'];

function cleanText(value: string) {
  return value.replace(/\r/g, '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
}

function splitScript(script: string, count: number) {
  const blocks = cleanText(script)
    .split(/\n\s*\n|(?=^(?:INT\.|EXT\.|INT\/EXT\.|SCENE\s+\d+))/gim)
    .map(cleanText)
    .filter(Boolean);

  let units = blocks.length >= count
    ? blocks
    : cleanText(script).split(/(?<=[.!?])\s+(?=[A-Z"'])/).map(cleanText).filter(Boolean);

  if (units.length < count) {
    const words = cleanText(script).split(/\s+/);
    units = Array.from({ length: count }, (_, index) => {
      const start = Math.floor((index * words.length) / count);
      const end = Math.floor(((index + 1) * words.length) / count);
      return words.slice(start, Math.max(start + 1, end)).join(' ');
    }).filter(Boolean);
  }

  const groups: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const start = Math.floor((index * units.length) / count);
    const end = Math.floor(((index + 1) * units.length) / count);
    groups.push(units.slice(start, Math.max(start + 1, end)).join(' '));
  }
  return groups.filter(Boolean);
}

function sceneTitle(text: string, index: number) {
  const heading = text.match(/^(?:INT\.|EXT\.|INT\/EXT\.|SCENE\s+\d+)[^\n.]*/i)?.[0];
  if (heading) return heading.replace(/\s+/g, ' ').slice(0, 80);
  const words = text.replace(/[^\w\s'-]/g, '').split(/\s+/).filter(Boolean).slice(0, 6);
  return words.length ? words.join(' ') : `Scene ${index + 1}`;
}

export function planStoryboard(script: string, options: StoryboardPlanOptions): PlannedScene[] {
  const sections = splitScript(script, options.sceneCount);
  const baseDuration = Math.floor(options.totalDurationSeconds / sections.length);
  const remainder = options.totalDurationSeconds % sections.length;
  const style = options.visualStyle?.trim() || 'cinematic, cohesive visual storytelling';
  const aspect = options.aspectRatio?.trim() || '16:9';
  const continuity = options.continuity?.trim();

  return sections.map((section, index) => {
    const durationSeconds = baseDuration + (index < remainder ? 1 : 0);
    const continuityLine = continuity ? ` Continuity: ${continuity}.` : '';
    return {
      index,
      title: sceneTitle(section, index),
      durationSeconds,
      notes: `Script excerpt: ${section.slice(0, 1200)}`,
      prompt: `${SHOT_TYPES[index % SHOT_TYPES.length]}. ${section} Visual style: ${style}. Frame for ${aspect}.${continuityLine} Preserve character appearance, wardrobe, environment, and screen direction from adjacent scenes. No titles or on-screen text.`.slice(0, 4000),
    };
  });
}
