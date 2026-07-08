'use client';

import { ControlKey, ModelControl, ModelDefinition } from '@/lib/model-registry';

interface Props {
  model?: ModelDefinition;
  values: Partial<Record<ControlKey, string | number | boolean>>;
  onChange: (key: ControlKey, value: string | number | boolean) => void;
}

export function DynamicModelControls({ model, values, onChange }: Props) {
  if (!model?.controls?.length) return null;
  return (
    <section style={{ display: 'grid', gap: '0.85rem' }}>
      {model.controls.map((control) => (
        <ModelControlField key={control.key} control={control} value={values[control.key] ?? control.defaultValue} onChange={(value) => onChange(control.key, value)} />
      ))}
    </section>
  );
}

function ModelControlField({ control, value, onChange }: { control: ModelControl; value: string | number | boolean; onChange: (value: string | number | boolean) => void }) {
  if (control.type === 'checkbox') {
    return <label style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>{control.label}<input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} /></label>;
  }
  if (control.type === 'range') {
    return (
      <div>
        <label className="form-label">{control.label} ({String(value)})</label>
        <input aria-label={control.label} className="form-range" type="range" min={control.min} max={control.max} step={control.step} value={Number(value)} onChange={(event) => onChange(Number(event.target.value))} />
      </div>
    );
  }
  return (
    <div>
      <label className="form-label">{control.label}</label>
      <select aria-label={control.label} className="form-select" value={String(value)} onChange={(event) => {
        const option = control.options?.find((item) => String(item.value) === event.target.value);
        onChange(option?.value ?? event.target.value);
      }}>
        {control.options?.map((option) => <option key={String(option.value)} value={String(option.value)}>{option.label}</option>)}
      </select>
      {control.help && <p style={{ color: 'var(--foreground-muted)', fontSize: '0.75rem', margin: '0.35rem 0 0' }}>{control.help}</p>}
    </div>
  );
}
