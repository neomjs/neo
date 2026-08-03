// The Electron app-lifecycle owner: the organism outlives its windows.
// Electron objects stay injected so this state machine is testable from the repository's root
// unit runner, which deliberately does not install the harness-local Electron dependency.

export const BRAIN_STATES = Object.freeze(['running', 'degraded', 'stopped']);

const brainStates = new Set(BRAIN_STATES);

// Severity encodes the supersession rule: an owned-child fault outranks every window-scoped or
// readiness cause, mirroring settleBrainBoot's `up && !brainFaulted` vote.
const CAUSE_SEVERITY = Object.freeze({
    'boot-not-ready'         : 1,
    'cockpit-closed'         : 1,
    'cockpit-destroyed'      : 1,
    'owned-child-termination': 2,
    'render-process-gone'    : 1
});

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
        brainCause     = null,
        brainFaulted   = false,
        brainState     = 'stopped',
        cockpitWindow  = null,
        explicitQuit   = false,
        normalQuit     = null,
        terminalExit   = null,
        teardown       = null,
        trayController = null;

    /**
     * @summary Retains the ONE bounded degrade cause under severity-tiered first-cause-wins.
     * Within a tier the first cause of an episode survives; a higher-severity cause supersedes a
     * lower one, never the reverse.
     * @param {String} source A key of CAUSE_SEVERITY.
     * @param {String|null} [detail=null] Bounded human-readable summary from the observation site.
     * @returns {Object}
     */
    function recordBrainCause(source, detail = null) {
        const severity = CAUSE_SEVERITY[source];

        if (!severity) {
            throw new Error(`Unsupported harness Brain cause source: ${source}`)
        }

        if (!brainCause || severity > brainCause.severity) {
            brainCause = {detail, observedAt: Date.now(), severity, source}
        }

        return brainCause
    }

    /**
     * @summary Projects the lifecycle owner's current Brain truth into the existing tray handle.
     * A retained cause never survives out of a degraded episode: `running` recovers, and an
     * explicit quit/teardown (`stopped`) must never render as impairment.
     * @param {'running'|'degraded'|'stopped'} state
     * @returns {String}
     */
    function setBrainState(state) {
        if (!brainStates.has(state)) {
            throw new Error(`Unsupported harness Brain state: ${state}`)
        }

        if (state === 'running' || state === 'stopped') {
            brainCause = null
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
        up || recordBrainCause('boot-not-ready');
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
                    recordBrainCause('cockpit-closed');
                    setBrainState('degraded')
                }
            });
            cockpitWindow.webContents?.once?.('render-process-gone', () => {
                if (!explicitQuit && !allowFinalQuit) {
                    recordBrainCause('render-process-gone');
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
            recordBrainCause('cockpit-destroyed');
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
     * The termination edge is the fault-observation site, so the cause (which child, which event)
     * is produced here — downstream consumers can never reconstruct it.
     * @param {import('node:events').EventEmitter} child
     * @param {String|null} [label=null] The owned child's registry identity, e.g. 'orchestrator'.
     * @returns {Function} Removes both observation listeners.
     */
    function watchBrainChild(child, label = null) {
        const onUnexpectedTermination = summary => {
            if (!teardown && !explicitQuit && !allowFinalQuit) {
                brainFaulted = true;
                recordBrainCause('owned-child-termination', `${label ?? 'brain-child'}: ${summary}`.slice(0, 200));
                setBrainState('degraded')
            }
        };

        const
            onError = error => onUnexpectedTermination(`error ${String(error?.message ?? error ?? 'unknown')}`),
            onExit  = (code, signal) => onUnexpectedTermination(signal ? `exit signal ${signal}` : `exit code ${code}`);

        child.once('error', onError);
        child.once('exit', onExit);

        return () => {
            child.off('error', onError);
            child.off('exit', onExit)
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
        /**
         * @summary The shell health wire payload: current state plus the retained cause.
         * Severity stays producer-internal; the wire carries `{source, detail, observedAt}`.
         * @returns {{state: String, cause: {source: String, detail: String|null, observedAt: Number}|null}}
         */
        get brainHealth() {
            return {
                cause: brainCause ? {detail: brainCause.detail, observedAt: brainCause.observedAt, source: brainCause.source} : null,
                state: brainState
            }
        },
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
