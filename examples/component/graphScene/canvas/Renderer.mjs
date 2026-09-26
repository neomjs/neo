import GraphScene from '../../../../src/canvas/GraphScene.mjs';

/**
 * @summary The example's graph renderer: `Neo.canvas.GraphScene` as a canvas-worker singleton, plus two
 * controls that make a lost context reproducible on demand (`WEBGL_lose_context`), so the page and its
 * e2e can watch the scene come back, and a lap that measures the frame rate of each level of detail.
 *
 * @class Neo.examples.component.graphScene.Renderer
 * @extends Neo.canvas.GraphScene
 * @singleton
 */
class Renderer extends GraphScene {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.graphScene.Renderer'
         * @protected
         */
        className: 'Neo.examples.component.graphScene.Renderer',
        /**
         * @member {Object} remote
         * @protected
         */
        remote: {
            app: [
                'clearGraph',
                'getStats',
                'initGraph',
                'loseContext',
                'pause',
                'pick',
                'restoreContext',
                'resume',
                'setScene',
                'setTheme',
                'startLodLap',
                'updateMouseState',
                'updateSize'
            ]
        },
        /**
         * @member {Boolean} singleton=true
         * @protected
         */
        singleton: true
    }

    /**
     * The level-of-detail lap in progress or finished: the level measured now, the frames and the time
     * counted for it, and the frame rates measured so far; `null` before the first lap.
     * @member {Object|null} lodLap=null
     */
    lodLap = null
    /**
     * The `WEBGL_lose_context` extension, kept from the loss so the restore can reach it.
     * @member {WEBGL_lose_context|null} loseExtension=null
     */
    loseExtension = null

    /**
     * @summary The base's stats plus the lap: `{done, level, results}`, `results` holding frames per second by
     * level.
     * @returns {Object}
     */
    getStats() {
        const {lodLap} = this;

        return {...super.getStats(), lodLap: lodLap && {done: lodLap.done, level: lodLap.level, results: {...lodLap.results}}}
    }

    /**
     * @summary Loses the context the way a GPU reset would.
     */
    loseContext() {
        const me = this;

        me.loseExtension = me.gl?.getExtension('WEBGL_lose_context') ?? null;
        me.loseExtension?.loseContext()
    }

    /**
     * @summary A frame, and while a lap runs, its measurement: the camera turns a little every frame so every
     * frame draws, and each level is timed for the lap's `seconds`. A gap over a quarter second (a hidden
     * surface draws nothing) does not count as time.
     */
    render() {
        const me = this, {lodLap: lap} = me;

        super.render();

        if (!lap || lap.done || !me.canRender) {
            return
        }

        const now = performance.now(), gap = lap.last === null ? null : now - lap.last;

        if (gap !== null && gap < 250) {
            lap.frames++;
            lap.time += gap
        }

        lap.last = now;

        if (lap.time >= lap.seconds * 1000) {
            const next = lap.levels[lap.levels.indexOf(lap.level) + 1];

            lap.results[lap.level] = Math.round(lap.frames / lap.time * 10000) / 10;
            Object.assign(lap, {frames: 0, last: null, time: 0});

            if (!next) {
                lap.done    = true;
                me.lodLevel = null;
                return
            }

            lap.level   = next;
            me.lodLevel = next
        }

        me.camera.yaw += 0.004;
        me.requestFrame()
    }

    /**
     * @summary Brings the lost context back; the renderer's restore handler redraws the kept scene.
     */
    restoreContext() {
        this.loseExtension?.restoreContext()
    }

    /**
     * @summary Starts a lap over the levels: every edge, then far, mid and near, each for `seconds` at the
     * current camera distance while the camera turns. The rates land in `getStats().lodLap`.
     * @param {Object} [data={}]
     * @param {Number} [data.seconds=5]
     */
    startLodLap({seconds = 5} = {}) {
        const me = this;

        me.lodLap         = {done: false, frames: 0, last: null, level: 'full', levels: ['full', 'far', 'mid', 'near'], results: {}, seconds, time: 0};
        me.camera.touched = true;
        me.lodLevel       = 'full';
        me.requestFrame()
    }
}

export default Neo.setupClass(Renderer);
