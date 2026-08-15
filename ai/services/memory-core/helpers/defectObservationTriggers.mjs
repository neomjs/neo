import {defectNoteFingerprint} from './defectObservationFold.mjs';

/**
 * @module ai/services/memory-core/helpers/defectObservationTriggers
 * @summary The defect ledger's observer layer: the promotion-trigger predicates over the fold's
 * output, and the digest selection that decides which standing observations newly deserve peer
 * attention.
 *
 * The fold computes records; this module answers "has a trigger line been crossed, and has
 * anyone been told". Both stay pure: no I/O, no clock, no store. The mailbox remains the only
 * authority — suppression is derived from the same note stream (a `[promoted]`/`[dismissed]`
 * marker note keys to the same fingerprint), and the digest's own history is read back from prior
 * digest messages, so nothing here needs a second ledger.
 *
 * The read side's discipline mirrors the channel's write side: capture is cheap, attention is
 * not. A digest fires at most once per count growth per observation, and promotion stays a
 * deliberate full-ceremony act — the ticket reference is what makes it one, and a bare
 * `[promoted]` suppresses nothing. This module produces attention, never backlog admission.
 */

/**
 * Subject prefix of the digest broadcast. Prior digests are located by this prefix and their
 * coverage parsed back out of the body, which is what makes re-report suppression store-free.
 * @type {String}
 */
export const DIGEST_SUBJECT_PREFIX = 'defect-ledger-digest:';

const PROMOTED_MARKER_PATTERN  = /^\s*\[promoted\b([^\]]*)\]\s*/i;
const DISMISSED_MARKER_PATTERN = /^\s*\[dismissed\b[^\]]*\]\s*/i;

/**
 * @summary The one fold-decidable promotion trigger: two or more sightings from two or more
 * distinct reporters. A single reporter re-confirming their own note is one observation's echo,
 * not independent corroboration.
 * @param {Object} record One standing observation record from the fold.
 * @returns {Boolean}
 */
export function independentSecondOccurrence(record) {
    return Boolean(record)
        && record.count >= 2
        && Array.isArray(record.reporters)
        && record.reporters.length >= 2;
}

/**
 * @summary Fingerprints whose promotion or dismissal is already on the record.
 *
 * A `[promoted #N]` note from any seat suppresses: the ticket reference IS the ceremony — any
 * seat may promote, and the reference is the accountability trail (verifying that the ticket
 * exists needs a GitHub read, deliberately out of scope for this pure helper). A bare
 * `[promoted]` suppresses NOTHING, from any seat, the operator included: an accidental or
 * template-copied marker degrades toward re-attention (a visible duplicate row at triage),
 * never toward the permanent silence an unauthorised suppression would leave behind.
 * A `[dismissed]` note suppresses only from an operator identity — anyone else's is prose, not
 * a disposition. The marker note keys to the same observation by stripping the marker and
 * re-fingerprinting the remainder, so the suppression rides the channel's own identity rule
 * rather than a parallel keying scheme.
 *
 * @param {Object[]} rows Raw `defect-note:` mailbox rows (`{subject, from}`).
 * @param {Object}     [options]
 * @param {String[]}   [options.operatorIdentities=['@tobiu']] Identities whose dismissal counts.
 * @returns {Set<String>} Suppressed fingerprints.
 */
export function collectSuppressedFingerprints(rows, {operatorIdentities = ['@tobiu']} = {}) {
    const suppressed = new Set();

    for (const row of Array.isArray(rows) ? rows : []) {
        const
            text     = String(row?.subject || '').replace(/^\s*defect-note:\s*/i, ''),
            promoted = text.match(PROMOTED_MARKER_PATTERN);

        if (promoted) {
            // the reference is enforced, not decorative: a bare `[promoted]` is prose, exactly
            // like a non-operator `[dismissed]` — the observation keeps qualifying for the digest
            if (/#\d+/.test(promoted[1])) {
                suppressed.add(defectNoteFingerprint(text.replace(PROMOTED_MARKER_PATTERN, '')));
            }
        } else if (DISMISSED_MARKER_PATTERN.test(text) && operatorIdentities.includes(row?.from)) {
            suppressed.add(defectNoteFingerprint(text.replace(DISMISSED_MARKER_PATTERN, '')));
        }
    }

    return suppressed;
}

