#!/bin/sh
# Reads FULLSTORY_API_KEY from the environment and returns it as an Authorization header.
# Used by Claude Code's headersHelper to authenticate HTTP MCP servers without OAuth.
echo "{\"Authorization\": \"Basic ${FULLSTORY_API_KEY}\"}"
