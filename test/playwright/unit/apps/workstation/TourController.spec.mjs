import {setup}        from '../../../setup.mjs';
import {test, expect} from '@playwright/test';
import Neo            from '../../../../../src/Neo.mjs';
import * as core      from '../../../../../src/core/_export.mjs';
import Workspace      from '../../../../../apps/workstation/view/Workspace.mjs';

setup({appConfig: {name: 'WorkstationTourControllerTest'}});

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
