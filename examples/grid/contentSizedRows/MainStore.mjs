import Model                from './MainModel.mjs';
import Store                from '../../../src/data/Store.mjs';
import {createSeededRandom} from '../../../src/util/Random.mjs';

const
    COUNTRIES = ['Brazil', 'Canada', 'Germany', 'India', 'Japan', 'Kenya', 'Mexico', 'Norway', 'Spain', 'Vietnam'],
    NOTES     = [
        'Verified in staging.',
        'Awaiting design team approval.',
        'Backported to release branch v13.4.',
        'Customer confirmed resolution on Chrome.',
        'Blocked pending upstream browser fix.',
        'Patched in worker layer; monitoring production telemetry for anomalies.'
    ],
    OWNERS   = ['Ada', 'Clio', 'Emmy', 'Euclid', 'Fable', 'Grace', 'Sophie', 'Vega'],
    STATUSES = ['Draft', 'Review', 'Approved', 'Shipped', 'Archived'],
    TOPICS   = [
        // 1. Virtual Scroll
        {
            scenarios: [
                {
                    title    : 'Virtual scroll offset drift on high DPI displays',
                    summaries: [
                        // Tier 0 (~60-80 chars)
                        'Virtual scroll calculations drift slightly during fast navigation sequences.',
                        // Tier 1 (~130-160 chars)
                        'Virtual scroll calculations drift slightly during fast navigation sequences. Users observe momentary blank bands when scrolling through dense data collections.',
                        // Tier 2 (~200-260 chars)
                        'Virtual scroll calculations drift slightly during fast navigation sequences. Users observe momentary blank bands when scrolling through dense data collections. Diagnostics traced this to accumulated subpixel rounding differences across animation frames.'
                    ],
                    details: [
                        // Tier 0 (~80-100 chars)
                        'Reproduction verified on Chromium 128 during momentum wheel scrolling across virtual rows.',
                        // Tier 1 (~170-200 chars)
                        'Steps to reproduce: enable high-density scaling and fling-scroll past row 4,000. Frame analysis indicates that buffer row repositioning missed one composition cycle during momentum deceleration.',
                        // Tier 2 (~260-310 chars)
                        'To reproduce, open the diagnostics console and fling-scroll through dense row collections. Observe frame rate degradation during rapid navigation sequences.\n\nProfiling revealed subpixel scroll delta rounding errors accumulate across animation frames. Normalizing delta thresholds eliminated the jitter.'
                    ]
                },
                {
                    title    : 'Smooth wheel scrolling jitter during row recycling',
                    summaries: [
                        'Touch wheel scrolling exhibits brief subpixel jitter on high-density displays.',
                        'Touch wheel scrolling exhibits brief subpixel jitter on high-density displays. The row buffer occasionally lags behind rapid momentum touch fling interactions.',
                        'Touch wheel scrolling exhibits brief subpixel jitter on high-density displays. The row buffer occasionally lags behind rapid momentum touch fling interactions. Normalizing delta thresholds with the compositor clock eliminates the visual jitter.'
                    ],
                    details: [
                        'Initial profiler traces confirm subpixel scroll delta rounding discrepancies under high DPI.',
                        'Root cause analysis identified cumulative rounding errors in the scroll translation matrix. Disabling fractional pixel clamping stabilizes virtual row recycling during rapid deceleration.',
                        'Detailed analysis showed virtual row recycling listeners dropped frame budgets during rapid scroll velocity changes.\n\nThe architectural solution introduces batched layout updates coordinated through requestAnimationFrame, achieving consistent sixty frames per second.'
                    ]
                }
            ]
        },
        // 2. Worker Threads
        {
            scenarios: [
                {
                    title    : 'Worker message serialization overhead in large stores',
                    summaries: [
                        'Worker communication experiences queuing latency when processing large batch mutations.',
                        'Worker communication experiences queuing latency when processing large batch mutations. High transaction rates cause delayed visual responses on main thread inputs.',
                        'Worker communication experiences queuing latency when processing large batch mutations. High transaction rates cause delayed visual responses on main thread inputs. Profiling shows excessive structural cloning overhead during JSON serialization.'
                    ],
                    details: [
                        'Worker message queue depth increases steadily under sustained multi-thread data traffic.',
                        'Steps to reproduce: stream five hundred updates per second into the store. Memory heap snapshots reveal that serialized message envelopes accumulate faster than the worker dispatcher consumes them.',
                        'To reproduce, simulate concurrent store updates while dragging grid column headers. Observe input latency spikes as worker postMessage queues back up.\n\nProfiling confirmed message envelopes created garbage collection pauses. Introducing transferable array buffers resolved the queue congestion.'
                    ]
                },
                {
                    title    : 'Worker thread postMessage queue congestion under burst updates',
                    summaries: [
                        'Cross-thread messaging queues fill rapidly during bulk record insertions.',
                        'Cross-thread messaging queues fill during bulk record insertions. The application worker and vdom worker experience momentary reconciliation lags.',
                        'Cross-thread messaging queues fill during bulk record insertions. The application worker and vdom worker experience momentary reconciliation lags. Implementing compact array transfers reduced message payload latency by thirty percent.'
                    ],
                    details: [
                        'Profiler logs capture postMessage structured clone serialization overhead exceeding four milliseconds.',
                        'Root cause traced to JSON serialization bottlenecks when broadcasting row mutations. Converting record delta packets to flat transfer arrays eliminated serialization lag across threads.',
                        'Detailed thread profiling showed asynchronous state reconciliation delayed UI updates during peak throughput.\n\nThe architectural fix batches cross-thread transactions into discrete tick intervals, restoring immediate responsiveness.'
                    ]
                }
            ]
        },
        // 3. Memory Management
        {
            scenarios: [
                {
                    title    : 'Detached DOM node retention in recycled table rows',
                    summaries: [
                        'Memory allocation grows steadily across repeated store data reloads.',
                        'Memory allocation grows steadily across repeated store data reloads. Extended sessions exhibit sluggish input response caused by periodic garbage collection pauses.',
                        'Memory allocation grows steadily across repeated store data reloads. Extended sessions exhibit sluggish input response caused by periodic garbage collection pauses. Heap inspection revealed unreleased listeners retaining detached vnodes.'
                    ],
                    details: [
                        'Heap snapshots capture retained detached cell vnodes following multiple clear and add cycles.',
                        'Steps to reproduce: reload the 10,000-row store five times in succession. Memory allocations rise by thirty megabytes per cycle because detached row containers retain bound event scopes.',
                        'To reproduce, execute continuous scroll benchmarks for ten minutes while capturing heap allocations. Observe steadily climbing heap utilization without corresponding garbage collection releases.\n\nAudit revealed unreleased listeners retaining detached vnode trees. Explicitly disconnecting node references during row disposal stabilizes memory utilization.'
                    ]
                },
                {
                    title    : 'Excessive garbage collection pause during continuous scrolling',
                    summaries: [
                        'Garbage collection cycles cause brief frame stutters during extended grid sessions.',
                        'Garbage collection cycles cause brief frame stutters during extended grid sessions. Detached cell elements remain referenced in internal event subscriber registries.',
                        'Garbage collection cycles cause brief frame stutters during extended grid sessions. Detached cell elements remain referenced in internal event subscriber registries. Explicitly unbinding listener delegates during row disposal stabilizes memory utilization.'
                    ],
                    details: [
                        'Allocated memory fails to return to baseline after unmounting large table viewports.',
                        'Root cause identified as circular references between cell model wrappers and DOM node listeners. Cleansing listener maps on row recycling allows the garbage collector to reclaim obsolete instances.',
                        'Detailed memory inspection identified retained component instances in the internal registry following grid destroy.\n\nThe fix introduces WeakRef caching for cell models, ensuring zero memory retention across extended operational runs.'
                    ]
                }
            ]
        },
        // 4. Rendering Engine
        {
            scenarios: [
                {
                    title    : 'Subtree layout thrashing during column resize operations',
                    summaries: [
                        'Dynamic column resizing triggers redundant layout calculations across locked grid bodies.',
                        'Dynamic column resizing triggers redundant layout calculations across locked grid bodies. Column header dragging feels sluggish when table rows contain complex multi-line text.',
                        'Dynamic column resizing triggers redundant layout calculations across locked grid bodies. Column header dragging feels sluggish when table rows contain complex multi-line text. Investigation indicated that getLayoutRect calls were not properly batched.'
                    ],
                    details: [
                        'Performance traces confirm layout thrashing when getLayoutRect is invoked on consecutive column updates.',
                        'Steps to reproduce: resize the summary column by dragging its right handle. The browser triggers reflow passes on every mousemove event because cell text bounding boxes are queried synchronously.',
                        'To reproduce, resize locked start columns repeatedly while observing DevTools rendering metrics. Notice repeated recalculate-style and layout events on every frame.\n\nProfiling confirmed synchronous DOM reads created severe layout thrashing. Coalescing measurement requests into batched animation frame passes eliminated all reflow delays.'
                    ]
                },
                {
                    title    : 'Content-sized row measurement invalidation timing issue',
                    summaries: [
                        'Column header resizing causes momentary visual stutter in content-sized row modes.',
                        'Column header resizing causes momentary visual stutter in content-sized row modes. The measurement pool recalculates unmounted cell dimensions prematurely during drag motions.',
                        'Column header resizing causes momentary visual stutter in content-sized row modes. The measurement pool recalculates unmounted cell dimensions prematurely during drag motions. Deferring measurement passes until mouseup stabilizes resize performance.'
                    ],
                    details: [
                        'Visual inspection shows intermediate repaint flashes during locked column width transitions.',
                        'Root cause analysis showed layout measurements were executed outside the scheduled requestAnimationFrame queue. Batching all cell geometry queries into a single read pass restores smooth resize interactions.',
                        'Detailed analysis revealed text wrapping calculations in locked grid bodies drifted by one pixel under subpixel column widths.\n\nThe resolution applies math rounding parity across locked and center view bodies, guaranteeing pixel-perfect border alignment.'
                    ]
                }
            ]
        },
        // 5. State Store
        {
            scenarios: [
                {
                    title    : 'Store filter index corruption on concurrent edits',
                    summaries: [
                        'Store filter indexes lose synchronization when records are updated during active filtering.',
                        'Store filter indexes lose synchronization when records are updated during active filtering. Filtered views occasionally display mismatched rows after rapid successive search queries.',
                        'Store filter indexes lose synchronization when records are updated during active filtering. Filtered views occasionally display mismatched rows after rapid successive search queries. The root cause was identified as stale item index caching.'
                    ],
                    details: [
                        'Store filter cache reflects stale row positions after rapid successive keystrokes in search fields.',
                        'Steps to reproduce: apply a summary filter while concurrently dispatching record updates. The filtered item collection drops row references because index updates bypass transaction locks.',
                        'To reproduce, filter the 10,000-record dataset by a common term and immediately edit the first result. Observe that subsequent clear-filter operations fail to restore the original row sequence.\n\nInvestigation traced the defect to stale index pointers. Introducing transactional mutation locks guarantees consistent store state during concurrent filter modifications.'
                    ]
                },
                {
                    title    : 'Sort comparator instability with localized unicode strings',
                    summaries: [
                        'Record sorting with localized unicode strings produces inconsistent order across worker engines.',
                        'Record sorting with localized unicode characters produces inconsistent order across worker engines. Collection indexes drift when concurrent edits arrive during an active sort.',
                        'Record sorting with localized unicode characters produces inconsistent order across worker engines. Collection indexes drift when concurrent edits arrive during an active sort. Introducing atomic transaction markers ensures consistent filter state across all grid views.'
                    ],
                    details: [
                        'Record index lookups return null when queried during active asynchronous sorting.',
                        'Root cause found in asynchronous collection splice operations where internal index maps were not recalculated until after listener notification. Inverting the sequence resolved the index corruption.',
                        'Detailed inspection revealed unicode collation differences between V8 instances when sorting accented strings.\n\nThe fix establishes an Intl.Collator singleton with pinned locale parameters, guaranteeing identical sort results across all worker threads.'
                    ]
                }
            ]
        },
        // 6. Accessibility
        {
            scenarios: [
                {
                    title    : 'Keyboard focus ring clipping on horizontal scroll boundaries',
                    summaries: [
                        'Keyboard focus indicators clip at the boundary between locked and center grid columns.',
                        'Keyboard focus indicators clip at the boundary between locked and center grid columns. Assistive technologies fail to announce active cell positions when navigating between split bodies.',
                        'Keyboard focus indicators clip at the boundary between locked and center grid columns. Assistive technologies fail to announce active cell positions when navigating between split bodies. Audit results showed missing aria-rowindex attributes on recycled elements.'
                    ],
                    details: [
                        'Keyboard navigation tab orders loop unexpectedly when traversing from locked to unlocked columns.',
                        'Steps to reproduce: navigate the grid using NVDA or VoiceOver and press ArrowRight across locked column boundaries. The screen reader loses active cell context because focus delegates to an unmounted element.',
                        'Root cause identified as focus styles clipped by overflow:hidden on locked body containers. Refactoring focus rings to use CSS outline-offset resolved the boundary clipping issue.'
                    ]
                },
                {
                    title    : 'Screen reader navigation breakdown in locked grid columns',
                    summaries: [
                        'Screen readers omit column headers when navigating across virtualized split row bodies.',
                        'Screen readers omit column headers when navigating across virtualized split row bodies. Dynamic ARIA rowindex properties fail to update on reused row DOM elements.',
                        'Screen readers omit column headers when navigating across virtualized split row bodies. Dynamic ARIA rowindex properties fail to update on reused row DOM elements. Adding synchronized focus management and standardized ARIA markup restored full accessibility compliance.'
                    ],
                    details: [
                        'Axe accessibility audits report missing aria-rowcount attributes on virtual grid containers.',
                        'To reproduce, run automated accessibility test suites across virtualized grid tables. Notice that recycled DOM rows omit required aria-rowindex attributes after fast scrolling.\n\nAudit confirmed assistive tools lost row position context. Updating the row recycling pipeline to apply aria-rowindex dynamically restored WCAG 2.1 AA compliance.',
                        'Detailed testing in high contrast mode showed grid cell borders became invisible against dark backgrounds.\n\nThe resolution introduces system color keyword fallbacks for border tokens, ensuring crisp gridlines under all accessibility themes.'
                    ]
                }
            ]
        },
        // 7. Data Pipeline
        {
            scenarios: [
                {
                    title    : 'Streaming record ingest pipeline backpressure deadlock',
                    summaries: [
                        'The streaming ingest pipeline stalls when incoming data batches exceed worker buffer capacity.',
                        'The streaming ingest pipeline stalls when incoming data batches exceed worker buffer capacity. Real-time data feeds drop incremental updates during network latency spikes.',
                        'The streaming ingest pipeline stalls when incoming data batches exceed worker buffer capacity. Real-time data feeds drop incremental updates during network latency spikes. Investigation highlighted a deadlock between the buffer queue and socket listeners.'
                    ],
                    details: [
                        'Telemetry metrics show message buffer backpressure triggering socket connection resets.',
                        'Steps to reproduce: connect to high-throughput data socket and simulate fifty milliseconds network jitter. The stream consumer deadlocks because buffer drain events are suppressed while processing mutations.',
                        'To reproduce, simulate streaming data ingestion with thousand-item batches over high-latency connections. Observe memory spikes as unprocessed chunks accumulate in worker queues.\n\nRoot cause investigation confirmed socket deadlocks under peak throughput. Implementing reactive backpressure signals stabilized ingest pipelines across all connection qualities.'
                    ]
                },
                {
                    title    : 'Incremental data loader starvation under heavy client load',
                    summaries: [
                        'Incremental record loaders starve when client bandwidth drops below required thresholds.',
                        'Real-time telemetry feeds experience packet queue drops during burst network traffic. Incremental record loaders starve when client bandwidth drops below required thresholds.',
                        'Real-time telemetry feeds experience packet queue drops during burst network traffic. Incremental record loaders starve when client bandwidth drops below required thresholds. Configuring dynamic flow control thresholds resolved the bottleneck under extreme throughput.'
                    ],
                    details: [
                        'Decompression workers report sporadic checksum failures on chunked JSON payloads.',
                        'Root cause traced to unbuffered message queues in the network adapter worker. Implementing a sliding window buffer with flow control signals prevented socket starvation under burst load.',
                        'Detailed network traces revealed packet reassembly errors when processing compressed WebSocket frames.\n\nThe fix incorporates chunk boundary validation before decompression, ensuring resilient record ingestion under unstable network conditions.'
                    ]
                }
            ]
        },
        // 8. Component System
        {
            scenarios: [
                {
                    title    : 'Dynamic CSS class token collision between nested themes',
                    summaries: [
                        'Nested theme switching causes brief style bleed between parent and child components.',
                        'Nested theme switching causes brief style bleed between parent and child components. Custom UI widgets render incorrect typography tokens until a full page refresh occurs.',
                        'Nested theme switching causes brief style bleed between parent and child components. Custom UI widgets render incorrect typography tokens until a full page refresh occurs. The stylesheet manager failed to purge scoped class tokens on destruction.'
                    ],
                    details: [
                        'Theme token selectors bleed into child container elements during runtime theme transitions.',
                        'Steps to reproduce: switch between dark and light themes while a modal dialog is mounted. CSS variables for neutral surfaces fail to update in child components until inspected in DevTools.',
                        'To reproduce, mount nested container trees with differing theme configurations and trigger rapid remounts. Notice typography and color tokens clashing between nested components.\n\nAnalysis revealed stale stylesheet links were not unlinked upon view disposal. Purging obsolete theme style elements during destroy resolved the visual anomalies.'
                    ]
                },
                {
                    title    : 'Lifecycle hook execution sequence discrepancy on remount',
                    summaries: [
                        'Component lifecycle hooks execute in reverse order during rapid view transitions.',
                        'Component lifecycle hooks execute in reverse order during rapid view transitions. Destructors on unmounted child views execute after parent reconstruction completes.',
                        'Component lifecycle hooks execute in reverse order during rapid view transitions. Destructors on unmounted child views execute after parent reconstruction completes. Refactoring class scoping rules resolved the styling conflict across all supported themes.'
                    ],
                    details: [
                        'Component config descriptors show prototype pollution in deeply nested configuration trees.',
                        'Root cause identified as stylesheet manager caching compiled class selectors by component id rather than theme scope. Invalidating theme caches on theme switch resolved the token bleeding.',
                        'Detailed lifecycle trace auditing revealed construct hooks executing before base config resolution completed.\n\nThe architectural fix enforces strict top-down initialization order, guaranteeing predictable component state during complex tree mounts.'
                    ]
                }
            ]
        }
    ];

