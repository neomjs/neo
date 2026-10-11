import Button      from '../../../src/button/Base.mjs';
import Component   from '../../../src/component/Base.mjs';
import SceneCanvas from './SceneCanvas.mjs';
import Toolbar     from '../../../src/toolbar/Base.mjs';
import Viewport    from '../../../src/container/Viewport.mjs';

/**
 * @summary A `Neo.canvas.GraphScene` on the canvas worker. Drag to orbit, scroll to zoom. The toolbar sends
 * a bigger or smaller scene, loses and restores the WebGL context, and reads the renderer's stats: the
 * frame count stays still while nothing changes, and the scene comes back after a restore. "100k clustered"
 * sends a clustered graph of 100k nodes and a million edges, drawn through the level of detail, and "LOD lap"
 * measures the frame rate of every edge against the far, mid and near levels.
 *
 * @class Neo.examples.component.graphScene.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /**
         * @member {String} className='Neo.examples.component.graphScene.MainContainer'
         * @protected
         */
        className: 'Neo.examples.component.graphScene.MainContainer',
        /**
         * @member {Object} layout={ntype: 'vbox', align: 'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'},
        /**
         * @member {Object[]} items
         */
        items: [{
            module: Toolbar,
            flex  : 'none',
            items : [{
                module : Button,
                handler: 'up.onNodeCountButton',
                text   : '120 nodes'
            }, {
                module : Button,
                handler: 'up.onNodeCountButton',
                text   : '240 nodes'
            }, {
                module : Button,
                handler: 'up.onNodeCountButton',
                text   : '2400 nodes'
            }, {
                module   : Button,
                handler  : 'up.onClusteredButton',
                reference: 'clustered',
                text     : '100k clustered'
            }, {
                module   : Button,
                handler  : 'up.onLodLapButton',
                reference: 'lod-lap',
                text     : 'LOD lap'
            }, '->', {
                module   : Button,
                handler  : 'up.onLoseContextButton',
                reference: 'lose-context',
                text     : 'Lose context'
            }, {
                module   : Button,
                handler  : 'up.onRestoreContextButton',
                reference: 'restore-context',
                text     : 'Restore context'
            }, {
                module   : Button,
                handler  : 'up.onStatsButton',
                reference: 'read-stats',
                text     : 'Read stats'
            }]
        }, {
            module   : Component,
            cls      : ['graph-scene-stats'],
            flex     : 'none',
            reference: 'stats',
            style    : {fontFamily: 'monospace', padding: '4px 8px'},
            text     : 'drag orbits · wheel zooms'
        }, {
            module   : SceneCanvas,
            flex     : 1,
            reference: 'canvas'
        }]
    }

    /**
     * @summary Loses the WebGL context.
     */
    async onLoseContextButton() {
        await this.getReference('canvas').loseContext()
    }

    /**
     * @summary Sends the 100k-node clustered scene, drawn through the level of detail.
     */
    async onClusteredButton() {
        await this.getReference('canvas').sendClusteredScene()
    }

    /**
     * @summary Starts the level-of-detail lap: every edge, far, mid and near, five seconds each; Read stats
     * shows the frame rates as they arrive.
     */
    async onLodLapButton() {
        await this.getReference('canvas').startLodLap(5)
    }

    /**
     * @summary Sends a scene with the node count the button names.
     * @param {Object} data
     */
    onNodeCountButton(data) {
        this.getReference('canvas').nodeCount = parseInt(data.component.text)
    }

    /**
     * @summary Restores the WebGL context.
     */
    async onRestoreContextButton() {
        await this.getReference('canvas').restoreContext()
    }

    /**
     * Stats reads so far; the `data-stats` JSON carries it as `read`, so a reader can tell a fresh read
     * from the previous one when nothing else changed.
     * @member {Number} statsReads=0
     */
    statsReads = 0

    /**
     * @summary Reads the renderer's stats into the stats line, and as JSON into its `data-stats` attribute.
     */
    async onStatsButton() {
        const
            me    = this,
            stats = {...await me.getReference('canvas').getStats(), read: ++me.statsReads},
            line  = me.getReference('stats'),
            {camera, canvas, contextLost, counts, frames, lod, lodLap, restores} = stats;

        line.text = [
            `frames ${frames}`,
            counts ? `nodes ${counts.nodes} · edges ${counts.edges} · paths ${counts.paths}` : 'no scene',
            lod && `lod ${lod.level} · ${lod.edgesDrawn} lines drawn · ${lod.clusters} clusters`,
            lodLap && `lap ${lodLap.done ? 'done' : lodLap.level}${lodLap.restarts ? `, ${lodLap.restarts} restarts` : ''}: ${Object.entries(lodLap.results).map(([level, {fps, maxGapMs}]) => `${level} ${fps} fps (max gap ${maxGapMs} ms)`).join(', ') || 'measuring'}`,
            `buffer ${canvas[0]}×${canvas[1]}`,
            `camera ${camera.touched ? 'taken' : 'fitted'}`,
            `context ${contextLost ? 'lost' : 'live'} · restores ${restores}`
        ].filter(Boolean).join(' · ');

        line.vdom['data-stats'] = JSON.stringify(stats);
        line.update()
    }
}

export default Neo.setupClass(MainContainer);
