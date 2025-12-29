module.exports = {
	apps: [
		{
		  "name": "aiot",
		  "script": "./server.js",
		  "instances": 1,
		  "exec_mode": "fork",
		  "env": {
		    "NODE_ENV": "AIOT",
		    "HIDE_AI_PANE": true,
		    "PORT": 3000,
		    "HOST": "0.0.0.0",
		    "TERMINAL_SHELL": "bash",
		    "LANG": "en_US.UTF-8",
		    "LC_ALL": "en_US.UTF-8"
		  },
		  "restart_delay": 1000,
		  "max_restarts": 5,
		  "min_uptime": "10s",
		  "error_file": "~/logs/err.log",
		  "out_file": "~/logs/out.log",
		  "log_file": "~/logs/combined.log",
		  "time": true,
		  "max_memory_restart": "10G",
		  "watch": false,
		  "merge_logs": true,
		  "autorestart": true,
		  "kill_timeout": 1600,
		  "source_map_support": true
		}
	]
};
