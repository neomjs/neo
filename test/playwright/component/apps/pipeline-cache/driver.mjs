import Pipeline from '../../../../../src/data/Pipeline.mjs';
import Fetch    from '../../../../../src/data/connection/Fetch.mjs';

/** @summary Exercises actual App/Data execution, isolated hits and explicit remote invalidation. */
const query = new URL(import.meta.url).searchParams,
      view  = Neo.getComponent('pipeline-cache-viewport');

if (query.get('action') === 'destroy') {
    view.cachePipeline?.destroy();
    view.cachePipeline = null
} else {
    const pipeline = Neo.create(Pipeline, {
        cache          : query.get('cache') === 'true',
        cacheTTL       : 10000,
        connection     : {module: Fetch, url: query.get('url')},
        workerExecution: query.get('realm')
    });
    view.cachePipeline = pipeline;
    await pipeline.ready();

    const first = await pipeline.read({page: 1}), firstId = first.data.id;
    first.data.id = 999;
    const second       = await pipeline.read({page: 1}),
          localEntries = pipeline.readCacheEntries.size,
          remoteId     = pipeline.remoteId;
    const cleared = await pipeline.clearCache();
    const third   = await pipeline.read({page: 1});

    view.cacheReceipt = {firstId, secondId: second.data.id, thirdId: third.data.id,
        localEntries, remoteId, cleared, realm: pipeline.workerExecution}
}
