import Base from '../core/Base.mjs';

const dayMs = 86_400_000, MS_PER_MINUTE = 60_000, dayKeyPattern = /^\d{4}-\d{2}-\d{2}$/;
let lastZone, formatter;

/**
 * @summary Pure one-dimensional temporal scale and tick generator.
 * @description The one-dimensional temporal counterpart to `Neo.grid.RowGeometry`: maps `Date` values to
 * and from plain pixel offsets (`dateToOffset` / `offsetToDate`, aliased as `dateToX` / `xToDate`), snaps
 * and clamps timestamps, projects only viewport-visible ticks (`getTicks(visibleStart, visibleEnd)`) across
 * `'minute' | 'hour' | 'day' | 'week' | 'month'`, and provides timezone-safe `'YYYY-MM-DD'` local day keys
 * (`dayKey` / `parseDayKey`) without the `T12:00:00.000Z` UTC+12 day-shift bug. Performs zero DOM reads.
 * @class Neo.timeline.TimeAxis
 * @extends Neo.core.Base
 */
class TimeAxis extends Base {
    /**
     * @summary Represents an instant's calendar fields as UTC components for arithmetic independent of the viewer.
     * @param {Date} date An instant
     * @param {String|null} timeZone IANA zone, or null for the viewer's local calendar
     * @returns {Date} Wall-clock components accessible through the UTC getters; not the original instant.
     */
    static wallTimeInZone(date, timeZone) {
        if (!Number.isFinite(+date) || timeZone === 'UTC') return new Date(+date);

        const wall = new Date(0);
        if (timeZone == null) {
            wall.setUTCFullYear(date.getFullYear(), date.getMonth(), date.getDate());
            wall.setUTCHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
        } else {
            if (lastZone !== timeZone) {
                formatter = new Intl.DateTimeFormat('en-US', {
                    timeZone, calendar: 'iso8601', numberingSystem: 'latn', hourCycle: 'h23',
                    era : 'short', year: 'numeric', month: 'numeric', day: 'numeric',
                    hour: 'numeric', minute: 'numeric', second: 'numeric'
                });
                lastZone = timeZone
            }
            const parts = {};
            for (const {type, value} of formatter.formatToParts(date)) {
                if (type !== 'literal') parts[type] = value
            }
            wall.setUTCFullYear(parts.era === 'BC' ? 1 - Number(parts.year) : Number(parts.year), Number(parts.month) - 1, Number(parts.day));
            wall.setUTCHours(Number(parts.hour), Number(parts.minute), Number(parts.second), date.getUTCMilliseconds())
        }
        return wall
    }

