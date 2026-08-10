import crypto from 'crypto';

/**
 * @module ai/services/shared/embeddingIdentityWindow
 * @summary The re-embed ratio: how much embedding work was spent re-doing content already embedded.
 *
 * Provider load alone cannot tell a converging ingestion from a loop. Both look like sustained
 * inference, and the attribution ledger answers *which stage* is calling — never *whether it should
 * still be calling*. The discriminator is identity: a sweep that embeds 500 texts of which 100 are
 * distinct is not busy, it is repeating.
 *
 * **The ratio is `submissions / distinct` over a bounded window**, so a clean run holds at exactly 1
 * and repetition drives it up without needing to know the corpus size in advance.
 *
 * ## A ratio above 1 is NOT a defect, and treating it as one destroys the instrument
 *
 * Real corpora duplicate content honestly — two guides quoting the same snippet embed the same text
 * twice, and that is correct work. An alarm keyed on `ratio > 1` fires on healthy ingestion and is
 * switched off within a week, at which point we have neither an alarm nor the option of one. The
 * ratio is a **denominator for a judgement**, not the judgement: it is only anomalous while pending
 * work fails to fall, which is a question this module deliberately does not answer alone.
 *
 * ## Coverage is reported, never assumed
 *
 * The window is in-process and bounded, so there are exactly two ways to have no repeats to report:
 * genuinely no repetition, or **no observation** — a fresh process, or a window whose oldest entries
 * were evicted. Those are different facts and a consumer must not read the second as the first.
 * `coverageStartedAt` and `truncated` make the difference visible, for the same reason the WAL drain
 * receipt carries them: a partial answer presented as a total is the false zero one layer up.
 *
 * Pure and fully injectable (clock only), so the state machine is testable without a provider.
 *
 * @see ai/daemons/shared/drainDisposition.mjs   the same bounded-window/coverage discipline
 * @see ai/services/shared/providerActivityLedger.mjs   the volume half this is the identity half of
 */

/**
 * @summary Fingerprints one embedding input.
 *
 * Truncated sha1 rather than the text: the window must never become a second copy of the corpus, and
 * identity is all the ratio needs. Collisions understate repetition, which is the safe direction —
 * this instrument exists to raise a question, and a false quiet is preferable to a false alarm it
 * would be switched off for.
 * @param {String} text Embedding input.
 * @returns {String} 16-hex-character fingerprint.
 */
export function fingerprintEmbeddingInput(text) {
    return crypto.createHash('sha1').update(String(text)).digest('hex').slice(0, 16)
}

/**
 * @summary Creates a bounded re-embed-ratio window.
 *
 * @param {Object}   [options]
 * @param {Number}   [options.limit=2048] Maximum retained submissions.
 * @param {Function} [options.now=Date.now] Injectable clock.
 * @returns {{recordSubmissions: Function, getWindow: Function}}
 */
export function createEmbeddingIdentityWindow({limit = 2048, now = Date.now} = {}) {
    const
        coverageStartedAt = now(),
        // Submissions, oldest first. Retaining each one rather than a running count is what lets the
        // window evict honestly: a count cannot be decremented when its input leaves the window.
        submissions       = [];

    let evicted = false;

    return {
        /**
         * @summary Records fingerprints for one batch of embedding inputs.
         * @param {String[]} texts Inputs submitted to the provider.
         */
        recordSubmissions(texts = []) {
            for (const text of texts) {
                submissions.push({at: now(), fingerprint: fingerprintEmbeddingInput(text)});
            }

            while (submissions.length > limit) {
                submissions.shift();
                evicted = true
            }
        },

        /**
         * @summary The ratio and the bounds that make it readable.
         *
         * `ratio` is null — never 1 — when nothing has been observed. One is the value of a clean
         * run, and returning it for an empty window would report "no repetition" for a process that
         * has not looked.
         * @returns {{coverageStartedAt: Number, distinct: Number, ratio: Number|null, submissions: Number, truncated: Boolean}}
         */
        getWindow() {
            const distinct = new Set(submissions.map(entry => entry.fingerprint)).size;

            return {
                coverageStartedAt,
                distinct,
                ratio      : distinct === 0 ? null : submissions.length / distinct,
                submissions: submissions.length,
                truncated  : evicted
            }
        }
    }
}
