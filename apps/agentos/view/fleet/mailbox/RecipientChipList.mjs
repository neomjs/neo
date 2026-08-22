import ChipList      from '../../../../../src/list/Chip.mjs';
import RecipientChip from './RecipientChip.mjs';

/**
 * The selected-recipient chip row of {@link AgentOS.view.fleet.mailbox.ComposeForm} — a
 * Store-backed PROJECTION of the picker's roster, never a hand-mapped snapshot of it.
 *
 * @summary Renders the current recipient selection as removable chips over the picker's OWN
 * Store instance — the same records, rendered a second way, copied nowhere.
 *
 * **Why a projection.** The one selection truth is the picker list's Store + selection model. A
 * chip row built by mapping selected records into component configs would be a second, frozen
 * copy: replace or rename a roster record after selecting it and the copy keeps the old name —
 * silently. Here the owning form hands this list the picker's Store instance itself
 * (`autoDestroyStore:false` — shared, never owned, the same contract the fleet's menu lists use)
 * and the selection arrives as {@link #selectedIds}: `createItems` renders exactly the records
 * whose ids are selected, reading every field LIVE from the shared record set. A roster rename
 * converges on the next render; a removed record simply has nothing left to render from.
 *
 * A roster replacement reaches the Store as a `mutate`, which `list.Base` does not re-render on
 * (it listens for filter/load/recordChange only) — so this class re-creates its items on the
 * Store's own `mutate` and closes that seam.
 *
 * Chip removal is delegated: one list-level DOM listener on the chips' native close buttons fires
 * `removerecipient` with the chip's recipient id — the owning form routes it through the selection
 * model, so the row un-highlights in the picker and this projection follows via `selectedIds`.
 *
 * @class AgentOS.view.fleet.mailbox.RecipientChipList
 * @extends Neo.list.Chip
 */
class RecipientChipList extends ChipList {
    static config = {
        /**
         * @member {String} className='AgentOS.view.fleet.mailbox.RecipientChipList'
         * @protected
         */
        className: 'AgentOS.view.fleet.mailbox.RecipientChipList',
        /**
         * @member {String} ntype='fm-recipient-chip-list'
         * @protected
         */
        ntype: 'fm-recipient-chip-list',
        /**
         * The Store is the picker's own instance — shared, never owned: destroying this
         * projection must never destroy the roster.
         * @member {Boolean} autoDestroyStore=false
         */
        autoDestroyStore: false,
        /**
         * The selected recipient ids this projection renders — written by the owning form from
         * the settled selection. The ids select WHICH shared records render; every rendered field
         * still reads live from the Store's record set.
         * @member {String[]} selectedIds_=[]
         * @reactive
         */
        selectedIds_: [],
        /**
         * @member {String[]} cls=['fm-compose-recipient-chips']
         * @reactive
         */
        cls: ['fm-compose-recipient-chips'],
        /**
         * The chips are affordances, not selectable rows — the SELECTION truth lives in the
         * picker list this row projects.
         * @member {Boolean} disableSelection=true
         */
        disableSelection: true,
        /**
         * @member {Object} itemDefaults
         */
        itemDefaults: {
            module : RecipientChip,
            cls    : ['fm-chip', 'fm-compose-recipient-chip'],
            iconCls: null
        },
        /**
         * Chips flow inline inside the wrapping row instead of stacking full-width.
         * @member {Boolean} stacked=false
         * @reactive
         */
        stacked: false
    }

    /**
     * @summary One delegated close-click listener for every chip — the component-in-list contract
     * (`component.Chip` ships its per-instance listener off in lists).
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        this.addDomListeners({
            click   : this.onChipCloseClick,
            delegate: 'neo-chip-close-button',
            scope   : this
        })
    }

    /**
     * @summary Keeps the projection rendering on source-forwarded Store mutations —
     * `list.Base` itself only re-renders on filter/load/recordChange, so a roster replacement
     * arriving through the source binding (a `mutate`) must re-create the chip items here.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @protected
     */
    afterSetStore(value, oldValue) {
        super.afterSetStore(value, oldValue);

        oldValue?.un('mutate', this.onStoreMutate, this);
        value?.on('mutate', this.onStoreMutate, this)
    }

    /**
     * @summary Feeds each recycled chip its record identity: the recipient id the delegated
     * close-click reports, and the action-specific accessible name of its close button.
     * @param {Object} record
     * @param {Number} index
     * @returns {Object[]}
     */
    createItemContent(record, index) {
        let me     = this,
            result = super.createItemContent(record, index),
            chip   = me.items[index];

        chip.recipientId = record.id;
        chip.removeLabel = `Remove ${record[me.displayField]}`;

        return result
    }

    /**
     * Triggered after the selectedIds config got changed — re-render the projection over the
     * shared records. The construct-time pass is skipped: the initial render belongs to the
     * Store assignment.
     * @param {String[]} value
     * @param {String[]} oldValue
     * @protected
     */
    afterSetSelectedIds(value, oldValue) {
        oldValue !== undefined && this.store && this.createItems()
    }

    /**
     * @summary Renders exactly the SELECTED subset of the shared Store's records. Also trims the
     * recycled component pool: component lists reuse item instances by index and never shrink the
     * pool — fine for the vdom, but a contracted selection would keep stale chips alive, still
     * registered and still carrying old recipient ids.
     * @param {Boolean} silent=false
     */
    createItems(silent=false) {
        let me       = this,
            vdom     = me.getVdomRoot(),
            selected = me.selectedIds || [],
            records  = me.store?.items.filter(record => selected.includes(record.id)) || [],
            listItem;

        vdom.cn = [];

        records.forEach((record, index) => {
            listItem = me.createItem(record, index);
            listItem && vdom.cn.push(listItem)
        });

        while (me.items?.length > records.length) {
            me.items.pop().destroy()
        }

        !silent && me.promiseUpdate().then(() => {
            me.fire('createItems')
        })
    }

    /**
     * @summary The delegated close-click: resolve the chip component from the event path and
     * report WHICH recipient wants removing — the owning form routes it through the one
     * selection truth; this projection never mutates state itself.
     * @param {Object} data
     * @protected
     */
    onChipCloseClick(data) {
        let chipNode = data.path.find(node => node.cls?.includes('neo-chip')),
            chip     = chipNode && Neo.getComponent(chipNode.id);

        chip?.recipientId && this.fire('removerecipient', {recipientId: chip.recipientId, source: this})
    }

    /**
     * @summary Source-forwarded Store mutation — re-create the chip items so renames and removals
     * arriving from the roster converge into the rendered row.
     * @protected
     */
    onStoreMutate() {
        this.createItems()
    }

    /**
     * @summary Detaches the mutate listener; the source Store belongs to the picker and survives.
     * @param {...*} args
     */
    destroy(...args) {
        this.store?.un('mutate', this.onStoreMutate, this);
        super.destroy(...args)
    }
}

export default Neo.setupClass(RecipientChipList);
