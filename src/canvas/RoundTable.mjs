import Base from './Base.mjs';

const
    hasRaf = typeof requestAnimationFrame === 'function',
    DAY    = 1440, // minutes
    GLOW   = 48,   // px, the side of a seat's glow sprite
    RAD    = Math.PI / 180,
    TAU    = Math.PI * 2,
    WEEK   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * @summary A team's work as a scene on the canvas worker: a round table that replays a record.
 *
 * The record names seats and work items. Seats sit on an ellipse, each with its name and its group's colour; one
 * seat of kind `door` is where work from outside the table enters, one of kind `merge` is where every item leaves.
 * An item appears at its author's seat. Each review is a chord from the reviewer's seat to it: an approval in the
 * reviewer's colour, a change request in the warning colour, and that one knocks the item back. An approved item
 * rides the rim to the merge seat and waits there until its merge, so the queue in front of the merge is drawn as
 * it was. Merged, it lands as one square in its day's column of a strip along the bottom. The strip's caption says
 * that the scene replays and how far it is, its legend names every colour, and the merge seat's label what that
 * seat does. Under the pointer a square, an item or a seat names itself.
 *
 * A frame is a function of the record and a clock: nothing accumulates, so the replay loops, seeks and tests
 * exactly. The first frame starts late in the window, so the strip is already dense; after the last merge the scene
 * holds, then starts over.
 *
 * The scene draws around a statement it is told about ({@link #setQuiet}): it places no seat in a band and nothing
 * in a block, and erases whatever crosses a block. It holds no colour: the host hands over a palette per theme
 * ({@link #setLook}). Until the host has named its look and its statement, and while it has no record, the scene
 * draws its ground alone. A still scene, the host's reduced-motion preference, is the end state, drawn once and
 * again only when an input changes.
 *
 * The record (`version: 1`): `{from, to, caption, unit, groups: [{id, name}], seats: [{id, name, group, kind}],
 * items: [[number, title, seat, login, opened, merged, [[seat, 'A' | 'C', minute], …]], …]}` with times in minutes
 * from `from`. The `caption`'s parts are joined by ` · ` and its first names the window: that part always shows.
 * The `unit` says what an item is and, after a comma, what a square is. `buildScripts/docs/recordWeek.mjs` writes
 * a record from a repository's merged pull requests.
 *
 * The quiet rects, the still frame and the pixel-ratio buffer follow `AgentOS.canvas.Home` of
 * `neomjs/neo-agent-institution`.
 *
 * @class Neo.canvas.RoundTable
 * @extends Neo.canvas.Base
 * @singleton
 * @see Neo.app.roundtable.Canvas
 */
class RoundTable extends Base {
    static config = {
        /**
         * @member {String} className='Neo.canvas.RoundTable'
         * @protected
         */
        className: 'Neo.canvas.RoundTable',
        /**
         * The scene's measures, in CSS pixels: the left arc's span in degrees (`arc`, mirrored on the right), the
         * room kept free under the strip (`bottom`), the gap between day columns (`dayGap`), the smallest square
         * the strip takes for that room's sake (`floor`), the font stack and the sizes of names (`label`) and of
         * the strip's words (`small`), the room between the statement and anything drawn (`margin`), a seat's
         * radius (`seat`), and the strip's square sizes to try, largest first (`squares`, each with the gap it
         * keeps). A host may set `standaloneFallbackSquare` to a [size, gap] pair for a strip that otherwise
         * cannot fit, after all configured sizes have been tried with and without a ring.
         * @member {Object} measures
         */
        measures: {
            arc    : [128, 232],
            bottom : 48,
            dayGap : 18,
            floor  : 5,
            font   : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
            label  : 13,
            margin : 20,
            seat   : 4.5,
            small  : 12,
            squares: [[8, 2], [6, 2], [5, 1], [4, 1], [3, 1]]
        },
        /**
         * The replay's pace, in seconds: how long a day takes (`day`), a review chord lives (`chord`), an item
         * takes to appear (`appear`), to ride the rim (`ride`) and to fall into the strip (`flight`), and how long
         * the end state stands (`hold`). `startAt` is the share of the window the first frame starts at.
         * @member {Object} pace
         */
        pace: {
            appear : 0.35,
            chord  : 1,
            day    : 14,
            flight : 0.7,
            hold   : 6,
            ride   : 0.9,
            startAt: 0.58
        },
        /**
         * Remote method access: the base's set plus the record, the look, the motion preference, the statement
         * and the stats.
         * @member {Object} remote={app: ['getStats', 'setLook', 'setMotion', 'setQuiet', 'setRecord']}
         * @protected
         */
        remote: {
            app: ['getStats', 'setLook', 'setMotion', 'setQuiet', 'setRecord']
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The boxes the scene is erased under, for the current statement ({@link #calmOf}).
     * @member {Object[]} calm=[]
     */
    calm = []
    /**
     * The replay's clock, in minutes from the record's `from`.
     * @member {Number} clock=0
     */
    clock = 0
    /**
     * What a frame costs to draw, in milliseconds, smoothed over the last frames.
     * @member {Number} cost=0
     */
    cost = 0
    /**
     * Frames drawn since the worker loaded the renderer.
     * @member {Number} frames=0
     */
    frames = 0
    /**
     * A glow sprite per colour, drawn once per look and theme.
     * @member {Map} glows=new Map()
     */
    glows = new Map()
    /**
     * What lies under the pointer, `{index, kind}`, and the lines its card shows.
     * @member {Object|null} hover=null
     */
    hover = null
    /**
     * The record as typed arrays ({@link #index}), or `null` without a usable record.
     * @member {Object|null} indexed=null
     */
    indexed = null
    /**
     * Each seat's label, written once ({@link #arrange}): its name, and at the merge seat the verb for what it does.
     * @member {String[]} labels=[]
     */
    labels = []
    /**
     * When the last frame stepped, or `0` when the next one steps by nothing.
     * @member {Number} lastTime=0
     */
    lastTime = 0
    /**
     * The palettes the host handed over, by theme, or `null` before it did.
     * @member {Object|null} palettes=null
     */
    palettes = null
    /**
     * Where everything stands for the current size, statement and record ({@link #layout}).
     * @member {Object|null} place=null
     */
    place = null
    /**
     * The statement the scene draws around, `{bands, blocks}`, or `null` before the host named it.
     * @member {Object|null} quiet=null
     */
    quiet = null
    /**
     * The record as the host handed it over.
     * @member {Object|null} record=null
     */
    record = null
    /**
     * Scratch for one item's place: `x, y, scale, landed`.
     * @member {Float32Array} spot
     */
    spot = new Float32Array(4)
    /**
     * Whether the scene is still: `true` until the host says it allows motion.
     * @member {Boolean} still=true
     */
    still = true
    /**
     * The strip's words for the current record and size, written once ({@link #arrange}): the day names and their
     * widths, the counts as text, the legend, and the caption fitted for the clock's current step.
     * @member {Object|null} words=null
     */
    words = null

    /**
     * @summary The boxes the scene is erased under: every block, every band across the blocks' width, and the gap
     * between two parts that follow each other, as wide as what both share. Together they are the statement's
     * column, so a chord dissolves at its edge and leaves no stub between two of its lines.
     * @param {Object}   statement
     * @param {Object[]} statement.bands
     * @param {Object[]} statement.blocks
     * @returns {Object[]} `{x, y, width, height}` each
     */
    static calmOf({bands, blocks}) {
        if (!blocks.length) {
            return []
        }

        const
            left  = Math.min(...blocks.map(block => block.x)),
            right = Math.max(...blocks.map(block => block.x + block.width)),
            parts = [...blocks, ...bands.map(({height, y}) => ({height, width: right - left, x: left, y}))].sort((a, b) => a.y - b.y),
            calm  = [...parts];

        parts.slice(1).forEach((next, n) => {
            const prev = parts[n], x = Math.max(prev.x, next.x), end = Math.min(prev.x + prev.width, next.x + next.width), y = prev.y + prev.height;

            end > x && next.y > y && calm.push({height: next.y - y, width: end - x, x, y})
        });

        return calm
    }

    /**
     * @summary A day of the window as the strip names it, `Fri 13`.
     * @param {Number} from Milliseconds, the window's first instant
     * @param {Number} day  The day's index
     * @returns {String}
     */
    static dayLabel(from, day) {
        const date = new Date(from + day * 86400000);

        return `${WEEK[date.getUTCDay()]} ${date.getUTCDate()}`
    }

    /**
     * @summary A span of minutes as a reader says it: `48 min`, `2 h 14 min`, `3 d 4 h`.
     * @param {Number} minutes
     * @returns {String}
     */
    static duration(minutes) {
        minutes = Math.max(0, Math.round(minutes));

        return minutes < 60 ? `${minutes} min` : minutes < DAY
            ? `${minutes / 60 | 0} h ${minutes % 60} min`
            : `${minutes / DAY | 0} d ${minutes % DAY / 60 | 0} h`
    }

    /**
     * @summary Turns a record into the typed arrays a frame reads, or `null` for one it cannot draw.
     *
     * Items sort by their merge. `approved` is when an item's last review approved it, else its merge. Each item
     * gets a fixed place at its author's desk for the time it is open (`desk`) and a fixed place in the merge
     * queue from its approval to its merge (`queue`), both by interval colouring, so no item ever shifts for
     * another. The reviews lie flat, sorted by time.
     * @param {Object|null} record
     * @returns {Object|null}
     */
    static index(record) {
        const {items, seats} = record ?? {}, from = Date.parse(record?.from), minutes = (Date.parse(record?.to) - from) / 60000;

        if (!Array.isArray(items) || !Array.isArray(seats) || !(minutes > 0) || seats.length > 255) {
            return null
        }

        const
            rows     = items.filter(row => Array.isArray(row) && seats[row[2]] && row[5] >= 0 && row[5] < minutes && row[4] <= row[5]).sort((a, b) => a[5] - b[5]),
            count    = rows.length,
            days     = Math.ceil(minutes / DAY),
            approved = new Float32Array(count),
            author   = new Uint8Array(count),
            day      = new Uint8Array(count),
            desk     = new Uint8Array(count),
            merged   = new Float32Array(count),
            opened   = new Float32Array(count),
            queue    = new Uint8Array(count),
            slot     = new Uint16Array(count),
            dayCount = new Uint16Array(days),
            authored = new Uint16Array(seats.length),
            reviewed = new Uint16Array(seats.length),
            deskMax  = new Uint8Array(seats.length),
            flat     = [];

        rows.forEach((row, i) => {
            const reviews = (Array.isArray(row[6]) ? row[6] : []).filter(review => seats[review[0]] && review[2] <= row[5]), last = reviews.at(-1);

            author[i]   = row[2];
            opened[i]   = row[4];
            merged[i]   = row[5];
            approved[i] = last?.[1] === 'A' ? Math.max(last[2], row[4]) : row[5];
            day[i]      = row[5] / DAY | 0;
            slot[i]     = dayCount[day[i]]++;

            authored[row[2]]++;

            reviews.forEach(review => {
                reviewed[review[0]]++;
                flat.push([review[2], i, review[0], review[1] === 'A' ? 1 : 2])
            })
        });

        // interval colouring: the lowest place that is free again when the item needs one
        const colour = (order, start, end, target, ofSeat) => {
            const ends = new Map();

            order.forEach(i => {
                const key = ofSeat ? author[i] : 0, list = ends.get(key) || ends.set(key, []).get(key);

                let place = list.findIndex(free => free <= start[i]);

                place < 0 && (place = list.length);
                list[place] = end[i];
                target[i]   = Math.min(place, 255);
                ofSeat && (deskMax[key] = Math.max(deskMax[key], target[i] + 1))
            })
        }, order = Array.from({length: count}, (_, i) => i);

        colour([...order].sort((a, b) => opened[a] - opened[b]),     opened,   approved, desk,  true);
        colour([...order].sort((a, b) => approved[a] - approved[b]), approved, merged,   queue, false);

        flat.sort((a, b) => a[0] - b[0]);

        return {
            approved, author, authored, count, day, dayCount, days, desk, deskMax, from, merged, minutes, opened, queue,
            reviewed, slot,
            dayMax : Math.max(0, ...dayCount),
            logins : rows.map(row => row[3] || null),
            numbers: rows.map(row => row[0]),
            reviews: {
                at   : Float32Array.from(flat, review => review[0]),
                count: flat.length,
                item : Uint16Array.from(flat, review => review[1]),
                seat : Uint8Array.from(flat, review => review[2]),
                state: Uint8Array.from(flat, review => review[3])
            },
            titles : rows.map(row => String(row[1] ?? ''))
        }
    }

    /**
     * @summary Lays the scene out around the statement for a size: the strip below it, the merge seat above the
     * strip, the ring through the merge seat and around the statement, the seats on the ring's two side arcs.
     *
     * The strip takes the largest squares that leave the bottom its room (`measures.bottom`). Where none does, the
     * squares step down to `measures.floor` before that room shrinks, and go below the floor only where nothing
     * larger stands. A seat takes no place in a band's rows and none whose dot,
     * name or desk would touch a block. The first half of the seats take the left arc, top to bottom, with the
     * door last; the rest take the right arc, each side as far apart as its free places allow. Where the sides do
     * not hold every seat with its name, the strip stands alone (`mode: 'strip'`); where not even the strip fits,
     * nothing does (`mode: 'none'`).
     * @param {Object}   input
     * @param {Object[]} input.bands  `{y, height}` each: rows no seat stands in
     * @param {Object[]} input.blocks `{x, y, width, height}` each: boxes nothing stands in
     * @param {Number}   input.dayMax The most items one day holds
     * @param {Number}   input.days
     * @param {Uint8Array|Number[]} input.deskMax The most places each seat's desk needs
     * @param {Number}   input.height
     * @param {Object}   input.measures
     * @param {Number[]} input.nameWidths Each seat's name, measured
     * @param {Object[]} input.seats
     * @param {Number}   input.width
     * @returns {Object} `{mode, ring, merge, seats, sides, strip}`
     */
    static layout({bands, blocks, dayMax, days, deskMax, height, measures, nameWidths, seats, width}) {
        const
            {margin}  = measures,
            cx        = width / 2,
            top       = blocks.length ? Math.min(...blocks.map(b => b.y)) : height * 0.24,
            bottom    = blocks.length ? Math.max(...blocks.map(b => b.y + b.height)) : height * 0.7,
            mergeAt   = seats.findIndex(seat => seat.kind === 'merge'),
            doorAt    = seats.findIndex(seat => seat.kind === 'door'),
            order     = seats.map((seat, i) => i).filter(i => i !== mergeAt && i !== doorAt),
            leftCount = Math.ceil((order.length + (doorAt < 0 ? 0 : 1)) / 2),
            left      = [...order.slice(0, doorAt < 0 ? leftCount : leftCount - 1), ...(doorAt < 0 ? [] : [doorAt])],
            right     = order.slice(left.length - (doorAt < 0 ? 0 : 1)),
            place     = {merge: null, mode: 'none', ring: null, seats: new Float32Array(seats.length * 2), sides: new Int8Array(seats.length), strip: null};

        // the strip: the widest ring the names allow gives its width, the room below the statement its height
        const
            nameMax = Math.max(0, ...left.concat(right).map(i => nameWidths[i] || 0)),
            ringRx  = Math.min(width * 0.4, cx - nameMax - 30),
            // a ring is worth trying where it reaches past the statement's side
            tryRing = mergeAt >= 0 && ringRx >= 160 && cx - ringRx < (blocks.length ? Math.min(...blocks.map(b => b.x)) : cx) - margin ? ringRx : 0,
            room    = height - bottom - margin / 2,
            // a strip under a ring leaves the merge seat its row; where that does not fit, the strip stands alone
            fit     = (ringed, squares = measures.squares) => {
                const
                    stripW = ringed ? tryRing * 2 : Math.min(width - 32, 1180),
                    dayGap = stripW < 600 ? 8 : measures.dayGap,
                    dayW   = (stripW - (days - 1) * dayGap) / days,
                    words  = stripW >= 600 ? measures.small + 7 : 0, // the day names' row
                    // every size that stands, largest first, with the room it leaves below
                    stands = days > 0 ? squares.map(([size, gap]) => {
                        const
                            pitch   = size + gap,
                            columns = Math.max(1, (dayW + gap) / pitch | 0),
                            rows    = Math.max(1, Math.ceil(dayMax / columns));

                        return {columns, gap, pitch, rows, size, free: room - rows * pitch - words - measures.small - 10 - (ringed ? 26 : 0)}
                    }).filter(strip => strip.free >= 4) : [],
                    legible = stands.filter(strip => strip.size >= measures.floor),
                    strip   = legible.find(strip => strip.free >= measures.bottom)
                        || legible.reduce((most, strip) => strip.free > most.free ? strip : most, legible[0])
                        || stands[0];

                if (!strip) {
                    return null
                }

                const
                    {columns, gap, pitch, rows, size} = strip,
                    captionY                          = height - Math.min(measures.bottom, strip.free) - 4,
                    baseline                          = captionY - measures.small - 6 - words;

                return {baseline, captionY, columns, dayGap, dayW, gap, pitch, ringed, size, top: baseline - rows * pitch, width: stripW, words, x: cx - stripW / 2}
            };

        place.strip = tryRing && fit(true) || fit(false);

        if (!place.strip && measures.standaloneFallbackSquare) {
            place.strip = fit(false, [measures.standaloneFallbackSquare])
        }

        if (!place.strip) {
            return place
        }

        place.mode = 'strip';

        if (!place.strip.ringed) {
            return place
        }

        // the ring: through the merge seat, as far above the statement as below it
        const
            mergeY   = place.strip.top - 24,
            ringT    = Math.max(22, top - (mergeY - bottom) - 6),
            cy       = (ringT + mergeY) / 2,
            ry       = (mergeY - ringT) / 2,
            [a0, a1] = measures.arc,
            seatAt   = (rx, list, side) => {
                const free = [];

                for (let angle = a1; angle >= a0; angle--) {
                    const
                        x     = cx + side * -rx * Math.cos((180 - angle) * RAD) * -1,
                        y     = cy + ry * Math.sin(angle * RAD),
                        ok    = !bands.some(band => y > band.y - margin && y < band.y + band.height + margin),
                        boxes = list.map(i => {
                            const depth = 14 + Math.ceil((deskMax[i] || 1) / 2) * 11, name = (nameWidths[i] || 0) + 12;

                            return side < 0
                                ? [x - name, y - 14, name + 10 + depth, 28]
                                : [x - 10 - depth, y - 14, name + 10 + depth, 28]
                        });

                    ok && boxes.every(box => box[0] >= 4 && box[0] + box[2] <= width - 4 && !blocks.some(block => RoundTable.overlaps(box, block, margin))) && free.push([x, y])
                }

                // top to bottom, as far apart as the free places allow: the widest step that still seats everyone
                const take = step => {
                    const taken = free.length ? [free[0]] : [];

                    for (const spot of free) {
                        if (taken.length < list.length && spot[1] >= taken.at(-1)[1] + step) {
                            taken.push(spot)
                        }
                    }

                    return taken.length >= list.length ? taken : null
                };

                let low = 26, high = free.length ? (free.at(-1)[1] - free[0][1]) / Math.max(1, list.length - 1) : 0, taken = take(low);

                for (let round = 0; taken && round < 10 && high > low; round++) {
                    const mid = (low + high) / 2, wider = take(mid);

                    wider ? (taken = wider, low = mid) : high = mid
                }

                if (!taken) {
                    return false
                }

                list.forEach((seat, n) => {
                    place.seats[seat * 2]     = taken[n][0];
                    place.seats[seat * 2 + 1] = taken[n][1];
                    place.sides[seat]         = side
                });

                return true
            };

        if (ry >= 110 && seatAt(tryRing, left, -1) && seatAt(tryRing, right, 1)) {
            place.mode  = 'table';
            place.ring  = {cx, cy, rx: tryRing, ry};
            place.merge = {x: cx, y: mergeY};

            place.seats[mergeAt * 2]     = cx;
            place.seats[mergeAt * 2 + 1] = mergeY;

            return place
        }

        // the sides hold no seats after all: the strip takes the width it has alone
        place.strip = fit(false) || place.strip;

        return place
    }

    /**
     * @summary Where an item is at a clock: at its author's desk, on the rim, in the merge queue, falling, or landed.
     * Writes `x, y, scale, landed` into `out`; a scale of `0` is an item the frame does not draw.
     * @param {Float32Array} out
     * @param {Number} i     The item
     * @param {Number} clock Minutes
     * @param {Object} data  The indexed record
     * @param {Object} place The layout
     * @param {Object} span  The pace in minutes: `{appear, flight, ride}`
     * @returns {Float32Array} `out`
     */
    static locate(out, i, clock, data, place, span) {
        const {strip} = place, slot = data.slot[i], merged = data.merged[i];

        out[0] = strip.x + data.day[i] * (strip.dayW + strip.dayGap) + slot % strip.columns * strip.pitch;
        out[1] = strip.baseline - ((slot / strip.columns | 0) + 1) * strip.pitch + strip.gap;
        out[2] = 1;
        out[3] = 1;

        if (clock >= merged + span.flight) {
            return out
        }

        out[3] = 0;

        if (clock < data.opened[i] || place.mode !== 'table') {
            // an item the strip alone shows fades in where it lands
            out[2] = place.mode === 'table' || clock < merged ? 0 : RoundTable.smooth((clock - merged) / span.flight);
            out[3] = place.mode === 'table' ? 0 : 1;
            return out
        }

        const
            {merge, ring, seats, sides} = place,
            seat                        = data.author[i],
            side                        = sides[seat] || -1,
            k                           = data.desk[i],
            deskX                       = seats[seat * 2] - side * (20 + (k >> 1) * 11),
            deskY                       = seats[seat * 2 + 1] + ((k & 1) ? 6 : -6),
            grow                        = RoundTable.smooth((clock - data.opened[i]) / span.appear),
            ride                        = RoundTable.smooth((Math.min(clock, merged) - data.approved[i]) / span.ride),
            q                           = data.queue[i],
            waitX                       = merge.x + 18 + q % 28 * 10,
            waitY                       = merge.y - (q / 28 | 0) * 10;

        let x = seats[seat * 2] + (deskX - seats[seat * 2]) * grow,
            y = seats[seat * 2 + 1] + (deskY - seats[seat * 2 + 1]) * grow;

        if (ride > 0) {
            // along the rim: a curve whose control point lies outside the ring, below the desk
            const
                cX = ring.cx - side * ring.rx * 0.74,
                cY = ring.cy + ring.ry * 0.98,
                u  = 1 - ride;

            // from where it is, which is short of its desk while it still appears
            x = u * u * x + 2 * u * ride * cX + ride * ride * waitX;
            y = u * u * y + 2 * u * ride * cY + ride * ride * waitY
        }

        if (clock >= merged) {
            const fall = (clock - merged) / span.flight;

            x += (out[0] + strip.size / 2 - x) * RoundTable.smooth(fall);
            y += (out[1] + strip.size / 2 - y) * fall * fall
        }

        out[0] = x;
        out[1] = y;
        out[2] = grow;

        return out
    }

    /**
     * @summary Whether a box `[x, y, width, height]` comes closer to a block `{x, y, width, height}` than a margin.
     * @param {Number[]} box
     * @param {Object}   block
     * @param {Number}   margin
     * @returns {Boolean}
     */
    static overlaps(box, block, margin) {
        return box[0] < block.x + block.width + margin && box[0] + box[2] > block.x - margin
            && box[1] < block.y + block.height + margin && box[1] + box[3] > block.y - margin
    }

    /**
     * @summary Eases a share of a way: slow, fast, slow.
     * @param {Number} t 0…1; anything outside is held at the nearer end
     * @returns {Number}
     */
    static smooth(t) {
        return t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t)
    }

    /**
     * @summary The strip's caption: the record's window, how many of its items have landed in the record's own
     * `unit`, then the rest of the record's caption. A moving scene opens with "Replay of" and counts `landed of
     * total`: a bare fraction read as a share that failed. A still scene replays nothing and names the total.
     *
     * Given a test of what `fits`, the caption is shortened until it passes. The unit gives up what follows its
     * comma, then the record's caption its parts from the end, then the unit goes. The window stays: a count
     * without its dates would not stay true at any age.
     * @param {Number}   landed
     * @param {Function} [fits] Whether a text has room; without it the caption is whole
     * @returns {String}
     */
    captionOf(landed, fits) {
        const
            {indexed: data, record, still} = this,
            [period, ...rest]              = String(record.caption ?? '').split(' · ').filter(Boolean),
            lead                           = still ? period : period ? `Replay of ${period}` : 'Replay',
            whole                          = record.unit || '',
            short                          = whole.split(',')[0],
            units                          = fits ? [...new Set([whole, short, ''])] : [whole];

        let text = '';

        for (const unit of units) {
            const
                words = unit && ` ${unit}`,
                count = still ? words && `${data.count}${words}` : `${landed} of ${data.count}${words}`,
                // what a square is goes before any part does; a count that lost its unit keeps the window alone
                most  = unit || !whole ? rest.length : 0,
                least = unit === whole && short !== whole ? most : 0;

            for (let n = most; n >= least; n--) {
                text = [lead, count, ...rest.slice(0, n)].filter(Boolean).join(' · ');

                if (!fits || fits(text)) {
                    return text
                }
            }
        }

        return text
    }

    /**
     * @summary Forgets the scene with the canvas; the host hands its inputs over again once a canvas returns.
     */
    clearGraph() {
        const me = this;

        super.clearGraph();
        me.calm     = [];
        me.clock    = 0;
        me.hover    = null;
        me.indexed  = null;
        me.lastTime = 0;
        me.palettes = null;
        me.place    = null;
        me.quiet    = null;
        me.record   = null;
        me.still    = true;
        me.glows.clear()
    }

    /**
     * @summary The colour a seat is drawn in: its group's, the door's or the merge seat's.
     * @param {Object} palette
     * @param {Object} seat
     * @returns {String}
     */
    colourOf(palette, seat) {
        return seat.kind === 'merge' ? palette.merge : seat.kind === 'door' ? palette.door : palette.groups?.[seat.group] || palette.inkDim
    }

    /**
     * @summary Draws one frame: the rim, the strip, the chords, the items on their way, the seats. Then the scene
     * goes quiet under the statement's blocks, the ground fills in beneath it, and the pointer's card goes on top.
     */
    draw() {
        const
            me                     = this,
            ctx                    = me.context,
            size                   = me.canvasSize,
            palette                = me.palettes?.[me.theme] || me.palettes?.dark,
            ratio                  = size.devicePixelRatio || 1,
            {indexed: data, place} = me;

        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.clearRect(0, 0, size.width, size.height);
        ctx.globalAlpha = 1;

        if (palette && data && place && place.mode !== 'none') {
            const span = me.spanOf(), clock = me.still ? data.minutes + span.flight : me.clock;

            me.findHover(clock, span);

            ctx.textBaseline = 'alphabetic';

            place.mode === 'table' && me.drawRim(ctx, palette);
            me.drawStrip(ctx, palette, clock, span);

            if (place.mode === 'table') {
                me.still || me.drawChords(ctx, palette, clock, span);
                me.drawItems(ctx, palette, clock, span);
                me.drawSeats(ctx, palette, clock, span)
            }

            me.drawQuiet(ctx)
        }

        if (me.gradients.ground) {
            ctx.globalCompositeOperation = 'destination-over';
            ctx.fillStyle                = me.gradients.ground;
            ctx.fillRect(0, 0, size.width, size.height);
            ctx.globalCompositeOperation = 'source-over'
        }

        palette && me.hover && me.drawCard(ctx, palette);

        ctx.globalAlpha = 1;
        me.frames++
    }

    /**
     * @summary The pointer's card: what lies under it, in its own words, kept inside the surface.
     * @param {OffscreenCanvasRenderingContext2D} ctx
     * @param {Object} palette
     */
    drawCard(ctx, palette) {
        const
            me                       = this,
            {hover, measures, mouse} = me,
            {width, height}          = me.canvasSize,
            line                     = measures.label + 6,
            pad                      = 10;

        ctx.font = `600 ${measures.label}px ${measures.font}`;

        const
            w = Math.min(width - 16, Math.max(...hover.lines.map(text => ctx.measureText(text).width)) + pad * 2),
            h = hover.lines.length * line + pad * 2 - 6,
            x = Math.max(8, Math.min(width - w - 8, mouse.x + 14)),
            y = mouse.y + 18 + h > height - 8 ? mouse.y - 14 - h : mouse.y + 18;

        ctx.globalAlpha = 1;
        ctx.fillStyle   = palette.card;
        ctx.strokeStyle = palette.line;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, w, h, 6) : ctx.rect(x, y, w, h);
        ctx.fill();
        ctx.stroke();

        ctx.textAlign = 'left';

        hover.lines.forEach((text, n) => {
            ctx.font      = `${n ? 400 : 600} ${measures.label}px ${measures.font}`;
            ctx.fillStyle = n ? palette.inkDim : palette.ink;
            ctx.fillText(text, x + pad, y + pad + measures.label - 2 + n * line, w - pad * 2)
        })
    }

    /**
     * @summary The reviews of the last moments, each a chord from its reviewer's seat to the item: it grows, then
     * fades. An approval takes the reviewer's colour; a change request the warning colour, with a ring around the
     * item it knocks back.
     * @param {OffscreenCanvasRenderingContext2D} ctx
     * @param {Object} palette
     * @param {Number} clock
     * @param {Object} span
     */
    drawChords(ctx, palette, clock, span) {
        const
            me                                   = this,
            {indexed: data, place, record, spot} = me,
            {reviews}                            = data,
            {ring, seats}                        = place;

        ctx.lineCap = 'round';

        for (let r = me.firstReview(clock - span.chord); r < reviews.count && reviews.at[r] <= clock; r++) {
            const item = reviews.item[r];

            RoundTable.locate(spot, item, clock, data, place, span);

            // a chord ends with its item's merge: one that followed the fall would hang off whatever it passes
            if (spot[2] > 0 && !spot[3] && clock < data.merged[item]) {
                const
                    p      = (clock - reviews.at[r]) / span.chord,
                    reach  = Math.min(1, p / 0.45),
                    fade   = p < 0.45 ? 1 : 1 - (p - 0.45) / 0.55,
                    seat   = reviews.seat[r],
                    change = reviews.state[r] === 2,
                    sx     = seats[seat * 2],
                    sy     = seats[seat * 2 + 1],
                    // the control point leans toward the table's middle, so chords bow across it
                    cX     = (sx + spot[0]) / 2 + (ring.cx - (sx + spot[0]) / 2) * 0.35,
                    cY     = (sy + spot[1]) / 2 + (ring.cy - (sy + spot[1]) / 2) * 0.35,
                    u      = 1 - reach,
                    ex     = u * u * sx + 2 * u * reach * cX + reach * reach * spot[0],
                    ey     = u * u * sy + 2 * u * reach * cY + reach * reach * spot[1];

                ctx.strokeStyle = ctx.fillStyle = change ? palette.warn : me.colourOf(palette, record.seats[seat]);
                ctx.globalAlpha = (palette.chord ?? 0.7) * fade;
                ctx.lineWidth   = change ? 1.6 : 1.2;
                ctx.beginPath();
                ctx.moveTo(sx, sy);
                ctx.quadraticCurveTo(sx + (cX - sx) * reach, sy + (cY - sy) * reach, ex, ey);
                ctx.stroke();

                if (reach < 1) {
                    ctx.beginPath();
                    ctx.arc(ex, ey, 2.2, 0, TAU);
                    ctx.fill()
                } else if (change) {
                    ctx.globalAlpha = 0.8 * fade;
                    ctx.lineWidth   = 1.4;
                    ctx.beginPath();
                    ctx.arc(spot[0], spot[1], 6 + (1 - fade) * 13, 0, TAU);
                    ctx.stroke()
                }
            }
        }
    }

    /**
     * @summary The items on their way, each a square in its author's colour. A change request of the last moments
     * knocks its item away from the reviewer; an approval swells it.
     * @param {OffscreenCanvasRenderingContext2D} ctx
     * @param {Object} palette
     * @param {Number} clock
     * @param {Object} span
     */
    drawItems(ctx, palette, clock, span) {
        const
            me                                   = this,
            {indexed: data, place, record, spot} = me,
            {reviews}                            = data,
            {seats}                              = place,
            from                                 = me.firstReview(clock - span.chord),
            side                                 = 7;

        for (let i = 0; i < data.count; i++) {
            if (data.opened[i] > clock) {
                continue
            }

            RoundTable.locate(spot, i, clock, data, place, span);

            if (spot[2] > 0 && !spot[3]) {
                let x = spot[0], y = spot[1], scale = spot[2];

                for (let r = from; r < reviews.count && reviews.at[r] <= clock; r++) {
                    if (reviews.item[r] === i) {
                        const p = (clock - reviews.at[r]) / span.chord;

                        if (p > 0.45) {
                            const wave = Math.sin((p - 0.45) / 0.55 * Math.PI);

                            if (reviews.state[r] === 2) {
                                const dx = x - seats[reviews.seat[r] * 2], dy = y - seats[reviews.seat[r] * 2 + 1], d = Math.hypot(dx, dy) || 1;

                                x += dx / d * 8 * wave;
                                y += dy / d * 8 * wave
                            } else {
                                scale *= 1 + 0.45 * wave
                            }
                        }
                    }
                }

                const half = side * scale / 2;

                ctx.globalAlpha = me.hover?.kind === 'item' && me.hover.index !== i ? 0.5 : 0.95;
                ctx.fillStyle   = me.colourOf(palette, record.seats[data.author[i]]);
                ctx.fillRect(x - half, y - half, half * 2, half * 2)
            }
        }
    }

    /**
     * @summary Erases the scene under the statement's column ({@link #calmOf}), full at each box and fading over a
     * feather beyond it, so a chord dissolves toward the statement instead of ending at an edge. The feather grows
     * with the box, up to 56px, and is a shadow, which every engine draws, where a canvas filter is not.
     * @param {OffscreenCanvasRenderingContext2D} ctx
     */
    drawQuiet(ctx) {
        const ratio = this.canvasSize.devicePixelRatio || 1;

        ctx.globalAlpha              = 1;
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle                = '#000';
        ctx.shadowColor              = '#000';

        for (const {height, width, x, y} of this.calm) {
            ctx.shadowBlur = Math.min(56, Math.max(12, Math.min(width, height) / 2)) * ratio;
            ctx.fillRect(x - 2, y - 2, width + 4, height + 4)
        }

        ctx.shadowBlur               = 0;
        ctx.shadowColor              = 'transparent';
        ctx.globalCompositeOperation = 'source-over'
    }

    /**
     * @summary The table's rim, a hairline.
     * @param {OffscreenCanvasRenderingContext2D} ctx
     * @param {Object} palette
     */
    drawRim(ctx, palette) {
        const {cx, cy, rx, ry} = this.place.ring;

        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = palette.line;
        ctx.lineWidth   = 1;
        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
        ctx.stroke()
    }

    /**
     * @summary The seats: each a dot in its colour that glows while its seat reviews or opens work, with its label
     * beside it where the layout holds names. The merge seat is a ring, and its label says what it does.
     * @param {OffscreenCanvasRenderingContext2D} ctx
     * @param {Object} palette
     * @param {Number} clock
     * @param {Object} span
     */
    drawSeats(ctx, palette, clock, span) {
        const
            me                                       = this,
            {indexed: data, measures, place, record} = me,
            {reviews}                                = data,
            {seats, sides}                           = place,
            heat                                     = me.heat ??= new Float32Array(256);

        heat.fill(0, 0, record.seats.length);

        if (!me.still) {
            for (let r = me.firstReview(clock - span.chord); r < reviews.count && reviews.at[r] <= clock; r++) {
                heat[reviews.seat[r]] = Math.max(heat[reviews.seat[r]], 1 - (clock - reviews.at[r]) / span.chord)
            }

            for (let i = 0; i < data.count; i++) {
                const age = (clock - data.opened[i]) / span.chord;

                age >= 0 && age < 1 && (heat[data.author[i]] = Math.max(heat[data.author[i]], 1 - age))
            }
        }

        ctx.font = `600 ${measures.label}px ${measures.font}`;

        record.seats.forEach((seat, s) => {
            const
                x      = seats[s * 2],
                y      = seats[s * 2 + 1],
                colour = me.colourOf(palette, seat),
                glow   = me.glows.get(colour),
                dim    = me.hover?.kind === 'seat' && me.hover.index !== s;

            if (glow && heat[s] > 0) {
                ctx.globalCompositeOperation = me.theme === 'light' ? 'source-over' : 'lighter';
                ctx.globalAlpha              = 0.75 * heat[s];
                ctx.drawImage(glow, x - 22, y - 22, 44, 44);
                ctx.globalCompositeOperation = 'source-over'
            }

            ctx.globalAlpha = dim ? 0.45 : 1;
            ctx.fillStyle   = colour;
            ctx.beginPath();

            if (seat.kind === 'merge') {
                ctx.strokeStyle = colour;
                ctx.lineWidth   = 1.6;
                ctx.arc(x, y, measures.seat + 2.5, 0, TAU);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, 2, 0, TAU)
            } else {
                ctx.arc(x, y, measures.seat + heat[s] * 1.5, 0, TAU)
            }

            ctx.fill();

            const side = seat.kind === 'merge' ? -1 : sides[s];

            ctx.globalAlpha = dim ? 0.45 : seat.kind === 'seat' ? 0.92 : 0.78;
            ctx.fillStyle   = palette.ink;
            ctx.textAlign   = side < 0 ? 'right' : 'left';
            ctx.fillText(me.labels[s], x + side * (seat.kind === 'merge' ? 16 : 12), y + measures.label * 0.34)
        })
    }

    /**
     * @summary The strip: one square per landed item in its day's column and its author's colour, the day names
     * below, then the caption with the replay's clock, and the legend at the far end: a square per group and for
     * the door, a line with the count of change requests.
     * @param {OffscreenCanvasRenderingContext2D} ctx
     * @param {Object} palette
     * @param {Number} clock
     * @param {Object} span
     */
    drawStrip(ctx, palette, clock, span) {
        const
            me                                                           = this,
            {hover, indexed: data, measures, place, record, spot, words} = me,
            {strip}                                                      = place,
            // the end state fades before the replay starts over
            over  = (clock - data.minutes - span.flight) / span.minute,
            alpha = me.still ? 1 : 1 - RoundTable.smooth(over - (me.pace.hold - 1.2)),
            seat  = hover?.kind === 'seat' ? hover.index : -1;

        words.landed.fill(0);

        for (let i = 0; i < data.count && data.merged[i] <= clock; i++) {
            RoundTable.locate(spot, i, clock, data, place, span);

            if (spot[3]) {
                words.landed[data.day[i]]++;
                ctx.globalAlpha = alpha * spot[2] * (seat < 0 || data.author[i] === seat ? hover?.kind === 'item' && hover.index === i ? 1 : 0.88 : 0.2);
                ctx.fillStyle   = me.colourOf(palette, record.seats[data.author[i]]);
                ctx.fillRect(spot[0], spot[1], strip.size, strip.size)
            }
        }

        ctx.font      = `500 ${measures.small}px ${measures.font}`;
        ctx.textAlign = 'left';

        // the day the replay is in, or none once it holds its end state
        const today = me.still || clock >= data.minutes ? -1 : clock / DAY | 0;

        let landed = 0;

        for (let day = 0; day < data.days; day++) {
            landed += words.landed[day];

            if (strip.words) {
                // each day's name, dim until the replay reaches it; beside it how many have landed in it so far,
                // and at the day the replay is in, its clock where the row has room for one
                const y = strip.baseline + measures.small + 4;

                let x = strip.x + day * (strip.dayW + strip.dayGap);

                ctx.globalAlpha = (day * DAY <= clock ? 0.9 : 0.6) * alpha;
                ctx.fillStyle   = palette.inkDim;
                ctx.fillText(words.days[day], x, y);
                x += words.dayWidths[day] + 7;

                if (words.landed[day]) {
                    ctx.fillStyle = palette.ink;
                    ctx.fillText(words.numbers[words.landed[day]], x, y);
                    x += ctx.measureText(words.numbers[words.landed[day]]).width + 9
                }

                if (day === today && words.zone !== null) {
                    const tick = clock / 5 | 0;

                    tick !== words.tick && (words.tick = tick, words.clock = me.stamp(tick * 5, words.zone));
                    ctx.fillStyle = palette.inkDim;
                    ctx.fillText(words.clock, x, y)
                }
            }
        }

        // the legend and the caption take the dim ink at full strength: text this small needs all of its contrast
        ctx.globalAlpha = 1;

        // the legend first, from the far end, so the caption knows its room
        let end = strip.x + strip.width;

        if (strip.words) {
            ctx.textAlign = 'right';

            for (let n = words.legend.length - 1; n >= 0; n--) {
                const [name, key] = words.legend[n];

                ctx.fillStyle = palette.inkDim;
                ctx.fillText(name, end, strip.captionY);
                end -= ctx.measureText(name).width + 6;

                if (key === 'warn') {
                    // a change request is a line in the scene, so its key is one
                    ctx.strokeStyle = palette.warn;
                    ctx.lineWidth   = 1.6;
                    ctx.beginPath();
                    ctx.moveTo(end - 10, strip.captionY - 4.5);
                    ctx.lineTo(end, strip.captionY - 4.5);
                    ctx.stroke();
                    end -= 3
                } else {
                    ctx.fillStyle = key === 'door' ? palette.door : palette.groups?.[key] || palette.inkDim;
                    ctx.fillRect(end - 7, strip.captionY - 8, 7, 7)
                }

                end -= 21
            }
        }

        // the caption is fitted once per landing
        if (landed !== words.count || end !== words.room) {
            words.caption = me.captionOf(landed, text => ctx.measureText(text).width <= end - strip.x);
            words.count   = landed;
            words.room    = end
        }

        ctx.textAlign = 'left';
        ctx.fillStyle = palette.inkDim;
        ctx.fillText(words.caption, strip.x, strip.captionY)
    }

    /**
     * @summary What lies under the pointer, for this frame: an item on its way, a square, or a seat. The card's
     * lines are written once per change.
     * @param {Number} clock
     * @param {Object} span
     */
    findHover(clock, span) {
        const me = this, {indexed: data, mouse, place, record, spot} = me, {x, y} = mouse;

        let kind = null, index = -1, best = 81;

        if (x > -1000) {
            for (let i = 0; i < data.count && data.opened[i] <= clock; i++) {
                RoundTable.locate(spot, i, clock, data, place, span);

                if (spot[2] > 0) {
                    const half = spot[3] ? place.strip.size / 2 : 0, d = (spot[0] + half - x) ** 2 + (spot[1] + half - y) ** 2;

                    d < (spot[3] ? 64 : best) && d < best && (best = d, kind = 'item', index = i)
                }
            }

            if (!kind && place.mode === 'table') {
                record.seats.forEach((seat, s) => {
                    const dx = x - place.seats[s * 2], dy = y - place.seats[s * 2 + 1], side = seat.kind === 'merge' ? -1 : place.sides[s];

                    (dx * dx + dy * dy < 200 || Math.abs(dy) < 10 && dx * side > 0 && dx * side < (me.nameWidths?.[s] || 0) + 16)
                        && (kind = 'seat', index = s)
                })
            }
        }

        if (!kind) {
            me.hover = null
        } else if (me.hover?.kind !== kind || me.hover.index !== index) {
            me.hover = {index, kind, lines: kind === 'item' ? me.itemLines(index) : me.seatLines(index)}
        }
    }

    /**
     * @summary The first review at or after a minute, by bisection.
     * @param {Number} minute
     * @returns {Number}
     */
    firstReview(minute) {
        const {at, count} = this.indexed.reviews;

        let low = 0, high = count;

        while (low < high) {
            const mid = low + high >> 1;

            at[mid] < minute ? low = mid + 1 : high = mid
        }

        return low
    }

    /**
     * @summary Remote entry for the specs: what the scene holds and where it stands.
     * @returns {Object} `{clock, cost, frames, items, landed, mode, record, seats, size, still, strip, theme}`;
     * `seats` lists `{name, kind, x, y, box}` with the box of the dot and its name, `strip` is the strip's box
     * with its caption row, and both are `null` where the layout holds none
     */
    getStats() {
        const me = this, {canvasSize, indexed: data, measures, place, record} = me, span = data && me.spanOf();

        let landed = 0;

        if (data && place) {
            const clock = me.still ? data.minutes + span.flight : me.clock;

            for (let i = 0; i < data.count; i++) {
                clock >= data.merged[i] + span.flight && landed++
            }
        }

        return {
            clock : me.clock,
            cost  : me.cost,
            frames: me.frames,
            items : data?.count ?? 0,
            landed,
            mode  : place?.mode ?? null,
            record: !!record,
            seats : place?.mode === 'table' ? record.seats.map((seat, s) => {
                const x    = place.seats[s * 2], y = place.seats[s * 2 + 1], side = seat.kind === 'merge' ? -1 : place.sides[s],
                      name = (me.nameWidths?.[s] || 0) + 16;

                return {box: [side < 0 ? x - name - 6 : x - 6, y - 9, name + 12, 18], kind: seat.kind, name: seat.name, x, y}
            }) : null,
            size : canvasSize && {height: canvasSize.height, width: canvasSize.width},
            still: me.still,
            strip: place?.strip ? [place.strip.x, place.strip.top, place.strip.width, place.strip.captionY + 4 - place.strip.top] : null,
            theme: me.theme
        }
    }

    /**
     * @summary An item's card: its number and title, then who opened and reviewed it and how long it took.
     * @param {Number} i
     * @returns {String[]}
     */
    itemLines(i) {
        const
            me                      = this,
            {indexed: data, record} = me,
            {reviews}               = data,
            names                   = [];

        for (let r = 0; r < reviews.count; r++) {
            const name = record.seats[reviews.seat[r]].name;

            reviews.item[r] === i && !names.includes(name) && names.push(name)
        }

        return [
            `#${data.numbers[i]} · ${data.titles[i]}`,
            `${data.logins[i] || record.seats[data.author[i]].name}${names.length ? ` · reviewed by ${names.join(', ')}` : ''} · merged after ${RoundTable.duration(data.merged[i] - data.opened[i])}`
        ]
    }

    /**
     * @summary Measures the names, then lays the scene out for the current size, statement and record.
     */
    arrange() {
        const me = this, {canvasSize, context, indexed: data, measures, quiet, record} = me;

        me.place = null;
        me.hover = null;
        me.calm  = quiet ? RoundTable.calmOf(quiet) : [];

        if (context && canvasSize && data && quiet && canvasSize.width > 0 && canvasSize.height > 0) {
            context.font  = `600 ${measures.label}px ${measures.font}`;
            // a verb at the merge seat, not a title: the merge is what that seat does
            me.labels     = record.seats.map(seat => seat.kind === 'merge' ? `${seat.name} merges` : seat.name);
            me.nameWidths = me.labels.map(label => context.measureText(label).width);

            // the strip's words, written once: the day names with their widths, the counts, the legend
            const days = Array.from({length: data.days}, (_, day) => RoundTable.dayLabel(data.from, day));

            let changes = 0;

            for (let r = 0; r < data.reviews.count; r++) {
                data.reviews.state[r] === 2 && changes++
            }

            context.font = `500 ${measures.small}px ${measures.font}`;

            me.words = {
                caption  : '',
                clock    : '',
                count    : -1,
                days,
                dayWidths: days.map(day => context.measureText(day).width),
                landed   : new Uint16Array(data.days),
                // the groups, the door, and the one warm mark with its count
                legend   : [
                    ...(record.groups || []).map(group => [group.name, group.id]),
                    ...(record.seats.some(seat => seat.kind === 'door') ? [['Contributors', 'door']] : []),
                    ...(changes ? [[`${changes} change request${changes === 1 ? '' : 's'}`, 'warn']] : [])
                ],
                numbers: Array.from({length: data.dayMax + 1}, (_, n) => String(n)),
                room   : 0,
                tick   : -2,
                zone   : null
            };

            me.place = RoundTable.layout({
                bands     : quiet.bands,
                blocks    : quiet.blocks,
                dayMax    : data.dayMax,
                days      : data.days,
                deskMax   : data.deskMax,
                height    : canvasSize.height,
                measures,
                nameWidths: me.nameWidths,
                seats     : record.seats,
                width     : canvasSize.width
            });

            // the replay's clock ends a gap before the next day's name, beside the widest name and the fullest count
            // with their gaps as drawn: with its zone, else without it, else it is left out
            const
                {strip} = me.place,
                lead    = Math.max(...me.words.dayWidths) + 7 + context.measureText(me.words.numbers.at(-1)).width + 9,
                room    = strip?.words ? strip.dayW + strip.dayGap - lead - 9 : -1;

            me.words.zone = [' UTC', ''].find(zone => context.measureText(`00:00${zone}`).width <= room) ?? null
        }
    }

    /**
     * @summary An input changed: a moving scene shows it on its next frame, a still one draws it now.
     */
    refresh() {
        const me = this;

        (me.still || !me.animationId) && me.render()
    }

    /**
     * @summary One frame: a moving scene with a record steps its clock by the time since the last one, draws, and
     * schedules the next; any other draws and stops.
     */
    render() {
        const me = this;

        me.animationId = null;

        if (!me.canRender || !me.canvasSize) {
            return
        }

        const now = performance.now(), dt = me.lastTime ? Math.min(now - me.lastTime, 50) / 1000 : 0, moving = !me.still && !!me.indexed && !!me.place;

        me.lastTime = now;

        if (moving) {
            const span = me.spanOf(), end = me.indexed.minutes + span.flight + me.pace.hold * span.minute;

            me.clock += dt * span.minute;
            me.clock > end && (me.clock = 0)
        }

        me.draw();
        me.cost += (performance.now() - now - me.cost) * 0.05;

        if (moving) {
            me.animationId = hasRaf ? requestAnimationFrame(me.renderLoop) : setTimeout(me.renderLoop, 1000 / 60)
        }
    }

    /**
     * @summary A seat's card: its name and group, then its share of the window.
     * @param {Number} s
     * @returns {String[]}
     */
    seatLines(s) {
        const
            {indexed: data, record} = this,
            seat                    = record.seats[s],
            group                   = record.groups?.find(g => g.id === seat.group)?.name,
            count                   = (n, noun) => `${n} ${noun}${n === 1 ? '' : 's'}`,
            guests                  = new Set(data.logins.filter(Boolean)).size;

        return seat.kind === 'merge'
            ? [seat.name, `merged ${count(data.count, 'pull request')}`]
            : seat.kind === 'door'
                ? [seat.name, `${count(guests, 'account')} · ${count(data.authored[s], 'pull request')} merged`]
                : [group ? `${seat.name} · ${group}` : seat.name, `${count(data.authored[s], 'pull request')} merged · ${count(data.reviewed[s], 'review')}`]
    }

    /**
     * @summary Remote entry: the look the host draws the scene in. `palettes` holds one palette per theme,
     * `{ground: [from, to], ink, inkDim, line, card, warn, door, merge, groups: {<group id>: colour}}`, and may name
     * how opaque a review chord is (`chord`, 0.7 without it); `measures` and `pace` replace the parts of the scene's
     * own they name.
     * @param {Object} data
     * @param {Object} [data.measures]
     * @param {Object} [data.pace]
     * @param {Object} data.palettes
     * @param {String} [data.windowId]
     */
    setLook({measures, pace, palettes}) {
        const me = this;

        me.palettes = palettes || null;
        measures && (me.measures = {...me.measures, ...measures});
        pace     && (me.pace     = {...me.pace, ...pace});

        me.canvasSize && me.updateResources(me.canvasSize.width, me.canvasSize.height);
        me.arrange();
        me.refresh()
    }

    /**
     * @summary Remote entry: whether the scene is still, the host's reduced-motion preference. Anything but an
     * explicit `false` is still.
     * @param {Object}  data
     * @param {Boolean} data.still
     * @param {String}  [data.windowId]
     */
    setMotion({still}) {
        const me = this, next = still !== false;

        if (next !== me.still) {
            me.still    = next;
            me.lastTime = 0;
            me.refresh()
        }
    }

    /**
     * @summary Remote entry: the statement the scene draws around, canvas-relative in CSS pixels. A block is a box
     * nothing stands in and everything is erased under, `{x, y, width, height}`; a band is a row no seat stands
     * in, `{y, height}`. The scene draws only once the host has named its statement, an empty one included.
     * @param {Object}   data
     * @param {Object[]} [data.bands=[]]
     * @param {Object[]} [data.blocks=[]]
     * @param {String}   [data.windowId]
     */
    setQuiet({bands = [], blocks = []}) {
        const me = this, usable = rect => rect?.width > 0 && rect?.height > 0;

        me.quiet = {
            bands : bands.filter(usable).map(({height, y}) => ({height, y})),
            blocks: blocks.filter(usable).map(({height, width, x, y}) => ({height, width, x, y}))
        };

        me.arrange();
        me.refresh()
    }

    /**
     * @summary Remote entry: the record to replay, or `null`. A record the scene cannot draw is no record.
     * @param {Object}      data
     * @param {Object|null} data.record
     * @param {String}      [data.windowId]
     */
    setRecord({record = null}) {
        const me = this;

        me.indexed = RoundTable.index(record);
        me.record  = me.indexed ? record : null;
        me.clock   = me.indexed ? me.indexed.minutes * me.pace.startAt : 0;

        me.arrange();
        me.refresh()
    }

    /**
     * @summary The pace in minutes of the record: what a second of the replay covers, and each motion's length.
     * @returns {Object} `{appear, chord, flight, minute, ride}`
     */
    spanOf() {
        const {pace} = this, minute = DAY / pace.day;

        return {appear: pace.appear * minute, chord: pace.chord * minute, flight: pace.flight * minute, minute, ride: pace.ride * minute}
    }

    /**
     * @summary The replay's clock as the strip shows it beside the day it is in: `14:20 UTC`, or `14:20` where
     * the day row has no room for the zone.
     * @param {Number} clock Minutes
     * @param {String} [zone=' UTC']
     * @returns {String}
     */
    stamp(clock, zone = ' UTC') {
        const date = new Date(this.indexed.from + Math.max(clock, 0) * 60000), pad = n => String(n).padStart(2, '0');

        return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}${zone}`
    }

    /**
     * @summary The theme changed, the look or the surface did: the ground and the glow sprites are drawn again.
     * @param {Number} width
     * @param {Number} height
     */
    updateResources(width, height) {
        const me = this, palette = me.palettes?.[me.theme] || me.palettes?.dark;

        me.gradients.ground = null;
        me.glows.clear();

        if (me.context && palette) {
            if (palette.ground) {
                const ground = me.context.createLinearGradient(0, 0, width, height);

                ground.addColorStop(0, palette.ground[0]);
                ground.addColorStop(1, palette.ground[1]);
                me.gradients.ground = ground
            }

            if (typeof OffscreenCanvas === 'function') {
                for (const colour of new Set([palette.door, palette.merge, ...Object.values(palette.groups || {})].filter(Boolean))) {
                    const sprite = new OffscreenCanvas(GLOW, GLOW), ctx = sprite.getContext('2d'), glow = ctx.createRadialGradient(GLOW / 2, GLOW / 2, 0, GLOW / 2, GLOW / 2, GLOW / 2);

                    glow.addColorStop(0, colour);
                    glow.addColorStop(1, 'transparent');
                    ctx.globalAlpha = 0.55;
                    ctx.fillStyle   = glow;
                    ctx.fillRect(0, 0, GLOW, GLOW);
                    me.glows.set(colour, sprite)
                }
            }
        }

        me.refresh()
    }

    /**
     * @summary Sizes the backing store at the host's pixel ratio, so names stay sharp, and lays the scene out
     * again. A report of the size already drawn changes nothing: resizing the backing store would clear the frame.
     * @param {Object} size
     * @param {Number} size.height CSS pixels
     * @param {Number} size.width  CSS pixels
     * @param {Number} [size.devicePixelRatio=1]
     */
    updateSize(size) {
        const me = this, drawn = me.canvasSize;

        if (me.context && drawn?.width === size.width && drawn.height === size.height && (drawn.devicePixelRatio || 1) === (size.devicePixelRatio || 1)) {
            return
        }

        me.canvasSize = size;

        if (me.context) {
            const ratio = size.devicePixelRatio || 1;

            me.context.canvas.width  = Math.round(size.width  * ratio);
            me.context.canvas.height = Math.round(size.height * ratio);
            me.arrange();
            me.updateResources(size.width, size.height)
        }
    }
}

export default Neo.setupClass(RoundTable);
