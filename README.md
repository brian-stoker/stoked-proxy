# Stoked Proxy

A CLI-capable HTTP/HTTPS reverse proxy with request/response monitoring capabilities. This package provides the same functionality as the built-in proxy from the vscode-extension, but as a standalone npm package.

## Features

- **HTTP/HTTPS Reverse Proxy**: Forward incoming requests to backend services
- **CLI Interface**: Easy-to-use command line interface
- **Request/Response Monitoring**: Capture and monitor all proxy traffic
- **Real-time WebSocket Streaming**: Live data broadcasting to connected clients
- **Health Check Endpoint**: Built-in health check at `/_proxy/health`
- **Multiple Proxy Support**: Run multiple proxy instances with unique identifiers
- **Programmatic API**: Use as a library in your Node.js applications
- **HTTPS Tunneling**: Support for HTTPS CONNECT method via SSL tunneling
- **Content Encoding Support**: Automatic decompression of gzip, deflate, and brotli responses

## Installation

```bash
npm install stoked-proxy
# or
pnpm install stoked-proxy
```

## CLI Usage

### Start a proxy

```bash
# Basic usage
stoked-proxy start --listen-port 8080 --relay-port 3000

# With custom identifier and verbose logging
stoked-proxy start -l 8080 -r 3000 -i my-proxy -v
```

### Stop a proxy

```bash
stoked-proxy stop --identifier my-proxy
```

### List active proxies

```bash
stoked-proxy list
```

### Test proxy connection

```bash
stoked-proxy test --port 8080
```

### CLI Options

#### `start` command:
- `-l, --listen-port <port>`: Port to listen on for incoming requests (required)
- `-r, --relay-port <port>`: Port to forward requests to (required)
- `-i, --identifier <id>`: Unique identifier for this proxy instance (default: "default")
- `-v, --verbose`: Enable verbose logging

#### `stop` command:
- `-i, --identifier <id>`: Identifier of the proxy to stop (required)

#### `test` command:
- `-p, --port <port>`: Port to test (required)

## Programmatic Usage

### Basic Example

```javascript
const { ProxyManager } = require('stoked-proxy');

const proxyManager = new ProxyManager();

async function startProxy() {
    try {
        await proxyManager.startProxy('8080', '3000', 'my-api-proxy');
        console.log('Proxy started successfully!');
    } catch (error) {
        console.error('Failed to start proxy:', error);
    }
}

startProxy();
```

### With Request/Response Monitoring

```javascript
const { ProxyManager } = require('stoked-proxy');

const proxyManager = new ProxyManager();

// Set up request monitoring
proxyManager.onRequestData((data) => {
    console.log(`[REQUEST] ${data.method} ${data.url}`, {
        headers: data.headers,
        bodyLength: data.body.length,
        timestamp: data.timestamp
    });
});

// Set up response monitoring
proxyManager.onResponseData((data) => {
    console.log(`[RESPONSE] ${data.statusCode} ${data.statusMessage}`, {
        headers: data.headers,
        bodyLength: data.body.length,
        duration: `${data.duration}ms`,
        timestamp: data.timestamp
    });
});

await proxyManager.startProxy('8080', '3000', 'monitored-proxy');
```

### Real-time WebSocket Streaming

The proxy manager includes a built-in WebSocket server for real-time monitoring of proxy traffic:

```javascript
const { ProxyManager } = require('stoked-proxy');

const proxyManager = new ProxyManager();

// Start WebSocket server (returns the assigned port)
const wsPort = await proxyManager.startWebSocketServer(8090);
console.log(`WebSocket server running on port ${wsPort}`);

// Start a proxy
await proxyManager.startProxy('8080', '3000', 'api-proxy');

// WebSocket clients can now connect to ws://localhost:8090
// They will receive real-time messages with request/response data:
// {
//   "type": "request" | "response",
//   "data": { ... request or response data ... },
//   "timestamp": "2025-07-31T21:10:34.469Z"
// }

// Stop WebSocket server when done
await proxyManager.stopWebSocketServer();
```

### Managing Multiple Proxies

```javascript
const { ProxyManager } = require('stoked-proxy');

const proxyManager = new ProxyManager();

// Start multiple proxies
await proxyManager.startProxy('8080', '3000', 'api-proxy');
await proxyManager.startProxy('8081', '3001', 'web-proxy');

// List active proxies
console.log('Active proxies:', proxyManager.getActiveProxies());

// Stop specific proxy
await proxyManager.stopProxy('api-proxy');

// Stop all proxies
await proxyManager.stopAllProxies();
```

## API Reference

### ProxyManager

#### Methods

