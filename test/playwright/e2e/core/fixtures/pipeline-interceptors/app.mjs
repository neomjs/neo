import Viewport from './Viewport.mjs';

/** @summary Starts the consumer through the normal App-worker entrypoint. */
export const onStart = () => {
    const app = Neo.app({mainView: Viewport, name: 'PipelineInterceptorProbe'});
    app.mainView.runProbe()
};
