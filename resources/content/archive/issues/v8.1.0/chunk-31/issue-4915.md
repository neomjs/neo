---
id: 4915
title: 'calendar.view.MainContainer: regression bug => the DateSelector jumps from null to today to july 2023 '
state: CLOSED
labels:
  - bug
assignees:
  - tobiu
createdAt: '2023-09-15T09:18:44Z'
updatedAt: '2023-09-30T11:16:22Z'
githubUrl: 'https://github.com/neomjs/neo/issues/4915'
author: tobiu
commentsCount: 5
parentIssue: null
subIssues: []
subIssuesCompleted: 0
subIssuesTotal: 0
blockedBy: []
blocking: []
closedAt: '2023-09-30T11:16:22Z'
---
# calendar.view.MainContainer: regression bug => the DateSelector jumps from null to today to july 2023 

this includes an animation, which was not there earlier.

not sure yet, how the `new Date()` gets into `currentDate` of the MainViewModel.

## Timeline

- 2023-09-15T09:18:44Z @tobiu added the `bug` label
### @KingsCreatives - 2023-09-27T07:25:25Z

can you please assign me this task?

### @tobiu - 2023-09-27T16:00:13Z

hi @Kwamecody,

sure, if you want to give it a try. the process is to create a fork and send a pull request with related changes. feel free to jump into the slack channel, in case you have not done so already.

best regards!

- 2023-09-27T16:00:22Z @tobiu assigned to @KingsCreatives
### @KingsCreatives - 2023-09-27T19:09:08Z

noted with thanks.

On Wed, Sep 27, 2023 at 4:00 PM Tobias Uhlig ***@***.***>
wrote:

> hi @Kwamecody <https://github.com/Kwamecody>,
>
> sure, if you want to give it a try. the process is to create a fork and
> send a pull request with related changes. feel free to jump into the slack
> channel, in case you have not done so already.
>
> best regards!
>
> —
> Reply to this email directly, view it on GitHub
> <https://github.com/neomjs/neo/issues/4915#issuecomment-1737680402>, or
> unsubscribe
> <https://github.com/notifications/unsubscribe-auth/A2SFCF3LKWVTRXT3JYHYMW3X4RERTANCNFSM6AAAAAA4ZQO4Q4>
> .
> You are receiving this because you were assigned.Message ID:
> ***@***.***>
>


### @KingsCreatives - 2023-09-29T21:30:45Z

Hello @tobiu ,

I trust this message finds you well. I wanted to provide you with a transparent update on the progress of the calendar component bug investigation.

I've conducted a comprehensive review of all methods within the **`MainContainer `** that set or update the date. Additionally, I've closely examined portions of the code where date manipulation occurs, especially focusing on the connection between the model's **`currentDate`** and the date selector in **`MainContainer`**.

Despite multiple attempts and thorough analysis, I'm currently facing challenges in pinpointing the root cause of the issue that results in the date jumping from `None to today to July 2023`.

Regrettably, at this point,I believe it would be ideal to consider reassigning the task to another person.

Thank you.

### @tobiu - 2023-09-30T11:14:27Z

no worries, this one was non-trivial. i got a fix running locally now.

- 2023-09-30T11:14:43Z @tobiu assigned to @tobiu
- 2023-09-30T11:14:43Z @tobiu unassigned from @KingsCreatives
- 2023-09-30T11:15:13Z @tobiu referenced in commit `499bcb6` - "calendar.view.MainContainer: regression bug => the DateSelector jumps from null to today to july 2023 #4915"
- 2023-09-30T11:16:23Z @tobiu closed this issue
- 2023-10-02T10:30:11Z @tobiu referenced in commit `a7f4765` - "v6.7.5 (#4962)

* calendar.view.MainContainer: regression bug => the DateSelector jumps from null to today to july 2023 #4915

* dependencies update

* component.Base: cleanup (doc comments)

* tab.header.Toolbar: sortable #4767

* core.Base: merge() => must not call itself recursively for null values #4960

* combine Neo.merge() & core.Base: merge() #4961

* #4961 cleanup

* v6.7.5"

