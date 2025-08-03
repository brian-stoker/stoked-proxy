import * as http from 'http';
import * as https from 'https';
import * as net from 'net';
import * as url from 'url';
import { Duplex } from 'stream';
import * as WebSocket from 'ws';

/**
 * Manages built-in HTTP/HTTPS reverse proxy functionality
 * Captures request and response data for monitoring
 * Includes WebSocket server for real-time data streaming
 */
export class ProxyManager {
    private activeProxies: Map<string, http.Server> = new Map();
    private webSocketServers: Map<string, WebSocket.Server> = new Map();
    private onRequestDataCallback?: (data: ProxyRequestData) => void;
    private onResponseDataCallback?: (data: ProxyResponseData) => void;
    private webSocketPort?: number;

    /**
     * Starts a reverse proxy server
     * @param listenPort Port to listen on for incoming requests
     * @param relayPort Port to forward requests to
     * @param identifier Unique identifier for this proxy instance
     */
    async startProxy(listenPort: string, relayPort: string, identifier: string): Promise<void> {
        // Stop existing proxy with same identifier
        await this.stopProxy(identifier);

        const server = http.createServer((req, res) => {
            this.handleProxyRequest(req, res, relayPort);
        });

        // Handle CONNECT method for HTTPS tunneling
        server.on('connect', (req, clientSocket, head) => {
            this.handleConnect(req, clientSocket, head, relayPort);
        });

        return new Promise((resolve, reject) => {
            server.listen(parseInt(listenPort), 'localhost', () => {
                console.log(`[ProxyManager] ✅ Proxy started successfully: ${identifier} listening on port ${listenPort}, forwarding to ${relayPort}`);
                this.activeProxies.set(identifier, server);
                resolve();
            });

            server.on('error', (error) => {
                console.error(`[ProxyManager] ❌ Failed to start proxy ${identifier}:`, error);
                reject(error);
            });
        });
    }

    /**
     * Stops a proxy server
     */
    async stopProxy(identifier: string): Promise<void> {
        const server = this.activeProxies.get(identifier);
        if (server) {
            return new Promise((resolve) => {
                server.close(() => {
                    console.log(`Proxy stopped: ${identifier}`);
                    this.activeProxies.delete(identifier);
                    resolve();
                });
            });
        }
    }

    /**
     * Stops all active proxies
     */
    async stopAllProxies(): Promise<void> {
        const stopPromises = Array.from(this.activeProxies.keys()).map(id => this.stopProxy(id));
        await Promise.all(stopPromises);
    }

    /**
     * Sets callback for request data capture
     */
    onRequestData(callback: (data: ProxyRequestData) => void): void {
        this.onRequestDataCallback = callback;
    }

    /**
     * Sets callback for response data capture
     */
    onResponseData(callback: (data: ProxyResponseData) => void): void {
        this.onResponseDataCallback = callback;
    }

    /**
     * Gets list of active proxy identifiers
     */
    getActiveProxies(): string[] {
        return Array.from(this.activeProxies.keys());
    }

    /**
     * Starts WebSocket server for real-time data streaming
     * @param port Port to listen on for WebSocket connections
     */
    async startWebSocketServer(port?: number): Promise<number> {
        const wsPort = port || 8080 + Math.floor(Math.random() * 100);
        
        const wss = new WebSocket.Server({ 
            port: wsPort,
            host: 'localhost'
        });

        wss.on('connection', (ws) => {
            console.log(`[ProxyManager] WebSocket client connected on port ${wsPort}`);
            
            ws.on('close', () => {
                console.log(`[ProxyManager] WebSocket client disconnected`);
            });

            ws.on('error', (error) => {
                console.error(`[ProxyManager] WebSocket error:`, error);
            });
        });

        wss.on('error', (error) => {
            console.error(`[ProxyManager] WebSocket server error:`, error);
            throw error;
        });

        this.webSocketServers.set('main', wss);
        this.webSocketPort = wsPort;
        
        console.log(`[ProxyManager] ✅ WebSocket server started on port ${wsPort}`);
        return wsPort;
    }

