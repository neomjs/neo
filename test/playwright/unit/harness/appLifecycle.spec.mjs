import {expect, test}       from '@playwright/test';
import {EventEmitter}       from 'node:events';
import {createAppLifecycle} from '../../../../harness/appLifecycle.mjs';

/**
 * @summary Creates the Electron App event surface consumed by the pure lifecycle owner.
 * @returns {EventEmitter}
 */
function createFakeApp() {
    const app = new EventEmitter();

    app.exitCalls = [];
    app.quitCalls = 0;
    app.exit      = code => app.exitCalls.push(code);
    app.quit      = () => { app.quitCalls++ };

    return app
}

/**
 * @summary Creates a BrowserWindow-shaped event surface with observable identity and visibility.
 * @param {Object} options
 * @returns {EventEmitter}
 */
function createFakeWindow({id = 1, webContentsId = 11} = {}) {
    const win = new EventEmitter();

    Object.assign(win, {
        destroyed   : false,
        focusCalls  : 0,
        hideCalls   : 0,
        id,
        minimized   : false,
        restoreCalls: 0,
        showCalls   : 0,
        visible     : true,
        webContents : Object.assign(new EventEmitter(), {id: webContentsId})
    });

    win.focus       = () => { win.focusCalls++ };
    win.hide        = () => { win.hideCalls++; win.visible = false };
    win.isDestroyed = () => win.destroyed;
    win.isMinimized = () => win.minimized;
    win.isVisible   = () => win.visible;
    win.restore     = () => { win.restoreCalls++; win.minimized = false };
    win.show        = () => { win.showCalls++; win.visible = true };
    win.requestClose = () => {
        const event = {
            defaultPrevented: false,
            preventDefault() { this.defaultPrevented = true }
        };

        win.emit('close', event);
        return event
    };

    return win
}

/**
 * @summary Creates the injected tray controller and retains its production callbacks for tests.
 * @returns {Object}
 */
function createFakeTrayFactory() {
    const receipt = {created: 0, destroyed: 0, states: []};

    receipt.factory = callbacks => {
        receipt.callbacks = callbacks;
        receipt.created++;

        return {
            destroy() { receipt.destroyed++ },
            invoke(action) {
                if (action === 'open-cockpit') {
                    callbacks.onOpen();
                    return true
                }

                if (action === 'quit') {
                    callbacks.onQuit();
                    return true
                }

                return false
            },
            setState(state) { receipt.states.push(state) }
        }
    };

    return receipt
}

/**
 * @summary Creates an Electron cancellable event for close/quit assertions.
 * @returns {Object}
 */
function createCancellableEvent() {
    return {
        defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true }
    }
}

