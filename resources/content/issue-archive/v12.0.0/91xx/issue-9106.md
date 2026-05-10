---
id: 9106
title: DevIndex App Polishing
state: CLOSED
labels:
  - epic
  - ai
assignees:
  - tobiu
createdAt: '2026-02-11T23:14:57Z'
updatedAt: '2026-02-23T16:11:09Z'
githubUrl: 'https://github.com/neomjs/neo/issues/9106'
author: tobiu
commentsCount: 0
parentIssue: null
subIssues:
  - '[x] 9107 OffscreenCanvas charts in Grid Component Columns do not recover after VDOM purge'
  - '[x] 9108 Grid Body fast path fails to update Row mounted state, breaking OffscreenCanvas recovery'
  - '[x] 9109 Refactor: Rename DevRank to DevIndex'
  - '[x] 9110 DevIndex: Support ''country'' URL search parameter'
  - '[x] 9111 Support ISO 2 country codes in CountryFlag component and grid column'
  - '[x] 9112 DevIndex: Add Profile Tab to Controls Panel'
  - '[x] 9116 DevIndex: Polish StatusToolbar Styling and Logic'
  - '[x] 9117 Refactor Grid Footer Toolbar for Store Integration'
  - '[x] 9118 DevIndex: Enhance Updater with Private Contributions & Metadata'
  - '[x] 9119 DevIndex: Add Scheduled Hourly Updater Workflow'
  - '[x] 9121 DevIndex: Implement "Penalty Box" for Failed User Updates'
  - '[x] 9122 DevIndex: Refine Updater Metrics (Success vs Failure)'
  - '[x] 9127 Fix DevIndex Updater Workflow Rebase Logic'
  - '[x] 9128 Implement Adaptive Chunking for DevIndex Updater to Fix 504 Timeouts'
  - '[x] 9129 Fix DevIndex Updater Workflow Unstaged Changes Error (failed.json)'
  - '[x] 9130 Increase DevIndex Updater Throughput to 500 Users/Hour'
  - '[x] 9131 Fix Spider Bio-Signal Search Query 422 Error'
  - '[x] 9132 Implement ''Network Walker'' Discovery Strategy (Social Graph)'
  - '[x] 9133 Tune Spider Strategy Probabilities and Enhance Documentation'
  - '[x] 9134 Fix Organization Leakage in DevIndex and Updater Retries'
  - '[x] 9135 Implement Safe Purge for Invalid Users in DevIndex Updater'
  - '[x] 9136 Implement 30-Day Retention Policy for DevIndex Penalty Box'
  - '[x] 9137 Implement ID-Based Rename Handling for DevIndex'
  - '[x] 9138 Fix DevIndex Updater Workflow Unstaged Changes Error'
  - '[x] 9139 Fix DevIndex Updater Workflow: Stage All Data Files'
  - '[x] 9140 Implement Scheduled DevIndex Spider Workflow'
  - '[x] 9141 [DevIndex] Fix Washington DC Location Resolution'
  - '[x] 9142 [DevIndex] Create Country Code Repair Script'
  - '[x] 9147 Refactor Contributor Model: CamelCase & New Schema Sync'
  - '[x] 9148 DevIndex: Use locale formatting for StatusToolbar row count'
  - '[x] 9149 DevIndex: Add Total Contributions label to StatusToolbar'
  - '[x] 9150 DevIndex: Client-Side "Commits Only" Toggle & Total Commits Implementation'
  - '[x] 9152 [DevIndex] Add Hireable and Website columns to Grid'
  - '[x] 9153 [DevIndex] Add Bio Filter and Hireable Checkbox'
  - '[x] 9154 [DevIndex] Add TopRepo, Twitter, and Sponsors columns'
  - '[x] 9155 [DevIndex] Grid Icon Columns fail to update on Filter change'
  - '[x] 9171 DevIndex: Include Repo Owner in Top Repo Logic'
  - '[x] 9172 DevIndex: Optimize LinkedIn URL Storage'
  - '[x] 9173 Enhance IconLink with Label Support and Update Sponsors Logic'
  - '[x] 9175 DevIndex: Restore 2026 Data and Polish Activity Column'
  - '[x] 9177 DevIndex: Add ''Commits %'' Column and Automation Filter'
  - '[x] 9178 DevIndex: Add ''Impact'' Column (Heuristics Visualization)'
  - '[x] 9181 Fix Grid Column Drag & Drop Regression'
  - '[x] 9182 Fix SortZone onDragMove race condition'
  - '[x] 9183 Enforce hideMode: ''visibility'' for Component Grid Columns'
  - '[x] 9184 Optimize Component Columns with contain: strict'
  - '[x] 9186 Fix Scroll Thrashing during Store Streaming'
  - '[x] 9188 Implement Stop Stream Capability for DevIndex'
  - '[x] 9190 DevIndex: Add ''Private %'' Column'
  - '[x] 9191 DevIndex: Implement 4-Mode Data Toggle (Total, Public, Private, Commits)'
  - '[x] 9192 DevIndex: Swap ''Private %'' and ''Commits %'' Columns'
  - '[x] 9213 DevIndex: Polish Grid & Controls Layout (Shadows, Borders)'
  - '[x] 9214 DevIndex: Style ControlsContainer Tabs to match Portal Theme'
  - '[x] 9215 Update neo-dark theme form fields to match Deep Blue/Purple aesthetic'
  - '[x] 9216 DevIndex (Light Theme): Align Tab Header Colors with Grid Header'
  - '[x] 9217 Update remaining neo-dark form fields and fix inline label color'
