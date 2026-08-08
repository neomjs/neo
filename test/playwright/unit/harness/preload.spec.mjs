import {expect, test} from '@playwright/test';
import {readFile}     from 'node:fs/promises';
import vm             from 'node:vm';

const preloadPath = new URL('../../../../harness/preload.cjs', import.meta.url);
const mainPath    = new URL('../../../../harness/main.mjs', import.meta.url);

/**
 * @summary Executes the CommonJS preload against capability-shaped Electron mocks without booting
 * Electron. Timers and DOM diagnostics are retained as inert seams; the test owns only the exposed
 * bridge contract.
 * @param {Object} [options={}] Mock clock, DOM, and timer-registration surfaces.
 * @param {Object} [options.clock]
 * @param {Object} [options.dom]
 * @param {Boolean} [options.precedeWithUnrelatedTimer=false]
 * @returns {Promise<Object>}
 */
async function loadPreload({clock={now: 0}, dom={}, precedeWithUnrelatedTimer=false} = {}) {
    const
        intervals     = precedeWithUnrelatedTimer
            ? [{cleared: false, fn: function unrelatedTimer() {}}]
            : [],
        invokes       = [],
        exposed       = {},
        sends         = [],
        source        = await readFile(preloadPath, 'utf8'),
        emptyNodeList = [];

    vm.runInNewContext(source, {
        clearInterval(id) {
            id.cleared = true
        },
        Date    : {now: () => clock.now},
        document: {
            querySelector(selector) { return dom.selectors?.[selector] ?? null },
            querySelectorAll(selector) { return dom.selectorLists?.[selector] ?? emptyNodeList }
        },
        process: {versions: {electron: '42.0.0'}},
        require(name) {
            if (name !== 'electron') throw new Error(`unexpected preload dependency: ${name}`);

            return {
                contextBridge: {
                    exposeInMainWorld(name, value) {
                        exposed.name  = name;
                        exposed.value = value
                    }
                },
                ipcRenderer: {
                    invoke(...args) {
                        invokes.push(args);
                        return Promise.resolve({ok: true, result: []})
                    },
                    send(...args) {
                        sends.push(args)
                    }
                }
            }
        },
        setInterval(fn) {
            const interval = {cleared: false, fn};
            intervals.push(interval);
            return interval
        },
        window: {
            addEventListener() {},
            getComputedStyle: dom.getComputedStyle ?? (() => ({display: 'block', visibility: 'visible'}))
        }
    });

    return {exposed, intervals, invokes, sends}
}

/**
 * @summary Resolves the product first-paint reporter by its semantic callback name and fails loud
 * when the production preload exposes a missing or ambiguous timer seam.
 * @param {Object[]} intervals
 * @returns {Object}
 */
function getFirstPaintReporter(intervals) {
    const reporters = intervals.filter(({fn}) => fn.name === 'reportFirstPaint');

    expect(reporters, 'exactly one named first-paint reporter').toHaveLength(1);

    return reporters[0]
}

/**
 * @summary Builds a cockpit adapter-head element mock: an `is-<state>` class plus its label child.
 *
 * The preload no longer queries `.fm-fleet-head.is-sample …` — a selector pinned to one state could
 * only ever observe that state, so a promoted (live) cockpit reported `null` and the witness could not
 * distinguish "working" from "broken". These mocks therefore carry the state on the element, exactly
 * as `FleetGrid` renders `is-${adapterState}`.
 * @param {String} state
 * @param {String|null} labelText
 * @param {String} labelSelector
 * @returns {Object}
 */
function adapterHead(state, labelText, labelSelector) {
    // `state` may be an ARRAY, to express a head advertising several `is-*` classes at once. The old
    // single-string form hard-coded `name === \`is-${state}\``, so the mock could express exactly ONE
    // class — which made the ambiguity path structurally untestable and left "no control" looking like
    // "nothing to control".
    const states = Array.isArray(state) ? state : [state];

    return {
        classList    : {contains: name => states.some(entry => name === `is-${entry}`)},
        querySelector: selector => selector === labelSelector && labelText !== null ? {textContent: labelText} : null
    }
}

/**
 * @summary DOM mock for a cockpit rendering the given roster/stream adapter states.
 * @param {Object} options
 * @returns {Object}
 */
function cockpitDom({rosterState='sample', rosterLabel='static roster', streamState='sample', streamLabel='sample · live feed pending', cards=[{getClientRects: () => [{}]}], tourControls=[], cockpit={getClientRects: () => [{}]}} = {}) {
    return {
        selectors: {
            '.fm-fleet-cockpit'                : cockpit,
            '.fm-fleet-cockpit .fm-fleet-head' : rosterState === null ? null : adapterHead(rosterState, rosterLabel, '.fm-fleet-stale'),
            '.fm-fleet-cockpit .fm-stream-head': streamState === null ? null : adapterHead(streamState, streamLabel, '.fm-stream-state')
        },
        selectorLists: {
            '.fm-fleet-cockpit .fm-agent-card'                                     : cards,
            '.fm-fleet-cockpit .fm-fusion-tour, .fm-fleet-cockpit .fm-tour-caption': tourControls
        }
    }
}

