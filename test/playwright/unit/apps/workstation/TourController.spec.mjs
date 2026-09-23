import {setup}        from '../../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Workspace      from '../../../../../apps/workstation/view/Workspace.mjs';

setup({appConfig: {name: 'WorkstationTourControllerTest'}});

/** @summary A caller-controlled acknowledgement boundary. @returns {Object} */
function deferred() {
    let resolve;
    const promise = new Promise(done => resolve = done);
    return {promise, resolve}
}

test('the configured runner cannot begin its next beat before the controller cue settles', async () => {
    const workspace  = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          controller = await workspace.getController().getTourController(),
          cue        = deferred(), entered = deferred(), beats = [];
    controller.executeCue = () => {entered.resolve(); return cue.promise};
    controller.setPipProgress = async () => {};
    controller.tourRunner = {script: {
        schema: 'neo.tour.script.v1', id: 'settlement-control', title: 'Settlement control',
        scenes: [{id: 's', title: 'Scene', steps: [
            {type: 'pause', ms: 0, cue: {type: 'test-cue'}},
            {type: 'pause', ms: 0}
        ]}]
    }};
    const runner = controller.tourRunner;
    runner.on('beat', data => beats.push(data.stepIndex));
    try {
        const run = runner.start();
        await entered.promise;
        await new Promise(setImmediate);
        expect(beats).toEqual([0]);
        cue.resolve({applied: true, errors: []});
        expect((await run).completed).toBe(true);
        expect(beats).toEqual([0, 1]);
        await controller.progressPromise
    } finally {cue.resolve({applied: true, errors: []}); workspace.destroy()}
});

/**
 * @summary A one-scene screenplay: two cued beats, then a plain pause.
 * @param {Object} first  The first beat's cue.
 * @param {Object} second The second beat's cue.
 * @returns {Object}
 */
function cuedScript(first, second) {
    return {
        schema: 'neo.tour.script.v1', id: 'fail-closed-control', title: 'Fail-closed control',
        scenes: [{id: 's', title: 'Scene', steps: [
            {type: 'pause', ms: 0, cue: first},
            {type: 'pause', ms: 0, cue: second},
            {type: 'pause', ms: 0}
        ]}]
    }
}

test('a failed window cue fails its beat: the runner stops before the next window effect and keeps the forensics', async () => {
    const workspace  = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          controller = await workspace.getController().getTourController(),
          executed   = [], beats = [];
    controller.executeCue = async cue => {
        executed.push(cue.type);
        return cue.type === 'tear-out' ? {applied: false, errors: ['vessel did not open']} : {applied: true, errors: []}
    };
    controller.setPipProgress = async () => {};
    controller.tourRunner = {script: cuedScript({type: 'tear-out', itemId: 'metrics'}, {type: 'convert-while-dragging', itemId: 'commits'})};
    const runner = controller.tourRunner;
    runner.on('beat', data => beats.push(data.stepIndex));
    try {
        const result = await runner.start();
        expect(result.completed).toBe(false);
        expect(result.errors).toEqual(['s[0] host step settlement failed: tear-out: vessel did not open']);
        expect(executed, 'the conversion never runs on top of a failed tear-out').toEqual(['tear-out']);
        expect(beats).toEqual([0]);
        expect(controller.cueErrors).toEqual(['tear-out: vessel did not open']);
        expect(controller.cueReceipts).toEqual([{
            cue: {type: 'tear-out', itemId: 'metrics'}, receipt: {applied: false, errors: ['vessel did not open']}
        }]);
        await controller.progressPromise
    } finally {workspace.destroy()}
});

test('an un-applied terminal passes only with the driver\'s zero-mutation proof', async () => {
    const unproven = 's[0] host step settlement failed: tear-out: un-applied terminal did not prove the document unchanged';
    for (const [proof, errors] of [
        [{documentsUnchanged: true}, []],
        [{documentsUnchanged: false}, [unproven]],
        [undefined, [unproven]]
    ]) {
        const workspace  = Neo.create(Workspace, {windowId: Neo.config.windowId}),
              controller = await workspace.getController().getTourController();
        controller.executeCue = async () => ({applied: false, errors: [], proof, reentered: true});
        controller.setPipProgress = async () => {};
        controller.tourRunner = {script: cuedScript(
            {type: 'tear-out', itemId: 'metrics', options: {reenter: true}}, {type: 'stack-return', ownerItemId: 'metrics'}
        )};
        try {
            const result = await controller.tourRunner.start();
            expect(result.errors, JSON.stringify(proof)).toEqual(errors);
            expect(result.completed).toBe(errors.length === 0);
            await controller.progressPromise
        } finally {workspace.destroy()}
    }
});

