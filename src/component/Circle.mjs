import {default as ClassSystemUtil} from '../util/ClassSystem.mjs';
import CircleModel                  from '../selection/CircleModel.mjs';
import {default as Collection}      from '../collection/Base.mjs';
import {default as Component}       from './Base.mjs';
import NeoArray                     from '../util/Array.mjs';
import {default as VDomUtil}        from '../util/VDom.mjs';

/**
 * @class Neo.component.Circle
 * @extends Neo.component.Base
 */
class Circle extends Component {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.component.Circle'
         * @protected
         */
        className: 'Neo.component.Circle',
        /**
         * @member {String} ntype='circle'
         * @protected
         */
        ntype: 'circle',
        /**
         * Will get set inside the ctor to avoid issues inside the webpack builds
         * @member {String|null} backsideIconPath=Neo.config.resourcesPath + 'images/circle/'
         */
        backsideIconPath: null,
        /**
         * @member {Boolean} circleCenterHasTransitionCls=true
         * @protected
         */
        circleCenterHasTransitionCls: true,
        /**
         * @member {String[]} cls=['neo-circle-component']
         */
        cls: ['neo-circle-component'],
        /**
         * @member {Boolean} collapsed=true
         */
        collapsed: true,
        /**
         * Additional used keys for the selection model
         * @member {Object} keys
         */
        keys: {},
        /**
         * @member {Number} innerRadius_=60
         */
        innerRadius_: 100,
        /**
         * @member {Boolean} isFlipped=false
         */
        isFlipped: false,
        /**
         * Will get set inside the ctor to avoid issues inside the webpack builds
         * @member {String} itemImagePath=Neo.config.resourcesPath + 'examples/images/'
         */
        itemImagePath: null,
        /**
         * @member {Number} itemSize_=30
         */
        itemSize_: 60,
        /**
         * @member {Number} maxItems_=12
         */
        maxItems_: 12,
        /**
         * The amount in px which the outerRadius is bigger than the innerRadius
         * @member {Number} outerRadiusDelta_=10
         */
        outerRadiusDelta_: 10,
        /**
         * @member {Number} rotateX_=0
         */
        rotateX_:0,
        /**
         * @member {Number} rotateY_=0
         */
        rotateY_:0,
        /**
         * @member {Number} rotateZ_=0
         */
        rotateZ_:0,
        /**
         * @member {Neo.selection.Model} selectionModel_=null
         */
        selectionModel_: null,
        /**
         * @member {Neo.collection.Base} store_=null
         */
        store_: null,
        /**
         * @member {String} title_='Circle 1'
         */
        title_: 'Circle 1',
        /**
         * The url for the store to load the data
         * @member {String} url_='../resources/examples/data/ai_contacts.json'
         */
        url_: '../../resources/examples/data/circleContacts.json',
        /**
         * @member {Object} _vdom
         */
        _vdom: {
            tabIndex: -1,
            cn: [{
                cls  : ['neo-circle-center'],
                style: {},
                cn: [{
                    cls: ['neo-circle-front'],
                    cn : [{
                        cls  : ['neo-circle'],
                        style: {},
                        cn: [
                            {cls: ['neo-count-items']},
                            {cls: ['neo-circle-name']}
                        ]
                    }, {
                        cls  : ['neo-outer-circle'],
                        style: {}
                    }]
                }, {
                    cls: ['neo-circle-back'],
                    cn : []
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

        Neo.main.DomEvents.registerPreventDefaultTargets({
            name: 'contextmenu',
            cls : ['neo-circle', 'neo-circle-back']
        });

        let me           = this,
            domListeners = me.domListeners,
            vdom         = me.vdom;

        if (!me.backsideIconPath) {
            me.backsideIconPath = Neo.config.resourcesPath + 'images/circle/';
        }

        if (!me.itemImagePath) {
            me.itemImagePath = Neo.config.resourcesPath + 'examples/';
        }

        domListeners.push({
            mouseenter: me.expand,
            mouseleave: me.collapse,
            scope     : me
        }, {
            contextmenu: me.onContextMenu,
            delegate   : 'neo-circle-back',
            scope      : me
        }, {
            click   : me.onBacksideIconClick,
            delegate: 'neo-backside-icon',
            scope   : me
        }, {
            mouseenter: me.expandItem,
            mouseleave: me.collapseItem,
            delegate  : 'neo-circle-item',
            scope     : me
        }, {
            contextmenu: me.onContextMenu,
            wheel      : me.onMouseWheel,
            delegate   : 'neo-circle',
            scope      : me
        });

        me.domListeners = domListeners;

        me.store = Neo.create(Collection, {
            keyProperty: 'id'
        });

        // silent updates
        me.createBacksideItems(true);
        me.updateInnerCircle(true);
        me.updateOuterCircle(true);
        me.updateTitle(true);

        me.vdom = vdom;
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

        me.loadData();
    }

    /**
     * Triggered after the innerRadius config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetInnerRadius(value, oldValue) {
        if (oldValue) {
            let me = this;

            me.updateItemPositions(true);
            me.updateInnerCircle(true);
            me.updateOuterCircle(false);
        }
    }

    /**
     * Triggered after the maxItems config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetMaxItems(value, oldValue) {
        if (oldValue && this.rendered) {
            let me      = this,
                frontEl = me.getFrontEl(),
                vdom    = me.vdom;

            if (value < oldValue) {
                if (me.collapsed) {
                    frontEl.cn.splice(value + 2);
                } else {
                    me.updateItemOpacity(0, true, value);

                    setTimeout(() => {
                        frontEl.cn.splice(value + 2);
                        me.vdom = vdom;
                    }, 300);
                }

                me.updateItemPositions(true);
                me.vdom = vdom;
            } else {
                me.createItems(oldValue, true);
                me.updateItemPositions(true);

                me.promiseVdomUpdate().then(() => {
                    if (!me.collapsed) {
                        me.updateItemOpacity(1, true, oldValue);
                        me.vdom = vdom;
                    }
                });
            }
        }
    }

    /**
     * Triggered after the itemSize config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetItemSize(value, oldValue) {
        let me = this;

        if (oldValue && me.rendered) {
            if (!me.collapsed) {
                me.updateOuterCircle(true);
            }

            me.updateItemPositions();
        }
    }

    /**
     * Triggered after the rotateX config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRotateX(value, oldValue) {
        if (oldValue && this.rendered) {
            this.rotate();
        }
    }

    /**
     * Triggered after the rotateY config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRotateY(value, oldValue) {
        if (oldValue && this.rendered) {
            this.rotate();
        }
    }

    /**
     * Triggered after the rotateZ config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRotateZ(value, oldValue) {
        if (oldValue && this.rendered) {
            this.rotate();
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        if (this.rendered) {
            value.register(this);
        }
    }

    /**
     * Triggered after the title config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        if (oldValue) {
            this.updateTitle();
        }
    }

    /**
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        if (oldValue) {
            oldValue.destroy();
        }

        value = ClassSystemUtil.beforeSetInstance(value, CircleModel);

        return value;
    }

    /**
     *
     * @returns {Object[]}
     */
    calculateItemPositions() {
        let me        = this,
            angle     = 360 / me.maxItems,
            circlePos = [],
            itemSize  = me.itemSize,
            radius    = me.innerRadius + itemSize / 2 + 4,
            i         = 0,
            len       = me.maxItems,
            nr;

        for (; i < len; i++) {
            nr = (angle * i + 180) * Math.PI / 180;

            circlePos.push({
                left: -Math.round(radius * Math.sin(nr)) - itemSize / 2,
                top :  Math.round(radius * Math.cos(nr)) - itemSize / 2
            });
        }

        return circlePos;
    }

    /**
     *
     */
    collapse() {
        let me = this;

        if (!me.collapsed) {
            me.collapsed = true;
            me.updateOuterCircle(true);
            me.updateItemOpacity(0, false);
        }
    }

    /**
     *
     * @param data
     */
    collapseItem(data) {
        let me    = this,
            item  = me.getItemEl(data.path[0].id),
            style = item.cn[0].style,
            vdom  = me.vdom;

        delete style.marginLeft;
        delete style.marginTop;
        delete style.zIndex;

        style.height = me.itemSize + 'px';
        style.width  = me.itemSize + 'px';

        me.vdom = vdom;
    }

    /**
     *
     * @param {Boolean} [silent=false]
     */
    createBacksideItems(silent=false) {
        let me         = this,
            backEl     = me.getBackEl(),
            itemCls    = ['neo-flip', 'neo-pencil', 'neo-trash'],
            itemFile   = ['flip.png', 'pencil.png', 'trash.png'],
            countItems = 3,
            i          = 0,
            vdom       = me.vdom;

        backEl.cn.push(
            {cls: ['neo-count-items']},
            {cls: ['neo-circle-name']}
        );

        for (; i < countItems; i++) {
            backEl.cn.push({
                tag: 'img',
                cls: ['neo-backside-icon', itemCls[i]],
                src: me.backsideIconPath + itemFile[i]
            });
        }

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     *
     * @param {Number} [startIndex=0]
     * @param {Boolean} [silent=false]
     */
    createItems(startIndex=0, silent=false) {
        let me            = this,
            frontEl       = me.getFrontEl(),
            itemPositions = me.calculateItemPositions(),
            countItems    = Math.min(me.store.getCount(), me.maxItems),
            i             = startIndex,
            vdom          = me.vdom;

        for (; i < countItems; i++) {
            frontEl.cn.push({
                id      : me.getItemId(i),
                cls     : ['neo-circle-item'],
                tabIndex: -1,
                style: {
                    height: me.itemSize           + 'px',
                    left  : itemPositions[i].left + 'px',
                    top   : itemPositions[i].top  + 'px',
                    width : me.itemSize           + 'px'
                },
                cn: [{
                    tag  : 'img',
                    cls  : ['neo-circle-item-image'],
                    src  : me.itemImagePath + me.store.getAt(i).image,
                    style: {
                        height: me.itemSize + 'px',
                        width : me.itemSize + 'px'
                    }
                }]
            });
        }

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     *
     */
    expand(data) {
        let me = this;

        if (me.collapsed) {
            me.collapsed = false;
            me.updateOuterCircle(true);
            me.updateItemOpacity(1, false);
        }
    }

    /**
     *
     * @param data
     */
    expandItem(data) {
        let me   = this,
            item = me.getItemEl(data.path[0].id),
            vdom = me.vdom;

        item.cn[0].style = {
            height    : (me.itemSize + 20) + 'px',
            marginLeft: -10 + 'px',
            marginTop : -10 + 'px',
            width     : (me.itemSize + 20) + 'px',
            zIndex    : 40
        };

        me.vdom = vdom;
    }

    flipCircle() {
        let me   = this,
            vdom = me.vdom;

        NeoArray[me.isFlipped ? 'remove': 'add'](vdom.cn[0].cls, 'neo-flipped');

        me.isFlipped = !me.isFlipped;
        me.vdom = vdom;
    }

    /**
     *
     */
    getBackEl() {
        return this.vdom.cn[0].cn[1];
    }

    /**
     *
     */
    getFrontEl() {
        return this.vdom.cn[0].cn[0];
    }

    /**
     *
     */
    getInnerCircle() {
        return this.vdom.cn[0].cn[0].cn[0];
    }

    /**
     *
     * @param {String} itemId
     * @returns {Object}
     */
    getItemEl(itemId) {
        let item = VDomUtil.findVdomChild(this.getFrontEl(), itemId);

        return item && item.vdom;
    }

    /**
     *
     * @param {Number} index
     * @returns {String}
     */
    getItemId(index) {
        let store = this.store;

        return this.id + '__' + store.getAt(index)[store.keyProperty];
    }

    /**
     *
     * @param {String} vnodeId
     * @returns {String|Number} itemId
     */
    getItemRecordId(vnodeId) {
        let itemId   = vnodeId.split('__')[1],
            model    = this.store.model,
            keyField = model && model.getField(model.keyProperty);

        if (keyField && keyField.type.toLowerCase() === 'number') {
            itemId = parseInt(itemId);
        }

        return itemId;
    }

    /**
     *
     */
    getOuterCircle() {
        return this.vdom.cn[0].cn[0].cn[1];
    }

    /**
     *
     */
    loadData() {
        let me = this;

        // todo: use a real store, not defined here for the examples
        Neo.Xhr.promiseJson({
            insideNeo: true,
            url      : Neo.config.isExperimental ? me.url : me.url
        }).then(data => {
            me.store.items = data.json.data;

            setTimeout(() => {
                me.updateTitle();
                me.createItems();
            }, 100);
        }).catch(err => {
            console.log('Error for Neo.Xhr.request', err, me.id);
        });
    }

    /**
     *
     * @param {Object} data
     */
    onBacksideIconClick(data) {
        let me   = this,
            path = data.path;

             if (path[0].cls.includes('neo-flip'))   {me.flipCircle();}
        else if (path[0].cls.includes('neo-pencil')) {console.log('edit circle');}
        else if (path[0].cls.includes('neo-trash'))  {console.log('delete circle');}
    }

    /**
     *
     * @param {Object} data
     */
    onContextMenu(data) {
        this.flipCircle();
    }

    /**
     *
     * @param {Object} data
     */
    onMouseWheel(data) {
        let me      = this,
            deltaY  = data.deltaY,
            rotateZ = me.rotateZ;

        if (deltaY >  1 || deltaY < -1) {rotateZ += deltaY;}

        if (rotateZ < 0) {
            rotateZ = 0;
        }

        if (!(me.rotateZ === 0 && rotateZ === 0)) {
            me.rotateZ = rotateZ;

            me.rotate();
        }
    }

    /**
     *
     */
    rotate() {
        let me             = this,
            vdom           = me.vdom,
            circleCenterEl = vdom.cn[0],
            transform = [
                'rotateX(' + me.rotateX + 'deg)',
                'rotateY(' + me.rotateY + 'deg)',
                'rotateZ(' + me.rotateZ + 'deg)'
            ].join(' ');

        if (me.circleCenterHasTransitionCls) {
            NeoArray.add(circleCenterEl.cls, 'no-transition');

            me.circleCenterHasTransitionCls = false;

            me.promiseVdomUpdate().then(() => {
                me.updateItemAngle(true);
                circleCenterEl.style.transform = transform;
                me.vdom = vdom;
            });
        } else {
            me.updateItemAngle(true);
            circleCenterEl.style.transform = transform;
            me.vdom = vdom;
        }
    }

    /**
     *
     * @param {Boolean} [silent=false]
     */
    updateInnerCircle(silent=false) {
        let me           = this,
            innerCircle  = me.getInnerCircle(),
            innerRadius  = me.innerRadius,
            innerSize    = innerRadius * 2,
            vdom         = me.vdom;

        Object.assign(innerCircle.style, {
            height: innerSize + 'px',
            left  : '-' + innerRadius + 'px',
            top   : '-' + innerRadius + 'px',
            width : innerSize + 'px'
        });

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     *
     * @param {Boolean} [silent=false]
     */
    updateItemAngle(silent=false) {
        let me      = this,
            frontEl = me.getFrontEl(),
            vdom    = me.vdom,
            i       = 2,
            len     = frontEl.cn.length;

        for (; i < len; i++) {
            frontEl.cn[i].style.transform = 'rotateZ(' + (-me.rotateZ) + 'deg)';
        }

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     *
     * @param {Number} value
     * @param {Boolean} [silent=false]
     * @param {Number} [startIndex=0]
     */
    updateItemOpacity(value, silent=false, startIndex=0) {
        let me      = this,
            i       = startIndex + 2,
            frontEl = me.getFrontEl(),
            len     = frontEl.cn.length,
            vdom    = me.vdom;

        for (; i < len; i++) {
            frontEl.cn[i].style.opacity = value;
        }

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     *
     * @param {Boolean} [silent=false]
     */
    updateItemPositions(silent=false) {
        let me            = this,
            frontEl       = me.getFrontEl(),
            itemPositions = me.calculateItemPositions(),
            itemSize      = me.itemSize,
            vdom          = me.vdom,
            i             = 2,
            len           = Math.min(frontEl.cn.length, itemPositions.length + 2);

        for (; i < len; i++) {
            Object.assign(frontEl.cn[i].style, {
                height: itemSize                + 'px',
                left  : itemPositions[i-2].left + 'px',
                top   : itemPositions[i-2].top  + 'px',
                width : itemSize                + 'px'
            });

            Object.assign(frontEl.cn[i].cn[0].style, {
                height: itemSize + 'px',
                width : itemSize + 'px'
            });
        }

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }

    /**
     *
     * @param {Boolean} [silent=false]
     */
    updateOuterCircle(silent=false) {
        let me           = this,
            itemSize = me.itemSize,
            outerCircle  = me.getOuterCircle(),
            outerRadius  = me.innerRadius + me.outerRadiusDelta,
            outerSize    = me.collapsed ? outerRadius * 2 : (outerRadius + itemSize) * 2,
            vdom         = me.vdom,
            opts;

        if (me.collapsed) {
            opts = {
                height: outerSize + 'px',
                left  : '-' + outerRadius + 'px',
                top   : '-' + outerRadius + 'px',
                width : outerSize + 'px'
            };
        } else {
            opts = {
                height: outerSize + 'px',
                left  : '-' + (outerRadius + itemSize) + 'px',
                top   : '-' + (outerRadius + itemSize) + 'px',
                width : outerSize + 'px'
            };
        }

        Object.assign(outerCircle.style, opts);

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }
    
    /**
     *
     * @param {Boolean} [silent=false]
     */
    updateTitle(silent=false) {
        let me          = this,
            innerCircle = me.getInnerCircle(),
            vdom        = me.vdom;

        innerCircle.cn[0].html = me.store && me.store.getCount() || 0;
        innerCircle.cn[1].html = me.title;

        me[silent ? '_vdom' : 'vdom'] = vdom;
    }
}

Neo.applyClassConfig(Circle);

export {Circle as default};