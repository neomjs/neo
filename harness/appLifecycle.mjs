// The Electron app-lifecycle owner: the organism outlives its windows.
// Electron objects stay injected so this state machine is testable from the repository's root
// unit runner, which deliberately does not install the harness-local Electron dependency.

export const BRAIN_STATES = Object.freeze(['running', 'degraded', 'stopped']);

const brainStates = new Set(BRAIN_STATES);

/**
 * @summary Creates the one shell owner for the retained cockpit, tray truth, and Brain teardown.
 * @param {Object} options
 * @param {Electron.App|import('node:events').EventEmitter} options.app Electron app or a test fake.
 * @param {Boolean} [options.smokeMode=false] Keeps smoke terminal: no tray and no retained window.
 * @param {Function} options.teardownBrain Settles teardown of only the Brain children we own.
 * @param {Function} [options.onTeardownError] Receives an unexpected teardown rejection.
 * @param {Function} [options.onTeardownSettled] Receives the single settled teardown report.
 * @returns {Object}
 */
export function createAppLifecycle({
    app,
    onTeardownError = () => {},
    onTeardownSettled = () => {},
    smokeMode = false,
    teardownBrain
}) {
    let
        allowFinalQuit = false,
        brainFaulted   = false,
        brainState     = 'stopped',
        cockpitWindow  = null,
        explicitQuit   = false,
        normalQuit     = null,
        terminalExit   = null,
        teardown       = null,
        trayController = null;

    /**
     * @summary Projects the lifecycle owner's current Brain truth into the existing tray handle.
     * @param {'running'|'degraded'|'stopped'} state
     * @returns {String}
     */
    function setBrainState(state) {
        if (!brainStates.has(state)) {
            throw new Error(`Unsupported harness Brain state: ${state}`)
        }

        if (brainState !== state) {
            brainState = state;
            trayController?.setState(state)
        }

        return brainState
    }

    /**
     * @summary Settles asynchronous Brain boot without erasing an owned-child fault that arrived
     * while readiness was still resolving.
     * @param {Boolean} up Whether the bounded boot contract reached ready.
     * @returns {'running'|'degraded'}
     */
    function settleBrainBoot(up) {
        return setBrainState(up && !brainFaulted ? 'running' : 'degraded')
    }

    /**
     * @summary Coalesces every exit path onto one owned-child teardown promise.
     * @returns {Promise<Object|null>}
     */
    function teardownOwnedBrain() {
        if (!teardown) {
            teardown = Promise.resolve()
                .then(teardownBrain)
                .then(async report => {
                    await onTeardownSettled(report);
                    return report
                })
        }

        return teardown
    }

    /**
     * @summary Hides only the retained cockpit while normal app operation continues.
     * @param {Electron.Event|Object} event
     */
    function onCockpitClose(event) {
        if (!explicitQuit && !allowFinalQuit && trayController) {
            event.preventDefault();
            cockpitWindow.hide()
        }
    }

    /**
     * @summary Attaches hide-on-close semantics to the one durable cockpit window.
     * @param {Electron.BrowserWindow|import('node:events').EventEmitter} win
     * @returns {Object}
     */
    function attachCockpitWindow(win) {
        if (cockpitWindow && cockpitWindow !== win) {
            throw new Error('The harness lifecycle already owns a different cockpit window')
        }

        cockpitWindow = win;

        if (!smokeMode) {
            cockpitWindow.on('close', onCockpitClose);
            cockpitWindow.once('closed', () => {
                if (!explicitQuit && !allowFinalQuit) {
                    setBrainState('degraded')
                }
            });
            cockpitWindow.webContents?.once?.('render-process-gone', () => {
                if (!explicitQuit && !allowFinalQuit) {
                    setBrainState('degraded')
                }
            })
        }

        return win
    }

    /**
     * @summary Shows and focuses the retained cockpit without creating a new renderer generation.
     * @returns {Boolean} False when no surviving cockpit exists.
     */
    function openCockpit() {
        if (!cockpitWindow || cockpitWindow.isDestroyed()) {
            setBrainState('degraded');
            return false
        }

        cockpitWindow.isMinimized?.() && cockpitWindow.restore();
        cockpitWindow.show();
        cockpitWindow.focus();
        return true
    }

    /**
     * @summary Installs the one tray controller after Electron becomes ready.
     * @param {Function} createTray Injected Electron Tray/Menu composition factory.
     * @returns {Object|null}
     */
    function installTray(createTray) {
        if (smokeMode) {
            return null
        }

        if (!trayController) {
            trayController = createTray({
                onOpen: openCockpit,
                onQuit: requestQuit,
                state : brainState
            })
        }

        return trayController
    }

    /**
     * @summary Routes a headed witness through the exact menu item callback shipped in the tray.
     * @param {'open-cockpit'|'quit'} action
     * @returns {Boolean}
     */
    function invokeTrayAction(action) {
        return trayController?.invoke(action) === true
    }

    /**
     * @summary Marks unexpected owned-child termination as degraded without inventing a poller.
     * @param {import('node:events').EventEmitter} child
     * @returns {Function} Removes both observation listeners.
     */
    function watchBrainChild(child) {
        const onUnexpectedTermination = () => {
            if (!teardown && !explicitQuit && !allowFinalQuit) {
                brainFaulted = true;
                setBrainState('degraded')
            }
        };

        child.once('error', onUnexpectedTermination);
        child.once('exit', onUnexpectedTermination);

        return () => {
            child.off('error', onUnexpectedTermination);
            child.off('exit', onUnexpectedTermination)
        }
    }

    /**
     * @summary Starts one explicit normal quit; repeated tray intents coalesce at this boundary.
     * @returns {Boolean} True only for the intent that called `app.quit()`.
     */
    function requestQuit() {
        if (explicitQuit || allowFinalQuit) {
            return false
        }

        explicitQuit = true;
        app.quit();
        return true
    }

    /**
     * @summary Preserves smoke/error `app.exit` semantics after the same exact-once teardown.
     * @param {Number} code
     * @returns {Promise<Object|null>}
     */
    function exitTerminal(code) {
        if (!terminalExit) {
            explicitQuit = true;
            terminalExit = teardownOwnedBrain()
                .catch(error => {
                    onTeardownError(error);
                    return null
                })
                .then(report => {
                    setBrainState('stopped');
                    trayController?.destroy();
                    trayController = null;
                    allowFinalQuit = true;
                    app.exit(code);
                    return report
                })
        }

        return terminalExit
    }

    app.on('before-quit', () => {
        // Native app-menu / OS quit is an explicit intent even though it did not traverse our tray.
        explicitQuit = true
    });

    app.on('will-quit', event => {
        if (allowFinalQuit) {
            return
        }

        event.preventDefault();
        explicitQuit = true;

        if (!normalQuit) {
            normalQuit = teardownOwnedBrain()
                .catch(error => onTeardownError(error))
                .then(() => {
                    setBrainState('stopped');
                    trayController?.destroy();
                    trayController = null;
                    allowFinalQuit = true;
                    app.quit()
                })
        }
    });

    app.on('window-all-closed', () => {
        // Smoke and a tray-init failure remain quittable; a reachable product tray survives here.
        (smokeMode || !trayController) && app.quit()
    });

    app.on('activate', openCockpit);

    return {
        attachCockpitWindow,
        exitTerminal,
        get brainState() { return brainState },
        installTray,
        invokeTrayAction,
        openCockpit,
        requestQuit,
        setBrainState,
        settleBrainBoot,
        teardown: teardownOwnedBrain,
        watchBrainChild
    }
}
