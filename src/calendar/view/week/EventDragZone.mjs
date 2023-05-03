import DateUtil           from '../../../util/Date.mjs';
import DragProxyComponent from '../../../draggable/DragProxyComponent.mjs';
import DragZone           from '../../../draggable/DragZone.mjs';
import NeoArray           from '../../../util/Array.mjs';
import VDomUtil           from '../../../util/VDom.mjs';

/**
 * @class Neo.calendar.view.week.EventDragZone
 * @extends Neo.draggable.DragZone
 */
class EventDragZone extends DragZone {
    static config = {
        /**
         * @member {String} className='Neo.calendar.view.week.EventDragZone'
         * @protected
         */
        className: 'Neo.calendar.view.week.EventDragZone',
        /**
         * @member {Boolean} addDragProxyCls=false
         */
        addDragProxyCls: false,
        /**
         * @member {Boolean} enableResizingAcrossOppositeEdge=true
         */
        enableResizingAcrossOppositeEdge: true,
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
         * Internal flag.
         * If we resize across the opposite edge and then back, we need to update the related edge position once.
         * @member {Boolean} forceUpdate=false
         * @protected
         */
        forceUpdate: false,
        /**
         * Internal flag
         * @member {Boolean} hasOverflow=false
         * @protected
         */
        hasOverflow: false,
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
         * Internal flag.
         * @member {Date} newEndDate=null
         * @protected
         */
        newEndDate: null,
        /**
         * Internal flag.
         * @member {Date} newStartDate=null
         * @protected
         */
        newStartDate: null,
        /**
         * @member {Number} scrollFactorLeft=3
         */
        scrollFactorLeft: 3,
        /**
         * @member {Boolean} useProxyWrapper=false
         */
        useProxyWrapper: false
    }

    /**
     *
     */
    addBodyCursorCls() {
        Neo.applyDeltas(this.appName, {id: 'document.body', cls: {add: ['neo-cursor-move']}});
    }

