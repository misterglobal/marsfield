'use client';

import { CINEMATIC_OPTIONS, CinematicSettings } from '@/lib/cinematic';

interface Props {
  value: CinematicSettings;
  onChange: (value: CinematicSettings) => void;
}

export function CinematicControls({ value, onChange }: Props) {
  const set = <K extends keyof CinematicSettings>(key: K, next: CinematicSettings[K]) => onChange({ ...value, [key]: next });
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem', borderTop: '1px solid var(--panel-border)', paddingTop: '1rem' }}>
      <label style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', fontWeight: 600 }}>
        Cinematic Controls
        <input aria-label="Enable cinematic controls" type="checkbox" checked={value.enabled} onChange={(event) => set('enabled', event.target.checked)} />
      </label>
      <p style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem', margin: 0 }}>
        Compile consistent camera language into the prompt sent to the model.
      </p>
      {value.enabled && (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <Select label="Camera body" value={value.camera} options={CINEMATIC_OPTIONS.cameras} onChange={(next) => set('camera', next)} />
          <Select label="Lens character" value={value.lens} options={CINEMATIC_OPTIONS.lenses} onChange={(next) => set('lens', next)} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.75rem' }}>
            <Select label="Focal length" value={String(value.focalLength)} options={CINEMATIC_OPTIONS.focalLengths.map(String)} onChange={(next) => set('focalLength', Number(next))} suffix="mm" />
            <Select label="Aperture" value={value.aperture} options={CINEMATIC_OPTIONS.apertures} onChange={(next) => set('aperture', next)} />
          </div>
          <Select label="Camera movement" value={value.movement} options={CINEMATIC_OPTIONS.movements} onChange={(next) => set('movement', next)} />
          <Select label="Lighting" value={value.lighting} options={CINEMATIC_OPTIONS.lighting} onChange={(next) => set('lighting', next)} />
          <Select label="Color grade" value={value.grade} options={CINEMATIC_OPTIONS.grades} onChange={(next) => set('grade', next)} />
        </div>
      )}
    </section>
  );
}

function Select({ label, value, options, onChange, suffix = '' }: {
  label: string; value: string; options: readonly string[]; onChange: (value: string) => void; suffix?: string;
}) {
  return (
    <div>
      <label className="form-label">{label}</label>
      <select aria-label={label} className="form-select" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option} value={option}>{option}{suffix}</option>)}
      </select>
    </div>
  );
}