/**
 * @summary 10k deterministic records structured across eight software engineering issue topics: `title` and
 * `notes` in the locked bodies, `summary` in the center, and `details`, the tallest, in a center column that
 * starts past the horizontal range.
 *
 * Content is generated via a seeded pseudo-random generator where each record selects a coherent engineering
 * issue scenario across three deliberate length tiers. The scenario's title, progressive multi-sentence summary,
 * and diagnostic details all describe the same underlying defect. Every record establishes proportional row
 * heights that wrap to distinct line counts on desktop and mobile viewports without synthetic word arrays or
 * lorem ipsum.
 * @class Neo.examples.grid.contentSizedRows.MainStore
 * @extends Neo.data.Store
 */
class MainStore extends Store {
    static config = {
        /**
         * @member {String} className='Neo.examples.grid.contentSizedRows.MainStore'
         * @protected
         */
        className: 'Neo.examples.grid.contentSizedRows.MainStore',
        /**
         * @member {Number} amountRows_=10000
         * @reactive
         */
        amountRows_: 10000,
        /**
         * @member {Boolean} autoInitRecords=false
         */
        autoInitRecords: false,
        /**
         * Inactive until the filter field sets a value
         * @member {Object[]} filters
         * @reactive
         */
        filters: [{operator: 'like', property: 'summary', value: null}],
        /**
         * @member {Neo.data.Model} model=Model
         * @reactive
         */
        model: Model
    }

