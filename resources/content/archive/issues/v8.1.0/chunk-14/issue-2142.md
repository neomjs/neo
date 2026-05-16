---
id: 2142
title: Add a micro loader to the index.html files
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2021-05-24T20:54:58Z'
updatedAt: '2021-05-25T17:31:31Z'
githubUrl: 'https://github.com/neomjs/neo/issues/2142'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2021-05-25T17:31:31Z'
---
# Add a micro loader to the index.html files

before:
```html
<!DOCTYPE HTML>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta charset="UTF-8">
    <title>COVID-19 IN NUMBERS</title>
</head>
<body>
    <script>
        Neo = self.Neo || {}; Neo.config = Neo.config || {};

        Object.assign(Neo.config, {
            appPath         : 'apps/covid/app.mjs',
            basePath        : '../../',
            environment     : 'development',
            mainThreadAddons: ['AmCharts', 'DragDrop', 'MapboxGL', 'Stylesheet'],
            themes          : ['neo-theme-dark', 'neo-theme-light']
        });
    </script>

    <script src="../../src/Main.mjs" type="module"></script>
</body>
</html>
```

new version:
```html
<!DOCTYPE HTML>
<html>
<head>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta charset="UTF-8">
    <title>COVID-19 IN NUMBERS</title>
</head>
<body>
    <script src="../../src/MicroLoader.mjs" type="module"></script>
</body>
</html>
```
neo-config.json:
```json
{
    "appPath"         : "apps/covid/app.mjs",
    "basePath"        : "../../",
    "environment"     : "development",
    "mainPath"        : "./Main.mjs",
    "mainThreadAddons": ["AmCharts", "DragDrop", "MapboxGL", "Stylesheet"],
    "themes"          : ["neo-theme-dark", "neo-theme-light"]
}
```
MicroLoader.mjs:
```
fetch('./neo-config.json').then(response => response.json()).then(data => {
    self.Neo = {config: {}};
    Object.assign(Neo.config, data);
    import(data.mainPath);
});
```

It is a tiny bit slower, but feels much cleaner.

