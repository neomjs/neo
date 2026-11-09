import BaseViewport from '../../node_modules/neo.mjs/src/container/Viewport.mjs';
import Fetch        from '../../node_modules/neo.mjs/src/data/connection/Fetch.mjs';
import Handler      from './Handler.mjs';
import Pipeline     from '../../node_modules/neo.mjs/src/data/Pipeline.mjs';
import Stream       from '../../node_modules/neo.mjs/src/data/connection/Stream.mjs';
import StreamParser from '../../node_modules/neo.mjs/src/data/parser/Stream.mjs';

/** @summary Runs consumer operations during normal app startup and exposes only serializable receipts. */
class Viewport extends BaseViewport {
    static config = {
        className: 'PipelineInterceptorProbe.Viewport',
        id       : 'pipeline-interceptor-probe',
        receipt_ : null
    }

    /** @summary Creates consumer descriptors through the same imported class API applications use. */
    descriptor(token, mode = 'shape') {
        return {module: Handler, modulePath: 'apps/probe/Handler.mjs', token, mode}
    }

    /** @summary Installs globals explicitly in the realm which executes this test's Pipeline. */
    async setGlobals(realm, descriptors) {
        if (realm === 'app') return Pipeline.setGlobalInterceptors(descriptors);
        return Neo.worker.Data.setPipelineInterceptors({interceptors: descriptors.map(({module, ...config}) => ({
            ...config, className: module.prototype.className
        }))})
    }

    /** @summary Owns each Pipeline until its complete request and streaming receipt has been captured. */
    async exercise(realm) {
        const pipelines = [],
              endpoint  = name => `${globalThis.location.origin}/api/${realm}/${name}`,
              make      = (name, config = {}) => {
                  const pipeline = Neo.create(Pipeline, {
                      connection      : {module: Fetch, url: endpoint(name)},
                      maxRemoteRetries: 0, workerExecution: realm, ...config
                  });
                  pipelines.push(pipeline);
                  return pipeline
              };

        try {
            await this.setGlobals(realm, []);
            const control = make('control');
            await control.ready();
            const unchanged = await control.read({});

            const pipeline = make('cached', {cache: true, interceptors: [this.descriptor('local')]});
            await pipeline.ready();
            await this.setGlobals(realm, [this.descriptor('global')]);
            const first = await pipeline.read({}), cached = await pipeline.read({});
            await pipeline.setInterceptors([this.descriptor('local-next')]);
            const localChanged = await pipeline.read({});
            await this.setGlobals(realm, [this.descriptor('global-next')]);
            const globalChanged = await pipeline.read({});
            await this.setGlobals(realm, []);

            const recovery = make('failure', {interceptors: [this.descriptor('recover', 'recover')]});
            await recovery.ready();
            const recovered = await recovery.read({});
            const rejection = make('failure', {interceptors: [this.descriptor('reject')]});
            await rejection.ready();
            let rejected = false;
            try {await rejection.read({})} catch {rejected = true}

            const remoteRejections = [];
            for (const telemetry of [false, true]) {
                const refused = make(`uncloneable-${telemetry}`, {
                    interceptors: [this.descriptor('refuse', 'uncloneable')], maxRemoteRetries: 2, telemetry
                });
                await refused.ready();
                try {await refused.read({})} catch (error) {remoteRejections.push(error.message)}
            }

            await this.setGlobals(realm, [this.descriptor('stream-global', 'stream')]);
            const stream = make('stream', {
                cache       : true,
                connection  : {module: Stream, url: endpoint('stream')},
                interceptors: [this.descriptor('stream-local', 'stream')],
                parser      : {module: StreamParser, chunkSize: 1, initialChunkSize: 1}
            });
            await stream.ready();
            const batches = [], progress = [];
            stream.on('data', rows => batches.push(rows));
            stream.on('progress', event => progress.push({loaded: event.loaded, total: event.total}));
            const streamFirst = await stream.read({}), firstBatchCount = batches.length,
                  streamAgain = await stream.read({});

            return {
                realm, remoteId: pipeline.remoteId, unchanged, first, cached, localChanged, globalChanged,
                recovered, rejected, remoteRejections,
                stream: {batches, firstBatchCount, progress, first: streamFirst, again: streamAgain}
            }
        } finally {
            await this.setGlobals(realm, []);
            pipelines.forEach(pipeline => pipeline.destroy())
        }
    }

    /** @summary Retains setup failures as inspectable app state instead of hiding them behind a timeout. */
    async runProbe() {
        try {
            this.receipt = {status: 'complete', app: await this.exercise('app'), data: await this.exercise('data')}
        } catch (error) {
            this.receipt = {status: 'failed', error: error?.stack || String(error)}
        }
    }
}

export default Neo.setupClass(Viewport);
