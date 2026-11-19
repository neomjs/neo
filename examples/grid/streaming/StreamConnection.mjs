import Base                 from '../../../src/data/connection/Base.mjs';
import {createSeededRandom} from '../../../src/util/Random.mjs';

export const
    BATCH_SIZE       = 2500,
    FIRST_BATCH_SIZE = 250,
    SEED             = 21190,
    TOTAL_ROWS       = 50000;

const
    APPROX_BYTES_PER_ROW = 186,
    CORRIDORS            = ['EUR -> USD', 'USD -> GBP', 'GBP -> CHF', 'USD -> JPY', 'EUR -> SEK', 'CAD -> USD'],
    COUNTERPARTIES       = [
        'Nordic Clearing AB', 'Helvetia Liquidity', 'Thames Settlement', 'Rhein Bank AG',
        'Pacific Custody', 'Iberia Treasury', 'Baltic Exchange', 'Alpine FX Desk'
    ],
    DESKS                = ['Frankfurt FX', 'London Core', 'Zurich Wire', 'Tokyo Overnight', 'New York CHIPS'],
    STATUSES             = ['Settled', 'Settled', 'Settled', 'Clearing', 'Queued'],
    pad2                 = n => String(n).padStart(2, '0'),
    pad3                 = n => String(n).padStart(3, '0');

/**
 * @summary Builds one deterministic settlement NDJSON line using a seeded RNG.
 * @param {Number} index Zero-based row index
 * @param {Function} random Seeded RNG returning `[0, 1)`
 * @returns {String}
 */
export function buildSettlementLine(index, random) {
    const
        hour   = 8 + Math.floor(random() * 10),
        minute = Math.floor(random() * 60),
        second = Math.floor(random() * 60),
        millis = Math.floor(random() * 1000);

    return JSON.stringify({
        amount      : Math.round((250 + random() * 249750) * 100) / 100,
        corridor    : CORRIDORS[Math.floor(random() * CORRIDORS.length)],
        counterparty: COUNTERPARTIES[Math.floor(random() * COUNTERPARTIES.length)],
        desk        : DESKS[Math.floor(random() * DESKS.length)],
        id          : index + 1,
        latencyMs   : 4 + Math.floor(random() * 92),
        settledAt   : `${pad2(hour)}:${pad2(minute)}:${pad2(second)}.${pad3(millis)}`,
        settlementId: `STL-${100001 + index}`,
        status      : STATUSES[Math.floor(random() * STATUSES.length)]
    }) + '\n'
}

/**
 * @summary In-example streaming connection that emits 50,000 deterministic NDJSON rows in paced chunks so arrival stays visible without a backend.
 * @class Neo.examples.grid.streaming.StreamConnection
 * @extends Neo.data.connection.Base
 */
class StreamConnection extends Base {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.streaming.StreamConnection'
         * @protected
         */
        className: 'Neo.examples.grid.streaming.StreamConnection',
        /**
         * @member {String} ntype='example-streaming-connection'
         * @protected
         */
        ntype: 'example-streaming-connection',
        /**
         * Number of records per chunk after the initial first-paint batch.
         * @member {Number} batchSize=BATCH_SIZE
         */
        batchSize: BATCH_SIZE,
        /**
         * Delay in milliseconds between streamed chunks so progressive loading stays visible on any machine.
         * @member {Number} chunkDelay=120
         */
        chunkDelay: 120,
        /**
         * Small first batch for fast initial row rendering.
         * @member {Number} firstBatchSize=FIRST_BATCH_SIZE
         */
        firstBatchSize: FIRST_BATCH_SIZE,
        /**
         * Brief delay before emitting chunk 1 so the empty grid frame renders cleanly before rows arrive.
         * @member {Number} initialDelay=45
         */
        initialDelay: 45,
        /**
         * Total records to stream per load.
         * @member {Number} totalRows=TOTAL_ROWS
         */
        totalRows: TOTAL_ROWS
    }

    /**
     * @member {Function|null} #cancelActive=null
     * @private
     */
    #cancelActive = null

    /**
     * @summary Aborts any active chunk stream cleanly so `StreamParser` resolves as aborted.
     */
    abort() {
        this.#cancelActive?.();
        this.#cancelActive = null
    }

    /**
     * @summary Cancels any running stream timer before destroying this connection.
     * @param {...*} args
     */
    destroy(...args) {
        this.abort();
        super.destroy(...args)
    }

    /**
     * @summary Creates a fresh `ReadableStream` of deterministic NDJSON batches for {@link Neo.data.parser.Stream}.
     * @returns {Promise<{stream: ReadableStream<Uint8Array>, total: Number}>}
     */
    async read() {
        this.abort();

        const
            me      = this,
            encoder = new TextEncoder(),
            random  = createSeededRandom(SEED);

        let activeController = null,
            aborted          = false,
            cursor           = 0,
            resolvePull      = null,
            timerId          = null;

        const createAbortError = () => {
            const error = new Error('Stream aborted');
            error.name  = 'AbortError';
            return error
        };

        const cancelStream = shouldError => {
            aborted = true;

            if (timerId !== null) {
                clearTimeout(timerId);
                timerId = null
            }

            if (shouldError && activeController) {
                try {
                    activeController.error(createAbortError())
                } catch {}
            }

            activeController = null;

            if (resolvePull) {
                const resolve = resolvePull;
                resolvePull   = null;
                resolve()
            }
        };

        me.#cancelActive = () => cancelStream(true);

        const stream = new ReadableStream({
            pull(controller) {
                activeController = controller;

                if (aborted) {
                    activeController = null;
                    controller.error(createAbortError());
                    return
                }

                const enqueueBatch = () => {
                    timerId = null;

                    if (aborted) {
                        activeController = null;
                        controller.error(createAbortError());
                        return
                    }

                    const
                        size  = cursor === 0 ? me.firstBatchSize : me.batchSize,
                        end   = Math.min(me.totalRows, cursor + size),
                        lines = [];

                    for (; cursor < end; cursor++) {
                        lines.push(buildSettlementLine(cursor, random))
                    }

                    controller.enqueue(encoder.encode(lines.join('')));

                    if (cursor >= me.totalRows) {
                        activeController = null;
                        me.#cancelActive = null;
                        controller.close()
                    }
                };

                const delay = cursor === 0 ? me.initialDelay : me.chunkDelay;

                if (delay <= 0) {
                    enqueueBatch()
                } else {
                    return new Promise(resolve => {
                        resolvePull = resolve;
                        timerId     = setTimeout(() => {
                            resolvePull = null;
                            enqueueBatch();
                            resolve()
                        }, delay)
                    })
                }
            },
            cancel() {
                cancelStream(false)
            }
        });

        return {
            stream,
            total: me.totalRows * APPROX_BYTES_PER_ROW
        }
    }
}

export default Neo.setupClass(StreamConnection);
