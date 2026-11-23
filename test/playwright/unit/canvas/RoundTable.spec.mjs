/**
 * @file test/playwright/unit/canvas/RoundTable.spec.mjs
 * @summary Pins the round table's contract: what it reads from a record, where it stands around a statement at
 * each size, where an item is at each minute, and what the scene does with its inputs while still or moving.
 */

import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'CanvasRoundTableRendererTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import renderer       from '../../../../src/canvas/RoundTable.mjs';

const
    RoundTable = renderer.constructor,
    names      = ['Ada', 'Clio', 'Grace', 'Mnemosyne', 'Vega', 'Julia', 'Maryam', 'Emmy', 'Euclid', 'Sophie'],
    team       = [
        ...names.map((name, n) => ({group: n < 5 ? 'claude' : n < 7 ? 'gemini' : 'gpt', id: name, kind: 'seat', name})),
        {id: 'door', kind: 'door', name: 'Contributors'},
        {id: 'tobiu', kind: 'merge', name: '@tobiu'}
    ],
    // the Portal hero's statement at 1440×900, 1440×800, 900×700 and 390×844, canvas-relative
    wide       = {bands: [{height: 80, y: 327}], blocks: [{height: 100, width: 388, x: 526, y: 187}, {height: 96, width: 700, x: 370, y: 447}, {height: 56, width: 352, x: 544, y: 599}]},
    shorter    = {bands: [{height: 80, y: 277}], blocks: [{height: 100, width: 388, x: 526, y: 137}, {height: 96, width: 700, x: 370, y: 397}, {height: 56, width: 352, x: 544, y: 549}]},
    narrow     = {bands: [{height: 80, y: 236}], blocks: [{height: 100, width: 331, x: 285, y: 96}, {height: 96, width: 700, x: 100, y: 356}, {height: 56, width: 352, x: 274, y: 508}]},
    phone      = {bands: [{height: 140, y: 201}], blocks: [{height: 100, width: 246, x: 72, y: 69}, {height: 169, width: 342, x: 24, y: 373}, {height: 128, width: 342, x: 24, y: 589}]},
    palettes   = {dark: {card: '#000', door: '#fff', ground: ['#001', '#002'], groups: {claude: '#a0f', gemini: '#08f', gpt: '#0c9'}, ink: '#eee', inkDim: '#999', line: '#446', merge: '#fff', warn: '#fa0'}};

/**
 * A small record: two days, two items of one author that overlap, one from the door opened before the window,
 * one without a review, and two rows the scene cannot draw.
 * @returns {Object}
 */
const record = () => ({
    caption: 'two days',
    from   : '2026-11-13T00:00:00Z',
    groups : [{id: 'claude', name: 'Claude'}, {id: 'gemini', name: 'Gemini'}, {id: 'gpt', name: 'GPT'}],
    items  : [
        [102, 'two', 0, null, 20, 400, [[2, 'A', 50]]],
        [101, 'one', 0, null, 10, 100, [[3, 'C', 30], [3, 'A', 60]]],
        [103, 'three', 4, 'jane', -50, 300, [[0, 'A', 200], [0, 'A', 900]]],
        [104, 'four', 2, null, 1500, 1600, []],
        [105, 'no such seat', 99, null, 0, 10, []],
        [106, 'merged after the window', 0, null, 0, 5000, []]
    ],
    seats  : [
        {group: 'claude', id: 'a', kind: 'seat', name: 'Ada'}, {group: 'claude', id: 'c', kind: 'seat', name: 'Clio'},
        {group: 'gemini', id: 'j', kind: 'seat', name: 'Julia'}, {group: 'gpt', id: 'e', kind: 'seat', name: 'Euclid'},
        {id: 'door', kind: 'door', name: 'Contributors'}, {id: 't', kind: 'merge', name: '@t'}
    ],
    to     : '2026-11-15T00:00:00Z',
    version: 1
});

/**
 * A 2d context stand-in: every method is a no-op, gradients accept colour stops, text measures by its length.
 * @returns {Object}
 */
const createContext = () => new Proxy({canvas: {height: 0, width: 0}, measureText: text => ({width: text.length * 7})}, {
    get(target, key) {
        return key in target ? target[key] : () => ({addColorStop() {}})
    }
});

