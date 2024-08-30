import ClassSystemUtil from '../util/ClassSystem.mjs';
import CircleModel     from '../selection/CircleModel.mjs';
import Collection      from '../collection/Base.mjs';
import Component       from './Base.mjs';
import NeoArray        from '../util/Array.mjs';
import VDomUtil        from '../util/VDom.mjs';

let DragZone;

/**
 * @class Neo.component.Circle
 * @extends Neo.component.Base
 */
class Circle extends Component {
    static config = {
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
         * @member {String[]} baseCls=['neo-circle-component']
         */
        baseCls: ['neo-circle-component'],
        /**
         * @member {Boolean} circleCenterHasTransitionCls=true
         * @protected
         */
        circleCenterHasTransitionCls: true,
        /**
         * @member {Boolean} collapsed=true
         */
        collapsed: true,
        /**
         * @member {Boolean} draggable_=true
         */
        draggable_: true,
        /**
         * Additional used keys for the selection model
         * @member {Object} keys={}
         */
        keys: {},
        /**
         * @member {Number} innerRadius_=100
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
         * @member {Number} itemSize_=60
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
        rotateX_: 0,
        /**
         * @member {Number} rotateY_=0
         */
        rotateY_: 0,
        /**
         * @member {Number} rotateZ_=0
         */
        rotateZ_: 0,
        /**
         * @member {Number} rotationIndex_=0
         */
        rotationIndex_: 0,
        /**
         * @member {Neo.selection.Model|null} selectionModel_=null
         */
        selectionModel_: null,
        /**
         * @member {Neo.collection.Base|null} store_=null
         */
        store_: null,
        /**
         * @member {String} title_='Circle 1'
         */
        title_: 'Circle 1',
        /**
         * The url for the store to load the data
         * @member {String} url_='../resources/examples/data/circles/group1.json'
         */
        url_: '../../resources/examples/data/circles/group1.json',
        /**
         * @member {Object} _vdom
         */
        _vdom:
        {tabIndex: -1, cn: [
            {cls: ['neo-circle-center'], style: {}, cn: [
                {cls: ['neo-circle-front'], cn: [
                    {cls: ['neo-circle'], style: {}, cn: [
                        {cls: ['neo-count-items']},
                        {cls: ['neo-circle-name']}
                    ]},
                    {cls: ['neo-outer-circle'], style: {}}
                ]},
                {cls: ['neo-circle-back'], cn: []}
            ]}
        ]}
    }

    /**
     * @param {Object} config
     */
    construct(config) {
        super.construct(config);

        Neo.main.DomEvents.registerPreventDefaultTargets({
            name: 'contextmenu',
            cls : ['neo-circle', 'neo-circle-back']
        });

        let me              = this,
            {resourcesPath} = Neo.config;

        if (!me.backsideIconPath) {
            me.backsideIconPath = resourcesPath + 'images/circle/'
        }

        if (!me.itemImagePath) {
            me.itemImagePath = resourcesPath + 'examples/'
        }

        me.addDomListeners([{
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
        }]);

        me.store = Neo.create(Collection, {
            keyProperty: 'id'
        });

        // silent updates
        me.createBacksideItems(true);
        me.updateInnerCircle(true);
        me.updateOuterCircle(true);
        me.updateTitle(true);

        me.update()
    }

    /**
     * Triggered after the draggable config got changed
     * @param {Boolean} value
     * @param {Boolean} oldValue
     * @protected
     */
    afterSetDraggable(value, oldValue) {
        let me           = this,
            domListeners = [];

        value && import('../draggable/DragZone.mjs').then(module => {
            DragZone = module.default;

            if (!me.dragListenersAdded) {
                domListeners.push(
                    {'drag:end'  : me.onDragEnd,   scope: me, delegate: 'neo-circle-item'},
                    {'drag:start': me.onDragStart, scope: me, delegate: 'neo-circle-item'}
                );

                me.addDomListeners(domListeners);
                me.dragListenersAdded = true
            }
        })
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
            me.updateOuterCircle(false)
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
                frontEl = me.getFrontEl();

            if (value < oldValue) {
                if (me.collapsed) {
                    frontEl.cn.splice(value + 2);
                } else {
                    me.updateItemOpacity(0, true, value);

                    me.timeout(300).then(() => {
                        frontEl.cn.splice(value + 2);
                        me.update()
                    })
                }

                me.updateItemPositions(true);
                me.update()
            } else {
                me.createItems(oldValue, true);
                me.updateItemPositions(true);

                me.promiseUpdate().then(() => {
                    if (!me.collapsed) {
                        me.updateItemOpacity(1, true, oldValue);
                        me.update()
                    }
                })
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
            !me.collapsed && me.updateOuterCircle(true);
            me.updateItemPositions()
        }
    }

