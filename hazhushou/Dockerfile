ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# Install Node.js
RUN apk add --no-cache nodejs npm

# Copy server files
COPY server/ /opt/server/

WORKDIR /opt/server

# Install dependencies
RUN npm install --production

# Create data directory
RUN mkdir -p /data/ha-assistant

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
