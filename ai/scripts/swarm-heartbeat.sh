#!/bin/bash
# ai/scripts/swarm-heartbeat.sh
#
# Swarm Autonomy: Track 1 (Sleep-Cycle MVP)
# Provides an information-rich heartbeat to active terminal sessions.
# Catches SESSION_FULL exits to facilitate Sandman Handoffs.

DB_PATH=".neo-ai-data/sqlite/memory-core-graph.sqlite"
TMUX_SESSION=${TMUX_SESSION:-"neo-agent"}
POLL_INTERVAL=${POLL_INTERVAL:-300} # 5 minutes default
IDENTITY=${NEO_AGENT_IDENTITY:-"@neo-gemini-3-1-pro"}
STATE_FILE="/tmp/neo-agent-state.txt"
CONCURRENCY_LOCK=".neo-ai-data/heartbeat-concurrency.lock"
HEARTBEAT_LOCK_TTL_SECONDS=${HEARTBEAT_LOCK_TTL_SECONDS:-600} # 10 minutes
# Persistent sweep-error log (#10595). Replaces the prior `2>/dev/null` mask on the
# `sweepExpiredTasks.mjs` invocation, which silently hid the `ReferenceError: Neo is
# not defined` regression for the entire lifetime of the bug. Failures now append here
# so operators can `tail` the file when investigating heartbeat behavior. Co-located
# with `bridge.log` under `wake-daemon/` (already in `DATA_SUBDIRS_TO_LINK` per #10432).
SWEEP_LOG=".neo-ai-data/wake-daemon/sweep-errors.log"
# Ensure parent dir exists on fresh checkouts before any `2>>"$SWEEP_LOG"` redirection
# fires (per @neo-gpt's PR #10597 cycle 1 review). Without this guard, a clone that
# hasn't yet symlinked `wake-daemon/` via `bootstrapWorktree.mjs --link-data` would
# fail the redirect at shell-parse time and silently bypass the intended log surface.
mkdir -p "$(dirname "$SWEEP_LOG")"

# Returns the mtime of a file on macOS (stat -f) or Linux (stat -c).
file_mtime_seconds() {
    stat -f "%m" "$1" 2>/dev/null || stat -c "%Y" "$1" 2>/dev/null
}

# Heartbeat concurrency semantics (#10319):
# - Lock present and fresh  => current pulse is skipped.
# - Lock present and stale  => lock is cleared; current pulse may continue.
# - Lock absent             => current pulse may continue.
# Missed pulses are not queued; the next pulse re-reads Memory Core state.
heartbeat_lock_active() {
    if [ ! -f "$CONCURRENCY_LOCK" ]; then
        return 1
    fi

    local mtime=$(file_mtime_seconds "$CONCURRENCY_LOCK")
    if [ -z "$mtime" ]; then
        echo "[heartbeat $(date -Iseconds)] concurrency lock unreadable; skipping pulse" >&2
        return 0
    fi

    local now=$(date +%s)
    local age=$((now - mtime))

    if [ "$age" -gt "$HEARTBEAT_LOCK_TTL_SECONDS" ]; then
        echo "[heartbeat $(date -Iseconds)] clearing stale concurrency lock (${age}s old)" >&2
        rm -f "$CONCURRENCY_LOCK"
        return 1
    fi

    return 0
}

# Function to get unread messages count via SQLite fast-path
get_unread_count() {
    if [ ! -f "$DB_PATH" ]; then
        echo "0"
        return
    fi
    # Node label discriminator on MESSAGE rows is `$.label`, not `$.type` (substrate-schema
    # parity with #10619 Cycle 1 finding on AGENT_MEMORY). Pre-fix query matched 0 rows
    # regardless of mailbox state, so the token-economy gate below silently skipped every
    # pulse — the heartbeat was a no-op for active idle agents. See #10622.
    local count=$(sqlite3 "$DB_PATH" "SELECT count(DISTINCT n.id) FROM Nodes n JOIN Edges e ON n.id = e.source AND e.type = 'SENT_TO' WHERE json_extract(n.data, '$.label') = 'MESSAGE' AND json_extract(n.data, '$.properties.readAt') IS NULL AND e.target IN ('$IDENTITY', 'AGENT:*');" 2>/dev/null)
    echo "${count:-0}"
}

