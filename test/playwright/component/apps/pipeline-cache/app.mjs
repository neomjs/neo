import Viewport from '../../../../../src/container/Viewport.mjs';

/** @summary Empty view hosting the Pipeline cache driver's observable receipt. */
export const onStart = () => Neo.app({
    mainView: {module: Viewport, id: 'pipeline-cache-viewport'},
    name    : 'PipelineCacheTestApp'
});
