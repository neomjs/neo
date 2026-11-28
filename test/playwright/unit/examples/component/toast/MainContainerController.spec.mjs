import {setup} from '../../../../setup.mjs';

setup({appConfig: {name: 'ToastSourcePublicationTest'}});

import {expect, test} from '@playwright/test';
import Neo            from '../../../../../../src/Neo.mjs';
import * as core      from '../../../../../../src/core/_export.mjs';
import MainContainer  from '../../../../../../examples/component/toast/MainContainer.mjs';
import Controller     from '../../../../../../examples/component/toast/MainContainerController.mjs';

test('valid edits publish raw source and wait for the render; invalid input preserves the preview', async () => {
    const code   = {}, events = [], button = {}, closable = {},
          values = {msg: '<div>&amp;</div>', closable: true};
    let   valid    = true, resolveRender;
    const rendered = new Promise(resolve => {resolveRender = resolve}),
          references = {
              form  : {isValid: async () => valid, getSubmitValues: async () => ({...values})},
              output: {
                  vdom         : {cn: [{cn: [code]}]},
                  itemTpl      : data => {events.push(data); return data.msg},
                  promiseUpdate: () => rendered
              },
              'creation-button': button,
              closable
          },
          controller = {
              component      : {appName: 'ToastSourcePublicationTest', windowId: 'toast-window'},
              getReference   : name => references[name],
              syntaxHighlight: () => events.push('highlight')
          };

    const publication = Controller.prototype.onChange.call(controller, {value: false});
    await expect.poll(() => code.text).toBe(values.msg);
    expect(code.html).toBeUndefined();
    expect(closable.value).toBe(false);
    expect(button.disabled).toBe(false);
    expect(events).toEqual([{...values, appName: 'ToastSourcePublicationTest', windowId: 'toast-window'}]);
    resolveRender();
    await publication;
    expect(events.at(-1)).toBe('highlight');

    valid = false;
    await Controller.prototype.onChange.call(controller, {value: ''});
    expect(button.disabled).toBe(true);
    expect(events).toHaveLength(2);
    expect(code.text).toBe(values.msg)
});

test('the template leaves markup literal and retains JavaScript quoting and context', () => {
    const output = MainContainer.config.items[1].items[1];
    const source = output.itemTpl({msg: "<div>&amp;</div> 'quote' \\path", closable: true});
    let call;
    new Function('Neo', source).call({appName: 'toast-app', windowId: 'toast-window'}, {toast: data => {call = data}});
    expect(call).toEqual({appName: 'toast-app', windowId: 'toast-window', msg: "<div>&amp;</div> 'quote' \\path", closable: true});
    expect(source).toContain('<div>&amp;</div>')
});
