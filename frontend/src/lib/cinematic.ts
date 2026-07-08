export interface CinematicSettings {
  enabled: boolean;
  camera: string;
  lens: string;
  focalLength: number;
  aperture: string;
  movement: string;
  lighting: string;
  grade: string;
}

export const DEFAULT_CINEMATIC_SETTINGS: CinematicSettings = {
  enabled: false,
  camera: 'Full-frame digital cinema camera',
  lens: 'Modern cinema prime',
  focalLength: 35,
  aperture: 'f/2.8',
  movement: 'Static camera',
  lighting: 'Natural cinematic light',
  grade: 'Natural film grade',
};

export const CINEMATIC_OPTIONS = {
  cameras: ['Full-frame digital cinema camera', 'Super 35 digital cinema camera', 'Large-format digital cinema camera', '70mm film camera', '16mm film camera'],
  lenses: ['Modern cinema prime', 'Vintage cinema prime', 'Anamorphic lens', 'Macro lens', 'Tilt-shift lens', 'Soft portrait lens'],
  focalLengths: [18, 24, 35, 50, 85, 100],
  apertures: ['f/1.4', 'f/2', 'f/2.8', 'f/4', 'f/8', 'f/11'],
  movements: ['Static camera', 'Slow push-in', 'Slow pull-back', 'Tracking shot', 'Orbiting shot', 'Handheld movement', 'Crane shot', 'Aerial movement'],
  lighting: ['Natural cinematic light', 'Golden-hour light', 'Soft studio light', 'Dramatic low-key light', 'High-key commercial light', 'Neon night light', 'Volumetric light rays', 'Overcast diffused light'],
  grades: ['Natural film grade', 'Warm cinematic grade', 'Cool cinematic grade', 'Teal-and-orange grade', 'High-contrast noir grade', 'Muted editorial grade', 'Pastel commercial grade', 'Vintage film grade'],
} as const;

const FOCAL_DESCRIPTIONS: Record<number, string> = {
  18: 'ultra-wide environmental perspective',
  24: 'wide cinematic perspective',
  35: 'natural cinematic perspective',
  50: 'balanced human-eye perspective',
  85: 'compressed portrait perspective',
  100: 'tight telephoto perspective',
};

const APERTURE_DESCRIPTIONS: Record<string, string> = {
  'f/1.4': 'very shallow depth of field with pronounced bokeh',
  'f/2': 'shallow depth of field',
  'f/2.8': 'cinematic subject separation',
  'f/4': 'moderate depth of field',
  'f/8': 'deep focus across the scene',
  'f/11': 'maximum environmental clarity',
};

export function buildCinematicPrompt(basePrompt: string, settings: CinematicSettings): string {
  const clean = basePrompt.trim();
  if (!settings.enabled || !clean) return clean;
  return [
    clean,
    `Shot on a ${settings.camera.toLowerCase()}`,
    `using a ${settings.lens.toLowerCase()} at ${settings.focalLength}mm with ${FOCAL_DESCRIPTIONS[settings.focalLength] || 'cinematic perspective'}`,
    `${settings.aperture}, ${APERTURE_DESCRIPTIONS[settings.aperture] || 'controlled depth of field'}`,
    settings.movement,
    settings.lighting,
    settings.grade,
    'coherent composition, physically consistent lighting, professional cinematic finish',
  ].join(', ');
}
