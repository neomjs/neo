import Base     from '../core/Base.mjs';
import NeoArray from '../util/Array.mjs';

const storeLoadingCleanup = Symbol('storeLoadingCleanup');

/**
 * @summary Shares automatic Store feedback between Gallery and Helix without owning their manual loading masks.
 * @class Neo.mixin.StoreLoading
 * @extends Neo.core.Base
 */
class StoreLoading extends Base {
    static config = {
        /**
         * @member {String} className='Neo.mixin.StoreLoading'
         * @protected
         */
        className: 'Neo.mixin.StoreLoading'
    }

    /**
     * @summary Rebinds request state and replays its current value; observeConfig only reports changes.
     * @param {Neo.data.Store|null} value
     * @protected
     */
    afterSetStore(value) {
        const me = this;

        me[storeLoadingCleanup]?.();
        me[storeLoadingCleanup] = value ? me.observeConfig(value, 'isLoadPending', () => me.syncStoreLoading()) : null;
        me.syncStoreLoading()
    }

    /**
     * @summary Keeps feedback current while hidden too, so revealing the component cannot expose a stale spinner.
     * Delivered rows retain a non-blocking corner indicator. The distinct node class preserves isLoading masks.
     * @protected
     */
    syncStoreLoading() {
        const me                 = this,
              {vdom, wrapperCls} = me,
              pending            = !!me.store?.isLoadPending,
              index              = vdom.cn.findIndex(node => node.cls?.includes('neo-store-load-mask'));

        if (!pending && index === -1) {
            return
        }

        if (pending && index === -1) {
            const mask = me.createLoadingMask(true);
            mask.cls = ['neo-store-load-mask'];
            vdom.cn.push(mask)
        } else if (!pending && index !== -1) {
            vdom.cn.splice(index, 1)
        }

        NeoArray.toggle(wrapperCls, 'neo-store-loading', pending);
        NeoArray.toggle(wrapperCls, 'neo-store-loading-with-items', pending && me.getItemsRoot().cn.length > 0);
        me.set({vdom, wrapperCls});
        me.changeVdomRootKey('aria-busy', pending ? 'true' : null)
    }
}

export default Neo.setupClass(StoreLoading);
