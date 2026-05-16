---
id: 1556
title: Missing some classes modules in _export.mjs files
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2021-03-21T16:21:28Z'
updatedAt: '2021-03-21T16:28:34Z'
githubUrl: 'https://github.com/neomjs/neo/issues/1556'
author: wemersonjanuario
commentsCount: 0
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-03-21T16:28:34Z'
---
# Missing some classes modules in _export.mjs files

**Describe the bug**
Error while using no-exported fields classes in form container.

```
import Form from '../../../node_modules/neo.mjs/src/form/Container.mjs';
import Toolbar from '../../../node_modules/neo.mjs/src/container/Toolbar.mjs';
import Button from '../../../node_modules/neo.mjs/src/button/Base.mjs';
import * as field from '../../../node_modules/neo.mjs/src/form/field/_export.mjs';

class MyForm extends Form {
    static getConfig() {
        return {
            className: 'MyApp.view.MyForm',
            ntype: 'my-form',
            layout: {
                ntype: 'vbox'
            },
            items: [{
                module: field.Text,
                required: true,
                labelText: 'Text',
                placeholderText: 'placeholder'
            }, {
                module: field.Number,
                labelText: 'Number',
                clearable: true
            }, {
                module: field.Select,
                labelText: 'Select',
                clearable: true
            }, {
                module: field.Email,
                labelText: 'Email'
            }, {
                module: field.Password,
                labelText: 'Password'
            }, {
                module: field.Search,
                labelText: 'Search'
            }, {
                module: field.TextArea,
                labelText: 'TextArea'
            }, {
                module: field.Date,
                labelText: 'Date'
            }, {
                module: field.Time,
                labelText: 'Time'
            }, {
                ntype: 'component',
                flex: 1
            }, {
                module: Toolbar,
                dock: 'bottom',
                layout: {
                    ntype: 'hbox',
                    pack: 'end'
                },
                items: ['->', {
                    module: Button,
                    text: 'Save'
                }]
            }]
        }
    }
}

Neo.applyClassConfig(MyForm);

export {MyForm as default}
```
**To Reproduce**
Steps to reproduce the behavior:
1. Create a Form class that uses all fields
2. import * as field from '../../../node_modules/neo.mjs/src/form/field/_export.mjs';
3. Add all form fields to form items
4. See error - Uncaught (in promise) Error: Class defined with object configuration missing ntype property. undefined

**Expected behavior**
No errors, all fields should be imported by _export.mjs

**Screenshots**
![img-2021-03-21-13-12-57](https://user-images.githubusercontent.com/38724/111912221-7a0e4a00-8a47-11eb-938b-a8ddfe3c7cb3.png)

![img-2021-03-21-12-26-42](https://user-images.githubusercontent.com/38724/111912391-18021480-8a48-11eb-96a5-0599323e3b62.png)



**Desktop :**
 - OS: Windows 10
 - Browser Chrome
 - Version 89.0

**Smartphone (please complete the following information):**
 Not Tested





## Timeline

- 2021-03-21T16:21:29Z @wemersonjanuario added the `bug` label
- 2021-03-21T16:26:42Z @wemersonjanuario cross-referenced by PR #1557
- 2021-03-21T16:28:34Z @tobiu closed this issue

