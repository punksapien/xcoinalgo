# 🔔 XCoinAlgo System Monitoring & Alerts Setup

This guide will help you set up real-time Telegram alerts for your server.

---

## 📱 Step 1: Create Your Telegram Bot

1. **Open Telegram** and search for `@BotFather`
2. **Start a chat** with BotFather
3. **Send the command:** `/newbot`
4. **Choose a name** for your bot (e.g., "XCoinAlgo Monitor")
5. **Choose a username** for your bot (must end in 'bot', e.g., "xcoinalgo_monitor_bot")
6. **Save your bot token** - BotFather will give you a token like:
   ```
   1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890
   ```

---

## 🆔 Step 2: Get Your Chat ID

### Option A: Using a Bot (Easiest)

1. Search for `@userinfobot` in Telegram
2. Start a chat with it
3. It will reply with your Chat ID (a number like `123456789`)

### Option B: Using your own bot

1. Start a chat with **your new bot** (the one you just created)
2. **Send any message** to it (e.g., "Hello")
3. Open this URL in your browser (replace `YOUR_BOT_TOKEN`):
   ```
   https://api.telegram.org/botYOUR_BOT_TOKEN/getUpdates
   ```
4. Look for `"chat":{"id":123456789}` - that number is your Chat ID

---

## ⚙️ Step 3: Configure the Monitor Script

1. **Edit the script** on your local machine:
   ```bash
   nano backend/scripts/system-monitor.sh
   ```

2. **Replace the placeholders:**
   ```bash
   TELEGRAM_BOT_TOKEN="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz1234567890"
   TELEGRAM_CHAT_ID="123456789"
   ```

3. **Optional: Adjust thresholds** (if needed):
   ```bash
   CPU_THRESHOLD=85      # Alert when CPU > 85%
   MEMORY_THRESHOLD=85   # Alert when Memory > 85%
   DISK_THRESHOLD=80     # Alert when Disk > 80%
   COOLDOWN_MINUTES=30   # Wait 30 min before re-alerting
   ```

4. **Save the file** (Ctrl+X, then Y, then Enter)

---

## 🚀 Step 4: Deploy to EC2

1. **Commit and push changes:**
   ```bash
   cd /Users/macintosh/Developer/coindcx_client/coindcx-trading-platform
   git add backend/scripts/system-monitor.sh backend/scripts/MONITORING_SETUP.md
   git commit -m "Add Telegram monitoring system"
   git push origin main
   ```

2. **SSH to EC2 and pull:**
   ```bash
   ssh -i /Users/macintosh/Developer/coindcx_client/xcoinalgo-backend-key.pem ubuntu@184.72.102.221
   cd xcoinalgo
   git pull origin main
   chmod +x backend/scripts/system-monitor.sh
   ```

3. **Test the script:**
   ```bash
   ./backend/scripts/system-monitor.sh
   ```

   You should receive a test message on Telegram! 🎉

---

## ⏰ Step 5: Set Up Automated Monitoring (Cron)

1. **Edit crontab on EC2:**
   ```bash
   crontab -e
   ```

2. **Add this line** (runs every 5 minutes):
   ```bash
   */5 * * * * /home/ubuntu/xcoinalgo/backend/scripts/system-monitor.sh >> /home/ubuntu/xcoinalgo/backend/logs/monitor.log 2>&1
   ```

3. **Save and exit** (Ctrl+X, then Y, then Enter)

4. **Verify cron job:**
   ```bash
   crontab -l
   ```

---

## 📊 What You'll Get Alerted About

### 🔴 Critical Alerts (Instant)

1. **High CPU Usage** (>85%)
   - Shows current CPU % and load average
   - Cooldown: 30 minutes

2. **High Memory Usage** (>85%)
   - Shows current memory % and free memory
   - Cooldown: 30 minutes

3. **Disk Space Low** (>80%)
   - Shows current disk % and available space
   - Cooldown: 30 minutes

4. **PM2 Process Crashed**
   - Lists which process(es) stopped
   - Cooldown: 30 minutes

5. **Backend Health Check Failed**
   - Backend not responding to /health endpoint
   - Cooldown: 30 minutes

6. **Database Connection Failed**
   - PostgreSQL not accessible
   - Cooldown: 30 minutes

7. **Redis Connection Failed**
   - Redis not responding
   - Cooldown: 30 minutes

### ✅ Daily Heartbeat

- **Every day at 9:00 AM UTC**
- Shows all system metrics are healthy
- Confirms monitoring is working

---

