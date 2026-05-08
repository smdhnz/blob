FROM oven/bun:latest

# Use PUID/PGID to match host user
ENV PUID=1000
ENV PGID=1000

WORKDIR /app

COPY package.json ./
RUN bun install

COPY . .

# Ensure data directory is writable by the user
RUN mkdir -p /app/data && chown -R bun:bun /app/data

USER bun

EXPOSE 8080

CMD ["bun", "run", "index.ts"]
