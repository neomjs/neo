import ChipComponent from '../../../../../src/component/Chip.mjs';

/**
 * One selected-recipient chip inside {@link AgentOS.view.fleet.mailbox.RecipientChipList}.
 *
 * @summary A framework chip whose close affordance is a REAL `<button>` carrying an
 * action-specific accessible name — "Remove <recipient>", never just the recipient.
 *
 * The stock chip's close node is a decorated span: visually fine, but invisible to the
 * accessibility tree as an ACTION and unreachable by keyboard. This chip swaps that node for a
 * native button (focusable, Enter/Space-activatable for free) and binds its `aria-label` through
 * {@link #removeLabel}, so assistive users hear the verb, not only the noun. Click handling stays
 * OFF per instance (`useDomListeners:false`) — the owning list delegates one listener for all
 * chips, the component-in-list contract `component.Chip` documents.
 *
 * @class AgentOS.view.fleet.mailbox.RecipientChip
 * @extends Neo.component.Chip
 */
class RecipientChip extends ChipComponent {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.mailbox.RecipientChip'
         * @protected
         */
        className: 'AgentOS.view.fleet.mailbox.RecipientChip',
        /**
         * @member {String} ntype='fm-recipient-chip'
         * @protected
         */
        ntype: 'fm-recipient-chip',
        /**
         * The canonical id of the recipient this chip represents — carried on the chip so the
         * owning list's delegated close-click can name WHICH recipient to remove.
         * @member {String|null} recipientId=null
         */
        recipientId: null,
        /**
         * The close button's accessible name — the ACTION ("Remove Ada"), set per record by the
         * owning list so every chip announces its own removal verb.
         * @member {String|null} removeLabel_=null
         * @reactive
         */
        removeLabel_: null,
        /**
         * The list owns ONE delegated close-click listener for every chip.
         * @member {Boolean} useDomListeners=false
         */
        useDomListeners: false,
        /**
         * Same anatomy slots as the stock chip, with the close affordance as a native button:
         * keyboard activation and focus come from the platform, not from re-implemented key handling.
         * @member {Object} _vdom
         */
        _vdom:
        {tabIndex: -1, cn: [
            {tag: 'span', cls: ['neo-chip-glyph']},
            {tag: 'span', cls: ['neo-chip-text']},
            {tag: 'button', type: 'button', cls: ['neo-chip-close-button', 'far', 'fa-times-circle']}
        ]}
    }

    /**
     * Triggered after the removeLabel config got changed — the close button's accessible name.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetRemoveLabel(value, oldValue) {
        this.vdom.cn[2]['aria-label'] = value;
        this.update()
    }
}

export default Neo.setupClass(RecipientChip);
