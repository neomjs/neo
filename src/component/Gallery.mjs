import ClassSystemUtil from '../util/ClassSystem.mjs';
import Component       from './Base.mjs';
import GalleryModel    from '../selection/GalleryModel.mjs';
import NeoArray        from '../util/Array.mjs';
import Store           from '../data/Store.mjs';

const itemsMounted = Symbol.for('itemsMounted');

/**
 * @class Neo.component.Gallery
 * @extends Neo.component.Base
 */
class Gallery extends Component {
    static config = {
        /**
         * @member {String} className='Neo.component.Gallery'
         * @protected
         */
        className: 'Neo.component.Gallery',
        /**
         * @member {String} ntype='gallery'
         * @protected
         */
        ntype: 'gallery',
        /**
         * The amount of visible rows inside the gallery
         * @member {Number} amountRows_=3
         */
        amountRows_: 3,
        /**
         * The background color of the gallery container
         * @member {String} backgroundColor_='#000000'
         */
        backgroundColor_: '#000000',
        /**
         * @member {String[]} baseCls=['neo-gallery', 'page', 'view']
         */
        baseCls: ['neo-gallery', 'page', 'view'],
        /**
         * True disables selection of gallery items
         * @member {Boolean} disableSelection=false
         */
        disableSelection: false,
        /**
         * True will focus the gallery top level DOM node to enable the keyboard navigation right away
         * @member {Boolean} focusOnMount=true
         */
        focusOnMount: true,
        /**
         * The image height of the gallery
         * @member {Number} itemHeight=160
         */
        itemHeight: 160,
        /**
         * @member {Object} itemTpl_
         */
        itemTpl_:
        {cls: ['neo-gallery-item', 'image-wrap', 'view', 'neo-transition-1000'], tabIndex: '-1', cn: [
            {cls: ['neo-item-wrapper'], cn: [
                {tag: 'img', cls: [], style: {}}
            ]}
        ]},
        /**
         * The image width of the gallery
         * @member {Number} itemWidth=120
         */
        itemWidth: 120,
        /**
         * The unique record field containing the id.
         * @member {String} keyProperty='id'
         */
        keyProperty: 'id',
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {},
        /**
         * The max amount of store items to show
         * @member {Number} maxItems_=300
         */
        maxItems_: 300,
        /**
         * The zooming factor which replaces the default wheelDelta.
         * @member {Number} mouseWheelDeltaX=10
         */
        mouseWheelDeltaX: 10,
        /**
         * The zooming factor which replaces the default wheelDelta.
         * @member {Number} mouseWheelDeltaY=10
         */
        mouseWheelDeltaY: 10,
        /**
         * Specifies whether the mouse wheel should change the translateZ value for zooming
         * @member {Boolean} mouseWheelEnabled_=true
         */
        mouseWheelEnabled_: true,
        /**
         * The DOM element offsetHeight of the top level div.
         * Gets fetched after the gallery got mounted.
         * @member {Number|null} offsetHeight=null
         * @protected
         */
        offsetHeight: null,
        /**
         * The DOM element offsetWidth of the top level div.
         * Gets fetched after the gallery got mounted.
         * @member {Number|null} offsetWidth=null
         * @protected
         */
        offsetWidth: null,
        /**
         * Set this one to true to order the items by row instead of by column
         * @member {Boolean} orderByRow_=false
         */
        orderByRow_: false,
        /**
         * The name of the CSS rule for selected items
         * @member {String} selectedItemCls='neo-selected'
         */
        selectedItemCls: 'neo-selected',
        /**
         * Uses the selection.GalleryModel by default
         * @member {Neo.selection.GalleryModel|null} selectionModel_=null
         */
        selectionModel_: null,
        /**
         * True to select the item inside the middle of the store items on mount
         * @member {Boolean} selectOnMount=true
         */
        selectOnMount: true,
        /**
         * The store instance or class containing the data for the gallery items
         * @member {Neo.data.Store|null} store_=null
         */
        store_: null,
        /**
         * The setTimeout() ids for calls which can get cancelled
         * @member {Array} transitionTimeouts=[]
         * @protected
         */
        transitionTimeouts: [],
        /**
         * The translateX value of the view origin
         * @member {Number} translateX_=0
         */
        translateX_: 0,
        /**
         * The translateX value of the view origin
         * @member {Number} translateY_=0
         */
        translateY_: 0,
        /**
         * The translateX value of the view origin
         * @member {Number} translateZ_=0
         */
        translateZ_: 0,
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {cls: ['page', 'view'], style: {}, tabIndex: '-1', cn: [
            {cls: ['origin', 'view'], style: {}, cn: [
                {cls: ['camera', 'view'], style: {}, cn: [
                    {cls: ['dolly', 'view'], style: {}, cn: [
                        {cls: ['view'], style: {}, cn: []}
                    ]}
                ]}
            ]}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        let me = this;

        me[itemsMounted] = false;

        me.addDomListeners({
            click: me.onClick,
            wheel: me.onMouseWheel,
            scope: me
        })
    }

    /**
     * Triggered after the amountRows config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetAmountRows(value, oldValue) {
        if (Neo.isNumber(oldValue)) {
            let me = this;

            me.afterSetOrderByRow(me.orderByRow, !me.orderByRow)
        }
    }

    /**
     * Triggered after the id config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetId(value, oldValue) {
        super.afterSetId(value, oldValue);

        let me     = this,
            origin = me.vdom.cn[0],
            camera = origin.cn[0],
            dolly  = camera.cn[0],
            view   = dolly.cn[0],
            prefix = me.id + '__';

        camera.id = prefix + 'camera';
        dolly .id = prefix + 'dolly';
        origin.id = prefix + 'origin';
        view  .id = prefix + 'view';

        me.update()
    }

    /**
     * Triggered after the maxItem config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMaxItems(value, oldValue) {
        let me = this;

        if (value && me.rendered) {
            if (oldValue > value) {
                me.destroyItems(value, oldValue - value)
            } else {
                me.createItems(oldValue)
            }
        }
    }

    /**
     * Triggered after the mounted config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetMounted(value, oldValue) {
        let me               = this,
            {selectionModel} = me;

        if (value) {
            me.focusOnMount && me.focus(me.id);

            me.timeout(300).then(() => {
                Neo.currentWorker.promiseMessage('main', {
                    action    : 'readDom',
                    appName   : me.appName,
                    attributes: ['offsetHeight', 'offsetWidth'],
                    vnodeId   : me.id,
                    windowId  : me.windowId
                }).then(data => {
                    me.offsetHeight = data.attributes.offsetHeight;
                    me.offsetWidth  = data.attributes.offsetWidth;

                    if (me.selectOnMount || selectionModel.hasSelection()) {
                        let selection = selectionModel.getSelection(),
                            key       = selection.length > 0 && selection[0];

                        if (!key) {
                            let index = parseInt(Math.min(me.maxItems, me.store.getCount()) / me.amountRows);

                            key = me.store.getKeyAt(index)
                        }

                        selectionModel.select(key)
                    }
                })
            })
        } else {
            selectionModel.items = []
        }
    }

    /**
     * Triggered after the orderByRow config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetOrderByRow(value, oldValue) {
        if (Neo.isBoolean(oldValue)) {
            let me   = this,
                i    = 0,
                len  = Math.min(me.maxItems, me.store.items.length),
                view = me.getItemsRoot();

            if (me.rendered) {
                me.refreshImageReflection();

                me.timeout(50).then(() => {
                    for (; i < len; i++) {
                        view.cn[i].style.transform = me.getItemTransform(i)
                    }

                    me.update();

                    me.timeout(500).then(() => {
                        let sm = me.selectionModel;

                        sm.hasSelection() && me.onSelectionChange(sm.items)
                    })
                })
            }
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        oldValue?.destroy();
        this.rendered && value.register(this)
    }

    afterSetTranslateX() {this.moveOrigin()}
    afterSetTranslateY() {this.moveOrigin()}
    afterSetTranslateZ() {this.moveOrigin()}

    /**
     * Triggered before the store config gets changed.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @returns {Neo.collection.Base|Neo.data.Store}
     * @protected
     */
    beforeSetStore(value, oldValue) {
        let me = this;

        oldValue?.destroy();

        return ClassSystemUtil.beforeSetInstance(value, Store, {
            listeners  : {
                load : me.onStoreLoad,
                sort : me.onSort,
                scope: me
            }
        })
    }

    /**
     * @returns {Object}
     */
    beforeGetItemTpl() {
        return Neo.clone(this._itemTpl, true)
    }

    /**
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue?.destroy();

        return ClassSystemUtil.beforeSetInstance(value, GalleryModel, {
            listeners: {
                selectionChange: this.onSelectionChange,
                scope          : this
            }
        })
    }

    /**
     * Override this method to get different item-markups
     * @param {Object} vdomItem
     * @param {Object} record
     * @param {Number} index
     * @returns {Object} vdomItem
     */
    createItem(vdomItem, record, index) {
        let me        = this,
            imageVdom = vdomItem.cn[0].cn[0];

        vdomItem.id = me.getItemVnodeId(record[me.keyProperty]);

        imageVdom.src = Neo.config.resourcesPath + 'examples/' + record.image;

        imageVdom.style.height = me.itemHeight + 'px';
        imageVdom.style.width  = me.itemWidth  + 'px';

        return vdomItem
    }

    /**
     * @param {Number} [startIndex] the start index for creating items,
     * e.g. increasing maxItems only needs to create the new ones
     * @protected
     */
    createItems(startIndex) {
        let me               = this,
            amountRows       = me.amountRows,
            orderByRow       = me.orderByRow,
            secondLastColumn = amountRows - 1,
            vdom             = me.vdom,
            itemsRoot        = me.getItemsRoot(),
            i                = startIndex || 0,
            len              = Math.min(me.maxItems, me.store.items.length),
            amountColumns, item, vdomItem;

        if (orderByRow) {
            amountColumns = Math.ceil(me.store.getCount() / amountRows)
        }

        for (; i < len; i++) {
            item      = me.store.items[i];
            vdomItem  = me.createItem(me.itemTpl, item, i);

            vdomItem. style = vdomItem.style || {};

            vdomItem.style['transform'] = me.getItemTransform(i);

            if (orderByRow) {
                if (i >= secondLastColumn * amountColumns) {
                    NeoArray.add(vdomItem.cls, 'neo-reflection')
                }
            } else {
                if (i % amountRows === secondLastColumn) {
                    NeoArray.add(vdomItem.cls, 'neo-reflection')
                }
            }

            itemsRoot.cn.push(vdomItem)
        }

        me.promiseUpdate(vdom).then(() => {
            me[itemsMounted] = true
        })
    }

    /**
     * @param {Number} [startIndex]
     * @param {Number} [amountItems]
     */
    destroyItems(startIndex, amountItems) {
        let me           = this,
            countItems   = amountItems || me.store.getCount(),
            selectedItem = me.selectionModel.items[0];

        me.getItemsRoot().cn.splice(startIndex || 0, countItems);
        me.update();

        if (me.selectionModel.hasSelection() && selectedItem > startIndex && selectedItem < startIndex + countItems) {
            me.afterSetMounted(true, false)
        }
    }

    /**
     * @param {Number} index
     * @returns {Number[]}
     */
    getCameraTransformForCell(index) {
        let me                      = this,
            {amountRows, itemWidth} = me,
            gap                     = 10,
            height                  = me.offsetHeight / (amountRows + 2),
            spacing                 = height + gap,
            x                       = Math.floor(index / amountRows),
            y                       = index - x * amountRows;

        if (me.orderByRow) {
            let amountColumns = Math.ceil(Math.min(me.maxItems, me.store.getCount()) / amountRows);

            x = index % amountColumns;
            y = Math.floor(index / amountColumns)
        }

        let cx = x * (itemWidth + 10),
            cy = (y + 0.5) * spacing * 1.1 + 50;

        return [-cx, -cy, 0]
    }

    /**
     * @param {String} vnodeId
     * @returns {Number} itemId
     */
    getItemId(vnodeId) {
        return parseInt(vnodeId.split('__')[1])
    }

    /**
     * Returns the vdom node containing the gallery items
     * @returns {Object} vdom
     */
    getItemsRoot() {
        return this.vdom.cn[0].cn[0].cn[0].cn[0]
    }

    /**
     * @param {Number} index
     * @returns {String}
     */
    getItemTransform(index) {
        let me           = this,
            {amountRows} = me,
            x, y;

        if (me.orderByRow) {
            amountRows = Math.ceil(Math.min(me.maxItems, me.store.getCount()) / amountRows);

            x = index % amountRows;
            y = Math.floor(index / amountRows)
        } else {
            x = Math.floor(index / amountRows);
            y = index % amountRows
        }

        return this.translate3d(
            x * (me.itemWidth  + 10),
            y * (me.itemHeight + 10) + 100,
            0
        )
    }

    /**
     * @param {String} id
     * @returns {String}
     */
    getItemVnodeId(id) {
        return this.id + '__' + id
    }

    /**
     *
     */
    moveOrigin() {
        let me = this;

        me.vdom.cn[0].style.transform = me.translate3d(me.translateX, me.translateY, me.translateZ);
        me.update()
    }

    /**
     * @param {Object} data
     */
    onClick(data) {
        this.fire(data.id === this.id ? 'containerClick' : 'itemClick', data)
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();
        this.selectionModel?.register(this);
    }

    /**
     * @param {Object} data
     */
    onMouseWheel(data) {
        let me = this;

        if (me.mouseWheelEnabled) {
            me._translateX = me.translateX - (data.deltaX * me.mouseWheelDeltaX); // silent update
            me._translateZ = me.translateZ + (data.deltaY * me.mouseWheelDeltaY); // silent update

            me.moveOrigin();

            me.fire('changeTranslateX', me._translateX);
            me.fire('changeTranslateZ', me._translateZ)
        }
    }

    /**
     * @param {Array} value
     */
    onSelectionChange(value) {
        let me             = this,
            index          = me.store.indexOf(value?.[0] || 0),
            {appName, id, itemHeight, itemWidth, windowId} = me,
            camera         = me.vdom.cn[0].cn[0],
            cameraStyle    = camera.style,
            dollyTransform = me.getCameraTransformForCell(index),
            height         = me.offsetHeight / (me.amountRows + 2),
            width          = Math.round(height * itemWidth / itemHeight),
            spacing        = width + 10,
            timeoutId;

        me.transitionTimeouts.forEach(item => {
            clearTimeout(item)
        });

        me.transitionTimeouts.splice(0, me.transitionTimeouts.length);

        Neo.currentWorker.promiseMessage('main', {
            action : 'updateDom',
            appName,
            windowId,

            deltas: {
                id   : id + '__dolly',
                style: {
                    transform: me.translate3d(...dollyTransform)
                }
            }
        }).then(() => {
            Neo.currentWorker.promiseMessage('main', {
                action : 'readDom',
                appName,
                vnodeId: id,
                windowId,

                functions: [{
                    fn            : 'getComputedStyle',
                    params        : [id + '__dolly', null],
                    paramIsDomNode: [true, false],
                    scope         : 'defaultView',
                    returnFnName  : 'transform',
                    returnValue   : 'transform'
                }]
            }).then(data => {
                let transform = data.functions.transform,
                    translateX, angle;

                if (transform.indexOf('matrix3d') === 0) {
                    transform  = transform.substring(9, transform.length - 1); // remove matrix3d( ... )
                    transform  = transform.split(',').map(e => parseFloat(e));
                    translateX = transform[12] // bottom left element of the 4x4 matrix
                } else {
                    transform  = transform.substring(7, transform.length - 1); // remove matrix( ... )
                    transform  = transform.split(',').map(e => parseFloat(e));
                    translateX = transform[4] // bottom left element of the 2x3 matrix
                }

                translateX = translateX - dollyTransform[0];
                angle      = Math.min(Math.max(translateX / (spacing * 3), -1), 1) * 45;

                cameraStyle.transform          = `rotateY(${angle}deg)`;
                cameraStyle.transitionDuration = '330ms';

                me.update();

                timeoutId = setTimeout(() => {
                    NeoArray.remove(me.transitionTimeouts, timeoutId);

                    cameraStyle.transform          = 'rotateY(0deg)';
                    cameraStyle.transitionDuration = '5000ms';

                    me.update()
                }, 330);

                me.transitionTimeouts.push(timeoutId)
            })
        })
    }

    /**
     *
     */
    onSort() {
        if (this[itemsMounted] === true) {
            let me        = this,
                hasChange = false,
                items     = [...me.store.items || []],
                newCn     = [],
                view      = me.getItemsRoot(),
                vdomMap   = view.cn.map(e => e.id),
                fromIndex, vdomId;

            items.length = Math.min(me.maxItems, me.store.getCount());

            if (items.length > 0) {
                items.forEach((item, index) => {
                    vdomId    = me.getItemVnodeId(item[me.keyProperty]);
                    fromIndex = vdomMap.indexOf(vdomId);

                    newCn.push(view.cn[fromIndex]);

                    if (index !== fromIndex) {
                        hasChange = true
                    }
                });

                if (hasChange) {
                    view.cn = newCn;
                    me.update();

                    me.timeout(50).then(() => {
                        me.afterSetOrderByRow(me.orderByRow, !me.orderByRow)
                    })
                }
            }
        }
    }

    /**
     * @param {Object[]} items
     */
    onStoreLoad(items) {
        this.getItemsRoot().cn = []; // silent update
        this.createItems()
    }

    /**
     *
     */
    refreshImageReflection() {
        let me                       = this,
            {amountRows, orderByRow} = me,
            secondLastColumn         = amountRows - 1,
            view                     = me.getItemsRoot(),
            amountColumns;

        if (orderByRow) {
            amountColumns = Math.ceil(Math.min(me.maxItems, me.store.getCount()) / amountRows)
        }

        view.cn.forEach((item, index) => {
            if (orderByRow) {
                NeoArray[index >= secondLastColumn * amountColumns ? 'add' : 'remove'](item.cls, 'neo-reflection')
            } else {
                NeoArray[index % amountRows === secondLastColumn   ? 'add' : 'remove'](item.cls, 'neo-reflection')
            }
        });

        me.update()
    }

    /**
     * @param {Number} x
     * @param {Number} y
     * @param {Number} z
     * @returns {String}
     */
    translate3d(x, y, z) {
        return `translate3d(${x}px, ${y}px, ${z}px)`
    }
}

export default Neo.setupClass(Gallery);
