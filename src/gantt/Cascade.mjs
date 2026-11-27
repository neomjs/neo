import Base from '../core/Base.mjs';

const MS_PER_MINUTE = 60_000, MS_PER_HOUR = 3_600_000, MS_PER_DAY = 86_400_000;

/**
 * @summary Dependency arithmetic and downstream propagation for a Gantt chart.
 *
 * The cascade reads its owning {@link #chart}'s task store, dependency store, and time axis. It indexes the
 * current dependency population once per pass, retaining no graph between calls. Unreachable predecessors still
 * constrain reachable tasks; cycles are reported and broken deterministically in discovery order through
 * {@link #walkTopologicalOrder}. Subclasses customize per-link constraint arithmetic by overriding
 * {@link #computeRequiredStartMs} or per-node scheduling via {@link #planWorkingTimeTask} and {@link #cascadeTask}.
 *
 * @class Neo.gantt.Cascade
 * @extends Neo.core.Base
 */
class Cascade extends Base {
    static config = {
        /**
         * @member {String} className='Neo.gantt.Cascade'
         * @protected
         */
        className: 'Neo.gantt.Cascade',
        /**
         * Chart owning the task store, dependency store, and time axis.
         * @member {Neo.gantt.Container|null} chart=null
         */
        chart: null
    }

    /**
     * @summary Adds a lag using calendar days or elapsed time.
     * @param {Number} anchorMs           Anchor instant in milliseconds.
     * @param {Number} [lag=0]            Signed lag.
     * @param {String} [lagUnit='minute'] Lag unit.
     * @returns {Number} Resulting instant in milliseconds.
     */
    addLag(anchorMs, lag=0, lagUnit='minute') {
        let numeric = Number(lag) || 0;
        if (numeric === 0) {
            return anchorMs
        }

        let axis = this.chart?.timeAxis,
            unit = String(lagUnit || 'minute').toLowerCase();

        if (unit === 'day' || unit === 'days') {
            let next = new Date(anchorMs);
            if (axis) return axis.addTick(next, 'day', numeric).getTime();
            next.setDate(next.getDate() + numeric);
            return next.getTime()
        }

        return anchorMs + this.convertLagToMs(numeric, unit)
    }