/** @summary The layout of the full team around a statement. */
const arrange = (width, height, statement, {dayMax = 69, measures = renderer.measures} = {}) => RoundTable.layout({
    ...statement, dayMax, days: 7, deskMax: team.map(() => 4), height, measures, nameWidths: team.map(seat => seat.name.length * 7.5), seats: team, width
});

test.describe('Neo.canvas.RoundTable — the record as a frame reads it', () => {
    test('items sort by their merge; rows the scene cannot draw are left out', () => {
        const data = RoundTable.index(record());

        expect(data.count).toBe(4);
        expect(data.numbers).toEqual([101, 103, 102, 104]);
        expect([...data.day]).toEqual([0, 0, 0, 1]);
        expect([...data.slot]).toEqual([0, 1, 2, 0]);
        expect([...data.dayCount]).toEqual([3, 1]);
        expect(data).toMatchObject({dayMax: 3, days: 2, logins: [null, 'jane', null, null], minutes: 2880})
    });

    test('an item is approved by its last review, else by its merge; a review after the merge is no part of it', () => {
        const data = RoundTable.index(record());

        expect([...data.approved]).toEqual([60, 200, 50, 1600]);
        expect([...data.reviews.at]).toEqual([30, 50, 60, 200]);
        expect([...data.reviews.item]).toEqual([0, 2, 0, 1]);
        expect([...data.reviews.state]).toEqual([2, 1, 1, 1]);
        expect([...data.authored].slice(0, 5)).toEqual([2, 0, 1, 0, 1]);
        expect([...data.reviewed].slice(0, 4)).toEqual([1, 0, 1, 2])
    });

    test('two items open at one desk take two places, and two that wait for their merge take two', () => {
        const data = RoundTable.index(record());

        expect([...data.desk], 'the second of one author sits beside the first').toEqual([0, 0, 1, 0]);
        expect([...data.queue]).toEqual([1, 1, 0, 0]);
        expect(data.deskMax[0]).toBe(2)
    });

    test('a record the scene cannot draw is no record', () => {
        expect(RoundTable.index(null)).toBeNull();
        expect(RoundTable.index({})).toBeNull();
        expect(RoundTable.index({...record(), items: 'none'})).toBeNull();
        expect(RoundTable.index({...record(), to: '2026-11-13T00:00:00Z'})).toBeNull()
    })
});