# Function to get open assigned issues count
get_issues_count() {
    local count=$(gh issue list --assignee "@me" --state open --json number 2>/dev/null | jq length)
    echo "${count:-0}"
}

# Heartbeat-Bypass Detection (Phase 3 Wake Substrate)
# Returns identities with WAKE_SUBSCRIPTION.harnessTarget IN ('mcp-notifications', 'a2a-webhook')
get_push_capable_identities() {
    if [ ! -f "$DB_PATH" ]; then
        return
    fi
    sqlite3 "$DB_PATH" "
      SELECT json_extract(data, '\$.properties.agentIdentity')
      FROM Nodes
      WHERE json_extract(data, '\$.label') = 'WAKE_SUBSCRIPTION'
        AND json_extract(data, '\$.properties.harnessTarget') IN ('mcp-notifications', 'a2a-webhook')
        AND COALESCE(json_extract(data, '\$.properties.status'), 'active') != 'degraded';
    " 2>/dev/null
}

# Function to sweep expired A2A tasks (Track 2C, #10339)
# Invokes the JS CLI wrapper which calls MailboxService.sweepExpiredTasks(). Bulk SQL
# UPDATE-WHERE atomically transitions stale Submitted/Working/InputRequired tasks past
# their task.expiresAt to Expired. Returns the swept count via stdout JSON. Substrate-level
# maintenance — not gated on token-economy fast-path because TTL expiry is global and
# operates regardless of the agent's conversational activity.
sweep_expired_tasks() {
    if [ ! -f "$DB_PATH" ]; then
        echo "0"
        return
    fi
    local script_dir=$(dirname "$0")
    # Per #10595: stderr surfaces to $SWEEP_LOG (no longer silently masked to /dev/null).
    # The prior `2>/dev/null` mask hid `ReferenceError: Neo is not defined` for the
    # full lifetime of the regression empirically anchored in PR #10594's measurement.
    # Stdout is still captured into $output for the JSON parse — only stderr changes.
    local output=$(node "${script_dir}/sweepExpiredTasks.mjs" 2>>"$SWEEP_LOG")
    local count=$(echo "$output" | grep -oE '"sweptCount":[0-9]+' | grep -oE '[0-9]+$')
    echo "${count:-0}"
}

