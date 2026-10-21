/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from "serwist";
import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  Serwist,
  StaleWhileRevalidate,
} from "serwist";

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const OFFLINE_API_FALLBACK_MESSAGE = JSON.stringify({
  error: "This feature requires an internet connection",
  offline: true,
});

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // 1. Cache-First for app shell assets (HTML, CSS, JS, fonts, images, icons)
    {
      matcher: ({ request, url }) => {
        return (
          request.destination === "style" ||
          request.destination === "script" ||
          request.destination === "font" ||
          request.destination === "image" ||
          url.pathname.startsWith("/_next/static/") ||
          url.pathname.startsWith("/icons/") ||
          url.pathname === "/manifest.json"
        );
      },
      handler: new CacheFirst({
        cacheName: "app-shell-assets",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 150,
            maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
          }),
        ],
      }),
    },
    // 2. Network-First for API calls (/api/*) with offline fallback response
    {
      matcher: ({ url }) => url.pathname.startsWith("/api/"),
      handler: new NetworkFirst({
        cacheName: "api-cache",
        networkTimeoutSeconds: 10,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 24 * 60 * 60, // 24 hours
          }),
          {
            handlerDidError: async () => {
              return new Response(OFFLINE_API_FALLBACK_MESSAGE, {
                status: 503,
                headers: { "Content-Type": "application/json" },
              });
            },
          },
        ],
      }),
    },
    // 3. Stale-While-Revalidate for pages and documents
    {
      matcher: ({ request }) =>
        request.destination === "document" || request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: "pages-cache",
        networkTimeoutSeconds: 5,
        plugins: [
          new ExpirationPlugin({
            maxEntries: 50,
            maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
          }),
        ],
      }),
    },
    // 4. Stale-While-Revalidate for other uncached resources
    {
      matcher: () => true,
      handler: new StaleWhileRevalidate({
        cacheName: "others-cache",
        plugins: [
          new ExpirationPlugin({
            maxEntries: 100,
            maxAgeSeconds: 7 * 24 * 60 * 60,
          }),
        ],
      }),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: "/offline.html",
        matcher({ request }) {
          return request.destination === "document";
        },
      },
    ],
  },
});

// Background Sync API handler
self.addEventListener("sync", (event: ExtendableEvent) => {
  const syncEvent = event as ExtendableEvent & { tag?: string };
  if (
    syncEvent.tag === "sync-queue" ||
    syncEvent.tag === "synapse-sync-replay" ||
    syncEvent.tag === "sync"
  ) {
    syncEvent.waitUntil(
      (async () => {
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        for (const client of clients) {
          client.postMessage({ type: "TRIGGER_SYNC_REPLAY" });
        }
      })()
    );
  }
});


serwist.addEventListeners();
