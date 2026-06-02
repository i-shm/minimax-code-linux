#!/usr/bin/env node
"use strict";

// Chrome Native Messaging host for Mavis browser integration.
// Vendored from opencode-browser (MIT), modified for Mavis multi-profile support.
//
// Changes from upstream:
// 1. Socket path from MAVIS_BROWSER_BROKER_SOCKET env var (injected by daemon)
// 2. Startup log includes current Mavis profile name
// 3. Clean shutdown on SIGTERM

const net = require("net");
const fs = require("fs");
const os = require("os");
const path = require("path");

const PROFILE = process.env.MAVIS_PROFILE || process.env.__MAVIS_RUNTIME_PROFILE || "default";
const SOCKET_PATH = getBrokerSocketPath();

function getBrokerSocketPath() {
  const override = process.env.MAVIS_BROWSER_BROKER_SOCKET;
  if (override) return override;
  // Fallback: derive from profile data dir
  const dataDir = PROFILE === "default"
    ? path.join(os.homedir(), ".mavis")
    : path.join(os.homedir(), `.mavis-${PROFILE}`);
  if (process.platform === "win32") {
    // Pipe name MUST stay byte-identical with the daemon's
    // BrokerSocketServer.getBrokerSocketPath(profile, dataDir) implementation
    // — historically these drifted (host used `mavis-browser-<user>-<profile>`,
    // daemon used `mavis-<profile>-browser`, CLI used `mavis-browser-broker`),
    // which silently broke every Windows install. End-to-end Windows support
    // is still gated behind `mavis browser install` until further notice.
    return `\\\\.\\pipe\\mavis-${PROFILE}-browser`;
  }
  return path.join(dataDir, "browser-broker.sock");
}

// Log startup info to stderr (stdout is reserved for native messaging framing)
process.stderr.write(`[mavis-native-host] starting for profile="${PROFILE}" socket="${SOCKET_PATH}"\n`);

function createJsonLineParser(onMessage) {
  let buffer = "";
  return (chunk) => {
    buffer += chunk.toString("utf8");
    while (true) {
      const idx = buffer.indexOf("\n");
      if (idx === -1) return;
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 1);
      if (!line.trim()) continue;
      try {
        onMessage(JSON.parse(line));
      } catch {
        // ignore malformed JSON
      }
    }
  };
}

function writeJsonLine(socket, msg) {
  socket.write(JSON.stringify(msg) + "\n");
}

async function connectToBroker() {
  return await new Promise((resolve, reject) => {
    const socket = net.createConnection(SOCKET_PATH);
    socket.once("connect", () => resolve(socket));
    socket.once("error", (err) => reject(err));
  });
}

async function ensureBroker() {
  // In Mavis, the broker runs inside the daemon process — no need to spawn it.
  // Just retry connection a few times to handle startup races.
  for (let i = 0; i < 50; i++) {
    try {
      return await connectToBroker();
    } catch {
      if (i === 0) {
        process.stderr.write(`[mavis-native-host] waiting for broker at ${SOCKET_PATH}...\n`);
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  throw new Error(`Could not connect to Mavis broker at ${SOCKET_PATH}`);
}

// --- Native messaging framing ---
let stdinBuffer = Buffer.alloc(0);

function writeNativeMessage(obj) {
  try {
    const payload = Buffer.from(JSON.stringify(obj), "utf8");
    const header = Buffer.alloc(4);
    header.writeUInt32LE(payload.length, 0);
    process.stdout.write(Buffer.concat([header, payload]));
  } catch (e) {
    process.stderr.write(`[mavis-native-host] write error: ${e}\n`);
  }
}

function onStdinData(chunk, onMessage) {
  stdinBuffer = Buffer.concat([stdinBuffer, chunk]);
  while (stdinBuffer.length >= 4) {
    const len = stdinBuffer.readUInt32LE(0);
    if (stdinBuffer.length < 4 + len) return;
    const body = stdinBuffer.slice(4, 4 + len);
    stdinBuffer = stdinBuffer.slice(4 + len);
    try {
      onMessage(JSON.parse(body.toString("utf8")));
    } catch {
      // ignore malformed messages
    }
  }
}

let brokerSocket = null;

function cleanup() {
  process.stderr.write(`[mavis-native-host] shutting down (profile="${PROFILE}")\n`);
  try {
    if (brokerSocket) brokerSocket.end();
  } catch {
    // ignore
  }
  process.exit(0);
}

// Handle SIGTERM for clean shutdown (daemon restart, system service stop)
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);

(async () => {
  const broker = await ensureBroker();
  brokerSocket = broker;
  broker.setNoDelay(true);
  broker.on("data", createJsonLineParser((msg) => {
    if (msg && msg.type === "to_extension" && msg.message) {
      writeNativeMessage(msg.message);
    }
  }));

  broker.on("close", () => {
    process.stderr.write(`[mavis-native-host] broker connection closed\n`);
    process.exit(0);
  });

  broker.on("error", (err) => {
    process.stderr.write(`[mavis-native-host] broker error: ${err}\n`);
    process.exit(1);
  });

  writeJsonLine(broker, { type: "hello", role: "native-host", profile: PROFILE });

  process.stdin.on("data", (chunk) =>
    onStdinData(chunk, (message) => {
      // Forward extension-origin messages to broker
      writeJsonLine(broker, { type: "from_extension", message });
    })
  );

  process.stdin.on("end", () => {
    process.stderr.write(`[mavis-native-host] stdin closed, shutting down\n`);
    cleanup();
  });

  process.stderr.write(`[mavis-native-host] connected to broker, ready\n`);
})();
