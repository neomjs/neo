#!/usr/bin/env node

/**
 * @summary Lints every decision record's `Status` field against its own stated transition condition.
 *
 * **The defect this exists to end.** Most records declared a condition of the form *"transitions to
 * Accepted on approved, green PR merge at the human merge gate"*. A record cannot appear on `dev`
 * unless the pull request that adds it merged — so the condition is satisfied by **the same event
 * that publishes the record**, and is already true the instant the file exists. There is therefore
 * never a *later* moment at which anyone is prompted to flip the field. That is not a forgotten step
 * repeated by many authors; it is a condition whose satisfaction is simultaneous with publication and
 * whose recording is not. Twenty-seven records drifted across four months with every author having
 * written a precise, checkable condition and every author having been correct when they wrote it.
 *
 * **So the check runs at pull-request time, on the merge that would publish the drift** — the only
 * moment that exists. A scheduled audit would report the same backlog forever and prevent nothing.
 *
 * **The rule.** A `Proposed` or `Draft` record must name what is still open with the literal
 * {@link OUTSTANDING_MARKER} token. Anything else — every merge-gate phrasing included — fails,
 * because a condition this merge itself satisfies is a description of publication, not a gate. The
 * author's two legal moves are both one edit: write `Accepted — YYYY-MM-DD`, or declare what a reader
 * would still be waiting for. The token is deliberately crude: presence is mechanically decidable,
 * while "does this prose describe a future event" is not.
 *
 * **Why three syntax arms for one canonical syntax.** The corpus carried three spellings of the same
 * field, and the census that motivated this guard was wrong three times because each successive
 * hand-rolled pattern silently skipped a different record. A status the checker cannot read is
 * indistinguishable from one it read and passed — both are silence. So every known spelling is
 * parsed, and the non-canonical ones are then reported as violations rather than tolerated. Parsing
 * is how a record stays visible; the canonical-syntax rule is how the corpus stays uniform.
 *
 * **Vocabulary is pinned, not invented.** The legal states are exactly the three the corpus already
 * used. A fourth is a deliberate edit to {@link LEGAL_STATES} and its review, never a silent pass.
 *
 * @see .github/workflows/adr-status-lint.yml
 * @see test/playwright/unit/ai/scripts/lint/lintAdrStatus.spec.mjs
 */

import fs              from 'fs';
import path            from 'path';
import {fileURLToPath} from 'url';

const
    __filename    = fileURLToPath(import.meta.url),
    __dirname     = path.dirname(__filename),
    ROOT_DIR      = path.resolve(__dirname, '../../..'),
    DECISIONS_DIR = path.join(ROOT_DIR, 'learn/agentos/decisions');

/**
 * Every path whose change can change this lint's verdict. Imported by the workflow scan-root parity
 * spec as SSOT, so widening the scan here fails any workflow filter that was not widened with it.
 * @type {String[]}
 */
export const SCAN_SURFACE = ['learn/agentos/decisions/**'];

/**
 * The token a non-accepted record uses to name what is still open.
 *
 * Crude on purpose. The alternative — deciding from prose whether a stated condition outlives the
 * merge being reviewed — is the judgment call that failed for four months.
 * @type {String}
 */
export const OUTSTANDING_MARKER = 'OUTSTANDING:';

/**
 * The states the corpus uses. Pinning them makes a new state a reviewed edit rather than a silent pass.
 * @type {String[]}
 */
export const LEGAL_STATES = ['Accepted', 'Proposed', 'Draft'];

/** States that must name an outstanding item, because they assert the record is not yet authority. */
const PENDING_STATES = ['Proposed', 'Draft'];

/**
 * @typedef {Object} StatusSyntax
 * @property {String}  name      Spelling identifier reported in messages.
 * @property {Boolean} canonical Whether records are allowed to use it.
 * @property {RegExp}  pattern   Single-line matcher capturing the status value.
 */

/**
 * @typedef {Object} StatusField
 * @property {String}  syntax    The matching {@link StatusSyntax} name.
 * @property {Boolean} canonical Copied from the matching syntax.
 * @property {Number}  line      1-based line number of the field.
 * @property {String}  value     Trimmed status text.
 */

/**
 * @typedef {Object} StatusViolation
 * @property {String}      kind    Failure class, stable for assertions.
 * @property {String}      file    Record filename.
 * @property {Number|null} line    1-based line, or null when no field was found.
 * @property {String}      message Remedy an author can act on without reading this file.
 */

/**
 * Every spelling of the `Status` field found in the corpus, canonical first.
 *
 * All three are parsed so no record is invisible to the census; only `table` is legal, which
 * {@link checkFile} reports separately. Adding a spelling here makes previously-unreadable records
 * visible as violations — it never grants them a pass.
 * @type {StatusSyntax[]}
 */
export const STATUS_SYNTAXES = [
    {name: 'table',        canonical: true,  pattern: /^\|\s*\*\*Status\*\*\s*\|\s*(.+?)\s*\|\s*$/},
    {name: 'colon-outside', canonical: false, pattern: /^\*\*Status\*\*:\s*(.+?)\s*$/},
    {name: 'colon-inside',  canonical: false, pattern: /^\*\*Status:\*\*\s*(.+?)\s*$/}
];

