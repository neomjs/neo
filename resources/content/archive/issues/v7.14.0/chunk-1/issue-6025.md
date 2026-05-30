---
id: 6025
title: main.addon.FileSystemAccessAPI => FileSystemAccess
state: CLOSED
labels:
  - enhancement
assignees:
  - tobiu
createdAt: '2024-10-08T10:57:58Z'
updatedAt: '2024-10-09T17:58:43Z'
githubUrl: 'https://github.com/neomjs/neo/issues/6025'
author: tobiu
commentsCount: 3
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2024-10-08T11:01:46Z'
---
# main.addon.FileSystemAccessAPI => FileSystemAccess

@gplanansky: let us shorten the class name a little bit and remove the API ending => consistency to other addons

## Timeline

- 2024-10-08T10:57:58Z @tobiu added the `enhancement` label
- 2024-10-08T10:57:58Z @tobiu assigned to @tobiu
- 2024-10-08T11:01:41Z @tobiu referenced in commit `e20dbf6` - "main.addon.FileSystemAccessAPI => FileSystemAccess #6025"
- 2024-10-08T11:01:46Z @tobiu closed this issue
### @gplanansky - 2024-10-08T18:07:12Z

No to the shorter name change.
As carefully explained in the PR and in the file comments, FileSystemAccessAPI is NOT  FileSystemAccess.    It is only an extension,   only the three methods.     MDN explains that it is confusing and explicitly explains the distinction,
And I took particular care to make that distinction.

In sum, calling these 3 picker methods FileSystemAccess is wholly incorrect and terribly misleading.
Change it back to FileSystemAccessAPI.  


### @tobiu - 2024-10-08T21:08:24Z

Hi George,

I did think about it before making a change.

There are 3 APIs which in a way build up on each other:
1. File API => https://developer.mozilla.org/en-US/docs/Web/API/File_API
2. File System API => https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
3. File System Access API => https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system

The keyword here is **Access**, which is of course still included inside the class name to make it clear. (Meaning: there is no such thing as a comparison between "FileSystemAccess" & "FileSystemAccessAPI", it is just "File System" versus "File System Access")

From a consistency perspective, all main thread addons mostly exist to deal with custom or web APIs which rely on running inside the main thread (kind of their purpose).

So, we have names like:
* Neo.main.addon.Cookie (using the cookie web api)
* Neo.main.addon.GoogleMaps (using the google maps web api)
* Neo.main.addon.LocalStorage (using the localstorage web api)

The key here is that none of the other addons contains "API" inside the class name.

Does it make sense now?

Best regards,
Tobi

### @gplanansky - 2024-10-09T17:58:42Z

 Perfect sense.  Saving 3 letters didn't, but not needing them in the first
place does. I wish MDN made those file API distinctions as plainly as you.

To be honest, I was impressed by the sophisticated addons that are not
simple web API wrappers. It's not clear to me e.g.,why Service worker is in
the main.addon name space and not  in main.  So I did wiffed on the pattern
addons <--> wrapped web apis.   I.e. simply wrapping main thread API calls
to expose them to calls in web workers,  as with wrapping C routines to
expose their API to python calls.   I might say, however, that one man's
wrap can be another man's sub.

On Tue, Oct 8, 2024 at 5:08 PM Tobias Uhlig ***@***.***>
wrote:

> Hi George,
>
> I did think about it before making a change.
>
> There are 3 APIs which in a way build up on each other:
>
>    1. File API =>
>    https://developer.mozilla.org/en-US/docs/Web/API/File_API
>    2. File System API =>
>    https://developer.mozilla.org/en-US/docs/Web/API/File_System_API
>    3. File System Access API =>
>    https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
>
> The keyword here is *Access*, which is of course still included inside
> the class name to make it clear. (Meaning: there is no such thing as a
> comparison between "FileSystemAccess" & "FileSystemAccessAPI", it is just
> "File System" versus "File System Access")
>
> From a consistency perspective, all main thread addons mostly exist to
> deal with custom or web APIs which rely on running inside the main thread
> (kind of their purpose).
>
> So, we have names like:
>
>    - Neo.main.addon.Cookie (using the cookie web api)
>    - Neo.main.addon.GoogleMaps (using the google maps web api)
>    - Neo.main.addon.LocalStorage (using the localstorage web api)
>
> The key here is that none of the other addons contains "API" inside the
> class name.
>
> Does it make sense now?
>
> Best regards,
> Tobi
>
> —
> Reply to this email directly, view it on GitHub
> <https://github.com/neomjs/neo/issues/6025#issuecomment-2400824244>, or
> unsubscribe
> <https://github.com/notifications/unsubscribe-auth/ADSPIRPXB6KGT2FOCYZA25TZ2RCV5AVCNFSM6AAAAABPR5UHZCVHI2DSMVQWIX3LMV43OSLTON2WKQ3PNVWWK3TUHMZDIMBQHAZDIMRUGQ>
> .
> You are receiving this because you were mentioned.Message ID:
> ***@***.***>
>



