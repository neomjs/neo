import Controller from '../../src/controller/Component.mjs';
import VDomUtil   from '../../src/util/VDom.mjs';

/**
 * @summary Moves a playing Video component between two containers and tracks playback continuity across moves.
 * @class Neo.examples.videoMove.MainContainerController
 * @extends Neo.controller.Component
 */
class MainContainerController extends Controller {
    static config = {
        /**
         * @member {String} className='Neo.examples.videoMove.MainContainerController'
         * @protected
         */
        className: 'Neo.examples.videoMove.MainContainerController'
    }

    /**
     * @member {String} activePanel='Panel A'
     * @protected
     */
    activePanel = 'Panel A'
    /**
     * @member {Number|null} lastMoveSeconds=null
     * @protected
     */
    lastMoveSeconds = null
    /**
     * @member {Number} moveCount=0
     * @protected
     */
    moveCount = 0
    /**
     * @member {Boolean} moving=false
     * @protected
     */
    moving = false
    /**
     * @member {Number|null} positionTimer=null
     * @protected
     */
    positionTimer = null

    /**
     * @summary Clears the post-move playback ticker when the view controller is destroyed.
     */
    destroy() {
        clearInterval(this.positionTimer);
        super.destroy()
    }

    /**
     * @summary Formats a media timestamp in `m:ss` form.
     * @param {Number} seconds
     * @returns {String}
     */
    formatTime(seconds) {
        const total = Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : 0,
              mins  = Math.floor(total / 60),
              secs  = String(total % 60).padStart(2, '0');

        return `${mins}:${secs}`
    }

    /**
     * @summary Resolves the rendered `<video>` element id owned by the Video component.
     * @returns {String|null}
     */
    getMediaNodeId() {
        const player = this.getReference('player');

        return player ? VDomUtil.getFlags(player.vdom, 'media')[0]?.id ?? null : null
    }

    /**
     * @summary Enables looping on the underlying `<video>` element once mounted without disturbing landing stability.
     */
    onMounted() {
        const player = this.getReference('player'),
              media  = player && VDomUtil.getFlags(player.vdom, 'media')[0];

        if (media && !media.loop) {
            media.loop = true;
            player.update()
        }
    }

    /**
     * @summary Reparents the live Video component into the opposite panel and displays the move and continuing timestamps.
     * @returns {Promise<void>}
     */
    async onMoveVideoButtonClick() {
        const me = this;

        if (me.moving) return;
        me.moving = true;

        try {
            const container1 = me.getReference('container-1'),
                  container2 = me.getReference('container-2'),
                  badge1     = me.getReference('panel-1-badge'),
                  badge2     = me.getReference('panel-2-badge'),
                  player     = me.getReference('player'),
                  toPanelB   = container2.items.length < 1,
                  target     = toPanelB ? container2 : container1,
                  before     = await me.readPlaybackState();

            if (me.isDestroyed) return;

            target.add(player);
            await me.component.promiseUpdate();

            if (me.isDestroyed) return;

            me.moveCount++;
            me.activePanel     = toPanelB ? 'Panel B' : 'Panel A';
            me.lastMoveSeconds = before.currentTime;

            badge1.text = toPanelB ? 'Ready to receive' : 'Playing here';
            badge2.text = toPanelB ? 'Playing here' : 'Ready to receive';

            await me.updatePostMoveReadout();
            me.startPositionTicker()
        } finally {
            me.moving = false
        }
    }

    /**
     * @summary Reads `currentTime` and `paused` from the live `<video>` DOM node via DomAccess.
     * @returns {Promise<{currentTime: Number, paused: Boolean}>}
     */
    async readPlaybackState() {
        const id = this.getMediaNodeId();

        if (!id || !Neo.main?.DomAccess?.getAttributes) {
            return {currentTime: 0, paused: false}
        }

        const state = await Neo.main.DomAccess.getAttributes({
            attributes: ['currentTime', 'paused'],
            id,
            windowId  : this.windowId
        });

        return {
            currentTime: Number.isFinite(state?.currentTime) ? state.currentTime : 0,
            paused     : Boolean(state?.paused)
        }
    }

    /**
     * @summary Starts a 500 ms readout refresh after the first move so visitors see playback advance past the move timestamp.
     */
    startPositionTicker() {
        const me = this;

        if (me.positionTimer) return;

        me.positionTimer = setInterval(() => {
            if (me.isDestroyed) {
                clearInterval(me.positionTimer);
                me.positionTimer = null;
                return
            }

            me.updatePostMoveReadout()
        }, 500)
    }

    /**
     * @summary Updates the status readout with the position where the move happened and the current playback position.
     * @returns {Promise<void>}
     */
    async updatePostMoveReadout() {
        const me      = this,
              readout = me.getReference('status-readout');

        if (!readout || me.lastMoveSeconds === null) return;

        const {currentTime, paused} = await me.readPlaybackState();

        if (me.isDestroyed) return;

        const movedAt   = me.formatTime(me.lastMoveSeconds),
              nowAt     = me.formatTime(currentTime),
              moveLabel = me.moveCount === 1 ? '1 move' : `${me.moveCount} moves`,
              stateText = paused ? `paused at ${nowAt}` : `still playing at ${nowAt}`;

        readout.text = `Moved to ${me.activePanel} at ${movedAt}, ${stateText} (${moveLabel})`
    }
}

export default Neo.setupClass(MainContainerController);
