import {test, expect}   from '@playwright/test';
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
      TX_ENTRY    = 'src/manager/Transaction.mjs',
      TOPOLOGY_RE = /^src\/manager\/(Transaction\.mjs|transaction\/)/,
      DOCK_RE     = /^src\/dashboard\/dock\/(Workspace\.mjs|model\/WorkspaceDocument\.mjs)$/;

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
        const innocent = ['src/core/Base.mjs', 'src/dashboard/dock/window/TearOut.mjs'];

        expect(crossings([...innocent, TX_ENTRY], TOPOLOGY_RE),
            'an upward import must be caught').toEqual([TX_ENTRY]);

        expect(crossings([...innocent, 'src/manager/transaction/Commit.mjs'], TOPOLOGY_RE),
            'the folder half of the rule must be caught too').toEqual(['src/manager/transaction/Commit.mjs']);

        expect(crossings([...innocent, DOCK_ENTRY], DOCK_RE),
            'a downward import must be caught').toEqual([DOCK_ENTRY]);

        expect(crossings([...innocent, 'src/dashboard/dock/model/WorkspaceDocument.mjs'], DOCK_RE),
            'the document is a dock concept the manager may not hold').toEqual(['src/dashboard/dock/model/WorkspaceDocument.mjs']);

        // The other half of the discrimination claim: a clean list yields nothing under either rule.
        expect(crossings(innocent, TOPOLOGY_RE), 'a clean list is clean under A').toEqual([]);
        expect(crossings(innocent, DOCK_RE), 'a clean list is clean under B').toEqual([]);
    });
});
