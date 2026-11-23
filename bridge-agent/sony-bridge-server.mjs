#!/usr/bin/env node
/**
 * BoostBooth Local Sony Camera Bridge (sony-bridge-server.mjs)
 *
 * Bridges a Sony DSLR / Mirrorless camera to the BoostBooth iPad / Web App:
 * - Mode 1 (USB-C / gphoto2): Triggers real shutter + downloads full-res JPEG + streams Live View
 * - Mode 2 (Legacy Sony Wi-Fi PlayMemories 192.168.122.1:8080): Proxies JSON-RPC to avoid Safari CORS/Mixed-Content
 *
 * Requirements:
 * - Node.js 18+
 * - For USB-C DSLR control: Install gphoto2 (`brew install gphoto2` on macOS or `sudo apt install gphoto2` on Linux/Raspberry Pi)
 *
 * Run:
 *   node sony-bridge-server.mjs
 */

import http from 'node:http';
import { execFile, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const PORT = Number(process.env.BRIDGE_PORT || 8765);
const SONY_WIFI_ENDPOINT = process.env.SONY_WIFI_URL || 'http://192.168.122.1:8080/sony/camera';

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

function sendJson(res, status, data) {
  setCorsHeaders(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function checkGphotoCamera() {
  return new Promise((resolve) => {
    execFile('gphoto2', ['--auto-detect'], { timeout: 3000 }, (err, stdout) => {
      if (err) {
        resolve({ available: false, model: '', error: err.message });
        return;
      }
      const lines = stdout.split('\n').map((l) => l.trim()).filter(Boolean);
      const cameraLine = lines.find((l) => l.includes('usb:'));
      if (!cameraLine) {
        resolve({ available: false, model: '', error: 'No USB camera detected by gphoto2.' });
        return;
      }
      const model = cameraLine.split(/\s{2,}/)[0] || 'Sony USB Camera';
      resolve({ available: true, model });
    });
  });
}

async function callLegacySonyRpc(method, params = []) {
  const res = await fetch(SONY_WIFI_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params, id: 1, version: '1.0' }),
  });
  return res.json();
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    setCorsHeaders(res);
    res.writeHead(204);
    res.end();
    return;
  }

  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  const mode = url.searchParams.get('mode') || 'bridge-sony';

  if (url.pathname === '/api/camera/status') {
    if (mode === 'legacy-sony-wifi') {
      try {
        const info = await callLegacySonyRpc('getApplicationInfo');
        sendJson(res, 200, {
          cameraConnected: !info.error,
          cameraModel: info.result ? `Sony Wi-Fi (${info.result[0]})` : 'Sony Wi-Fi Camera',
        });
      } catch (err) {
        sendJson(res, 200, {
          cameraConnected: false,
          message: `Cannot reach Sony Wi-Fi API at ${SONY_WIFI_ENDPOINT}: ${err.message}`,
        });
      }
      return;
    }

    const gp = await checkGphotoCamera();
    sendJson(res, 200, {
      cameraConnected: gp.available,
      cameraModel: gp.model,
      message: gp.available ? 'Ready' : gp.error,
    });
    return;
  }

  if (url.pathname === '/api/camera/liveview.mjpg') {
    setCorsHeaders(res);
    res.writeHead(200, {
      'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
      'Cache-Control': 'no-cache',
    });

    const proc = spawn('gphoto2', ['--capture-movie', '--stdout']);
    let buffer = Buffer.alloc(0);
    const SOI = Buffer.from([0xff, 0xd8]);
    const EOI = Buffer.from([0xff, 0xd9]);

    proc.stdout.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      while (true) {
        const start = buffer.indexOf(SOI);
        const end = buffer.indexOf(EOI, start + 2);
        if (start === -1 || end === -1) break;
        const frame = buffer.subarray(start, end + 2);
        buffer = buffer.subarray(end + 2);
        res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${frame.length}\r\n\r\n`);
        res.write(frame);
        res.write('\r\n');
      }
    });

    req.on('close', () => {
      proc.kill('SIGTERM');
    });
    return;
  }

  if (url.pathname === '/api/camera/capture' && req.method === 'POST') {
    const tmpFile = path.join(os.tmpdir(), `sony_capture_${Date.now()}.jpg`);
    execFile(
      'gphoto2',
      ['--capture-image-and-download', '--force-overwrite', '--filename', tmpFile],
      { timeout: 15000 },
      (err) => {
        if (err || !fs.existsSync(tmpFile)) {
          sendJson(res, 500, { error: err ? err.message : 'Camera capture produced no file.' });
          return;
        }
        const data = fs.readFileSync(tmpFile);
        fs.unlink(tmpFile, () => {});
        setCorsHeaders(res);
        res.writeHead(200, { 'Content-Type': 'image/jpeg', 'Content-Length': data.length });
        res.end(data);
      }
    );
    return;
  }

  sendJson(res, 404, { error: 'Endpoint not found' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`BoostBooth Sony Camera Bridge listening on http://0.0.0.0:${PORT}`);
});
