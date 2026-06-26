#!/command/with-contenv bashio
# shellcheck shell=bash

# Read options from Supervisor
CONFIG_PATH=/data/options.json

# Get HA configuration
HA_BASE_URL=$(bashio::config 'ha_base_url')
HA_USERNAME=$(bashio::config 'ha_username')
HA_PASSWORD=$(bashio::config 'ha_password')
TOKEN_AUTO_REFRESH=$(bashio::config 'token_auto_refresh')
TOKEN_REFRESH_HOUR=$(bashio::config 'token_refresh_hour')

mkdir -p /data/ha-assistant
cat > /data/ha-assistant/config.json << EOF
{
  "ha_base_url": "${HA_BASE_URL}",
  "ha_username": "${HA_USERNAME}",
  "ha_password": "${HA_PASSWORD}",
  "token_auto_refresh": ${TOKEN_AUTO_REFRESH},
  "token_refresh_hour": ${TOKEN_REFRESH_HOUR},
  "port": 8099,
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