/**
 * @summary The standing observations that newly qualify for peer attention.
 *
 * Qualifying means: open (`red`, so a recovered or aged-out record stays silent), across the
 * independent-second-occurrence line, neither promoted nor dismissed, and not already reported
 * at this count. Prior coverage maps fingerprint → highest count already digested, so a record
 * re-qualifies exactly when new sightings land — the re-open-after-recovery case included, since
 * the re-opening note grows the count.
 *
 * @param {Object}               options
 * @param {Object[]}             options.records                Fold output (standing records).
 * @param {Set<String>}          [options.suppressedFingerprints] From {@link collectSuppressedFingerprints}.
 * @param {Object<String,Number>} [options.priorCoverage={}]    Fingerprint → highest digested count.
 * @returns {Object[]} The newly-qualifying records, fold order preserved.
 */
export function selectDigestRecords({records, suppressedFingerprints, priorCoverage = {}}) {
    const suppressed = suppressedFingerprints ?? new Set();

    return (Array.isArray(records) ? records : []).filter(record =>
        record.state === 'red'
        && independentSecondOccurrence(record)
        && !suppressed.has(record.fingerprint)
        && (priorCoverage[record.fingerprint] ?? 0) < record.count
    );
}

/**
 * @summary Reads prior digests' coverage back out of their bodies.
 *
 * Each digest carries a machine-readable ```json block of `{fingerprint, count}` entries; the
 * coverage union (max count per fingerprint) is the whole re-report suppression ledger. A body
 * that does not parse covers nothing — a malformed digest degrades to a duplicate report, never
 * to a swallowed one.
 *
 * @param {String[]} bodies Prior digest message bodies.
 * @returns {Object<String, Number>} Fingerprint → highest digested count.
 */
export function parseDigestCoverage(bodies) {
    const coverage = {};

    for (const body of Array.isArray(bodies) ? bodies : []) {
        const match = String(body ?? '').match(/```json\s*([\s\S]*?)```/);
        if (!match) continue;

        let entries;
        try {
            entries = JSON.parse(match[1]);
        } catch {
            continue;
        }

        for (const entry of Array.isArray(entries) ? entries : []) {
            if (entry?.fingerprint && Number.isInteger(entry.count)) {
                coverage[entry.fingerprint] = Math.max(coverage[entry.fingerprint] ?? 0, entry.count);
            }
        }
    }

    return coverage;
}

/**
 * @summary Renders one digest message: a human-readable ledger section plus the machine-readable
 * coverage block that the next run suppresses against.
 * @param {Object}    options
 * @param {Object[]}  options.records Newly-qualifying records (from {@link selectDigestRecords}).
 * @returns {String} The digest body.
 */
export function buildDigestBody({records}) {
    const lines = records.map(record =>
        `- \`${record.fingerprint}\` **${record.surface}** — ${record.symptom || '(unparsed note)'}\n` +
        `  ${record.count} notes · reporters ${record.reporters.join(', ') || 'unknown'} · last seen ${record.lastSeenAt}`
    );

    const coverage = records.map(record => ({fingerprint: record.fingerprint, count: record.count}));

    return [
        'Newly-qualifying defect observations — each crossed independent second occurrence with no',
        'promotion or dismissal on record. Promotion to a ticket runs full ceremony (ticket-create);',
        'this digest is attention, never admission. A `defect-note: [promoted #N] <same note>` or an',
        'operator `defect-note: [dismissed] <same note>` takes a row off this ledger.',
        '',
        ...lines,
        '',
        '```json',
        JSON.stringify(coverage),
        '```'
    ].join('\n');
}
