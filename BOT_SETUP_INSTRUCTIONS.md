# Bot Setup Instructions for EC2 Server

## Step 1: Upload files to EC2

```bash
# From your local machine, upload the files
scp -i /Users/macintosh/Developer/coindcx_client/xcoinalgo-backend-key.pem \
    bot.py setup_bot.sh run_bot.sh run_bot_background.sh \
    ubuntu@184.72.102.221:~/
```

## Step 2: SSH into EC2

```bash
ssh -i /Users/macintosh/Developer/coindcx_client/xcoinalgo-backend-key.pem ubuntu@184.72.102.221
```

## Step 3: Run setup (one-time)

```bash
chmod +x setup_bot.sh run_bot.sh run_bot_background.sh
./setup_bot.sh
```

This will:
- Create `~/bot_project/` directory
- Create Python virtual environment
- Install numpy==1.26.4, pandas==2.2.2, pandas_ta

## Step 4: Move bot.py to project directory

```bash
mv bot.py ~/bot_project/
```

## Step 5: Run the bot (choose one option)

### Option A: Run in foreground (see logs in real-time)

```bash
cd ~/bot_project
./run_bot.sh
```

- Logs appear on screen AND saved to `logs/bot_output_<timestamp>.txt`
- Press `Ctrl+C` to stop
- ⚠️ Bot stops if you disconnect SSH

### Option B: Run in background (keeps running after SSH disconnect)

```bash
cd ~/bot_project
./run_bot_background.sh
```

- Bot runs in `screen` session
- Logs saved to `logs/bot_output_<timestamp>.txt`
- You can disconnect SSH and bot keeps running

**Commands for background bot:**

```bash
# View live logs
screen -r bot_session

# Detach from screen (keep bot running)
# Press: Ctrl+A then D

# Stop bot
screen -S bot_session -X quit

# Check if bot is running
screen -list
```

## Viewing Logs

```bash
# Latest log file
cd ~/bot_project/logs
ls -lt  # Lists files by modification time

# Tail latest log (live updates)
tail -f logs/bot_output_*.txt

# View specific log file
cat logs/bot_output_2025-10-14_13-45-00.txt
```

## Troubleshooting

### Check if bot is running
```bash
ps aux | grep bot.py
```

### Check logs for errors
```bash
cd ~/bot_project/logs
tail -n 50 bot_output_*.txt
```

### Restart bot
```bash
# If running in background
screen -S bot_session -X quit
./run_bot_background.sh

# If running in foreground
# Press Ctrl+C, then:
./run_bot.sh
```

## Expected Log Output

```
2025-10-14 07:32:43,555 - INFO - Loaded state: In Position = False
2025-10-14 07:32:43,560 - INFO - Fetching instrument details...
2025-10-14 07:32:44,031 - INFO - Successfully fetched details for B-AVAX_USDT.
2025-10-14 07:32:44,032 - INFO - Starting Live Trading Bot for B-AVAX_USDT...
2025-10-14 07:32:44,253 - INFO -
==================================================
Cycle Start - In Position: False
2025-10-14 07:32:45,048 - INFO - Cycle complete. Waiting for 137 seconds...
```

All logs are saved to timestamped files in `~/bot_project/logs/`
