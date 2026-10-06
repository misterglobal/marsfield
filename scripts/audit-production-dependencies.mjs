import { spawnSync } from 'node:child_process';
import path from 'node:path';

const baselineExpiresAt = new Date('2026-10-20T00:00:00Z');
const allowedAdvisories = new Set([
  'GHSA-28wg-ghj8-5hjv',
  'GHSA-2v37-7h3g-55p8',
  'GHSA-2xp9-vwfh-vxw4',
  'GHSA-3pph-fpjx-jg34',
  'GHSA-4mjr-xmp4-gh2g',
  'GHSA-535w-7cp7-47q4',
  'GHSA-68fv-2mgg-jv7q',
  'GHSA-jqcg-44mw-7w3h',
  'GHSA-p293-qw3h-jr36',
  'GHSA-qfvm-cv95-jqjf',
  'GHSA-qvfw-j98x-7q72',
  'GHSA-rgj7-g3m4-5g8c',
  'GHSA-vcvr-r3jv-pc5j',
  'GHSA-wc9g-mqfw-jrwm',
]);

const npmCommand = process.platform === 'win32' ? process.execPath : 'npm';
const npmArguments = process.platform === 'win32'
  ? [path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')]
  : [];
const audit = spawnSync(npmCommand, [...npmArguments, 'audit', '--omit=dev', '--json'], {
  encoding: 'utf8',
  maxBuffer: 10 * 1024 * 1024,
});

if (audit.error) {
  throw audit.error;
}

let report;
try {
  report = JSON.parse(audit.stdout);
} catch {
  process.stderr.write(audit.stderr);
  throw new Error('npm audit did not return valid JSON');
}

const findings = Object.values(report.vulnerabilities ?? {})
  .flatMap((vulnerability) => vulnerability.via ?? [])
  .filter((advisory) => typeof advisory === 'object' && advisory !== null)
  .filter((advisory) => advisory.severity === 'high' || advisory.severity === 'critical')
  .map((advisory) => ({
    id: advisory.url?.split('/').at(-1) ?? `npm-${advisory.source}`,
    name: advisory.name,
    severity: advisory.severity,
    title: advisory.title,
  }));

const unexpected = findings.filter((finding) => !allowedAdvisories.has(finding.id));
if (unexpected.length > 0) {
  console.error('New high-severity production dependency advisories were found:');
  for (const finding of unexpected) {
    console.error(`- ${finding.id} ${finding.severity} ${finding.name}: ${finding.title}`);
  }
  process.exit(1);
}

if (findings.length > 0 && Date.now() >= baselineExpiresAt.getTime()) {
  console.error(
    `The temporary production dependency baseline expired on ${baselineExpiresAt.toISOString()}. Resolve the remaining advisories before extending it.`,
  );
  process.exit(1);
}

console.log(
  `${findings.length} known high-severity advisory records remain temporarily baselined until ${baselineExpiresAt.toISOString()}; no new advisories found.`,
);