- `startProxy(listenPort: string, relayPort: string, identifier: string): Promise<void>`
  - Starts a reverse proxy server
  - `listenPort`: Port to listen on for incoming requests
  - `relayPort`: Port to forward requests to
  - `identifier`: Unique identifier for this proxy instance

- `stopProxy(identifier: string): Promise<void>`
  - Stops a specific proxy server
  - `identifier`: Identifier of the proxy to stop

- `stopAllProxies(): Promise<void>`
  - Stops all active proxy servers

- `getActiveProxies(): string[]`
  - Returns array of active proxy identifiers

- `onRequestData(callback: (data: ProxyRequestData) => void): void`
  - Sets callback for request data capture
  - `callback`: Function to handle captured request data

- `onResponseData(callback: (data: ProxyResponseData) => void): void`
  - Sets callback for response data capture
  - `callback`: Function to handle captured response data

- `startWebSocketServer(port?: number): Promise<number>`
  - Starts a WebSocket server for real-time data streaming
  - `port`: Optional port number (defaults to random port between 8080-8179)
  - Returns the actual port number used

- `stopWebSocketServer(): Promise<void>`
  - Stops the WebSocket server

- `getWebSocketPort(): number | undefined`
  - Returns the current WebSocket server port, or undefined if not running

#### Types

```typescript
interface ProxyRequestData {
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: string;
    timestamp: Date;
    remoteAddress?: string;
}

interface ProxyResponseData {
    statusCode: number;
    statusMessage: string;
    headers: http.OutgoingHttpHeaders;
    body: string;
    timestamp: Date;
    duration: number;
    requestData: ProxyRequestData;
}
```

## Health Check

All proxy instances automatically expose a health check endpoint at `/_proxy/health` that returns:

```json
{
  "status": "ok",
  "proxy": "active",
  "relayPort": "3000",
  "webSocketPort": 8090,
  "timestamp": "2025-07-31T21:10:34.469Z"
}
```

## Integration with VSCode Extension

To use this package in place of the built-in proxy functionality in your VSCode extension:

1. Install the package:
   ```bash
   pnpm add stoked-proxy
   ```

2. Replace the existing ProxyManager import:
   ```typescript
   // Before
   import { ProxyManager } from './ProxyManager';
   
   // After
   import { ProxyManager } from 'stoked-proxy';
   ```

3. The API is identical, so no other changes are needed!

## How It Works

### Core Architecture

The `ProxyManager` class in `src/ProxyManager.ts` is the main component that orchestrates all proxy functionality:

- **HTTP Server**: Creates HTTP servers that listen on specified ports
- **Request Forwarding**: Intercepts incoming requests and forwards them to target backend services
- **Data Capture**: Captures both request and response data for monitoring purposes
- **WebSocket Broadcasting**: Streams captured data in real-time to connected WebSocket clients

### Request Flow

1. **Incoming Request**: Client sends HTTP/HTTPS request to proxy server
2. **Data Capture**: Proxy captures request headers, body, and metadata
3. **Request Forwarding**: Proxy forwards request to the target backend service
4. **Response Capture**: Proxy captures response data, handling various content encodings
5. **Response Forwarding**: Proxy streams response back to the original client
6. **Broadcasting**: Request/response data is broadcast to WebSocket clients and callback handlers

### WebSocket System

The WebSocket system provides real-time monitoring capabilities:

- **Server Creation**: WebSocket server runs on a separate port from the proxy
- **Client Connections**: Multiple clients can connect to receive live data
- **Message Format**: All messages follow a consistent JSON structure with type, data, and timestamp
- **Automatic Broadcasting**: Every request/response automatically triggers WebSocket broadcasts

### HTTPS Tunneling

For HTTPS requests, the proxy supports the HTTP CONNECT method:

- **CONNECT Handling**: Intercepts CONNECT requests for SSL tunneling
- **Socket Bridging**: Creates direct socket connections between client and target server
- **Transparent Tunneling**: Passes encrypted data through without decryption

### Content Encoding Support

The proxy automatically handles various response compression formats:

- **Gzip Decompression**: Automatically decompresses gzip-encoded responses
- **Deflate Support**: Handles deflate compression
- **Brotli Decompression**: Supports modern brotli compression
- **Fallback Handling**: Uses base64 encoding for unrecognized formats

### Error Handling

Robust error handling throughout the proxy chain:

- **Connection Errors**: Proper 502 Bad Gateway responses for backend connection failures
- **Timeout Handling**: 30-second timeout with 504 Gateway Timeout responses
- **Stream Errors**: Graceful handling of interrupted request/response streams
- **Socket Errors**: Proper cleanup of failed socket connections

## Development

### Building

```bash
npm run build
```

### Testing

```bash
node test-proxy.js
```

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.