/** An ISO calendar date anywhere in the status value, which is what makes an `Accepted` claim checkable. */
const ISO_DATE = /\b\d{4}-\d{2}-\d{2}\b/;

/**
 * @summary Finds every `Status` field in one record, across all known spellings.
 *
 * Returns all matches rather than the first: a record carrying two status lines is ambiguous, and
 * silently taking the earlier one is how a stale field survives beside a corrected one.
 *
 * @param {String} content Record markdown.
 * @returns {StatusField[]} Matches in file order.
 */
export function findStatusFields(content) {
    const matches = [];

    content.split('\n').forEach((line, index) => {
        for (const {name, canonical, pattern} of STATUS_SYNTAXES) {
            const match = pattern.exec(line);

            if (match) {
                matches.push({syntax: name, canonical, line: index + 1, value: match[1].trim()});
                break
            }
        }
    });

    return matches
}

/**
 * @summary Splits a status value into its state word and the remainder that must justify it.
 * @param {String} value Raw status text — a state word followed by its date and evidence.
 * @returns {{state: String, rest: String}} `state` is the leading word, `rest` everything after it.
 */
export function parseStatusValue(value) {
    const match = /^\**\s*([A-Za-z]+)\b(.*)$/s.exec(value);

    return match ? {state: match[1], rest: match[2]} : {state: '', rest: value}
}

/**
 * @summary Checks one record and returns its violations.
 *
 * Each violation carries a `kind` so callers can assert on the failure class rather than on message
 * prose, and a remedy the author can act on without reading this file.
 *
 * @param {String} file Record filename, used in messages.
 * @param {String} content Record markdown.
 * @returns {StatusViolation[]}
 */
export function checkFile(file, content) {
    const
        violations = [],
        fields     = findStatusFields(content),
        add        = (kind, line, message) => violations.push({kind, file, line, message});

    if (fields.length === 0) {
        add('no-status', null, 'no Status field in any known spelling — a record whose status cannot be read is indistinguishable from one that passed');
        return violations
    }

    if (fields.length > 1) {
        add('multiple-status', fields[1].line, `${fields.length} Status fields (lines ${fields.map(field => field.line).join(', ')}) — exactly one is authoritative, and nothing here says which`)
    }

    const
        field         = fields[0],
        {state, rest} = parseStatusValue(field.value);

    if (!field.canonical) {
        add('non-canonical-syntax', field.line, `Status uses the \`${field.syntax}\` spelling; the canonical form is the table row \`| **Status** | … |\``)
    }

    if (!LEGAL_STATES.includes(state)) {
        add('unknown-state', field.line, `unknown state \`${state || field.value}\`; the corpus vocabulary is ${LEGAL_STATES.join(' / ')} — extend LEGAL_STATES deliberately if a fourth is intended`);
        return violations
    }

    if (state === 'Accepted' && !ISO_DATE.test(rest)) {
        add('undated-accepted', field.line, 'Accepted without a YYYY-MM-DD date, so the claim names no merge a reader could check')
    }

    if (PENDING_STATES.includes(state) && !field.value.includes(OUTSTANDING_MARKER)) {
        add('self-satisfying-condition', field.line, `\`${state}\` without an \`${OUTSTANDING_MARKER}\` clause. A condition of the "on PR merge" family is satisfied by the merge that publishes this record, so nothing later will ever prompt the flip. Write \`Accepted — YYYY-MM-DD\` in this pull request, or state with \`${OUTSTANDING_MARKER}\` what a reader would still be waiting for`)
    }

    return violations
}

/**
 * @summary Runs the check across the corpus and reports compliance.
 * @param {String} [dir=DECISIONS_DIR] Decisions directory.
 * @returns {{ok: Boolean, violations: Object[], accepted: Number, total: Number, percent: Number}}
 */
export function checkAdrStatus(dir = DECISIONS_DIR) {
    const
        files      = fs.readdirSync(dir).filter(name => /^\d{4}-.*\.md$/.test(name)).sort(),
        violations = [];

    let accepted = 0;

    for (const file of files) {
        const
            content = fs.readFileSync(path.join(dir, file), 'utf8'),
            fields  = findStatusFields(content);

        if (fields.length && parseStatusValue(fields[0].value).state === 'Accepted') {
            accepted++
        }

        violations.push(...checkFile(file, content))
    }

    return {
        ok     : violations.length === 0,
        percent: files.length ? Math.round(accepted / files.length * 100) : 0,
        total  : files.length,
        accepted,
        violations
    }
}

if (process.argv[1] === __filename) {
    const result = checkAdrStatus();

    console.log(`ADR status compliance: ${result.accepted}/${result.total} Accepted (${result.percent}%)`);

    if (!result.ok) {
        console.error(`\n${result.violations.length} status violation(s):\n`);

        for (const {kind, file, line, message} of result.violations) {
            console.error(`  ${file}${line ? `:${line}` : ''} [${kind}]\n    ${message}\n`)
        }

        process.exit(1)
    }

    console.log('All decision records carry a status consistent with their own stated condition.')
}
