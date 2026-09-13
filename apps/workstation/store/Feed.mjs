import Record from '../model/Record.mjs';
import Store  from '../../../src/data/Store.mjs';

/**
 * @summary The provider-owned Store<Model> producing Workstation's batched live feed.
 *
 * The root activates production; the provider-created store owns its timer and retires it on
 * destruction. Panes and status views only borrow it. Its sequence and collection survive parking.
 *
 * @class Workstation.store.Feed
 * @extends Neo.data.Store
 */
class Feed extends Store {
    static config = {
        /**
         * @member {String} className='Workstation.store.Feed'
         * @protected
         */
        className: 'Workstation.store.Feed',
        /** @member {Number} batchSize=5 Records produced on each interval. */
        batchSize: 5,
        /** @member {Number} batchCount_=0 Completed producer batches. @reactive */
        batchCount_: 0,
        /** @member {Number} intervalMs=500 Producer cadence in milliseconds. */
        intervalMs: 500,
        /**
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * @member {Number} maxRecords=500
         */
        maxRecords: 500,
        /**
         * @member {Neo.data.Model} model=Record
         */
        model: Record,
        /** @member {Number} sequence_=0 Last generated record sequence. @reactive */
        sequence_: 0,
        /**
         * @member {Object[]} sorters
         */
        sorters: [{property: 'id', direction: 'DESC'}]
    }

    /** @member {Number|null} #intervalId=null The producer's one timer. @private */
    #intervalId = null
    /** @member {Boolean} #running=false Includes synchronous startup before its timer exists. @private */
    #running = false
    /** @member {Boolean} #started=false Whether initial seeding has been considered. @private */
    #started = false

    /**
     * @summary Appends one batch, trims the oldest records and publishes its final sequence once.
     * @param {Number} [amount=this.batchSize]
     * @returns {Number} The capped record count.
     */
    appendBatch(amount=this.batchSize) {
        let me       = this,
            sequence = me.sequence,
            records  = [],
            now      = new Date();

        for (let index = 0; index < amount; index++) {
            sequence++;
            const base = (sequence * 13) % 101;

            records.push({
                id       : `feed-${String(sequence).padStart(8, '0')}`,
                name     : `runtime.event.${sequence % 17}`,
                status   : sequence % 5 ? 'accepted' : 'observed',
                timestamp: now.toLocaleTimeString('en-GB'),
                value    : base,
                counter  : sequence,
                progress : base,
                trend    : Array.from({length: 10}, (_, point) => (base + point * 9) % 101)
            })
        }

        me.add(records);
        if (me.count > me.maxRecords) me.splice(me.maxRecords, me.count - me.maxRecords);
        me.sequence = sequence;
        me.batchCount++;

        return me.count
    }

    /**
     * @summary Starts one producer, seeding 25 records only on the first start of a fresh empty feed.
     * A stopped producer resumes its sequence; borrowing or repeatedly starting it adds no timer.
     * @returns {Workstation.store.Feed}
     */
    start() {
        let me = this;

        if (me.isDestroyed || me.isDestroying || me.#running) return me;

        const seed = !me.#started && !me.count && me.sequence === 0 && me.batchCount === 0;
        me.#running = true;
        me.#started = true;
        if (seed) me.appendBatch(25);
        if (me.#running) me.#intervalId = setInterval(() => me.#running && me.appendBatch(), me.intervalMs);

        return me
    }

    /**
     * @summary Stops production without discarding records or resetting its sequence.
     * @returns {Workstation.store.Feed}
     */
    stop() {
        this.#running = false;
        if (this.#intervalId !== null) {
            clearInterval(this.#intervalId);
            this.#intervalId = null
        }
        return this
    }

    /** @summary Retires the timer before the store's records and fields. @param {...*} args */
    destroy(...args) {
        this.stop();
        super.destroy(...args)
    }
}

export default Neo.setupClass(Feed);