test('a gate holds until Continue; under autoGates it settles on its own and publishes no prompt', async () => {
    const workspace  = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          controller = await workspace.getController().getTourController(),
          provider   = workspace.getStateProvider(), prompt = 'Continue — the window';
    try {
        expect(controller.autoGates).toBe(false);
        const gate = controller.openGate({prompt});
        expect(gate).toBeInstanceOf(Promise);
        expect(controller.getPendingGate()).toEqual({prompt});
        expect(provider.getData('tour.gatePrompt')).toBe(prompt);
        expect(controller.getTourState().gate).toEqual({prompt});
        expect(controller.continueTour()).toBe(true);
        expect(await gate).toEqual({applied: true, continued: 'viewer', prompt});
        expect(controller.getPendingGate()).toBeNull();
        expect(provider.getData('tour.gatePrompt')).toBeNull();
        expect(controller.continueTour(), 'nothing is waiting').toBe(false);

        controller.autoGates = true;
        expect(controller.openGate({prompt})).toEqual({applied: true, continued: 'auto', prompt});
        expect(controller.getPendingGate()).toBeNull();
        expect(provider.getData('tour.gatePrompt')).toBeNull()
    } finally {workspace.destroy()}
});

test('startTour sets the gate mode only when asked: a gated screenplay then runs unattended, and stays so until told otherwise', async () => {
    const workspace  = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          controller = await workspace.getController().getTourController(),
          prompt     = 'Continue — go',
          script     = {
              schema: 'neo.tour.script.v1', id: 'gate-mode', title: 'Gate mode',
              scenes: [{id: 's', title: 'Scene', steps: [{type: 'pause', ms: 0, cue: {type: 'gate', prompt}}]}]
          },
          continued  = receipt => receipt.cueReceipts.map(entry => entry.receipt.continued);
    controller.setPipProgress = async () => {};
    workspace.refreshDockWorkspace = async () => {};
    try {
        // viewer mode: the run holds at the gate until Continue
        const held = controller.startTour(script);
        await expect.poll(() => controller.getPendingGate()).toEqual({prompt});
        expect(controller.continueTour()).toBe(true);
        const viewer = await held;
        expect(viewer.completed).toBe(true);
        expect(continued(viewer)).toEqual(['viewer']);

        // asked once, the mode holds for this controller: the next Start needs no viewer either
        const auto = await controller.startTour(script, {autoGates: true});
        expect(auto.completed).toBe(true);
        expect(continued(auto)).toEqual(['auto']);
        expect(controller.autoGates).toBe(true);
        expect(continued(await controller.startTour(script))).toEqual(['auto']);

        // and the viewer gets the gate back when asked
        const back = controller.startTour(script, {autoGates: false});
        await expect.poll(() => controller.getPendingGate()).toEqual({prompt});
        expect(controller.continueTour()).toBe(true);
        expect(continued(await back)).toEqual(['viewer'])
    } finally {workspace.destroy()}
});

test('repeated starts share the entry projection and cancellation does not start the runner afterward', async () => {
    const workspace  = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          controller = await workspace.getController().getTourController(),
          entry      = deferred(), entered = deferred(), runner = controller.getTourRunner();
    let starts = 0, projections = 0;
    controller.setPipProgress = async () => {};
    workspace.refreshDockWorkspace = () => {projections++; entered.resolve(); return entry.promise};
    runner.start = async () => {starts++; return {completed: true, errors: [], log: []}};
    try {
        const first = controller.startTour();
        await entered.promise;
        expect(controller.startTour()).toBe(first);
        expect(projections).toBe(1);
        await controller.cancelTour();
        expect(await first).toMatchObject({completed: false, cancelled: true});
        entry.resolve();
        await new Promise(setImmediate);
        expect(starts).toBe(0);
        expect(workspace.isDestroyed).toBeFalsy()
    } finally {entry.resolve(); workspace.destroy()}
});

