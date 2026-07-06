import Link from 'next/link';
import styles from '../legal.module.css';

export default function TermsPage() {
  return (
    <article className={styles.page}>
      <header className={styles.hero}>
        <h1>Terms of Service</h1>
        <p>Effective July 2, 2026 · Last updated July 2, 2026</p>
        <p>These Terms govern your use of marsfield.xyz, Marsfield applications, and Marsfield APIs (the “Service”). By creating an account, purchasing a plan, or using the Service, you agree to these Terms.</p>
      </header>

      <section className={styles.section}>
        <h2>1. Eligibility and accounts</h2>
        <p>You must be at least 13 years old and legally permitted to use the Service. If you are under the age of majority where you live, a parent or guardian must authorize your use. You must provide accurate account information, protect your credentials and API keys, and accept responsibility for activity under your account. Accounts and credits may not be sold or transferred without our permission.</p>
      </section>

      <section className={styles.section}>
        <h2>2. The Service</h2>
        <p>Marsfield provides access to third-party artificial-intelligence models and tools for media generation, editing, project organization, and storage. Models, features, limits, processing times, and results may change or be unavailable. Generated media may contain errors, artifacts, bias, or unexpected similarities and must be reviewed before use.</p>
        <p>Preview and experimental features may be changed or discontinued without notice and should not be relied on for safety-critical or high-risk decisions.</p>
      </section>

      <section className={styles.section}>
        <h2>3. Your content and generated outputs</h2>
        <p>You retain any rights you have in prompts, uploads, and other content you submit (“Input”). As between you and Marsfield, and to the extent permitted by law and third-party model terms, you may use generated outputs (“Output”) for lawful purposes.</p>
        <p>You grant Marsfield a worldwide, non-exclusive, limited license to host, copy, transmit, transform, and display Input and Output only as needed to provide, secure, support, and improve the Service, comply with law, and enforce these Terms. You represent that you have all permissions needed to submit Input and authorize this processing.</p>
        <p>AI outputs may not qualify for intellectual-property protection and may not be unique. Marsfield does not promise that Output is accurate, non-infringing, or suitable for a particular use. You are responsible for reviewing model-specific licensing terms and obtaining legal clearance where appropriate.</p>
      </section>

      <section className={styles.section}>
        <h2>4. Acceptable use</h2>
        <p>You must not use the Service to:</p>
        <ul>
          <li>Break the law, violate another person’s rights, or evade sanctions or access controls.</li>
          <li>Create or distribute child sexual abuse material, sexual content involving minors, or content that exploits or endangers children.</li>
          <li>Create non-consensual intimate imagery, facilitate harassment, stalking, threats, fraud, or targeted abuse.</li>
          <li>Deceptively impersonate a real person, misrepresent synthetic media as authentic, or interfere with elections or public safety.</li>
          <li>Upload material you do not have the right to use, including protected personal data, likenesses, trademarks, or copyrighted works.</li>
          <li>Generate malware, probe or disrupt systems, scrape the Service, bypass quotas, share API keys, or automate account abuse.</li>
          <li>Use Output for decisions concerning employment, housing, credit, insurance, healthcare, legal rights, or other high-impact matters without lawful safeguards and qualified human review.</li>
        </ul>
        <p>We may investigate, block, remove, preserve, or report content and suspend accounts when reasonably necessary to enforce these rules or protect people and the Service.</p>
      </section>

      <section className={styles.section}>
        <h2>5. Plans, credits, billing, and refunds</h2>
        <p>Plan prices, included credits, storage, retention, and model costs are shown at purchase or in the Service. Credits are usage units, have no cash value, are non-transferable, and may expire or reset at the end of the applicable billing period. Different models, resolutions, durations, variations, and features consume different amounts of credits. Failed submissions should not be charged; successfully submitted generation jobs may be charged even when a provider later returns an unusable or undesired result.</p>
        <p>Freemius acts as merchant of record and handles payment, applicable taxes, invoices, renewals, cancellations, chargebacks, and legally required checkout notices. Subscriptions renew until cancelled. Cancellation normally stops future renewal and does not retroactively refund consumed credits or elapsed subscription time, except where required by law or stated at checkout.</p>
        <p>We may change future pricing or plan allowances with reasonable notice. If an obvious pricing or credit-calculation error occurs, we may correct it and will not knowingly charge more than the price presented without your authorization.</p>
      </section>

      <section className={styles.section}>
        <h2>6. Storage and deletion</h2>
        <p>You are responsible for keeping independent backups of important content. Free-plan assets may be deleted after the stated 7-day retention period. Content exceeding storage limits, content associated with expired or terminated accounts, and content you delete may be removed permanently. Deletion from active systems may not immediately remove temporary backups or provider copies.</p>
      </section>

      <section className={styles.section}>
        <h2>7. API use</h2>
        <p>API access is subject to your plan, credits, rate limits, documentation, and these Terms. Keep API keys secret, rotate compromised keys, and do not embed secret keys in public client code. We may impose or adjust technical limits to protect reliability, security, and fair access.</p>
      </section>

      <section className={styles.section}>
        <h2>8. Third-party services</h2>
        <p>The Service relies on third parties, including Replicate and individual model providers, Cloudflare, Freemius, and infrastructure providers. Your use may also be subject to their terms and policies. Marsfield is not responsible for third-party outages, model behavior, policy changes, or content, but we will use reasonable efforts to operate our integrations responsibly.</p>
      </section>

      <section className={styles.section}>
        <h2>9. Suspension and termination</h2>
        <p>You may stop using the Service at any time. We may suspend or terminate access for violations, payment failure, security risk, legal requirements, harm to users or third parties, or material risk to the Service. Where practical, we will provide notice and an opportunity to cure. Sections that by their nature should survive termination will survive, including payment obligations, ownership, disclaimers, liability limits, and dispute terms.</p>
      </section>

      <section className={styles.section}>
        <h2>10. Disclaimers</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE AND ALL OUTPUTS ARE PROVIDED “AS IS” AND “AS AVAILABLE.” MARSFIELD DISCLAIMS ALL EXPRESS OR IMPLIED WARRANTIES, INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, NON-INFRINGEMENT, ACCURACY, AVAILABILITY, AND THAT CONTENT WILL BE PRESERVED OR ERROR-FREE. Nothing in these Terms excludes warranties or rights that cannot legally be excluded.</p>
      </section>

      <section className={styles.section}>
        <h2>11. Limitation of liability</h2>
        <p>TO THE MAXIMUM EXTENT PERMITTED BY LAW, MARSFIELD WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR PUNITIVE DAMAGES, OR LOST PROFITS, REVENUE, DATA, GOODWILL, OR BUSINESS OPPORTUNITY. MARSFIELD’S TOTAL LIABILITY ARISING FROM THE SERVICE WILL NOT EXCEED THE GREATER OF CAD $100 OR THE AMOUNT YOU PAID TO MARSFIELD FOR THE SERVICE DURING THE THREE MONTHS BEFORE THE EVENT GIVING RISE TO THE CLAIM. These limits do not apply where prohibited by law.</p>
      </section>

      <section className={styles.section}>
        <h2>12. Indemnity</h2>
        <p>To the extent permitted by law, you will defend and indemnify Marsfield from third-party claims, losses, and reasonable costs arising from your Input, Output, unlawful use, or material breach of these Terms. This obligation does not apply to the extent a claim results from Marsfield’s own unlawful conduct.</p>
      </section>

      <section className={styles.section}>
        <h2>13. Governing law and disputes</h2>
        <p>These Terms are governed by the laws of Ontario and the federal laws of Canada applicable there, without regard to conflict-of-law rules. Courts located in Ontario will have exclusive jurisdiction, except where consumer law gives you the right to bring a claim elsewhere. Before filing a claim, the parties will attempt in good faith for 30 days to resolve the dispute after written notice.</p>
      </section>

      <section className={styles.section}>
        <h2>14. Changes and general terms</h2>
        <p>We may update these Terms as the Service evolves. Material changes will receive reasonable notice where required. If you do not agree, stop using the Service before the revised Terms take effect. These Terms and referenced policies are the entire agreement about the Service. If one provision is unenforceable, the remainder continues. Failure to enforce a provision is not a waiver. You may not assign these Terms without our consent; we may assign them as part of a reorganization or business transfer.</p>
      </section>

      <div className={styles.notice}>
        Legal notices: <a href="mailto:legal@marsfield.xyz">legal@marsfield.xyz</a>. Please also review our <Link href="/privacy">Privacy Policy</Link>.
      </div>
    </article>
  );
}
