import {setup} from '../../../../../../setup.mjs';

const appName = 'FleetEventChipTest';

setup({
    neoConfig: {
        unitTestMode: true
    },
    appConfig: {
        name             : appName,
        isMounted        : () => true,
        vnodeInitialising: false
    }
});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../../../src/core/_export.mjs';

test.describe('Fleet cockpit EventChip — renders a kind via the shared registry (#14594)', () => {
    let EventChip;

    test.beforeAll(async () => {
        EventChip = (await import('../../../../../../../../apps/agentos/view/fleet/activity/EventChipComponent.mjs')).default
    });

    test('EventChip binds the kind token via its fm-kind-* class (zero inline styles) and renders the label as a span', async () => {
        const chip = Neo.create(EventChip, {appName, kind: 'work-stall'});
        await chip.initVnode();

        expect(chip.vdom.tag).toBe('span');
        expect(chip.vdom.cls).toContain('fm-event-chip');
        // the class carries the color binding (SCSS maps it onto --fm-chip); no inline style write
        expect(chip.vdom.cls).toContain('fm-kind-alert');
        expect(chip.vdom.style?.['--fm-chip']).toBeUndefined();
        expect(chip.vdom.text).toBe('stall');

        // a kind swap re-renders the same instance — old class out, new class in
        const before = chip.id;
        chip.kind = 'review';
        expect(chip.vdom.cls).toContain('fm-kind-review');
        expect(chip.vdom.cls).not.toContain('fm-kind-alert');
        expect(chip.vdom.text).toBe('review');
        expect(chip.id).toBe(before);

        chip.destroy()
    });

    test('EventChip renders an unknown kind neutral with the kind as its label, never broken', async () => {
        const chip = Neo.create(EventChip, {appName, kind: 'graduation-signal'});
        await chip.initVnode();

        expect(chip.vdom.cls).toContain('fm-kind-neutral');
        expect(chip.vdom.text).toBe('graduation-signal');

        chip.destroy()
    });

    test('EventChip honors a label override', async () => {
        const chip = Neo.create(EventChip, {appName, kind: 'pr', label: 'merged'});
        await chip.initVnode();

        expect(chip.vdom.cls).toContain('fm-kind-pr');
        expect(chip.vdom.text).toBe('merged');

        chip.destroy()
    });
});