test.describe('Electron harness preload capability', () => {
    test('exposes exactly the named promise capabilities and no raw transport or secret facts', async () => {
        const
            {exposed, invokes} = await loadPreload(),
            request            = {method: 'listAgents', params: {}};

        expect(exposed.name).toBe('neoShell');
        expect(Object.keys(exposed.value).sort()).toEqual(['brainHealth', 'fleetRequest', 'shellVersion']);
        expect(exposed.value.shellVersion).toBe('42.0.0');
        expect(exposed.value).not.toHaveProperty('bearerToken');
        expect(exposed.value).not.toHaveProperty('defineFleetAgent');
        expect(exposed.value).not.toHaveProperty('endpoint');
        expect(exposed.value).not.toHaveProperty('ipcRenderer');
        expect(exposed.value).not.toHaveProperty('node');

        await expect(exposed.value.fleetRequest(request)).resolves.toEqual({ok: true, result: []});

        // The health pull crosses its own named channel and carries no payload — the renderer can
        // ask, never influence.
        await expect(exposed.value.brainHealth()).resolves.toEqual({ok: true, result: []});
        expect(invokes).toEqual([['fleet-request', request], ['brain-health']])
    })

    test('keeps credential capture in the one main-owned channel with no renderer input surface', async () => {
        const
            mainSource    = await readFile(mainPath, 'utf8'),
            preloadSource = await readFile(preloadPath, 'utf8');

        expect(preloadSource).not.toContain('window.prompt');
        expect(preloadSource).not.toContain('fleet-define-agent');
        expect(mainSource).not.toContain('<input');
        expect(mainSource).not.toContain("ipcMain.handle('fleet-define-agent'");
        expect(mainSource.match(/ipcMain\.handle\('fleet-request'/g)).toHaveLength(1);
        expect(mainSource).toContain("webContents.on('before-input-event'");
        expect(mainSource).toContain('inputEvent.preventDefault()');
        expect(mainSource).toContain('clipboard.readText()')
    })

    test('reports the exact bounded cold-first-paint semantics over the private diagnostic channel', async () => {
        const
            clock              = {now: 1234},
            cockpit            = {getClientRects: () => [{}]},
            cards              = [{getClientRects: () => [{}]}, {getClientRects: () => [{}]}],
            {intervals, sends} = await loadPreload({
                clock,
                dom                      : cockpitDom({cards, cockpit, rosterLabel: ' static roster ', streamLabel: ' sample · live feed pending '}),
                precedeWithUnrelatedTimer: true
            }),
            firstPaintReporter = getFirstPaintReporter(intervals);

        expect(intervals.findIndex(interval => interval === firstPaintReporter)).toBeGreaterThan(0);

        firstPaintReporter.fn();

        expect(sends).toContainEqual(['shell-first-paint-report', {
            activityLabel       : 'sample · live feed pending',
            cardCount           : 2,
            cockpitVisible      : true,
            rendererFirstPaintMs: 0,
            rosterLabel         : 'static roster',
            rosterState         : 'sample',
            streamState         : 'sample',
            timedOut            : false,
            tourControlCount    : 0
        }]);
        expect(firstPaintReporter.cleared).toBe(true)
    })

    test('times out honestly when demo controls or missing cards prevent the product receipt', async () => {
        const
            clock              = {now: 0},
            cockpit            = {getClientRects: () => [{}]},
            card               = {getClientRects: () => [{}]},
            {intervals, sends} = await loadPreload({
                clock,
                dom: cockpitDom({cards: [card], cockpit, tourControls: [{}]})
            }),
            firstPaintReporter = getFirstPaintReporter(intervals);

        firstPaintReporter.fn();
        expect(sends.filter(([channel]) => channel === 'shell-first-paint-report')).toEqual([]);

        clock.now = 60001;
        firstPaintReporter.fn();

        expect(sends).toContainEqual(['shell-first-paint-report', {
            activityLabel       : 'sample · live feed pending',
            cardCount           : 1,
            cockpitVisible      : true,
            rendererFirstPaintMs: null,
            rosterLabel         : 'static roster',
            rosterState         : 'sample',
            streamState         : 'sample',
            timedOut            : true,
            tourControlCount    : 1
        }]);
        expect(firstPaintReporter.cleared).toBe(true)
    })

    // The defect these cover: the witness previously read `.fm-fleet-head.is-sample .fm-fleet-stale`,
    // so it could observe exactly ONE adapter state — the one we do not want to ship. A cockpit
    // promoted to `live` made that selector match nothing and the field reported `null`,
    // indistinguishable from a broken selector or an absent cockpit. An instrument that can only
    // report failure cannot witness a release gate, so `live` needs a POSITIVE control.
    test.describe('adapter-state observation (the witness must be able to report SUCCESS)', () => {
        /**
         * Reads the first-paint report. `viaTimeout` covers the states that are deliberately NOT
         * "ready" — an absent or unrecognised head must not satisfy the product receipt, so it is
         * observable only through the timeout receipt. That is the honest path, not a workaround.
         */
        const readFirstPaint = async (dom, {viaTimeout = false} = {}) => {
            const clock              = {now: 0},
                  {intervals, sends} = await loadPreload({clock, dom}),
                  reporter           = getFirstPaintReporter(intervals);

            reporter.fn();

            if (viaTimeout) {
                clock.now = 60001;
                reporter.fn();
            }

            return sends.find(([channel]) => channel === 'shell-first-paint-report')?.[1] ?? null;
        };

        test('⭐ AMBIGUOUS head — the CommonJS observer reports `unknown` and stays NOT READY', async () => {
            // The CJS resolution is a FORCED duplicate of `adapterWitness.resolveAdapterState` (Electron
            // cannot load an ESM preload in a sandboxed renderer), so asserting the two state LISTS match
            // is not enough — the resolution BEHAVIOUR must be pinned here too, or the copy could revert
            // to first-match and nothing would catch it.
            const report = await readFirstPaint(cockpitDom({
                rosterState: ['live', 'sample'],   // contradictory DOM
                rosterLabel: ''
            }), {viaTimeout: true});

            // Not `live` — which is what first-match returned, preferring whichever state was listed first.
            expect(report.rosterState).toBe('unknown');
            // And ambiguity must not satisfy the product receipt: it arrives via the timeout path.
            expect(report.timedOut).toBe(true);
        })

        test('a head advertising THREE known classes is also `unknown`', async () => {
            const report = await readFirstPaint(cockpitDom({
                rosterState: ['live', 'sample', 'stale'], rosterLabel: ''
            }), {viaTimeout: true});

            expect(report.rosterState).toBe('unknown');
        })

        test('the STREAM head obeys the same rule — both heads, not just the roster', async () => {
            const report = await readFirstPaint(cockpitDom({
                streamState: ['live', 'degraded'], streamLabel: '● streaming'
            }), {viaTimeout: true});

            expect(report.streamState).toBe('unknown');
        })

        test('POSITIVE CONTROL — a LIVE cockpit is observed as live, not as null', async () => {
            const report = await readFirstPaint(cockpitDom({
                rosterState: 'live', rosterLabel: '',
                streamState: 'live', streamLabel: '● streaming'
            }));

            // The assertion the previous instrument could not make.
            expect(report.rosterState).toBe('live');
            expect(report.streamState).toBe('live');
            expect(report.rosterLabel).toBe('');
            expect(report.activityLabel).toBe('● streaming');
        })

        test('stale and degraded are each observed as themselves', async () => {
            const stale = await readFirstPaint(cockpitDom({
                rosterState: 'stale', rosterLabel: 'stale — reconnecting',
                streamState: 'stale', streamLabel: 'stale — reconnecting'
            }));

            expect(stale.rosterState).toBe('stale');
            expect(stale.streamState).toBe('stale');

            const degraded = await readFirstPaint(cockpitDom({
                rosterState: 'degraded', rosterLabel: '',
                streamState: 'degraded', streamLabel: '● streaming'
            }));

            expect(degraded.rosterState).toBe('degraded');
            expect(degraded.streamState).toBe('degraded');
        })

        test('NEGATIVE CONTROL — an ABSENT head is distinct from every rendered state', async () => {
            const report = await readFirstPaint(cockpitDom({rosterState: null, streamState: null}), {viaTimeout: true});

            // Absence must not masquerade as a state, and must not be confused with `live`'s empty label.
            expect(report.rosterState).toBeNull();
            expect(report.streamState).toBeNull();
            // And it must NOT count as a product receipt: absence is reported, never accepted.
            expect(report.timedOut).toBe(true);
            expect(report.rosterLabel).toBeNull();
            expect(report.activityLabel).toBeNull();
        })

        test('an UNMAPPED state reports `unknown` rather than falling back to a known one', async () => {
            // A state added upstream must surface as unverified. Defaulting to `sample` would let a new
            // render state pass a check that never examined it.
            const report = await readFirstPaint(cockpitDom({rosterState: 'reconciling', rosterLabel: 'anything'}), {viaTimeout: true});

            expect(report.rosterState).toBe('unknown');
            // Unverified, therefore not ready — it surfaces through the timeout receipt.
            expect(report.timedOut).toBe(true);
        })
    })
});
