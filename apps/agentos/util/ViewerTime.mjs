import Base from '../../../src/core/Base.mjs';

/**
 * @summary The cockpit's ONE human-facing instant formatter: viewer-local, `Intl`-driven, with the
 * exact UTC instant preserved for receipt-grade reading.
 *
 * **Why this module exists at all.** Four surfaces rendered instants and every one of them derived
 * its string from UTC — `ActivityStream` as `toISOString().slice(11, 16)`, and `CatchUpPane`,
 * `MemoriesPane` and `WakeRoutePane` through three byte-identical copies of
 * `toISOString().replace('T', ' ').slice(0, 16) + 'Z'`. An operator seat in Europe/Berlin therefore
 * did offset arithmetic on every glance at surfaces whose whole purpose is at-a-glance truth. The
 * drift here was not four different formats competing; it was one format copy-pasted until nobody
 * owned it, which is the harder kind to notice — every surface looks locally consistent.
 *
 * **The split this module draws, and it is deliberate:**
 * - **Format is single-sourced here.** Locale, zone, and the same-day/older ladder are one rule.
 * - **Miss-copy stays with the surface.** An unformattable instant returns `null`, and each caller
 *   renders its own empty state — a dense stream row wants `—`, a prose pane wants `unknown time`.
 *   Those are different vocabularies for the same fact, and collapsing them would trade a real
 *   formatting duplication for a fake copy uniformity.
 *
 * **The wire is not touched and must not be.** DTOs carry ISO-8601 UTC because receipts and
 * cross-checks depend on wire-time being zone-free; this module is a presentation edge, applied at
 * render and never written back.
 *
 * **`title` is the receipt.** Local text answers "when, for me"; the hover answers "which instant,
 * exactly" — so an operator reading a row and an agent citing it in evidence are not forced to pick.
 */

/**
 * @summary Shared same-day predicate over the viewer's calendar, not UTC's.
 * Comparing UTC dates would call 23:30 Berlin "yesterday" for half the evening.
 * @param {Intl.DateTimeFormat} dayFormat
 * @param {Date} date
 * @param {Date} now
 * @returns {Boolean}
 * @private
 */
function isSameViewerDay(dayFormat, date, now) {
    return dayFormat.format(date) === dayFormat.format(now)
}

/**
 * Static viewer-local time formatting utilities for AgentOS surfaces.
 * @class AgentOS.util.ViewerTime
 * @extends Neo.core.Base
 */
class ViewerTime extends Base {
    static config = {
        /**
         * @member {String} className='AgentOS.util.ViewerTime'
         * @protected
         */
        className: 'AgentOS.util.ViewerTime'
    }

    /**
     * @summary The receipt half for surfaces that interpolate a stamp INTO a sentence.
     *
     * `formatViewerTime` hands back `{text, title}` and a caller rendering the instant as its own
     * element can use both. A prose line cannot: `captured ${stamp}` is one string, so a per-substring
     * `title` would need the line split into nested nodes for a hover nobody asked to be that precise.
     * The proportionate answer is a title on the CONTAINING line, which is what this builds.
     *
     * **Without it these panes lose citability outright, and that is a regression rather than a gap.**
     * They previously rendered `2026-08-03 20:01Z` — exact, zone-free, quotable into an evidence table.
     * Viewer-local text alone has no year and no zone marker, so an agent citing a catch-up window or a
     * capture time would have nothing recoverable. The module's promise that the operator and the citing
     * agent are "not forced to pick" only holds if this travels with the text.
     *
     * Multiple instants join with `·` in argument order, matching how the sentence reads them.
     * @param {...(String|Number|Date|null)} instants
     * @returns {String|null} ISO instants joined, or null when none are formattable — `null` is the
     *     remove signal for `changeVdomRootKey`, so a line that loses its stamp loses its title too.
     */
    static viewerTimeTitle(...instants) {
        const isos = instants.map(instant => ViewerTime.formatViewerTime(instant)?.title).filter(Boolean);

        return isos.length > 0 ? isos.join(' · ') : null
    }

    /**
     * @summary Format one instant for a human reader in the viewer's own locale and zone.
     *
     * Same-day instants render time-only (the dense, scannable case that dominates a live surface);
     * older instants gain a compact locale-aware date part, because a bare `08:15` on a three-day-old
     * row is actively misleading rather than merely terse.
     *
     * @param {String|Number|Date|null} instant ISO-8601 string, epoch ms, or Date.
     * @param {Object} [options={}]
     * @param {String|String[]} [options.locale] Override the viewer locale — tests pin this.
     * @param {String} [options.timeZone] Override the viewer zone — tests pin this.
     * @param {Date|Number} [options.now=new Date()] Reference for the same-day ladder; injectable so the
     *     ladder is testable without waiting for midnight.
     * @returns {{text: String, title: String}|null} `null` when the instant is absent or unparseable —
     *     the caller owns its own miss-copy (see the module summary).
     */
    static formatViewerTime(instant, options = {}) {
        if (instant === null || instant === undefined || instant === '') {
            return null
        }

        const date = instant instanceof Date ? instant : new Date(instant);

        if (!Number.isFinite(date.getTime())) {
            return null
        }

        const
            {locale, timeZone} = options,
            now                = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now()),
            // A zone the runtime rejects would throw from the constructor and take the whole row's render
            // with it. An instant is never worth a blank surface, so an invalid override degrades to the
            // viewer's resolved zone rather than propagating.
            zoneOptions        = timeZone ? {timeZone} : {};

        let timeFormat, dayFormat, dateFormat;

        try {
            timeFormat = new Intl.DateTimeFormat(locale, {hour: '2-digit', minute: '2-digit', ...zoneOptions});
            dayFormat  = new Intl.DateTimeFormat(locale, {year: 'numeric', month: '2-digit', day: '2-digit', ...zoneOptions});
            dateFormat = new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric', ...zoneOptions})
        } catch {
            // Only the ZONE is discarded. An earlier revision rebuilt with `undefined` locale too, which
            // silently threw away a perfectly valid locale because a sibling option was bad: `de-DE` +
            // a broken zone fell back to the ambient locale and flipped 24-hour `10:15` to `10:15 AM`.
            // Degrade the option that failed, never its neighbours.
            timeFormat = new Intl.DateTimeFormat(locale, {hour: '2-digit', minute: '2-digit'});
            dayFormat  = new Intl.DateTimeFormat(locale, {year: 'numeric', month: '2-digit', day: '2-digit'});
            dateFormat = new Intl.DateTimeFormat(locale, {month: 'short', day: 'numeric'})
        }

        const time = timeFormat.format(date);

        return {
            text : isSameViewerDay(dayFormat, date, now) ? time : `${dateFormat.format(date)} ${time}`,
            // The receipt half: the exact zone-free instant the wire carries, unchanged.
            title: date.toISOString()
        }
    }
}

export default Neo.setupClass(ViewerTime);
