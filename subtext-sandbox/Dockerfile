FROM node:22-bookworm

# Avoid interactive prompts
ENV DEBIAN_FRONTEND=noninteractive

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code

# Copy scripts
COPY mcp-auth-helper.sh /usr/local/bin/mcp-auth-helper.sh
COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/mcp-auth-helper.sh /usr/local/bin/entrypoint.sh

# Install curl (health check) and git (clone subtext in prod mode)
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*

# Copy demo store source (exclude node_modules — native bindings are platform-specific)
COPY demo-store /workspace

WORKDIR /workspace

# Install dependencies inside the container so native bindings match Linux
RUN rm -rf node_modules package-lock.json && npm install

# Initialize git (Claude Code expects a repo)
RUN git init && \
    git config user.email "test@test.com" && \
    git config user.name "Test User" && \
    git add . && \
    git commit -m "init: vite react-ts demo store"

# Write a workspace .mcp.json that uses the auth helper for static API key auth.
# This overrides the plugin's default OAuth-based HTTP MCP config.
RUN echo '{ \
  "mcpServers": { \
    "subtext": { \
      "type": "http", \
      "url": "https://api.fullstory.com/mcp/subtext", \
      "headersHelper": "/usr/local/bin/mcp-auth-helper.sh" \
    }, \
    "subtext-eu1": { \
      "type": "http", \
      "url": "https://api.eu1.fullstory.com/mcp/subtext", \
      "headersHelper": "/usr/local/bin/mcp-auth-helper.sh" \
    }, \
    "subtext-tunnel": { \
      "command": "npx", \
      "args": ["-y", "@fullstory/subtext-tunnel"] \
    } \
  } \
}' > /workspace/.mcp.json

# Entrypoint starts the dev server, then launches Claude
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
