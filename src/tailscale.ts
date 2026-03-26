export const HERMIT_TAILSCALE_NOTICE_ENV = "HERMIT_TAILSCALE_NOTICE";
export const HERMIT_TAILSCALE_URL_ENV = "HERMIT_TAILSCALE_URL";
export const TAILSCALE_EXPLORER_TARGET = "localhost:4321";
export const TAILSCALE_EXPLORER_PROXY_URL = "http://localhost:4321";

interface TailscaleStatusResponse {
  Self?: {
    DNSName?: unknown;
  };
}

interface TailscaleServeHandler {
  Proxy?: unknown;
}

interface TailscaleServeHost {
  Handlers?: Record<string, TailscaleServeHandler>;
}

interface TailscaleServeSession {
  Web?: Record<string, TailscaleServeHost>;
}

export interface TailscaleServeStatusResponse {
  Foreground?: Record<string, TailscaleServeSession>;
  Background?: Record<string, TailscaleServeSession>;
}

export function trimTrailingDot(value: string): string {
  return value.endsWith(".") ? value.slice(0, -1) : value;
}

export function buildTailscaleExplorerUrl(dnsName: string): string {
  return `https://${trimTrailingDot(dnsName.trim())}`;
}

export function parseTailscaleDnsNameFromStatusJson(text: string): string | undefined {
  try {
    const parsed = JSON.parse(text) as TailscaleStatusResponse;
    const dnsName = typeof parsed.Self?.DNSName === "string" ? trimTrailingDot(parsed.Self.DNSName.trim()) : "";
    return dnsName || undefined;
  } catch {
    return undefined;
  }
}

export function parseTailscaleServeStatusJson(text: string): TailscaleServeStatusResponse | undefined {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    return parsed as TailscaleServeStatusResponse;
  } catch {
    return undefined;
  }
}

function normalizeServeProxyTarget(target: string): string {
  const trimmed = target.trim();
  if (!trimmed) {
    return "";
  }

  const withProtocol = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const url = new URL(withProtocol);
    const protocol = url.protocol === "https:" ? "https://" : "http://";
    const host = url.hostname === "127.0.0.1" ? "localhost" : url.hostname;
    const port = url.port || (protocol === "https://" ? "443" : "80");
    const pathname = url.pathname === "/" ? "" : url.pathname.replace(/\/+$/, "");
    return `${protocol}${host}:${port}${pathname}`;
  } catch {
    return withProtocol.replace(/\/+$/, "");
  }
}

function* iterateServeSessions(status: TailscaleServeStatusResponse): Iterable<TailscaleServeSession> {
  for (const section of [status.Foreground, status.Background]) {
    for (const session of Object.values(section ?? {})) {
      yield session;
    }
  }
}

export function hasAnyTailscaleServeConfig(status: TailscaleServeStatusResponse): boolean {
  return Object.keys(status.Foreground ?? {}).length > 0 || Object.keys(status.Background ?? {}).length > 0;
}

export function hasExplorerServeConfig(
  status: TailscaleServeStatusResponse,
  target = TAILSCALE_EXPLORER_PROXY_URL,
): boolean {
  const normalizedTarget = normalizeServeProxyTarget(target);
  if (!normalizedTarget) {
    return false;
  }

  for (const session of iterateServeSessions(status)) {
    for (const [hostAndPort, hostConfig] of Object.entries(session.Web ?? {})) {
      if (!hostAndPort.endsWith(":443")) {
        continue;
      }

      const proxy = hostConfig.Handlers?.["/"]?.Proxy;
      if (typeof proxy !== "string") {
        continue;
      }

      if (normalizeServeProxyTarget(proxy) === normalizedTarget) {
        return true;
      }
    }
  }

  return false;
}

export function readHermitTailscaleNotice(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const notice = env[HERMIT_TAILSCALE_NOTICE_ENV]?.trim();
  return notice || undefined;
}

export function readHermitTailscaleUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = env[HERMIT_TAILSCALE_URL_ENV]?.trim();
  return url || undefined;
}
