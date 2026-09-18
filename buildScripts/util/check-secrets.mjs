import {execFileSync}  from 'node:child_process';
import fs              from 'node:fs';
import path            from 'node:path';
import {fileURLToPath} from 'node:url';

/**
 * @module buildScripts/util/check-secrets
 * @summary Fails on credential-shaped literals: in the files it is given (the pre-commit hook passes the staged ones),
 * or in every tracked file with `--all` (CI).
 *
 * A committed credential is unrecallable one `npm publish` later, since registry versions are immutable. GitHub's
 * secret scanner catches it out of band, after the fact; this guard is the tripwire at the commit.
 *
 * Every pattern is anchored to its credential's real length. A prefix alone matches prose that describes a credential
 * (an elided `AIza…`, a redaction test's short `github_pat_` sample), which would make the guard noisy on day one.
 *
 * A finding names file, line and kind, never the match: CI logs are published, and echoing a finding would publish it.
 *
 * A line that legitimately carries a credential-shaped literal takes a marker with its reason, in whatever comment
 * syntax the file has: `secret-scan-ok: <why this is not a secret>`. The marker covers its own line only, and a marker
 * without a reason is a finding. A reviewer reads the reason in the diff: a placeholder, a revoked test value, or a
 * format sample needs saying, and a real credential cannot honestly carry one.
 */

/**
 * @type {Object[]} `{kind, re}` per credential shape. Each `re` is global and bounded on both sides, so a longer run of
 * the same alphabet is not read as a key.
 */
export const PATTERNS = [
    {kind: 'google-api-key',     re: /(?<![0-9A-Za-z_-])AIza[0-9A-Za-z_-]{35}(?![0-9A-Za-z_-])/g},
    {kind: 'google-oauth-token', re: /(?<![0-9A-Za-z_.-])ya29\.[0-9A-Za-z_-]{30,}/g},
    {kind: 'openai-key',         re: /(?<![0-9A-Za-z_-])sk-(?:(?:proj|svcacct|admin)-[0-9A-Za-z_-]{40,}|[0-9A-Za-z]{48}(?![0-9A-Za-z_-]))/g},
    {kind: 'anthropic-key',      re: /(?<![0-9A-Za-z_-])sk-ant-(?:api|admin)\d{2}-[0-9A-Za-z_-]{80,}/g},
    {kind: 'github-token',       re: /(?<![0-9A-Za-z_])gh[pousr]_[0-9A-Za-z]{36}(?![0-9A-Za-z_])/g},
    {kind: 'github-fine-grained', re: /(?<![0-9A-Za-z_])github_pat_[0-9A-Za-z]{22}_[0-9A-Za-z]{59}(?![0-9A-Za-z_])/g},
    {kind: 'aws-access-key-id',  re: /(?<![0-9A-Z])(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Z])/g}
];

export const ALLOW_MARKER = 'secret-scan-ok:';

/**
 * @summary What `--all` reads, which its CI mirror's path filter must cover: every tracked file.
 * @type {String[]}
 */
export const SCAN_SURFACE = Object.freeze(['**']);

const
    allowRE           = /secret-scan-ok:\s*(\S.*)?$/,
    BINARY_EXTENSIONS = new Set([
        '.eot', '.gif', '.ico', '.jpeg', '.jpg', '.mp3', '.mp4', '.otf', '.pdf', '.png', '.ttf', '.wasm', '.webm',
        '.webp', '.woff', '.woff2', '.zip'
    ]);

/**
 * @summary The findings in one text, by line.
 * @param {String} text
 * @returns {Object[]} `{line, kind}` per finding, `kind` being a pattern's or `'allow-marker-without-reason'`
 */
export function findSecrets(text) {
    const findings = [];

    text.split('\n').forEach((line, index) => {
        const allow = line.includes(ALLOW_MARKER) && line.match(allowRE);

        if (allow && !allow[1]) {
            findings.push({line: index + 1, kind: 'allow-marker-without-reason'});
            return
        }

        allow || PATTERNS.forEach(({kind, re}) => {
            re.lastIndex = 0;
            re.test(line) && findings.push({line: index + 1, kind})
        })
    });

    return findings
}

/**
 * @param {String} file
 * @returns {Boolean} whether the file is text this guard reads
 */
function isText(file) {
    if (BINARY_EXTENSIONS.has(path.extname(file).toLowerCase())) {
        return false
    }

    const fd = fs.openSync(file, 'r'), head = Buffer.alloc(8000);

    try {
        return !head.subarray(0, fs.readSync(fd, head, 0, head.length, 0)).includes(0)
    } finally {
        fs.closeSync(fd)
    }
}

/**
 * @summary Scans files and prints the findings, never the matched text.
 * @param {String[]} files
 * @returns {Number} the exit code, 1 on any finding
 */
export function run(files) {
    let count = 0, fileCount = 0;

    files.forEach(file => {
        if (!fs.existsSync(file) || !fs.statSync(file).isFile() || !isText(file)) {
            return
        }

        const findings = findSecrets(fs.readFileSync(file, 'utf8'));

        findings.length && fileCount++;

        findings.forEach(({line, kind}) => {
            count++;
            console.error(`  ${file}:${line}  ${kind}`)
        })
    });

    if (count) {
        console.error(`check-secrets: ${count} credential-shaped literal(s) in ${fileCount} file(s). Remove the credential, ` +
            `and revoke it if it was ever real. A line that must keep such a literal takes '${ALLOW_MARKER} <reason>'.`);
        return 1
    }

    console.log(`check-secrets: ${files.length} file(s), no credential-shaped literal.`);
    return 0
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);

    process.exitCode = run(args[0] === '--all'
        ? execFileSync('git', ['ls-files', '-z'], {encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}).split('\0').filter(Boolean)
        : args)
}
