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
    static config = {className: 'Neo.gantt.Cascade'}
    /**
     * @summary Adds a lag using calendar days or elapsed time.
     * @param {Neo.gantt.Container} chart Chart supplying the time axis.
     * @param {Number} anchorMs Anchor instant in milliseconds.
     * @param {Number} [lag=0] Signed lag.
     * @param {String} [lagUnit='minute'] Lag unit.
     * @returns {Number} Resulting instant in milliseconds.
     */
    static addLag(chart, anchorMs, lag=0, lagUnit='minute') {
        const numeric = Number(lag) || 0;
        if (numeric === 0) {
            return anchorMs
        }

        const unit = String(lagUnit || 'minute').toLowerCase();

        if (unit === 'day' || unit === 'days') {
            const next = new Date(anchorMs);
            if (chart.timeAxis) return chart.timeAxis.addTick(next, 'day', numeric).getTime();
            next.setDate(next.getDate() + numeric);
            return next.getTime()
        }

        return anchorMs + chart.convertLagToMs(numeric, unit)
    }

    /**
     * @summary Computes the successor start required by one dependency.
     * @param {Neo.gantt.Container} chart Chart supplying the calendar and lag arithmetic.
     * @param {Object} options Constraint and successor duration.
     * @param {Number} [options.durationMs=0] Successor duration in milliseconds.
     * @param {Number} [options.lag=0] Signed lag in `lagUnit`.
     * @param {Number} [options.lagMs] Precomputed lag in milliseconds for working time.
     * @param {String} [options.lagUnit='minute'] Lag unit.
     * @param {Number} options.predEndMs Predecessor end instant.
     * @param {Number} options.predStartMs Predecessor start instant.
     * @param {String} [options.type='FS'] Dependency type: FS, SS, FF, or SF.
     * @param {Boolean} [options.useWorking=false] Use the axis working calendar.
     * @returns {Number} Required start in milliseconds.
     */
    static computeRequiredStartMs(chart, {durationMs=0, lag=0, lagMs, lagUnit='minute', predEndMs, predStartMs, type='FS', useWorking=false}) {
        const
            axis     = chart.timeAxis,
            normType = String(type || 'FS').toUpperCase(),
            anchorMs = (normType === 'SS' || normType === 'SF') ? predStartMs : predEndMs;

        if (useWorking && axis) {
            const
                resolvedLagMs = Number.isFinite(lagMs) ? lagMs : chart.convertLagToMs(lag, lagUnit),
                shifted       = axis.addWorkingMs(anchorMs, resolvedLagMs);

            if (normType === 'FF' || normType === 'SF') {
                return durationMs === 0
                    ? axis.snapToWorkingTime(shifted, 1).getTime()
                    : axis.addWorkingMs(shifted, -durationMs).getTime()
            }

            return axis.snapToWorkingTime(shifted, 1).getTime()
        }

        const shiftedMs = chart.addLag(anchorMs, lag, lagUnit);

        return (normType === 'FF' || normType === 'SF')
            ? (shiftedMs - durationMs)
            : shiftedMs
    }

    /**
     * @summary Converts a signed lag to elapsed milliseconds.
     * @param {Number} [lag=0] Lag amount.
     * @param {String} [lagUnit='minute'] Lag unit.
     * @returns {Number} Lag in milliseconds.
     */
    static convertLagToMs(lag=0, lagUnit='minute') {
        const numeric = Number(lag) || 0;
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
     * @param {Neo.gantt.Container} chart Chart owning the task and dependency stores.
     * @param {Neo.data.Model} rootRecord Changed task.
     * @param {String[]} [cyclesOut=[]] Receives detected dependency IDs.
     * @returns {Object[]} Changed successors with dependency, dates, changes and previous values.
     */
    static runDependencyCascade(chart, rootRecord, cyclesOut=[]) {
        const
            depStore = chart.dependencyStore,
            axis     = chart.timeAxis,
            cascaded = [];

        if (!rootRecord || !depStore) {
            return cascaded
        }

        const
            rootId    = String(chart.store.getKey(rootRecord)),
            reachable = new Set([rootId]),
            bfsQueue  = [rootId],
            cycleSet  = new Set(),
            outgoing  = new Map(),
            incoming  = new Map();

        // Index once per cascade so edits and filtering are observed without a persistent cache.
        for (let i = 0, count = depStore.getCount(); i < count; i++) {
            const edge = depStore.getAt(i);
            if (!edge) continue;
            const from = String(edge.fromId ?? ''), to = String(edge.toId ?? '');
            if (!outgoing.has(from)) outgoing.set(from, []);
            if (!incoming.has(to)) incoming.set(to, []);
            outgoing.get(from).push(edge);
            incoming.get(to).push(edge)
        }

        // 1. Discover the reachable downstream subgraph from rootId and flag direct back-edges into rootId
        for (let cursor = 0; cursor < bfsQueue.length; cursor++) {
            const
                currId   = bfsQueue[cursor],
                outEdges = outgoing.get(currId) || [];

            for (const edge of outEdges) {
                const succId = String(edge.toId ?? '');
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
        const inDegree = new Map();

        for (const nodeId of reachable) {
            if (nodeId !== rootId) {
                inDegree.set(nodeId, 0)
            }
        }

        for (const nodeId of reachable) {
            const outEdges = outgoing.get(nodeId) || [];

            for (const edge of outEdges) {
                const succId = String(edge.toId ?? '');
                if (succId !== rootId && inDegree.has(succId)) {
                    inDegree.set(succId, inDegree.get(succId) + 1)
                }
            }
        }

        // 3. Seed Kahn's queue by releasing outgoing edges from rootId
        const
            topoQueue       = [],
            processed       = new Set([rootId]),
            cycleOrder      = [...inDegree.keys()],
            releaseOutgoing = fromId => {
                const outEdges = outgoing.get(fromId) || [];

                for (const edge of outEdges) {
                    const succId = String(edge.toId ?? '');
                    if (succId !== rootId && !processed.has(succId) && inDegree.has(succId)) {
                        const nextDeg = inDegree.get(succId) - 1;
                        inDegree.set(succId, nextDeg);
                        if (nextDeg === 0) {
                            topoQueue.push(succId)
                        }
                    }
                }
            };

        let queueCursor = 0, cycleCursor = 0;
        releaseOutgoing(rootId);

        // 4. Process reachable nodes in topological order; break any downstream cycle deterministically in BFS order
        while (processed.size < reachable.size) {
            if (queueCursor >= topoQueue.length) {
                let cycleBreakId = null;

                while (cycleCursor < cycleOrder.length) {
                    const nodeId = cycleOrder[cycleCursor++];
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

            const succId = topoQueue[queueCursor++];
            if (processed.has(succId)) {
                continue
            }

            processed.add(succId);

            const succ = chart.resolveTaskRecord(succId);
            if (succ) {
                const
                    useWorking   = Boolean(chart.useWorkingTime && axis?.hasWorkingCalendar?.()),
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

                    for (const edge of inEdges) {
                        const predId = String(edge.fromId ?? '');
                        if (!predId) {
                            continue
                        }

                        if (reachable.has(predId) && !processed.has(predId)) {
                            cycleSet.add(String(edge.id ?? `${predId}->${succId}`));
                            continue
                        }

                        const pred = chart.resolveTaskRecord(predId);
                        if (!pred) {
                            continue
                        }

                        const
                            predStart = new Date(pred[chart.startDateField]).getTime(),
                            predEnd   = new Date(pred[chart.endDateField]).getTime();

                        if (!Number.isFinite(predStart) || !Number.isFinite(predEnd)) {
                            continue
                        }

                        const
                            type     = String(edge.type || 'FS').toUpperCase(),
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
                        let nextStart = maxReqStart,
                            nextEnd   = maxReqEnd;

                        if (axis) {
                            const
                                axisStartMs = axis.start.getTime(),
                                axisEndMs   = axis.end.getTime();

                            if (useWorking) {
                                if (nextStart < axisStartMs) {
                                    nextStart = axis.snapToWorkingTime(axisStartMs, 1).getTime();
                                    nextEnd   = axis.addWorkingMs(nextStart, durationMs).getTime()
                                }
                                if (nextEnd > axisEndMs) {
                                    nextEnd   = axisEndMs;
                                    nextStart = Math.max(axisStartMs, axis.addWorkingMs(nextEnd, -durationMs).getTime())
                                }
                            } else {
                                nextStart = Math.max(axisStartMs, Math.min(nextStart, Math.max(axisStartMs, axisEndMs - durationMs)));
                                nextEnd   = nextStart + durationMs
                            }
                        }

                        if (nextStart !== succStart || nextEnd !== succEnd) {
                            const
                                startField    = chart.startDateField || 'startDate',
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

                            const succPrevious = {};
                            for (const key of Object.keys(succChanges)) {
                                const val = succ[key];
                                succPrevious[key] = val instanceof Date ? new Date(val.getTime()) : val
                            }

                            succ.set(succChanges);

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

        return cascaded
    }
}

export default Neo.setupClass(Cascade);