    /**
     * @summary Resolves wall-clock components to an instant using Date's compatible transition behavior.
     * Repeated clock times select the earlier instant. Missing clock times advance by the duration of the gap.
     * @param {Date} wall Calendar components carried by the Date's UTC fields
     * @param {String|null} timeZone IANA zone, or null for the viewer's local calendar
     * @returns {Date} Resolved instant
     */
    static fromWallTimeInZone(wall, timeZone) {
        const coordinate = +wall;
        if (!Number.isFinite(coordinate) || timeZone === 'UTC') return new Date(coordinate);
        if (timeZone == null) {
            const local = new Date(0);
            local.setFullYear(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
            local.setHours(wall.getUTCHours(), wall.getUTCMinutes(), wall.getUTCSeconds(), wall.getUTCMilliseconds());
            return local
        }

        // Bracket both offsets even where a local day is skipped. An offset is the difference between
        // wall coordinates and the instant. Try the larger offset first to choose the earlier fold.
        const offsetAt = ms => +TimeAxis.wallTimeInZone(new Date(ms), timeZone) - ms;
        const before   = offsetAt(coordinate - 2 * dayMs), after = offsetAt(coordinate + 2 * dayMs);
        if (before === after) return new Date(coordinate - before);
        const earlier = new Date(coordinate - Math.max(before, after));
        return +TimeAxis.wallTimeInZone(earlier, timeZone) === coordinate ? earlier : new Date(coordinate - Math.min(before, after))
    }


    /**
     * Valid values for `tickUnit`.
     * @member {String[]} tickUnits=['minute','hour','day','week','month']
     * @protected
     * @static
     */
    static tickUnits = ['minute', 'hour', 'day', 'week', 'month']

    static config = {
        /**
         * @member {String} className='Neo.timeline.TimeAxis'
         * @protected
         */
        className: 'Neo.timeline.TimeAxis',
        /**
         * Axis end boundary (`Date`, timestamp, or ISO string).
         * @member {Date} end_='2026-01-02' Midnight in the axis calendar
         * @reactive
         */
        end_: '2026-01-02',
        /**
         * Explicit non-working local calendar dates formatted as `'YYYY-MM-DD'` strings (e.g. holidays or blackout days).
         * @member {String[]} nonWorkingDates_=[]
         * @reactive
         */
        nonWorkingDates_: [],
        /**
         * Non-working day-of-week indices (`0..6`, where `0` = Sunday and `6` = Saturday).
         * Pass `[]` to treat all seven days of the week as working days.
         * @member {Number[]} nonWorkingDays_=[0,6]
         * @reactive
         */
        nonWorkingDays_: [0, 6],
        /**
         * Pixels per minute when `size` is `null`. Ignored when an explicit `size` is provided.
         * @member {Number} pxPerMinute_=2
         * @reactive
         */
        pxPerMinute_: 2,
        /**
         * Optional fixed total pixel span for `[start, end]`. When set (`> 0`), `pxPerMinute` and
         * `pxPerMs` derive from `size / totalMinutes`; when `null`, `totalSize` derives from `pxPerMinute`.
         * @member {Number|null} size_=null
         * @reactive
         */
        size_: null,
        /**
         * Snap resolution in minutes (`> 0`).
         * @member {Number} snapMinutes_=15
         * @reactive
         */
        snapMinutes_: 15,
        /**
         * Axis start boundary (`Date`, timestamp, or ISO string).
         * @member {Date} start_='2026-01-01' Midnight in the axis calendar
         * @reactive
         */
        start_: '2026-01-01',
        /**
         * Positive integer step multiplier for `tickUnit`.
         * @member {Number} tickStep_=1
         * @reactive
         */
        tickStep_: 1,
        /**
         * Unit used by `getTicks(visibleStart, visibleEnd)`: `'minute' | 'hour' | 'day' | 'week' | 'month'`.
         * @member {String} tickUnit_='hour'
         * @reactive
         */
        tickUnit_: 'hour',
        /**
         * Calendar zone for civil dates, weekdays, calendar ticks and working time. Defaults to the viewer's zone.
         * @member {String|null} timeZone_=null
         * @reactive
         */
        timeZone_: null
    }

    /**
     * @summary Formats a local calendar `Date` into a timezone-safe `'YYYY-MM-DD'` day key.
     * @param {Date|Number|String} date
     * @returns {String}
     */
    static dayKey(date) {
        const d   = date instanceof Date ? date : new Date(date);
        const y   = d.getFullYear();
        const m   = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`
    }

    /**
     * @summary Returns `true` when the visible horizontal viewport `[scrollLeft, scrollLeft + viewportWidth]`
     * steps outside the last projected `[projectedMinPx, projectedMaxPx]` buffer window.
     * @description Shared buffered window-bounds check for timeline projections.
     * When `bufferPx <= 0`, any change in `[visMinPx, visMaxPx]` triggers reprojection; when `bufferPx > 0`,
     * reprojection triggers only when `visMinPx < projectedMinPx` or `visMaxPx > projectedMaxPx`.
     * @param {Object} [params={}]
     * @param {Number} [params.bufferPx=1] Horizontal overscan buffer in pixels
     * @param {Boolean} [params.hasProjectedWindow=false] Whether a valid projected window has been recorded
     * @param {Number} [params.projectedMaxPx=0] Right boundary in pixels of the last projected window
     * @param {Number} [params.projectedMinPx=0] Left boundary in pixels of the last projected window
     * @param {Number} [params.scrollLeft=0] Current horizontal scroll offset in pixels
     * @param {Neo.timeline.TimeAxis|null} [params.timeAxis=null] Active `TimeAxis` instance
     * @param {Number} [params.viewportWidth=1200] Visible viewport width in pixels
     * @returns {Boolean}
     */
    static needsReprojection({
        bufferPx           = 1,
        hasProjectedWindow = false,
        projectedMaxPx     = 0,
        projectedMinPx     = 0,
        scrollLeft         = 0,
        timeAxis           = null,
        viewportWidth      = 1200
    }={}) {
        if (!hasProjectedWindow || !timeAxis) {
            return true
        }

        const
            totalSize = timeAxis.totalSize || 0,
            visMinPx  = Math.max(0, Number(scrollLeft) || 0),
            visMaxPx  = Math.min(totalSize, visMinPx + Math.max(1, Number(viewportWidth) || 0));

        if (bufferPx <= 0) {
            return visMinPx !== projectedMinPx || visMaxPx !== projectedMaxPx
        }

        return visMinPx < projectedMinPx || visMaxPx > projectedMaxPx
    }

    /**
     * @summary Parses a `'YYYY-MM-DD'` day key into a local-midnight `Date` without UTC-noon offset drift.
     * @param {String} key `'YYYY-MM-DD'`
     * @param {Number} [hours=0]
     * @param {Number} [minutes=0]
     * @returns {Date}
     */
    static parseDayKey(key, hours=0, minutes=0) {
        const [y, m, d] = String(key).split('-').map(Number);
        return new Date(y, (m || 1) - 1, d || 1, hours, minutes, 0, 0)
    }

    /**
     * @summary Returns a local-midnight `Date` (`00:00:00.000`) for `date` via `dayKey` / `parseDayKey`.
     * @param {Date|Number|String} date
     * @returns {Date}
     */
    static startOfDay(date) {
        return this.parseDayKey(this.dayKey(this.toDate(date)), 0, 0)
    }

    /**
     * @summary Coerces a `Date`, timestamp, `'YYYY-MM-DD'` day key, or ISO string into a `Date` instance.
     * Date-only `'YYYY-MM-DD'` strings return local midnight (`00:00:00.000`) via `parseDayKey` rather than UTC midnight.
     * @param {Date|Number|String} value
     * @returns {Date}
     */
    static toDate(value) {
        if (value instanceof Date) {
            return new Date(value.getTime())
        }
        if (typeof value === 'string' && dayKeyPattern.test(value.trim())) {
            return this.parseDayKey(value.trim(), 0, 0)
        }
        return new Date(value)
    }

    /**
     * @summary Returns the viewer's clock fields when a timeline control has no axis.
     * @param {Date} date An instant
     * @returns {Date} Clock fields expressed through UTC getters
     */
    static wallTime(date) {
        return TimeAxis.wallTimeInZone(date, null)
    }

    /**
     * Internal lookup `Set` of normalized `'YYYY-MM-DD'` non-working local date keys.
     * @member {Set<String>} _nonWorkingDateSet
     * @protected
     */
    _nonWorkingDateSet = new Set()

    /**
     * @summary Returns an instant, interpreting a bare date as midnight on this axis's calendar.
     * @param {Date|Number|String} value
     * @returns {Date}
     */
    toDate(value) {
        if (this.timeZone != null && typeof value === 'string' && dayKeyPattern.test(value.trim())) {
            return this.parseDayKey(value.trim())
        }
        return this.constructor.toDate(value)
    }

    /** @summary Preserves legacy instant parsing for viewport, clamp and snap inputs on an unzoned axis. */
    #instant(value) {
        if (value instanceof Date) return value;
        return this.timeZone == null ? new Date(value) : this.toDate(value)
    }

    /**
     * @summary Returns the axis-zone clock reading as UTC fields for labels and civil arithmetic.
     * @param {Date|Number|String} value
     * @returns {Date}
     */
    wallTime(value) {
        return TimeAxis.wallTimeInZone(value instanceof Date ? value : this.toDate(value), this.timeZone)
    }

    /**
     * @summary Resolves a clock reading on this axis to its instant, including timezone transitions.
     * @param {Date} wall Calendar fields expressed through UTC getters
     * @returns {Date}
     */
    fromWallTime(wall) {
        return TimeAxis.fromWallTimeInZone(wall, this.timeZone)
    }

    /**
     * @summary Validates the zone before publishing it; invalid names raise a RangeError.
     * @param {String|null} value
     * @returns {String|null}
     * @protected
     */
    beforeSetTimeZone(value) {
        if (value !== null) {
            if (typeof value !== 'string' || !value) throw new RangeError('Expected an IANA time zone');
            TimeAxis.wallTimeInZone(new Date(0), value)
        }
        return value
    }

    /**
     * @summary Reclassifies instant-based holidays after a zone change. Bare keys keep their civil dates.
     * @protected
     */
    afterSetTimeZone() {
        const previousInputs = this._nonWorkingDateInputs;
        if (this.configsApplied && previousInputs) {
            // Reading the public config applies a holiday list pending in the same set() operation.
            const currentKeys = this.nonWorkingDates;
            if (this._nonWorkingDateInputs === previousInputs && currentKeys.length) {
                this.nonWorkingDates = previousInputs
            }
        }
    }

    /**
     * @summary Coerces `end` to a `Date` instance.
     * @param {Date|Number|String} value
     * @returns {Date}
     * @protected
     */
    beforeSetEnd(value) {
        return this.toDate(value)
    }

    /**
     * @summary Normalizes `nonWorkingDates` into an array of `'YYYY-MM-DD'` local date strings and updates `_nonWorkingDateSet`.
     * @param {Array<Date|String>|null} value
     * @returns {String[]}
     * @protected
     */
    beforeSetNonWorkingDates(value) {
        const inputs     = [], keys = new Set();
        let   hasInstant = false;
        for (const input of Array.isArray(value) ? value : []) {
            const text = input instanceof Date ? '' : String(input ?? '').trim();
            if (dayKeyPattern.test(text)) {
                inputs.push(text);
                keys.add(text)
            } else {
                const instant = new Date(input instanceof Date ? +input : text);
                if (Number.isFinite(+instant)) {
                    inputs.push(instant);
                    keys.add(this.dayKey(instant));
                    hasInstant = true
                }
            }
        }
        this._nonWorkingDateInputs = hasInstant ? inputs : null;
        this._nonWorkingDateSet = keys;
        return [...keys]
    }

    /**
     * @summary Normalizes `nonWorkingDays` into a deduplicated array of weekday integers `0..6`.
     * @param {Number[]|null} value
     * @returns {Number[]}
     * @protected
     */
    beforeSetNonWorkingDays(value) {
        if (!Array.isArray(value)) {
            return []
        }
        return [...new Set(
            value
                .map(Number)
                .filter(n => Number.isInteger(n) && n >= 0 && n <= 6)
        )]
    }

    /**
     * @summary Coerces `start` to a `Date` instance.
     * @param {Date|Number|String} value
     * @returns {Date}
     * @protected
     */
    beforeSetStart(value) {
        return this.toDate(value)
    }

    /**
     * @summary Validates `tickUnit` against `static tickUnits`.
     * @param {String} value
     * @param {String} oldValue
     * @returns {String}
     * @protected
     */
    beforeSetTickUnit(value, oldValue) {
        return this.beforeSetEnumValue(value, oldValue, 'tickUnit')
    }

    /**
     * @summary Returns the nonnegative duration of the axis in milliseconds.
     * @returns {Number}
     */
    get totalMs() {
        return Math.max(0, this.end.getTime() - this.start.getTime())
    }

    /**
     * @summary Returns the axis duration in minutes.
     * @returns {Number}
     */
    get totalMinutes() {
        return this.totalMs / MS_PER_MINUTE
    }

    /**
     * @summary Resolves pixels per minute from the configured size or explicit scale.
     * @returns {Number}
     */
    get effectivePxPerMinute() {
        if (this.size !== null && this.size !== undefined && this.size > 0) {
            const mins = this.totalMinutes;
            return mins > 0 ? this.size / mins : 0
        }
        return this.pxPerMinute
    }

    /**
     * @summary Returns the scale used to convert millisecond intervals to pixel offsets.
     * @returns {Number}
     */
    get pxPerMs() {
        return this.effectivePxPerMinute / MS_PER_MINUTE
    }

    /**
     * @summary Returns the width of the complete axis in pixels.
     * @returns {Number}
     */
    get totalSize() {
        if (this.size !== null && this.size !== undefined && this.size > 0) {
            return this.size
        }
        return this.totalMinutes * this.pxPerMinute
    }

    /**
     * @summary Advances a date by `step` units of `unit` using calendar-aware arithmetic for days/weeks/months.
     * @param {Date} date
     * @param {String} [unit=this.tickUnit]
     * @param {Number} [step=this.tickStep]
     * @returns {Date}
     */
    addTick(date, unit=this.tickUnit, step=this.tickStep) {
        if (unit === 'minute' || unit === 'hour') {
            return new Date(+date + step * (unit === 'hour' ? 60 : 1) * MS_PER_MINUTE)
        }
        if (unit !== 'day' && unit !== 'week' && unit !== 'month') return new Date(+date);
        const wall = this.wallTime(date);
        if (unit === 'month') {
            const day = wall.getUTCDate();
            wall.setUTCMonth(wall.getUTCMonth() + step + 1, 0);
            wall.setUTCDate(Math.min(day, wall.getUTCDate()))
        } else {
            wall.setUTCDate(wall.getUTCDate() + step * (unit === 'week' ? 7 : 1))
        }
        return this.fromWallTime(wall)
    }

    /**
     * @summary Resolves midnight of the axis calendar day containing the instant, plus a civil-day offset.
     * @param {Date} date
     * @param {Number} [offset=0]
     * @returns {Date}
     * @protected
     */
    dayBoundary(date, offset=0) {
        if (this.timeZone == null) return new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
        const wall = this.wallTime(date);
        wall.setUTCHours(0, 0, 0, 0);
        wall.setUTCDate(wall.getUTCDate() + offset);
        return this.fromWallTime(wall)
    }

    /**
     * @summary Advances `date` by `deltaMs` working milliseconds (`>= 0` forward, `< 0` backward),
     * skipping non-working calendar days (`nonWorkingDays` and `nonWorkingDates`).
     * Falls back to wall-clock `new Date(d.getTime() + deltaMs)` when `!hasWorkingCalendar()`, when all 7 weekdays
     * are non-working, or if the 10-year day-scan guard (`3660` days) / 1-year contiguous non-working guard (`366` days) is exceeded.
     * @param {Date|Number|String} date
     * @param {Number} deltaMs
     * @returns {Date}
     */
    addWorkingMs(date, deltaMs) {
        const
            me           = this,
            d            = me.toDate(date),
            numericDelta = Number(deltaMs) || 0;

        if (!Number.isFinite(d.getTime())) {
            return d
        }

        if (!me.hasWorkingCalendar() || (me.nonWorkingDays?.length >= 7)) {
            return new Date(d.getTime() + numericDelta)
        }

        if (numericDelta === 0) {
            return me.snapToWorkingTime(d, 1)
        }

        if (numericDelta > 0) {
            let cur       = me.snapToWorkingTime(d, 1),
                remaining = numericDelta,
                steps     = 0;

            while (remaining > 0 && steps < 3660) {
                if (me.isNonWorkingDate(cur)) {
                    cur = me.snapToWorkingTime(cur, 1);
                    if (me.isNonWorkingDate(cur)) {
                        return new Date(d.getTime() + numericDelta)
                    }
                }

                const
                    dayEnd = me.dayBoundary(cur, 1),
                    avail  = Math.max(0, dayEnd.getTime() - cur.getTime());

                if (avail <= 0) {
                    return new Date(d.getTime() + numericDelta)
                }

                if (remaining < avail) {
                    return new Date(cur.getTime() + remaining)
                }

                remaining -= avail;
                cur        = dayEnd;

                if (remaining > 0) {
                    cur = me.snapToWorkingTime(cur, 1)
                }

                steps++
            }

            return cur
        }

        let cur       = me.snapToWorkingTime(d, -1),
            remaining = -numericDelta,
            steps     = 0;

        while (remaining > 0 && steps < 3660) {
            let dayStart = me.dayBoundary(cur);

            if (cur.getTime() === dayStart.getTime()) {
                let prevDay   = me.dayBoundary(new Date(+dayStart - 1)),
                    backSteps = 0;

                while (me.isNonWorkingDate(prevDay) && backSteps < 366) {
                    prevDay = me.dayBoundary(new Date(+prevDay - 1));
                    backSteps++
                }

                if (me.isNonWorkingDate(prevDay)) {
                    return new Date(d.getTime() + numericDelta)
                }

                cur      = me.dayBoundary(prevDay, 1);
                dayStart = prevDay
            }

            const avail = Math.max(0, cur.getTime() - dayStart.getTime());
            if (avail <= 0) {
                return new Date(d.getTime() + numericDelta)
            }

            if (remaining <= avail) {
                return new Date(cur.getTime() - remaining)
            }

            remaining -= avail;
            cur        = dayStart;
            steps++
        }

        return cur
    }

    /**
     * @summary Clamps a `Date` (or timestamp) to `[minDate, maxDate]`.
     * @param {Date|Number|String} date
     * @param {Date|Number|String} [minDate=this.start]
     * @param {Date|Number|String} [maxDate=this.end]
     * @returns {Date}
     */
    clamp(date, minDate=this.start, maxDate=this.end) {
        const
            ms  = +this.#instant(date),
            min = +this.#instant(minDate),
            max = +this.#instant(maxDate);

        return new Date(Math.min(max, Math.max(min, ms)))
    }

    /**
     * @summary Converts a `Date` (or timestamp) to a pixel offset relative to `this.start`.
     * @param {Date|Number|String} date
     * @returns {Number}
     */
    dateToOffset(date) {
        const ms = this.toDate(date).getTime();
        return (ms - this.start.getTime()) * this.pxPerMs
    }

    /**
     * @summary Horizontal alias for `dateToOffset(date)`.
     * @param {Date|Number|String} date
     * @returns {Number}
     */
    dateToX(date) {
        return this.dateToOffset(date)
    }

    /**
     * @summary Formats the date on this axis's calendar as a day key.
     * @param {Date|Number|String} date
     * @returns {String}
     */
    dayKey(date) {
        if (this.timeZone == null) return this.constructor.dayKey(date);
        const d = this.wallTime(date);
        return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    }

    /**
     * @summary Computes the elapsed working milliseconds between `startDate` and `endDate`
     * (positive when `endDate >= startDate`, negative when `endDate < startDate`), skipping
     * `nonWorkingDays` and `nonWorkingDates` (bounded by a 10-year / `3660`-day scan cap).
     * @param {Date|Number|String} startDate
     * @param {Date|Number|String} endDate
     * @returns {Number}
     */
    diffWorkingMs(startDate, endDate) {
        const
            me      = this,
            start   = me.toDate(startDate),
            end     = me.toDate(endDate),
            startMs = start.getTime(),
            endMs   = end.getTime();

        if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs === endMs) {
            return 0
        }

        if (!me.hasWorkingCalendar()) {
            return endMs - startMs
        }

        if (me.nonWorkingDays?.length >= 7) {
            return 0
        }

        const
            sign  = endMs >= startMs ? 1 : -1,
            minMs = Math.min(startMs, endMs),
            maxMs = Math.max(startMs, endMs);

        let dayCursor = me.dayBoundary(new Date(minMs)),
            total     = 0,
            steps     = 0;

        while (dayCursor.getTime() < maxMs && steps < 3660) {
            const
                nextDay  = me.dayBoundary(dayCursor, 1),
                segStart = Math.max(minMs, dayCursor.getTime()),
                segEnd   = Math.min(maxMs, nextDay.getTime());

            if (segEnd > segStart && !me.isNonWorkingDate(dayCursor)) {
                total += (segEnd - segStart)
            }

            dayCursor = nextDay;
            steps++
        }

        return sign === 1 ? total : -total
    }

    /**
     * @summary Returns coalesced non-working calendar ranges intersecting `[visibleStart, visibleEnd]`,
     * clipped to `[this.start, this.end]` (bounded by a 10-year / `3660`-day scan cap), with pixel geometry
     * `{key, start, end, startDate, endDate, x, width, offset, size}`.
     * @param {Date|Number|String} [visibleStart=this.start]
     * @param {Date|Number|String} [visibleEnd=this.end]
     * @returns {Array<{key: String, start: Date, end: Date, startDate: Date, endDate: Date, x: Number, width: Number, offset: Number, size: Number}>}
     */
    getNonWorkingRanges(visibleStart=this.start, visibleEnd=this.end) {
        const me = this;

        if (!me.hasWorkingCalendar()) {
            return []
        }

        const
            axisStartMs = me.start.getTime(),
            axisEndMs   = me.end.getTime(),
            visStartMs  = Math.max(axisStartMs, me.toDate(visibleStart).getTime()),
            visEndMs    = Math.min(axisEndMs,   me.toDate(visibleEnd).getTime());

        if (!Number.isFinite(visStartMs) || !Number.isFinite(visEndMs) || visEndMs <= visStartMs) {
            return []
        }

        const merged = [];

        let dayCursor = me.dayBoundary(new Date(visStartMs)),
            steps     = 0;

        while (dayCursor.getTime() < visEndMs && steps < 3660) {
            const nextDay = me.dayBoundary(dayCursor, 1);

            if (me.isNonWorkingDate(dayCursor)) {
                const
                    segStartMs = Math.max(visStartMs, dayCursor.getTime()),
                    segEndMs   = Math.min(visEndMs,   nextDay.getTime());

                if (segEndMs > segStartMs) {
                    const prev = merged[merged.length - 1];

                    if (prev && prev.end.getTime() === segStartMs) {
                        prev.end     = new Date(segEndMs);
                        prev.endDate = prev.end
                    } else {
                        const
                            start = new Date(segStartMs),
                            end   = new Date(segEndMs);

                        merged.push({
                            key      : me.dayKey(dayCursor),
                            start,
                            end,
                            startDate: start,
                            endDate  : end
                        })
                    }
                }
            }

            dayCursor = nextDay;
            steps++
        }

        const ranges = [];

        for (const item of merged) {
            const
                x     = me.dateToOffset(item.start),
                endX  = me.dateToOffset(item.end),
                width = endX - x;

            if (width > 0) {
                ranges.push({
                    ...item,
                    offset: x,
                    size  : width,
                    width,
                    x
                })
            }
        }

        return ranges
    }

    /**
     * @summary Generates only the ticks whose `[date, endDate)` span intersects `[visibleStart, visibleEnd]`.
     * @param {Date|Number|String} [visibleStart=this.start]
     * @param {Date|Number|String} [visibleEnd=this.end]
     * @param {String} [unit=this.tickUnit]
     * @param {Number} [step=this.tickStep]
     * @returns {Array<{date: Date, endDate: Date, offset: Number, size: Number, unit: String, index: Number}>}
     */
    getTicks(visibleStart=this.start, visibleEnd=this.end, unit=this.tickUnit, step=this.tickStep) {
        const
            me         = this,
            axisOrigin = me.start,
            axisStart  = axisOrigin.getTime(),
            axisEnd    = me.end.getTime(),
            visStart   = Math.max(axisStart, +me.#instant(visibleStart)),
            visEnd     = Math.min(axisEnd,   +me.#instant(visibleEnd)),
            stepCount  = Math.max(1, step || 1),
            tickUnit   = unit || me.tickUnit,
            ticks      = [];

        if (visEnd <= visStart || axisEnd <= axisStart) {
            return ticks
        }

        let index  = 0,
            cursor = new Date(axisStart);

        // Keep ticks anchored to the original date, including month-end clamping.
        if (tickUnit === 'minute' || tickUnit === 'hour') {
            const stepMs = (tickUnit === 'hour' ? 60 : 1) * stepCount * MS_PER_MINUTE;
            if (visStart > axisStart) {
                index  = Math.floor((visStart - axisStart) / stepMs);
                cursor = new Date(axisStart + index * stepMs)
            }
        } else if (visStart - axisStart > 2 * 86_400_000 * stepCount && Number.isSafeInteger(stepCount) &&
            (tickUnit === 'day' || tickUnit === 'week' || tickUnit === 'month')) {
            // Estimate in civil time. UTC elapsed days miscount at DST and across a skipped date.
            const origin   = me.wallTime(axisOrigin), first = me.wallTime(new Date(visStart));
            const distance = tickUnit === 'month'
                ? (first.getUTCFullYear() - origin.getUTCFullYear()) * 12 + first.getUTCMonth() - origin.getUTCMonth()
                : (first - origin) / (86_400_000 * (tickUnit === 'week' ? 7 : 1));
            index = Math.max(0, Math.floor(distance / stepCount));
            if (index > 0) {
                cursor = me.addTick(axisOrigin, tickUnit, index * stepCount);
                // The estimated month may begin before its anchored tick, or a gap may advance it.
                while (+cursor > visStart && index > 0) {
                    index--;
                    cursor = index ? me.addTick(axisOrigin, tickUnit, index * stepCount) : axisOrigin
                }
            }
        }

        while (cursor.getTime() < visEnd) {
            const
                tickStart    = new Date(cursor.getTime()),
                unclampedEnd = me.addTick(axisOrigin, tickUnit, (index + 1) * stepCount),
                tickEnd      = unclampedEnd.getTime() > axisEnd ? new Date(axisEnd) : unclampedEnd;

            // A skipped civil date (e.g. Apia 2011-12-30) can share its following tick's instant.
            if (tickEnd.getTime() === tickStart.getTime() && me.timeZone && TimeAxis.tickUnits.includes(tickUnit)) {
                index++;
                continue
            }
            if (tickEnd.getTime() <= tickStart.getTime()) {
                break
            }

            if (tickEnd.getTime() > visStart && tickStart.getTime() < visEnd) {
                const
                    offset    = me.dateToOffset(tickStart),
                    endOffset = me.dateToOffset(tickEnd);

                ticks.push({
                    date   : tickStart,
                    endDate: tickEnd,
                    offset,
                    size   : endOffset - offset,
                    unit   : tickUnit,
                    index
                })
            }

            cursor = unclampedEnd;
            index++
        }

        return ticks
    }

    /**
     * @summary Returns `true` when at least one non-working weekday (`nonWorkingDays`) or calendar date (`nonWorkingDates`) is configured.
     * @returns {Boolean}
     */
    hasWorkingCalendar() {
        return Boolean((this.nonWorkingDays?.length > 0) || (this._nonWorkingDateSet?.size > 0))
    }

    /**
     * @summary Returns `true` when `date` falls on a configured `nonWorkingDays` weekday (`0..6`) or `nonWorkingDates` (`'YYYY-MM-DD'`).
     * @param {Date|Number|String} date
     * @returns {Boolean}
     */
    isNonWorkingDate(date) {
        if (date === null || date === undefined) {
            return false
        }

        const d = this.toDate(date);
        if (!Number.isFinite(d.getTime())) {
            return false
        }

        const weekday = this.timeZone == null ? d.getDay() : this.wallTime(d).getUTCDay();
        if (Array.isArray(this.nonWorkingDays) && this.nonWorkingDays.includes(weekday)) {
            return true
        }

        return Boolean(this._nonWorkingDateSet?.size && this._nonWorkingDateSet.has(this.dayKey(d)))
    }

    /**
     * @summary Converts a pixel offset relative to `this.start` back into a `Date`.
     * @param {Number} offset
     * @returns {Date}
     */
    offsetToDate(offset) {
        const pxPerMs = this.pxPerMs;
        if (pxPerMs <= 0) {
            return new Date(this.start.getTime())
        }
        return new Date(this.start.getTime() + offset / pxPerMs)
    }

    /**
     * @summary Resolves a day key and clock time in this axis's calendar.
     * @param {String} key
     * @param {Number} [hours=0]
     * @param {Number} [minutes=0]
     * @returns {Date}
     */
    parseDayKey(key, hours=0, minutes=0) {
        if (this.timeZone == null) return this.constructor.parseDayKey(key, hours, minutes);
        const [year, month, day] = String(key).split('-').map(Number);
        const wall               = new Date(0);
        wall.setUTCFullYear(year, (month || 1) - 1, day || 1);
        wall.setUTCHours(hours, minutes, 0, 0);
        return this.fromWallTime(wall)
    }

    /**
     * @summary Converts two pixel offsets into a snapped, clamped `{startDate, endDate}` pair honoring `minDurationMinutes`.
     * @param {Number} startOffset
     * @param {Number} endOffset
     * @param {Number} [minDurationMinutes=this.snapMinutes]
     * @returns {{startDate: Date, endDate: Date}}
     */
    rangeFromOffsets(startOffset, endOffset, minDurationMinutes=this.snapMinutes) {
        const
            me       = this,
            minMins  = Math.max(0, minDurationMinutes),
            isDayMin = minMins >= 1440 && minMins % 1440 === 0,
            daySteps = isDayMin ? (minMins / 1440) : 0,
            minMs    = minMins * MS_PER_MINUTE,
            axisMin  = me.start.getTime(),
            axisMax  = me.end.getTime(),
            rawStart = me.snap(me.offsetToDate(Math.min(startOffset, endOffset))).getTime(),
            rawEnd   = me.snap(me.offsetToDate(Math.max(startOffset, endOffset))).getTime(),
            maxStart = isDayMin ? me.addTick(me.end, 'day', -daySteps).getTime() : (axisMax - minMs);

        let startMs     = Math.max(axisMin, Math.min(rawStart, Math.max(axisMin, maxStart))),
            minEndForSt = isDayMin ? me.addTick(new Date(startMs), 'day', daySteps).getTime() : (startMs + minMs),
            endMs       = Math.min(axisMax, Math.max(rawEnd, minEndForSt));

        if (endMs < minEndForSt) {
            const fallbackStart = isDayMin ? me.addTick(new Date(endMs), 'day', -daySteps).getTime() : (endMs - minMs);
            startMs = Math.max(axisMin, fallbackStart)
        }

        return {
            startDate: new Date(startMs),
            endDate  : new Date(endMs)
        }
    }

    /**
     * @summary Snaps a `Date` (or timestamp) to the nearest multiple of `snapMinutes` relative to `this.start`.
     * Whole-day multiples (`snapMinutes % 1440 === 0`) step by calendar days so DST transitions preserve local wall-clock alignment.
     * @param {Date|Number|String} date
     * @param {Number} [snapMinutes=this.snapMinutes]
     * @returns {Date}
     */
    snap(date, snapMinutes=this.snapMinutes) {
        const
            d    = this.#instant(date),
            mins = Math.max(1, snapMinutes);

        if (mins >= 1440 && mins % 1440 === 0) {
            const
                s       = this.start,
                dayStep = mins / 1440,
                steps   = Math.round((this.wallTime(d) - this.wallTime(s)) / (dayStep * 1440 * MS_PER_MINUTE));

            return this.addTick(s, 'day', steps * dayStep)
        }

        const
            ms      = d.getTime(),
            stepMs  = mins * MS_PER_MINUTE,
            startMs = this.start.getTime(),
            snapped = startMs + Math.round((ms - startMs) / stepMs) * stepMs;

        return new Date(snapped)
    }

    /**
     * @summary Snaps `date` out of any non-working calendar day (`nonWorkingDays` / `nonWorkingDates`).
     * When `direction >= 0`, advances to `00:00:00.000` of the first working day after `date`.
     * When `direction < 0`, steps back to `00:00:00.000` of the first non-working day in the contiguous block
     * (i.e. `24:00` of the preceding working day). Returns `new Date(d.getTime())` when `date` is already on a
     * working day, when `!hasWorkingCalendar()`, when all 7 weekdays are marked non-working, or if the 1-year
     * contiguous non-working scan guard (`366` days) is exceeded.
     * @param {Date|Number|String} date
     * @param {Number} [direction=1]
     * @returns {Date}
     */
    snapToWorkingTime(date, direction=1) {
        const
            me = this,
            d  = me.toDate(date);

        if (!Number.isFinite(d.getTime())) {
            return d
        }

        if (!me.hasWorkingCalendar() || !me.isNonWorkingDate(d) || (me.nonWorkingDays?.length >= 7)) {
            return new Date(d.getTime())
        }

        if (direction >= 0) {
            let cur   = me.dayBoundary(d),
                steps = 0;

            while (me.isNonWorkingDate(cur) && steps < 366) {
                cur = me.dayBoundary(cur, 1);
                steps++
            }

            return me.isNonWorkingDate(cur) ? new Date(d.getTime()) : cur
        }

        let cur   = me.dayBoundary(d),
            prev  = me.dayBoundary(new Date(+cur - 1)),
            steps = 0;

        while (me.isNonWorkingDate(prev) && steps < 366) {
            cur  = prev;
            prev = me.dayBoundary(new Date(+cur - 1));
            steps++
        }

        return me.isNonWorkingDate(prev) ? new Date(d.getTime()) : cur
    }

    /**
     * @summary Horizontal alias for `offsetToDate(x)`.
     * @param {Number} x
     * @returns {Date}
     */
    xToDate(x) {
        return this.offsetToDate(x)
    }
}

export default Neo.setupClass(TimeAxis);
