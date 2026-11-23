import Viewport from '../../../../../../src/container/Viewport.mjs';
import Model    from '../../../../../../src/data/Model.mjs';
import Store    from '../../../../../../src/data/Store.mjs';

/** @summary Starts ordinary Store loading without importing any custom stage into App. */
class StageProbe extends Viewport {
    static config = {
        className: 'PipelineStageModules.Viewport',
        id       : 'pipeline-stage-probe',
        receipt_ : null
    }

    /** @summary Exposes the user-visible outcome and structured worker/Store evidence. */
    async runProbe() {
        const descriptor = name => ({className: `PipelineStageModules.${name}`,
                  modulePath: `examples/data/fixtures/pipeline-stage-modules/${name}.mjs`}),
              store = Neo.create(Store, {
                  model: {module: Model, fields: [
                      {name: 'id', type: 'Integer'},
                      ...['connectionRealm', 'parserRealm', 'normalizerRealm'].map(name => ({name, type: 'String'})),
                      ...['connectionPath', 'parserPath', 'normalizerPath'].map(name => ({name, type: 'Boolean'}))
                  ]},
                  pipeline: {workerExecution: 'data', maxRemoteRetries: 0,
                      connection: descriptor('Connection'), parser: descriptor('Parser'), normalizer: descriptor('Normalizer')}
              });
        try {
            await store.ready();
            await store.pipeline.initRemoteExecution();
            if (store.pipeline.remoteInitializationError) throw store.pipeline.remoteInitializationError;
            await store.load();
            const rows = store.items.map(record => record.toJSON());
            this.receipt = {status: 'complete', count: store.count, rows, remoteId: store.pipeline.remoteId,
                appHasStages: ['Connection', 'Parser', 'Normalizer'].some(name => !!Neo.ns(`PipelineStageModules.${name}`, false))};
            this.html = `Loaded ${store.count} row(s) from the Data worker`
        } catch (error) {
            this.receipt = {status: 'failed', error: error?.message || String(error), count: store.count};
            this.html = `Load failed: ${this.receipt.error}`
        } finally {
            store.destroy()
        }
    }
}
Neo.setupClass(StageProbe);

/** @summary Boots the real App and Data workers through MicroLoader. */
export const onStart = () => {
    const app = Neo.app({name: 'PipelineStageModules', mainView: StageProbe});
    app.mainView.runProbe()
};
