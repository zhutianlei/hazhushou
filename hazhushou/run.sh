#!/command/with-contenv bashio
# shellcheck shell=bash

# Read options from Supervisor
CONFIG_PATH=/data/options.json

# Get HA configuration
HA_BASE_URL=$(bashio::config 'ha_base_url')
HA_USERNAME=$(bashio::config 'ha_username')
HA_PASSWORD=$(bashio::config 'ha_password')
PORT=$(bashio::config 'port')

mkdir -p /data/ha-assistant
cat > /data/ha-assistant/config.json << EOF
{
  "ha_base_url": "${HA_BASE_URL}",
  "ha_username": "${HA_USERNAME}",
  "ha_password": "${HA_PASSWORD}",
  "port": ${PORT},
  "password_hash": "",
  "password_salt": ""
}
EOF

# Create empty data files if they don't exist
if [ ! -f /data/ha-assistant/whitelist.json ]; then
  echo "[]" > /data/ha-assistant/whitelist.json
fi

if [ ! -f /data/ha-assistant/audit.json ]; then
  echo "[]" > /data/ha-assistant/audit.json
fi

# Start the server
cd /opt/server
exec node server.js
