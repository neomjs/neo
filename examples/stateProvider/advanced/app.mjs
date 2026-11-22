import BaseViewport        from '../../../src/container/Viewport.mjs';
import {resolveStartTheme} from '../../../src/util/Theme.mjs';
import CompanionSurface    from './CompanionSurface.mjs';
import MainContainer       from './MainContainer.mjs';

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
            name    : 'Neo.examples.stateProvider.advanced',
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
        name: 'Neo.examples.stateProvider.advanced.companion',
        windowId
    });

    const data = await Neo.Main.getWindowData({windowId}).catch(() => null);
    if (app.isDestroyed) return app;

    const route    = data?.nativeRoute,
          ownerApp = (route?.targetWindowId === windowId && Neo.apps?.[route.ownerWindowId])
                     || Object.values(Neo.apps || {}).find(candidate =>
                         candidate?.name === 'Neo.examples.stateProvider.advanced' &&
                         !Neo.currentWorker.isWindowDeparted?.(candidate.windowId)
                     ),
          primaryView = ownerApp?.mainView;

    if (primaryView && !primaryView.isDestroyed) {
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

    return app
}
