---
id: 5851
title: 'list config:  useCheckboxes: true  checkbox -- selection fails in neo 7.0.6'
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2024-09-03T04:38:22Z'
updatedAt: '2024-09-04T00:13:01Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5851'
author: gplanansky
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-09-03T14:43:04Z'
---
# list config:  useCheckboxes: true  checkbox -- selection fails in neo 7.0.6

**Describe the bug**

With the list configured:  ``useCheckboxes: true``,   checkboxes appear but they stay empty when clicked.   

It works in neo 6.10, where ``selection/model: select(...)`` gets invoked and
adds the value "neo-selected" to the class.
In neo 7.0.6,  select() is not invoked.

**To Reproduce**
0.  install as normal: git clone neo 7.0.6:
```
git clone https://github.com/neomjs/neo.git
mv neo neo-7.0.6
cd neo-7.0.6
npm i
npm run build all
```

1. Modify examples/todoList/version2  config with ``useCheckBoxes: true`` to get checkboxes:

```
cd examples/todoList

head TodoList.mjs

class TodoList extends List {
    static config = {
        className   : 'Neo.examples.todoList.version2.TodoList',
        displayField: 'text',
        useCheckBoxes: true
    }
```

```
$ pwd
.../neo-7.0.6/examples/todoList/version2

$ diff TodoList.mjs TodoList.mjs.orig 
10,11c10
<         displayField: 'text',
<         useCheckBoxes: true
---
>         displayField: 'text'
```

2. run dev server as usual:

```
$ pwd
.../neo-7.0.6

$  npm run server-start
```
3.  in Chrome, open examples/todoList/version2

4.  click on first item (empty) checkbox
      **checkbox stays empty**

**Expected behavior**
     checkbox shows check

**Screenshots**
devtools elements
1. on start, no click yet


![examples-todoList-version2-start](https://github.com/user-attachments/assets/64854841-ce76-4e63-8bd2-d6970f20ece7)

2. click on first item check box
![examples-todoList-version2-clicked-first-item](https://github.com/user-attachments/assets/5c29707a-2c4f-4bdb-ac5b-fbfb92cef3df)


3. edit cls to add neo-selected => checkmark appears
![examples-todoList-version2-edit-add-neo-selected](https://github.com/user-attachments/assets/5874fb2b-b642-4f7d-9ed9-f9a43550ceb2)



**Desktop (please complete the following information):**
 - OS: macos
 - Browser chrome
 - Version 128.0.6613.114 (Official Build) (arm64)


**Additional context**
in neo 6.10.10, the click invokes:

  ``selection/Model.mjs:  select(items, itemCollection=this.items, selectedCls)``

    which add the "neo-selected" class value,

in neo 7.0.6, the click goes to 
  ``main/addon/Navigator``

and disappears.    A breakpoint in in selection/Model.mjs: select() is not exercised.





## Timeline

- 2024-09-03T04:38:22Z @gplanansky added the `bug` label
### @tobiu - 2024-09-03T14:40:57Z

Hi George,

a good catch, almost took me 10m :)

Let me describe how I debugged it, to get some insights how to do it.

First I checked `examples.list.Base`, which has a `useCheckBoxes` option on the right. Worked.

Then I recalled that I was using almost the same code inside the learning section:

![Screenshot 2024-09-03 at 16 31 24](https://github.com/user-attachments/assets/194d278f-eaa0-43d3-8428-d3927d2a70c8)

Knowing that it should work in general, I just needed to figure out, why `neo-selected` did not get applied.

Lists are using item ids in the following format: `neo-list-1__tobiu`

In depth:
```
    /**
     * @param {Number|String|object} recordOrId
     * @returns {String}
     */
    getItemId(recordOrId) {
        return `${this.id}__${recordOrId.isRecord ? recordOrId[this.getKeyProperty()] : recordOrId}`
    }

    /**
     * @param {String} vnodeId
     * @returns {String|Number} itemId
     */
    getItemRecordId(vnodeId) {
        let itemId   = vnodeId.split('__')[1],
            {model}  = this.store,
            keyField = model?.getField(model.keyProperty),
            keyType  = keyField?.type?.toLowerCase();

        if (keyType === 'int' || keyType === 'integer') {
            itemId = parseInt(itemId)
        }

        return itemId
    }
```

The important part: ids inside the DOM are always strings. So, when trying to get the record via an `recordId`, we do need to know if this one is a string (default) or an `integer`.

And this already was the root cause: inside `examples.todoList.version2.TodoListModel`, the id field had the invalid type `Number`.

I will push the fix now.

Follow up idea: it would be nice to decouple `useCheckBoxes` optionally from selections and just match another boolean record field (new ticket). Maybe i already created this one.

- 2024-09-03T14:42:03Z @tobiu referenced in commit `65fe53a` - "#5851 examples.todoList.version2.TodoListModel: fixing the invalid type for the id field, useCheckBoxes: true for the list"
- 2024-09-03T14:43:04Z @tobiu closed this issue
### @gplanansky - 2024-09-04T00:12:59Z

Thanks.  

I missed catching the difference of list Base.mjs getItemRecordId  returning ``1``  vs ``"1"`` .    

In selection/ListModel.mjs :  onListClick, ` view.store.get("1")` returns null.
```
onListClick({ currentTarget }) {
        let {view} = this,
            record;

        if (!view.disableSelection) {
            record = view.store.get(view.getItemRecordId(currentTarget));

            record && this.select(record)
        }
    }
```
So, in 6.10.10,  and going back to 4.0.89,  the test was for 'integer' or 'number':
```
      getItemRecordId(vnodeId) {
        let itemId   = vnodeId.split('__')[1],
            model    = this.store.model,
            keyField = model?.getField(model.keyProperty),
            keyType  = keyField?.type.toLowerCase();

        if (keyType === 'integer' || keyType === 'number') {
            itemId = parseInt(itemId);
        }

        return itemId;
    }

```
Prior, in 2019 the test was for number only:
```
    getItemRecordId(vnodeId) {
        let itemId   = vnodeId.split('__')[1],
            model    = this.store.model,
            keyField = model && model.getField(model.keyProperty);

        if (keyField && keyField.type.toLowerCase() === 'number') {
            itemId = parseInt(itemId);
        }

        return itemId;
    }
```

Why the changes?   


