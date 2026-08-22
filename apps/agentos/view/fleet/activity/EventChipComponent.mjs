import Component              from '../../../../../src/component/Base.mjs';
import NeoArray               from '../../../../../src/util/Array.mjs';
import {kindClass, kindLabel} from '../../../util/kindRegistry.mjs';

/**
 * The event-kind chip: a small uppercase mono plate colored by event kind, composed by the
 * activity stream and the agent-detail feed. The kind vocabulary — color token + short label,
 * with the neutral unknown fallback — lives in {@link kindRegistry} (one owner), so this component
 * only renders; a growing kind set never forces a chip edit or a per-view edit.
 *
 * @class AgentOS.view.fleet.activity.EventChipComponent
 * @extends Neo.component.Base
 */
class EventChip extends Component {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.activity.EventChipComponent'
         * @protected
         */
        className: 'AgentOS.view.fleet.activity.EventChipComponent',
        /**
         * @member {String} ntype='fm-event-chip'
         * @protected
         */
        ntype: 'fm-event-chip',
        /**
         * @member {String[]} baseCls=['fm-event-chip']
         */
        baseCls: ['fm-event-chip'],
        /**
         * @member {String} tag='span'
         * @protected
         * @reactive
         */
        tag: 'span',
        /**
         * The event kind — e.g. `pr` · `a2a` · `review` · `alert` · `lane-claim` · `work-stall`
         * · `source-degraded` · `lifecycle-request`. Unknown kinds render neutral, never broken.
         * @member {String} kind_='a2a'
         * @reactive
         */
        kind_: 'a2a',
        /**
         * Optional label override. Defaults to the canonical short label for `kind`.
         * @member {String|null} label_=null
         * @reactive
         */
        label_: null
    }

    /**
     * Triggered after the kind config changed — swaps the kind class from the shared registry (the
     * class binds the `--fm-chip` color token in the chip SCSS — zero inline styles) and refreshes
     * the text (when no label override is set).
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetKind(value, oldValue) {
        let me  = this,
            cls = me.cls;

        oldValue !== undefined && NeoArray.remove(cls, kindClass(oldValue));
        NeoArray.add(cls, kindClass(value));
        me.cls = cls;

        me.updateChipText()
    }

    /**
     * Triggered after the label override changed — refreshes the text.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetLabel(value, oldValue) {
        this.updateChipText()
    }

    /**
     * The chip text is the label override, else the canonical short label for the kind.
     * @protected
     */
    updateChipText() {
        this.vdom.text = this.label ?? kindLabel(this.kind);
        this.update()
    }
}

export default Neo.setupClass(EventChip);
