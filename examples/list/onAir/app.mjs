import BaseViewport from '../../../src/container/Viewport.mjs';
import Presenter    from './Presenter.mjs';
import Viewport     from './Viewport.mjs';

/**
 * @summary Boots the director, or mounts a presenter bound to the desk that opened this exact browser window.
 * @returns {Promise<Neo.controller.Application>}
 */
export async function onStart() {
    const windowId  = Neo.bootingWindowId,
          config    = Neo.windowConfigs?.[windowId] || Neo.config,
          params    = new URLSearchParams(config.url?.search),
          requested = params.get('theme'),
          theme     = config.themes.includes(requested) ? requested : config.themes[0];

    if (params.get('presenter') !== '1') {
        return Neo.app({name: 'OnAir', mainView: {module: Viewport, theme}, windowId})
    }

    const app = Neo.app({
        name    : 'OnAirPresenter', windowId,
        mainView: {module: BaseViewport, cls: ['air-presenter-window'], layout: 'fit', theme}
    });
    const data = await Neo.Main.getWindowData({windowId}).catch(() => null);
    if (app.isDestroyed) return app;

    const route = data?.nativeRoute,
          owner = route?.targetWindowId === windowId && Neo.apps[route.ownerWindowId],
          desk  = owner?.name === 'OnAir' && !Neo.currentWorker.isWindowDeparted(owner.windowId) && owner.mainView;

    if (desk) {
        app.mainView.theme = desk.getTheme();
        app.mainView.observeConfig(desk, 'theme', nextTheme => {
            if (!app.isDestroyed && nextTheme) {
                app.mainView.theme = nextTheme
            }
        })
    }

    app.mainView.add({
        module          : Presenter,
        directorWindowId: desk ? owner.windowId : null,
        stateProvider   : desk ? {parent: desk.getStateProvider()} : {data: Presenter.disconnectedCue}
    });
    return app
}
