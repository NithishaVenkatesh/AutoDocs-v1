// Test if this file is being loaded
console.log('[SSE] SSE utility file loaded');

import { NextRequest } from 'next/server';

const clients = new Set<ReadableStreamDefaultController>();
const pendingUpdates = new Map<string, any>(); // Store updates for when clients connect

// Function to send updates to all connected clients
export function sendSSEUpdate(data: any) {
  console.log(`[SSE] Sending update to ${clients.size} clients:`, data);

  // If no clients are connected, store the update for later
  if (clients.size === 0) {
    const key = `${data.type}_${data.repoName}_${Date.now()}`;
    pendingUpdates.set(key, data);
    console.log(`[SSE] No clients connected, storing update for later: ${key}`);

    // Clean up old pending updates (older than 30 seconds)
    const cutoffTime = Date.now() - 30000;
    for (const [updateKey, updateData] of pendingUpdates.entries()) {
      if (parseInt(updateKey.split('_')[2]) < cutoffTime) {
        pendingUpdates.delete(updateKey);
      }
    }

    return;
  }

  const message = `data: ${JSON.stringify(data)}\n\n`;
  clients.forEach(client => {
    try {
      client.enqueue(message);
    } catch (error) {
      // Remove disconnected clients
      console.log('[SSE] Removing disconnected client');
      clients.delete(client);
    }
  });
}

export async function GET(request: NextRequest) {
  let controller: ReadableStreamDefaultController;

  const responseStream = new ReadableStream({
    start(ctrl) {
      controller = ctrl;
      // Add this client to the set of connected clients
      clients.add(controller);
      console.log(`[SSE] New client connected. Total clients: ${clients.size}`);

      // Send initial connection message
      controller.enqueue(`data: ${JSON.stringify({ type: 'connected', message: 'SSE connection established' })}\n\n`);

      // Send any pending updates for repositories this client might be interested in
      // For now, send all pending updates since we don't know which repos the client cares about
      for (const [key, update] of pendingUpdates.entries()) {
        console.log(`[SSE] Sending pending update to new client: ${key}`);
        const message = `data: ${JSON.stringify(update)}\n\n`;
        try {
          controller.enqueue(message);
        } catch (error) {
          console.log('[SSE] Failed to send pending update');
        }
      }

      // Clear old pending updates that have been sent
      pendingUpdates.clear();

      // Handle client disconnect
      request.signal.addEventListener('abort', () => {
        clients.delete(controller);
        console.log(`[SSE] Client disconnected. Total clients: ${clients.size}`);
        controller.close();
      });
    },
    cancel() {
      // Remove client when stream is cancelled
      if (controller) {
        clients.delete(controller);
        console.log(`[SSE] Client cancelled. Total clients: ${clients.size}`);
      }
    }
  });

  return new Response(responseStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Cache-Control',
    },
  });
}
