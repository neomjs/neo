import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary Verifies that Observable stops calling a listener once its scope instance is destroyed.
 *
 * `core.Base#destroy()` keeps `_id` and keeps configs readable, so the legacy `fire()` scope test
 * (`cb.scope && !cb.scope.id`) never triggers for a Neo instance: a destroyed scope kept getting
 * handler calls, and a delayed call still ran after its scope died while waiting.
 */
class ObservableSubject extends core.Base {
    static config = {
        className: 'Test.Unit.Core.ObservableDestroyedScope.Subject',
        mixins   : [core.Observable]
    }
}
const Subject = Neo.setupClass(ObservableSubject);

test.describe('Observable drops listeners whose scope got destroyed', () => {
    test('fire stops calling and drops a listener whose scope instance got destroyed', () => {
        const
            firer    = Neo.create(Subject),
            listener = Neo.create(Subject),
            calls    = [];

        firer.on('ping', () => calls.push(1), listener);
        firer.fire('ping');
        expect(calls).toHaveLength(1);

        listener.destroy();
        firer.fire('ping');
        expect(calls).toHaveLength(1);

        firer.destroy();
    });

    test('a delayed listener is not called when its scope got destroyed before the delay ends', async () => {
        const
            firer    = Neo.create(Subject),
            listener = Neo.create(Subject),
            calls    = [];

        firer.on('ping', {fn: () => calls.push(1), delay: 30, scope: listener});
        firer.fire('ping');
        expect(calls).toHaveLength(0);

        listener.destroy();

        await new Promise(resolve => setTimeout(resolve, 60));
        expect(calls).toHaveLength(0);

        firer.destroy();
    });

    test('a live scope and a scope-less listener keep working after another scope got destroyed', () => {
        const
            firer       = Neo.create(Subject),
            doomed      = Neo.create(Subject),
            alive       = Neo.create(Subject),
            doomedCalls = [],
            aliveCalls  = [],
            bareCalls   = [];

        firer.on('ping', () => doomedCalls.push(1), doomed);
        firer.on('ping', () => aliveCalls.push(1), alive);
        firer.on('ping', () => bareCalls.push(1));
        doomed.destroy();
        firer.fire('ping');

        expect(doomedCalls).toHaveLength(0);
        expect(aliveCalls).toHaveLength(1);
        expect(bareCalls).toHaveLength(1);

        firer.destroy();
    });
});
