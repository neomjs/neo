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

# Function to get unread messages count via SQLite fast-path
get_unread_count() {
    if [ ! -f "$DB_PATH" ]; then
        echo "0"
        return
    fi
    local count=$(sqlite3 "$DB_PATH" "SELECT count(DISTINCT n.id) FROM Nodes n JOIN Edges e ON n.id = e.source AND e.type = 'SENT_TO' WHERE json_extract(n.data, '$.type') = 'MESSAGE' AND json_extract(n.data, '$.properties.readAt') IS NULL AND e.target IN ('$IDENTITY', 'AGENT:*');" 2>/dev/null)
    echo "${count:-0}"
}

# Function to get open assigned issues count
get_issues_count() {
    local count=$(gh issue list --assignee "@me" --state open --json number 2>/dev/null | jq length)
    echo "${count:-0}"
}

# Background pulse generator
heartbeat_pulse() {
    while true; do
        sleep $POLL_INTERVAL
        
        # Concurrency Trap: Skip if agent is busy (lock exists)
        if [ -f "$CONCURRENCY_LOCK" ]; then
            continue
        fi

        # Execute the fast-path deterministic queries
        local unread=$(get_unread_count)
        local issues=$(get_issues_count)

        # Token Economy: Only inject pulse if there's actionable state
        if [ "$unread" -eq 0 ] && [ "$issues" -eq 0 ]; then
            continue
        fi

        local prompt="[SYSTEM HEARTBEAT] Last wake: T-5min. Mailbox unread: ${unread}. Open issues assigned: ${issues}."

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
