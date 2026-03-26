import { describe, expect, it } from "vitest";

import {
  buildTailscaleExplorerUrl,
  hasAnyTailscaleServeConfig,
  hasExplorerServeConfig,
  parseTailscaleDnsNameFromStatusJson,
  parseTailscaleServeStatusJson,
} from "../src/tailscale.js";

describe("parseTailscaleDnsNameFromStatusJson", () => {
  it("trims the trailing dot from Self.DNSName", () => {
    expect(
      parseTailscaleDnsNameFromStatusJson(JSON.stringify({ Self: { DNSName: "macbook-pro.tail66ad0b.ts.net." } })),
    ).toBe("macbook-pro.tail66ad0b.ts.net");
  });

  it("returns undefined for missing DNS names", () => {
    expect(parseTailscaleDnsNameFromStatusJson(JSON.stringify({ Self: {} }))).toBeUndefined();
  });
});

describe("buildTailscaleExplorerUrl", () => {
  it("builds the https URL from the device DNS name", () => {
    expect(buildTailscaleExplorerUrl("macbook-pro.tail66ad0b.ts.net.")).toBe("https://macbook-pro.tail66ad0b.ts.net");
  });
});

describe("Tailscale serve status helpers", () => {
  it("detects the default explorer reverse proxy", () => {
    const status = parseTailscaleServeStatusJson(
      JSON.stringify({
        Foreground: {
          session: {
            Web: {
              "macbook-pro.tail66ad0b.ts.net:443": {
                Handlers: {
                  "/": {
                    Proxy: "http://localhost:4321",
                  },
                },
              },
            },
          },
        },
      }),
    );

    expect(status).toBeDefined();
    expect(hasExplorerServeConfig(status!)).toBe(true);
    expect(hasAnyTailscaleServeConfig(status!)).toBe(true);
  });

  it("treats 127.0.0.1 and localhost as the same backend", () => {
    const status = parseTailscaleServeStatusJson(
      JSON.stringify({
        Background: {
          session: {
            Web: {
              "macbook-pro.tail66ad0b.ts.net:443": {
                Handlers: {
                  "/": {
                    Proxy: "http://127.0.0.1:4321/",
                  },
                },
              },
            },
          },
        },
      }),
    );

    expect(status).toBeDefined();
    expect(hasExplorerServeConfig(status!)).toBe(true);
  });

  it("does not treat unrelated serve configs as the explorer mapping", () => {
    const status = parseTailscaleServeStatusJson(
      JSON.stringify({
        Foreground: {
          session: {
            Web: {
              "macbook-pro.tail66ad0b.ts.net:443": {
                Handlers: {
                  "/notes": {
                    Proxy: "http://localhost:4321",
                  },
                  "/": {
                    Proxy: "http://localhost:3000",
                  },
                },
              },
            },
          },
        },
      }),
    );

    expect(status).toBeDefined();
    expect(hasExplorerServeConfig(status!)).toBe(false);
    expect(hasAnyTailscaleServeConfig(status!)).toBe(true);
  });

  it("returns undefined for invalid status JSON", () => {
    expect(parseTailscaleServeStatusJson("not json")).toBeUndefined();
  });
});
