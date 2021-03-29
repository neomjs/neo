import MainContainer from './MainContainer.mjs';

const onStart = () => Neo.app({
    appPath : 'examples/form/field/text/',
    mainView: MainContainer,
    name    : 'Neo.examples.form.field.text'
});

export {onStart as onStart};