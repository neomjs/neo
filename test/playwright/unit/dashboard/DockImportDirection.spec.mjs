import {test, expect}   from '@playwright/test';
import {execFileSync}   from 'node:child_process';
import path             from 'node:path';
import {fileURLToPath}  from 'node:url';
import {measureClosure} from '../../../../buildScripts/util/static-closure.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * @summary The dock façade's import-direction rule, measured in both directions.
 *
 * The rule is two-way and only one half is intuitive. "The topology manager must not import the
 * dock" protects the manager's generality. The other half protects something with a price tag:
 * `dashboard/dock/Workspace.mjs` lands in every single-window application, so one upward import
 * would pull the whole topology manager into a download that never opens a second window.
 *
 * `manager.Transaction` IS reachable from the dock — through a DYNAMIC import, which is the lazy
 * boundary the Group work landed deliberately. That is exactly why this arm measures the STATIC
 * closure and not the reference graph: a grep for the module name reports the lazy edge as a
 * violation, and a rule that fires on its own intended design gets suppressed within a week.
 */
const staticFiles = entry => measureClosure([entry], ROOT).files,

      /**
       * @param {String[]} files A static closure's repo-relative file list.
       * @param {RegExp} forbidden The boundary this closure may not cross.
       * @returns {String[]} The crossings, so a failure names them rather than asserting `false`.
       */
      crossings   = (files, forbidden) => files.filter(file => forbidden.test(file)),

      DOCK_ENTRY  = 'src/dashboard/dock/Workspace.mjs',
      PERSPECTIVE_ENTRY = 'test/playwright/component/apps/dock-authoring/PerspectiveWorkspace.mjs',
      TX_ENTRY    = 'src/manager/Transaction.mjs',
      TOPOLOGY_RE = /^(src\/manager\/(Transaction\.mjs|transaction\/)|src\/dashboard\/dock\/persistence\/TopologyLibrary\.mjs)/,

      /**
       * The manager may not reach the dock DOMAIN, not merely its two most obvious modules.
       *
       * Naming `Workspace` and `WorkspaceDocument` was the wrong shape: it enumerated the modules I
       * happened to think of, so every other dock module — the tear-out machine, the projection
       * adapter, the model reducers — was exempt by omission. Transitive walking does not rescue
       * that, because the module most likely to be imported for its purity, `window/TearOut.mjs`,
       * imports nothing at all; its entire static closure is itself, so it can only ever be caught
       * by naming its DOMAIN.
       *
       * A rule over the directory survives a module nobody here anticipated. A list does not, and
       * goes stale silently.
       */
      DOCK_RE     = /^src\/dashboard\/dock\//;

