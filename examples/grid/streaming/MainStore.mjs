import MainModel                                        from './MainModel.mjs';
import Store                                            from '../../../src/data/Store.mjs';
import StreamConnection, {BATCH_SIZE, FIRST_BATCH_SIZE} from './StreamConnection.mjs';
import StreamParser                                     from '../../../src/data/parser/Stream.mjs';

/**
 * @summary Buffered Turbo Mode store streaming 50,000 deterministic rows via `Neo.data.parser.Stream`.
 * @class Neo.examples.grid.streaming.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.streaming.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.streaming.MainStore',
        /**
         * @member {Boolean} autoInitRecords=false
         */
        autoInitRecords: false,
        /**
         * @member {Boolean} autoLoad=true
         */
        autoLoad: true,
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Neo.data.Model} model=MainModel
         */
        model: MainModel,
        /**
         * @member {Object} pipeline
         */
        pipeline: {
            connection: {
                module: StreamConnection
            },
            parser: {
                module           : StreamParser,
                chunkSize        : BATCH_SIZE,
                initialBurstCount: 1,
                initialChunkSize : FIRST_BATCH_SIZE
            }
        }
    }

    /**
     * @member {Promise<*>|null} #activeLoad=null
     * @private
     */
    #activeLoad = null

    /**
     * @summary Stops any active stream before destroying the store.
     * @param {...*} args
     */
    destroy(...args) {
        this.pipeline?.connection?.abort?.();
        super.destroy(...args)
    }

    /**
     * @summary Tracks the active load promise so {@link #reloadStream} can serialize overlapping streams cleanly.
     * @param {Object} [opts]
     * @returns {Promise<*>}
     */
    load(opts) {
        const promise = super.load(opts);
        this.#activeLoad = promise;

        return promise.finally(() => {
            if (this.#activeLoad === promise) {
                this.#activeLoad = null
            }
        })
    }

    /**
     * @summary Aborts any in-flight stream, empties the grid cleanly, and starts a fresh 50,000-row stream.
     * @returns {Promise<*>}
     */
    async reloadStream() {
        const me = this;

        if (me.isStreaming || me.isLoading) {
            me.pipeline?.connection?.abort?.();

            try {
                await me.#activeLoad
            } catch {}
        }

        if (!me.isDestroyed) {
            me.clear();
            return me.load()
        }
    }
}

export default Neo.setupClass(MainStore);
