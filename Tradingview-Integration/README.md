# tradingview-integration

TradingView data integration layer for TradeOps. Connects to a locally running TradingView Desktop instance via [tradingview-mcp](https://github.com/tradesdontlie/tradingview-mcp) and exposes chart data to Claude Code and custom programs.

## Prerequisites

- [TradingView Desktop](https://www.tradingview.com/desktop/) with a paid subscription
- [Node.js 18+](https://nodejs.org/)
- `tradingview-mcp` cloned and `npm install` done
- Claude Code (for MCP option)

## Setup

### 1. Configure `.env`

Copy the values to match your local paths:

```env
TRADINGVIEW_MCP_PATH=C:/path/to/tradingview-mcp/src/server.js
TRADINGVIEW_CLI_PATH=C:/path/to/tradingview-mcp/src/cli/index.js
TRADINGVIEW_WINDOW_LAUNCH_BAT=C:/path/to/tradingview-mcp/scripts/launch_tv_debug.bat
```

### 2. Set environment variables

These vars must be available to Claude Code so `.mcp.json` can resolve `${TRADINGVIEW_MCP_PATH}`.

```powershell
# Set (persists to Windows user environment — restart Claude Code after)
.\scripts\set-tv-env.ps1

# Unset
.\scripts\unset-tv-env.ps1
```

### 3. Launch TradingView with CDP enabled

TradingView must run with `--remote-debugging-port=9222` for any integration to work.

```powershell
.\scripts\launch-tradingview.ps1
```

### 4. Stop TradingView

```powershell
.\scripts\stop-tradingview.ps1
```

---

## Consuming TradingView Data Programmatically

There are two ways to consume data from the MCP server in your own programs.

---

### Option A — CLI (any language, simplest)

Every MCP tool is also a `tv` CLI command that returns JSON. Shell out to it from any language.

**When to use:** one-off scripts, quick automation, any language other than Node.js.

```bash
# Run directly without npm link
node C:/path/to/tradingview-mcp/src/cli/index.js quote
node C:/path/to/tradingview-mcp/src/cli/index.js ohlcv --summary
node C:/path/to/tradingview-mcp/src/cli/index.js stream quote   # JSONL stream
```

**Python example:**

```python
import subprocess, json

CLI = "C:/Users/tanathip/Documents/Repository/tradingview-mcp/src/cli/index.js"

def tv(command, *args):
    result = subprocess.run(
        ["node", CLI, command, *args],
        capture_output=True, text=True
    )
    return json.loads(result.stdout)

quote = tv("quote")
print(quote["close"])          # current price

ohlcv = tv("ohlcv", "--summary")
print(ohlcv)
```

**Python streaming (real-time ticks):**

```python
import subprocess, json

proc = subprocess.Popen(
    ["node", CLI, "stream", "quote"],
    stdout=subprocess.PIPE, text=True
)
for line in proc.stdout:
    tick = json.loads(line)
    print(tick["close"])
```

---

### Option B — MCP Client SDK (Node.js, persistent connection)

Use the official `@modelcontextprotocol/sdk` to connect to the server the same way Claude Code does.
Keeps a single long-lived process — lower overhead than spawning a subprocess per call.

**When to use:** long-running apps, dashboards, pipelines that make frequent calls.

```bash
npm install @modelcontextprotocol/sdk
```

```js
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = "C:/Users/tanathip/Documents/Repository/tradingview-mcp/src/server.js";

const transport = new StdioClientTransport({
  command: "node",
  args: [SERVER]
});

const client = new Client({ name: "my-app", version: "1.0.0" });
await client.connect(transport);

// Call any tool by name — same names as the MCP tools in Claude Code
const result = await client.callTool({
  name: "quote_get",
  arguments: {}
});
console.log(JSON.parse(result.content[0].text));

// List all 78 available tools
const { tools } = await client.listTools();
console.log(tools.map(t => t.name));

await client.close();
```

---

### Option C — Via Claude Code (no code required)

The `.mcp.json` in this project registers the server with Claude Code automatically.
After running `set-tv-env.ps1` and restarting Claude Code, all 78 `tv_*` tools are available in chat.

```
"Use tv_health_check to verify connection"
"Get the current price with quote_get"
"Switch chart to BTCUSD on the 1H timeframe"
"Read my indicator values with data_get_study_values"
```

---

## Available CLI Commands

```
tv status / launch / state / symbol / timeframe / type / info / search
tv quote / ohlcv / values
tv data lines/labels/tables/boxes/strategy/trades/equity/depth/indicator
tv pine get/set/compile/analyze/check/save/new/open/list/errors/console
tv draw shape/list/get/remove/clear
tv alert list/create/delete
tv watchlist get/add
tv indicator add/remove/toggle/set/get
tv layout list/switch
tv pane list/layout/focus/symbol
tv tab list/new/close/switch
tv replay start/step/stop/status/autoplay/trade
tv stream quote/bars/values/lines/labels/tables/all
tv ui click/keyboard/hover/scroll/find/eval/type/panel/fullscreen/mouse
tv screenshot / discover / ui-state / range / scroll
```

Full tool reference: [tradingview-mcp README](https://github.com/tradesdontlie/tradingview-mcp#tool-reference-78-mcp-tools)
