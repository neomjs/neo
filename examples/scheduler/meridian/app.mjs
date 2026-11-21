import Viewport from './Viewport.mjs';

/** @summary Opens one independent simulated observing night. @returns {Neo.controller.Application} */
export const onStart = () => Neo.app({name: 'MeridianObservatory', mainView: Viewport});
