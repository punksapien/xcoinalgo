#!/bin/bash

# XCoinAlgo System Monitor - Sends alerts to Telegram
# Usage: ./system-monitor.sh

# Configuration
TELEGRAM_BOT_TOKEN="YOUR_BOT_TOKEN_HERE"
TELEGRAM_CHAT_ID="YOUR_CHAT_ID_HERE"

# Thresholds
CPU_THRESHOLD=85
MEMORY_THRESHOLD=85
DISK_THRESHOLD=80

# Alert cooldown file (prevent spam)
COOLDOWN_FILE="/tmp/xcoinalgo-alert-cooldown"
COOLDOWN_MINUTES=30

# Function to send Telegram message
send_telegram() {
    local message="$1"
    curl -s -X POST "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage" \
        -d chat_id="${TELEGRAM_CHAT_ID}" \
        -d text="${message}" \
        -d parse_mode="HTML" > /dev/null
}

# Function to check cooldown
check_cooldown() {
    local alert_type="$1"
    local cooldown_key="${COOLDOWN_FILE}.${alert_type}"
    
    if [ -f "$cooldown_key" ]; then
        local last_alert=$(cat "$cooldown_key")
        local now=$(date +%s)
        local diff=$((now - last_alert))
        local cooldown_seconds=$((COOLDOWN_MINUTES * 60))
        
        if [ $diff -lt $cooldown_seconds ]; then
            return 1  # Still in cooldown
        fi
    fi
    
    echo $(date +%s) > "$cooldown_key"
    return 0  # OK to send alert
}

# Get system metrics
get_cpu_usage() {
    top -bn1 | grep "Cpu(s)" | sed "s/.*, *\([0-9.]*\)%* id.*/\1/" | awk '{print 100 - $1}'
}

get_memory_usage() {
    free | grep Mem | awk '{print ($3/$2) * 100.0}'
}

get_disk_usage() {
    df -h / | awk 'NR==2 {print $5}' | sed 's/%//'
}

get_load_average() {
    uptime | awk -F'load average:' '{print $2}' | awk '{print $1}' | sed 's/,//'
}

# Check CPU
CPU_USAGE=$(get_cpu_usage)
CPU_USAGE_INT=$(printf "%.0f" "$CPU_USAGE")

if [ "$CPU_USAGE_INT" -ge "$CPU_THRESHOLD" ]; then
    if check_cooldown "cpu"; then
        LOAD=$(get_load_average)
        MESSAGE="🔴 <b>HIGH CPU ALERT!</b>

🖥️ <b>Server:</b> XCoinAlgo Production
📊 <b>CPU Usage:</b> ${CPU_USAGE_INT}%
⚠️ <b>Threshold:</b> ${CPU_THRESHOLD}%
📈 <b>Load Average:</b> ${LOAD}

<i>Time:</i> $(date '+%Y-%m-%d %H:%M:%S UTC')

Action needed: Check running processes"
        send_telegram "$MESSAGE"
    fi
fi

# Check Memory
MEMORY_USAGE=$(get_memory_usage)
MEMORY_USAGE_INT=$(printf "%.0f" "$MEMORY_USAGE")

if [ "$MEMORY_USAGE_INT" -ge "$MEMORY_THRESHOLD" ]; then
    if check_cooldown "memory"; then
        FREE_MEM=$(free -h | grep Mem | awk '{print $4}')
        MESSAGE="🔴 <b>HIGH MEMORY ALERT!</b>

🖥️ <b>Server:</b> XCoinAlgo Production
💾 <b>Memory Usage:</b> ${MEMORY_USAGE_INT}%
⚠️ <b>Threshold:</b> ${MEMORY_THRESHOLD}%
🆓 <b>Available:</b> ${FREE_MEM}

<i>Time:</i> $(date '+%Y-%m-%d %H:%M:%S UTC')

Action needed: Check memory leaks"
        send_telegram "$MESSAGE"
    fi
fi

# Check Disk
DISK_USAGE=$(get_disk_usage)

if [ "$DISK_USAGE" -ge "$DISK_THRESHOLD" ]; then
    if check_cooldown "disk"; then
        DISK_FREE=$(df -h / | awk 'NR==2 {print $4}')
        MESSAGE="🔴 <b>DISK SPACE ALERT!</b>

🖥️ <b>Server:</b> XCoinAlgo Production
💿 <b>Disk Usage:</b> ${DISK_USAGE}%
⚠️ <b>Threshold:</b> ${DISK_THRESHOLD}%
🆓 <b>Available:</b> ${DISK_FREE}