# Background pulse generator
heartbeat_pulse() {
    while true; do
        sleep $POLL_INTERVAL

        # Concurrency Trap: skip if expensive agent work is already running.
        if heartbeat_lock_active; then
            continue
        fi

        # Track 2C TTL sweep (#10339) — fires every cycle BEFORE the token-economy
        # fast-path. Stale-task expiration is substrate maintenance, not agent-conversational
        # — runs unconditionally so the queue's actionable-set stays bounded even during
        # idle stretches. Sweep is near-instant on small candidate sets (single bulk SQL).
        local expired=$(sweep_expired_tasks)
        if [ "$expired" -gt 0 ]; then
            echo "[heartbeat $(date -Iseconds)] sweep: ${expired} task(s) transitioned to Expired" >&2
        fi

        # Check Sunsetted State for Phase 1 Recovery (#10601 + #10611 PR-B fresh-session-spawn corrective)
        local script_dir=$(dirname "$0")
        local sunset_json=$(node "${script_dir}/checkSunsetted.mjs" "$IDENTITY" 2>>"$SWEEP_LOG")
        if [ $? -eq 0 ] && [ -n "$sunset_json" ]; then
            local is_sunsetted=$(echo "$sunset_json" | jq -r '.sunsetted')
            local sunset_reason=$(echo "$sunset_json" | jq -r '.reason')
            # Per #10611 PR-B, forward originSessionId to resumeHarness so the fresh-session
            # boot-grounding prompt can anchor Memory Core context-priming. `// empty` jq filter
            # safely degrades to '' when the key is absent (older sunset JSON shape).
            local origin_session_id=$(echo "$sunset_json" | jq -r '.originSessionId // empty')

            if [ "$is_sunsetted" = "true" ]; then
                echo "[heartbeat $(date -Iseconds)] Phase 1 Recovery Triggered for $IDENTITY. Reason: $sunset_reason" >&2

                # Q1b fresh-session-spawn adapter: opens a new chat in target harness via
                # Cmd+N keystroke before pasting the boot-grounding prompt. Replaces the prior
                # Q1a in-place wake injection per @tobiu's verbatim 2026-05-02 correction.
                node "${script_dir}/resumeHarness.mjs" "$IDENTITY" "$sunset_reason" "$origin_session_id" 2>>"$SWEEP_LOG"

                # Continue loop; no need to send regular heartbeat to tmux since we just resumed via OS
                continue
            fi
        fi

        # All-agent-idle detection (Phase 3 Substrate Primitive #10625)
        local cycle_id=$(date +%s)
        local all_idle_json=$(node "${script_dir}/checkAllAgentIdle.mjs" "$cycle_id" 2>>"$SWEEP_LOG")
        if [ $? -eq 0 ] && [ -n "$all_idle_json" ]; then
            local is_all_idle=$(echo "$all_idle_json" | jq -r '.allIdle')
            if [ "$is_all_idle" = "true" ]; then
                echo "[heartbeat $(date -Iseconds)] AllAgentIdle detected: $all_idle_json" >&2
                # The cooldown layer #10626 will hook here to decide whether to emit a WAKE event.
            fi
        fi

        # Heartbeat-Bypass Detection
        local push_identities=$(get_push_capable_identities)
        if echo "$push_identities" | grep -Fq "$IDENTITY"; then
            continue
        fi

        # Execute the fast-path deterministic queries
        local unread=$(get_unread_count)
        local issues=$(get_issues_count)

        # Token Economy: Only inject pulse if there's actionable state. Sweep count does
        # NOT factor into the inject decision — silent maintenance per #10339 AC.
        if [ "$unread" -eq 0 ] && [ "$issues" -eq 0 ]; then
            continue
        fi

        local prompt="[SYSTEM HEARTBEAT] Last wake: T-5min. Mailbox unread: ${unread}. Open issues assigned: ${issues}."
        if [ "$expired" -gt 0 ]; then
            prompt="${prompt} Tasks expired this cycle: ${expired}."
        fi

        # Inject into active terminal (using tmux as the substrate for headless sessions)
        if tmux has-session -t "$TMUX_SESSION" 2>/dev/null; then
            tmux send-keys -t "$TMUX_SESSION" "$prompt" C-m
        fi
    done
}

# Cleanup on exit
trap 'kill $(jobs -p) 2>/dev/null' EXIT

echo "Starting Sleep-Cycle MVP Heartbeat Wrapper..."
rm -f "$STATE_FILE"

# Launch the heartbeat pulse background job
heartbeat_pulse &

# Wrapper loop for the Agent process
while true; do
    echo "Booting Agent Session..."

    # Support overriding the agent command
    if [ $# -eq 0 ]; then
        # Default fallback (could be claude or npm run ai:cli)
        AGENT_CMD="claude"
    else
        AGENT_CMD="$@"
    fi

    # Run the agent
    $AGENT_CMD

    # Check for Sandman Handoff trap (SESSION_FULL state)
    if [ -f "$STATE_FILE" ]; then
        AGENT_STATE=$(cat "$STATE_FILE")
        if [ "$AGENT_STATE" = "SESSION_FULL" ]; then
            echo "Caught SESSION_FULL trap. Respawning fresh session..."
            rm -f "$STATE_FILE"
            sleep 2
            continue
        fi
    fi

    # Normal exit
    echo "Agent process exited normally. Stopping heartbeat wrapper."
    break
done
