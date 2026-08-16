import {formatAge} from './agentFreshness.mjs';

/**
 * @module apps/agentos/view/fleet/viewerWakeTelltale
 * @summary Pure derivation for the cockpit chrome's per-viewer wake-push telltale — the quiet
 * readout of MY push lane's health, a different axis from every existing surface: the spine banner
 * speaks for the fleet transport, the per-agent telltales for each resident's wake ROUTE, and this
 * chip for the viewer's own live stream. Push is latency, poll is truth — so a degraded push lane
 * is a quiet reason here, never a spine incident.
 *
 * Vocabulary is the consumer's, verbatim ({@link module:apps/agentos/fleet/fleetWakeStreamConsumer}
 * `resolveDeliveryLiveness`): `alive: true` is the only positive state; everything else is
 * `unknown` WITH the consumer's own reason — absence of signal, never a fabricated verdict. The
 * catch-up axis keeps its three states apart by construction (`fresh` ≠ `empty` ≠ `failed`), and
 * an absent observation renders as absence (`no catch-up observation`), never borrowed `unknown` —
 * the same tri-state honesty the card telltales pinned.
 */

/**
 * @summary Derives the telltale chip from the provider-held viewer-wake truths.
 *
 * The chip is deliberately ALWAYS rendered (unlike the exception-only card chips): the viewer's
 * push lane has exactly one instance, its nominal state is one quiet token wide ("wake: live"),
 * and an operator glancing at chrome must be able to tell "live" from "nobody wired it" without a
 * drill-in. Detail travels on `title` — the catch-up line plus the last observed signals — so the
 * hover answers what the chip has no room for.
 *
 * @param {Object} options
 * @param {Object|null} [options.stream] `{alive: true|'unknown', reason, capturedAt}` — the
 *     consumer's own liveness observation, stamped by the cockpit.
 * @param {Object|null} [options.catchUp] `{state: 'fresh'|'failed'|'empty', at, pending}` or
 *     `null` when no catch-up observation exists (seam unwired, or none fired yet).
 * @param {Object[]} [options.signals] Newest-first `{kind, emittedAt, receivedAt}` rows from the
 *     viewer wake feed (already bounded; only the first few enter the title).
 * @param {Number} [options.nowMs=Date.now()] Injectable clock for the relative labels.
 * @returns {{cls: String[], text: String, title: String, ariaLabel: String}}
 */
export function describeViewerWakeTelltale({stream = null, catchUp = null, signals = [], nowMs = Date.now()} = {}) {
    const
        alive      = stream?.alive === true,
        reason     = typeof stream?.reason === 'string' && stream.reason.trim() ? stream.reason : 'no stream observation',
        lastSignal = signals[0] ?? null;

    let text;

    if (alive) {
        const relative = Number.isFinite(lastSignal?.receivedAt) ? ` · ${formatAge(nowMs - lastSignal.receivedAt)}` : '';

        text = `wake: live${relative}`
    } else {
        // The consumer's absence-of-signal grammar passes through verbatim — the reason IS the
        // rendering, whether the stream is disconnected, handshake-pending, or never wired.
        text = `wake: ${reason}`
    }

    const catchUpLine = catchUp
        ? `catch-up: ${catchUp.state}${Number.isFinite(catchUp.pending) && catchUp.pending > 0 ? ` (${catchUp.pending} pending drained)` : ''}${Number.isFinite(catchUp.at) ? ` · ${formatAge(nowMs - catchUp.at)}` : ''}`
        : 'catch-up: no observation';

    const signalLines = signals.slice(0, 5).map(signal =>
        `${signal.kind ?? 'wake'}${Number.isFinite(signal.receivedAt) ? ` · ${formatAge(nowMs - signal.receivedAt)}` : ''}`);

    const title = [
        alive ? `wake push live — ${reason}` : `wake push unavailable — ${reason}`,
        catchUpLine,
        signalLines.length ? `last signals: ${signalLines.join(' | ')}` : 'no signals observed on this stream'
    ].join('\n');

    return {
        ariaLabel: `Viewer wake push: ${text}`,
        cls      : ['fm-viewer-wake', alive ? 'fm-viewer-wake-live' : 'fm-viewer-wake-degraded'],
        text,
        title
    }
}

export default describeViewerWakeTelltale;
