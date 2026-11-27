import Base from '../core/Base.mjs';

const MS_PER_MINUTE = 60_000, MS_PER_HOUR = 3_600_000, MS_PER_DAY = 86_400_000;

/**
 * @summary Dependency arithmetic and downstream propagation for a Gantt chart.
 * @description The cascade reads the chart’s task store, dependency store and time axis. It indexes the
 * current dependency population once, retaining no graph between calls. Unreachable predecessors still
 * constrain reachable tasks; cycles are reported and broken in discovery order.
 * @class Neo.gantt.Cascade
 * @extends Neo.core.Base
 */
class Cascade extends Base {
    static config = {
        /**
         * @member {String} className='Neo.gantt.Cascade'
         * @protected
         */
        className: 'Neo.gantt.Cascade'
    }

    /**
     * @summary Adds a lag using calendar days or elapsed time.
     * @param {Neo.gantt.Container} chart              Chart supplying the time axis.
     * @param {Number}              anchorMs           Anchor instant in milliseconds.
     * @param {Number}              [lag=0]            Signed lag.
     * @param {String}              [lagUnit='minute'] Lag unit.
     * @returns {Number} Resulting instant in milliseconds.
     */
    static addLag(chart, anchorMs, lag=0, lagUnit='minute') {
        let numeric = Number(lag) || 0;
        if (numeric === 0) {
            return anchorMs
        }

        let unit = String(lagUnit || 'minute').toLowerCase();

        if (unit === 'day' || unit === 'days') {
            let next = new Date(anchorMs);
            if (chart.timeAxis) return chart.timeAxis.addTick(next, 'day', numeric).getTime();
            next.setDate(next.getDate() + numeric);
            return next.getTime()
        }

        return anchorMs + chart.convertLagToMs(numeric, unit)
    }

