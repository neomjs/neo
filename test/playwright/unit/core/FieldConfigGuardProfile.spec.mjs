import {setup} from '../../setup.mjs';

setup({
    appConfig: {name: 'FieldConfigGuardProfileTest', vnodeInitialising: false},
    neoConfig: {
        allowVdomUpdatesInTests: true,
        unitTestMode           : true,
        useDomApiRenderer      : true,
        useVdomWorker          : false
    }
});

import {test, expect}     from '@playwright/test';
import Neo                from '../../../../src/Neo.mjs';
import * as core          from '../../../../src/core/_export.mjs';
import Button             from '../../../../src/button/Base.mjs';
import Container          from '../../../../src/container/Base.mjs';
import GridContainer      from '../../../../src/grid/Container.mjs';
import Store              from '../../../../src/data/Store.mjs';
import Toolbar            from '../../../../src/toolbar/Base.mjs';
import VdomHelper         from '../../../../src/vdom/Helper.mjs';
import DomApiVnodeCreator from '../../../../src/vdom/util/DomApiVnodeCreator.mjs';
// A container's `items` resolve through the instance manager
import '../../../../src/manager/Instance.mjs';

const realApplyDeltas = Neo.applyDeltas; // patched at import; restored in afterAll below

Neo.applyDeltas = async () => {};

test.afterAll(() => {
    Neo.applyDeltas = realApplyDeltas
});

/**
 * `Neo.create` runs `assertFieldsShadowNoConfig()` on every instance, right after `new`. The guard
 * refuses an edge case but sits on the hottest path the engine has: a nested component tree and a
 * grid construct every node through it. This profile pins its cost against the construction it
 * guards — interleaved samples with the guard live and stubbed, then the guard alone on the exact
 * after-new shapes it inspects. Its loop runs over the instance's own class fields; a config is a
 * prototype member and one hash probe, so the cost follows fields, never the size of `static config`.
 */
const
    appName = 'FieldConfigGuardProfileTest',
    guard   = core.Base.prototype.assertFieldsShadowNoConfig,
    stub    = function() {},
    fields  = ['login', 'impact', 'total', 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'k'];

const median = samples => {
    const sorted = [...samples].sort((a, b) => a - b);

    return sorted[Math.floor(sorted.length / 2)]
};

let trees = 0, grids = 0;

/**
 * A nested tree of the shape an app builds: a container of toolbars, each holding buttons.
 * @returns {Function} Teardown
 */
const constructTree = () => {
    const suffix = trees++,
          host   = Neo.create(Container, {
              appName,
              id   : `guard-profile-host-${suffix}`,
              items: Array.from({length: 60}, (row, r) => ({
                  module: Toolbar,
                  id    : `guard-profile-row-${suffix}-${r}`,
                  items : Array.from({length: 5}, (leaf, l) => ({
                      module: Button,
                      id    : `guard-profile-leaf-${suffix}-${r}-${l}`,
                      text  : 'x'
                  }))
              }))
          });

    return () => host.destroy()
};

/**
 * A grid over 200 records and 12 columns: header toolbar, buttons, columns, body, scrollbars,
 * selection model — the config-heaviest family the engine constructs.
 * @returns {Function} Teardown
 */
const constructGrid = () => {
    const suffix = grids++,
          store  = Neo.create(Store, {
              data : Array.from({length: 200}, (item, i) => Object.fromEntries([['id', i + 1], ...fields.map(f => [f, `${f}${i}`])])),
              model: {fields: [{name: 'id', type: 'Integer'}, ...fields.map(name => ({name, type: 'String'}))]}
          }),
          grid   = Neo.create(GridContainer, {
              appName,
              id            : `guard-profile-grid-${suffix}`,
              height        : 400,
              width         : 1400,
              store,
              rowHeight     : 40,
              columnDefaults: {width: 110},
              columns       : fields.map(dataField => ({dataField, text: dataField}))
          });

    return () => {
        grid.destroy();
        store.destroy()
    }
};

/**
 * Interleaved samples of one construction with the guard live and stubbed; the arm that runs first
 * alternates per pair, so neither arm always pays for the other's garbage.
 * @param {Function} construct Returns its own teardown
 * @returns {{liveMs: Number, stubbedMs: Number, overhead: Number, instances: Number}}
 */
const profile = construct => {
    const live = [], stubbed = [];

    let instances = 0;

    core.Base.prototype.assertFieldsShadowNoConfig = function() {
        instances++;
        return guard.call(this)
    };
    construct()();
    construct()();

    for (let i = 0; i < 12; i++) {
        for (const arm of i % 2 ? ['stubbed', 'live'] : ['live', 'stubbed']) {
            core.Base.prototype.assertFieldsShadowNoConfig = arm === 'live' ? guard : stub;

            const start = performance.now(), teardown = construct(), ms = performance.now() - start;

            teardown();
            (arm === 'live' ? live : stubbed).push(ms)
        }
    }

    core.Base.prototype.assertFieldsShadowNoConfig = guard;

    const liveMs = median(live), stubbedMs = median(stubbed);

    return {liveMs, stubbedMs, overhead: liveMs / stubbedMs - 1, instances: instances / 2}
};

/**
 * The guard alone, on an after-new instance, median over batches.
 * @param {Object} fresh
 * @returns {Number} Nanoseconds per call
 */
