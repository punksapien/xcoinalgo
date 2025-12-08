module.exports = {
  apps: [
    {
      name: "tick-collector-uni",
      script: "tick_collector.py",
      interpreter: "python3",
      args: "--pair B-UNI_USDT --db /home/ubuntu/tick_data/uni_ticks.db --log-file /home/ubuntu/tick_data/uni_collector.log",
      cwd: "/home/ubuntu/xcoinalgo/data_collection",
      autorestart: true,
      watch: false,
      max_memory_restart: "500M",
      restart_delay: 5000,
      max_restarts: 100,
      env: {
        PYTHONUNBUFFERED: "1"
      },
      error_file: "/home/ubuntu/tick_data/logs/uni-error.log",
      out_file: "/home/ubuntu/tick_data/logs/uni-out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      merge_logs: true,
      instances: 1,
      exec_mode: "fork"
    }
  ]
};