    /**
     * @summary Computes the successor start required by one dependency.
     * @param {Neo.gantt.Container} chart                      Chart supplying the calendar and lag arithmetic.
     * @param {Object}              options                    Constraint and successor duration.
     * @param {Number}              [options.durationMs=0]     Successor duration in milliseconds.
     * @param {Number}              [options.lag=0]            Signed lag in `lagUnit`.
     * @param {Number}              [options.lagMs]            Precomputed lag in milliseconds for working time.
     * @param {String}              [options.lagUnit='minute'] Lag unit.
     * @param {Number}              options.predEndMs          Predecessor end instant.
     * @param {Number}              options.predStartMs        Predecessor start instant.
     * @param {String}              [options.type='FS']        Dependency type: FS, SS, FF, or SF.
     * @param {Boolean}             [options.useWorking=false] Use the axis working calendar.
     * @returns {Number} Required start in milliseconds.
     */
    static computeRequiredStartMs(chart, {durationMs=0, lag=0, lagMs, lagUnit='minute', predEndMs, predStartMs, type='FS', useWorking=false}) {
        let axis     = chart.timeAxis,
            normType = String(type || 'FS').toUpperCase(),
            anchorMs = (normType === 'SS' || normType === 'SF') ? predStartMs : predEndMs;

        if (useWorking && axis) {
            let resolvedLagMs = Number.isFinite(lagMs) ? lagMs : chart.convertLagToMs(lag, lagUnit),
                shifted       = axis.addWorkingMs(anchorMs, resolvedLagMs);

            if (normType === 'FF' || normType === 'SF') {
                return durationMs === 0
                    ? axis.snapToWorkingTime(shifted, 1).getTime()
                    : axis.addWorkingMs(shifted, -durationMs).getTime()
            }

            return axis.snapToWorkingTime(shifted, 1).getTime()
        }

        let shiftedMs = chart.addLag(anchorMs, lag, lagUnit);

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
    static convertLagToMs(lag=0, lagUnit='minute') {
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
     * @summary Applies reachable dependency constraints and reports cycle edges.
     * @param {Neo.gantt.Container} chart          Chart owning the task and dependency stores.
     * @param {Neo.data.Model}      rootRecord     Changed task.
     * @param {String[]}            [cyclesOut=[]] Receives detected dependency IDs.
     * @param {Map|null}            [pending=null] With store-owned phase dates, stage changes here for one store batch.
     * @returns {Object[]} Changed successors with dependency, dates, changes and previous values.
     */
    static runDependencyCascade(chart, rootRecord, cyclesOut=[], pending=null) {
        let depStore = chart.dependencyStore,
            axis     = chart.timeAxis,
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
                if (succId !== rootId && inDegree.has(succId)) {
                    inDegree.set(succId, inDegree.get(succId) + 1)
                }
            }
        }

        // 3. Seed Kahn's queue by releasing outgoing edges from rootId
        let topoQueue       = [],
            processed       = new Set([rootId]),
            cycleOrder      = [...inDegree.keys()],
            releaseOutgoing = fromId => {
                let outEdges = outgoing.get(fromId) || [];

                for (let edge of outEdges) {
                    let succId = String(edge.toId ?? '');
                    if (succId !== rootId && !processed.has(succId) && inDegree.has(succId)) {
                        let nextDeg = inDegree.get(succId) - 1;
                        inDegree.set(succId, nextDeg);
                        if (nextDeg === 0) {
                            topoQueue.push(succId)
                        }
                    }
                }
            };

        let queueCursor = 0,
            cycleCursor = 0;
        releaseOutgoing(rootId);

        // 4. Process reachable nodes in topological order; break any downstream cycle deterministically in BFS order
        while (processed.size < reachable.size) {
            if (queueCursor >= topoQueue.length) {
                let cycleBreakId = null;

                while (cycleCursor < cycleOrder.length) {
                    let nodeId = cycleOrder[cycleCursor++];
                    if (!processed.has(nodeId) && inDegree.get(nodeId) > 0) {
                        cycleBreakId = nodeId;
                        break
                    }
                }

                if (!cycleBreakId) {
                    break
                }

                inDegree.set(cycleBreakId, 0);
                topoQueue.push(cycleBreakId)
            }

            let succId = topoQueue[queueCursor++];
            if (processed.has(succId)) {
                continue
            }

            processed.add(succId);

            let succ = chart.resolveTaskRecord(succId);
            if (changedDates && chart.store.isDerivedParent(succ)) {
                let receipt = chart.store.planParentRollup(succ, staged);
                if (receipt) {
                    staged.set(succ, receipt.changes);
                    cascaded.push({...receipt, startDate: receipt.changes.startDate ?? succ.startDate,
                        endDate: receipt.changes.endDate ?? succ.endDate});
                    if (receipt.changes.startDate || receipt.changes.endDate) changedDates.add(succId)
                }
            } else if (succ && (!changedDates || incoming.get(succId)?.some(edge => changedDates.has(String(edge.fromId))))) {
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

                if (Number.isFinite(succStart) && Number.isFinite(succEnd)) {
                    let maxReqStart   = -Infinity,
                        maxReqEnd     = -Infinity,
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
                            predEnd   = new Date(planned?.[chart.endDateField] ?? pred[chart.endDateField]).getTime();

                        if (!Number.isFinite(predStart) || !Number.isFinite(predEnd)) {
                            continue
                        }

                        let type     = String(edge.type || 'FS').toUpperCase(),
                            lag      = Number(edge.lag) || 0,
                            lagUnit  = edge.lagUnit || 'minute',
                            lagMs    = chart.convertLagToMs(lag, lagUnit),
                            reqStart = chart.computeRequiredStartMs({
                                durationMs,
                                lag,
                                lagMs,
                                lagUnit,
                                predEndMs  : predEnd,
                                predStartMs: predStart,
                                type,
                                useWorking
                            }),
                            reqEnd   = useWorking
                                ? (durationMs === 0 ? reqStart : axis.addWorkingMs(reqStart, durationMs).getTime())
                                : (reqStart + durationMs);

                        if (reqStart > maxReqStart) {
                            maxReqStart   = reqStart;
                            maxReqEnd     = reqEnd;
                            governingEdge = edge;
                            governingPred = predId
                        }
                    }

                    if (Number.isFinite(maxReqStart) && governingEdge) {
                        // Axis bounds limit the viewport, not the successor's dependency constraints.
                        let nextStart = maxReqStart,
                            nextEnd   = maxReqEnd;

                        if (nextStart !== succStart || nextEnd !== succEnd) {
                            let startField    = chart.startDateField || 'startDate',
                                endField      = chart.endDateField   || 'endDate',
                                nextStartDate = new Date(nextStart),
                                nextEndDate   = new Date(nextEnd),
                                succChanges   = {};

                            if (nextEnd !== succEnd) {
                                succChanges[endField] = nextEndDate
                            }
                            if (nextStart !== succStart) {
                                succChanges[startField] = nextStartDate
                            }

                            let succPrevious = {};
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

                            cascaded.push({
                                changes     : succChanges,
                                dependencyId: String(governingEdge.id ?? `${governingPred}->${succId}`),
                                endDate     : nextEndDate,
                                previous    : succPrevious,
                                record      : succ,
                                startDate   : nextStartDate
                            })
                        }
                    }
                }
            }

            releaseOutgoing(succId)
        }
        if (Array.isArray(cyclesOut)) {
            cyclesOut.push(...cycleSet)
        }
        if (staged && !pending && staged.size) {
            chart.store.updateRows(Array.from(staged, ([record, values]) => ({key: chart.store.getKey(record), values})))
        }

