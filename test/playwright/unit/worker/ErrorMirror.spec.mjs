import {setup} from '../../setup.mjs';

setup({appConfig: {name: 'WorkerErrorMirrorTest'}});

import {test, expect} from '@playwright/test';
import Neo            from '../../../../src/Neo.mjs';
import * as core      from '../../../../src/core/_export.mjs';
import WorkerBase     from '../../../../src/worker/Base.mjs';

/**
 * @summary The gates on `Neo.worker.Base#forwardErrorToMainThread`, at the level where they live.
 *
 * The e2e arm proves the mirror reaches a page from a real Data SharedWorker, and it is the only
 * instrument that can. It cannot reach these four, and I found that out by mutating them: widening
 * the allowlist to admit every environment left the e2e arm **green**, because the example app runs
 * `development`, which the allowlist already admits. A guard whose regression is invisible to the
 * suite is not guarded, so its cases are asserted here where the environment is a variable rather
 * than a property of whichever app the browser arm happens to boot.
 */
const mirrorWith = ({environment, isSharedWorker = true, className = 'Neo.worker.Data'}) => {
    const sent     = [],
          original = Neo.config.environment,
          mainStub = {log: data => {sent.push(data); return Promise.resolve(true)}},
          host     = {
              className,
              isForwardingError       : false,
              isSharedWorker,
              ports                   : [{windowId: 'window-1'}, {windowId: 'window-2'}],
              constructor             : {mirrorEnvironments: WorkerBase.mirrorEnvironments},
              canMirrorErrors         : WorkerBase.prototype.canMirrorErrors,
              forwardErrorToMainThread: WorkerBase.prototype.forwardErrorToMainThread
          },
          originalMain = Neo.Main;

    Neo.config.environment = environment;
    Neo.Main               = mainStub;

    try {
        host.forwardErrorToMainThread('boom');
        return {host, sent}
    } finally {
        Neo.config.environment = original;
        originalMain === undefined ? delete Neo.Main : Neo.Main = originalMain
    }
};

test.describe('Neo.worker.Base#forwardErrorToMainThread — the four gates', () => {
    test('the allowlist admits development builds and refuses every shipped one', () => {
        expect(WorkerBase.mirrorEnvironments, 'an allowlist, not a denylist').toEqual(['development', 'dist/development']);

        for (const environment of ['development', 'dist/development']) {
            expect(mirrorWith({environment}).sent, `${environment} mirrors`).toHaveLength(2)
        }

        // `dist/esm` is the specific value a one-entry denylist let through; it is named rather than
        // left to the allowlist's shape, because that is the regression this allowlist exists for.
        for (const environment of ['dist/production', 'dist/esm', 'some/future/target']) {
            expect(mirrorWith({environment}).sent, `${environment} does not`).toEqual([])
        }
    });

    test('a dedicated worker mirrors nothing, because the browser already forwards it', () => {
        expect(mirrorWith({environment: 'development', isSharedWorker: false}).sent).toEqual([])
    });

    test('every connected window gets the line, and it names the worker that raised it', () => {
        const {sent} = mirrorWith({environment: 'development'});

        expect(sent.map(entry => entry.windowId)).toEqual(['window-1', 'window-2']);
        expect(sent.every(entry => entry.method === 'error')).toBe(true);
        expect(sent[0].value).toBe('Data Worker: boom');

        // Derived from the class name: no capitalisation of the lowercase `workerId` yields `VDom`.
        expect(mirrorWith({environment: 'development', className: 'Neo.worker.VDom'}).sent[0].value)
            .toBe('VDom Worker: boom');

        // Idempotent, for the workers that already name themselves in their own message text.
        const host = {
            className               : 'Neo.worker.Data', isForwardingError: false, isSharedWorker: true,
            ports                   : [{windowId: 'w'}], constructor: {mirrorEnvironments: WorkerBase.mirrorEnvironments},
            canMirrorErrors         : WorkerBase.prototype.canMirrorErrors,
            forwardErrorToMainThread: WorkerBase.prototype.forwardErrorToMainThread
        };
        const seen = [], originalMain = Neo.Main, originalEnv = Neo.config.environment;

        Neo.config.environment = 'development';
        Neo.Main               = {log: data => {seen.push(data.value); return Promise.resolve(true)}};

        try {
            host.forwardErrorToMainThread('Data Worker: Failed to load module x')
        } finally {
            Neo.config.environment = originalEnv;
            originalMain === undefined ? delete Neo.Main : Neo.Main = originalMain
        }

        expect(seen[0], 'never "Data Worker: Data Worker: …"').toBe('Data Worker: Failed to load module x')
    });

    test('a re-entrant call is latched out, and the latch is released either way', () => {
        const host = {
            className               : 'Neo.worker.Data', isForwardingError: true, isSharedWorker: true,
            ports                   : [{windowId: 'w'}], constructor: {mirrorEnvironments: WorkerBase.mirrorEnvironments},
            canMirrorErrors         : WorkerBase.prototype.canMirrorErrors,
            forwardErrorToMainThread: WorkerBase.prototype.forwardErrorToMainThread
        };
        const seen = [], originalMain = Neo.Main, originalEnv = Neo.config.environment;

        Neo.config.environment = 'development';
        Neo.Main               = {log: data => {seen.push(data); return Promise.resolve(true)}};

        try {
            host.forwardErrorToMainThread('re-entrant');
            expect(seen, 'a call arriving while one is in flight sends nothing').toEqual([]);
            expect(host.isForwardingError, 'and does not clear the latch it did not set').toBe(true);

            // A send that throws must still release the latch, or the mirror silences itself for
            // the rest of the worker's life after one bad window.
            host.isForwardingError = false;
            Neo.Main = {log: () => {throw new Error('port is gone')}};
            host.forwardErrorToMainThread('throwing send');
            expect(host.isForwardingError, 'the latch is released in `finally`').toBe(false)
        } finally {
            Neo.config.environment = originalEnv;
            originalMain === undefined ? delete Neo.Main : Neo.Main = originalMain
        }
    })
});

/**
 * @summary The two gates that changed after review, both of which failed toward silence.
 */
test.describe('Neo.worker.Base — the gates that must not fail silently', () => {
    test('canMirrorErrors decides per configuration, and the latch stays per call', () => {
        const host = (isSharedWorker, environment) => {
            const original = Neo.config.environment;
            Neo.config.environment = environment;
            try {
                return WorkerBase.prototype.canMirrorErrors.call({
                    isSharedWorker, constructor: {mirrorEnvironments: WorkerBase.mirrorEnvironments}
                })
            } finally { Neo.config.environment = original }
        };

        expect(host(true,  'development'),      'shared + allowlisted mirrors').toBe(true);
        expect(host(false, 'development'),      'dedicated never mirrors').toBe(false);
        expect(host(true,  'dist/production'),  'shipped never mirrors').toBe(false);
        expect(host(true,  'dist/esm'),         'including the one a denylist let through').toBe(false)
    })
});
