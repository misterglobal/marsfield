import Link from 'next/link';
import styles from '../legal.module.css';

export default function PrivacyPage() {
  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <h1>Privacy Policy</h1>
        <p>Effective July 2, 2026 · Last updated July 2, 2026</p>
        <p>This policy explains how Marsfield collects, uses, shares, and protects personal information when you use marsfield.xyz, our applications, and our APIs (the “Service”).</p>
      </header>

      <section className={styles.section}>
        <h2>1. Who we are</h2>
        <p>Marsfield provides tools for generating, editing, organizing, and storing AI-created media. Marsfield is responsible for the personal information described in this policy. Privacy questions and rights requests can be sent to <a href="mailto:privacy@marsfield.xyz">privacy@marsfield.xyz</a>.</p>
      </section>

      <section className={styles.section}>
        <h2>2. Information we collect</h2>
        <h3>Account and profile information</h3>
        <p>We collect your name, email address, password hash, account identifiers, plan, credit balance, storage allowance, API-key metadata, and account preferences. We do not store your plaintext password or plaintext API keys.</p>
        <h3>Content and generation data</h3>
        <p>We process prompts, uploaded images, video and audio, generated outputs, projects, storyboard scenes, model selections, generation settings, and related metadata. Content may include personal information about you or another person.</p>
        <h3>Billing and transaction data</h3>
        <p>Freemius handles checkout and payment processing as merchant of record. We receive subscription, plan, license, transaction-status, and customer-identification data needed to activate and administer your plan. We do not receive or store full payment-card numbers.</p>
        <h3>Usage and technical data</h3>
        <p>We collect credit usage, storage use, prediction status, API-key usage timestamps, logs, error details, IP address, browser/device information, and security events. Authentication information may be stored in your browser’s local storage to keep you signed in.</p>
      </section>

      <section className={styles.section}>
        <h2>3. How we use information</h2>
        <ul>
          <li>Provide, secure, troubleshoot, and improve the Service.</li>
          <li>Authenticate users and process API requests.</li>
          <li>Submit generation requests, retrieve outputs, and store assets.</li>
          <li>Administer subscriptions, credits, storage limits, and billing history.</li>
          <li>Detect fraud, abuse, prohibited content, and security incidents.</li>
          <li>Comply with law, enforce our Terms, and protect users and third parties.</li>
          <li>Send essential service, transaction, and policy communications.</li>
        </ul>
        <p>Where applicable, we rely on performing our contract with you, legitimate interests in operating and securing the Service, consent, and compliance with legal obligations.</p>
      </section>

      <section className={styles.section}>
        <h2>4. AI providers and other service providers</h2>
        <p>We disclose only the information reasonably needed to providers that help operate Marsfield. These providers may process information in countries outside your own:</p>
        <ul>
          <li><a href="https://replicate.com/privacy" target="_blank" rel="noreferrer">Replicate</a> and model providers process prompts, reference media, generation parameters, and outputs.</li>
          <li><a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noreferrer">Cloudflare</a> provides R2 object storage and network services.</li>
          <li><a href="https://freemius.com/privacy/" target="_blank" rel="noreferrer">Freemius</a> provides checkout, subscription, tax, fraud-prevention, and merchant-of-record services.</li>
          <li>Hosting, database, email, monitoring, security, and professional-service providers may process operational information on our behalf.</li>
        </ul>
        <p>We may also disclose information during a business transaction, with your direction or consent, or when reasonably necessary to comply with law or protect rights and safety. We do not sell personal information for money.</p>
      </section>

      <section className={styles.section}>
        <h2>5. Storage and retention</h2>
        <p>Uploads and generated assets are stored in Cloudflare R2. Free-plan content is scheduled for retention for up to 7 days and may then be deleted automatically. Paid content is retained while your account and applicable plan remain active, subject to storage limits, user deletion, legal obligations, backup cycles, and operational requirements.</p>
        <p>Account, billing, security, and transaction records may be retained after account closure where needed for legal compliance, dispute resolution, fraud prevention, and enforcing agreements. Provider copies may remain for the periods described in each provider’s policy.</p>
      </section>

      <section className={styles.section}>
        <h2>6. Your choices and rights</h2>
        <p>Depending on where you live, you may request access, correction, deletion, restriction, objection, portability, or withdrawal of consent. You may also complain to your local privacy regulator. We may need to verify your identity before completing a request, and some information may be retained where permitted or required by law.</p>
        <p>Send requests to <a href="mailto:privacy@marsfield.xyz">privacy@marsfield.xyz</a>. You can revoke API keys from Settings and delete content using available account controls.</p>
      </section>

      <section className={styles.section}>
        <h2>7. Security</h2>
        <p>We use administrative, technical, and organizational safeguards designed to protect information, including access controls, hashed credentials, signed webhooks, and encrypted network transport. No internet service is completely secure, so we cannot guarantee absolute security. Keep your password and API keys confidential and notify us promptly of suspected misuse.</p>
      </section>

      <section className={styles.section}>
        <h2>8. Children</h2>
        <p>The Service is not directed to children under 13, and paid or API use requires the legal capacity to enter a contract. We do not knowingly collect personal information from children under 13. Contact us if you believe a child has provided information without appropriate authorization.</p>
      </section>

      <section className={styles.section}>
        <h2>9. Changes to this policy</h2>
        <p>We may update this policy as Marsfield changes. We will post the revised policy with a new effective date and provide additional notice when required by law. Continued use after the effective date is subject to the updated policy.</p>
      </section>

      <div className={styles.notice}>
        Questions? Email <a href="mailto:privacy@marsfield.xyz">privacy@marsfield.xyz</a> or review our <Link href="/terms">Terms of Service</Link>.
      </div>
    </article>
  );
}