test.describe('Neo.canvas.RoundTable — the scene stands around the statement', () => {
    const {margin} = renderer.measures, apart = (box, block) => box[0] >= block.x + block.width + margin || box[0] + box[2] <= block.x - margin
        || box[1] >= block.y + block.height + margin || box[1] + box[3] <= block.y - margin;

    test('a wide surface seats everyone by name, outside every block and band', () => {
        const place = arrange(1440, 842, wide);

        expect(place.mode).toBe('table');

        team.forEach((seat, s) => {
            const x = place.seats[s * 2], y = place.seats[s * 2 + 1], side = place.sides[s], name = seat.name.length * 7.5 + 12;

            if (seat.kind !== 'merge') {
                const box = side < 0 ? [x - name, y - 9, name + 6, 18] : [x - 6, y - 9, name + 6, 18];

                expect(side, seat.name).not.toBe(0);
                expect(box[0], `${seat.name} stays on the surface`).toBeGreaterThanOrEqual(0);
                expect(box[0] + box[2]).toBeLessThanOrEqual(1440);
                wide.blocks.forEach(block => expect(apart(box, block), `${seat.name} keeps off a block`).toBe(true));
                wide.bands.forEach(band => expect(y <= band.y - margin || y >= band.y + band.height + margin, `${seat.name} keeps out of the headline's row`).toBe(true))
            }
        })
    });

    test('the first half sits left, top to bottom with the door last; the rest sits right; no two are closer than a name', () => {
        const place = arrange(1440, 842, wide), y = s => place.seats[s * 2 + 1], left = [0, 1, 2, 3, 4, 10], right = [5, 6, 7, 8, 9];

        left.forEach(s => expect(place.sides[s]).toBe(-1));
        right.forEach(s => expect(place.sides[s]).toBe(1));

        for (const side of [left, right]) {
            side.slice(1).forEach((s, n) => expect(y(s) - y(side[n]), 'top to bottom, a name apart').toBeGreaterThanOrEqual(26))
        }
    });

    test('the merge seat stands over the strip, and the strip keeps the bottom free', () => {
        const place = arrange(1440, 842, wide), {strip} = place;

        expect(place.merge).toEqual({x: 720, y: strip.top - 24});
        expect(place.seats[11 * 2 + 1]).toBe(strip.top - 24);
        expect(strip.top - 24, 'below the buttons').toBeGreaterThan(655 + margin / 2);
        expect(842 - strip.captionY - 4, 'the room kept free').toBe(renderer.measures.bottom);
        expect(strip.size).toBe(8)
    });

    test('the squares step down before the bottom\'s room shrinks, but not below the floor for its sake', () => {
        const {bottom, floor} = renderer.measures, below = (place, height) => height - place.strip.captionY - 4;

        // 20px less than the wide surface: the next size keeps the whole room
        const lower = arrange(1440, 822, wide);

        expect(lower.strip.size).toBe(6);
        expect(below(lower, 822)).toBe(bottom);

        // 1440×800: only 3px squares would keep the whole room, so the floor stands and the room gives 6px
        const short = arrange(1440, 742, shorter);

        expect(short.mode).toBe('table');
        expect(short.strip.size).toBe(floor);
        expect(below(short, 742)).toBe(42);

        // a phone: nothing larger stands
        expect(arrange(390, 786, phone).strip.size).toBeLessThan(floor)
    });

    test('where the sides do not hold the seats, the strip stands alone', () => {
        const place = arrange(900, 642, narrow);

        expect(place.mode).toBe('strip');
        expect(place.ring).toBeNull();
        expect(place.strip.top, 'below the buttons').toBeGreaterThan(564);
        expect(place.strip.captionY).toBeLessThanOrEqual(642)
    });

    test('a phone gets the strip in small squares and without day names', () => {
        const place = arrange(390, 786, phone);

        expect(place.mode).toBe('strip');
        expect(place.strip.size).toBeLessThanOrEqual(4);
        expect(place.strip.words).toBe(0);
        expect(place.strip.top).toBeGreaterThan(717)
    });

    test('the scene is erased under the statement\'s column: its parts, the headline across their width, the gaps between them', () => {
        expect(RoundTable.calmOf(wide)).toEqual([
            {height: 100, width: 388, x: 526, y: 187},
            {height: 80,  width: 700, x: 370, y: 327},
            {height: 96,  width: 700, x: 370, y: 447},
            {height: 56,  width: 352, x: 544, y: 599},
            {height: 40,  width: 388, x: 526, y: 287},
            {height: 40,  width: 700, x: 370, y: 407},
            {height: 56,  width: 352, x: 544, y: 543}
        ]);
        expect(RoundTable.calmOf({bands: wide.bands, blocks: []}), 'a headline alone names no column').toEqual([])
    });

    test('where not even the strip fits, nothing stands', () => {
        expect(arrange(390, 730, phone).mode).toBe('none')
    })

    test('a dense day uses the optional smaller square only after the usual ring and strip fail', () => {
        const measures = {...renderer.measures, standaloneFallbackSquare: [2, 1]};

        for (const [width, height, statement] of [[1440, 842, wide], [1440, 742, shorter], [900, 642, narrow], [390, 786, phone]]) {
            expect(arrange(width, height, statement, {measures})).toEqual(arrange(width, height, statement))
        }

        // A 2px ring would fit here, but the existing standalone 5px strip still takes precedence.
        expect(arrange(1440, 744, wide, {dayMax: 92, measures})).toMatchObject({
            mode: 'strip', ring: null, strip: {ringed: false, size: 5}
        });
        expect(arrange(390, 786, phone, {dayMax: 100}).mode).toBe('none');
        const place = arrange(390, 786, phone, {dayMax: 100, measures});
        expect(place).toMatchObject({mode: 'strip', ring: null, strip: {gap: 1, ringed: false, size: 2}});
        expect(place.strip.top).toBeGreaterThan(717);
        expect(place.strip.captionY + 4).toBeLessThanOrEqual(786);
        expect(arrange(390, 730, phone, {dayMax: 100, measures}).mode).toBe('none')
    })
});

