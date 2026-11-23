import DateUtil           from '../../../util/Date.mjs';
import DragProxyComponent from '../../../draggable/DragProxyComponent.mjs';
import DragZone           from '../../../draggable/DragZone.mjs';
import NeoArray           from '../../../util/Array.mjs';
import VDomUtil           from '../../../util/VDom.mjs';

/**
 * @class Neo.calendar.view.month.EventDragZone
 * @extends Neo.draggable.DragZone
 */
class EventDragZone extends DragZone {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.month.EventDragZone'
         * @protected
         */
        className: 'Neo.calendar.view.month.EventDragZone',
        /**
         * @member {Boolean} addDragProxyCls=false
         */
        addDragProxyCls: false,
        /**
         * Time in minutes
         * @member {Number} eventDuration=0
         */
        eventDuration: 0,
        /**
         * @member {Object|null} eventRecord=null
         */
        eventRecord: null,
        /**
         * @member {Boolean} moveHorizontal=false
         */
        moveHorizontal: false,
        /**
         * @member {Boolean} moveInMainThread=false
         */
        moveInMainThread: false,
        /**
         * @member {Boolean} moveVertical=false
         */
        moveVertical: false,
        /**
         * @member {Number} scrollFactorTop=3
         */
        scrollFactorTop: 3,
        /**
         * @member {Boolean} useProxyWrapper=false
         */
        useProxyWrapper: false
    }

    /**
     * @summary Adds the `neo-cursor-move` class to `document.body` when a month event drag starts.
     */
    addBodyCursorCls() {
        Neo.applyDeltas(this.windowId, {id: 'document.body', cls: {add: ['neo-cursor-move']}})
    }

    /**
     * @summary Moves the mounted drag proxy into the newly hovered `.neo-day` cell right below `.neo-day-number`.
     * @param {String|null} value
     * @param {String|null} oldValue
     * @protected
     */
    afterSetProxyParentId(value, oldValue) {
        if (value && oldValue !== undefined) {
            let me = this;

            if (me.dragProxy?.vdom.cn?.[0]?.id) {
                Neo.applyDeltas(me.windowId, {
                    action  : 'moveNode',
                    id      : me.dragProxy.id,
                    index   : 1,
                    parentId: value
                })
            }
        }
    }

    /**
     * @summary Clones the dragged month event node into a focused DragProxyComponent mounted inside the active `.neo-day` cell.
     * @param {Object} data
     * @param {Boolean} [createComponent=true]
     * @returns {Promise<Object|Neo.draggable.DragProxyComponent>}
     */
    async createDragProxy(data, createComponent=true) {
        let me        = this,
            component = Neo.getComponent(me.getDragElementRoot().id) || me.owner,
            vdom      = me.dragProxyConfig?.vdom,
            clone     = VDomUtil.clone(vdom ? vdom : me.dragElement);

        const config = {
            module          : DragProxyComponent,
            appName         : me.appName,
            moveInMainThread: me.moveInMainThread,
            parentId        : me.proxyParentId,
            windowId        : me.windowId,

            ...me.dragProxyConfig,

            vdom: me.useProxyWrapper ? {cn: [clone]} : clone
        };

        config.cls = config.cls || [];

        config.cls.push('neo-focus');

        if (component) {
            let theme = component.getTheme?.();

            theme && config.cls.push(theme)
        }

        if (clone.cls && !me.useProxyWrapper) {
            config.cls.push(...clone.cls)
        }

        if (me.addDragProxyCls) {
            NeoArray.add(config.cls, me.dragProxyCls)
        }

        if (createComponent) {
            return me.dragProxy = Neo.create(config)
        }

        return config
    }

    /**
     * @summary Commits the dragged event's new start and end dates from the target `.neo-day` cell on drop, or skips the commit when `data.cancelled` is set and re-renders the month view from the unchanged record.
     * @param {Object} [data]
     */
    dragEnd(data) {
        let me              = this,
            {owner}         = me,
            proxyParentId   = me.proxyParentId,
            record          = me.eventRecord,
            targetDayResult = proxyParentId && owner?.vdom && VDomUtil.find(owner.vdom, proxyParentId),
            dayFlag         = targetDayResult?.vdom?.flag || (proxyParentId?.includes('__day__') ? proxyParentId.split('__day__')[1] : null),
            day, endDate, month, startDate, year;

        super.dragEnd(data);

        if (data?.cancelled) {
            me.removeBodyCursorCls();
            owner?.createContent()
        } else if (record && dayFlag) {
            [year, month, day] = dayFlag.split('-').map(Number);

            startDate = DateUtil.clone(record.startDate);
            startDate.setFullYear(year, month - 1, day);

            endDate = DateUtil.clone(startDate);
            endDate.setMinutes(endDate.getMinutes() + me.eventDuration);

            // A drop back onto the starting day changes no field and fires no recordChange: the proxy teardown
            // still needs one restore pass. A moved drop re-renders through the store's recordChange listeners.
            if (+record.startDate === +startDate && +record.endDate === +endDate) owner?.createContent();

            record.set({endDate, startDate})
        }

        Object.assign(me, {
            eventDuration: 0,
            proxyParentId: null
        })
    }

    /**
     * @summary Updates `proxyParentId` when the pointer moves over a `.neo-day` cell in `data.targetPath`.
     * @param {Object} data
     */
    dragMove(data) {
        let me   = this,
            path = data.targetPath || [],
            i    = 0,
            len  = path.length;

        if (me.dragProxy) {
            for (; i < len; i++) {
                if (path[i].cls?.includes('neo-day')) {
                    me.proxyParentId = path[i].id;
                    break
                }
            }
        }
    }

    /**
     * @summary Syncs main-thread DragDrop configs, measures the dragged event rect, creates the proxy, and runs initial target resolution.
     * @param {Object} data
     */
    async dragStart(data) {
        let me        = this,
            [, rects] = await Promise.all([
                Neo.main.addon.DragDrop?.setConfigs({
                    appName : me.appName,
                    windowId: me.windowId,
                    ...me.getMainThreadConfigs()
                }),
                me.owner.getDomRect([me.getDragElementRoot().id, data.path[1].id])
            ]),
            eventDuration = (me.eventRecord.endDate - me.eventRecord.startDate) / 60 / 1000,
            rect          = rects?.[0] || me.getDragElementRect(data) || {height: 0, left: 0, top: 0, width: 0, x: 0, y: 0},
            offsetX       = data.clientX - rect.left,
            offsetY       = data.clientY - rect.top;

        Object.assign(me, {
            dragElementRect: rect,
            eventDuration,
            offsetX,
            offsetY
        });

        await me.createDragProxy(rect);

        me.fire('dragStart', {
            dragElementRect: rect,
            id             : me.id,
            offsetX,
            offsetY
        });

        me.dragMove(data)
    }

    /**
     * @summary Removes the `neo-cursor-move` class from `document.body` when a month event drag ends.
     */
    removeBodyCursorCls() {
        Neo.applyDeltas(this.windowId, {id: 'document.body', cls: {remove: ['neo-cursor-move']}})
    }
}

export default Neo.setupClass(EventDragZone);
