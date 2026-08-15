import {createHash} from 'node:crypto';

/**
 * @module ai/services/memory-core/helpers/defectObservationFold
 * @summary The zero-ceremony defect channel's read model: a deterministic fingerprint for
 * `defect-note:` lines, and a pure fold that projects mailbox notes into standing observation
 * records.
 *
 * Design notes (the "explicitly non-memory operational incident ledger" clause): the mailbox is
 * the canonical writer AND store — append-only, already durable, already every seat's channel.
 * This module never writes anything; the ledger IS the fold. That gives the graduated contract
 * for free: deterministic identity (the fingerprint computes from the note alone), idempotent
 * RED↔RECOVERED (state is recomputed from the full note set, so a duplicate transition changes
 * nothing), operator override (an operator note is just another row), and aging (a fold
 * parameter, so no daemon mutates anything to mark a record quiet). Append-only trail + pure
 * projection — never a second memory authority.
 *
 * The note format (ticket-create's defect-channel exemption):
 *
 *     defect-note: <surface> broke <observed symptom>
 *     defect-note: [recovered] <surface> broke <observed symptom>   ← same fingerprint, recovery arm
 *
 * The `[recovered]` marker flips the observation to `recovered`; a later plain note re-opens it
 * to `red`. Notes that do not parse still fold — their fingerprint derives from the normalized
 * raw line, so even malformed captures aggregate instead of vanishing.
 */

/**
 * Filename-free, store-free: nothing to address. The fold consumes message-like rows.
 */

/**
 * Volatile tokens collapse so the same defect sighted twice fingerprints identically: digit runs
 * (counts, ports, epochs) and long hex runs (hashes, ids) carry no defect identity.
 * @type {RegExp}
 */
const VOLATILE_TOKEN_PATTERN = /[0-9a-f]{8,}|\d+/gi;

/**
 * @summary The deterministic observation identity for one defect-note line.
 *
 * Normalization is deliberately shallow: lowercase, whitespace collapse, volatile-token strip.
 * Deeper "similarity" is ranking, and ranking is a second authority — two notes merge exactly
 * when they normalize identically, which a filer can reason about at capture time.
 *
 * @param {String} line The note text (with or without the `defect-note:` prefix).
 * @returns {String} 16 hex chars — stable for the same normalized line.
 */
export function defectNoteFingerprint(line) {
    const normalized = String(line ?? '')
        .replace(/^\s*defect-note:\s*/i, '')
        .replace(/^\s*\[recovered\]\s*/i, '')
        .toLowerCase()
        .replace(VOLATILE_TOKEN_PATTERN, '#')
        .replace(/\s+/g, ' ')
        .trim();

    return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

/**
 * @summary Parses one note line into its surface/symptom arms.
 * @param {String} line
 * @returns {{surface: String, symptom: String, recovered: Boolean, parseable: Boolean}}
 */
export function parseDefectNote(line) {
    const text       = String(line ?? '').replace(/^\s*defect-note:\s*/i, '').trim(),
          recovered  = /^\[recovered\]\s*/i.test(text),
          body       = text.replace(/^\[recovered\]\s*/i, ''),
          brokeIndex = body.indexOf(' broke ');

    if (brokeIndex === -1) {
        return {parseable: false, recovered, surface: body, symptom: ''};
    }

    return {
        parseable: true,
        recovered,
        surface  : body.slice(0, brokeIndex).trim(),
        symptom  : body.slice(brokeIndex + 7).trim()
    };
}

/**
 * @summary Folds `defect-note:` rows into one standing observation record per fingerprint.
 *
 * Input rows need only `{subject, body, from, sentAt}` — the note text is `body` when present,
 * else the subject (broadcasts may carry the whole sighting in the subject). Pure: no I/O, no
 * clock — `now` is passed in so aging is decidable in a spec.
 *
 * State machine per fingerprint: `red` (open sightings) → `recovered` (a recovery note is the
 * latest transition) → `red` again if a fresh sighting lands after recovery. `quiet` is the
 * aging overlay: no note of any kind within `quietAfterMs` of `now`, regardless of state.
 *
 * @param {Object[]} rows Message-like rows (`{subject, body, from, sentAt}`).
 * @param {Object}     [options]
 * @param {Number}     [options.now=Date.now()]            Fold instant (epoch ms).
 * @param {Number}     [options.quietAfterMs=604800000]    Aging window — default 7 days.
 * @returns {Array<Object>} Standing records, most-recently-active first.
 */
export function foldDefectObservations(rows, {now = Date.now(), quietAfterMs = 7 * 24 * 60 * 60 * 1000} = {}) {
    if (!Number.isFinite(now) || !Number.isFinite(quietAfterMs) || quietAfterMs <= 0) {
        throw new Error('foldDefectObservations: now and a positive finite quietAfterMs are required');
    }

    const records = new Map();

    for (const row of Array.isArray(rows) ? rows : []) {
        const text = String(row?.body || row?.subject || ''),
              at   = Date.parse(row?.sentAt);

        if (!text.trim() || !Number.isFinite(at)) continue;

        const fingerprint = defectNoteFingerprint(text),
              parsed      = parseDefectNote(text),
              existing    = records.get(fingerprint);

        if (!existing) {
            records.set(fingerprint, {
                fingerprint,
                surface    : parsed.surface,
                symptom    : parsed.symptom,
                parseable  : parsed.parseable,
                count      : 1,
                reporters  : [...new Set([row.from].filter(Boolean))],
                firstSeenAt: new Date(at).toISOString(),
                lastSeenAt : new Date(at).toISOString(),
                state      : parsed.recovered ? 'recovered' : 'red'
            });
            continue;
        }

        existing.count++;
        if (row.from && !existing.reporters.includes(row.from)) existing.reporters.push(row.from);
        if (at < Date.parse(existing.firstSeenAt)) existing.firstSeenAt = new Date(at).toISOString();
        if (at > Date.parse(existing.lastSeenAt)) {
            existing.lastSeenAt = new Date(at).toISOString();
            // The newest transition wins: a recovery note closes, a fresh sighting re-opens.
            existing.state      = parsed.recovered ? 'recovered' : 'red';
        }
    }

    return [...records.values()]
        .map(record => ({
            ...record,
            state: now - Date.parse(record.lastSeenAt) > quietAfterMs ? 'quiet' : record.state
        }))
        .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
}
