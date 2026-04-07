# Subtext by Fullstory

[Subtext](https://subtext.fullstory.com/) agent plugin.

See the [install guide](https://subtext.fullstory.com/install/) for installation and usage.

## CLI

Subtext is also available as a standalone CLI for use outside of AI agents.

### Bash CLI

A single-file bash script wrapping all MCP tools. Requires bash, curl, and python3.

```bash
# Install
cp tools/subtext-cli.sh /usr/local/bin/subtext
chmod +x /usr/local/bin/subtext

# Usage
export SECRET_SUBTEXT_API_KEY='your-api-key'
subtext connect https://example.com
subtext click <conn_id> 95
subtext disconnect <conn_id>
```

### Node.js CLI / SDK

A publishable npm package with both a CLI and a programmatic SDK.

```bash
# Install globally
npm install -g @fullstory/subtext

# CLI usage
export SECRET_SUBTEXT_API_KEY='your-api-key'
subtext connect https://example.com

# SDK usage
import { SubtextClient } from "@fullstory/subtext";

const client = new SubtextClient({ apiKey: process.env.SECRET_SUBTEXT_API_KEY });
const result = await client.connect("https://example.com");
```

Run `subtext --help` for the full command reference.
