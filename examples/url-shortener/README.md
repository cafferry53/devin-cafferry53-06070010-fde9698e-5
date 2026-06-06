# URL Shortener — Hono Example

A simple URL shortener API with a frontend, built with [Hono](https://hono.dev).

## Features

- **POST /api/shorten** — Create a short URL from a long one
- **GET /s/:code** — Redirect to the original URL (increments click count)
- **GET /api/urls** — List all shortened URLs with click counts
- **GET /api/urls/:code** — Get details for a single short URL
- **GET /** — Simple web frontend

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Tech Stack

- **Hono** — Web framework
- **@hono/node-server** — Node.js adapter
- **In-memory store** — URLs are stored in a `Map` (resets on restart)
