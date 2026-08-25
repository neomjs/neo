import ChipComponent from '../../../../../src/component/Chip.mjs';

/**
 * One selected-recipient chip inside {@link AgentOS.view.fleet.mailbox.RecipientChipList}.
 *
 * @summary A framework chip whose engine-owned native close button carries an action-specific
 * accessible name — "Remove <recipient>", never just the recipient.
 *
 * `component.Chip` owns the button anatomy, keyboard activation, and reactive `removeLabel`.
 * This app subclass now contributes only recipient identity and disables per-instance DOM
 * handling because the owning list delegates one listener for all projected chips.
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
         * The list owns ONE delegated close-click listener for every chip.
         * @member {Boolean} useDomListeners=false
         */
        useDomListeners: false
    }
}

export default Neo.setupClass(RecipientChip);