    /**
     * Triggered after the rotateX config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRotateX(value, oldValue) {
        oldValue && this.rendered && this.rotate()
    }

    /**
     * Triggered after the rotateY config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRotateY(value, oldValue) {
        oldValue && this.rendered && this.rotate()
    }

    /**
     * Triggered after the rotateZ config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRotateZ(value, oldValue) {
        oldValue && this.rendered && this.rotate()
    }

    /**
     * Triggered after the rotationIndex config got changed
     * @param {Number} value
     * @param {Number} oldValue
     * @protected
     */
    afterSetRotationIndex(value, oldValue) {
        if (Neo.isNumber(oldValue)) {
            console.log('afterSetRotationIndex', value)
        }
    }

    /**
     * Triggered after the selectionModel config got changed
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    afterSetSelectionModel(value, oldValue) {
        this.rendered && value.register(this);
    }

    /**
     * Triggered after the title config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetTitle(value, oldValue) {
        oldValue && this.updateTitle()
    }

    /**
     * Triggered before the selectionModel config gets changed.
     * @param {Neo.selection.Model} value
     * @param {Neo.selection.Model} oldValue
     * @protected
     */
    beforeSetSelectionModel(value, oldValue) {
        oldValue && oldValue.destroy();

        return ClassSystemUtil.beforeSetInstance(value, CircleModel)
    }

