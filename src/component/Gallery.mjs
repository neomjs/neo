import {default as ClassSystemUtil} from '../util/ClassSystem.mjs';
import {default as Collection}      from '../collection/Base.mjs'
import {default as Component}       from './Base.mjs';
import GalleryModel                 from '../selection/GalleryModel.mjs';
import NeoArray                     from '../util/Array.mjs';

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
            style   : {},
            tabIndex: '-1',
            cn: [{
                tag  : 'img',
                cls  : [],
                style: {}
            }]
        },
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {},
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

        me.store = Neo.create(Collection, {
            keyProperty: 'id',
            listeners  : {
                sort : me.onSort,
                scope: me
            }
        });

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

        Neo.Xhr.promiseJson({
            url: Neo.config.isExperimental ?
                '../../resources/examples/data/ai_contacts.json' :
                '../../resources/examples/data/ai_contacts.json'
        }).then(data => {
            me.store.items = data.json.data;
            setTimeout(() => { // todo: rendering check
                me.createItems();
            }, 100);
        }).catch(err => {
            console.log('Error for Neo.Xhr.request', err, me.id);
        });
    }

    afterSetSelectionModel(value, oldValue) {
        if (this.rendered) {
            value.register(this);

            if (oldValue) {
                oldValue.destroy();
            }
        }
    }

    /**
     *
     */
    afterSetAmountRows() {
        this.afterSetOrderByRow();
    }

    /**
     *
     */
    afterSetOrderByRow() {
        let me   = this,
            vdom = me.vdom,
            view = me.vdom.cn[0].cn[0].cn[0].cn[0];

        if (me.rendered) {
            me.refreshImageReflection();

            setTimeout(() => {
                me.store.items.forEach((item, index) => {
                    view.cn[index].style.transform = me.getItemTransform(index);
                });

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
     * Tiggered before the selectionModel config gets changed.
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
     *
     */
    createItems() {
        let me               = this,
            amountRows       = me.amountRows,
            imageHeight      = me.imageHeight,
            imageWidth       = me.imageWidth,
            orderByRow       = me.orderByRow,
            secondlastColumn = amountRows - 1,
            vdom             = me.vdom,
            viewItems        = vdom.cn[0].cn[0].cn[0].cn[0].cn,
            amountColumns, imageVdom, vdomItem;

        if (orderByRow) {
            amountColumns = Math.ceil(me.store.getCount() / amountRows);
        }

        me.store.items.forEach((item, index) => {
            vdomItem  = me.itemTpl; // get a fresh clone each time
            imageVdom = vdomItem.cn[0];

            vdomItem.id = me.getItemVnodeId(item.id);
            vdomItem.style['transform'] = me.getItemTransform(index);

            if (orderByRow) {
                if (index >= secondlastColumn * amountColumns) {
                    NeoArray.add(vdomItem.cls, 'neo-reflection');
                }
            } else {
                if (index % amountRows === secondlastColumn) {
                    NeoArray.add(vdomItem.cls, 'neo-reflection');
                }
            }

            imageVdom.src = Neo.config.resourcesPath + 'examples/' + item.image;

            imageVdom.style.height = imageHeight + 'px';
            imageVdom.style.width  = imageWidth  + 'px';

            viewItems.push(vdomItem);
        });

        me.vdom = vdom;
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
                vnodeId   : me.id,
                attributes: [
                    'offsetHeight',
                    'offsetWidth'
                ]
            }).then(data => {
                me.offsetHeight = data.attributes.offsetHeight;
                me.offsetWidth  = data.attributes.offsetWidth;

                let index = parseInt(me.store.getCount() / me.amountRows);

                me.selectionModel.select(me.store.getKeyAt(index));
            });
        }, Neo.config.environment === 'development' ? 200 : 500);
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
            action: 'updateDom',
            deltas: {
                id   : me.id + '__' + 'dolly',
                style: {
                    transform: me.translate3d(...dollyTransform)
                }
            }
        }).then(() => {
            Neo.currentWorker.promiseMessage('main', {
                action    : 'readDom',
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
            newCn     = [],
            vdom      = me.vdom,
            view      = vdom.cn[0].cn[0].cn[0].cn[0],
            vdomMap   = view.cn.map(e => e.id),
            fromIndex, vdomId;

        me.store.items.forEach((item, index) => {
            vdomId    = me.getItemVnodeId(item.id);
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
                me.afterSetOrderByRow();
            }, 50);
        }
    }

    /**
     *
     */
    refreshImageReflection() {
        let me               = this,
            amountRows       = me.amountRows,
            orderByRow       = me.orderByRow,
            secondlastColumn = amountRows - 1,
            vdom             = me.vdom,
            view             = vdom.cn[0].cn[0].cn[0].cn[0],
            amountColumns;

        if (orderByRow) {
            amountColumns = Math.ceil(me.store.getCount() / amountRows);
        }

        view.cn.forEach((item, index) => {
            if (orderByRow) {
                NeoArray[index >= secondlastColumn * amountColumns ? 'add' : 'remove'](item.cls, 'neo-reflection');
            } else {
                NeoArray[index % amountRows === secondlastColumn   ? 'add' : 'remove'](item.cls, 'neo-reflection');
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