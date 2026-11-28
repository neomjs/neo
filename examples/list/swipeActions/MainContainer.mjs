import Buffered      from '../../../src/list/Buffered.mjs';
import Label         from '../../../src/component/Label.mjs';
import PooledRow     from './PooledRow.mjs';
import SwipeActions  from '../../../src/list/plugin/SwipeActions.mjs';
import ThemeSwitcher from '../../../src/button/ThemeSwitcher.mjs';
import Toolbar       from '../../../src/toolbar/Base.mjs';
import Viewport      from '../../../src/container/Viewport.mjs';

/**
 * @summary A phone-sized reading queue with record-bound archive and Undo over recycled rows.
 * @class Neo.examples.list.swipeActions.MainContainer
 * @extends Neo.container.Viewport
 */
class MainContainer extends Viewport {
    static config = {
        /** @member {String} className='Neo.examples.list.swipeActions.MainContainer' */
        className: 'Neo.examples.list.swipeActions.MainContainer',
        /** @member {Object[]} items The reading queue toolbar, item count, and list. */
        items: [{
            module: Toolbar,
            cls   : ['neo-swipe-example-toolbar'],
            flex  : 'none',
            items : [{
                module: Label,
                cls   : ['neo-swipe-example-title'],
                text  : 'Reading queue'
            }, '->', {module: ThemeSwitcher, ui: 'secondary'}]
        }, {
            module   : Label,
            cls      : ['neo-swipe-example-count'],
            flex     : 'none',
            id       : 'swipe-count',
            reference: 'count',
            role     : 'status',
            text     : '500 items'
        }, {
            module          : Buffered,
            cls             : ['neo-swipe-example-feed'],
            disableSelection: true,
            flex            : 1,
            id              : 'swipe-feed',
            itemConfig      : {module: PooledRow},
            itemHeight      : 58,
            reference       : 'feed',
            store           : {
                data       : Array.from({length: 500}, (_, index) => ({
                    id   : String(index + 1),
                    title: `Reading item ${index + 1}`
                })),
                keyProperty: 'id',
                model      : {fields: [{name: 'id', type: 'String'}, {name: 'title', type: 'String'}]}
            },
            plugins      : [{module: SwipeActions}],
            useInternalId: false
        }],
        /**
         * @member {Object} layout={ntype:'vbox',align:'stretch'}
         */
        layout: {ntype: 'vbox', align: 'stretch'}
    }

    /** @member {Neo.examples.list.swipeActions.PooledRow|null} previewRow=null */
    previewRow = null

    /** @summary Connects the plugin's validated reveal to this view's row presentation. */
    onConstructed() {
        super.onConstructed();

        const feed   = this.getReference('feed'),
              plugin = feed.getPlugin('plugin-list-swipe-actions');

        plugin.action = context => this.archive(context);
        this.observeConfig(plugin, 'slotId', () => this.showPreview());
        this.observeConfig(plugin, 'distance', () => this.showPreview())
    }

    /**
     * @summary Archives the given record and returns a stable Undo receipt independent of the pool.
     * @param {Object} context
     * @returns {Object}
     */
    archive({key, record, store}) {
        const data   = {id: key, title: record.title},
              index  = store.indexOf(record),
              before = index > 0 ? store.getAt(index - 1)?.id : null,
              after  = store.getAt(index + 1)?.id;

        store.remove(key);
        this.refreshCount();

        return {
            message: `Archived ${data.title}`,
            undo   : () => {
                if (store.isDestroyed || store.get(key)) return;

                const next      = after == null ? null : store.get(after),
                      previous  = before == null ? null : store.get(before),
                      insertion = next ? store.indexOf(next) :
                          previous ? store.indexOf(previous) + 1 : Math.min(index, store.getCount());

                store.insert(insertion, data);
                this.refreshCount()
            }
        }
    }

    /** @summary Reports the current Store count after archive or Undo. */
    refreshCount() {
        if (!this.isDestroyed) {
            const count = this.getReference('feed').store.getCount();
            this.getReference('count').text = `${count} ${count === 1 ? 'item' : 'items'}`
        }
    }

    /** @summary Shifts only the pooled component validated for the current action. */
    showPreview() {
        const feed               = this.getReference('feed'),
              {slotId, distance} = feed.getPlugin('plugin-list-swipe-actions'),
              row                = slotId && feed.items?.find((_item, index) => feed.getSlotId(index) === slotId);

        if (this.previewRow && this.previewRow !== row && !this.previewRow.isDestroyed) {
            this.previewRow.setReveal(0)
        }

        row?.setReveal(distance);
        this.previewRow = row || null
    }
}

export default Neo.setupClass(MainContainer);
