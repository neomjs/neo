import MainContainer from './MainContainer.mjs';

/** @summary Starts the mixed-component nesting example in the App Worker. */
export const onStart = () => Neo.app({
    mainView: MainContainer,
    name    : 'Neo.examples.functional.nestedComponents'
});
