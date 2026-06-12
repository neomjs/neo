---
id: 5674
title: 'component.Video: invalid addDomListeners() definition, ghost should be an overlay'
state: CLOSED
labels:
  - bug
assignees:
  - Dinkh
createdAt: '2024-08-03T18:29:06Z'
updatedAt: '2024-08-10T16:41:06Z'
githubUrl: 'https://github.com/neomjs/neo/issues/5674'
author: tobiu
commentsCount: 2
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-08-10T16:41:06Z'
---
# component.Video: invalid addDomListeners() definition, ghost should be an overlay

Hi Torsten,

```
        me.addDomListeners(
            {click: me.play, delegate: '.neo-video-ghost'},
            {click: me.pause, delegate: '.neo-video-media'}
        )
```

is not correct. The method either accepts an object or an array of objects, but not multiple params.

```
        me.addDomListeners([
            {click: me.play, delegate: '.neo-video-ghost'},
            {click: me.pause, delegate: '.neo-video-media'}
        ])
```

If you use an array, the pause listener will get added too. However, this brings us to the next problem:

```
    afterSetPlaying(value, oldValue) {
        let {vdom} = this,
            media = VDomUtil.getFlags(vdom, 'media')[0],
            ghost = VDomUtil.getFlags(vdom, 'ghost')[0];

        ghost.removeDom = value;
        media.removeDom = !value;

        this.update()
    }
```

Using `removeDom` on the video node will kick it out of the DOM, and we will use the state of the video. Meaning: you watch it 10s, hit pause, hit play and you will start over at 0s.

=> The ghost should be an overlay and the video node should not get removed.

## Timeline

- 2024-08-03T18:29:06Z @tobiu added the `bug` label
- 2024-08-03T18:29:06Z @tobiu assigned to @Dinkh
### @tobiu - 2024-08-03T19:14:23Z

follow-up thoughts: it is of course ok to not mount the video node initially, if we start with the "ghost mode".

following idea:
```
    afterSetPlaying(value, oldValue) {
        // ...
        media.removeDom = !value && oldValue === undefined;
        // ...
    }
```

without having looked into the styling, the top level node should probably get `position: relative` and the ghost `position: absolute` with a higher `z-index` than the video node.

- 2024-08-10T16:38:18Z @Dinkh referenced in commit `b19488a` - "#5674 unnecessary click listener, because the video itself pauses the video on click"
- 2024-08-10T16:39:44Z @Dinkh referenced in commit `479909c` - "#5674 document remaining pause method of video"
### @Dinkh - 2024-08-10T16:41:06Z

removed the click event listener, which would lead to pause the video, as the video itself listens to click.
The pause method is still in place to allow to pause the video programmatically.

- 2024-08-10T16:41:06Z @Dinkh closed this issue