    /**
     * @summary Evaluates one reachable downstream task or derived parent rollup during an edit cascade.
     * @param {String}                       succId               Settled task store key.
     * @param {Object}                       options              Cascade pass state.
     * @param {Neo.timeline.TimeAxis|null}   options.axis         Active time axis, if configured.
     * @param {Set|null}                     options.changedDates Keys whose dates changed in a staged rollup pass, or `null`.
     * @param {Set}                          options.cycleSet     Receives cycle dependency identifiers.
     * @param {Map}                          options.incoming     Incoming dependency edges keyed by successor id.
     * @param {Set}                          options.processed    Task keys settled so far in this walk.
     * @param {Set}                          options.reachable    Task keys reachable from the edited root task.
     * @param {Map|null}                     options.staged       Staged record patches when batching store rollups, or `null`.
     * @returns {Object|null} Changed successor receipt, or `null` when dates are unchanged.
     * @protected
     */
    cascadeTask(succId, {axis, changedDates, cycleSet, incoming, processed, reachable, staged}) {
        let me    = this,
            chart = me.chart,
            succ  = chart.resolveTaskRecord(succId);

        if (changedDates && chart.store.isDerivedParent(succ)) {
            let receipt = chart.store.planParentRollup(succ, staged);
            if (receipt) {
                staged.set(succ, receipt.changes);
                if (receipt.changes.startDate || receipt.changes.endDate) changedDates.add(succId);
                return {
                    ...receipt,
                    endDate  : receipt.changes.endDate   ?? succ.endDate,
                    startDate: receipt.changes.startDate ?? succ.startDate
                }
            }
            return null
        }

        if (!succ || (changedDates && !incoming.get(succId)?.some(edge => changedDates.has(String(edge.fromId))))) {
            return null
        }

        let useWorking   = Boolean(chart.useWorkingTime && axis?.hasWorkingCalendar()),
            succStart    = new Date(succ[chart.startDateField]).getTime(),
            succEnd      = new Date(succ[chart.endDateField]).getTime(),
            isMilestone  = Boolean(succ.milestone) || succEnd === succStart,
            rawWorkDurMs = useWorking && !isMilestone ? Math.max(0, axis.diffWorkingMs(succStart, succEnd)) : 0,
            durationMs   = isMilestone
                ? 0
                : useWorking
                    ? (rawWorkDurMs > 0 ? rawWorkDurMs : Math.max(0, succEnd - succStart))
                    : Math.max(0, succEnd - succStart),
            inEdges      = incoming.get(succId) || [];

        if (!Number.isFinite(succStart) || !Number.isFinite(succEnd)) {
            return null
        }

        let maxReqStart   = -Infinity,
            governingEdge = null,
            governingPred = '';

        for (let edge of inEdges) {
            let predId = String(edge.fromId ?? '');
            if (!predId) {
                continue
            }

            if (reachable.has(predId) && !processed.has(predId)) {
                cycleSet.add(String(edge.id ?? `${predId}->${succId}`));
                continue
            }

            let pred = chart.resolveTaskRecord(predId);
            if (!pred) {
                continue
            }

            let planned   = staged?.get(pred),
                predStart = new Date(planned?.[chart.startDateField] ?? pred[chart.startDateField]).getTime(),
                predEnd   = new Date(planned?.[chart.endDateField]   ?? pred[chart.endDateField]).getTime();

            if (!Number.isFinite(predStart) || !Number.isFinite(predEnd)) {
                continue
            }

            let reqStart = me.computeRequiredStartMs({
                durationMs,
                edge,
                predEndMs  : predEnd,
                predStartMs: predStart,
                useWorking
            });

            if (reqStart > maxReqStart) {
                maxReqStart   = reqStart;
                governingEdge = edge;
                governingPred = predId
            }
        }

        if (!Number.isFinite(maxReqStart) || !governingEdge) {
            return null
        }

        // Axis bounds limit the viewport, not the successor's dependency constraints.
        let nextStart = maxReqStart,
            nextEnd   = useWorking
                ? (durationMs === 0 ? nextStart : axis.addWorkingMs(nextStart, durationMs).getTime())
                : (nextStart + durationMs);

        if (nextStart === succStart && nextEnd === succEnd) {
            return null
        }

        let startField    = chart.startDateField || 'startDate',
            endField      = chart.endDateField   || 'endDate',
            nextStartDate = new Date(nextStart),
            nextEndDate   = new Date(nextEnd),
            succChanges   = {},
            succPrevious  = {};

        if (nextEnd !== succEnd) {
            succChanges[endField] = nextEndDate
        }
        if (nextStart !== succStart) {
            succChanges[startField] = nextStartDate
        }

        for (let key of Object.keys(succChanges)) {
            let val = succ[key];
            succPrevious[key] = val instanceof Date ? new Date(val.getTime()) : val
        }

        if (staged) {
            staged.set(succ, succChanges)
        } else {
            succ.set(succChanges)
        }
        changedDates?.add(succId);

        return {
            changes     : succChanges,
            dependencyId: String(governingEdge.id ?? `${governingPred}->${succId}`),
            endDate     : nextEndDate,
            previous    : succPrevious,
            record      : succ,
            startDate   : nextStartDate
        }
    }

    /**
     * @summary Computes the successor start required by one dependency link.
     * @param {Object}      options                    Constraint and successor duration.
     * @param {Number}      [options.durationMs=0]     Successor duration in milliseconds.
     * @param {Object|null} [options.edge=null]        Dependency record or descriptor being evaluated.
     * @param {Number}      [options.lag]              Signed lag override; defaults to `edge.lag` or `0`.
     * @param {Number}      [options.lagMs]            Precomputed lag in milliseconds for working time.
     * @param {String}      [options.lagUnit]          Lag unit override; defaults to `edge.lagUnit` or `'minute'`.
     * @param {Number}      options.predEndMs          Predecessor end instant.
     * @param {Number}      options.predStartMs        Predecessor start instant.
     * @param {String}      [options.type]             Dependency type override (`FS`, `SS`, `FF`, or `SF`); defaults to `edge.type` or `'FS'`.
     * @param {Boolean}     [options.useWorking=false] Use the axis working calendar.
     * @returns {Number} Required start in milliseconds.
     */
    computeRequiredStartMs({durationMs=0, edge=null, lag, lagMs, lagUnit, predEndMs, predStartMs, type, useWorking=false}) {
        let me           = this,
            axis         = me.chart?.timeAxis,
            normType     = String(type || edge?.type || 'FS').toUpperCase(),
            resolvedLag  = Number(lag ?? edge?.lag) || 0,
            resolvedUnit = lagUnit || edge?.lagUnit || 'minute',
            anchorMs     = (normType === 'SS' || normType === 'SF') ? predStartMs : predEndMs;

        if (useWorking && axis) {
            let resolvedLagMs = Number.isFinite(lagMs) ? lagMs : me.convertLagToMs(resolvedLag, resolvedUnit),
                shifted       = axis.addWorkingMs(anchorMs, resolvedLagMs);

            if (normType === 'FF' || normType === 'SF') {
                return durationMs === 0
                    ? axis.snapToWorkingTime(shifted, 1).getTime()
                    : axis.addWorkingMs(shifted, -durationMs).getTime()
            }

            return axis.snapToWorkingTime(shifted, 1).getTime()
        }

        let shiftedMs = me.addLag(anchorMs, resolvedLag, resolvedUnit);

        return (normType === 'FF' || normType === 'SF')
            ? (shiftedMs - durationMs)
            : shiftedMs
    }

