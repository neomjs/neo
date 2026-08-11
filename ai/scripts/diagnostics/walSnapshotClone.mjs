/**
 * @plane in-plane
 */
import crypto from 'node:crypto';
import path   from 'node:path';

import {CANONICAL_PLANE_ID, assertPlaneCoherence} from '../../planeConfig.mjs';

/**
 * @module ai/scripts/diagnostics/walSnapshotClone
 * @summary Plans a snapshot-clone of a plane onto an overlay identity and records the pre-clone
 * fingerprint that later makes promotion or demotion provable.
 *
 * ## The overlay invariant is DELEGATED, never re-derived
 *
 * `planeConfig.assertPlaneCoherence` already owns the rule that matters here: an overlay identity must
 * be opaque (no path separators, no data-dir content) and must not resolve to the canonical durable
 * root. That rule exists because *"an overlay could be mistaken for canonical and mutate the durable
 * plane"* — the exact hazard a pilot clone introduces.
 *
 * So this module **calls** it rather than re-checking its clauses. A second copy of a safety predicate
 * is not defence in depth; it is two predicates that will disagree, and the one that drifts is the one
 * nobody is testing. `planeConfig` is dependency-free (`node:fs` + `node:path`), so delegation costs
 * nothing.
 *
 * The one adaptation: `assertPlaneCoherence` **throws**, and every planner in this diagnostic family
 * **refuses** with a reason. The throw is caught and converted, so a caller gets one uniform result
 * shape and a boot-path caller cannot be surprised by an exception. The verdict is still the shared
 * predicate's — only its delivery changes.
 *
 * ## Why a pre-clone fingerprint, and why it is content-free
 *
 * A pilot ends in promotion (the overlay becomes the seat's reality) or demotion (the overlay is
 * discarded). Both dispositions need to answer *"what was cloned?"* — otherwise a replay cannot
 * distinguish a write the pilot made from a write it inherited, and `failed-contained` cannot be
 * distinguished from silent partial loss.
 *
 * The fingerprint is computed from segment **name, byte length, and mtime** — deliberately not from
 * segment contents. It has to be cheap enough to take before every clone, and it carries no memory
 * text, so a fingerprint is safe to record in a receipt or a ticket. That is a real limit and it is
 * stated rather than implied: this detects a corpus that **changed**, not a corpus whose bytes were
 * rewritten to the same length at the same timestamp.
 */

/**
 * @summary Deterministic, order-independent digest of a corpus's pre-clone state.
 *
 * Sorted by segment name before hashing, so two scans that enumerate the same corpus in different
 * directory order produce the **same** fingerprint. Without that, a fingerprint mismatch would report
 * filesystem iteration order as corpus drift.
 * @param {Object[]} segments `[{name, bytes, mtimeMs}]`, e.g. from `walVolumeBaseline.readWalSegments`.
 * @returns {Object} `{ok, reason?, digest, segmentCount, totalBytes}`
 */
export function fingerprintCorpus(segments) {
    if (!Array.isArray(segments)) return {ok: false, reason: 'segments must be an array'};

    const bad = segments.findIndex(segment =>
        typeof segment?.name !== 'string' ||
        typeof segment?.bytes !== 'number' ||
        typeof segment?.mtimeMs !== 'number'
    );

    if (bad !== -1) {
        return {
            ok    : false,
            reason: `segment at index ${bad} lacks a usable {name, bytes, mtimeMs}; a fingerprint over ` +
                    'partial metadata would compare unequal corpora as equal'
        };
    }

    const ordered = [...segments].sort((a, b) => a.name.localeCompare(b.name)),
          hash    = crypto.createHash('sha256'),
          // Length-prefixed, matching `digestAppliedStages`. The previous `\0`-delimited form was injective
          // only because POSIX forbids NUL in a filename — correct, but resting on an external invariant
          // this module does not own. A segment name CAN legally contain a newline, and the old form also
          // used `\n` as its record terminator. Length prefixes make the encoding unambiguous on its own
          // terms, so no filesystem guarantee has to hold for the fingerprint to distinguish two corpora.
          write   = value => {
              const bytes = Buffer.from(String(value), 'utf8');

              hash.update(`${bytes.length}:`);
              hash.update(bytes);
          };

    for (const segment of ordered) {
        write(segment.name);
        write(segment.bytes);
        write(segment.mtimeMs);
    }

    return {
        ok          : true,
        digest      : hash.digest('hex'),
        segmentCount: ordered.length,
        totalBytes  : ordered.reduce((sum, segment) => sum + segment.bytes, 0)
    };
}

