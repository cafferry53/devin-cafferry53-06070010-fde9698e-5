# Migration Guide from Express to Fastify

This guide is intended to help developers who are familiar with
[Express](https://expressjs.com/) transition their applications to
[Fastify](https://fastify.dev/). It covers common patterns and their Fastify
equivalents with side-by-side code examples.

## Table of Contents

- [Basic Server Setup](#basic-server-setup)
- [Routing](#routing)
- [Route Parameters and Query Strings](#route-parameters-and-query-strings)
- [Request and Reply](#request-and-reply)
- [JSON Parsing](#json-parsing)
- [Middleware vs Hooks and Plugins](#middleware-vs-hooks-and-plugins)
- [Error Handling](#error-handling)
- [Validation](#validation)
- [Serving Static Files](#serving-static-files)
- [Template Rendering](#template-rendering)
- [Route Prefixing and Sub-Apps](#route-prefixing-and-sub-apps)
- [Authentication Middleware](#authentication-middleware)
- [CORS](#cors)
- [Testing](#testing)
- [TypeScript](#typescript)

## Basic Server Setup
<a id="basic-server-setup"></a>

### Express

```js
const express = require('express')
const app = express()

app.get('/', (req, res) => {
  res.json({ hello: 'world' })
})

app.listen(3000, () => {
  console.log('Server listening on port 3000')
})
```

### Fastify

```js
const fastify = require('fastify')({ logger: true })

fastify.get('/', async (request, reply) => {
  return { hello: 'world' }
})

fastify.listen({ port: 3000 }, (err, address) => {
  if (err) {
    fastify.log.error(err)
    process.exit(1)
  }
})
```

Key differences:
- Fastify has a built-in logger (powered by [Pino](https://getpino.io/)).
- Route handlers can return a value directly instead of calling `res.send()`.
- Fastify uses `async/await` by default and does not require callback-style
  handlers.

## Routing
<a id="routing"></a>

### Express

```js
app.get('/users', (req, res) => { /* ... */ })
app.post('/users', (req, res) => { /* ... */ })
app.put('/users/:id', (req, res) => { /* ... */ })
app.delete('/users/:id', (req, res) => { /* ... */ })
```

### Fastify

```js
fastify.get('/users', async (request, reply) => { /* ... */ })
fastify.post('/users', async (request, reply) => { /* ... */ })
fastify.put('/users/:id', async (request, reply) => { /* ... */ })
fastify.delete('/users/:id', async (request, reply) => { /* ... */ })
```

Fastify also supports a shorthand method with full route options:

```js
fastify.route({
  method: 'GET',
  url: '/users',
  schema: {
    response: {
      200: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'integer' },
            name: { type: 'string' }
          }
        }
      }
    }
  },
  handler: async (request, reply) => {
    return [{ id: 1, name: 'Alice' }]
  }
})
```

## Route Parameters and Query Strings
<a id="route-parameters-and-query-strings"></a>

### Express

```js
// Route parameters
app.get('/users/:id', (req, res) => {
  const userId = req.params.id
  res.json({ userId })
})

// Query strings
app.get('/search', (req, res) => {
  const { q, page } = req.query
  res.json({ q, page })
})
```

### Fastify

```js
// Route parameters
fastify.get('/users/:id', async (request, reply) => {
  const userId = request.params.id
  return { userId }
})

// Query strings
fastify.get('/search', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        q: { type: 'string' },
        page: { type: 'integer' }
      },
      required: ['q']
    }
  }
}, async (request, reply) => {
  const { q, page } = request.query
  return { q, page }
})
```

In Fastify, you can define a schema for query parameters to get automatic
validation and type coercion.

## Request and Reply
<a id="request-and-reply"></a>

The Express `req` and `res` objects are replaced by Fastify's
[`Request`](../Reference/Request.md) and [`Reply`](../Reference/Reply.md)
objects.

| Express | Fastify |
|---------|---------|
| `req.params` | `request.params` |
| `req.query` | `request.query` |
| `req.body` | `request.body` |
| `req.headers` | `request.headers` |
| `req.ip` | `request.ip` |
| `res.status(code)` | `reply.code(code)` |
| `res.set(name, value)` | `reply.header(name, value)` |
| `res.json(obj)` | `reply.send(obj)` or `return obj` |
| `res.send(text)` | `reply.send(text)` or `return text` |
| `res.redirect(url)` | `reply.redirect(url)` |
| `res.type(type)` | `reply.type(type)` |

### Setting Status Codes and Headers

**Express:**

```js
app.get('/resource', (req, res) => {
  res.status(201).set('X-Custom', 'value').json({ created: true })
})
```

**Fastify:**

```js
fastify.get('/resource', async (request, reply) => {
  reply.code(201).header('X-Custom', 'value')
  return { created: true }
})
```

## JSON Parsing
<a id="json-parsing"></a>

### Express

Express requires explicit middleware registration for body parsing:

```js
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
```

### Fastify

Fastify parses `application/json` request bodies out of the box with no
additional configuration. For other content types, you can add custom content
type parsers:

```js
fastify.addContentTypeParser(
  'application/x-www-form-urlencoded',
  { parseAs: 'string' },
  (req, body, done) => {
    const parsed = new URLSearchParams(body)
    done(null, Object.fromEntries(parsed))
  }
)
```

## Middleware vs Hooks and Plugins
<a id="middleware-vs-hooks-and-plugins"></a>

Express uses a linear middleware pipeline. Fastify replaces this concept with
[Hooks](../Reference/Hooks.md) and [Plugins](../Reference/Plugins.md).

### Express Middleware

```js
// Logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.url}`)
  next()
})

// Route-specific middleware
app.get('/admin', authMiddleware, (req, res) => {
  res.json({ admin: true })
})
```

### Fastify Hooks

```js
// Logging hook (equivalent to app-level middleware)
fastify.addHook('onRequest', async (request, reply) => {
  request.log.info({ url: request.url, method: request.method }, 'incoming request')
})

// Route-specific hook using route options
fastify.get('/admin', {
  onRequest: async (request, reply) => {
    // authentication logic
    if (!request.headers.authorization) {
      reply.code(401).send({ error: 'Unauthorized' })
    }
  }
}, async (request, reply) => {
  return { admin: true }
})
```

### Hook Lifecycle

Fastify provides a rich set of lifecycle hooks. Here are the most commonly used
ones and their approximate Express equivalents:

| Fastify Hook | Approximate Express Equivalent |
|---|---|
| `onRequest` | Middleware at the top of the stack |
| `preParsing` | Before `body-parser` |
| `preValidation` | After parsing, before validation |
| `preHandler` | Middleware just before the route handler |
| `onSend` | Modifying the response before sending |
| `onResponse` | After response is sent (logging, cleanup) |
| `onError` | Error-handling middleware |

### Express Middleware Compatibility

If you have existing Express middleware that you want to reuse, the
[`@fastify/express`](https://github.com/fastify/fastify-express) plugin provides
a compatibility layer:

```js
await fastify.register(require('@fastify/express'))
fastify.use(require('cors')())
fastify.use(require('helmet')())
```

> **Note:** This is intended as a migration aid. For best performance, migrate
> to native Fastify plugins over time.

## Error Handling
<a id="error-handling"></a>

### Express

```js
// Error-handling middleware (four arguments)
app.use((err, req, res, next) => {
  console.error(err.stack)
  res.status(500).json({ error: 'Internal Server Error' })
})
```

### Fastify

Fastify provides a structured error handler via `setErrorHandler`:

```js
fastify.setErrorHandler((error, request, reply) => {
  request.log.error(error)
  reply.code(error.statusCode || 500).send({
    error: error.name,
    message: error.message,
    statusCode: error.statusCode || 500
  })
})
```

You can also set error handlers scoped to a plugin:

```js
fastify.register(async function adminRoutes (fastify, opts) {
  fastify.setErrorHandler((error, request, reply) => {
    // This only handles errors in routes registered in this plugin
    reply.code(403).send({ error: 'Forbidden' })
  })

  fastify.get('/admin', async (request, reply) => {
    throw new Error('Not allowed')
  })
})
```

### 404 Handling

**Express:**

```js
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' })
})
```

**Fastify:**

```js
fastify.setNotFoundHandler((request, reply) => {
  reply.code(404).send({ error: 'Not Found' })
})
```

## Validation
<a id="validation"></a>

### Express

Express typically uses a library like `express-validator` or `joi`:

```js
const { body, validationResult } = require('express-validator')

app.post('/users',
  body('email').isEmail(),
  body('name').notEmpty(),
  (req, res) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() })
    }
    res.json({ success: true })
  }
)
```

### Fastify

Fastify has built-in validation powered by
[Ajv](https://ajv.js.org/) using JSON Schema:

```js
fastify.post('/users', {
  schema: {
    body: {
      type: 'object',
      required: ['email', 'name'],
      properties: {
        email: { type: 'string', format: 'email' },
        name: { type: 'string', minLength: 1 }
      }
    },
    response: {
      200: {
        type: 'object',
        properties: {
          success: { type: 'boolean' }
        }
      }
    }
  }
}, async (request, reply) => {
  return { success: true }
})
```

Fastify automatically returns a `400` response with validation errors when the
request does not match the schema. You can customize the error format:

```js
fastify.setValidatorCompiler(({ schema }) => {
  return ajv.compile(schema)
})

fastify.setErrorHandler((error, request, reply) => {
  if (error.validation) {
    reply.code(400).send({
      error: 'Validation Error',
      details: error.validation
    })
    return
  }
  reply.code(500).send({ error: 'Internal Server Error' })
})
```

## Serving Static Files
<a id="serving-static-files"></a>

### Express

```js
app.use(express.static('public'))
app.use('/assets', express.static('assets'))
```

### Fastify

Use the [`@fastify/static`](https://github.com/fastify/fastify-static) plugin:

```js
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'public'),
  prefix: '/'
})

// For multiple directories, register with different prefixes
fastify.register(require('@fastify/static'), {
  root: path.join(__dirname, 'assets'),
  prefix: '/assets/',
  decorateReply: false
})
```

## Template Rendering
<a id="template-rendering"></a>

### Express

```js
app.set('view engine', 'ejs')
app.set('views', './views')

app.get('/', (req, res) => {
  res.render('index', { title: 'Home' })
})
```

### Fastify

Use the [`@fastify/view`](https://github.com/fastify/point-of-view) plugin:

```js
fastify.register(require('@fastify/view'), {
  engine: { ejs: require('ejs') },
  root: path.join(__dirname, 'views')
})

fastify.get('/', async (request, reply) => {
  return reply.view('index.ejs', { title: 'Home' })
})
```

## Route Prefixing and Sub-Apps
<a id="route-prefixing-and-sub-apps"></a>

### Express (Router)

```js
const router = express.Router()

router.get('/', (req, res) => {
  res.json({ users: [] })
})

router.get('/:id', (req, res) => {
  res.json({ id: req.params.id })
})

app.use('/api/users', router)
```

### Fastify (Plugins with Prefix)

```js
async function userRoutes (fastify, opts) {
  fastify.get('/', async (request, reply) => {
    return { users: [] }
  })

  fastify.get('/:id', async (request, reply) => {
    return { id: request.params.id }
  })
}

fastify.register(userRoutes, { prefix: '/api/users' })
```

Fastify plugins provide encapsulation, meaning each plugin has its own scope
for decorators, hooks, and plugins. This is more powerful than Express routers
because it allows true isolation between different parts of the application.

## Authentication Middleware
<a id="authentication-middleware"></a>

### Express

```js
function authenticate (req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  try {
    req.user = jwt.verify(token, SECRET)
    next()
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' })
  }
}

app.get('/protected', authenticate, (req, res) => {
  res.json({ user: req.user })
})
```

### Fastify

Using [`@fastify/auth`](https://github.com/fastify/fastify-auth) or a
`preHandler` hook with a
[decorator](../Reference/Decorators.md):

```js
fastify.decorate('authenticate', async function (request, reply) {
  const token = request.headers.authorization?.split(' ')[1]
  if (!token) {
    reply.code(401).send({ error: 'Unauthorized' })
    return
  }
  try {
    request.user = jwt.verify(token, SECRET)
  } catch (err) {
    reply.code(401).send({ error: 'Invalid token' })
  }
})

fastify.get('/protected', {
  preHandler: [fastify.authenticate]
}, async (request, reply) => {
  return { user: request.user }
})
```

Alternatively, use
[`@fastify/jwt`](https://github.com/fastify/fastify-jwt) for a
complete JWT solution:

```js
fastify.register(require('@fastify/jwt'), { secret: 'your-secret' })

fastify.decorate('authenticate', async function (request, reply) {
  await request.jwtVerify()
})

fastify.get('/protected', {
  preHandler: [fastify.authenticate]
}, async (request, reply) => {
  return { user: request.user }
})
```

## CORS
<a id="cors"></a>

### Express

```js
const cors = require('cors')
app.use(cors({ origin: 'http://localhost:3000' }))
```

### Fastify

Use the [`@fastify/cors`](https://github.com/fastify/fastify-cors) plugin:

```js
fastify.register(require('@fastify/cors'), {
  origin: 'http://localhost:3000'
})
```

## Testing
<a id="testing"></a>

### Express (with supertest)

```js
const request = require('supertest')
const app = require('./app')

describe('GET /', () => {
  it('should return hello world', async () => {
    const res = await request(app).get('/')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ hello: 'world' })
  })
})
```

### Fastify (with inject)

Fastify provides a built-in `.inject()` method for testing without starting a
server:

```js
const build = require('./app')

describe('GET /', () => {
  let fastify

  beforeEach(async () => {
    fastify = build()
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
  })

  it('should return hello world', async () => {
    const response = await fastify.inject({
      method: 'GET',
      url: '/'
    })
    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ hello: 'world' })
  })
})
```

The `.inject()` method simulates HTTP requests in-process without binding to a
port, making tests faster and eliminating port conflicts.

## TypeScript
<a id="typescript"></a>

### Express

```ts
import express, { Request, Response } from 'express'

const app = express()

app.get('/users/:id', (req: Request, res: Response) => {
  res.json({ id: req.params.id })
})
```

### Fastify

Fastify provides first-class TypeScript support with generics for route
schemas:

```ts
import Fastify, { FastifyRequest, FastifyReply } from 'fastify'

const fastify = Fastify({ logger: true })

interface UserParams {
  id: string
}

fastify.get<{ Params: UserParams }>('/users/:id', async (request, reply) => {
  const { id } = request.params // id is typed as string
  return { id }
})
```

For full type inference from JSON Schema, consider using a type provider such as
[`@fastify/type-provider-typebox`](https://github.com/fastify/fastify-type-provider-typebox)
or
[`@fastify/type-provider-json-schema-to-ts`](https://github.com/fastify/fastify-type-provider-json-schema-to-ts):

```ts
import Fastify from 'fastify'
import { TypeBoxTypeProvider } from '@fastify/type-provider-typebox'
import { Type } from '@sinclair/typebox'

const fastify = Fastify({ logger: true }).withTypeProvider<TypeBoxTypeProvider>()

fastify.get('/users/:id', {
  schema: {
    params: Type.Object({
      id: Type.String()
    }),
    response: {
      200: Type.Object({
        id: Type.String(),
        name: Type.String()
      })
    }
  }
}, async (request, reply) => {
  // request.params.id is fully typed
  return { id: request.params.id, name: 'Alice' }
})
```

## Summary of Key Differences

| Concept | Express | Fastify |
|---------|---------|---------|
| Middleware | `app.use(fn)` | Hooks + Plugins |
| Body parsing | `express.json()` | Built-in |
| Validation | External libraries | Built-in JSON Schema |
| Logging | External (morgan, winston) | Built-in (Pino) |
| Route grouping | `express.Router()` | `fastify.register()` with prefix |
| Error handling | Error middleware `(err, req, res, next)` | `setErrorHandler()` |
| Testing | supertest | Built-in `.inject()` |
| TypeScript | `@types/express` | First-class support |
| Serialization | Manual | Schema-based (fast-json-stringify) |
| Plugin system | None (middleware only) | Encapsulated plugin system |

## Further Reading

- [Getting Started](./Getting-Started.md)
- [Plugins Guide](./Plugins-Guide.md)
- [Hooks](../Reference/Hooks.md)
- [Validation and Serialization](../Reference/Validation-and-Serialization.md)
- [Testing](./Testing.md)
- [Decorators](../Reference/Decorators.md)
- [Ecosystem](./Ecosystem.md)
