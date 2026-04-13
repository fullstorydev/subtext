/**
 * URL state management utilities for preserving parameters across navigation
 * and managing app-specific base paths.
 *
 * Features:
 * - Preserves query parameters (like instance, scenario) across navigation
 * - Handles app-specific base paths for proper URL routing
 * - Works correctly whether apps are served from root or subdirectories
 */

export class UrlState {
  // Parameters that should be preserved across navigation
  private static preservedParams = ["instance", "scenario"];

  // Cache for base path detection
  private static _basePath: string | null = null;

  /**
   * Get currently preserved parameters from URL
   */
  static getPreservedParams(): URLSearchParams {
    const current = new URLSearchParams(window.location.search);
    const preserved = new URLSearchParams();

    for (const param of this.preservedParams) {
      const value = current.get(param);
      if (value) {
        preserved.set(param, value);
      }
    }

    return preserved;
  }

  /**
   * Get the base path for the current app
   * Detects the app's base directory from the current URL
   */
  static getBasePath(): string {
    if (this._basePath !== null) {
      return this._basePath;
    }

    const path = window.location.pathname;

    // Look for /apps/[appname]/ pattern
    const appsMatch = path.match(/^\/apps\/[^/]+\//);
    if (appsMatch) {
      this._basePath = appsMatch[0];
      return this._basePath;
    }

    // Default to root
    this._basePath = "/";
    return this._basePath;
  }

  /**
   * Convert an absolute path to app-relative path
   */
  static toAppRelativePath(absolutePath: string): string {
    const basePath = this.getBasePath();
    if (basePath === "/") {
      return absolutePath;
    }

    if (absolutePath.startsWith(basePath)) {
      return absolutePath.slice(basePath.length - 1);
    }

    return absolutePath;
  }

  /**
   * Create a full URL with the app's base path
   */
  static createAppUrl(relativePath: string): string {
    const basePath = this.getBasePath();

    // Ensure relative path starts with /
    if (!relativePath.startsWith("/")) {
      relativePath = "/" + relativePath;
    }

    if (basePath === "/") {
      return relativePath;
    }

    // Remove trailing slash from base path and combine
    return basePath.slice(0, -1) + relativePath;
  }

  /**
   * Navigate to a URL while preserving parameters
   * Handles both absolute and app-relative paths
   */
  static navigate(
    url: string,
    additionalParams?: Record<string, string>,
  ): void {
    // Convert relative URLs to app-specific URLs
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = this.createAppUrl(url);
    }

    const targetUrl = new URL(url, window.location.origin);
    const preserved = this.getPreservedParams();

    // Add preserved params
    preserved.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });

    // Add any additional params
    if (additionalParams) {
      Object.entries(additionalParams).forEach(([key, value]) => {
        targetUrl.searchParams.set(key, value);
      });
    }

    window.location.href = targetUrl.toString();
  }

  /**
   * Push state while preserving parameters and handling app base paths
   */
  static pushState(data: any, title: string, url: string): void {
    // Convert relative URLs to app-specific URLs
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = this.createAppUrl(url);
    }

    const targetUrl = new URL(url, window.location.origin);
    const preserved = this.getPreservedParams();

    preserved.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });

    history.pushState(data, title, targetUrl.toString());
  }

  /**
   * Replace state while preserving parameters and handling app base paths
   */
  static replaceState(data: any, title: string, url: string): void {
    // Convert relative URLs to app-specific URLs
    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      url = this.createAppUrl(url);
    }

    const targetUrl = new URL(url, window.location.origin);
    const preserved = this.getPreservedParams();

    preserved.forEach((value, key) => {
      targetUrl.searchParams.set(key, value);
    });

    history.replaceState(data, title, targetUrl.toString());
  }

  /**
   * Create a properly formatted href with preserved parameters and base path
   */
  static createHref(url: string): string {
    // Handle absolute URLs
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }

    // Handle hash-only URLs
    if (url.startsWith("#")) {
      return url;
    }

    // Handle relative URLs with app base path
    try {
      // Convert to app-specific URL
      const appUrl = this.createAppUrl(url);
      const targetUrl = new URL(appUrl, window.location.origin);
      const preserved = this.getPreservedParams();

      preserved.forEach((value, key) => {
        targetUrl.searchParams.set(key, value);
      });

      return targetUrl.pathname + targetUrl.search + targetUrl.hash;
    } catch (e) {
      console.error("Failed to create href", e);
      return url;
    }
  }

  /**
   * Patch all anchor tags in a container to preserve parameters
   */
  static patchLinks(container: HTMLElement | ShadowRoot): void {
    container.querySelectorAll("a[href]").forEach((link) => {
      const anchor = link as HTMLAnchorElement;
      const href = anchor.getAttribute("href");

      if (!href) return;

      // Skip external links, hash links, and javascript: links
      if (
        href.startsWith("http://") ||
        href.startsWith("https://") ||
        href.startsWith("#") ||
        href.startsWith("javascript:") ||
        href.startsWith("mailto:")
      ) {
        return;
      }

      anchor.href = this.createHref(href);
    });
  }

  /**
   * Get a specific parameter value
   */
  static getParam(name: string): string | null {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  /**
   * Set a parameter and update URL without navigation
   */
  static setParam(name: string, value: string): void {
    const url = new URL(window.location.href);
    url.searchParams.set(name, value);
    history.replaceState(null, "", url.toString());
  }

  /**
   * Remove a parameter and update URL without navigation
   */
  static removeParam(name: string): void {
    const url = new URL(window.location.href);
    url.searchParams.delete(name);
    history.replaceState(null, "", url.toString());
  }

  /**
   * Check if we're in an isolated instance (not default)
   */
  static isIsolatedInstance(): boolean {
    const instance = this.getParam("instance");
    return instance !== null && instance !== "default";
  }

  /**
   * Create a click handler that preserves parameters
   */
  static createClickHandler(url: string): (e: Event) => void {
    return (e: Event) => {
      e.preventDefault();
      this.navigate(url);
    };
  }

  /**
   * Get the current page path relative to the app base
   */
  static getCurrentAppPath(): string {
    return this.toAppRelativePath(window.location.pathname);
  }

  /**
   * Parse a path to extract the app-relative portion
   * Useful for routing logic
   */
  static parseAppPath(fullPath: string): string {
    const basePath = this.getBasePath();
    if (basePath === "/") {
      return fullPath;
    }

    if (fullPath.startsWith(basePath)) {
      // Return path relative to base, keeping leading slash
      return "/" + fullPath.slice(basePath.length);
    }

    return fullPath;
  }
}
