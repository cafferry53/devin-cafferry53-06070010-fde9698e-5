import { makeFetch } from 'supertest-fetch'
import { describe, expect, it, vi } from 'vitest'
import { App } from '../../packages/app/src/index'
import { MemoryStore, rateLimit } from '../../packages/rate-limit/src'

function createApp(limiterOpts?: Parameters<typeof rateLimit>[0]) {
  const app = new App()
  const limiter = rateLimit(limiterOpts)
  app.use(limiter)
  app.use((_req, res) => {
    res.statusCode = 200
    res.end('OK')
  })
  const server = app.listen()
  const fetch = makeFetch(server)
  return { fetch, app, server, limiter }
}

describe('MemoryStore', () => {
  it('should increment hits for a key', async () => {
    const store = new MemoryStore(60000)
    await new Promise<void>((resolve) => {
      store.incr('key1', (err, hits, resetTime) => {
        expect(err).toBeNull()
        expect(hits).toBe(1)
        expect(resetTime).toBeInstanceOf(Date)
        resolve()
      })
    })
    await new Promise<void>((resolve) => {
      store.incr('key1', (err, hits) => {
        expect(err).toBeNull()
        expect(hits).toBe(2)
        resolve()
      })
    })
  })

  it('should decrement hits for a key', async () => {
    const store = new MemoryStore(60000)
    await new Promise<void>((resolve) => {
      store.incr('key1', () => resolve())
    })
    await new Promise<void>((resolve) => {
      store.incr('key1', () => resolve())
    })
    store.decrement('key1')
    await new Promise<void>((resolve) => {
      store.incr('key1', (_err, hits) => {
        expect(hits).toBe(2)
        resolve()
      })
    })
  })

  it('should not decrement below zero', () => {
    const store = new MemoryStore(60000)
    store.decrement('nonexistent')
    expect(store.hits.nonexistent).toBeUndefined()
  })

  it('should reset all keys', async () => {
    const store = new MemoryStore(60000)
    await new Promise<void>((resolve) => {
      store.incr('key1', () => resolve())
    })
    await new Promise<void>((resolve) => {
      store.incr('key2', () => resolve())
    })
    store.resetAll()
    await new Promise<void>((resolve) => {
      store.incr('key1', (_err, hits) => {
        expect(hits).toBe(1)
        resolve()
      })
    })
  })

  it('should reset a specific key', async () => {
    const store = new MemoryStore(60000)
    await new Promise<void>((resolve) => {
      store.incr('key1', () => resolve())
    })
    await new Promise<void>((resolve) => {
      store.incr('key1', () => resolve())
    })
    store.resetKey('key1')
    await new Promise<void>((resolve) => {
      store.incr('key1', (_err, hits) => {
        expect(hits).toBe(1)
        resolve()
      })
    })
  })

  it('should calculate next reset time correctly', () => {
    const store = new MemoryStore(5000)
    const now = Date.now()
    expect(store.resetTime.getTime()).toBeGreaterThanOrEqual(now)
    expect(store.resetTime.getTime()).toBeLessThanOrEqual(now + 5000 + 50)
  })
})