    /**
     * @summary Converts a signed lag to elapsed milliseconds.
     * @param {Number} [lag=0]            Lag amount.
     * @param {String} [lagUnit='minute'] Lag unit.
     * @returns {Number} Lag in milliseconds.
     */
    convertLagToMs(lag=0, lagUnit='minute') {
        let numeric = Number(lag) || 0;
        if (numeric === 0) {
            return 0
        }

        switch (String(lagUnit || 'minute').toLowerCase()) {
            case 'day':
            case 'days':
                return numeric * MS_PER_DAY;
            case 'hour':
            case 'hours':
                return numeric * MS_PER_HOUR;
            default:
                return numeric * MS_PER_MINUTE
        }
    }

    /**
     * @summary Plans updated task spans across the dependency graph when {@link Neo.gantt.Container#useWorkingTime} flips.
     * @param {Boolean}  useWorking     Target working-calendar evaluation flag.
     * @param {Boolean}  wasWorking     Prior working-calendar evaluation flag.
     * @param {String[]} [cyclesOut=[]] Receives detected cycle dependency IDs.
     * @returns {Object[]} Changed task entries with `record`, `changes`, `previous`, `startMs`, `endMs`, and `dependencyId`.
     */
    planWorkingTimeSchedule(useWorking, wasWorking, cyclesOut=[]) {
        let me      = this,
            chart   = me.chart,
            axis    = chart?.timeAxis,
            entries = [];

        if (!chart?.store || !axis || useWorking === wasWorking) {
            return entries
        }

        let startField = chart.startDateField || 'startDate',
            endField   = chart.endDateField   || 'endDate',
            toMs       = val => val instanceof Date ? val.getTime() : new Date(val).getTime(),
            prevById   = new Map(),
            taskOrder  = [];

        for (let record of chart.collectAllTasks()) {
            let id          = String(chart.store.getKey(record) ?? ''),
                prevStartMs = toMs(record[startField]),
                prevEndMs   = toMs(record[endField]);

            if (!id || prevById.has(id) || !Number.isFinite(prevStartMs) || !Number.isFinite(prevEndMs)) {
                continue
            }

            let rawDur      = Number(record.duration),
                unit        = String(record.durationUnit || 'hour').toLowerCase(),
                unitMs      = unit.startsWith('day') ? MS_PER_DAY : unit.startsWith('min') ? MS_PER_MINUTE : MS_PER_HOUR,
                prevWallMs  = Math.max(0, prevEndMs - prevStartMs),
                isMilestone = Boolean(record.milestone) || (prevWallMs === 0 && !(rawDur > 0)),
                prevWorkMs  = wasWorking && !isMilestone ? Math.max(0, axis.diffWorkingMs(prevStartMs, prevEndMs)) : 0,
                fallbackMs  = rawDur > 0 ? rawDur * unitMs : prevWallMs,
                durationMs  = isMilestone
                    ? 0
                    : wasWorking
                        ? (prevWorkMs > 0 ? prevWorkMs : fallbackMs)
                        : (prevWallMs > 0 ? prevWallMs : fallbackMs);

            prevById.set(id, {durationMs, isMilestone, prevEndMs, prevStartMs, record});
            taskOrder.push(id)
        }

        if (!taskOrder.length) {
            return entries
        }

        let depStore = chart.cascadeDependencies ? chart.dependencyStore : null,
            rollups  = chart.store.rollupParents && !chart.schedule,
            outgoing = new Map(),
            incoming = new Map(),
            inDegree = new Map(),
            cycleSet = new Set();

        for (let id of taskOrder) {
            outgoing.set(id, []);
            incoming.set(id, []);
            inDegree.set(id, 0)
        }

        if (rollups) {
            for (let id of taskOrder) {
                let record   = prevById.get(id).record,
                    parentId = record.parentId == null ? '' : String(record.parentId);
                if (prevById.has(parentId) && chart.store.isDerivedParent(prevById.get(parentId).record)) {
                    outgoing.get(id).push({toId: parentId});
                    inDegree.set(parentId, inDegree.get(parentId) + 1)
                }
            }
        }

        if (depStore) {
            for (let i = 0, count = depStore.getCount(); i < count; i++) {
                let edge = depStore.getAt(i);
                if (!edge) continue;
                let from = String(edge.fromId ?? ''),
                    to   = String(edge.toId ?? '');
                if (!prevById.has(from) || !prevById.has(to)) continue;
                if (rollups && chart.store.isDerivedParent(prevById.get(to).record)) continue;
                if (from === to) {
                    cycleSet.add(String(edge.id ?? `${from}->${to}`));
                    continue
                }
                outgoing.get(from).push(edge);
                incoming.get(to).push(edge);
                inDegree.set(to, inDegree.get(to) + 1)
            }
        }

        let nextSpans = new Map(),
            pending   = rollups ? new Map() : null;

        me.walkTopologicalOrder({
            inDegree,
            order  : taskOrder,
            outgoing,
            onVisit: (id, processed) => {
                let entry = me.planWorkingTimeTask(id, {
                    axis,
                    cycleSet,
                    endField,
                    incoming,
                    nextSpans,
                    pending,
                    prevById,
                    processed,
                    rollups,
                    startField,
                    useWorking,
                    wasWorking
                });

                if (entry) {
                    entries.push(entry)
                }
            }
        });

        if (Array.isArray(cyclesOut)) {
            cyclesOut.push(...cycleSet)
        }

        return entries
    }

