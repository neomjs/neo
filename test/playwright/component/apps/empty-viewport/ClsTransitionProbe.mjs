import Component from '../../../../../src/component/Base.mjs';
import NeoArray  from '../../../../../src/util/Array.mjs';

/**
 * @class Test.Playwright.Component.EmptyViewport.ClsTransitionProbe
 * @extends Neo.component.Base
 * @summary Performs one class transition two ways, so the DOM cost of each can be compared.
 *
 * A class swap can be expressed as a single aggregate `cls` write — read the whole array, transform
 * it, assign it back — or as `removeCls()` followed by `addCls()`, which writes once per class.
 * Every `cls` write ends in `update()`, so the two forms request a different number of updates for
 * the same visual result.
 *
 * Whether that difference reaches the DOM cannot be settled by reading either implementation. Both
 * arms have to drive the real update pipeline from the same starting classes, in the same worker
 * tick, and be watched from the DOM side. `writeMode` selects the arm and setting `probeTheme` runs
 * the transition; both branches live in one class so that the number of writes is the only thing
 * separating them.
 */
class ClsTransitionProbe extends Component {
    static config = {
        className: 'Test.Playwright.Component.EmptyViewport.ClsTransitionProbe',
        ntype    : 'cls-transition-probe',
        /**
         * The theme class this probe currently carries. Changing it runs one transition.
         * @member {String|null} probeTheme_=null
         * @reactive
         */
        probeTheme_: null,
        /**
         * `'aggregate'` reads the whole `cls`, transforms it and writes once. `'api'` calls
         * `removeCls()` then `addCls()`, writing once per class.
         * @member {String} writeMode='api'
         */
        writeMode: 'api'
    }

    /**
     * @summary Swaps the carried theme class, preserving every unrelated class.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetProbeTheme(value, oldValue) {
        if (!value) {
            return
        }

        let me = this;

        if (me.writeMode === 'aggregate') {
            let {cls} = me;

            oldValue && NeoArray.remove(cls, oldValue);
            NeoArray.add(cls, value);

            me.cls = cls
        } else {
            oldValue && me.removeCls(oldValue);
            me.addCls(value)
        }
    }
}

export default Neo.setupClass(ClsTransitionProbe);