describe('rateLimit middleware', () => {
  it('should allow requests under the limit', async () => {
    const { fetch } = createApp({ windowMs: 60000, max: 5 })

    const res = await fetch('/')
    expect(res.status).toBe(200)
    expect(res.headers.get('x-ratelimit-limit')).toBe('5')
    expect(res.headers.get('x-ratelimit-remaining')).toBe('4')
  })

  it('should block requests over the limit', async () => {
    const { fetch } = createApp({ windowMs: 60000, max: 2 })

    await fetch('/')
    await fetch('/')
    const res = await fetch('/')
    expect(res.status).toBe(429)
    const body = await res.text()
    expect(body).toBe('Too many requests, please try again later.')
  })

  it('should set Retry-After header when limit exceeded', async () => {
    const { fetch } = createApp({ windowMs: 60000, max: 1 })

    await fetch('/')
    const res = await fetch('/')
    expect(res.status).toBe(429)
    expect(res.headers.get('retry-after')).toBe('60')
  })

  it('should use custom statusCode', async () => {
    const { fetch } = createApp({ windowMs: 60000, max: 1, statusCode: 503 })

    await fetch('/')
    const res = await fetch('/')
    expect(res.status).toBe(503)
  })

  it('should use custom message', async () => {
    const { fetch } = createApp({ windowMs: 60000, max: 1, message: 'Slow down!' })

    await fetch('/')
    const res = await fetch('/')
    expect(res.status).toBe(429)
    const body = await res.text()
    expect(body).toBe('Slow down!')
  })

  it('should skip requests when shouldSkip returns true', async () => {
    const { fetch } = createApp({ windowMs: 60000, max: 1, shouldSkip: () => true })

    await fetch('/')
    await fetch('/')
    const res = await fetch('/')
    expect(res.status).toBe(200)
  })

  it('should not set headers when headers option is false', async () => {
    const { fetch } = createApp({ windowMs: 60000, max: 5, headers: false })

    const res = await fetch('/')
    expect(res.headers.get('x-ratelimit-limit')).toBeNull()
    expect(res.headers.get('x-ratelimit-remaining')).toBeNull()
  })

  it('should support dynamic max as a function', async () => {
    const { fetch } = createApp({ windowMs: 60000, max: async () => 2 })

    await fetch('/')
    await fetch('/')
    const res = await fetch('/')
    expect(res.status).toBe(429)
  })

  it('should call onLimitReached when limit is first exceeded', async () => {
    const onLimitReached = vi.fn()
    const { fetch } = createApp({ windowMs: 60000, max: 1, onLimitReached })

    await fetch('/')
    await fetch('/')
    expect(onLimitReached).toHaveBeenCalledTimes(1)
  })

  it('should expose resetKey function', async () => {
    const app = new App()
    const limiter = rateLimit({ windowMs: 60000, max: 1, keyGenerator: () => 'test-key' })
    app.use(limiter)
    app.use((_req, res) => {
      res.statusCode = 200
      res.end('OK')
    })
    const server = app.listen()
    const fetch = makeFetch(server)

    await fetch('/')
    const res1 = await fetch('/')
    expect(res1.status).toBe(429)

    limiter.resetKey('test-key')
    const res2 = await fetch('/')
    expect(res2.status).toBe(200)
  })

  it('should use custom keyGenerator', async () => {
    const { fetch } = createApp({ windowMs: 60000, max: 1, keyGenerator: () => 'custom-key' })

    await fetch('/')
    const res = await fetch('/')
    expect(res.status).toBe(429)
  })

  it('should set X-RateLimit-Reset header', async () => {
    const { fetch } = createApp({ windowMs: 60000, max: 5 })

    const res = await fetch('/')
    expect(res.headers.get('x-ratelimit-reset')).not.toBeNull()
    expect(res.headers.get('date')).not.toBeNull()
  })

  it('should set draft Polli ratelimit headers when enabled', async () => {
    const { fetch } = createApp({ windowMs: 60000, max: 5, draftPolliRatelimitHeaders: true })

    const res = await fetch('/')
    expect(res.headers.get('ratelimit-limit')).toBe('5')
    expect(res.headers.get('ratelimit-remaining')).toBe('4')
    expect(res.headers.get('ratelimit-reset')).not.toBeNull()
  })

  it('should use custom store', async () => {
    const customStore = new MemoryStore(60000)
    const app = new App()
    const limiter = rateLimit({ windowMs: 60000, max: 2, store: customStore, keyGenerator: () => 'store-key' })
    app.use(limiter)
    app.use((_req, res) => {
      res.statusCode = 200
      res.end('OK')
    })
    const server = app.listen()
    const fetch = makeFetch(server)

    await fetch('/')
    await fetch('/')
    const res = await fetch('/')
    expect(res.status).toBe(429)

    customStore.resetKey('store-key')
    const res2 = await fetch('/')
    expect(res2.status).toBe(200)
  })

  it('should pass errors from store to next', async () => {
    const errorStore = {
      incr: (_key: string, callback: (err: Error | null, hits: number, resetTime: Date) => void) => {
        callback(new Error('Store error'), 0, new Date())
      },
      decrement: () => {},
      resetAll: () => {},
      resetKey: () => {}
    }
    const app = new App({
      onError: (err, _req, res) => {
        res.statusCode = 500
        res.end(err.message)
      }
    })
    const limiter = rateLimit({ windowMs: 60000, max: 5, store: errorStore })
    app.use(limiter)
    app.use((_req, res) => {
      res.statusCode = 200
      res.end('OK')
    })
    const server = app.listen()
    const fetch = makeFetch(server)

    const res = await fetch('/')
    expect(res.status).toBe(500)
    const body = await res.text()
    expect(body).toBe('Store error')
  })

  it('should decrement on failed requests when skipFailedRequests is true', async () => {
    const app = new App()
    const limiter = rateLimit({ windowMs: 60000, max: 2, skipFailedRequests: true })
    app.use(limiter)
    app.use((_req, res) => {
      res.statusCode = 400
      res.end('Bad request')
    })
    const server = app.listen()
    const fetch = makeFetch(server)

    await fetch('/')
    await fetch('/')
    const res = await fetch('/')
    expect(res.status).toBe(400)
  })

  it('should decrement on successful requests when skipSuccessfulRequests is true', async () => {
    const app = new App()
    const limiter = rateLimit({ windowMs: 60000, max: 2, skipSuccessfulRequests: true })
    app.use(limiter)
    app.use((_req, res) => {
      res.statusCode = 200
      res.end('OK')
    })
    const server = app.listen()
    const fetch = makeFetch(server)

    await fetch('/')
    await fetch('/')
    const res = await fetch('/')
    expect(res.status).toBe(200)
  })
})