    /**
     * @summary Plans one task or derived parent rollup during a working-calendar switch.
     * @param {String}                id                 Settled task store key.
     * @param {Object}                options            Planning pass state.
     * @param {Neo.timeline.TimeAxis} options.axis       Active time axis.
     * @param {Set}                   options.cycleSet   Receives cycle dependency identifiers.
     * @param {String}                options.endField   Configured end-date field name.
     * @param {Map}                   options.incoming   Incoming dependency edges keyed by successor id.
     * @param {Map}                   options.nextSpans  Planned `{startMs, endMs}` spans keyed by settled task id.
     * @param {Map|null}              options.pending    Staged record patches when batching store rollups, or `null`.
     * @param {Map}                   options.prevById   Prior task snapshots keyed by task id.
     * @param {Set}                   options.processed  Task keys settled so far in this walk.
     * @param {Boolean}               options.rollups    Whether store-owned parent rollups are active.
     * @param {String}                options.startField Configured start-date field name.
     * @param {Boolean}               options.useWorking Target working-calendar evaluation flag.
     * @param {Boolean}               options.wasWorking Prior working-calendar evaluation flag.
     * @returns {Object|null} Planned task change entry, or `null` when dates are unchanged.
     * @protected
     */
    planWorkingTimeTask(id, {axis, cycleSet, endField, incoming, nextSpans, pending, prevById, processed, rollups, startField, useWorking, wasWorking}) {
        let me                                                        = this,
            chart                                                     = me.chart,
            toMs                                                      = val => val instanceof Date ? val.getTime() : new Date(val).getTime(),
            {durationMs, isMilestone, prevEndMs, prevStartMs, record} = prevById.get(id),
            derived                                                   = rollups && chart.store.isDerivedParent(record),
            phase                                                     = derived ? chart.store.planParentRollup(record, pending) : null,
            inEdges                                                   = incoming.get(id) || [],
            ownStartMs                                                = useWorking ? axis.snapToWorkingTime(prevStartMs, 1).getTime() : prevStartMs,
            prevReqStart                                              = -Infinity,
            nextReqStart                                              = -Infinity,
            governingEdge                                             = null,
            governingPred                                             = '';

        for (let edge of inEdges) {
            let predId = String(edge.fromId ?? '');
            if (!processed.has(predId)) {
                cycleSet.add(String(edge.id ?? `${predId}->${id}`));
                continue
            }

            let predPrev = prevById.get(predId),
                predNext = nextSpans.get(predId),
                prevReq  = me.computeRequiredStartMs({
                    durationMs,
                    edge,
                    predEndMs  : predPrev.prevEndMs,
                    predStartMs: predPrev.prevStartMs,
                    useWorking : wasWorking
                }),
                nextReq  = me.computeRequiredStartMs({
                    durationMs,
                    edge,
                    predEndMs  : predNext.endMs,
                    predStartMs: predNext.startMs,
                    useWorking
                });

            if (prevReq > prevReqStart) {
                prevReqStart = prevReq
            }
            if (nextReq > nextReqStart) {
                nextReqStart  = nextReq;
                governingEdge = edge;
                governingPred = predId
            }
        }

        // Preserve hand-placed positive float (`prevStartMs > prevReqStart`) unless overtaken by a predecessor;
        // predecessor-bound tasks (`prevStartMs <= prevReqStart`) move with their governing link in both directions.
        let startMs, endMs;
        if (derived) {
            startMs = toMs(phase?.changes[startField] ?? record[startField]);
            endMs   = toMs(phase?.changes[endField]   ?? record[endField])
        } else {
            startMs = !Number.isFinite(nextReqStart)
                ? ownStartMs
                : (Number.isFinite(prevReqStart) && prevStartMs > prevReqStart)
                    ? Math.max(nextReqStart, ownStartMs)
                    : nextReqStart;
            endMs = isMilestone || durationMs === 0
                ? startMs
                : useWorking
                    ? axis.addWorkingMs(startMs, durationMs).getTime()
                    : (startMs + durationMs)
        }

        nextSpans.set(id, {endMs, startMs});

        if (!phase && startMs === prevStartMs && endMs === prevEndMs) {
            return null
        }

        let changes       = phase?.changes  || {},
            previous      = phase?.previous || {},
            nextStartDate = new Date(startMs),
            nextEndDate   = new Date(endMs);

        if (startMs !== prevStartMs) {
            let val = record[startField];
            changes[startField]  = nextStartDate;
            previous[startField] = val instanceof Date ? new Date(val.getTime()) : val
        }
        if (endMs !== prevEndMs) {
            let val = record[endField];
            changes[endField]  = nextEndDate;
            previous[endField] = val instanceof Date ? new Date(val.getTime()) : val
        }

        pending?.set(record, changes);

        return {
            changes,
            dependencyId: governingEdge ? String(governingEdge.id ?? `${governingPred}->${id}`) : null,
            endDate     : nextEndDate,
            endMs,
            previous,
            record,
            startDate   : nextStartDate,
            startMs
        }
    }

