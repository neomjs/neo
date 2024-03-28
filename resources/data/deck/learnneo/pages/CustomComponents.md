## Introduction

Neo.mjs is class-based, which means you're free to extend any component (or any other Neo.mjs class).


## Overriding ancestor configs

## Introducing new configs

## Lifecycle config properties

<pre data-neo>
import Button    from '../../../../src/button/Base.mjs';
// In practice this would be some handy reusable component
class MySpecialButton extends Button {
    static config = {
        className: 'Example.view.MySpecialButton',
        iconCls: 'far fa-face-grin-wide',
        ui: 'ghost'
    }
}

Neo.setupClass(MySpecialButton);


import Container from '../../../../src/container/Base.mjs';

class MainView extends Container {
    static config = {
        className: 'Example.view.MainView',
        layout   : {ntype:'vbox', align:'start'},
        items    : [{
            module : Button,
            iconCls: 'fa fa-home',
            text   : 'A framework button'
        }, {
            module : MySpecialButton,
            text   : 'My special button'
        }]
    }
}

Neo.setupClass(MainView);
</pre>

