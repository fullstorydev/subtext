export interface SubtextConfig {
  apiKey: string;
  apiUrl?: string;
}

export interface ContentItem {
  type: string;
  text?: string;
  data?: string;
  mimeType?: string;
}

export interface ToolResult {
  content: ContentItem[];
  isError?: boolean;
}

export async function callTool(
  config: SubtextConfig,
  tool: string,
  params: Record<string, unknown>
): Promise<ToolResult> {
  const url = config.apiUrl ?? "https://api.fullstory.com/mcp/subtext";
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: crypto.randomUUID(),
      method: "tools/call",
      params: { name: tool, arguments: params },
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  }
  const body = await res.json() as any;
  if (body.error) {
    throw new Error(`MCP error ${body.error.code}: ${body.error.message}`);
  }
  return body.result as ToolResult;
}