/**
 * @summary Plans a snapshot-clone onto an overlay identity, refusing any overlay that could touch the
 * durable plane, and returns the pre-clone fingerprint alongside the plan.
 *
 * The fingerprint is taken **before** the plan is returned and is part of the same result, so a caller
 * cannot clone first and fingerprint afterwards — an after-the-fact fingerprint describes the corpus
 * the clone produced, not the one it started from, and the whole point is to know the starting state.
 * @param {Object}   spec
 * @param {String}   spec.overlayPlaneId     Opaque overlay identity (never path-shaped).
 * @param {String}   spec.overlayDataRoot    Absolute root the overlay will occupy.
 * @param {String}   spec.canonicalDataRoot  Absolute durable root the overlay must NOT resolve to.
 * @param {Object[]} spec.segments           Source corpus, for the pre-clone fingerprint.
 * @param {String}   [spec.canonicalPlaneId] Canonical identity; defaults to `planeConfig`'s.
 * @param {Function} [spec.realpathFn]       Injected for tests; forwarded to `assertPlaneCoherence`.
 * @returns {Object} `{ok, reason?, overlayPlaneId, overlayDataRoot, preCloneFingerprint}`
 */
export function planSnapshotClone({
    overlayPlaneId,
    overlayDataRoot,
    canonicalDataRoot,
    segments,
    canonicalPlaneId,
    realpathFn
} = {}) {
    const refuse = reason => ({ok: false, reason});

    // ADDITIONAL to the shared predicate, not a re-implementation of it — and the distinction matters.
    // `assertPlaneCoherence` clause 3 fires only for a NON-canonical planeId, deliberately: something
    // declaring itself canonical is not an overlay, and that is how the canonical plane declares its
    // own root. So the shared predicate cannot catch a clone that IMPERSONATES canonical, because at
    // that layer impersonation and being-canonical are the same statement.
    //
    // This planner is the layer that knows it is planning an overlay, so the constraint belongs here:
    // a snapshot clone reusing the canonical identity is an identity collision — two planes both
    // claiming to be canonical, which is the "mistaken for canonical" hazard arriving from the
    // direction clause 3 does not watch. Found by a control that expected the shared predicate to
    // reject it; the predicate was right and the gap was mine.
    // FAIL-OPEN CLOSED. `assertPlaneCoherence` makes `canonicalDataRoot` optional — legitimately, since a
    // general caller may only be checking opacity and absoluteness. But its overlay-isolation clause is
    // guarded by `canonicalDataRoot &&`, so omitting the comparator SKIPS the very check this planner
    // exists to enforce: a clone would plan `ok:true` with its isolation unverified. Optional upstream,
    // mandatory at this boundary.
    if (typeof canonicalDataRoot !== 'string' || !path.isAbsolute(canonicalDataRoot)) {
        return refuse(
            `canonicalDataRoot must be an absolute path, received ${JSON.stringify(canonicalDataRoot)}. ` +
            'It is REQUIRED here even though assertPlaneCoherence treats it as optional: its isolation ' +
            'clause is skipped when the comparator is absent, so a clone planned without it would report ' +
            'success with the durable-root separation never checked.'
        );
    }

    if (overlayPlaneId === (canonicalPlaneId ?? CANONICAL_PLANE_ID)) {
        return refuse(
            `overlayPlaneId "${overlayPlaneId}" is the canonical plane identity — a snapshot clone must ` +
            'declare a DISTINCT overlay identity. Reusing it would leave two planes claiming to be ' +
            'canonical, which planeConfig.assertPlaneCoherence cannot detect: its overlay clause only ' +
            'inspects non-canonical identities. Its CANNOT-detect section carries the full boundary.'
        );
    }

    try {
        // The shared predicate owns the verdict: opacity, absoluteness, and overlay-vs-canonical
        // separation. Passing `canonicalPlaneId`/`realpathFn` only when supplied keeps its own
        // defaults authoritative instead of shadowing them with undefined.
        assertPlaneCoherence({
            planeId : overlayPlaneId,
            dataRoot: overlayDataRoot,
            canonicalDataRoot,
            ...(canonicalPlaneId === undefined ? {} : {canonicalPlaneId}),
            ...(realpathFn === undefined ? {} : {realpathFn})
        });
    } catch (error) {
        // Converted, not swallowed: the reason is the shared predicate's own message, so a reader is
        // pointed at `planeConfig` rather than at a paraphrase of it.
        return refuse(`overlay identity rejected by planeConfig.assertPlaneCoherence — ${error.message}`);
    }

    const fingerprint = fingerprintCorpus(segments);

    if (!fingerprint.ok) {
        return refuse(
            `pre-clone fingerprint failed (${fingerprint.reason}). Refusing the clone: a snapshot whose ` +
            'starting state was never recorded cannot support a promotion or demotion disposition later.'
        );
    }

    return {
        ok                 : true,
        overlayPlaneId,
        overlayDataRoot,
        preCloneFingerprint: {
            digest      : fingerprint.digest,
            segmentCount: fingerprint.segmentCount,
            totalBytes  : fingerprint.totalBytes
        }
    };
}
