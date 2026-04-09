import { callTool, SubtextConfig, ToolResult } from "./transport.js";
import { createHooks, Hooks } from "./hooks.js";

export interface SubtextClientConfig extends SubtextConfig {
  hooks?: boolean;
}

export class SubtextClient {
  private config: SubtextConfig;
  private hooks: Hooks;

  constructor(config: SubtextClientConfig) {
    this.config = config;
    this.hooks = createHooks({
      enabled: config.hooks !== false && process.env.SUBTEXT_NO_HOOKS !== "1",
    });
  }

  // Browser control
  async connect(url: string): Promise<ToolResult> {
    const result = await callTool(this.config, "live-connect", { url });

    // Extract text content and parse connection_id for hooks
    const textContent = result.content
      .filter((item) => item.type === "text" && item.text)
      .map((item) => item.text!)
      .join("\n");
    const connectionIdMatch = textContent.match(/connection_id:\s*(\S+)/);
    const connectionId = connectionIdMatch ? connectionIdMatch[1] : "";

    // Run hook as side-effect (don't await — fire and forget)
    this.hooks
      .runPostConnect({ connectionId, url, responseText: textContent })
      .catch(() => {});

    return result;
  }

  async disconnect(connectionId: string): Promise<ToolResult> {
    return callTool(this.config, "live-disconnect", { connection_id: connectionId });
  }

  async snapshot(connectionId: string, viewId?: string): Promise<ToolResult> {
    const params: Record<string, unknown> = { connection_id: connectionId };
    if (viewId) params.view_id = viewId;
    return callTool(this.config, "live-view-snapshot", params);
  }

  async screenshot(connectionId: string, viewId?: string): Promise<ToolResult> {
    const params: Record<string, unknown> = { connection_id: connectionId };
    if (viewId) params.view_id = viewId;
    return callTool(this.config, "live-view-screenshot", params);
  }

  async navigate(connectionId: string, url: string): Promise<ToolResult> {
    return callTool(this.config, "live-view-navigate", { connection_id: connectionId, url });
  }

  async newTab(connectionId: string, url?: string): Promise<ToolResult> {
    const params: Record<string, unknown> = { connection_id: connectionId };
    if (url) params.url = url;
    return callTool(this.config, "live-view-new", params);
  }

  async closeTab(connectionId: string, viewId: string): Promise<ToolResult> {
    return callTool(this.config, "live-view-close", { connection_id: connectionId, view_id: viewId });
  }

  async tabs(connectionId: string): Promise<ToolResult> {
    return callTool(this.config, "live-view-list", { connection_id: connectionId });
  }

  async emulate(connectionId: string, preset: string): Promise<ToolResult> {
    return callTool(this.config, "live-emulate", { connection_id: connectionId, preset });
  }

  async resize(connectionId: string, width: number, height: number): Promise<ToolResult> {
    return callTool(this.config, "live-view-resize", { connection_id: connectionId, width, height });
  }

  // Interactions
  async click(connectionId: string, componentId: string): Promise<ToolResult> {
    return callTool(this.config, "live-act-click", { connection_id: connectionId, component_id: componentId });
  }

  async fill(connectionId: string, componentId: string, value: string): Promise<ToolResult> {
    return callTool(this.config, "live-act-fill", { connection_id: connectionId, component_id: componentId, value });
  }

  async hover(connectionId: string, componentId: string): Promise<ToolResult> {
    return callTool(this.config, "live-act-hover", { connection_id: connectionId, component_id: componentId });
  }

  async keypress(connectionId: string, key: string, componentId?: string): Promise<ToolResult> {
    const params: Record<string, unknown> = { connection_id: connectionId, key };
    if (componentId) params.component_id = componentId;
    return callTool(this.config, "live-act-keypress", params);
  }

  async drag(connectionId: string, componentId: string, dx: number, dy: number): Promise<ToolResult> {
    return callTool(this.config, "live-act-drag", { connection_id: connectionId, component_id: componentId, dx, dy });
  }

  async waitFor(connectionId: string, type: string, value: string): Promise<ToolResult> {
    return callTool(this.config, "live-act-wait-for", { connection_id: connectionId, type, value });
  }

  // Observation
  async eval(connectionId: string, expression: string): Promise<ToolResult> {
    return callTool(this.config, "live-eval-script", { connection_id: connectionId, expression });
  }

  async logs(connectionId: string, level?: string, limit?: number): Promise<ToolResult> {
    const params: Record<string, unknown> = { connection_id: connectionId };
    if (level) params.level = level;
    if (limit !== undefined) params.limit = limit;
    return callTool(this.config, "live-log-list", params);
  }

  async network(connectionId: string, pattern?: string, limit?: number): Promise<ToolResult> {
    const params: Record<string, unknown> = { connection_id: connectionId };
    if (pattern) params.pattern = pattern;
    if (limit !== undefined) params.limit = limit;
    return callTool(this.config, "live-net-list", params);
  }

  // Interactions (additional)
  async dialog(connectionId: string, action: string, text?: string): Promise<ToolResult> {
    const params: Record<string, unknown> = { connection_id: connectionId, action };
    if (text !== undefined) params.text = text;
    return callTool(this.config, "live-act-dialog", params);
  }

  async upload(connectionId: string, componentId: string, filePath: string): Promise<ToolResult> {
    return callTool(this.config, "live-act-upload", { connection_id: connectionId, component_id: componentId, file_path: filePath });
  }

  // Review
  async reviewOpen(sessionUrl: string): Promise<ToolResult> {
    return callTool(this.config, "review-open", { session_url: sessionUrl });
  }

  async reviewView(clientId: string, pageId: string, timestamp: number, upload?: boolean): Promise<ToolResult> {
    return callTool(this.config, "review-view", {
      client_id: clientId,
      page_id: pageId,
      timestamp,
      upload: upload ?? false,
    });
  }

  async reviewDiff(clientId: string, pageId: string, fromTs: number, toTs: number): Promise<ToolResult> {
    return callTool(this.config, "review-diff", {
      client_id: clientId,
      page_id: pageId,
      from_ts: fromTs,
      to_ts: toTs,
    });
  }

  async reviewClose(clientId: string, useCase: string, wasHelpful: boolean): Promise<ToolResult> {
    return callTool(this.config, "review-close", {
      client_id: clientId,
      use_case: useCase,
      was_helpful: wasHelpful,
    });
  }

  // Comments
  async commentList(sessionId: string): Promise<ToolResult> {
    return callTool(this.config, "comment-list", { session_id: sessionId });
  }

  async commentAdd(sessionId: string, text: string, intent?: string, screenshotUrl?: string): Promise<ToolResult> {
    const params: Record<string, unknown> = { session_id: sessionId, text };
    if (intent) params.intent = intent;
    if (screenshotUrl) params.screenshot_url = screenshotUrl;
    return callTool(this.config, "comment-add", params);
  }

  async commentReply(sessionId: string, commentId: string, text: string): Promise<ToolResult> {
    return callTool(this.config, "comment-reply", { session_id: sessionId, comment_id: commentId, text });
  }

  async commentResolve(sessionId: string, commentId: string): Promise<ToolResult> {
    return callTool(this.config, "comment-resolve", { session_id: sessionId, comment_id: commentId });
  }

  // Raw escape hatch
  async raw(tool: string, params: Record<string, unknown>): Promise<ToolResult> {
    return callTool(this.config, tool, params);
  }

}
