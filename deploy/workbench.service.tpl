[Unit]
Description=Maodong Workbench (猫冬手帐)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/workbench
ExecStart=/usr/local/bin/node /opt/workbench/server/index.js
Environment=PORT=__PORT__
Environment=DATA_DIR=/opt/workbench/data
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
