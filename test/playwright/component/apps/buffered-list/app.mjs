import Buffered  from '../../../../../src/list/Buffered.mjs';
import Component from '../../../../../src/component/Base.mjs';
import Store     from '../../../../../src/data/Store.mjs';
import Viewport  from '../../../../../src/container/Viewport.mjs';

/**
 * Monotonic construction counter. See {@link PooledRow#instanceTag}.
 * @member {Number} instanceSequence
 */
let instanceSequence = 0;

/**
 * @summary One pooled row. Recycled by the list, never one instance per record.
 * @class Neo.BufferedListTestApp.PooledRow
 * @extends Neo.component.Base
 */
class PooledRow extends Component {
    static config = {
        className: 'Neo.BufferedListTestApp.PooledRow',
        record_  : null
    }

    /**
     * @summary A per-INSTANCE identity, because every id on this surface is per-SLOT.
     *
     * The list assigns slot ids as `…__slot-N` and the nested component renders as `…__N__component`,
     * both derived from the pool index — so both stay byte-identical across a destroy/recreate and
     * cannot witness whether an instance survived. `data-record-id` answers *which record* a slot shows,
     * which is a different question: it proves the window re-pointed, not that the pool was retained.
     *
     * Pool retention is the entire point of a bounded list, so it needs an oracle that can actually
     * fail. This counter increments once per construction and never repeats, making "the same component
     * instance is still here" observable: unchanged tags mean retained instances, changed tags mean the
     * pool was rebuilt behind identical ids.
     * @member {Number|null} instanceTag=null
     */
    instanceTag = null

    construct(config) {
        super.construct(config);
        this.instanceTag = ++instanceSequence
    }

    afterSetRecord(value, oldValue) {
        this.text = value ? `Record ${value.id}` : ''
    }
}

PooledRow = Neo.setupClass(PooledRow);

/**
 * @summary A `Neo.list.Buffered` with a geometry chosen so a wheel witness can compute exact expectations.
 *
 * Every number here is load-bearing for **both** specs that mount this harness — `BufferedScrollAnchor`
 * (the scroll-anchoring regression) and `BufferedWheelFidelity` (the wheel-distance witness) — and none
 * of them is arbitrary:
 *
 * - `itemHeight: 40` — the mounted range is `Math.floor(scrollTop / itemHeight)`, so a round row height
 *   lets the spec state a boundary crossing as an exact pixel offset instead of approximating one.
 * - `height: 400` → `availableRows` 10, and with `bufferRowRange: 3` a pool of 16 rows. Both are small
 *   enough to assert the whole pool identity, which is what proves a scroll did NOT recycle.
 * - `recordCount: 5000` → a 200,000px scroll range, far beyond any single wheel gesture, so the witness
 *   never accidentally clamps at an edge and reads the clamp as fidelity.
 * - `bufferRowRange: 3` is the shipped default. A witness that tuned it would be testing a configuration
 *   nobody runs.
 *
 * The list is the viewport's only child so nothing else can claim the wheel event or the scroll seat.
 * Native scrolling stays physical authority — the app deliberately registers no wheel handling, because
 * what is under test is whether the App Worker perturbs a scroll the browser has ALREADY performed,
 * not how the gesture is intercepted. Adding a handler here would replace the subject with a stub.
 */
const
    itemHeight  = 40,
    recordCount = 5000;

export const onStart = () => Neo.app({
    mainView: {
        module: Viewport,
        id    : 'buffered-list-test-viewport',
        items : [{
            module        : Buffered,
            bufferRowRange: 3,
            height        : 400,
            id            : 'buffered-list-under-test',
            itemConfig    : ({record}) => ({module: PooledRow, record}),
            itemHeight,
            store         : {
                module     : Store,
                keyProperty: 'id',
                data       : Array.from({length: recordCount}, (_, id) => ({id, name: `Record ${id}`})),
                model      : {
                    fields: [
                        {name: 'id',   type: 'Integer'},
                        {name: 'name', type: 'String'}
                    ]
                }
            },
            width: 300
        }]
    },
    name: 'BufferedListTestApp'
});