test.describe('Neo.dashboard.dock — the façade import-direction rule', () => {
    test('the walk is not vacuous: both closures are real and transitive', () => {
        const dock = staticFiles(DOCK_ENTRY),
              tx   = staticFiles(TX_ENTRY);

        // Without this, both direction arms below pass for free on an empty list — the exact shape
        // of a guard that reports nothing because it measured nothing.
        expect(dock.length, 'the dock closure must be substantial').toBeGreaterThan(50);
        expect(tx.length, 'the transaction closure must be substantial').toBeGreaterThan(5);

        // Transitivity, not just the entry's own direct imports: `core/Base.mjs` is several hops
        // down from both entries and is reachable only if the walk actually recurses.
        expect(dock, 'the dock walk reaches transitively').toContain('src/core/Base.mjs');
        expect(dock, 'the declaration normalizer is part of the standalone host').toContain('src/dashboard/dock/model/Authoring.mjs');
        expect(tx, 'the transaction walk reaches transitively').toContain('src/core/Base.mjs');
    });

    test('DIRECTION A — the dock does not statically import the topology manager', () => {
        const found = crossings(staticFiles(DOCK_ENTRY), TOPOLOGY_RE);

        expect(found, `a single-window app would download these: ${found.join(', ')}`).toEqual([]);
    });

    test('DIRECTION B — the topology manager does not import the dock', () => {
        const found = crossings(staticFiles(TX_ENTRY), DOCK_RE);

        expect(found, `the manager would know a dock concept: ${found.join(', ')}`).toEqual([]);
    });

    test('a declared perspective consumer switches through bound chrome without loading the optional topology tier', () => {
        const files = staticFiles(PERSPECTIVE_ENTRY);
        expect(files).toContain(PERSPECTIVE_ENTRY);
        expect(files).toContain(DOCK_ENTRY);
        expect(files).toContain('src/dashboard/dock/interaction/PerspectiveSelection.mjs');
        expect(files).toContain('src/dashboard/dock/projection/PerspectiveState.mjs');
        expect(crossings(files, TOPOLOGY_RE)).toEqual([]);

        // A fresh process prevents another spec's Group imports from deciding this consumer's result.
        const script = `
            import {setup} from './test/playwright/setup.mjs';
            import Neo from './src/Neo.mjs';
            import './src/core/_export.mjs';
            import './src/manager/Instance.mjs';
            import Consumer from './${PERSPECTIVE_ENTRY}';
            setup({appConfig: {name: 'DockPerspectiveClosureTest'}});
            const optional = () => ({
                transaction: !!Neo.manager?.Transaction,
                history: !!Neo.manager?.transaction?.History,
                library: !!Neo.dashboard?.dock?.persistence?.TopologyLibrary
            });
            const workspace = Neo.create(Consumer, {windowId: 1}), toolbar = workspace.items[0];
            const read = () => ({
                state: workspace.getState('dock.perspective'),
                pressed: toolbar.items.map(button => button.pressed),
                tab: workspace.dockModel.nodes.tabs.activeItemId,
                optional: optional()
            });
            const before = read();
            await toolbar.getReference('review').handler();
            const result = await workspace.perspectiveSelection.pending;
            await workspace.refreshPromise;
            const after = read();
            workspace.destroy();
            process.stdout.write(JSON.stringify({before, after, errors: result.errors}));
        `;
        const receipt = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], {
            cwd: ROOT, encoding: 'utf8', timeout: 15000
        }));
        const optional = {transaction: false, history: false, library: false};
        expect(receipt.before).toEqual({
            state  : {active: 'operator', modified: false, pending: null},
            pressed: [true, false], tab: 'editor', optional
        });
        expect(receipt.after).toEqual({
            state  : {active: 'review', modified: false, pending: null},
            pressed: [false, true], tab: 'preview', optional
        });
        expect(receipt.errors).toEqual([])
    });

    test('the manager stays reachable LAZILY, so direction A is a boundary and not an absence', () => {
        const {dynamicTargets} = measureClosure([DOCK_ENTRY], ROOT);

        // The positive half of direction A. If this ever emptied, the arm above would still pass
        // while the feature it protects had quietly gone — a green that means the opposite.
        expect(dynamicTargets, 'the dock reaches the manager on demand').toContain(TX_ENTRY);
    });

    test('control: each direction predicate reds on a deliberate crossing', () => {
        // Deliberately built from a FIXED list rather than by spreading the real closure. The first
        // version of this arm appended the offender to the live measurement, which made the control
        // fail for the wrong reason the moment a real crossing existed — a control coupled to the
        // state it exists to judge independently. An innocent neighbour rides along in each list so
        // "reds on everything" cannot pass as "reds on the crossing".
        //
        // The neighbours are deliberately NOT dock modules. An earlier version used
        // `dock/window/TearOut.mjs` here, which asserted that a dock module was innocent under the
        // manager rule — encoding the very exemption the rule exists to forbid, inside the control
        // meant to police it.
        const innocent = ['src/core/Base.mjs', 'src/util/Array.mjs'];

        expect(crossings([...innocent, TX_ENTRY], TOPOLOGY_RE),
            'an upward import must be caught').toEqual([TX_ENTRY]);

        const library = 'src/dashboard/dock/persistence/TopologyLibrary.mjs';
        expect(crossings([...innocent, library], TOPOLOGY_RE),
            'optional persistence must stay outside the standalone host').toEqual([library]);

        expect(crossings([...innocent, 'src/manager/transaction/Commit.mjs'], TOPOLOGY_RE),
            'the folder half of the rule must be caught too').toEqual(['src/manager/transaction/Commit.mjs']);

        expect(crossings([...innocent, DOCK_ENTRY], DOCK_RE),
            'a downward import must be caught').toEqual([DOCK_ENTRY]);

        expect(crossings([...innocent, 'src/dashboard/dock/model/WorkspaceDocument.mjs'], DOCK_RE),
            'the document is a dock concept the manager may not hold').toEqual(['src/dashboard/dock/model/WorkspaceDocument.mjs']);

        // The IMPORT-FREE crossing control, and the reason the rule is a directory and not a list.
        // `window/TearOut.mjs` imports nothing, so its whole static closure is itself: a transitive
        // walk can never surface it through some other module, and a rule naming only the obvious
        // dock modules would let the manager hold the tear-out machine outright.
        expect(crossings([...innocent, 'src/dashboard/dock/window/TearOut.mjs'], DOCK_RE),
            'an import-free dock module is still a dock concept').toEqual(['src/dashboard/dock/window/TearOut.mjs']);

        // The other half of the discrimination claim: a clean list yields nothing under either rule.
        expect(crossings(innocent, TOPOLOGY_RE), 'a clean list is clean under A').toEqual([]);
        expect(crossings(innocent, DOCK_RE), 'a clean list is clean under B').toEqual([]);
    });
});