test.describe('Neo.canvas.RoundTable — an item\'s way', () => {
    const data  = RoundTable.index(record()), span = {appear: 36, chord: 103, flight: 72, minute: 103, ride: 93},
          place = RoundTable.layout({...wide, dayMax: data.dayMax, days: data.days, deskMax: data.deskMax, height: 842, measures: renderer.measures, nameWidths: [30, 30, 30, 40, 80, 20], seats: record().seats, width: 1440}),
          at    = (i, clock) => [...RoundTable.locate(new Float32Array(4), i, clock, data, place, span)];

    test('it is nowhere before it opens, at its author\'s desk while open, and landed in its day\'s column after its merge', () => {
        expect(place.mode).toBe('table');
        expect(at(0, 5)[2], 'not drawn before it opens').toBe(0);

        const [x, y, scale, landed] = at(0, 55), seatX = place.seats[0], seatY = place.seats[1];

        expect(scale).toBe(1);
        expect(landed).toBe(0);
        expect(Math.hypot(x - seatX, y - seatY), 'at the desk').toBeLessThan(40);

        const [slotX, slotY, , down] = at(0, 100 + span.flight);

        expect(down).toBe(1);
        expect(slotX).toBe(place.strip.x);
        expect(slotY).toBe(place.strip.baseline - place.strip.pitch + place.strip.gap)
    });

    test('its way has no jump: not at its approval, not at its merge, not where it lands', () => {
        for (const i of [0, 1, 2, 3]) {
            for (const moment of [data.approved[i], data.merged[i], data.merged[i] + span.flight]) {
                const before = at(i, moment - 0.01), after = at(i, moment + 0.01);

                // a landed square is drawn from its corner, an item on its way around its middle
                const shift = after[3] && !before[3] ? place.strip.size / 2 : 0;

                expect(Math.hypot(after[0] + shift - before[0], after[1] + shift - before[1]), `item ${i} at ${moment}`).toBeLessThan(1.5)
            }
        }
    });

    test('an approved item waits at the merge seat until its merge', () => {
        const [x, y] = at(2, 390);

        expect(Math.abs(y - place.merge.y)).toBeLessThan(12);
        expect(x).toBeGreaterThan(place.merge.x)
    });

    test('a strip that stands alone fades each item in where it lands', () => {
        const alone = RoundTable.layout({...narrow, dayMax: data.dayMax, days: data.days, deskMax: data.deskMax, height: 642, measures: renderer.measures, nameWidths: [30, 30, 30, 40, 80, 20], seats: record().seats, width: 900}),
              out   = [...RoundTable.locate(new Float32Array(4), 0, 100 + span.flight / 2, data, alone, span)];

        expect(alone.mode).toBe('strip');
        expect(out[3]).toBe(1);
        expect(out[2]).toBeGreaterThan(0);
        expect(out[2]).toBeLessThan(1);
        expect([...RoundTable.locate(new Float32Array(4), 0, 90, data, alone, span)][2], 'not before its merge').toBe(0)
    })
});

