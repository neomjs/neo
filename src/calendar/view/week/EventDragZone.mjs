import DragProxyComponent from '../../../draggable/DragProxyComponent.mjs';
import DragZone           from '../../../draggable/DragZone.mjs';
import NeoArray           from '../../../util/Array.mjs';
import VDomUtil           from '../../../util/VDom.mjs';

/**
 * @class Neo.calendar.view.week.EventDragZone
 * @extends Neo.draggable.DragZone
 */
class EventDragZone extends DragZone {
    static getConfig() {return {
        /**
         * @member {String} className='Neo.calendar.view.week.EventDragZone'
         * @protected
         */
        className: 'Neo.calendar.view.week.EventDragZone',
        /**
         * @member {String} ntype='calendar-week-event-dragzone'
         * @protected
         */
        ntype: 'calendar-week-event-dragzone',
        /**
         * @member {Boolean} addDragProxyCls=false
         */
        addDragProxyCls: false,
        /**
         * @member {Number} axisEndTime=0
         */
        axisEndTime: 0,
        /**
         * @member {Number} axisStartTime=0
         */
        axisStartTime: 0,
        /**
         * @member {Number} columnHeight=0
         */
        columnHeight: 0,
        /**
         * @member {Number} columnTop=0
         */
        columnTop: 0,
        /**
         * @member {Number} currentInterval=0
         */
        currentInterval: 0,
        /**
         * time in minutes
         * @member {Number} eventDuration=0
         */
        eventDuration: 0,
        /**
         * @member {Object} eventRecord=null
         */
        eventRecord: null,
        /**
         * time in minutes
         * @member {Number} intervalSize=15
         */
        intervalSize: 15,
        /**
         * @member {Boolean} keepEndDate=false
         */
        keepEndDate: false,
        /**
         * @member {Boolean} keepStartDate=false
         */
        keepStartDate: false,
        /**
         * @member {Boolean} moveHorizontal=false
         */
        moveHorizontal: false,
        /**
         * @member {Boolean} moveInMainThread=false
         */
        moveInMainThread: false,
        /**
         * @member {Date} newEndDate=null
         */
        newEndDate: null,
        /**
         * @member {Number} scrollFactorLeft=3
         */
        scrollFactorLeft: 3,
        /**
         * @member {Boolean} useProxyWrapper=false
         */
        useProxyWrapper: false
    }}

    /**
     *
     */
    addBodyCursorCls() {
        Neo.applyDeltas(this.appName, {id: 'document.body', cls: {add: ['neo-cursor-move']}});
    }

    /**
     * Triggered after the proxyParentId config got changed
     * @param {String} value
     * @param {String} oldValue
     * @protected
     */
    afterSetProxyParentId(value, oldValue) {
        if (value && oldValue !== undefined) {
            let me = this;

            // check if the node did not get removed yet
            if (me.dragProxy && me.dragProxy.vdom.cn[0].id) {
                Neo.applyDeltas(me.appName, {
                    action  : 'moveNode',
                    id      : me.dragProxy.id,
                    index   : 0,
                    parentId: value
                });
            }
        }
    }

    /**
     *
     * @param {Object} data
     */
    createDragProxy(data) {
        let me        = this,
            component = Neo.getComponent(me.getDragElementRoot().id) || me.owner,
            vdom      = me.dragProxyConfig && me.dragProxyConfig.vdom,
            clone     = VDomUtil.clone(vdom ? vdom : me.dragElement);

            clone.cn[2].removeDom = false;

        const config = {
            module          : DragProxyComponent,
            appName         : me.appName,
            moveInMainThread: me.moveInMainThread,
            parentId        : me.proxyParentId,

            ...me.dragProxyConfig || {},

            vdom: me.useProxyWrapper ? {cn: [clone]} : clone // we want to override dragProxyConfig.vdom if needed
        };

        config.cls = config.cls || [];

        config.cls.push('neo-focus');

        if (component) {
            config.cls.push(component.getTheme());
        }

        if (clone.cls && !me.useProxyWrapper) {
            config.cls.push(...clone.cls);
        }

        if (me.addDragProxyCls) {
            NeoArray.add(config.cls, me.dragProxyCls);
        }

        Object.assign(config.style, {
            height: `${data.height}px`,
            top   : `${data.y - me.columnTop}px`,
            width : `${data.width}px`
        });

        me.dragProxy = Neo.create(config);
    }

    /**
     * DragEnd equals drop, since we can only drag to valid positions
     * todo: ESC key
     * @param {Object} data
     */
    dragEnd(data) {
        super.dragEnd(data);

        let me     = this,
            record = me.eventRecord,
            endDate, startDate;

        if (me.keepStartDate) {
            endDate   = me.newEndDate;
            startDate = record.startDate;
        } else {
            startDate = new Date(VDomUtil.findVdomChild(me.owner.vdom, me.proxyParentId).vdom.flag);
            startDate.setHours(me.axisStartTime);
            startDate.setMinutes(me.currentInterval * me.intervalSize);

            if (me.keepEndDate) {
                endDate = record.endDate;
            } else {
                endDate = new Date(startDate.valueOf());
                endDate.setMinutes(endDate.getMinutes() + me.eventDuration);
            }
        }

        if (!me.keepEndDate) {
            // if an event ends at 24:00, change it to 23:59 => otherwise the day increases by 1
            if (endDate.getHours() === 0 && endDate.getMinutes() === 0) {
                endDate.setMinutes(endDate.getMinutes() - 1);
            }
        }

        record.endDate   = endDate;
        record.startDate = startDate;

        Object.assign(me, {
            keepEndDate  : false,
            keepStartDate: false,
            newEndDate   : null,
            proxyParentId: null
        });

        me.owner.updateEvents();
    }

