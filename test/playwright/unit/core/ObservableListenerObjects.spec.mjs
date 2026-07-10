import {setup} from '../../setup.mjs';

setup();

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';

/**
 * @summary Verifies that Observable's object-form on()/un() parse a COPY of the caller's object.
 *
 * Historically both `addListener` and `removeListener` deleted the reserved keys (`scope`, `once`,
 * `delay`, `order`) off the object they received. That silently broke the natural shared-object
 * idiom `newSubject.on(listeners); oldSubject.un(listeners)` — the first call consumed `scope`, so
 * the second matched nothing and the old subject kept firing its stale handler (the grid
 * store-replacement leak). Observable itself carried an internal workaround
 * (`updateConfiguredListeners` passes fresh per-event slices) — these tests pin the API boundary
 * so external callers never need one.
 */
class ObservableSubject extends core.Base {
    static config = {
        className: 'Test.Unit.Core.ObservableSubject',
        mixins   : [core.Observable]
    }
}
const Subject = Neo.setupClass(ObservableSubject);

test.describe('Observable object-form listeners stay caller-owned', () => {

    test('on() does not mutate the passed listeners object', () => {
        const
            subject = Neo.create(Subject, {}),
            scope   = {id: 'probe-scope'},
            handler = () => {},
            input   = {change: handler, load: handler, delay: 5, once: true, order: 'before', scope};

        subject.on(input);

        expect(input).toEqual({change: handler, load: handler, delay: 5, once: true, order: 'before', scope});

        subject.destroy();
    });

    test('un() does not mutate the passed listeners object', () => {
        const
            subject = Neo.create(Subject, {}),
            scope   = {id: 'probe-scope'},
            handler = () => {},
            input   = {change: handler, scope};

        subject.on({change: handler, scope});
        subject.un(input);

        expect(input).toEqual({change: handler, scope});

        subject.destroy();
    });

    test('the shared-object swap idiom works: new.on(listeners) then old.un(listeners) actually unbinds old', () => {
        const
            oldSubject = Neo.create(Subject, {}),
            newSubject = Neo.create(Subject, {}),
            calls      = [],
            scope      = {id: 'consumer'},
            listeners  = {change: function(data) { calls.push(data.from) }, scope};

        // the consumer bound the OLD subject earlier
        oldSubject.on({...listeners});

        // the swap — exactly the afterSetStore shape: one shared object, on() before un()
        newSubject.on(listeners);
        oldSubject.un(listeners);

        oldSubject.fire('change', {from: 'old'});
        newSubject.fire('change', {from: 'new'});

        // pre-fix: on() consumed `scope`, un() matched nothing, and 'old' leaked through
        expect(calls).toEqual(['new']);

        oldSubject.destroy();
        newSubject.destroy();
    });

    test('a same-subject on/un round-trip over one shared object unbinds', () => {
        const
            subject   = Neo.create(Subject, {}),
            calls     = [],
            scope     = {id: 'consumer'},
            listeners = {change: () => calls.push(1), scope};

        subject.on(listeners);
        subject.un(listeners);
        subject.fire('change', {});

        expect(calls).toEqual([]);

        subject.destroy();
    });
});
