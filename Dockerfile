ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:latest
FROM ${BUILD_FROM}

# Install Node.js
RUN apk add --no-cache nodejs npm

# Copy server files
COPY server/ /opt/server/

# Set working directory
WORKDIR /opt/server

# Install dependencies
RUN npm install --production

# Copy run script
COPY run.sh /
RUN chmod a+x /run.sh

# Create data directory
RUN mkdir -p /data/ha-assistant

CMD [ "/run.sh" ]
