import TreeList from '../../../../src/tree/List.mjs';
import NeoArray from '../../../../src/util/Array.mjs';

/**
 * @summary Selects the class and mixin sources contributing members to a Docs class view.
 * @class Docs.view.classdetails.HierarchyTreeList
 * @extends Neo.tree.List
 */
class HierarchyTreeList extends TreeList {
    static config = {
        /**
         * @member {String} className='Docs.view.classdetails.HierarchyTreeList'
         * @protected
         */
        className: 'Docs.view.classdetails.HierarchyTreeList',
        /**
         * @member {String} ntype='classdetails-treelist'
         * @protected
         */
        ntype: 'classhierarchy-treelist',
        /**
         * @member {String[]} baseCls=['docs-classhierarchy-treelist','neo-list-container','neo-tree-list','neo-list']
         */
        baseCls: [
            'docs-classhierarchy-treelist',
            'neo-list-container',
            'neo-tree-list',
            'neo-list'
        ],
        /**
         * These rows toggle member-source filters; they do not select records in the plain collection.
         * @member {Boolean} disableSelection=true
         */
        disableSelection: true,
        /**
         * @member {Boolean} showCollapseExpandAllIcons=false
         */
        showCollapseExpandAllIcons: false,
        /**
         * @member {Object|null} structureData=null
         */
        structureData: null
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.createStoreItems();
        me.createItems(null, me.getListItemsRoot(), 0)
    }

    /**
     * @summary Adds the `unchecked` CSS class when `record.checked` is false so initial checkbox icons match `onLeafItemClick`.
     * @param {Object} record
     * @returns {Object}
     */
    createItem(record) {
        let itemVdom = super.createItem(record);

        if (!record.checked) {
            NeoArray.add(itemVdom.cls, 'unchecked')
        }

        return itemVdom
    }

    /**
     * @summary Builds class ancestry and deduplicated mixin toggles, checking only sources introduced by the selected class.
     */
    createStoreItems() {
        const me        = this,
              className = me.structureData.className,
              mainStore = me.up('main-container').store,
              classes   = new Map(mainStore.find({$kind: 'class'}).map(item => [item.neoClassName, item])),
              ancestry  = [],
              seen      = new Set(),
              mixins    = new Map(),
              sources   = [];

        let item = mainStore.find({
            $kind       : className === 'Neo' ? 'module' : 'class',
            neoClassName: className
        })[0];

        while (item && !seen.has(item.neoClassName)) {
            seen.add(item.neoClassName);
            ancestry.unshift(item);
            item = classes.get(item.augments?.[0])
        }

        ancestry.forEach((record, index) => {
            sources.push({
                checked        : record.neoClassName === className,
                id             : record.id,
                isLeaf         : true,
                isMixin        : false,
                name           : record.neoClassName,
                order          : sources.length,
                parentId       : ancestry[index - 1]?.id ?? null,
                sourceClassName: record.neoClassName
            });

            const visitMixin = (name, parentId, path = new Set()) => {
                if (seen.has(name) || path.has(name)) return;

                const previous = mixins.get(name),
                      source   = {
                          checked        : record.neoClassName === className,
                          configOrder    : previous?.configOrder ?? sources.length,
                          id             : previous?.id ?? `docs-mixin-${mixins.size}`,
                          isLeaf         : true,
                          isMixin        : true,
                          name           : `${name} (mixin)`,
                          order          : sources.length,
                          ownerClassName : record.neoClassName,
                          parentId,
                          sourceClassName: name
                      };

                mixins.set(name, source);
                sources.push(source);
                path = new Set([...path, name]);
                classes.get(name)?.mixes?.forEach(mixin => visitMixin(mixin, source.id, path))
            };

            record.mixes?.forEach(name => visitMixin(name, record.id))
        });

        me.store.items = sources.filter(source => !source.isMixin || mixins.get(source.sourceClassName) === source)
    }

    /**
     *
     * @param {Object} record
     */
    onLeafItemClick(record) {
        let me       = this,
            vnodeId  = me.getItemId(record.id),
            vdomNode = me.getVdomChild(vnodeId);

        NeoArray[record.checked ? 'add' : 'remove'](vdomNode.cls, 'unchecked');

        record.checked = !record.checked;

        me.update();

        me.fire('refreshClassMembers')
    }
}

export default Neo.setupClass(HierarchyTreeList);
