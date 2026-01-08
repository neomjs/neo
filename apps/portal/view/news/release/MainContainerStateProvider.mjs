import ContentSectionStore from '../../../store/ContentSections.mjs';
import ReleasesStore       from '../../../store/Releases.mjs';
import StateProvider       from '../../../../../src/state/Provider.mjs';

/**
 * @class Portal.view.news.release.MainContainerStateProvider
 * @extends Neo.state.Provider
 */
class MainContainerStateProvider extends StateProvider {
    static config = {
        /**
         * @member {String} className='Portal.view.news.release.MainContainerStateProvider'
         * @protected
         */
        className: 'Portal.view.news.release.MainContainerStateProvider',
        /**
         * @member {Object} data
         */
        data: {
            /**
             * @member {Number|null} data.countPages=null
             */
            countPages: null,
            /**
             * @member {Number|null} data.countPages=null
             */
            countSections: null,
            /**
             * The record which gets shown as the content page
             * @member {Object} data.currentRecord=null
             */
            currentPageRecord: null,
            /**
             * The record which gets shown as the content page
             * @member {Object} data.nextPageRecord=null
             */
            nextPageRecord: null,
            /**
             * The record which gets shown as the content page
             * @member {Object} data.previousPageRecord=null
             */
            previousPageRecord: null
        },
        /**
         * @member {Object} stores
         */
        stores: {
            sections: {
                module: ContentSectionStore
            },
            tree: {
                autoLoad: true,
                module  : ReleasesStore
            }
        }
    }

    /**
     * @param {String} key
     * @param {*} value
     * @param {*} oldValue
     */
    onDataPropertyChange(key, value, oldValue) {
        super.onDataPropertyChange(key, value, oldValue);

        let me = this;

        switch (key) {
            case 'countSections': {
                if (value < 1) {
                    me.component.getReference('page-sections-container')?.toggleCls('neo-expanded', false)
                }

                break
            }

            case 'currentPageRecord': {
                let {data}             = me,
                    {countPages}       = data,
                    store              = me.getStore('tree'),
                    index              = store.indexOf(value),
                    nextPageRecord     = null,
                    nextPageText       = null,
                    previousPageRecord = null,
                    previousPageText   = null,
                    i, record;

                // the logic assumes that the tree store is sorted
                for (i=index-1; i >= 0; i--) {
                    record = store.getAt(i);

                    if (record.isLeaf && !me.recordIsHidden(record, store)) {
                        previousPageRecord = record;
                        break
                    }
                }

                me.setData({previousPageText, previousPageRecord});

                // the logic assumes that the tree store is sorted
                for (i=index+1; i < countPages; i++) {
                    record = store.getAt(i);

                    if (record.isLeaf && !me.recordIsHidden(record, store)) {
                        nextPageRecord = record;
                        break
                    }
                }

                me.setData({nextPageText, nextPageRecord});

                me.component.getReference('sidenav-container')?.toggleCls('neo-expanded', false)

                break
            }
        }
    }

    /**
     * We need to check the parent-node chain inside the tree.
     * => Any hidden parent-node results in a hidden record.
     * @param {Object} record
     * @param {Neo.data.Store} store
     * @returns {Boolean}
     */
    recordIsHidden(record, store) {
        if (record.hidden) {
            return true
        }

        if (record.parentId !== null) {
            return this.recordIsHidden(store.get(record.parentId), store)
        }

        return false
    }
}

export default Neo.setupClass(MainContainerStateProvider);