    /**
     * Resolves the 24:00 issue, where an event would end on the next day
     * @param {Date} date
     * @returns {Date}
     */
    adjustEndDate(date) {
        if (date.getHours() === 0 && date.getMinutes() === 0) {
            // if an event ends at 24:00, change it to 23:59 => otherwise the day increases by 1
            date.setMinutes(date.getMinutes() - 1);
        } else if (!(date.getHours() === 23 && date.getMinutes() === 59) && date.getMinutes() % this.intervalSize !== 0) {
            // otherwise switch non interval based values back
            date.setMinutes(date.getMinutes() + 1);
        }

        return date;
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
            if (me.dragProxy?.vdom.cn[0].id) {
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
     * @param {Object} data
     */
    createDragProxy(data) {
        let me        = this,
            component = Neo.getComponent(me.getDragElementRoot().id) || me.owner,
            vdom      = me.dragProxyConfig?.vdom,
            clone     = VDomUtil.clone(vdom ? vdom : me.dragElement);

            clone.cn[2].removeDom = false;

        const config = {
            module          : DragProxyComponent,
            appName         : me.appName,
            moveInMainThread: me.moveInMainThread,
            parentId        : me.proxyParentId,

            ...me.dragProxyConfig,

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
            owner  = me.owner,
            record = me.eventRecord,
            endDate, startDate;

        if (me.keepStartDate) {
            endDate   = me.newEndDate;
            startDate = me.newStartDate || record.startDate;
        } else {
            startDate = new Date(VDomUtil.findVdomChild(owner.vdom, me.proxyParentId).vdom.flag + 'T00:00:00.000Z');
            startDate.setHours(me.axisStartTime);
            startDate.setMinutes(me.currentInterval * me.intervalSize);

            if (me.keepEndDate) {
                endDate   = me.newEndDate   || record.endDate;
                startDate = me.newStartDate || startDate;
            } else {
                endDate = DateUtil.clone(startDate);
                endDate.setMinutes(endDate.getMinutes() + me.eventDuration);
            }
        }

        endDate = me.adjustEndDate(endDate);

        record.setSilent({
            endDate,
            startDate
        });

        Object.assign(me, {
            currentInterval: 0,
            hasOverflow    : false,
            keepEndDate    : false,
            keepStartDate  : false,
            newEndDate     : null,
            newStartDate   : null,
            proxyParentId  : null
        });

        // todo: updating a record field which is included inside a sorter should trigger collection.doSort()
        // see: https://github.com/neomjs/neo/issues/2392

        owner.getModel().getStore('events').doSort();
        owner.updateEvents();
    }

    /**
     * @param {Object} data
     */
    dragMove(data) {
        let me              = this,
            axisEndTime     = me.axisEndTime,
            axisStartTime   = me.axisStartTime,
            columnHeight    = me.columnHeight,
            eventDuration   = me.eventDuration,
            i               = 0,
            intervalSize    = me.intervalSize,
            keepEndDate     = me.keepEndDate,
            keepStartDate   = me.keepStartDate,
            path            = data.targetPath,
            len             = path.length,
            owner           = me.owner,
            record          = me.eventRecord,
            switchDirection = false,
            timeAxis        = owner.timeAxis,
            axisStartDate, currentInterval, deltas, duration, endDate, eventIntervals, height, intervalHeight,
            intervals, limitInterval, minimumEventIntervals, position, startDate, startInterval;

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

            endDate   = DateUtil.clone(record.endDate);
            startDate = DateUtil.clone(record.startDate);

            // events can have a smaller start time than the axis min value.
            // resizing via the north handle needs to adjust the duration to honor this.
            if (keepEndDate) {
                if (axisStartTime > startDate.getHours()) {
                    startDate.setHours(axisStartTime);
                    startDate.setMinutes(0);

                    eventDuration = (endDate - startDate) / 60 / 1000; // duration in minutes
                }
            }

            // events can have a bigger end time than the axis max value.
            // resizing via the south handle needs to adjust the duration to honor this.
            if (keepStartDate) {
                if (axisEndTime < endDate.getHours()) {
                    endDate.setHours(axisEndTime);
                    endDate.setMinutes(0);

                    eventDuration = (endDate - startDate) / 60 / 1000; // duration in minutes
                }
            }

            if (!keepEndDate) {
                // events must not end after the last visible interval
                currentInterval = Math.min(currentInterval, intervals - (eventDuration / intervalSize));
            }

            deltas = [{
                id   : me.dragProxy.id,
                style: {}
            }];

            if (keepEndDate || keepStartDate) {
                axisStartDate = DateUtil.clone(record.startDate);
                axisStartDate.setHours(axisStartTime);
                axisStartDate.setMinutes(0);

                minimumEventIntervals = owner.minimumEventDuration / intervalSize;
                startInterval         = (record.startDate - axisStartDate) / intervalSize / 60 / 1000;

                if (keepEndDate) {
                    limitInterval = startInterval + (eventDuration / intervalSize);

                    if (me.enableResizingAcrossOppositeEdge) {
                        if (me.forceUpdate && currentInterval > limitInterval -minimumEventIntervals && currentInterval < limitInterval + minimumEventIntervals) {
                            // when we resize back to the original direction, keep the min interval until we snap back
                            return;
                        } else if (currentInterval >= limitInterval + minimumEventIntervals) {
                            switchDirection = true;
                            me.forceUpdate  = true;

                            endDate.setHours(axisStartTime);
                            endDate.setMinutes(currentInterval * intervalSize);
                            endDate = me.adjustEndDate(endDate);

                            me.newEndDate = endDate;

                            startDate.setHours(axisStartTime);
                            startDate.setMinutes(limitInterval * intervalSize);

                            me.newStartDate = startDate;

                            duration = (endDate - startDate) / 60 / 60 / 1000; // duration in hours
                            deltas[0].style.top = `calc(${limitInterval * intervalHeight / columnHeight * 100}% + 1px)`;
                        } else {
                            me.forceUpdate  = false;
                            me.newStartDate = null;
                        }
                    }

                    if (!switchDirection) {
                        currentInterval = Math.min(currentInterval, limitInterval - minimumEventIntervals);
                    }

                } else if (keepStartDate) {
                    limitInterval = startInterval - (eventDuration / intervalSize);

                    if (me.enableResizingAcrossOppositeEdge) {
                        // events must not start before the first visible interval
                        currentInterval = Math.max(-(eventDuration / intervalSize), currentInterval);

                        if (currentInterval <= limitInterval - minimumEventIntervals) {
                            switchDirection = true;
                            me.forceUpdate  = true;

                            endDate.setHours(axisStartTime);
                            endDate.setMinutes(eventDuration + limitInterval * intervalSize);
                            endDate = me.adjustEndDate(endDate);

                            me.newEndDate = endDate;

                            startDate.setHours(axisStartTime);
                            startDate.setMinutes(eventDuration + currentInterval * intervalSize);

                            me.newStartDate = startDate;

                            duration = (endDate - startDate) / 60 / 60 / 1000; // duration in hours

                            position = (eventDuration / intervalSize + currentInterval) * intervalHeight; // snap to valid intervals
                            position = position / columnHeight * 100;

                            deltas[0].style.top = `calc(${position}% + 1px)`;
                        } else if (me.forceUpdate && currentInterval < limitInterval + minimumEventIntervals) {
                            // when we resize back to the original direction, keep the min interval until we snap back
                            return;
                        } else if (me.forceUpdate && currentInterval >= limitInterval + minimumEventIntervals) {
                            if (me.currentInterval !== currentInterval) {
                                me.forceUpdate  = false;
                                me.newStartDate = null;
                                deltas[0].style.top = `calc(${startInterval * intervalHeight / columnHeight * 100}% + 1px)`;
                            }
                        }
                    }

                    if (!switchDirection) {
                        currentInterval = Math.max(currentInterval, limitInterval + minimumEventIntervals);
                    }
                }
            }

            if (!keepStartDate) {
                // events must not start before the first visible interval
                currentInterval = Math.max(0, currentInterval);
            }

            if (me.currentInterval !== currentInterval) {
                if (!switchDirection) {
                    if (!keepEndDate) {
                        endDate.setHours(axisStartTime);
                        endDate.setMinutes(eventDuration + currentInterval * intervalSize);
                    }

                    if (keepStartDate) {
                        me.newEndDate = endDate;
                        duration = (endDate - record.startDate) / 60 / 60 / 1000; // duration in hours
                    } else {
                        startDate.setHours(axisStartTime);
                        startDate.setMinutes(currentInterval * intervalSize);

                        position = currentInterval * intervalHeight; // snap to valid intervals
                        position = position / columnHeight * 100;

                        deltas[0].style.top = `calc(${position}% + 1px)`;
                    }

                    if (keepEndDate) {
                        duration = (record.endDate - startDate) / 60 / 60 / 1000; // duration in hours
                    }
                }

                endDate = me.adjustEndDate(endDate);

                deltas.push({
                    id       : me.dragProxy.vdom.cn[2].id,
                    innerHTML: owner.intlFormat_time.format(endDate)
                });

                if (keepEndDate || keepStartDate) {
                    height = Math.round(duration / (axisEndTime - axisStartTime) * 100 * 1000) / 1000;
                    deltas[0].style.height = `calc(${height}% - 2px)`;
                }

                deltas.push({
                    id       : me.dragProxy.vdom.cn[0].id,
                    innerHTML: owner.intlFormat_time.format(startDate)
                });

                // check if the node got added yet
                if (me.dragProxy.vdom.cn[0].id) {
                    eventIntervals = (duration && duration * 60 || eventDuration) / timeAxis.interval;

                    if (eventIntervals <= 2) {
                        if (timeAxis.rowHeight / eventIntervals < 25 && !me.hasOverflow) {
                            deltas.push({
                                id : me.dragProxy.id,
                                cls: {add: ['neo-overflow']}
                            });

                            me.hasOverflow = true;
                        }
                    } else if (me.hasOverflow) {
                        deltas.push({
                            id : me.dragProxy.id,
                            cls: {remove: ['neo-overflow']}
                        });

                        me.hasOverflow = false;
                    }

                    Neo.applyDeltas(me.appName, deltas);
                }
            }

            me.currentInterval = currentInterval;
        }
    }

    /**
     * @param {Object} data
     */
    dragStart(data) {
        let me = this,
            eventDuration, offsetX, offsetY;

        me.owner.getDomRect([me.getDragElementRoot().id, data.path[1].id]).then(rects => {
            eventDuration = (me.eventRecord.endDate - me.eventRecord.startDate) / 60 / 1000;
            offsetX       = data.clientX - rects[0].left;
            offsetY       = data.clientY - rects[0].top;

            Object.assign(me, {
                columnHeight   : rects[1].height,
                columnTop      : rects[1].top,
                dragElementRect: rects[0],
                eventDuration  : Math.round(eventDuration / me.intervalSize) * me.intervalSize,
                offsetX,
                offsetY
            });

            me.createDragProxy(rects[0]);

            me.fire('dragStart', {
                dragElementRect: rects[0],
                id             : me.id,
                offsetX,
                offsetY
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

export default EventDragZone;
