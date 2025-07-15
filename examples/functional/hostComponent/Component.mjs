import {defineComponent, useConfig} from '../../../src/functional/_export.mjs';
import Button                       from '../../../src/button/Base.mjs';

export default defineComponent({
    config: {
        className: 'Neo.examples.functional.hostComponent.Component'
    },
    createVdom() {
        const [count, setCount] = useConfig(0);

        const style = {
            display       : 'flex',
            flexDirection : 'column',
            alignItems    : 'center',
            justifyContent: 'center',
            fontSize      : '20px'
        };

        return {style, cn: [
            {
                tag : 'p',
                text: `Button clicked ${count} times`
            }, {
                module : Button,
                id     : 'myButtonModule',
                theme  : 'neo-theme-neo-light',
                text   : 'Click Me (Neo Button)',
                handler: () => setCount(prev => prev + 1)
            }
        ]}
    }
});