    /**
     * Stops WebSocket server
     */
    async stopWebSocketServer(): Promise<void> {
        const wss = this.webSocketServers.get('main');
        if (wss) {
            return new Promise((resolve) => {
                wss.close(() => {
                    console.log(`[ProxyManager] WebSocket server stopped`);
                    this.webSocketServers.delete('main');
                    this.webSocketPort = undefined;
                    resolve();
                });
            });
        }
    }

    /**
     * Broadcasts data to all connected WebSocket clients
     */
    private broadcastToWebSockets(type: 'request' | 'response', data: any): void {
        const wss = this.webSocketServers.get('main');
        if (wss) {
            const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
            
            wss.clients.forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(message);
                }
            });
        }
    }

    /**
     * Gets WebSocket server port
     */
    getWebSocketPort(): number | undefined {
        return this.webSocketPort;
    }

    private handleProxyRequest(req: http.IncomingMessage, res: http.ServerResponse, relayPort: string): void {
        const startTime = Date.now();
        let requestBody = '';
        
        console.log(`[ProxyManager] Incoming ${req.method} request to ${req.url}`);
        
        // Special health check endpoint
        if (req.url === '/_proxy/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                proxy: 'active',
                relayPort: relayPort,
                webSocketPort: this.webSocketPort,
                timestamp: new Date().toISOString()
            }));
            return;
        }
        
        // Capture request body
        req.on('data', (chunk: Buffer) => {
            requestBody += chunk.toString();
        });

        req.on('end', () => {
            console.log(`[ProxyManager] Request body captured, length: ${requestBody.length}`);
            
            // Capture request data
            const requestData: ProxyRequestData = {
                method: req.method || 'GET',
                url: req.url || '/',
                headers: req.headers,
                body: requestBody,
                timestamp: new Date(),
                remoteAddress: req.socket.remoteAddress
            };

            if (this.onRequestDataCallback) {
                this.onRequestDataCallback(requestData);
            }

            // Broadcast request data to WebSocket clients
            this.broadcastToWebSockets('request', requestData);

            // Forward request to target server
            const options = {
                hostname: 'localhost',
                port: parseInt(relayPort),
                path: req.url,
                method: req.method,
                headers: { ...req.headers }
            };

            // Remove host header to avoid conflicts
            delete options.headers.host;

            console.log(`[ProxyManager] Forwarding request to localhost:${relayPort}${req.url}`);
            
            const proxyReq = http.request(options, (proxyRes) => {
                console.log(`[ProxyManager] Received response: ${proxyRes.statusCode} ${proxyRes.statusMessage}`);

                // Forward response headers and status immediately
                res.writeHead(proxyRes.statusCode || 500, proxyRes.statusMessage, proxyRes.headers);
                
                // Capture response body while piping data through
                let responseBodyChunks: Buffer[] = [];
                
                proxyRes.on('data', (chunk: Buffer) => {
                    // Capture raw chunks for monitoring (handle encoding properly)
                    responseBodyChunks.push(chunk);
                    // Forward to client
                    res.write(chunk);
                });

                proxyRes.on('end', () => {
                    // Combine all chunks into a single buffer
                    const responseBodyBuffer = Buffer.concat(responseBodyChunks);
                    
                    // Properly decode the response body based on content-encoding and content-type
                    let responseBodyString = '';
                    try {
                        const contentEncoding = proxyRes.headers['content-encoding'];
                        const contentType = proxyRes.headers['content-type'] || '';
                        
                        console.log(`[ProxyManager] Response complete, buffer length: ${responseBodyBuffer.length}, content-encoding: ${contentEncoding}, content-type: ${contentType}`);
                        
                        if (contentEncoding === 'gzip') {
                            // Decompress gzip
                            const zlib = require('zlib');
                            const decompressed = zlib.gunzipSync(responseBodyBuffer);
                            responseBodyString = decompressed.toString('utf8');
                        } else if (contentEncoding === 'deflate') {
                            // Decompress deflate
                            const zlib = require('zlib');
                            const decompressed = zlib.inflateSync(responseBodyBuffer);
                            responseBodyString = decompressed.toString('utf8');
                        } else if (contentEncoding === 'br') {
                            // Decompress brotli
                            const zlib = require('zlib');
                            const decompressed = zlib.brotliDecompressSync(responseBodyBuffer);
                            responseBodyString = decompressed.toString('utf8');
                        } else {
                            // No compression or unknown compression, treat as UTF-8
                            responseBodyString = responseBodyBuffer.toString('utf8');
                        }
                        
                        console.log(`[ProxyManager] Decoded response body length: ${responseBodyString.length}`);
                        
                    } catch (error) {
                        console.error(`[ProxyManager] Error decoding response body:`, error);
                        // Fallback to raw buffer as base64 if decoding fails
                        responseBodyString = responseBodyBuffer.toString('base64');
                        console.log(`[ProxyManager] Using base64 fallback, length: ${responseBodyString.length}`);
                    }
                    
                    // Capture response data for monitoring
                    const responseData: ProxyResponseData = {
                        statusCode: proxyRes.statusCode || 500,
                        statusMessage: proxyRes.statusMessage || '',
                        headers: proxyRes.headers,
                        body: responseBodyString,
                        timestamp: new Date(),
                        duration: Date.now() - startTime,
                        requestData
                    };

                    if (this.onResponseDataCallback) {
                        this.onResponseDataCallback(responseData);
                    }

                    // Broadcast response data to WebSocket clients
                    this.broadcastToWebSockets('response', responseData);
                    
                    // End the client response
                    res.end();
                });

                proxyRes.on('error', (error) => {
                    console.error(`[ProxyManager] Response stream error:`, error);
                    res.end();
                });
            });

            proxyReq.on('error', (error: any) => {
                console.error(`[ProxyManager] Proxy request error for ${req.url}:`, error);
                console.error(`[ProxyManager] Failed to connect to localhost:${relayPort}`);
                console.error(`[ProxyManager] Error details:`, error.code, error.message);
                
                // Only send error response if headers haven't been sent yet
                if (!res.headersSent) {
                    res.writeHead(502, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Proxy Error',
                        message: error.message,
                        code: error.code || 'UNKNOWN',
                        target: `localhost:${relayPort}`,
                        url: req.url
                    }));
                } else {
                    res.end();
                }
            });

            // Set timeout for the proxy request
            proxyReq.setTimeout(30000, () => {
                console.error(`[ProxyManager] Proxy request timeout for ${req.url}`);
                proxyReq.destroy();
                if (!res.headersSent) {
                    res.writeHead(504, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        error: 'Gateway Timeout',
                        message: 'Request to backend service timed out',
                        target: `localhost:${relayPort}`,
                        url: req.url
                    }));
                } else {
                    res.end();
                }
            });

            // Forward request body if present
            if (requestBody) {
                proxyReq.write(requestBody);
            }
            
            proxyReq.end();
        });

        req.on('error', (error) => {
            console.error('Request error:', error);
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('Bad Request: ' + error.message);
        });
    }

    private handleConnect(req: http.IncomingMessage, clientSocket: Duplex, head: Buffer, relayPort: string): void {
        // Handle HTTPS CONNECT method for SSL tunneling
        const serverSocket = net.connect(parseInt(relayPort), 'localhost', () => {
            clientSocket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
            serverSocket.write(head);
            serverSocket.pipe(clientSocket);
            clientSocket.pipe(serverSocket);
        });

        serverSocket.on('error', (error) => {
            console.error('CONNECT tunnel error:', error);
            clientSocket.end();
        });

        clientSocket.on('error', (error: Error) => {
            console.error('Client socket error:', error);
            serverSocket.end();
        });
    }
}

export interface ProxyRequestData {
    method: string;
    url: string;
    headers: http.IncomingHttpHeaders;
    body: string;
    timestamp: Date;
    remoteAddress?: string;
}

export interface ProxyResponseData {
    statusCode: number;
    statusMessage: string;
    headers: http.OutgoingHttpHeaders;
    body: string;
    timestamp: Date;
    duration: number;
    requestData: ProxyRequestData;
}