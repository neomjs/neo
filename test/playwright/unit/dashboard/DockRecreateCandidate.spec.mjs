import {setup} from '../../setup.mjs';

setup({
    appConfig: {
        name: 'DashboardDockRecreateCandidateTest'
    }
});

import {test, expect} from '@playwright/test';
// `Neo` and the core exports must be evaluated FIRST: `Neo.gatekeep` is called at module scope by
// everything below, so an alphabetical import order fails at load with "gatekeep is not a function".
import Neo           from '../../../../src/Neo.mjs';
import * as core     from '../../../../src/core/_export.mjs';
import Component     from '../../../../src/component/Base.mjs';
import DockWorkspace from '../../../../src/dashboard/dock/Workspace.mjs';

/**
 * Phase 1 of the two-phase recreate transaction: obtain and validate a fresh candidate **without
 * touching the live pane**.
 *
 * The docking record guarantees a resolved pane is moved or re-parented, never destroyed. The
 * user-triggered recreate exception is conditioned on this phase: **without a validated candidate
 * the exception does not apply**, and the guarantee stands unmodified.
 *
 * @see ADR 0029 §2.6 — ticket-ref-ok: the record is what these arms enforce; naming it is the
 *      difference between a test and a rule with a source. So every refusal below is
 * load-bearing — each one is a case where the recovery click must leave the workspace untouched
 * rather than destroy the only copy of a pane.
 *
 * The three refusals are not hypothetical shapes. They are what a cache-backed resolver actually
 * produces, and the `live-instance` one is why a factory seam alone is insufficient: a resolver
 * reading its own cache answers with the currently mounted instance, which *looks* like a
 * successful candidate.
 */
const buildWorkspace = (config = {}) => Neo.create(DockWorkspace, {
    appName  : 'DashboardDockRecreateCandidateTest',
    dockModel: {
        schema: 'neo.dock.zone.v1',
        root  : 'root',
        items : {editor: {componentRef: 'editor', title: 'Editor'}},
        nodes : {root: {type: 'tabs', items: ['editor'], activeItemId: 'editor'}}
    },
    ...config
});

test.describe('dock recreate — Phase 1 validates a candidate before anything is destroyed', () => {
    let workspace, livePane;

    test.beforeEach(() => {
        workspace = buildWorkspace();
        livePane  = Neo.create(Component, {appName: 'DashboardDockRecreateCandidateTest'})
    });

    test.afterEach(() => {
        workspace?.destroy?.();
        livePane?.destroy?.();
        workspace = livePane = null
    });

    test('the default hook declines, so recreate is opt-in rather than assumed', () => {
        // A consumer that has not implemented the factory must not silently get a destructive
        // capability. `null` is a legitimate answer — "this surface does not support recreate".
        expect(workspace.resolveFreshPane('editor', null)).toBeNull();

        const result = workspace.prepareRecreateCandidate('editor', livePane);

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('declined');
        expect(result.candidate).toBeNull()
    });

    test('a factory that throws refuses with the error carried, never swallowed', () => {
        const boom = new Error('resolver exploded');

        workspace.resolveFreshPane = () => { throw boom };

        const result = workspace.prepareRecreateCandidate('editor', livePane);

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('threw');
        expect(result.error, 'the original error must survive, not a rewritten one').toBe(boom)
    });

    test('a factory returning THE LIVE INSTANCE is refused — the shape that causes silent pane loss', () => {
        // The whole reason this phase exists. A cache-backed resolver answers with the instance that
        // is already mounted; committing that "candidate" would destroy the only copy.
        workspace.resolveFreshPane = () => livePane;

        const result = workspace.prepareRecreateCandidate('editor', livePane);

        expect(result.ok).toBe(false);
        expect(result.reason).toBe('live-instance');
        expect(result.candidate).toBeNull()
    });

    test('a distinct candidate is accepted — identity, not equality', () => {
        // A config object describing the same pane IS a valid candidate; only the mounted instance
        // itself is refused. An equality-based check would reject this and make recreate impossible
        // for every config-returning consumer.
        const candidate = {ntype: 'component', text: 'fresh'};

        workspace.resolveFreshPane = () => candidate;

        const result = workspace.prepareRecreateCandidate('editor', livePane);

        expect(result.ok).toBe(true);
        expect(result.candidate).toBe(candidate);
        expect(result.reason).toBeNull()
    });

    test('the live pane is untouched by every refusal — rollback by construction', () => {
        // Not "rollback works" — there is nothing to roll back, which is the design claim. If any
        // refusal path ever destroys or re-parents the live pane, this arm is what notices.
        const factories = [
            () => { throw new Error('boom') },
            () => null,
            () => livePane
        ];

        for (const factory of factories) {
            workspace.resolveFreshPane = factory;
            workspace.prepareRecreateCandidate('editor', livePane);

            expect(livePane.isDestroyed, `factory ${factory} destroyed the live pane`).toBeFalsy()
        }
    });

    test('the item record comes from the committed document, and an unknown id still refuses safely', () => {
        let seenItem = 'unset';

        workspace.resolveFreshPane = (itemId, item) => { seenItem = item; return null };

        workspace.prepareRecreateCandidate('editor', livePane);
        expect(seenItem, 'a known id resolves its catalog record').toMatchObject({componentRef: 'editor'});

        workspace.prepareRecreateCandidate('no-such-item', livePane);
        expect(seenItem, 'an unknown id resolves null rather than throwing').toBeNull()
    })
});