test('cancelling a replay probe waits for its displaced-document restoration', async () => {
    const workspace  = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          controller = await workspace.getController().getTourController(),
          live       = workspace.dockModel, entry = deferred(), entered = deferred(),
          restore    = deferred(), restoring = deferred();
    let calls = 0;
    workspace.refreshDockWorkspace = () => {
        if (++calls === 1) {entered.resolve(); return entry.promise}
        restoring.resolve();
        return restore.promise
    };
    const run = controller.runTourSpec(null, {restoreDocument: true});
    run.catch(() => {});
    try {
        await entered.promise;
        let   settled      = false;
        const cancellation = controller.cancelTour().then(() => {settled = true});
        await restoring.promise;
        expect(workspace.dockModel).toBe(live);
        await new Promise(setImmediate);
        expect(settled).toBe(false);
        entry.resolve();
        restore.resolve();
        await cancellation;
        await expect(run).rejects.toBe(Neo.isDestroyed);
        expect(calls).toBe(2)
    } finally {entry.resolve(); restore.resolve(); workspace.destroy()}
});

test('cancellation during final settlement returns cancellation rather than reading a disposed owner', async () => {
    const workspace  = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          controller = await workspace.getController().getTourController(),
          refresh    = deferred(), started = deferred(), runner = controller.getTourRunner();
    controller.setPipProgress = async () => {};
    workspace.refreshDockWorkspace = async () => {};
    runner.start = async () => {
        workspace.refreshPromise = refresh.promise;
        started.resolve();
        return {completed: true, errors: [], log: []}
    };
    try {
        const run = controller.startTour();
        await started.promise;
        await new Promise(setImmediate);
        await controller.cancelTour();
        expect(await run).toMatchObject({completed: false, cancelled: true});
        expect(workspace.isDestroyed).toBeFalsy()
    } finally {refresh.resolve(); workspace.destroy()}
});

test('cancellation and reactivation wait for a driver input that was already dispatched', async () => {
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          root      = workspace.getController(), controller = await root.getTourController(),
          driver    = controller.getGestureDriver(), service = driver.interactionService,
          input     = deferred(), started = deferred(), events = [];
    service.simulateEvent = () => {started.resolve(); return input.promise};
    service.dispatch = async ({type}) => {events.push(type); return true};
    const gesture = driver.runGesture(run => driver.simulateEvent(run, {events: [{
        targetId: 'held-tab', windowId: workspace.windowId, type: 'mousedown', options: {buttons: 1}
    }]}));
    gesture.catch(() => {});
    try {
        await started.promise;
        let   cancelled    = false, reactivated = false;
        const cancellation = controller.cancelTour().then(() => {cancelled = true}),
              next = root.getTourController().then(value => {reactivated = true; return value});
        await new Promise(setImmediate);
        expect(cancelled).toBe(false);
        expect(reactivated).toBe(false);
        expect(Neo.get(service.id)).toBe(service);
        input.resolve(true);
        await cancellation;
        await expect(gesture).rejects.toBe(Neo.isDestroyed);
        const replacement = await next;
        expect(replacement).not.toBe(controller);
        expect(events).toEqual(['keydown', 'mouseup']);
        expect(service.isDestroyed).toBe(true)
    } finally {input.resolve(true); workspace.destroy()}
});

test('normal chrome binds the root provider without a playback controller or runner', () => {
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId});
    try {
        const controller = workspace.getController(), bar = controller.getReference('tour-bar'),
              provider   = workspace.getStateProvider(), caption = controller.getReference('tour-caption'),
              pips       = controller.getReference('tour-pips'), play = controller.getReference('tour-play');
        expect(bar.controller).toBeFalsy();
        expect(workspace.tourRunner).toBeUndefined();
        expect(workspace.startTour).toBeUndefined();
        expect(play.handler).toBe('onStartTour');
        provider.setData({'tour.caption': 'Bound independently', 'tour.completedCount': 2, 'tour.running': true});
        expect(caption.html).toBe('Bound independently');
        expect([...pips.html.matchAll(/workstation-pip-done/g)]).toHaveLength(2);
        expect(play.disabled).toBe(true);
        provider.setData({'tour.running': false});
        expect(play.disabled).toBe(false);
        expect(bar.controller).toBeFalsy()
    } finally {workspace.destroy()}
});

test('the actual string handler reaches the workspace controller through engine resolution', async () => {
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId});
    try {
        const controller = workspace.getController(), play = controller.getReference('tour-play');
        let   calls      = 0;
        play.useRippleEffect = false;
        controller.getTourController = async () => ({startTour: () => calls++});
        play.onClick({});
        await new Promise(setImmediate);
        expect(calls).toBe(1)
    } finally {workspace.destroy()}
});

