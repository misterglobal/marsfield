import type { ButtonHTMLAttributes, PropsWithChildren, ReactNode } from "react";
import styles from "./studio-v2.module.css";

interface RegionProps extends PropsWithChildren {
  className?: string;
  label: string;
}

export function StudioRegion({ children, className = "", label }: RegionProps) {
  return <section aria-label={label} className={`${styles.region} ${className}`}>{children}</section>;
}

interface EmptyStateProps {
  eyebrow: string;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({ eyebrow, title, description, action }: EmptyStateProps) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.eyebrow}>{eyebrow}</span>
      <h2>{title}</h2>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function IconButton({ className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button type="button" className={`${styles.iconButton} ${className}`} {...props} />;
}

interface SegmentedControlProps {
  label: string;
  options: Array<{ label: string; value: string }>;
  value: string;
  onChange: (value: string) => void;
}

export function SegmentedControl({ label, options, value, onChange }: SegmentedControlProps) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
