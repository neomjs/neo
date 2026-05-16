---
id: 6041
title: table.View.onStoreRecordChange fields do not match  selectedRecordField - bug  and  fix
state: CLOSED
labels:
  - bug
assignees: []
createdAt: '2024-10-27T08:25:44Z'
updatedAt: '2024-10-28T02:28:25Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6041'
author: gplanansky
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-27T12:34:46Z'
---
# table.View.onStoreRecordChange fields do not match  selectedRecordField - bug  and  fix

table.View.onStoreRecordChange
see neo 7.16 dev
https://github.com/neomjs/neo/blob/0ac043b1d124206c17383d37a9bdd1c055bb7980/src/table/View.mjs#L480

**Symptom**:   Table rows did not change their row highlighting after a `record.annotation.selected ` (boolean) value change .

**Background**:   

table.View has a config property `selectedRecordField` whose string value, say 'annotation.selected' is
designed to correspond to a corresponding table  data record field:   
```js
record.annotation -> { 'annotation' { selected : true/false }} 
```
The approach allows flexibility to use other annotation sub fields,  specifying which are in play via a string config property.

It requires 

* a way to use a dotted string  to retrieve a record value, using the field.name value.   
        View ingeniously does this elsewhere with with Neo.ns.  
*  getting and matching the changed field's name
* getting and matching the changed field's value.

For the above test example,  however, Store gives us a `field.name` value of "annotation", not "annotation.selected" .   That is, Store tells us which record fields have changed, not which record  subfields.     Being consistent, Store also has  the `field.value` as {selected: false}  instead of false.  

**bug**

Processing the `selectedRecordField` the logic 
1. failed to match  the field.name   -- L 479 
2. failed to get the value of the changed field -- L 481
3. was stuck by `selection.Model.singleselect == false,` at the `'select'` branch -- L 481

https://github.com/neomjs/neo/blob/0ac043b1d124206c17383d37a9bdd1c055bb7980/src/table/View.mjs#L480

** bug fix / workaround**

This patch ( against 6.17 dev a day ago)  provides fixes / workarounds: 
```
diff View.mjs View.mjs.orig

479,480c479
<                  if (field.name === me.selectedRecordField.split('.')[0]) {
<                     let selectedFieldValue = Neo.ns(me.selectedRecordField,false,record);
---
>                 if (field.name === me.selectedRecordField) {
482c481
<                         selectionModel[!selectedFieldValue? 'deselect' : 'select'](me.getRowId(record))
---
>                         selectionModel[!field.value && selectionModel.singleSelect ? 'deselect' : 'select'](me.getRowId(record))
```

**comments*  

* Not sure why `singleSelect` was in the logic here.
* Also have to restore the  desired scroll to the changed row behavior.



## Timeline

- 2024-10-27T08:25:44Z @gplanansky added the `bug` label
### @tobiu - 2024-10-27T12:29:23Z

george, you do have the following example on which i spent multiple hours just for you to see how it is working:
https://neomjs.com/examples/table/nestedRecordFields/index.html

looking at your desired change: `if (field.name === me.selectedRecordField.split('.')[0]) {`

it can only assume(!) that you are doing something like:
```
record.annotations = {selected: true};
```

i know max did that inside the trainings before we had change events for nested fields, but this is clearly not the way to go. we do not want to listen to changes of any possible annotations, but to the the "right" one.

meaning (as it is done inside the example):
```
record.annotations.selected = true;
```

the singleSelect part should indeed move somewhere else.

- 2024-10-27T12:33:09Z @tobiu referenced in commit `4b21bc1` - "#6041 table.View: onStoreRecordChange() => removed the singleSelect check"
- 2024-10-27T12:34:13Z @tobiu referenced in commit `2ab17fb` - "#6041 table.View: onStoreRecordChange() => remove testing log"
- 2024-10-27T12:34:46Z @tobiu closed this issue
### @gplanansky - 2024-10-27T22:18:45Z

as I recall from a year and more back, the assignment 
```
record.annotations.selected = true
```

failed,  because  Store couldn't handle the case where there was not (yet) a record.annotations field.    Therefore I had used some some tricky dribbling to  construct that object on the fly, without obliterating  other potentially existing key:value pairs.  The store model was simple:

```
model: {
                    fields: [{
                        name: 'annotation',
                        type: 'Object'
                    }, {
```

In training/workshop discussion, you had confirmed the store limitation, and  had advised exactly the same solution.   So that was the "right-enough" way at the time.  Back then you mused about tradeoffs implementing subfield handling for store.

I used that model for various map, chart components, and of course, for table, such that the highlighting was determined by the data selected field value.  This is the format of the json data input file, read using that model by store:

```
{
   "results":[
       {
         "annotation": {"selected": true},
         "timestamp":"2017-10-13T12:07:24.000Z",
         "latitude":63.976,
         "longitude":-21.949,
         "depth":1.1,
         "size":0.6,
         "quality":58.73,
         "humanReadableLocation":"6,1 km SV af Helgafelli"
      },
      {
```

Thus the annotation Object became `{"selected": true}`.  Simple.
 
Because Table did not use data input to control highlighting, I added that feature so it would have parity with Map and Chart.  Namely, I had modified View.mjs to use that record.annotation object, parsing  out the selected subfield to control row highlighting. I put in a PR for that.

The nestedFields example introduced an enhanced store model with sub-fields:

```
class MainModel extends Model {
    static config = {
        className: 'Neo.examples.table.container.MainModel',

        fields: [{
            name: 'annotations',
            type: 'Object',

            fields: [{
                name        : 'annotations.selected',
                type        : 'Boolean',
                defaultValue: false
            }]
        }, {
            name: 'country',
            type: 'String'
        ...
        }, {
            name: 'user',
            type: 'Object',

            fields: [{
                name: 'user.firstname',
                type: 'String'
            }, {
                name: 'user.lastname',
                type: 'String'
            }]
        }]
    }
}
```

The View.mjs re-factoring of last week, implemented my request to control highlighting via a selected data field.  That refactoring used Neo.njs to parse out the select field, specified by a config parameter sting.   That config string approach adds desirable flexibility.  However, it also requires using the nested record model format, and a Neo.njs which is not documented sufficiently for regular use in component code by application developers.     

Unfortunately a dearth of documentation meant it broke my table component code.  My bug fix issue item duly  reported that and fixed it.

Previously, I could use the same store model for all my components.  Notably, no component imposed a model on the others.  

It remains to be see if Store fully handles the new store/model, in all cases.
 







 


   