test('concurrent activation installs one real toolbar controller; collaborators stay demand-created', async () => {
    const workspace   = Neo.create(Workspace, {windowId: Neo.config.windowId});
    const dockService = workspace.dockService;
    try {
        const root = workspace.getController(), [first, second] = await Promise.all([
            root.getTourController(), root.getTourController()
        ]);
        expect(first).toBe(second);
        expect(first.component).toBe(root.getReference('tour-bar'));
        expect(first.workspace).toBe(workspace);
        expect(first.getReference('tour-caption')).toBe(root.getReference('tour-caption'));
        expect(first.tourRunner).toBeNull();
        expect(first.gestureDriver).toBeNull();
        const runner = first.getTourRunner(), driver = first.getGestureDriver();
        expect(runner.dockService).toBe(dockService);
        expect(driver.workspace).toBe(workspace);
        runner.fire('scene', {title: 'Resolved string listener', caption: 'caption'});
        expect(root.getReference('tour-caption').html).toBe('Resolved string listener — caption');
        await first.cancelTour();
        expect(first.isDestroyed).toBe(true);
        expect(runner.isDestroyed).toBe(true);
        expect(driver.isDestroyed).toBe(true);
        expect(Neo.get(dockService.id)).toBe(dockService);
        expect(workspace.isDestroyed).toBeFalsy();
        const replacement = await root.getTourController();
        expect(replacement).not.toBe(first)
    } finally {workspace.destroy()}
});

test('root destruction during lazy activation cannot attach a late controller', async () => {
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          pending   = workspace.getController().getTourController();
    workspace.destroy();
    await expect(pending).rejects.toBe(Neo.isDestroyed)
});

test('playback observes workspace destruction before its borrowed dock service is retired', async () => {
    const workspace  = Neo.create(Workspace, {windowId: Neo.config.windowId}),
          controller = await workspace.getController().getTourController(),
          runner     = controller.getTourRunner(), driver = controller.getGestureDriver(),
          service    = workspace.dockService, destroy = service.destroy.bind(service);
    let checked = false;
    service.destroy = () => {
        expect(controller.isDestroyed).toBe(true);
        expect(runner.isDestroyed).toBe(true);
        expect(driver.isDestroyed).toBe(true);
        checked = true;
        return destroy()
    };
    workspace.destroy();
    expect(checked).toBe(true)
});

test('configured collaborators preserve class and instance defaults and execute the selected controller', async () => {
    const {default: TourController} = await import('../../../../../apps/workstation/view/TourController.mjs');
    const {default: TourRunner}     = await import('../../../../../src/ai/client/TourRunner.mjs');
    let   scenes                    = 0;
    class ConfiguredController extends TourController {
        static config = {className: 'Test.Unit.WorkstationTour.ConfiguredController'}
        onTourScene(data) {scenes++; super.onTourScene(data)}
    }
    class ConfiguredRunner extends TourRunner {
        static config = {className: 'Test.Unit.WorkstationTour.ConfiguredRunner', paceMultiplier: 4}
    }
    Neo.setupClass(ConfiguredController);
    Neo.setupClass(ConfiguredRunner);
    const workspace = Neo.create(Workspace, {windowId: Neo.config.windowId});
    try {
        const root = workspace.getController(), bar = root.getReference('tour-bar');
        bar.controller = {module: ConfiguredController, workspace};
        const controller = await root.getTourController();
        expect(controller).toBe(bar.controller);
        controller.tourRunner = {module: ConfiguredRunner};
        const first = controller.tourRunner;
        expect(first.paceMultiplier).toBe(4);
        first.fire('scene', {title: 'Class default'});
        expect(scenes).toBe(1);
        expect(controller.getReference('tour-caption').html).toBe('Class default');
        controller.tourRunner = {module: ConfiguredRunner, paceMultiplier: 2};
        const second = controller.tourRunner;
        expect(first.isDestroyed).toBe(true);
        expect(second.paceMultiplier).toBe(2);
        second.fire('scene', {title: 'Instance override'});
        expect(scenes).toBe(2);
        expect(controller.getReference('tour-caption').html).toBe('Instance override');
        controller.tourRunner = null;
        expect(second.isDestroyed).toBe(true);
        expect(controller.tourRunner).toBeNull();
        expect(Neo.get(workspace.dockService.id)).toBe(workspace.dockService)
    } finally {workspace.destroy()}
});