test.describe('Neo.canvas.RoundTable — the scene and its inputs', () => {
    const stopLoop = () => {
        clearTimeout(renderer.animationId);
        renderer.animationId = null
    };

    test.beforeEach(() => {
        renderer.clearGraph();
        renderer.context = createContext();
        renderer.updateSize({devicePixelRatio: 2, height: 842, width: 1440})
    });

    test.afterEach(() => {
        stopLoop();
        renderer.clearGraph()
    });

    test('the backing store follows the pixel ratio, and a report of the size already drawn draws nothing', () => {
        const {frames} = renderer;

        expect(renderer.context.canvas).toMatchObject({height: 1684, width: 2880});

        renderer.updateSize({devicePixelRatio: 2, height: 842, width: 1440});

        expect(renderer.frames).toBe(frames)
    });

    test('the scene draws its table only once it has its look, its statement and its record', () => {
        renderer.setRecord({record: record()});
        renderer.setLook({palettes});

        expect(renderer.getStats(), 'no statement yet').toMatchObject({items: 4, mode: null, record: true});

        renderer.setQuiet(wide);

        expect(renderer.getStats()).toMatchObject({items: 4, mode: 'table', record: true, still: true, theme: 'light'})
    });

    test('a still scene shows the end state and draws only when an input changes', async () => {
        renderer.setLook({palettes});
        renderer.setQuiet(wide);
        renderer.setRecord({record: record()});

        const {frames, landed, seats, strip} = renderer.getStats();

        expect(landed, 'every item has landed').toBe(4);
        expect(renderer.animationId, 'no loop').toBeNull();
        expect(seats.map(seat => seat.name)).toEqual(['Ada', 'Clio', 'Julia', 'Euclid', 'Contributors', '@t']);
        expect(strip[1] + strip[3]).toBeLessThanOrEqual(842);

        await new Promise(resolve => setTimeout(resolve, 40));
        expect(renderer.frames).toBe(frames);

        renderer.setTheme('dark');
        expect(renderer.frames).toBeGreaterThan(frames)
    });

    test('a moving scene starts late in the window, runs its loop, and stops when it is still again', () => {
        renderer.setLook({palettes});
        renderer.setQuiet(wide);
        renderer.setRecord({record: record()});

        expect(renderer.clock).toBeCloseTo(2880 * renderer.pace.startAt, 3);

        renderer.setMotion({still: false});

        expect(renderer.getStats().still).toBe(false);
        expect(renderer.animationId, 'the loop runs').not.toBeNull();

        stopLoop();
        renderer.setMotion({still: true});

        expect(renderer.animationId).toBeNull();
        expect(renderer.getStats().landed).toBe(4)
    });

    test('a record the scene cannot draw leaves it without one, and nothing throws', () => {
        renderer.setLook({palettes});
        renderer.setQuiet(wide);
        renderer.setRecord({record: {items: 'none'}});

        expect(renderer.getStats()).toMatchObject({items: 0, mode: null, record: false, seats: null, strip: null});

        renderer.setRecord({record: null});
        renderer.setMotion({still: false});

        expect(renderer.animationId, 'no loop without a record').toBeNull()
    });

    test('the cards name a pull request and a seat in their own words', () => {
        renderer.setRecord({record: record()});

        expect(renderer.itemLines(0)).toEqual(['#101 · one', 'Ada · reviewed by Euclid · merged after 1 h 30 min']);
        expect(renderer.itemLines(1)).toEqual(['#103 · three', 'jane · reviewed by Ada · merged after 5 h 50 min']);
        expect(renderer.itemLines(3)).toEqual(['#104 · four', 'Julia · merged after 1 h 40 min']);
        expect(renderer.seatLines(0)).toEqual(['Ada · Claude', '2 pull requests merged · 1 review']);
        expect(renderer.seatLines(4)).toEqual(['Contributors', '1 account · 1 pull request merged']);
        expect(renderer.seatLines(5)).toEqual(['@t', 'merged 4 pull requests']);
        expect(renderer.captionOf(2), 'a still scene without a unit names the record\'s caption alone').toBe('two days');
        renderer.still = false;
        expect(renderer.captionOf(2), 'a replay without a unit still counts').toBe('Replay of two days · 2 of 4');
        renderer.still = true;
        renderer.setRecord({record: {...record(), unit: 'landed things'}});
        expect(renderer.captionOf(2), 'a still scene replays nothing: the window, then the total').toBe('two days · 4 landed things');
        renderer.still = false;
        expect(renderer.captionOf(2), 'a replay under way says that it is one, and how far').toBe('Replay of two days · 2 of 4 landed things');
        renderer.setRecord({record: {...record(), caption: '', unit: 'landed things'}});
        expect(renderer.captionOf(2), 'a record without a caption').toBe('Replay · 2 of 4 landed things');
        expect(renderer.stamp(860)).toBe('14:20 UTC');
        renderer.still = true;
        expect(renderer.captionOf(2)).toBe('4 landed things');

        expect(RoundTable.duration(47)).toBe('47 min');
        expect(RoundTable.duration(4610)).toBe('3 d 4 h');
        expect(RoundTable.dayLabel(Date.parse('2026-11-13T00:00:00Z'), 1)).toBe('Sat 14')
    });

    test('a caption too long for its room keeps the window: what a square is goes, then its last parts, then the unit', () => {
        const within = length => text => text.length <= length;

        renderer.setRecord({record: {...record(), caption: 'two days · five reviews · some/repo', unit: 'landed things, one square each'}});
        renderer.still = false;

        expect(renderer.captionOf(2)).toBe('Replay of two days · 2 of 4 landed things, one square each · five reviews · some/repo');
        expect(renderer.captionOf(2, within(85))).toBe('Replay of two days · 2 of 4 landed things, one square each · five reviews · some/repo');
        expect(renderer.captionOf(2, within(84)), 'what a square is goes before a part of the record does').toBe('Replay of two days · 2 of 4 landed things · five reviews · some/repo');
        expect(renderer.captionOf(2, within(67))).toBe('Replay of two days · 2 of 4 landed things · five reviews');
        expect(renderer.captionOf(2, within(55))).toBe('Replay of two days · 2 of 4 landed things');
        expect(renderer.captionOf(2, within(40)), 'a count without its unit keeps the window alone').toBe('Replay of two days · 2 of 4');
        expect(renderer.captionOf(2, within(5)), 'and stays where nothing fits').toBe('Replay of two days · 2 of 4');

        renderer.still = true;

        expect(renderer.captionOf(2, within(49))).toBe('two days · 4 landed things · five reviews');
        expect(renderer.captionOf(2, within(25)), 'a total without its unit says nothing').toBe('two days')
    });

    test('the legend names the warm mark with its count, and the merge seat says what it does', () => {
        const texts = [], context = createContext();

        context.fillText = text => texts.push(text);
        renderer.context = context;
        renderer.setLook({palettes});
        renderer.setQuiet(wide);
        renderer.setRecord({record: record()});

        expect(renderer.words.legend.map(([name]) => name)).toEqual(['Claude', 'Gemini', 'GPT', 'Contributors', '1 change request']);
        expect(renderer.words.legend.at(-1)[1], 'drawn in the palette\'s warning colour').toBe('warn');
        expect(renderer.labels).toEqual(['Ada', 'Clio', 'Julia', 'Euclid', 'Contributors', '@t merges']);
        expect(texts, 'the frame writes both').toEqual(expect.arrayContaining(['1 change request', '@t merges']));

        const {seats} = renderer.getStats(), merge = seats.at(-1);

        expect(merge.name, 'the record\'s name stays the name').toBe('@t');
        expect(merge.box[2], 'the box holds the label that is drawn').toBe('@t merges'.length * 7 + 28);

        const calm = record();

        calm.items[1][6] = [[3, 'A', 60]];
        renderer.setRecord({record: calm});

        expect(renderer.words.legend.map(([name]) => name), 'no change request, no key').toEqual(['Claude', 'Gemini', 'GPT', 'Contributors'])
    });

    test('the replay\'s clock ends before the next day\'s name: with its zone, without it, or not at all', () => {
        const
            texts   = [],
            context = createContext(),
            // seven day columns; the last statement is as wide as a 768 px surface allows
            week    = {...record(), to: '2026-11-20T00:00:00Z'},
            tablet  = {blocks: [{height: 300, width: 700, x: 34, y: 300}]};

        context.fillText = text => texts.push(text);
        renderer.context = context;
        renderer.setLook({palettes});
        renderer.setRecord({record: week});
        renderer.setMotion({still: false});

        for (const [width, height, statement, zone] of [[1440, 842, wide, ' UTC'], [900, 642, narrow, ''], [768, 966, tablet, null]]) {
            renderer.updateSize({devicePixelRatio: 1, height, width});
            stopLoop();
            texts.length = 0;
            renderer.setQuiet(statement);
            stopLoop();

            expect(renderer.words.zone, `at ${width} px`).toBe(zone);
            expect(texts.filter(text => /^\d\d:\d\d/.test(text)), `the frame at ${width} px`).toEqual(zone === null ? [] : [expect.stringMatching(new RegExp(`^\\d\\d:\\d\\d${zone}$`))])
        }

        expect(renderer.stamp(860, ''), 'the clock without its zone').toBe('14:20')
    })
});