<i>Time:</i> $(date '+%Y-%m-%d %H:%M:%S UTC')

Action needed: Clean up logs or increase storage"
        send_telegram "$MESSAGE"
    fi
fi

# Check PM2 processes
PM2_STATUS=$(pm2 jlist 2>/dev/null)

if [ $? -ne 0 ]; then
    if check_cooldown "pm2"; then
        MESSAGE="🔴 <b>PM2 ERROR!</b>

🖥️ <b>Server:</b> XCoinAlgo Production
❌ <b>Issue:</b> PM2 is not responding

<i>Time:</i> $(date '+%Y-%m-%d %H:%M:%S UTC')

Action needed: Restart PM2 daemon"
        send_telegram "$MESSAGE"
    fi
else
    # Check for stopped processes
    STOPPED=$(echo "$PM2_STATUS" | jq -r '.[] | select(.pm2_env.status != "online") | .name' 2>/dev/null)
    
    if [ ! -z "$STOPPED" ]; then
        if check_cooldown "pm2_stopped"; then
            MESSAGE="🔴 <b>PM2 PROCESS DOWN!</b>

🖥️ <b>Server:</b> XCoinAlgo Production
❌ <b>Stopped Processes:</b>
${STOPPED}

<i>Time:</i> $(date '+%Y-%m-%d %H:%M:%S UTC')

Action needed: Restart failed processes"
            send_telegram "$MESSAGE"
        fi
    fi
fi

# Check backend health endpoint
BACKEND_HEALTH=$(curl -s --max-time 5 http://localhost:3001/health 2>/dev/null)

if [ -z "$BACKEND_HEALTH" ] || ! echo "$BACKEND_HEALTH" | grep -q "ok"; then
    if check_cooldown "backend_health"; then
        MESSAGE="🔴 <b>BACKEND HEALTH CHECK FAILED!</b>

🖥️ <b>Server:</b> XCoinAlgo Production
❌ <b>Issue:</b> Backend not responding to health check

<i>Time:</i> $(date '+%Y-%m-%d %H:%M:%S UTC')

Action needed: Check backend logs and restart if needed"
        send_telegram "$MESSAGE"
    fi
fi

# Check database connectivity
DB_CHECK=$(PGPASSWORD='your_db_password' psql -U xcoinalgo -d xcoinalgo -h localhost -c "SELECT 1;" 2>&1)

if [ $? -ne 0 ]; then
    if check_cooldown "database"; then
        MESSAGE="🔴 <b>DATABASE CONNECTION FAILED!</b>

🖥️ <b>Server:</b> XCoinAlgo Production
❌ <b>Issue:</b> Cannot connect to PostgreSQL

<i>Time:</i> $(date '+%Y-%m-%d %H:%M:%S UTC')

Action needed: Check PostgreSQL service"
        send_telegram "$MESSAGE"
    fi
fi

# Check Redis connectivity
REDIS_CHECK=$(redis-cli ping 2>&1)

if [ "$REDIS_CHECK" != "PONG" ]; then
    if check_cooldown "redis"; then
        MESSAGE="🔴 <b>REDIS CONNECTION FAILED!</b>

🖥️ <b>Server:</b> XCoinAlgo Production
❌ <b>Issue:</b> Cannot connect to Redis

<i>Time:</i> $(date '+%Y-%m-%d %H:%M:%S UTC')

Action needed: Check Redis service"
        send_telegram "$MESSAGE"
    fi
fi

# All checks passed - send daily heartbeat at 9 AM UTC
CURRENT_HOUR=$(date +%H)
if [ "$CURRENT_HOUR" == "09" ]; then
    if check_cooldown "daily_heartbeat"; then
        CPU=$(printf "%.1f" "$CPU_USAGE")
        MEM=$(printf "%.1f" "$MEMORY_USAGE")
        LOAD=$(get_load_average)
        UPTIME=$(uptime -p)
        
        MESSAGE="✅ <b>Daily System Report</b>

🖥️ <b>Server:</b> XCoinAlgo Production
📊 <b>Status:</b> All systems operational

<b>Metrics:</b>
• CPU: ${CPU}%
• Memory: ${MEM}%
• Disk: ${DISK_USAGE}%
• Load: ${LOAD}
• Uptime: ${UPTIME}

<i>Time:</i> $(date '+%Y-%m-%d %H:%M:%S UTC')</i>

Have a great day! 🚀"
        send_telegram "$MESSAGE"
    fi
fi
