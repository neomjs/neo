import Pipeline from '../../../../../src/data/Pipeline.mjs';
import Fetch    from '../../../../../src/data/connection/Fetch.mjs';

/** @summary Sends serializable request headers through the actual Pipeline and exposes the returned HTTP receipt. */
const query = new URL(import.meta.url).searchParams,
      view  = Neo.getComponent('pipeline-cache-viewport'),
      realm = query.get('realm');

const pipeline = Neo.create(Pipeline, {
    connection     : {module: Fetch, url: query.get('url')},
    workerExecution: realm
});
view.cachePipeline = pipeline;
await pipeline.ready();

const headers = {authorization: 'Bearer pipeline-header-probe', 'x-neo-probe': realm},
      first   = await pipeline.read({headers}),
      control = await pipeline.read({});

/**
 * @summary Keeps response and request metadata beside the server's independent header receipt.
 * @param {Object} response
 * @returns {Object}
 */
const summarize = response => ({
    data          : response.data,
    ok            : response.ok,
    requestHeaders: response.request.headers ?? null,
    requestUrl    : response.request.url,
    status        : response.status,
    url           : response.url
});

view.fetchHeadersReceipt = {
    first       : summarize(first),
    control     : summarize(control),
    headersAfter: headers,
    realm       : pipeline.workerExecution,
    remoteId    : pipeline.remoteId
};