        return cascaded
    }

    /**
     * @summary Plans updated task spans across the dependency graph when {@link Neo.gantt.Container#useWorkingTime} flips.
     * @param {Neo.gantt.Container} chart          Chart owning the task store, dependency store, and time axis.
     * @param {Boolean}             useWorking     Target working-calendar evaluation flag.
     * @param {Boolean}             wasWorking     Prior working-calendar evaluation flag.
     * @param {String[]}            [cyclesOut=[]] Receives detected cycle dependency IDs.
     * @returns {Object[]} Changed task entries with `record`, `changes`, `previous`, `startMs`, `endMs`, and `dependencyId`.
     */
    static planWorkingTimeSchedule(chart, useWorking, wasWorking, cyclesOut=[]) {
        let axis    = chart?.timeAxis,
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

        let topoQueue = taskOrder.filter(id => inDegree.get(id) === 0),
            processed = new Set(),
            nextSpans = new Map(),
            pending   = rollups ? new Map() : null;

        let queueCursor = 0,
            cycleCursor = 0;

        while (processed.size < taskOrder.length) {
            if (queueCursor >= topoQueue.length) {
                let cycleBreakId = null;

                while (cycleCursor < taskOrder.length) {
                    let candidateId = taskOrder[cycleCursor++];
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

            let {durationMs, isMilestone, prevEndMs, prevStartMs, record} = prevById.get(id),
                derived                                                   = rollups && chart.store.isDerivedParent(record),
                phase                                                     = derived ? chart.store.planParentRollup(record, pending) : null,
                inEdges                                                   = incoming.get(id) || [],
                ownStartMs                                                = useWorking ? axis.snapToWorkingTime(prevStartMs, 1).getTime() : prevStartMs;

            let prevReqStart  = -Infinity,
                nextReqStart  = -Infinity,
                governingEdge = null,
                governingPred = '';

            for (let edge of inEdges) {
                let predId = String(edge.fromId ?? '');
                if (!processed.has(predId)) {
                    cycleSet.add(String(edge.id ?? `${predId}->${id}`));
                    continue
                }

                let predPrev = prevById.get(predId),
                    predNext = nextSpans.get(predId),
                    type     = String(edge.type || 'FS').toUpperCase(),
                    lag      = Number(edge.lag) || 0,
                    lagUnit  = edge.lagUnit || 'minute',
                    lagMs    = chart.convertLagToMs(lag, lagUnit),
                    prevReq  = chart.computeRequiredStartMs({
                        durationMs,
                        lag,
                        lagMs,
                        lagUnit,
                        predEndMs  : predPrev.prevEndMs,
                        predStartMs: predPrev.prevStartMs,
                        type,
                        useWorking : wasWorking
                    }),
                    nextReq  = chart.computeRequiredStartMs({
                        durationMs,
                        lag,
                        lagMs,
                        lagUnit,
                        predEndMs  : predNext.endMs,
                        predStartMs: predNext.startMs,
                        type,
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
                endMs   = toMs(phase?.changes[endField] ?? record[endField])
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

            if (phase || startMs !== prevStartMs || endMs !== prevEndMs) {
                let changes       = phase?.changes || {},
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
                entries.push({
                    changes,
                    dependencyId: governingEdge ? String(governingEdge.id ?? `${governingPred}->${id}`) : null,
                    endDate     : nextEndDate,
                    endMs,
                    previous,
                    record,
                    startDate   : nextStartDate,
                    startMs
                })
            }

            for (let edge of outgoing.get(id) || []) {
                let succId = String(edge.toId ?? '');
                if (!processed.has(succId) && inDegree.has(succId)) {
                    let nextDeg = inDegree.get(succId) - 1;
                    inDegree.set(succId, nextDeg);
                    if (nextDeg === 0) {
                        topoQueue.push(succId)
                    }
                }
            }
        }

        if (Array.isArray(cyclesOut)) {
            cyclesOut.push(...cycleSet)
        }

        return entries
    }
}

export default Neo.setupClass(Cascade);