test.describe('harness app lifecycle', () => {
    test('retains only the cockpit and restores the exact BrowserWindow and renderer identity', () => {
        const
            app       = createFakeApp(),
            cockpit   = createFakeWindow({id: 7, webContentsId: 19}),
            popup     = createFakeWindow({id: 8, webContentsId: 20}),
            tray      = createFakeTrayFactory(),
            lifecycle = createAppLifecycle({app, teardownBrain: async () => null});

        lifecycle.attachCockpitWindow(cockpit);
        lifecycle.installTray(tray.factory);

        const close = cockpit.requestClose();

        expect(close.defaultPrevented).toBe(true);
        expect(cockpit.hideCalls).toBe(1);
        expect(cockpit.isVisible()).toBe(false);

        expect(popup.listenerCount('close')).toBe(0);
        expect(popup.requestClose().defaultPrevented).toBe(false);

        expect(lifecycle.invokeTrayAction('open-cockpit')).toBe(true);
        expect(cockpit.id).toBe(7);
        expect(cockpit.webContents.id).toBe(19);
        expect(cockpit.showCalls).toBe(1);
        expect(cockpit.focusCalls).toBe(1);
        expect(cockpit.isVisible()).toBe(true)
    });

    test('survives window-all-closed with zero visible product windows', () => {
        const
            app       = createFakeApp(),
            cockpit   = createFakeWindow(),
            tray      = createFakeTrayFactory(),
            lifecycle = createAppLifecycle({app, teardownBrain: async () => null});

        lifecycle.attachCockpitWindow(cockpit);
        lifecycle.installTray(tray.factory);
        cockpit.requestClose();
        app.emit('window-all-closed');

        expect(cockpit.isVisible()).toBe(false);
        expect(app.quitCalls).toBe(0)
    });

    test('keeps close-to-quit reachable when tray construction fails', () => {
        const
            app       = createFakeApp(),
            cockpit   = createFakeWindow(),
            lifecycle = createAppLifecycle({app, teardownBrain: async () => null});

        lifecycle.attachCockpitWindow(cockpit);

        expect(() => lifecycle.installTray(() => { throw new Error('no status host') })).toThrow('no status host');
        expect(cockpit.requestClose().defaultPrevented).toBe(false);

        app.emit('window-all-closed');
        expect(app.quitCalls).toBe(1)
    });

    test('coalesces repeated explicit quit intents and re-entrant will-quit onto one teardown', async () => {
        let releaseTeardown;

        const
            app       = createFakeApp(),
            cockpit   = createFakeWindow(),
            tray      = createFakeTrayFactory(),
            teardown  = new Promise(resolve => { releaseTeardown = resolve }),
            calls     = {teardown: 0},
            lifecycle = createAppLifecycle({
                app,
                teardownBrain: () => {
                    calls.teardown++;
                    return teardown
                }
            });

        lifecycle.attachCockpitWindow(cockpit);
        lifecycle.installTray(tray.factory);

        expect(lifecycle.invokeTrayAction('quit')).toBe(true);
        expect(lifecycle.requestQuit()).toBe(false);
        expect(cockpit.requestClose().defaultPrevented).toBe(false);

        const firstWillQuit = createCancellableEvent(),
            secondWillQuit  = createCancellableEvent();

        app.emit('will-quit', firstWillQuit);
        app.emit('will-quit', secondWillQuit);
        await Promise.resolve();

        expect(firstWillQuit.defaultPrevented).toBe(true);
        expect(secondWillQuit.defaultPrevented).toBe(true);
        expect(calls.teardown).toBe(1);
        expect(app.quitCalls).toBe(1);

        releaseTeardown({fleet: {exited: true, groupEmpty: true}});
        await teardown;
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(app.quitCalls).toBe(2);
        expect(calls.teardown).toBe(1);
        expect(tray.destroyed).toBe(1);
        expect(lifecycle.brainState).toBe('stopped')
    });

    test('lets an injected boot join close before the one teardown begins', async () => {
        let releaseBoot;

        const
            app       = createFakeApp(),
            boot      = new Promise(resolve => { releaseBoot = resolve }),
            calls     = {teardown: 0},
            lifecycle = createAppLifecycle({
                app,
                teardownBrain: async () => {
                    await boot;
                    calls.teardown++;
                    return {}
                }
            }),
            willQuit = createCancellableEvent();

        lifecycle.requestQuit();
        app.emit('will-quit', willQuit);
        await Promise.resolve();

        expect(willQuit.defaultPrevented).toBe(true);
        expect(calls.teardown).toBe(0);

        releaseBoot();
        await boot;
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(calls.teardown).toBe(1);
        expect(app.quitCalls).toBe(2)
    });

    test('projects owner events through the running, degraded, and stopped tray triad', async () => {
        const
            app       = createFakeApp(),
            child     = new EventEmitter(),
            tray      = createFakeTrayFactory(),
            lifecycle = createAppLifecycle({app, teardownBrain: async () => ({})});

        lifecycle.installTray(tray.factory);
        expect(tray.callbacks.state).toBe('stopped');

        lifecycle.setBrainState('running');
        lifecycle.watchBrainChild(child);
        child.emit('exit', 1);

        expect(tray.states).toEqual(['running', 'degraded']);

        await lifecycle.exitTerminal(0);

        expect(tray.states).toEqual(['running', 'degraded', 'stopped']);
        expect(app.exitCalls).toEqual([0]);
        expect(tray.destroyed).toBe(1)
    });

    test('does not let late boot success overwrite an observed owned-child failure', () => {
        const
            app       = createFakeApp(),
            child     = new EventEmitter(),
            tray      = createFakeTrayFactory(),
            lifecycle = createAppLifecycle({app, teardownBrain: async () => ({})});

        lifecycle.setBrainState('degraded');
        lifecycle.installTray(tray.factory);
        lifecycle.watchBrainChild(child);
        child.emit('exit', 1);

        expect(lifecycle.settleBrainBoot(true)).toBe('degraded');
        expect(lifecycle.brainState).toBe('degraded');
        expect(tray.states).toEqual([])
    });

    test.describe('brainHealth cause retention (ADR 0034 §2.3.7)', () => {
        test('an owned-child fault names the child and event on the wire, severity stays internal', () => {
            const
                app       = createFakeApp(),
                child     = new EventEmitter(),
                lifecycle = createAppLifecycle({app, teardownBrain: async () => ({})});

            expect(lifecycle.brainHealth).toEqual({cause: null, state: 'stopped'});

            lifecycle.setBrainState('running');
            lifecycle.watchBrainChild(child, 'orchestrator');
            child.emit('exit', 1);

            const health = lifecycle.brainHealth;

            expect(health.state).toBe('degraded');
            expect(Object.keys(health.cause).sort()).toEqual(['detail', 'observedAt', 'source']);
            expect(health.cause.source).toBe('owned-child-termination');
            expect(health.cause.detail).toBe('orchestrator: exit code 1');
            expect(typeof health.cause.observedAt).toBe('number')
        });

        test('an owned-child fault supersedes a window-scoped cause, never the reverse', () => {
            const
                app       = createFakeApp(),
                child     = new EventEmitter(),
                cockpit   = createFakeWindow(),
                tray      = createFakeTrayFactory(),
                lifecycle = createAppLifecycle({app, teardownBrain: async () => ({})});

            lifecycle.attachCockpitWindow(cockpit);
            lifecycle.installTray(tray.factory);
            lifecycle.setBrainState('running');
            lifecycle.watchBrainChild(child, 'fleet');

            cockpit.emit('closed');
            expect(lifecycle.brainHealth.cause.source).toBe('cockpit-closed');

            child.emit('error', new Error('spawn ENOENT'));
            expect(lifecycle.brainHealth.cause.detail).toBe('fleet: error spawn ENOENT');

            // The reverse direction: a later window-scoped observation never displaces the child fault.
            cockpit.webContents.emit('render-process-gone');
            expect(lifecycle.brainHealth.cause.source).toBe('owned-child-termination')
        });

        test('first cause wins within a tier and the detail stays bounded', () => {
            const
                app       = createFakeApp(),
                child     = new EventEmitter(),
                cockpit   = createFakeWindow(),
                tray      = createFakeTrayFactory(),
                lifecycle = createAppLifecycle({app, teardownBrain: async () => ({})});

            lifecycle.attachCockpitWindow(cockpit);
            lifecycle.installTray(tray.factory);
            lifecycle.setBrainState('running');

            cockpit.emit('closed');
            cockpit.webContents.emit('render-process-gone');
            expect(lifecycle.brainHealth.cause.source).toBe('cockpit-closed');

            lifecycle.watchBrainChild(child, 'orchestrator');
            child.emit('error', new Error('x'.repeat(400)));
            expect(lifecycle.brainHealth.cause.detail.length).toBeLessThanOrEqual(200)
        });

        test('boot-not-ready is a recorded cause, and recovery to running clears it', () => {
            const
                app       = createFakeApp(),
                lifecycle = createAppLifecycle({app, teardownBrain: async () => ({})});

            expect(lifecycle.settleBrainBoot(false)).toBe('degraded');
            expect(lifecycle.brainHealth.cause.source).toBe('boot-not-ready');

            expect(lifecycle.settleBrainBoot(true)).toBe('running');
            expect(lifecycle.brainHealth).toEqual({cause: null, state: 'running'})
        });

        test('an explicit quit path never renders as impairment: stopped clears the cause', async () => {
            const
                app       = createFakeApp(),
                child     = new EventEmitter(),
                lifecycle = createAppLifecycle({app, teardownBrain: async () => ({})});

            lifecycle.setBrainState('running');
            lifecycle.watchBrainChild(child, 'fleet');
            child.emit('exit', null, 'SIGKILL');

            expect(lifecycle.brainHealth.cause.detail).toBe('fleet: exit signal SIGKILL');

            // exitTerminal reaches 'stopped' without ever passing through 'running'.
            await lifecycle.exitTerminal(0);

            expect(lifecycle.brainHealth).toEqual({cause: null, state: 'stopped'})
        })
    });

    test('keeps smoke terminal, trayless, and exact-once across repeated exit requests', async () => {
        const
            app       = createFakeApp(),
            cockpit   = createFakeWindow(),
            tray      = createFakeTrayFactory(),
            calls     = {teardown: 0},
            lifecycle = createAppLifecycle({
                app,
                smokeMode    : true,
                teardownBrain: async () => { calls.teardown++; return {} }
            });

        lifecycle.attachCockpitWindow(cockpit);

        expect(lifecycle.installTray(tray.factory)).toBe(null);
        expect(cockpit.requestClose().defaultPrevented).toBe(false);

        app.emit('window-all-closed');
        expect(app.quitCalls).toBe(1);

        await Promise.all([lifecycle.exitTerminal(2), lifecycle.exitTerminal(2)]);

        expect(calls.teardown).toBe(1);
        expect(app.exitCalls).toEqual([2]);
        expect(tray.created).toBe(0)
    })
});
