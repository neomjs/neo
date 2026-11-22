import BaseViewport        from '../../../src/container/Viewport.mjs';
import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import CompanionSurface    from './CompanionSurface.mjs';
import MainContainer       from './MainContainer.mjs';

const PRIMARY_APP_NAME   = 'Neo.examples.stateProvider.advanced',
      COMPANION_APP_NAME = 'Neo.examples.stateProvider.advanced.companion';

/**
 * @summary Resolves the exact primary application that opened this companion window, either via its
 * one-time `nativeRoute` handshake on initial open or via verified `window.opener` + `openWindows`
 * handle ownership across same-window reloads. Never falls back to an unrelated primary window.
 * @param {String} windowId
 * @param {Object|null} windowData
 * @returns {Promise<Neo.controller.Application|null>}
 */
export async function resolveCompanionOwnerApp(windowId, windowData) {
    const isLivePrimary = candidate =>
        candidate?.name === PRIMARY_APP_NAME &&
        !candidate.isDestroyed &&
        !Neo.currentWorker?.isWindowDeparted?.(candidate.windowId) &&
        candidate.mainView &&
        !candidate.mainView.isDestroyed;

    const route = windowData?.nativeRoute;

    if (route?.targetWindowId === windowId) {
        const routedOwner = Neo.apps?.[route.ownerWindowId];
        return isLivePrimary(routedOwner) ? routedOwner : null
    }

    if (typeof Neo.Main?.getByPath !== 'function') {
        return null
    }

    const [targetName, openerClosed, openerWindowId] = await Promise.all([
        Neo.Main.getByPath({path: 'name', windowId}).catch(() => null),
        Neo.Main.getByPath({path: 'opener.closed', windowId}).catch(() => true),
        Neo.Main.getByPath({path: 'opener.Neo.worker.Manager.windowId', windowId}).catch(() => null)
    ]);

    if (openerClosed !== false || !targetName || !openerWindowId) {
        return null
    }

    const openerApp = Neo.apps?.[openerWindowId];
    if (!isLivePrimary(openerApp)) {
        return null
    }

    const registeredTargetName = await Neo.Main.getByPath({
        path    : ['Neo', 'Main', 'openWindows', CompanionSurface.windowNameFor(openerWindowId), 'targetName'],
        windowId: openerWindowId
    }).catch(() => null);

    return registeredTargetName === targetName ? openerApp : null
}

/**
 * @summary Boots the primary StateProvider workspace, or mounts a companion editor window bound to its opener's StateProvider.
 * @returns {Promise<Neo.controller.Application>|Neo.controller.Application}
 */
export async function onStart() {
    const windowId = Neo.bootingWindowId,
          config   = Neo.windowConfigs?.[windowId] || Neo.config,
          params   = new URLSearchParams(config.url?.search),
          theme    = resolveStartTheme(config);

    if (params.get('companion') !== '1') {
        return Neo.app({
            mainView: {module: MainContainer, theme},
            name    : PRIMARY_APP_NAME,
            windowId
        })
    }

    const app = Neo.app({
        mainView: {
            module: BaseViewport,
            cls   : ['sp-companion-viewport'],
            layout: 'base',
            theme
        },
        name: COMPANION_APP_NAME,
        windowId
    });

    const data = await Neo.Main.getWindowData({windowId}).catch(() => null);
    if (app.isDestroyed) return app;

    const ownerApp    = await resolveCompanionOwnerApp(windowId, data),
          primaryView = ownerApp && !app.isDestroyed && !ownerApp.mainView?.isDestroyed ? ownerApp.mainView : null;

    if (app.isDestroyed) return app;

    if (primaryView) {
        app.mainView.theme = primaryView.getTheme();
        app.mainView.observeConfig(primaryView, 'theme', nextTheme => {
            if (!app.isDestroyed && nextTheme && app.mainView.theme !== nextTheme) {
                app.mainView.theme = nextTheme
            }
        });
        primaryView.observeConfig(app.mainView, 'theme', nextTheme => {
            if (!primaryView.isDestroyed && nextTheme && primaryView.theme !== nextTheme) {
                primaryView.theme = nextTheme
            }
        })
    }

    app.mainView.add({
        module       : CompanionSurface,
        ownerWindowId: primaryView ? ownerApp.windowId : null,
        stateProvider: primaryView
            ? {parent: primaryView.getStateProvider()}
            : {data: CompanionSurface.disconnectedState}
    });

    primaryView?.controller?.onWorkerWindowChange?.();

    return app
}
