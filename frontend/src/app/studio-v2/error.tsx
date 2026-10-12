"use client";

import Link from "next/link";
import styles from "./error.module.css";

interface StudioV2ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function StudioV2Error({ error, reset }: StudioV2ErrorProps) {
  return (
    <main className={styles.page} data-testid="studio-v2-error-boundary">
      <section className={styles.card} role="alert" aria-labelledby="studio-v2-error-title">
        <p className={styles.eyebrow}>Studio V2 preview</p>
        <h1 id="studio-v2-error-title">Studio V2 couldn&apos;t load</h1>
        <p>
          The preview stopped safely. Your legacy Studio remains available and this failure does not
          affect existing generation tools.
        </p>
        <div className={styles.actions}>
          <button type="button" onClick={reset}>Try Studio V2 again</button>
          <Link href="/">Return to legacy Studio</Link>
        </div>
        {error.digest ? <p className={styles.reference}>Reference: {error.digest}</p> : null}
      </section>
    </main>
  );
}