const guardAlone = fresh => {
    const calls = 200000, runs = [];

    for (let batch = 0; batch < 7; batch++) {
        const start = performance.now();

        for (let i = 0; i < calls; i++) guard.call(fresh);

        runs.push((performance.now() - start) * 1e6 / calls)
    }

    return median(runs)
};

const report = async (name, data) => {
    console.log(`[FieldConfigGuardProfile] ${name} ${JSON.stringify(data)}`);
    await test.info().attach(name, {body: JSON.stringify(data, null, 2), contentType: 'application/json'})
};

const pct = value => `${(value * 100).toFixed(2)} %`;

/**
 * A class with `configs` entries in static config (every other one reactive) and `fieldCount`
 * own data properties after `new` — the shape the guard walks, without a real class file.
 * @param {String} className
 * @param {Number} configs
 * @param {Number} fieldCount
 * @returns {Function}
 */
const shape = (className, configs, fieldCount) => Neo.setupClass(class extends core.Base {
    static config = {
        className,
        ...Object.fromEntries(Array.from({length: configs}, (c, i) => [`cfg${i}${i % 2 ? '_' : ''}`, i]))
    }

    constructor() {
        super();
        for (let i = 0; i < fieldCount; i++) this[`field${i}`] = i
    }
});

test.describe.serial('FieldConfigGuardProfile', () => {
    const usPerInstance = {};

    test.afterEach(() => {
        core.Base.prototype.assertFieldsShadowNoConfig = guard
    });

    test('a nested toolbar tree constructs at the same cost with the guard live and stubbed', async () => {
        expect(typeof guard).toBe('function');

        const tree = profile(constructTree);

        usPerInstance.tree = tree.stubbedMs * 1000 / tree.instances;

        await report('tree', {...tree, overhead: pct(tree.overhead), usPerInstance: usPerInstance.tree.toFixed(1)});

        // Measured between −0.06 % and 1.4 % on 361 to 1201 instances: sampling noise either way.
        // The ceiling is where a regression would show in an app, not where the guard is today.
        expect(tree.overhead, 'the guard must stay invisible against tree construction').toBeLessThan(0.1)
    });

    test('a grid — instances carrying up to a hundred configs — constructs at the same cost with the guard live and stubbed', async () => {
        const grid = profile(constructGrid);

        usPerInstance.grid = grid.stubbedMs * 1000 / grid.instances;

        await report('grid', {...grid, overhead: pct(grid.overhead), usPerInstance: usPerInstance.grid.toFixed(1)});

        // 44 instances per grid; measured at 1.0 % creation-only and 0.07 % through initVnode with the
        // arm order alternating — the arithmetic bound of 44 calls is 0.1 %.
        expect(grid.overhead, 'the guard must stay invisible against grid construction').toBeLessThan(0.1)
    });

    test('the guard alone follows own fields, never the size of static config', async () => {
        const button   = new Button(),        // exactly what Neo.create hands the guard: class fields, no construct()
              grid     = new GridContainer(),
              buttonNs = guardAlone(button),
              gridNs   = guardAlone(grid),
              shapes   = {
                  manyConfigsFewFields : shape('Test.Profile.ManyConfigsFewFields',  200, 4),
                  manyConfigsManyFields: shape('Test.Profile.ManyConfigsManyFields', 200, 30),
                  fewConfigsManyFields : shape('Test.Profile.FewConfigsManyFields',    5, 30)
              },
              synthetic = Object.fromEntries(Object.entries(shapes).map(([name, cls]) => {
                  const fresh = new cls();

                  return [name, {own: Object.getOwnPropertyNames(fresh).length, configs: Object.keys(cls.config).length, ns: Math.round(guardAlone(fresh))}]
              }));

        await report('guard-alone', {
            button   : {own: Object.getOwnPropertyNames(button).length, configs: Object.keys(Button.config).length,        ns: Math.round(buttonNs), shareOfConstruction: pct(buttonNs / (usPerInstance.tree * 1000))},
            grid     : {own: Object.getOwnPropertyNames(grid).length,   configs: Object.keys(GridContainer.config).length, ns: Math.round(gridNs),   shareOfConstruction: pct(gridNs   / (usPerInstance.grid * 1000))},
            synthetic
        });

        // Measured: a button (5 own, ~145 ns) and a grid container (9 own, ~250 ns) each cost well under a
        // tenth of a percent of the construction around them; 200 configs over 4 fields cost ~130 ns while
        // 5 configs over 30 fields cost ~840 ns — about 27 ns per own field, nothing per config.
        expect(buttonNs / (usPerInstance.tree * 1000), 'the guard as a share of one tree instance').toBeLessThan(0.01);
        expect(gridNs   / (usPerInstance.grid * 1000), 'the guard as a share of one grid instance').toBeLessThan(0.01);
        expect(synthetic.manyConfigsFewFields.ns,  '200 configs over 4 fields').toBeLessThan(1000);
        expect(synthetic.manyConfigsManyFields.ns, '200 configs over 30 fields').toBeLessThan(5000);
        expect(synthetic.manyConfigsFewFields.ns,  'configs do not price the guard; fields do')
            .toBeLessThan(synthetic.fewConfigsManyFields.ns)
    });
});
