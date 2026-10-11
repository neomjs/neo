import Harness from './Harness.mjs';

export const onStart = () => Neo.app({
    mainView: Harness,
    name    : 'Neo.examples.dashboard.crossWindowWitness'
});