## 🧪 Testing Your Setup

### Test 1: Manual Run
```bash
ssh -i /path/to/key.pem ubuntu@184.72.102.221
cd xcoinalgo
./backend/scripts/system-monitor.sh
```

### Test 2: Trigger a Fake Alert
```bash
# Temporarily lower threshold to test
sed -i 's/CPU_THRESHOLD=85/CPU_THRESHOLD=1/' backend/scripts/system-monitor.sh
./backend/scripts/system-monitor.sh
# Should trigger CPU alert!

# Restore original threshold
sed -i 's/CPU_THRESHOLD=1/CPU_THRESHOLD=85/' backend/scripts/system-monitor.sh
```

### Test 3: Check Cron Logs
```bash
tail -f /home/ubuntu/xcoinalgo/backend/logs/monitor.log
```

---

## 🛠️ Customization Options

### Change Alert Frequency
Edit crontab timing:
```bash
# Every 1 minute (aggressive)
* * * * * /home/ubuntu/xcoinalgo/backend/scripts/system-monitor.sh

# Every 10 minutes (relaxed)
*/10 * * * * /home/ubuntu/xcoinalgo/backend/scripts/system-monitor.sh

# Every hour
0 * * * * /home/ubuntu/xcoinalgo/backend/scripts/system-monitor.sh
```

### Change Thresholds
Edit `system-monitor.sh`:
```bash
CPU_THRESHOLD=90      # More lenient
MEMORY_THRESHOLD=90   # More lenient
DISK_THRESHOLD=85     # More lenient
```

### Change Cooldown Period
```bash
COOLDOWN_MINUTES=60   # Wait 1 hour before re-alerting
COOLDOWN_MINUTES=10   # More aggressive (10 min)
```

### Add Custom Alerts
Add your own checks at the bottom of the script:
```bash
# Check if Nginx is running
if ! systemctl is-active --quiet nginx; then
    if check_cooldown "nginx"; then
        MESSAGE="🔴 <b>NGINX DOWN!</b>

Server: XCoinAlgo Production
Action needed: Restart Nginx"
        send_telegram "$MESSAGE"
    fi
fi
```

---

## 🔍 Troubleshooting

### Not receiving alerts?

1. **Check bot token and chat ID:**
   ```bash
   grep TELEGRAM backend/scripts/system-monitor.sh
   ```

2. **Test Telegram API manually:**
   ```bash
   curl -s -X POST "https://api.telegram.org/botYOUR_TOKEN/sendMessage" \
     -d chat_id="YOUR_CHAT_ID" \
     -d text="Test message"
   ```

3. **Check if script has errors:**
   ```bash
   bash -x backend/scripts/system-monitor.sh
   ```

4. **Verify cron is running:**
   ```bash
   sudo systemctl status cron
   ```

### Getting spammed with alerts?

- Increase `COOLDOWN_MINUTES` to 60 or 120
- Increase thresholds (85 → 90)
- Change cron frequency to */10 or */15 minutes

### Want to mute alerts temporarily?

```bash
# Disable cron job
crontab -e
# Comment out the line with #
# */5 * * * * /home/ubuntu/xcoinalgo/backend/scripts/system-monitor.sh

# Re-enable later by removing the #
```

---

## 📱 Example Alert Messages

### High CPU Alert
```
🔴 HIGH CPU ALERT!

🖥️ Server: XCoinAlgo Production
📊 CPU Usage: 92%
⚠️ Threshold: 85%
📈 Load Average: 3.45

Time: 2025-11-28 12:30:45 UTC

Action needed: Check running processes
```

### Daily Heartbeat
```
✅ Daily System Report

🖥️ Server: XCoinAlgo Production
📊 Status: All systems operational

Metrics:
• CPU: 8.2%
• Memory: 12.5%
• Disk: 56%
• Load: 0.16
• Uptime: up 2 days, 3 hours

Time: 2025-11-28 09:00:00 UTC

Have a great day! 🚀
```

---

## 🎯 Next Steps

Once set up, you'll have:
- ✅ Real-time alerts for critical issues
- ✅ Daily health reports
- ✅ Peace of mind 24/7
- ✅ Automatic cooldown to prevent spam

**Recommended:** Keep your phone's Telegram notifications on for this bot!

---

## 📞 Support

If you encounter issues:
1. Check the troubleshooting section above
2. Review `/home/ubuntu/xcoinalgo/backend/logs/monitor.log`
3. Test manually: `./backend/scripts/system-monitor.sh`

Happy monitoring! 🚀
