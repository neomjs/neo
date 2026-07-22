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

test.describe('Electron harness preload capability', () => {
    test('exposes one Fleet promise capability and no raw transport or secret facts', async () => {
        const
            {exposed, invokes} = await loadPreload(),
            request            = {method: 'listAgents', params: {}};

        expect(exposed.name).toBe('neoShell');
        expect(Object.keys(exposed.value).sort()).toEqual(['fleetRequest', 'shellVersion']);
        expect(exposed.value.shellVersion).toBe('42.0.0');
        expect(exposed.value).not.toHaveProperty('bearerToken');
        expect(exposed.value).not.toHaveProperty('defineFleetAgent');
        expect(exposed.value).not.toHaveProperty('endpoint');
        expect(exposed.value).not.toHaveProperty('ipcRenderer');
        expect(exposed.value).not.toHaveProperty('node');

        await expect(exposed.value.fleetRequest(request)).resolves.toEqual({ok: true, result: []});
        expect(invokes).toEqual([['fleet-request', request]])
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
            roster             = {textContent: ' static roster · offline '},
            stream             = {textContent: ' sample · live feed pending '},
            {intervals, sends} = await loadPreload({
                clock,
                dom: {
                    selectors: {
                        '.fm-fleet-cockpit'                                           : cockpit,
                        '.fm-fleet-cockpit .fm-fleet-head.is-sample .fm-fleet-stale'  : roster,
                        '.fm-fleet-cockpit .fm-stream-head.is-sample .fm-stream-state': stream
                    },
                    selectorLists: {
                        '.fm-fleet-cockpit .fm-agent-card'                                     : cards,
                        '.fm-fleet-cockpit .fm-fusion-tour, .fm-fleet-cockpit .fm-tour-caption': []
                    }
                },
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
            rosterLabel         : 'static roster · offline',
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
            roster             = {textContent: 'static roster · offline'},
            stream             = {textContent: 'sample · live feed pending'},
            {intervals, sends} = await loadPreload({
                clock,
                dom: {
                    selectors: {
                        '.fm-fleet-cockpit'                                           : cockpit,
                        '.fm-fleet-cockpit .fm-fleet-head.is-sample .fm-fleet-stale'  : roster,
                        '.fm-fleet-cockpit .fm-stream-head.is-sample .fm-stream-state': stream
                    },
                    selectorLists: {
                        '.fm-fleet-cockpit .fm-agent-card'                                     : [card],
                        '.fm-fleet-cockpit .fm-fusion-tour, .fm-fleet-cockpit .fm-tour-caption': [{}]
                    }
                }
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
            rosterLabel         : 'static roster · offline',
            timedOut            : true,
            tourControlCount    : 1
        }]);
        expect(firstPaintReporter.cleared).toBe(true)
    })
});
