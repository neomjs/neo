import Neo                                        from '../../../../../../../src/Neo.mjs';
import * as core                                  from '../../../../../../../src/core/_export.mjs';
import AiConfig                                   from '../../../../../../../ai/config.template.mjs';
import {Orchestrator}                             from '../../../../../../../ai/daemons/orchestrator/Orchestrator.mjs';
import {buildTaskDefinitions}                     from '../../../../../../../ai/daemons/orchestrator/taskDefinitions.mjs';
import TaskStateService, {createInitialTaskState} from '../../../../../../../ai/daemons/orchestrator/services/TaskStateService.mjs';

/**
 * @summary A fresh-process witness for the supervised-child heap ceiling, run as a child of the spec.
 *
 * **Why a whole process instead of a fixture inside the spec.** The value under test resolves through
 * the leaf's env layer, and that layer runs once — at config construction, during the first canonical
 * import. A spec that sets the member afterwards with `AiConfig.setData` proves the member can be
 * *written*, which is not the claim: a deployment sets `NEO_SUPERVISED_TASK_HEAP_MB` and the leaf's
 * `metadata.parse` hook reads it by name. Only an env that exists *before* these imports exercises
 * that path. The mutation was also unsound beyond its own assertion — it wrote the shared `AiConfig`
 * singleton, so any later spec in that file resolving config inside the mutated window would inherit
 * a value it never asked for and fail as an unrelated flake.
 *
 * Nothing here is stubbed except `spawnFn`. The two hops are read off the real objects: the
 * Orchestrator's construction seam injects the resolved leaf into `ProcessSupervisorService`, and
 * `runTask` composes the child env, which is the only surface a real supervised child ever sees.
 *
 * Emits one JSON line on stdout. Any throw exits non-zero with the reason on stderr, so the spec
 * fails on a spawn or boot failure rather than silently degrading to an in-process shortcut.
 */

const DATA_DIR = `/tmp/orchestrator-heap-ceiling-witness-${process.pid}`;

const taskDefinitions = buildTaskDefinitions({scriptDir: '/repo/ai/scripts', nodeBin: '/node'});

TaskStateService.configure({
    stateFile : `${DATA_DIR}/state.json`,
    taskDefinitions,
    writeLogFn: () => {}
});

TaskStateService.taskState = createInitialTaskState(taskDefinitions);

// `authorityProfile` is read during `Neo.create`'s config processing — before any instance field a
// caller could assign afterwards — and falls back to `AiConfig.orchestrator.authorityProfile`, whose
// leaf default is the empty string that the profile assertion rejects. The spec supplies it through
// this process's env for the same reason it supplies the ceiling that way: in a fresh process the env
// layer is the configuration channel, and reaching for `setData` here would reintroduce exactly the
// singleton mutation this fixture exists to remove.
const orchestrator = Neo.create(Orchestrator, {
    dataDir         : DATA_DIR,
    stateFile       : `${DATA_DIR}/state.json`,
    logFile         : null,
    taskDefinitions,
    taskStateService: TaskStateService,
    healthService   : {recordTaskOutcome() {}},
    spawnFn         : () => { throw new Error('spawnFn not expected during construction') }
});

orchestrator.writeLog = () => {};

const supervisor = orchestrator.processSupervisorService;

// SECOND HOP, driven rather than replayed. Calling `buildSupervisedTaskEnv` directly would hand-feed
// the value across the very boundary under test; driving `runTask` makes the assertion depend on the
// production expression instead of on a copy of it.
const probeDefinition = {
    heapCeilingProbe: {
        label          : 'Heap Ceiling Probe',
        command        : 'node',
        args           : ['--version'],
        pidFileName    : 'heap-ceiling-probe.pid',
        expectedCommand: 'node'
    }
};

supervisor.taskDefinitions = {...supervisor.taskDefinitions, ...probeDefinition};

// A definition added after construction has no `taskState`, and `runTask` would read `state.running`
// off undefined. Seeded with the same factory rather than a hand-shaped literal, so the probe cannot
// drift from the real initial shape.
Object.assign(TaskStateService.taskState, createInitialTaskState(probeDefinition));

let spawnedEnv = null;

supervisor.spawnFn = (command, args, options) => {
    spawnedEnv = options.env;
    return {pid: 4711, on: () => {}, stderr: {on: () => {}}}
};

const ran = supervisor.runTask('heapCeilingProbe', 'heap-ceiling-witness');

process.stdout.write(JSON.stringify({
    // Echoed so the spec can prove the child actually received the override rather than inferring it
    // from a value that might have come from a default.
    envVarSeen         : process.env.NEO_SUPERVISED_TASK_HEAP_MB ?? null,
    resolvedLeaf       : AiConfig.orchestrator.supervisedTaskHeapMb,
    injectedIntoService: supervisor.supervisedTaskHeapMb,
    ran,
    spawnedNodeOptions : spawnedEnv?.NODE_OPTIONS ?? null
}));
