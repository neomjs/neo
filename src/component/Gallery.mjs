import {default as ClassSystemUtil} from '../util/ClassSystem.mjs';
import {default as Collection}      from '../collection/Base.mjs'
import {default as Component}       from './Base.mjs';
import GalleryModel                 from '../selection/GalleryModel.mjs';
import NeoArray                     from '../util/Array.mjs';
import Store                        from '../data/Store.mjs';

const itemsMounted = Symbol.for('itemsMounted');

/**
 * @class Neo.component.Gallery
 * @extends Neo.component.Base
 */
class Gallery extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.Gallery'
         * @private
         */
        className: 'Neo.component.Gallery',
        /**
         * @member {String} ntype='gallery'
         * @private
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
         * @member {String[]} cls=['neo-gallery', 'page', 'view']
         */
        cls: ['neo-gallery', 'page', 'view'],
        /**
         * True disables selection of  gallery items
         * @member {Boolean} disableSelection=false
         */
        disableSelection: false,
        /**
         * The image height of the gallery
         * @member {Number} imageHeight=160
         */
        imageHeight: 160,
        /**
         * The image width of the gallery
         * @member {Number} imageWidth=120
         */
        imageWidth: 120,
        /**
         * @member {Object} itemTpl_
         */
        itemTpl_: {
            cls     : ['neo-gallery-item', 'image-wrap', 'view', 'neo-transition-1000'],
            tabIndex: '-1',
            cn: [{
                tag  : 'img',
                cls  : [],
                style: {}
            }]
        },
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
         * @private
         */
        offsetHeight: null,
        /**
         * The DOM element offsetWidth of the top level div.
         * Gets fetched after the gallery got mounted.
         * @member {Number|null} offsetWidth=null
         * @private
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
         * uses the selection.GalleryModel by default
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
        store_: null, // todo: use a store once collecitons are integrated
        /**
         * The setTimeout() ids for calls which can get cancelled
         * @member {Array} transitionTimeouts=[]
         * @private
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
        _vdom: {
            cls     : ['page', 'view'],
            style   : {},
            tabIndex: '-1',
            cn: [{
                cls  : ['origin', 'view'],
                style: {},
                cn   : [{
                    cls  : ['camera', 'view'],
                    style: {},
                    cn   : [{
                        cls  : ['dolly', 'view'],
                        style: {},
                        cn   : [{
                            cls  : ['view'],
                            style: {},
                            cn   : []
                        }]
                    }]
                }]
            }]
        }
    }}

    /**
     *
     * @param {Object} config
     */
    constructor(config) {
        super(config);

        let me           = this,
            domListeners = Neo.clone(me.domListeners, true),
            vdom         = me.vdom,
            origin       = vdom.cn[0],
            camera       = origin.cn[0],
            dolly        = camera.cn[0],
            view         = dolly.cn[0];

        me[itemsMounted] = false;

        camera.id = me.id + '__' + 'camera';
        dolly .id = me.id + '__' + 'dolly';
        origin.id = me.id + '__' + 'origin';
        view  .id = me.id + '__' + 'view';

        me.vdom = vdom;

        domListeners.push({
            click: {
                fn   : me.onClick,
                scope: me
            },
            wheel: {
                fn   : me.onMouseWheel,
                scope: me
            }
        });

        me.domListeners = domListeners;

        me.on({
            mounted: me.onMounted,
            scope  : me
        });
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        if (me.selectionModel) {
            me.selectionModel.register(me);
        }

        // load data for the example collection
        if (me.store instanceof Store !== true) {
            Neo.Xhr.promiseJson({
                insideNeo: true,
                url      : '../../resources/examples/data/ai_contacts.json'
            }).then(data => {
                me.store.items = data.json.data;
                setTimeout(() => { // todo: rendering check
                    me.createItems();
                }, 100);
            }).catch(err => {
                console.log('Error for Neo.Xhr.request', err, me.id);
            });
        }
    }

    /**
     * Triggered after the amountRows config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @private
     */
    afterSetAmountRows(value, oldValue) {
        if (Neo.isNumber(oldValue)) {
            let me = this;

            me.afterSetOrderByRow(me.orderByRow, !me.orderByRow);
        }
    }

    /**
     * Triggered after the maxItem config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @private
     */
    afterSetMaxItems(value, oldValue) {
        let me = this;

        if (value && me.rendered) {
            if (oldValue > value) {
                me.destroyItems(value, oldValue - value);
            } else {
                me.createItems(oldValue);
            }
        }
    }

    /**
     * Triggered after the orderByRow config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @private
     */
    afterSetOrderByRow(value, oldValue) {
        if (Neo.isBoolean(oldValue)) {
            let me   = this,
                i    = 0,
                len  = Math.min(me.maxItems, me.store.items.length),
                vdom = me.vdom,
                view = me.getItemsRoot();

            if (me.rendered) {
                me.refreshImageReflection();

                setTimeout(() => {
                    for (; i < len; i++) {
                        view.cn[i].style.transform = me.getItemTransform(i);
                    }

                    me.vdom = vdom;

                    setTimeout(() => {
                        let sm = me.selectionModel;

                        if (sm.hasSelection()) {
                            me.onSelectionChange(sm.items);
                        }
                    }, 500);
                }, 50);
            }
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @private
     */
    afterSetSelectionModel(value, oldValue) {
        if (this.rendered) {
            value.register(this);

            if (oldValue) {
                oldValue.destroy();
            }
        }
    }

    /**
     * Triggered before the store config gets changed.
     * @param {Neo.data.Store|null} value
     * @param {Neo.data.Store|null} oldValue
     * @private
     */
    beforeSetStore(value, oldValue) {
        let me = this;

        if (oldValue) {
            oldValue.destroy();
        }

        // todo: remove the if check once all demos use stores (instead of collections)
        if (value) {
            return ClassSystemUtil.beforeSetInstance(value, Store, {
                listeners  : {
                    load : me.onStoreLoad,
                    sort : me.onSort,
                    scope: me
                }
            });
        }

        return Neo.create(Collection, {
            keyProperty: 'id',
            listeners  : {
                sort : me.onSort,
                scope: me
            }
        });
    }

    afterSetTranslateX() {this.moveOrigin();}
    afterSetTranslateY() {this.moveOrigin();}
    afterSetTranslateZ() {this.moveOrigin();}

    /**
     *
     * @return {*}
     */
    beforeGetItemTpl() {
        return Neo.clone(this._itemTpl, true);
    }

    /**
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @private
     */
    beforeSetSelectionModel(value, oldValue) {
        if (oldValue) {
            oldValue.destroy();
        }

        return ClassSystemUtil.beforeSetInstance(value, GalleryModel, {
            listeners: {
                selectionChange: this.onSelectionChange,
                scope          : this
            }
        });
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
            imageVdom = vdomItem.cn[0];

        vdomItem.id = me.getItemVnodeId(record[me.keyProperty]);

        imageVdom.src = Neo.config.resourcesPath + 'examples/' + record.image;

        imageVdom.style.height = me.imageHeight + 'px';
        imageVdom.style.width  = me.imageWidth  + 'px';

        return vdomItem;
    }

    /**
     * @param {Number} [startIndex] the start index for creating items,
     * e.g. increasing maxItems only needs to create the new ones
     * @private
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
            amountColumns = Math.ceil(me.store.getCount() / amountRows);
        }

        for (; i < len; i++) {
            item      = me.store.items[i];
            vdomItem  = me.createItem(me.itemTpl, item, i);

            vdomItem. style = vdomItem.style || {};

            vdomItem.style['transform'] = me.getItemTransform(i);

            if (orderByRow) {
                if (i >= secondLastColumn * amountColumns) {
                    NeoArray.add(vdomItem.cls, 'neo-reflection');
                }
            } else {
                if (i % amountRows === secondLastColumn) {
                    NeoArray.add(vdomItem.cls, 'neo-reflection');
                }
            }

            itemsRoot.cn.push(vdomItem);
        }

        me.promiseVdomUpdate(vdom).then(() => {
            me[itemsMounted] = true;
        });
    }

    /**
     *
     * @param {Number} [startIndex]
     * @param {Number} [amountItems]
     */
    destroyItems(startIndex, amountItems) {
        let me           = this,
            vdom         = me.vdom,
            countItems   = amountItems || me.store.getCount(),
            selectedItem = me.selectionModel.items[0];

        me.getItemsRoot().cn.splice(startIndex || 0, countItems);
        me.vdom = vdom;

        if (me.selectionModel.hasSelection() && selectedItem > startIndex && selectedItem < startIndex + countItems) {
            me.onMounted();
        }
    }

    /**
     *
     * @param {Number} index
     * @returns {Number[]}
     */
    getCameraTransformForCell(index) {
        let me          = this,
            amountRows  = me.amountRows,
            imageWidth  = me.imageWidth,
            gap         = 10,
            height      = me.offsetHeight / (amountRows + 2),
            spacing     = height + gap,
            x           = Math.floor(index / amountRows),
            y           = index - x * amountRows;

        if (me.orderByRow) {
            let amountColumns = Math.ceil(me.store.getCount() / amountRows);

            x = index % amountColumns;
            y = Math.floor(index / amountColumns);
        }

        let cx = x * (imageWidth + 10),
            cy = (y + 0.5) * spacing * 1.1 + 50;

        return [-cx, -cy, 0];
    }

    /**
     *
     * @param {String} vnodeId
     * @returns {Number} itemId
     */
    getItemId(vnodeId) {
        return parseInt(vnodeId.split('__')[1]);
    }

    /**
     * Returns the vdom node containing the gallery items
     * @returns {Object} vdom
     */
    getItemsRoot() {
        return this.vdom.cn[0].cn[0].cn[0].cn[0];
    }

    /**
     *
     * @param {Number} index
     * @returns {String}
     */
    getItemTransform(index) {
        let me         = this,
            amountRows = me.amountRows,
            x, y;

        if (me.orderByRow) {
            amountRows = Math.ceil(me.store.getCount() / amountRows);

            x = index % amountRows;
            y = Math.floor(index / amountRows);
        } else {
            x = Math.floor(index / amountRows);
            y = index % amountRows;
        }

        return this.translate3d(
            x * (me.imageWidth  + 10),
            y * (me.imageHeight + 10) + 100,
            0
        );
    }

    /**
     *
     * @param {String} id
     * @returns {String}
     */
    getItemVnodeId(id) {
        return this.id + '__' + id;
    }

    /**
     *
     */
    moveOrigin() {
        let me   = this,
            vdom = me.vdom;

        vdom.cn[0].style.transform = me.translate3d(me.translateX, me.translateY, me.translateZ);

        me.vdom = vdom;
    }

    /**
     *
     * @param {Object} data
     */
    onClick(data) {
        this.fire(data.id === this.id ? 'containerClick' : 'itemClick', data);
    }

    /**
     *
     * @param {Object} data
     */
    onMouseWheel(data) {
        let me         = this,
            deltaX     = data.deltaX,
            deltaY     = data.deltaY,
            translateX = me.translateX,
            translateZ = me.translateZ;

        if (me.mouseWheelEnabled) {
            me._translateX = translateX - (deltaX * me.mouseWheelDeltaX); // silent update
            me._translateZ = translateZ + (deltaY * me.mouseWheelDeltaY); // silent update

            me.moveOrigin();

            me.fire('changeTranslateX', me._translateX);
            me.fire('changeTranslateZ', me._translateZ);
        }
    }

    /**
     *
     */
    onMounted() {
        let me = this;

        // todo: mount event
        setTimeout(() => {
            Neo.currentWorker.promiseMessage('main', {
                action    : 'readDom',
                appName   : me.appName,
                vnodeId   : me.id,
                attributes: [
                    'offsetHeight',
                    'offsetWidth'
                ]
            }).then(data => {
                me.offsetHeight = data.attributes.offsetHeight;
                me.offsetWidth  = data.attributes.offsetWidth;

                if (me.selectOnMount) {
                    let selection = me.selectionModel.getSelection(),
                        key       = selection.length > 0 && selection[0];

                    if (!key) {
                        let index = parseInt(Math.min(me.maxItems, me.store.getCount()) / me.amountRows);

                        key = me.store.getKeyAt(index);
                    }

                    me.selectionModel.select(key);
                }
            });
        }, 200);
    }

    /**
     *
     * @param {Array} value
     */
    onSelectionChange(value) {
        let me             = this,
            index          = me.store.indexOf(value && value[0] || 0),
            imageHeight    = me.imageHeight,
            imageWidth     = me.imageWidth,
            vdom           = me.vdom,
            camera         = vdom.cn[0].cn[0],
            dollyTransform = me.getCameraTransformForCell(index),
            height         = me.offsetHeight / (me.amountRows + 2),
            width          = Math.round(height * imageWidth / imageHeight),
            spacing        = width + 10,
            timeoutId;

        me.transitionTimeouts.forEach(item => {
            clearTimeout(item);
        });

        me.transitionTimeouts.splice(0, me.transitionTimeouts.length);

        Neo.currentWorker.promiseMessage('main', {
            action : 'updateDom',
            appName: me.appName,
            deltas : {
                id   : me.id + '__' + 'dolly',
                style: {
                    transform: me.translate3d(...dollyTransform)
                }
            }
        }).then(() => {
            Neo.currentWorker.promiseMessage('main', {
                action    : 'readDom',
                appName   : me.appName,
                vnodeId   : me.id,
                functions : [
                    {
                        fn            : 'getComputedStyle',
                        params        : [me.id + '__' + 'dolly', null],
                        paramIsDomNode: [true, false],
                        scope         : 'defaultView',
                        returnFnName  : 'transform',
                        returnValue   : 'transform'
                    }
                ]
            }).then(data => {
                let transform = data.functions.transform,
                    translateX, angle;

                if (transform.indexOf('matrix3d') === 0) {
                    transform = transform.substring(9, transform.length - 1); // remove matrix3d( ... )
                    transform = transform.split(',').map(e => parseFloat(e));
                    translateX = transform[12]; // bottom left element of the 4x4 matrix
                } else {
                    transform = transform.substring(7, transform.length - 1); // remove matrix( ... )
                    transform = transform.split(',').map(e => parseFloat(e));
                    translateX = transform[4]; // bottom left element of the 2x3 matrix
                }

                translateX = translateX - dollyTransform[0];
                angle      = Math.min(Math.max(translateX / (spacing * 3), -1), 1) * 45;

                camera.style.transform          = 'rotateY(' + angle + 'deg)';
                camera.style.transitionDuration = '330ms';

                me.vdom = vdom;

                timeoutId = setTimeout(() => {
                    NeoArray.remove(me.transitionTimeouts, timeoutId);

                    vdom = me.vdom;

                    camera.style.transform          = 'rotateY(0deg)';
                    camera.style.transitionDuration = '5000ms';

                    me.vdom = vdom;
                }, 330);

                me.transitionTimeouts.push(timeoutId);
            });
        });
    }

    /**
     *
     */
    onSort() {
        let me        = this,
            hasChange = false,
            items     = me.store.items,
            newCn     = [],
            vdom      = me.vdom,
            view      = me.getItemsRoot(),
            vdomMap   = view.cn.map(e => e.id),
            fromIndex, vdomId;

        if (me[itemsMounted] === true && items) {
            items.forEach((item, index) => {
                vdomId    = me.getItemVnodeId(item[me.keyProperty]);
                fromIndex = vdomMap.indexOf(vdomId);

                newCn.push(view.cn[fromIndex]);

                if (index !== fromIndex) {
                    hasChange = true;
                }
            });

            if (hasChange) {
                view.cn = newCn;
                me.vdom = vdom;

                setTimeout(() => {
                    me.afterSetOrderByRow(me.orderByRow, !me.orderByRow);
                }, 50);
            }
        }
    }

    /**
     *
     * @param {Array} items
     */
    onStoreLoad(items) {
        this.getItemsRoot().cn = []; // silent update
        this.createItems();
    }

    /**
     *
     */
    refreshImageReflection() {
        let me               = this,
            amountRows       = me.amountRows,
            orderByRow       = me.orderByRow,
            secondLastColumn = amountRows - 1,
            vdom             = me.vdom,
            view             = me.getItemsRoot(),
            amountColumns;

        if (orderByRow) {
            amountColumns = Math.ceil(me.store.getCount() / amountRows);
        }

        view.cn.forEach((item, index) => {
            if (orderByRow) {
                NeoArray[index >= secondLastColumn * amountColumns ? 'add' : 'remove'](item.cls, 'neo-reflection');
            } else {
                NeoArray[index % amountRows === secondLastColumn   ? 'add' : 'remove'](item.cls, 'neo-reflection');
            }
        });

        me.vdom = vdom;
    }

    /**
     *
     * @param {Number} x
     * @param {Number} y
     * @param {Number} z
     * @returns {String}
     */
    translate3d(x, y, z) {
        return 'translate3d(' + x + 'px, ' + y + 'px, ' + z + 'px)';
    }
}

Neo.applyClassConfig(Gallery);

export {Gallery as default};