    /**
     * Triggered after the amountRows config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountRows(value, oldValue) {
        let me = this;

        // The unfiltered copy a first filter creates receives the items, it does not generate them
        if (me.preventDataGeneration) {
            return
        }

        me.items?.length > 0 && me.clear(false);

        // Raw items: the store creates a record when a row first needs it
        me.add(me.generateData(value), false)
    }

    /**
     * @param {Object} config
     * @returns {Neo.collection.Base}
     * @protected
     */
    createAllItems(config) {
        config.preventDataGeneration = true;
        return super.createAllItems(config)
    }

    /**
     * @param {Number} amountRows
     * @returns {Object[]}
     */
    generateData(amountRows) {
        let random  = createSeededRandom(19666),
            pick    = list => list[Math.floor(random() * list.length)],
            records = [],
            row     = 0;

        for (; row < amountRows; row++) {
            let topicIndex = Math.floor(random() * TOPICS.length),
                topic      = TOPICS[topicIndex],
                scenario   = pick(topic.scenarios),
                tier;

            // Deliberately establish 3 distinct row heights for the first three rows across both viewports
            if (row === 0) {
                tier = 0
            } else if (row === 1) {
                tier = 1
            } else if (row === 2) {
                tier = 2
            } else {
                tier = Math.floor(random() * 3)
            }

            records.push({
                country: pick(COUNTRIES),
                details: scenario.details[tier],
                id     : row + 1,
                notes  : pick(NOTES),
                owner  : pick(OWNERS),
                score  : Math.floor(random() * 100),
                status : pick(STATUSES),
                summary: scenario.summaries[tier],
                title  : scenario.title
            })
        }

        return records
    }
}

export default Neo.setupClass(MainStore);