    /**
     * @returns {Object[]}
     */
    calculateItemPositions() {
        let me         = this,
            angle      = 360 / me.maxItems,
            circlePos  = [],
            {itemSize} = me,
            radius     = me.innerRadius + itemSize / 2 + 4,
            i          = 0,
            len        = me.maxItems,
            nr;

        for (; i < len; i++) {
            nr = (angle * i + 180) * Math.PI / 180;

            circlePos.push({
                left: -Math.round(radius * Math.sin(nr)) - itemSize / 2,
                top :  Math.round(radius * Math.cos(nr)) - itemSize / 2
            })
        }

        return circlePos
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
     * @param {Object} data
     */
    collapseItem(data) {
        let me    = this,
            item  = me.getItemEl(data.path[0].id),
            style = item.cn[0].style;

        delete style.marginLeft;
        delete style.marginTop;
        delete style.zIndex;

        style.height = me.itemSize + 'px';
        style.width  = me.itemSize + 'px';

        me.update()
    }

    /**
     * @param {Boolean} silent=false
     */
    createBacksideItems(silent=false) {
        let me         = this,
            backEl     = me.getBackEl(),
            itemCls    = ['neo-flip', 'neo-pencil', 'neo-trash'],
            itemFile   = ['flip.png', 'pencil.png', 'trash.png'],
            countItems = 3,
            i          = 0;

        backEl.cn.push(
            {cls: ['neo-count-items']},
            {cls: ['neo-circle-name']}
        );

        for (; i < countItems; i++) {
            backEl.cn.push({
                tag: 'img',
                cls: ['neo-backside-icon', itemCls[i]],
                src: me.backsideIconPath + itemFile[i]
            })
        }

        !silent && me.update()
    }

    /**
     * @param {Number} startIndex=0
     * @param {Boolean} silent=false
     */
    createItems(startIndex=0, silent=false) {
        let me            = this,
            frontEl       = me.getFrontEl(),
            itemCls       = ['neo-circle-item'],
            itemPositions = me.calculateItemPositions(),
            {itemSize}    = me,
            countItems    = Math.min(me.store.getCount(), me.maxItems),
            i             = startIndex;

        me.draggable && itemCls.push('neo-draggable');

        for (; i < countItems; i++) {
            frontEl.cn.push({
                id      : me.getItemId(i),
                cls     : itemCls,
                tabIndex: -1,
                style: {
                    height: itemSize              + 'px',
                    left  : itemPositions[i].left + 'px',
                    top   : itemPositions[i].top  + 'px',
                    width : itemSize              + 'px'
                },
                cn: [{
                    tag  : 'img',
                    cls  : ['neo-circle-item-image'],
                    src  : me.itemImagePath + me.store.getAt(i).image,
                    style: {
                        height: itemSize + 'px',
                        width : itemSize + 'px'
                    }
                }]
            })
        }

        !silent && me.update()
    }

    /**
     * @param {Object} data
     */
    expand(data) {
        let me = this;

        if (me.collapsed) {
            me.collapsed = false;
            me.updateOuterCircle(true);
            me.updateItemOpacity(1, false)
        }
    }

    /**
     * @param {Object} data
     */
    expandItem(data) {
        let me   = this,
            item = me.getItemEl(data.path[0].id);

        item.cn[0].style = {
            height    : (me.itemSize + 20) + 'px',
            marginLeft: -10 + 'px',
            marginTop : -10 + 'px',
            width     : (me.itemSize + 20) + 'px',
            zIndex    : 40
        };

        me.update()
    }

    flipCircle() {
        let me = this;

        NeoArray[me.isFlipped ? 'remove': 'add'](me.vdom.cn[0].cls, 'neo-flipped');

        me.isFlipped = !me.isFlipped;
        me.update()
    }

    /**
     *
     */
    getBackEl() {
        return this.vdom.cn[0].cn[1]
    }

    /**
     *
     */
    getFrontEl() {
        return this.vdom.cn[0].cn[0]
    }

    /**
     *
     */
    getInnerCircle() {
        return this.vdom.cn[0].cn[0].cn[0]
    }

    /**
     * @param {String} itemId
     * @returns {Object}
     */
    getItemEl(itemId) {
        let item = VDomUtil.findVdomChild(this.getFrontEl(), itemId);

        return item?.vdom
    }

    /**
     * @param {Number} index
     * @returns {String}
     */
    getItemId(index) {
        let {store} = this;

        return this.id + '__' + store.getAt(index)[store.keyProperty]
    }

    /**
     * @param {String} vnodeId
     * @returns {String|Number} itemId
     */
    getItemRecordId(vnodeId) {
        let itemId   = vnodeId.split('__').pop(),
            model    = this.store.model,
            keyField = model?.getField(model.keyProperty);

        if (keyField?.type.toLowerCase() === 'number') {
            itemId = parseInt(itemId)
        }

        return itemId
    }

    /**
     *
     */
    getOuterCircle() {
        return this.vdom.cn[0].cn[0].cn[1]
    }

    /**
     *
     */
    loadData() {
        let me = this;

        // todo: use a real store, not defined here for the examples
        Neo.Xhr.promiseJson({
            insideNeo: true,
            url      : me.url
        }).then(data => {
            me.store.items = data.json.data;

            me.timeout(100).then(() => {
                me.updateTitle();
                me.createItems()
            })
        }).catch(err => {
            console.log('Error for Neo.Xhr.request', err, me.id)
        })
    }

    /**
     * @param {Object} data
     */
    onBacksideIconClick(data) {
        let me  = this,
            cls = data.path[0].cls;

             if (cls.includes('neo-flip'))   {me.flipCircle()}
        else if (cls.includes('neo-pencil')) {console.log('edit circle')}
        else if (cls.includes('neo-trash'))  {console.log('delete circle')}
    }

    /**
     *
     */
    onConstructed() {
        super.onConstructed();

        let me = this;

        me.selectionModel?.register(me);
        me.loadData()
    }

    /**
     * @param {Object} data
     */
    onContextMenu(data) {
        this.flipCircle()
    }

    /**
     * @param data
     */
    onDragEnd(data) {
        console.log('onDragEnd', data)
    }

    /**
     * @param data
     */
    onDragStart(data) {
        console.log('onDragStart', data)

        let me           = this,
            wrapperStyle = me.wrapperStyle || {};

        me.isDragging = true;

        if (!me.dragZone) {
            me.dragZone = Neo.create({
                module         : DragZone,
                appName        : me.appName,
                bodyCursorStyle: 'move !important',
                dragElement    : me.vdom,
                dragProxyConfig: {vdom: me.getProxyVdom()},
                owner          : me,
                useProxyWrapper: false,
                windowId       : me.windowId,
                ...me.dragZoneConfig
            })
        }

        me.dragZone.dragStart(data);

        wrapperStyle.opacity = 0.7;

        me.wrapperStyle = wrapperStyle
    }

    /**
     * @param {Object} data
     */
    onMouseWheel(data) {
        let me        = this,
            deltaY    = data.deltaY,
            itemAngle = 360 / me.maxItems,
            maxAngle  = Math.max(0, (me.store.getCount() - me.maxItems) * itemAngle),
            rotateZ   = me.rotateZ;

        if (deltaY >  1 || deltaY < -1) {
            rotateZ += deltaY
        }

        if (rotateZ < 0) {
            rotateZ = 0;
        } else if (rotateZ > maxAngle) {
            rotateZ = maxAngle
        }

        if (!(me.rotateZ === 0 && rotateZ === 0) && !(me.rotateZ === maxAngle && rotateZ === maxAngle)) {
            me.rotateZ       = rotateZ;
            me.rotationIndex = Math.floor(rotateZ / itemAngle);

            me.rotate()
        }
    }

    /**
     *
     */
    rotate() {
        let me             = this,
            circleCenterEl = me.vdom.cn[0],
            transform = [
                `rotateX(${me.rotateX}deg)`,
                `rotateY(${me.rotateY}deg)`,
                `rotateZ(${me.rotateZ}deg)`
            ].join(' ');

        if (me.circleCenterHasTransitionCls) {
            NeoArray.add(circleCenterEl.cls, 'no-transition');

            me.circleCenterHasTransitionCls = false;

            me.promiseUpdate().then(() => {
                me.updateItemAngle(true);
                circleCenterEl.style.transform = transform;
                me.update()
            })
        } else {
            me.updateItemAngle(true);
            circleCenterEl.style.transform = transform;
            me.update()
        }
    }

    /**
     * @param {Boolean} silent=false
     */
    updateInnerCircle(silent=false) {
        let me            = this,
            innerCircle   = me.getInnerCircle(),
            {innerRadius} = me,
            innerSize     = innerRadius * 2;

        Object.assign(innerCircle.style, {
            height: innerSize + 'px',
            left  : '-' + innerRadius + 'px',
            top   : '-' + innerRadius + 'px',
            width : innerSize + 'px'
        });

        !silent && me.update()
    }

    /**
     * @param {Boolean} silent=false
     */
    updateItemAngle(silent=false) {
        let me      = this,
            frontEl = me.getFrontEl(),
            i       = 2,
            len     = frontEl.cn.length;

        for (; i < len; i++) {
            frontEl.cn[i].style.transform = 'rotateZ(' + (-me.rotateZ) + 'deg)'
        }

        !silent && me.update()
    }

    /**
     * @param {Number} value
     * @param {Boolean} silent=false
     * @param {Number} startIndex=0
     */
    updateItemOpacity(value, silent=false, startIndex=0) {
        let me      = this,
            i       = startIndex + 2,
            frontEl = me.getFrontEl(),
            len     = frontEl.cn.length;

        for (; i < len; i++) {
            frontEl.cn[i].style.opacity = value;
        }

        !silent && me.update()
    }

    /**
     * @param {Boolean} silent=false
     */
    updateItemPositions(silent=false) {
        let me            = this,
            frontEl       = me.getFrontEl(),
            itemPositions = me.calculateItemPositions(),
            {itemSize}    = me,
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
            })
        }

        !silent && me.update()
    }

    /**
     * @param {Boolean} silent=false
     */
    updateOuterCircle(silent=false) {
        let me           = this,
            {itemSize}   = me,
            outerCircle  = me.getOuterCircle(),
            outerRadius  = me.innerRadius + me.outerRadiusDelta,
            outerSize    = me.collapsed ? outerRadius * 2 : (outerRadius + itemSize) * 2,
            opts;

        if (me.collapsed) {
            opts = {
                height: outerSize + 'px',
                left  : '-' + outerRadius + 'px',
                top   : '-' + outerRadius + 'px',
                width : outerSize + 'px'
            }
        } else {
            opts = {
                height: outerSize + 'px',
                left  : '-' + (outerRadius + itemSize) + 'px',
                top   : '-' + (outerRadius + itemSize) + 'px',
                width : outerSize + 'px'
            }
        }

        Object.assign(outerCircle.style, opts);

        !silent && me.update()
    }

    /**
     * @param {Boolean} silent=false
     */
    updateTitle(silent=false) {
        let me          = this,
            innerCircle = me.getInnerCircle();

        innerCircle.cn[0].html = me.store?.getCount() || 0;
        innerCircle.cn[1].html = me.title;

        !silent && me.update()
    }
}

export default Neo.setupClass(Circle);
