import Container from '../../../src/container/Base.mjs';

/**
 * @summary The next broadcast cue, bound to the director desk in this window or its detached presenter.
 * @class Neo.examples.list.onAir.Presenter
 * @extends Neo.container.Base
 */
class Presenter extends Container {
    /** @member {Object} disconnectedCue What the presenter shows without a live director. @static */
    static disconnectedCue = {cue: 'Director disconnected', detail: 'Open the presenter from a running director desk to see its next cue.'}

    static config = {
        /** @member {String} className='Neo.examples.list.onAir.Presenter' @protected */
        className: 'Neo.examples.list.onAir.Presenter',
        /** @member {String[]} additionalThemeFiles The scene's stylesheet also dresses the detached view. */
        additionalThemeFiles: ['Neo.examples.list.onAir.Viewport'],
        /** @member {String[]} cls */
        cls: ['air-presenter'],
        /** @member {String|null} directorWindowId The source browser window when this cue is detached. */
        directorWindowId: null,
        /** @member {Object[]} items */
        items: [
            {cls: ['air-presenter-label'], tag: 'h2', text: 'Presenter cue'},
            {cls: ['air-cue'], tag: 'p', bind: {text: 'cue'}},
            {cls: ['air-detail'], tag: 'p', bind: {text: 'detail'}}
        ],
        /** @member {String} layout */
        layout: 'base'
    }

    /**
     * @summary Opens the director's own presenter window, leaving the inline cue available on refusal.
     * @param {Neo.examples.list.onAir.Viewport} director
     * @returns {Promise<Boolean>} Whether the browser admitted the popup.
     */
    static async openWindow(director) {
        const {windowId} = director;
        if (!Neo.currentWorker.isSharedWorker) return false;

        const url = new URL(Neo.windowConfigs[windowId].url.href);
        url.searchParams.set('presenter', '1');
        try {
            return await Neo.Main.windowOpen({
                url           : url.href, windowId, windowName: `on-air-presenter-${windowId}`,
                windowFeatures: 'popup=yes,width=720,height=420'
            })
        } catch {
            return false
        }
    }

    /** @summary Watches the owner of a detached cue for departure. @param {Object} config */
    construct(config) {
        super.construct(config);
        if (this.directorWindowId) Neo.currentWorker.on({disconnect: this.onDirectorDisconnect, scope: this})
    }

    /** @summary Releases the detached view's worker listener. @param {...*} args */
    destroy(...args) {
        if (this.directorWindowId) Neo.currentWorker.un({disconnect: this.onDirectorDisconnect, scope: this});
        super.destroy(...args)
    }

    /** @summary Replaces a departed director's last cue before its state provider is destroyed. @param {Object} data */
    onDirectorDisconnect({windowId}) {
        if (windowId !== this.directorWindowId) return;
        this.stateProvider.setDataAtSameLevel(Presenter.disconnectedCue);
        this.stateProvider.parent = null
    }
}

export default Neo.setupClass(Presenter);
