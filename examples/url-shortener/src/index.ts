import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serve } from '@hono/node-server'
import { html } from 'hono/html'

interface UrlEntry {
  originalUrl: string
  shortCode: string
  clicks: number
  createdAt: string
}

const store = new Map<string, UrlEntry>()

function generateShortCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return code
}

const app = new Hono()

app.use('/*', cors())

// ── API Routes ──

app.post('/api/shorten', async (c) => {
  const body = await c.req.json<{ url: string }>()
  const { url } = body

  if (!url) {
    return c.json({ error: 'url is required' }, 400)
  }

  try {
    new URL(url)
  } catch {
    return c.json({ error: 'Invalid URL' }, 400)
  }

  let shortCode = generateShortCode()
  while (store.has(shortCode)) {
    shortCode = generateShortCode()
  }

  const entry: UrlEntry = {
    originalUrl: url,
    shortCode,
    clicks: 0,
    createdAt: new Date().toISOString(),
  }
  store.set(shortCode, entry)

  return c.json({
    shortCode,
    shortUrl: `${new URL(c.req.url).origin}/s/${shortCode}`,
    originalUrl: url,
  }, 201)
})

app.get('/api/urls', (c) => {
  const urls = Array.from(store.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  return c.json(urls)
})

app.get('/api/urls/:code', (c) => {
  const code = c.req.param('code')
  const entry = store.get(code)
  if (!entry) {
    return c.json({ error: 'Not found' }, 404)
  }
  return c.json(entry)
})

// ── Redirect ──

app.get('/s/:code', (c) => {
  const code = c.req.param('code')
  const entry = store.get(code)
  if (!entry) {
    return c.text('Short URL not found', 404)
  }
  entry.clicks++
  return c.redirect(entry.originalUrl, 302)
})

// ── Frontend ──

app.get('/', (c) => {
  return c.html(html`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>URL Shortener — Hono</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem 1rem;
    }
    h1 {
      font-size: 2rem;
      margin-bottom: 0.25rem;
      background: linear-gradient(135deg, #ff6b35, #f7c948);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .subtitle { color: #888; margin-bottom: 2rem; font-size: 0.9rem; }
    .card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 12px;
      padding: 1.5rem;
      width: 100%;
      max-width: 600px;
      margin-bottom: 1.5rem;
    }
    .form-row { display: flex; gap: 0.5rem; }
    input[type="url"] {
      flex: 1;
      padding: 0.75rem 1rem;
      border-radius: 8px;
      border: 1px solid #444;
      background: #111;
      color: #fff;
      font-size: 1rem;
      outline: none;
    }
    input[type="url"]:focus { border-color: #ff6b35; }
    button {
      padding: 0.75rem 1.5rem;
      border: none;
      border-radius: 8px;
      background: linear-gradient(135deg, #ff6b35, #e85d26);
      color: #fff;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    button:hover { opacity: 0.9; }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .result {
      margin-top: 1rem;
      padding: 0.75rem 1rem;
      background: #0d2818;
      border: 1px solid #1e6b3a;
      border-radius: 8px;
      display: none;
    }
    .result a { color: #4ade80; text-decoration: none; font-weight: 600; }
    .result a:hover { text-decoration: underline; }
    table { width: 100%; border-collapse: collapse; }
    th, td {
      text-align: left;
      padding: 0.6rem 0.75rem;
      border-bottom: 1px solid #2a2a2a;
      font-size: 0.85rem;
    }
    th { color: #888; font-weight: 500; text-transform: uppercase; font-size: 0.75rem; }
    td a { color: #60a5fa; text-decoration: none; }
    td a:hover { text-decoration: underline; }
    .clicks {
      display: inline-block;
      background: #1e293b;
      padding: 0.2rem 0.6rem;
      border-radius: 999px;
      font-size: 0.8rem;
      font-weight: 600;
      color: #93c5fd;
    }
    .empty { text-align: center; padding: 2rem; color: #666; }
    .original-url {
      max-width: 220px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  </style>
</head>
<body>
  <h1>🔗 URL Shortener</h1>
  <p class="subtitle">Powered by Hono 🔥</p>

  <div class="card">
    <div class="form-row">
      <input type="url" id="urlInput" placeholder="https://example.com/very/long/url" />
      <button id="shortenBtn" onclick="shortenUrl()">Shorten</button>
    </div>
    <div class="result" id="result">
      Short URL: <a id="shortLink" href="#" target="_blank"></a>
    </div>
  </div>

  <div class="card">
    <h2 style="font-size:1.1rem; margin-bottom:1rem;">All Shortened URLs</h2>
    <div id="urlList">
      <p class="empty">No URLs shortened yet.</p>
    </div>
  </div>

  <script>
    async function shortenUrl() {
      const input = document.getElementById('urlInput');
      const btn = document.getElementById('shortenBtn');
      const url = input.value.trim();
      if (!url) return;

      btn.disabled = true;
      btn.textContent = '...';

      try {
        const res = await fetch('/api/shorten', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url }),
        });
        const data = await res.json();

        if (!res.ok) {
          alert(data.error || 'Something went wrong');
          return;
        }

        const result = document.getElementById('result');
        const link = document.getElementById('shortLink');
        link.href = data.shortUrl;
        link.textContent = data.shortUrl;
        result.style.display = 'block';
        input.value = '';
        loadUrls();
      } catch (err) {
        alert('Network error');
      } finally {
        btn.disabled = false;
        btn.textContent = 'Shorten';
      }
    }

    async function loadUrls() {
      try {
        const res = await fetch('/api/urls');
        const urls = await res.json();
        const container = document.getElementById('urlList');

        if (urls.length === 0) {
          container.innerHTML = '<p class="empty">No URLs shortened yet.</p>';
          return;
        }

        container.innerHTML =
          '<table><thead><tr><th>Short Code</th><th>Original URL</th><th>Clicks</th></tr></thead><tbody>' +
          urls.map(function(u) {
            return '<tr>' +
              '<td><a href="/s/' + u.shortCode + '" target="_blank">' + u.shortCode + '</a></td>' +
              '<td class="original-url" title="' + u.originalUrl + '">' + u.originalUrl + '</td>' +
              '<td><span class="clicks">' + u.clicks + '</span></td>' +
              '</tr>';
          }).join('') +
          '</tbody></table>';
      } catch (err) {
        console.error('Failed to load URLs', err);
      }
    }

    document.getElementById('urlInput').addEventListener('keydown', function(e) {
      if (e.key === 'Enter') shortenUrl();
    });

    loadUrls();
  </script>
</body>
</html>`)
})

const port = 3000
console.log(`🔗 URL Shortener running at http://localhost:${port}`)
serve({ fetch: app.fetch, port })