    /**
     * @summary Applies reachable dependency constraints and reports cycle edges.
     * @param {Neo.data.Model} rootRecord     Changed task.
     * @param {String[]}       [cyclesOut=[]] Receives detected dependency IDs.
     * @param {Map|null}       [pending=null] With store-owned phase dates, stage changes here for one store batch.
     * @returns {Object[]} Changed successors with dependency, dates, changes and previous values.
     */
    runDependencyCascade(rootRecord, cyclesOut=[], pending=null) {
        let me       = this,
            chart    = me.chart,
            depStore = chart?.dependencyStore,
            axis     = chart?.timeAxis,
            cascaded = [];

        if (!rootRecord || !depStore) {
            return cascaded
        }

        let rootId       = String(chart.store.getKey(rootRecord)),
            reachable    = new Set([rootId]),
            bfsQueue     = [rootId],
            cycleSet     = new Set(),
            outgoing     = new Map(),
            incoming     = new Map(),
            staged       = pending || (chart.store.rollupParents ? new Map() : null),
            changedDates = staged ? new Set([rootId]) : null;

        // Index once per cascade so edits and filtering are observed without a persistent cache.
        for (let i = 0, count = depStore.getCount(); i < count; i++) {
            let edge = depStore.getAt(i);
            if (!edge) continue;
            let from = String(edge.fromId ?? ''),
                to   = String(edge.toId ?? '');
            // A derived phase takes its dates from its children. Only outgoing links schedule other tasks.
            if (changedDates && chart.store.isDerivedParent(chart.resolveTaskRecord(to))) continue;
            if (!outgoing.has(from)) outgoing.set(from, []);
            if (!incoming.has(to)) incoming.set(to, []);
            outgoing.get(from).push(edge);
            incoming.get(to).push(edge)
        }

        // 1. Discover the reachable downstream subgraph from rootId and flag direct back-edges into rootId
        for (let cursor = 0; cursor < bfsQueue.length; cursor++) {
            let currId   = bfsQueue[cursor],
                outEdges = outgoing.get(currId) || [];
            if (changedDates) {
                let parentId = chart.resolveTaskRecord(currId)?.parentId;
                if (parentId != null && chart.resolveTaskRecord(parentId)) {
                    // This edge orders the rollup. It carries no scheduling constraint or user dependency ID.
                    outEdges.push({toId: parentId});
                    outgoing.set(currId, outEdges)
                }
            }

            for (let edge of outEdges) {
                let succId = String(edge.toId ?? '');
                if (!succId || !chart.resolveTaskRecord(succId)) {
                    continue
                }

                if (succId === rootId) {
                    cycleSet.add(String(edge.id ?? `${currId}->${succId}`));
                    continue
                }

                if (!reachable.has(succId)) {
                    reachable.add(succId);
                    bfsQueue.push(succId)
                }
            }
        }

        // 2. Compute in-degrees within the reachable subgraph (excluding rootId)
        let inDegree = new Map();

        for (let nodeId of reachable) {
            if (nodeId !== rootId) {
                inDegree.set(nodeId, 0)
            }
        }

        for (let nodeId of reachable) {
            let outEdges = outgoing.get(nodeId) || [];

            for (let edge of outEdges) {
                let succId = String(edge.toId ?? '');
                if (inDegree.has(succId)) {
                    inDegree.set(succId, inDegree.get(succId) + 1)
                }
            }
        }

        // 3. Walk reachable nodes in topological order; break any downstream cycle deterministically in BFS order
        me.walkTopologicalOrder({
            inDegree,
            order  : [...inDegree.keys()],
            outgoing,
            settled: new Set([rootId]),
            onVisit: (succId, processed) => {
                let entry = me.cascadeTask(succId, {
                    axis,
                    changedDates,
                    cycleSet,
                    incoming,
                    processed,
                    reachable,
                    staged
                });

                if (entry) {
                    cascaded.push(entry)
                }
            }
        });

        if (Array.isArray(cyclesOut)) {
            cyclesOut.push(...cycleSet)
        }
        if (staged && !pending && staged.size) {
            chart.store.updateRows(Array.from(staged, ([record, values]) => ({key: chart.store.getKey(record), values})))
        }

        return cascaded
    }