    /**
     *
     * @param {Object} data
     */
    dragMove(data) {
        let me            = this,
            axisEndTime   = me.axisEndTime,
            axisStartTime = me.axisStartTime,
            columnHeight  = me.columnHeight,
            eventDuration = me.eventDuration,
            i             = 0,
            intervalSize  = me.intervalSize,
            keepEndDate   = me.keepEndDate,
            keepStartDate = me.keepStartDate,
            path          = data.targetPath,
            len           = path.length,
            owner         = me.owner,
            record        = me.eventRecord,
            axisStartDate, currentInterval, deltas, duration, endTime, height, intervalHeight, intervals, position, startInterval, startTime;

        if (me.dragProxy) {
            if (!keepEndDate && !keepStartDate) {
                for (; i < len; i++) {
                    if (path[i].cls.includes('neo-c-w-column')) {
                        me.proxyParentId = path[i].id;
                        break;
                    }
                }
            }

            intervals      = (axisEndTime - axisStartTime) * 60 / intervalSize; // 15 minutes each
            intervalHeight = columnHeight / intervals;

            position = Math.min(columnHeight, data.clientY - me.offsetY - me.columnTop);

            currentInterval = Math.floor(position / intervalHeight);

            if (!keepEndDate) {
                // events must not end after the last visible interval
                currentInterval = Math.min(currentInterval, intervals - (eventDuration / intervalSize));
            }

            if (keepEndDate || keepStartDate) {
                axisStartDate = new Date(record.startDate.valueOf());
                axisStartDate.setHours(axisStartTime);
                axisStartDate.setMinutes(0);

                startInterval = (record.startDate - axisStartDate) / intervalSize / 60 / 1000;

                if (keepEndDate) {
                    currentInterval = Math.min(currentInterval, startInterval + (eventDuration / intervalSize) - owner.minimumEventDuration / intervalSize);
                } else if (keepStartDate) {
                    currentInterval = Math.max(currentInterval, startInterval - (eventDuration / intervalSize) + owner.minimumEventDuration / intervalSize);
                }
            }

            if (!keepStartDate) {
                // events must not start before the first visible interval
                currentInterval = Math.max(0, currentInterval);
            }

            if (me.currentInterval !== currentInterval) {
                deltas = [{
                    id   : me.dragProxy.id,
                    style: {}
                }];

                endTime   = new Date(record.endDate.valueOf());
                startTime = new Date(record.startDate.valueOf());

                if (!keepEndDate) {
                    endTime.setHours(axisStartTime);
                    endTime.setMinutes(eventDuration + currentInterval * intervalSize);
                }

                if (keepStartDate) {
                    me.newEndDate = endTime;
                    duration = (endTime - record.startDate) / 60 / 60 / 1000; // duration in hours
                } else {
                    startTime.setHours(axisStartTime);
                    startTime.setMinutes(currentInterval * intervalSize);

                    position = currentInterval * intervalHeight; // snap to valid intervals
                    position = position / columnHeight * 100;

                    deltas[0].style.top = `calc(${position}% + 1px)`;
                }

                if (keepEndDate) {
                    duration = (record.endDate - startTime) / 60 / 60 / 1000; // duration in hours
                } else {
                    deltas.push({
                        id       : me.dragProxy.vdom.cn[2].id,
                        innerHTML: owner.intlFormat_time.format(endTime)
                    });
                }

                if (keepEndDate || keepStartDate) {
                    height = Math.round(duration / (axisEndTime - axisStartTime) * 100 * 1000) / 1000;
                    deltas[0].style.height = `calc(${height}% - 2px)`;
                }

                deltas.push({
                    id       : me.dragProxy.vdom.cn[0].id,
                    innerHTML: owner.intlFormat_time.format(startTime)
                });

                // check if the node did not get removed yet
                if (me.dragProxy.vdom.cn[0].id) {
                    Neo.currentWorker.promiseMessage('main', {
                        action: 'updateDom',
                        deltas: deltas
                    });
                }
            }

            me.currentInterval = currentInterval;
        }
    }

    /**
     *
     * @param {Object} data
     */
    dragStart(data) {
        let me = this,
            offsetX, offsetY;

        Neo.main.DomAccess.getBoundingClientRect({
            id: [me.getDragElementRoot().id, data.path[1].id]
        }).then(rects => {
            offsetX = data.clientX - rects[0].left;
            offsetY = data.clientY - rects[0].top;

            Object.assign(me, {
                columnHeight   : rects[1].height,
                columnTop      : rects[1].top,
                dragElementRect: rects[0],
                eventDuration  : (me.eventRecord.endDate - me.eventRecord.startDate) / 60 / 1000,
                offsetX        : offsetX,
                offsetY        : offsetY
            });

            me.createDragProxy(rects[0]);

            me.fire('dragStart', {
                dragElementRect: rects[0],
                id             : me.id,
                offsetX        : offsetX,
                offsetY        : offsetY
            });

            me.dragMove(data);
        });
    }

    /**
     *
     */
    removeBodyCursorCls() {
        Neo.applyDeltas(this.appName, {id: 'document.body', cls: {remove: ['neo-cursor-move']}});
    }
}

Neo.applyClassConfig(EventDragZone);

export {EventDragZone as default};