Especially when we are moving folders around (e.g. copying the docs app & examples into a workspace, we do not have to deal with string manipulations. 


## Timeline

- 2021-05-24T20:54:58Z @tobiu added the `enhancement` label
- 2021-05-24T20:54:58Z @tobiu assigned to @tobiu
- 2021-05-24T21:14:00Z @tobiu referenced in commit `2af4a98` - "Add a micro loader to the index.html files #2142 PoC"
- 2021-05-24T21:23:31Z @tobiu referenced in commit `e731a3e` - "#2142 real world app"
- 2021-05-24T21:26:12Z @tobiu referenced in commit `2a88d13` - "#2142 real world 2 app"
- 2021-05-24T21:28:40Z @tobiu referenced in commit `1c0f22f` - "#2142 real world 2 sharedcovid"
- 2021-05-24T21:30:31Z @tobiu referenced in commit `b289d03` - "#2142 real world 2 sharedcovidchart"
- 2021-05-24T21:33:40Z @tobiu referenced in commit `c0b88ea` - "#2142 real world 2 sharedcovidgallery"
- 2021-05-24T21:36:17Z @tobiu referenced in commit `24096ec` - "#2142 real world 2 sharedcovidhelix"
- 2021-05-24T21:37:59Z @tobiu referenced in commit `a3faa6b` - "#2142 sharedcovidmap"
- 2021-05-24T21:40:11Z @tobiu referenced in commit `c0f0a29` - "#2142 shareddialog"
- 2021-05-24T21:41:49Z @tobiu referenced in commit `3cd8369` - "#2142 shareddialog2"
- 2021-05-24T21:45:58Z @tobiu referenced in commit `28d1068` - "#2142 website"
- 2021-05-24T21:54:04Z @tobiu referenced in commit `1d695c4` - "#2142 docs"
- 2021-05-24T21:58:13Z @tobiu referenced in commit `682f8b6` - "#2142 smarter check for Main"
- 2021-05-24T22:15:37Z @tobiu referenced in commit `c04c2d6` - "#2142 DomEvents - Main initialisation"
- 2021-05-24T22:24:44Z @tobiu referenced in commit `f3d92c7` - "#2142 examples/button/base"
- 2021-05-24T22:26:53Z @tobiu referenced in commit `ff320af` - "#2142 examples/button/split"
- 2021-05-24T22:31:22Z @tobiu referenced in commit `637fd60` - "#2142 examples/calendar/basic"
- 2021-05-24T22:39:04Z @tobiu referenced in commit `6d39348` - "#2142 examples/charts"
- 2021-05-24T22:49:36Z @tobiu referenced in commit `b2394cc` - "#2142 examples/component/chip"
- 2021-05-24T22:51:53Z @tobiu referenced in commit `f228752` - "#2142 examples/component/circle"
- 2021-05-24T22:56:41Z @tobiu referenced in commit `5021c52` - "#2142 examples/component/coronaGallery"
- 2021-05-24T23:05:02Z @tobiu referenced in commit `e18cd4f` - "#2142 examples/component/coronaHelix"
- 2021-05-25T08:42:44Z @tobiu cross-referenced by #2143
### @tobiu - 2021-05-25T08:45:19Z

updated the top level post to include the micro loader getting moved into an own file.

- 2021-05-25T08:49:07Z @tobiu referenced in commit `7606913` - "#2142 => examples/component/dateSelector"
- 2021-05-25T08:58:50Z @tobiu referenced in commit `44707ee` - "#2142 => examples/component/gallery (plus adding the count deltas header)"
- 2021-05-25T09:02:28Z @tobiu referenced in commit `399e690` - "#2142 => examples/component/helix"
- 2021-05-25T09:09:48Z @tobiu referenced in commit `9e46abe` - "#2142 => examples/container"
- 2021-05-25T09:16:27Z @tobiu referenced in commit `8b0f7fd` - "#2142 => examples/core/config"
- 2021-05-25T09:21:01Z @tobiu referenced in commit `117edb3` - "#2142 => examples/dialog"
- 2021-05-25T09:25:19Z @tobiu referenced in commit `a29b661` - "#2142 => examples/fields"
- 2021-05-25T09:30:02Z @tobiu referenced in commit `8f7b844` - "#2142 => examples/form/field/chip"
- 2021-05-25T10:53:23Z @tobiu referenced in commit `f743a58` - "#2142 => examples/form/field/date"
- 2021-05-25T10:55:09Z @tobiu referenced in commit `ea6f9dc` - "#2142 => examples/form/field/email"
- 2021-05-25T10:56:43Z @tobiu referenced in commit `9bdcf87` - "#2142 => examples/form/field/number"
- 2021-05-25T11:00:32Z @tobiu referenced in commit `4947c5e` - "#2142 => examples/form/field/picker"
- 2021-05-25T11:05:17Z @tobiu referenced in commit `7637241` - "#2142 => examples/form/field/select"
- 2021-05-25T11:08:33Z @tobiu referenced in commit `7cc1a6a` - "#2142 => examples/form/field/text"
- 2021-05-25T11:11:13Z @tobiu referenced in commit `da9676c` - "#2142 => examples/form/field/textarea"
- 2021-05-25T11:14:48Z @tobiu referenced in commit `1d10642` - "#2142 => examples/form/field/time"
- 2021-05-25T11:18:25Z @tobiu referenced in commit `39347b1` - "#2142 => examples/form/field/trigger/copyToClipboard"
- 2021-05-25T11:20:30Z @tobiu referenced in commit `f90a649` - "#2142 => examples/form/field/trigger/url"
- 2021-05-25T11:24:51Z @tobiu referenced in commit `5ec0d6e` - "#2142 => examples/form/fieldset"
- 2021-05-25T11:28:45Z @tobiu referenced in commit `9bc2c47` - "#2142 => examples/list/base"
- 2021-05-25T11:32:46Z @tobiu referenced in commit `6916733` - "#2142 => examples/list/chip"
- 2021-05-25T12:16:55Z @tobiu referenced in commit `a173e9a` - "#2142 => examples/model/advanced"
- 2021-05-25T12:21:02Z @tobiu referenced in commit `5dc405f` - "#2142 => examples/model/dialog"
- 2021-05-25T12:24:41Z @tobiu referenced in commit `301190c` - "#2142 => examples/model/extendedClass"
- 2021-05-25T13:01:50Z @tobiu referenced in commit `e4d329e` - "#2142 => examples/model/inline"
- 2021-05-25T13:04:25Z @tobiu referenced in commit `cf642f9` - "#2142 => examples/model/inlineNoModel"
- 2021-05-25T13:07:22Z @tobiu referenced in commit `9c9e65c` - "#2142 => examples/model/multiWindow"
- 2021-05-25T13:12:34Z @tobiu referenced in commit `a0672fa` - "#2142 => examples/model/multiWindow2"
- 2021-05-25T13:16:51Z @tobiu referenced in commit `efe8006` - "#2142 => examples/model/nestedData"
- 2021-05-25T13:22:58Z @tobiu referenced in commit `708f2ce` - "#2142 => examples/model & list: removed the DD main thread addon where possible"
- 2021-05-25T13:26:29Z @tobiu referenced in commit `374c9e5` - "#2142 => examples/model/table"
- 2021-05-25T13:28:52Z @tobiu referenced in commit `838c590` - "#2142 => examples/panel"
- 2021-05-25T13:33:23Z @tobiu referenced in commit `e660be4` - "#2142 => examples/tab/container"
- 2021-05-25T13:37:32Z @tobiu referenced in commit `cb9177e` - "#2142 => examples/table/container"
- 2021-05-25T13:41:25Z @tobiu referenced in commit `22ba38e` - "#2142 => examples/tableFiltering"
- 2021-05-25T14:24:58Z @tobiu referenced in commit `e9369e7` - "#2142 => examples/tablePerformance"
- 2021-05-25T14:29:16Z @tobiu referenced in commit `af6fbd8` - "#2142 => examples/tableStore"
- 2021-05-25T14:33:13Z @tobiu referenced in commit `34522b1` - "#2142 => examples/tabs"
- 2021-05-25T14:37:28Z @tobiu referenced in commit `af590f1` - "#2142 => examples/todoList/version1"
- 2021-05-25T14:42:35Z @tobiu referenced in commit `ab3dc71` - "#2142 => examples/todoList/version2"
- 2021-05-25T14:47:49Z @tobiu referenced in commit `d5495ff` - "#2142 => examples/tree"
- 2021-05-25T14:51:40Z @tobiu referenced in commit `30ec588` - "#2142 => examples/viewport"
### @tobiu - 2021-05-25T17:31:31Z

all index files inside the main repo are adjusted now. will create follow up tickets for the build scripts.

- 2021-05-25T17:31:31Z @tobiu closed this issue