subIssuesCompleted: 56
subIssuesTotal: 56
blockedBy: []
blocking: []
closedAt: '2026-02-23T16:11:09Z'
---
# DevIndex App Polishing

This epic covers the final polishing phase of the DevRank application.
It focuses on UI/UX improvements, bug fixes, and ensuring a smooth user experience.


## Timeline

- 2026-02-11T23:14:58Z @tobiu added the `epic` label
- 2026-02-11T23:14:58Z @tobiu added the `ai` label
- 2026-02-11T23:15:14Z @tobiu added sub-issue #9107
- 2026-02-11T23:19:16Z @tobiu assigned to @tobiu
- 2026-02-11T23:28:59Z @tobiu added sub-issue #9108
- 2026-02-12T00:42:46Z @tobiu added sub-issue #9109
- 2026-02-12T00:56:49Z @tobiu changed title from **DevRank App Polishing** to **DevIndex App Polishing**
- 2026-02-12T08:55:11Z @tobiu added sub-issue #9110
- 2026-02-12T09:15:36Z @tobiu added sub-issue #9111
- 2026-02-12T13:21:47Z @tobiu added sub-issue #9112
- 2026-02-12T18:51:19Z @tobiu added sub-issue #9116
- 2026-02-12T19:11:54Z @tobiu added sub-issue #9117
- 2026-02-12T20:04:35Z @tobiu added sub-issue #9118
- 2026-02-12T20:31:48Z @tobiu added sub-issue #9119
- 2026-02-12T20:50:48Z @tobiu added sub-issue #9121
- 2026-02-12T20:55:43Z @tobiu added sub-issue #9122
- 2026-02-13T00:50:50Z @tobiu added sub-issue #9127
- 2026-02-13T01:02:10Z @tobiu added sub-issue #9128
- 2026-02-13T01:09:44Z @tobiu added sub-issue #9129
- 2026-02-13T01:24:21Z @tobiu added sub-issue #9130
- 2026-02-13T01:29:45Z @tobiu added sub-issue #9131
- 2026-02-13T01:39:44Z @tobiu added sub-issue #9132
- 2026-02-13T01:45:49Z @tobiu added sub-issue #9133
- 2026-02-13T02:06:32Z @tobiu added sub-issue #9134
- 2026-02-13T02:13:34Z @tobiu added sub-issue #9135
- 2026-02-13T02:23:05Z @tobiu added sub-issue #9136
- 2026-02-13T02:24:25Z @tobiu added sub-issue #9137
- 2026-02-13T11:00:04Z @tobiu added sub-issue #9138
- 2026-02-13T11:06:18Z @tobiu added sub-issue #9139
- 2026-02-13T11:10:53Z @tobiu added sub-issue #9140
- 2026-02-13T11:58:55Z @tobiu added sub-issue #9141
- 2026-02-13T12:19:34Z @tobiu added sub-issue #9142
- 2026-02-13T14:47:15Z @tobiu added sub-issue #9147
- 2026-02-13T14:59:37Z @tobiu cross-referenced by #9143
- 2026-02-13T17:17:20Z @tobiu referenced in commit `7adf867` - "fix(devindex): Pass random strategy to spider workflow to prevent CI hang (#9106)"
- 2026-02-13T17:38:52Z @tobiu added sub-issue #9148
- 2026-02-13T23:24:13Z @tobiu added sub-issue #9149
- 2026-02-14T00:10:39Z @tobiu added sub-issue #9150
- 2026-02-14T13:05:00Z @tobiu added sub-issue #9152
- 2026-02-14T17:55:04Z @tobiu added sub-issue #9153
- 2026-02-14T17:55:09Z @tobiu added sub-issue #9154
- 2026-02-14T18:46:32Z @tobiu added sub-issue #9155
- 2026-02-15T17:12:10Z @tobiu added sub-issue #9171
- 2026-02-15T17:14:50Z @tobiu added sub-issue #9172
- 2026-02-15T17:56:25Z @tobiu added sub-issue #9173
- 2026-02-15T18:36:16Z @tobiu added sub-issue #9175
- 2026-02-15T21:07:26Z @tobiu added sub-issue #9177
- 2026-02-15T21:51:53Z @tobiu added sub-issue #9178
- 2026-02-16T10:25:11Z @tobiu added sub-issue #9181
- 2026-02-16T10:38:28Z @tobiu added sub-issue #9182

