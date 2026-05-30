---
id: 282
title: Covid Demo App (initial version)
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2020-03-15T11:30:46Z'
updatedAt: '2020-03-19T14:11:03Z'
githubUrl: 'https://github.com/neomjs/neo/issues/282'
author: tobiu
commentsCount: 1
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2020-03-19T13:58:00Z'
---
# Covid Demo App (initial version)

A new app inside the Neo workspace combining the
1. Covid Gallery
2. Covid Helix
3. Grid (Table)

It should use at least 1 component controller as well as routing.

Once finished, we can move it into a separate repo.

## Timeline

- 2020-03-15T11:30:46Z @tobiu added the `enhancement` label
- 2020-03-15T11:30:46Z @tobiu assigned to @tobiu
- 2020-03-15T11:36:20Z @tobiu referenced in commit `45d2ad1` - "#282 using the create-app script to set up the Covid app shell. adjusted the gitignore"
- 2020-03-15T11:38:49Z @tobiu referenced in commit `2b7b5bf` - "#282 added Covid to the template files to ensure everyone can build it"
- 2020-03-15T11:45:32Z @tobiu referenced in commit `6dbb989` - "#282 using neo-theme-dark as the default"
- 2020-03-15T11:50:35Z @tobiu referenced in commit `7682dd3` - "#282 MainContainer => vbox layout"
- 2020-03-15T11:57:15Z @tobiu referenced in commit `3ee6f4b` - "#282 Moved the MainContainer into a view folder"
- 2020-03-15T12:01:22Z @tobiu referenced in commit `be63557` - "#282 Covid.model.Country"
- 2020-03-15T12:03:03Z @tobiu referenced in commit `c723ba7` - "#282 Covid.store.Countries"
- 2020-03-15T12:10:13Z @tobiu referenced in commit `eadf49f` - "#282 Covid.view.MainContainerController"
- 2020-03-15T12:13:50Z @tobiu referenced in commit `f78ad3a` - "#282 Covid.view.CountryHelix"
- 2020-03-15T12:17:04Z @tobiu referenced in commit `682ea17` - "#282 Covid.view.CountryGallery"
- 2020-03-15T12:24:24Z @tobiu referenced in commit `c9c7656` - "#282 added CountryGallery & CountryHelix to the MainContainer"
- 2020-03-15T12:31:05Z @tobiu referenced in commit `4e218de` - "#282 MainContainerController: loadData()"
- 2020-03-15T12:34:56Z @tobiu referenced in commit `cecceea` - "#282 MainContainerController: proxyUrl"
- 2020-03-15T12:37:47Z @tobiu referenced in commit `3106c5f` - "#282 MainContainerController: apiUrl"
- 2020-03-15T12:44:49Z @tobiu referenced in commit `73d5f82` - "#282 MainContainerController: addStoreItems() => feed the gallery & helix with data"
- 2020-03-15T12:53:45Z @tobiu referenced in commit `1233a0e` - "#282 refactoring: view.country.*"
- 2020-03-15T12:59:39Z @tobiu referenced in commit `150143b` - "#282 Covid.view.country.TableContainer base class"
- 2020-03-15T13:12:48Z @tobiu referenced in commit `f4cddf3` - "#282 MainContainer: adding the TableContainer (in progress)"
- 2020-03-15T13:42:53Z @tobiu referenced in commit `7382f87` - "#282 TableContainer: added all columns"
- 2020-03-15T13:46:29Z @tobiu referenced in commit `0a4f9cd` - "#282 Covid.store.Countries: default sorter"
- 2020-03-15T13:54:44Z @tobiu referenced in commit `1bb92a2` - "#282 country.TableContainer: column renderers"
- 2020-03-15T15:05:55Z @tobiu referenced in commit `c1eee86` - "#282 TableContainer: align: right for all number columns"
- 2020-03-15T15:14:19Z @tobiu referenced in commit `9d19359` - "#282 MainContainerController: getCountryFlagUrl()"
- 2020-03-15T16:04:29Z @tobiu referenced in commit `2a12afb` - "#282 Covid.view.CountryGallery & CountryHelix: using the VC flag renderer"
- 2020-03-15T21:25:18Z @tobiu referenced in commit `8d9d8a4` - "#282 country.TableContainer: flag to text alignment"
- 2020-03-15T21:41:57Z @tobiu referenced in commit `9730b19` - "#282 MainContainerController: 3 new flags"
- 2020-03-15T23:23:47Z @tobiu referenced in commit `6409bc7` - "#282 Covid.view.GalleryContainer"
- 2020-03-16T00:14:07Z @tobiu referenced in commit `569ea3e` - "#282 Covid.view.HelixContainer"
- 2020-03-16T09:56:52Z @tobiu referenced in commit `1ffcee8` - "#282 Covid.view.MainContainerController: loadSummaryData()"
- 2020-03-16T10:01:59Z @tobiu referenced in commit `bdcd0c4` - "#282 Covid.view.MainContainerController: applySummaryData() => doc comments"
- 2020-03-16T10:55:29Z @tobiu referenced in commit `ee737c5` - "#282 Covid.view.MainContainer: gallery testing (not stable!)"
- 2020-03-16T12:33:37Z @tobiu referenced in commit `3b762df` - "#282 Covid.view.HelixContainerController: base class"
- 2020-03-16T12:42:56Z @tobiu referenced in commit `0cac007` - "#282 Covid.view.HelixContainer: using HelixContainerController, doc comments"
- 2020-03-16T12:54:56Z @tobiu referenced in commit `9c9200c` - "#282 Covid.view.GalleryContainerController: base class"
- 2020-03-16T13:11:54Z @tobiu referenced in commit `a54cb77` - "#282 Covid.view.GalleryContainer: using GalleryContainerController"
- 2020-03-16T13:26:16Z @tobiu referenced in commit `736cf39` - "#282 Covid.view.GalleryContainerController: onCollapseButtonClick()"
- 2020-03-16T13:32:20Z @tobiu referenced in commit `46d8dce` - "#282 Covid.view.GalleryContainerController: onChangeTranslateX() (in progress)"
- 2020-03-16T14:04:59Z @tobiu referenced in commit `93f085f` - "#282 Covid.view.GalleryContainerController: onRangefieldChange()"
- 2020-03-16T14:15:29Z @tobiu referenced in commit `95092ad` - "#282 Covid.view.GalleryContainerController: gallery_ => faster access"
- 2020-03-16T19:04:59Z @tobiu referenced in commit `4cadd32` - "#282 Covid.view.GalleryContainerController: onRangefieldMounted()"
- 2020-03-16T19:10:51Z @tobiu referenced in commit `1b0bb51` - "#282 Covid.view.GalleryContainerController: onRangefieldMounted() => more generic and used for translateX as well"
- 2020-03-16T19:16:24Z @tobiu referenced in commit `5983c7e` - "#282 Covid.view.GalleryContainerController: onOrderButtonClick()"
- 2020-03-16T19:53:27Z @tobiu referenced in commit `c5544ae` - "#282 Covid.view.GalleryContainerController: onOrderButtonClick() => adjusted to use data.component & removed the button reference"
- 2020-03-16T20:16:47Z @tobiu referenced in commit `c70af46` - "#282 Covid.view.GalleryContainerController: onSortButtonClick() => adjusted to use data.component"
- 2020-03-16T20:22:18Z @tobiu referenced in commit `7708a97` - "#282 Covid.view.GalleryContainerController: onSortButtonClick() => added to all sorting buttons"
- 2020-03-16T20:26:44Z @tobiu referenced in commit `ceb4b0a` - "#282 Covid.view.GalleryContainerController: doc comments, using module: RangeField"
- 2020-03-16T20:35:53Z @tobiu referenced in commit `eb5cfca` - "#282 Covid.view.GalleryContainer: destroy()"
- 2020-03-16T21:13:07Z @tobiu referenced in commit `5567536` - "#282 configuration-panel: scss"
- 2020-03-16T22:15:30Z @tobiu referenced in commit `4ba7607` - "#282 Covid.view.GalleryContainer: itemDefaults"
- 2020-03-16T22:21:59Z @tobiu referenced in commit `2296cb4` - "#282 Covid.view.GalleryContainer: recovered button, styling"
- 2020-03-16T22:30:09Z @tobiu referenced in commit `b65554b` - "#282 switched to the helix as the default view (testing, not stable)"
- 2020-03-16T22:32:47Z @tobiu referenced in commit `336daa5` - "#282 removed the heroku proxy (API does support cors now)"
- 2020-03-16T23:21:32Z @tobiu referenced in commit `af83845` - "#282 Covid.view.HelixContainer: label styling"
- 2020-03-16T23:36:23Z @tobiu referenced in commit `d7c0f7f` - "#282 Covid.view.HelixContainerController: helix_, onRangefieldChange"
- 2020-03-17T00:13:32Z @tobiu referenced in commit `f343a5a` - "#282 Covid.view.GalleryContainer: imports cleanup"
- 2020-03-17T00:14:33Z @tobiu referenced in commit `30552a1` - "#282 Covid.view.HelixContainer: imports cleanup"
- 2020-03-17T00:19:08Z @tobiu referenced in commit `f6a509d` - "#282 Covid.view.HelixContainer: using onRangefieldChange"
- 2020-03-17T00:27:20Z @tobiu referenced in commit `2d4287b` - "#282 Covid.view.HelixContainer & Controller: onSortButtonClick"
- 2020-03-17T00:38:10Z @tobiu referenced in commit `29978cc` - "#282 Covid.view.HelixContainer & Controller: onRangefieldMounted"
- 2020-03-17T16:32:31Z @tobiu referenced in commit `12e470f` - "#282 Covid.view.GalleryContainerController: onCollapseButtonClick() => using the new data component reference"
- 2020-03-17T16:40:06Z @tobiu referenced in commit `d2f9ebd` - "#282 Covid.view.HelixContainerController: onCollapseButtonClick()"
- 2020-03-17T19:11:00Z @tobiu referenced in commit `7a31325` - "#282 Covid.view.HelixContainerController: onFollowSelectionButtonClick()"
- 2020-03-17T19:15:53Z @tobiu referenced in commit `7b19f17` - "#282 Covid.view.HelixContainerController: onFlipItemsButtonClick()"
- 2020-03-17T20:36:30Z @tobiu referenced in commit `498a9cf` - "#282 Covid.view.MainContainerController: onHashChange()"
- 2020-03-17T20:46:24Z @tobiu referenced in commit `d6bebcb` - "#282 Covid.view.MainContainerController: default route => table"
- 2020-03-17T21:05:16Z @tobiu referenced in commit `e163427` - "#282 Covid.view.MainContainerController: onHashChange(), in progress"
- 2020-03-17T21:23:32Z @tobiu referenced in commit `1d0adc0` - "#282 Covid.view.MainContainer: generating the items inside the ctor to use the activeTabIndex matching to the initial route, adjusted the controller logic"
- 2020-03-17T21:42:13Z @tobiu referenced in commit `4bfa5ed` - "#282 Covid.view.MainContainer: doc comments"
- 2020-03-17T21:58:50Z @tobiu referenced in commit `3e6a800` - "#282 Covid.view.MainContainerController: initially loading the store of the active tab (the tab which matches the main route)"
- 2020-03-17T22:01:48Z @tobiu referenced in commit `5406393` - "#282 Covid.view.MainContainerController: doc comment"
- 2020-03-17T22:05:30Z @tobiu referenced in commit `c0aca8c` - "#282 Covid.view.MainContainerController: storing the API data onLoad inside a new data config"
- 2020-03-17T22:56:02Z @tobiu referenced in commit `b68d978` - "#282 Covid.view.MainContainerController: onHashChange() => filling the matching store (once each)"
- 2020-03-17T23:16:28Z @tobiu referenced in commit `4baf5ee` - "#282 Covid.view.HeaderContainer base class"
- 2020-03-17T23:21:55Z @tobiu referenced in commit `94ece11` - "#282 Covid.view.MainContainer: using the HeaderContainer"
- 2020-03-17T23:38:33Z @tobiu referenced in commit `3155da4` - "#282 Covid.view.HeaderContainer: github star button"
- 2020-03-17T23:50:37Z @tobiu referenced in commit `3c81a8b` - "#282 Covid.view.HeaderContainer: github star button => using vdom markup"
- 2020-03-18T00:05:35Z @tobiu referenced in commit `a7770df` - "#282 Covid.view.HeaderContainer: theme button"
- 2020-03-18T00:14:55Z @tobiu referenced in commit `d1bcd21` - "#282 Covid.view.MainContainerController: onSwitchThemeButtonClick() logic"
- 2020-03-18T00:49:18Z @tobiu referenced in commit `578ad72` - "#282 Covid.view.MainContainerController: applySummaryData() logic"
- 2020-03-18T01:00:36Z @tobiu referenced in commit `dc51ecb` - "#282 Covid.view.MainContainer: reduced the margin from 20 to 10px"
- 2020-03-18T08:24:19Z @tobiu referenced in commit `0fce4bb` - "#282 Covid.view.HeaderContainer: country selectField with data"
- 2020-03-18T09:48:39Z @tobiu referenced in commit `37bf8d4` - "#282 Covid.view.HeaderContainer: country field => store sorter"
- 2020-03-18T15:20:46Z @tobiu referenced in commit `058b57e` - "#282 Covid.view.FooterContainer: base class"
- 2020-03-18T15:27:22Z @tobiu referenced in commit `713e9b3` - "#282 removed the Footer again, looks ugly"
- 2020-03-18T20:45:53Z @tobiu referenced in commit `3b7acd8` - "#282 country field => select => change route => select active gallery item"
- 2020-03-18T21:20:23Z @tobiu referenced in commit `11d5599` - "#282 Covid.view.MainContainerController: onHashChange() => select table row, adjusted the selection rowmodel"
- 2020-03-18T21:37:19Z @tobiu referenced in commit `1d96bce` - "#282 Covid.view.MainContainerController: onHashChange() => select table row polishing"
- 2020-03-18T21:58:39Z @tobiu referenced in commit `27e992f` - "#282 Covid.view.MainContainerController: onHashChange() => delay to apply the new country selection when switching cards, button changeRoute adjustments"
- 2020-03-18T22:14:51Z @tobiu referenced in commit `36c3867` - "#282 Covid.view.MainContainerController: onHashChange() => delaySelection polishing"
- 2020-03-18T23:09:52Z @tobiu referenced in commit `f354782` - "#282 Covid.view.MainContainerController: onHashChange() => delaySelection polishing"
- 2020-03-18T23:19:12Z @tobiu referenced in commit `353c7b1` - "#282 Covid.view.HeaderContainer: theme button iconCls"
- 2020-03-18T23:30:13Z @tobiu referenced in commit `fa76481` - "#282 Covid.view.HelixContainer: sort buttons minHeight"
- 2020-03-18T23:31:39Z @tobiu referenced in commit `4ae94e0` - "#282 Covid.view.GalleryContainer: sort buttons minHeight"
- 2020-03-18T23:34:00Z @tobiu referenced in commit `942396d` - "#282 Covid.view.GalleryContainer: controls panel => vertical scrolling"
- 2020-03-18T23:40:07Z @tobiu referenced in commit `0010453` - "#282 Covid.view.HeaderContainer: reload data button"
- 2020-03-18T23:55:13Z @tobiu referenced in commit `f494fa3` - "#282 Covid.view.HeaderContainer: styling"
- 2020-03-19T00:01:54Z @tobiu referenced in commit `4ed1dc7` - "#282 Covid.view.MainContainerController: onReloadDataButtonClick()"
- 2020-03-19T00:27:19Z @tobiu referenced in commit `04c17b9` - "#282 Covid.view.MainContainerController: getCountryFlagUrl() => code shortening (in progress)"
- 2020-03-19T01:18:30Z @tobiu referenced in commit `4b8fda3` - "#282 Covid.view.MainContainerController: getCountryFlagUrl() => code shortening"
- 2020-03-19T01:20:27Z @tobiu referenced in commit `0bcfe75` - "#282 Covid.view.HeaderContainer: summary data styling (in progress)"
- 2020-03-19T01:27:36Z @tobiu referenced in commit `c4f665f` - "#282 Covid.view.HeaderContainer: summary data styling"
- 2020-03-19T10:43:00Z @tobiu referenced in commit `b8c762e` - "#282 Covid.view.HeaderContainer: summary data styling"
- 2020-03-19T10:53:19Z @tobiu referenced in commit `005f9ab` - "#282 Covid.view.MainContainerController: removed testing log"
### @tobiu - 2020-03-19T13:58:00Z

closing this one (first version is online) and will add smaller follow up tickets.

- 2020-03-19T13:58:00Z @tobiu closed this issue
- 2020-03-19T14:11:03Z @tobiu changed title from **Covid Demo App** to **Covid Demo App (initial version)**