    /**
     * @summary Visits nodes in Kahn topological order, seeding from settled nodes and breaking cycles in `order`.
     * @param {Object}   options           Walk inputs.
     * @param {Map}      options.inDegree  Mutable in-degree count per unsettled node.
     * @param {Function} options.onVisit   Visitor invoked with `(nodeId, processed)` as each node settles.
     * @param {String[]} options.order     Candidate node ids in deterministic cycle-break order.
     * @param {Map}      options.outgoing  Outgoing dependency and rollup edges keyed by predecessor id.
     * @param {Set}      [options.settled] Already-settled node ids whose outgoing edges seed the queue.
     * @returns {Set} All processed node ids.
     * @protected
     */
    walkTopologicalOrder({inDegree, onVisit, order, outgoing, settled=new Set()}) {
        let processed   = new Set(settled),
            topoQueue   = order.filter(id => !processed.has(id) && inDegree.get(id) === 0),
            targetSize  = processed.size + order.reduce((count, id) => count + (processed.has(id) ? 0 : 1), 0),
            queueCursor = 0,
            cycleCursor = 0,
            release     = fromId => {
                for (let edge of outgoing.get(fromId) || []) {
                    let succId = String(edge.toId ?? '');
                    if (!processed.has(succId) && inDegree.has(succId)) {
                        let nextDeg = inDegree.get(succId) - 1;
                        inDegree.set(succId, nextDeg);
                        if (nextDeg === 0) {
                            topoQueue.push(succId)
                        }
                    }
                }
            };

        for (let settledId of settled) {
            release(settledId)
        }

        while (processed.size < targetSize) {
            if (queueCursor >= topoQueue.length) {
                let cycleBreakId = null;

                while (cycleCursor < order.length) {
                    let candidateId = order[cycleCursor++];
                    if (!processed.has(candidateId) && inDegree.get(candidateId) > 0) {
                        cycleBreakId = candidateId;
                        break
                    }
                }

                if (!cycleBreakId) {
                    break
                }

                inDegree.set(cycleBreakId, 0);
                topoQueue.push(cycleBreakId)
            }

            let id = topoQueue[queueCursor++];
            if (processed.has(id)) {
                continue
            }

            processed.add(id);
            onVisit(id, processed);
            release(id)
        }

        return processed
    }
}

export default Neo.setupClass(Cascade);
