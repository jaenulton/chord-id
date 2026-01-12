const WebSocket = require('ws');
const express = require('express');
const http = require('http');

const WS_PORT = 8085;
const HTTP_PORT = 8086;
const AUTH_SECRET = 'chord-id-ws-secret-2024';

// Store connected clients
const clients = new Set();

// WebSocket Server
const wss = new WebSocket.Server({ port: WS_PORT });

wss.on('connection', (ws, req) => {
  const clientIp = req.socket.remoteAddress;
  console.log(`[WS] Client connected from ${clientIp}. Total: ${clients.size + 1}`);

  clients.add(ws);

  // Send welcome message with current client count
  ws.send(JSON.stringify({
    type: 'connected',
    clientCount: clients.size,
    timestamp: new Date().toISOString()
  }));

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`[WS] Client disconnected. Total: ${clients.size}`);
  });

  ws.on('error', (err) => {
    console.error('[WS] Client error:', err.message);
    clients.delete(ws);
  });

  // Handle ping/pong for keepalive
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

// Keepalive ping every 30 seconds
const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      clients.delete(ws);
      return ws.terminate();
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

wss.on('close', () => {
  clearInterval(pingInterval);
});

// Broadcast to all connected clients
function broadcast(message) {
  const payload = JSON.stringify(message);
  let sent = 0;

  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
      sent++;
    }
  });

  console.log(`[WS] Broadcast "${message.type}" to ${sent} clients`);
  return sent;
}

// HTTP Server for receiving updates from admin.php
const app = express();
app.use(express.json());

// CORS for admin requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== `Bearer ${AUTH_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// Endpoint to broadcast content updates (ticker, banner)
app.post('/broadcast/content', authMiddleware, (req, res) => {
  const { ticker, banner } = req.body;

  const sent = broadcast({
    type: 'content_update',
    data: { ticker, banner },
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, clientsNotified: sent });
});

// Endpoint to broadcast new notification
app.post('/broadcast/notification', authMiddleware, (req, res) => {
  const { notification } = req.body;

  const sent = broadcast({
    type: 'notification',
    data: notification,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, clientsNotified: sent });
});

// Endpoint to broadcast poll updates
app.post('/broadcast/poll', authMiddleware, (req, res) => {
  const { poll, action } = req.body; // action: 'created', 'updated', 'deleted'

  const sent = broadcast({
    type: 'poll_update',
    action: action || 'updated',
    data: poll,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, clientsNotified: sent });
});

// Generic broadcast endpoint
app.post('/broadcast', authMiddleware, (req, res) => {
  const { type, data } = req.body;

  if (!type) {
    return res.status(400).json({ error: 'Type is required' });
  }

  const sent = broadcast({
    type,
    data,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, clientsNotified: sent });
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    wsClients: clients.size,
    uptime: process.uptime()
  });
});

// Stats endpoint
app.get('/stats', (req, res) => {
  res.json({
    connectedClients: clients.size,
    uptime: process.uptime(),
    memoryUsage: process.memoryUsage()
  });
});

const httpServer = app.listen(HTTP_PORT, () => {
  console.log(`[HTTP] Broadcast API listening on port ${HTTP_PORT}`);
});

console.log(`[WS] WebSocket server listening on port ${WS_PORT}`);
console.log(`[INFO] Auth secret: ${AUTH_SECRET}`);

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[INFO] Shutting down...');
  clearInterval(pingInterval);
  wss.close();
  httpServer.close();
  process.exit(0);
});
