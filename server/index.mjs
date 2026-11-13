import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import mysql from 'mysql2/promise'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const HOST = process.env.API_HOST || '127.0.0.1'
const PORT = Number(process.env.API_PORT || 3301)

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function databaseName(input = {}) {
  const database = String(input.database ?? '').trim()
  if (!database) throw new HttpError(400, '请选择数据库')
  if (database.length > 64) throw new HttpError(400, '数据库名过长')
  return database
}

function tableName(input = {}) {
  const table = String(input.table ?? '').trim()
  if (!table) throw new HttpError(400, '请选择数据表')
  if (table.length > 64) throw new HttpError(400, '数据表名过长')
  return table
}

function normalizeValue(value) {
  if (value === null || value === undefined) return ''
  if (Buffer.isBuffer(value)) return `[二进制 ${value.length} 字节]`
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function normalizeRow(row) {
  const out = {}
  for (const [key, value] of Object.entries(row)) out[key] = normalizeValue(value)
  return out
}

/* ---------------------------------------------------------------- drivers */

function mysqlOptions(input = {}) {
  const host = String(input.host ?? process.env.MYSQL_HOST ?? '127.0.0.1').trim()
  const port = Number(input.port ?? process.env.MYSQL_PORT ?? 3306)
  const user = String(input.user ?? process.env.MYSQL_USER ?? 'root').trim()
  const password =
    input.password !== undefined && input.password !== null
      ? String(input.password)
      : String(process.env.MYSQL_PASSWORD ?? '')

  if (!host || host.length > 255) throw new HttpError(400, 'MySQL 主机地址不正确')
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HttpError(400, 'MySQL 端口不正确')
  }
  if (!user || user.length > 128) throw new HttpError(400, 'MySQL 用户名不能为空')
  if (password.length > 512) throw new HttpError(400, 'MySQL 密码过长')

  return {
    host,
    port,
    user,
    password,
    connectTimeout: 6000,
    charset: 'utf8mb4',
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true,
  }
}

async function withMysqlConnection(options, run) {
  const connection = await mysql.createConnection(options)
  try {
    return await run(connection)
  } finally {
    await connection.end().catch(() => {})
  }
}

const MYSQL_SYSTEM_DATABASES = new Set([
  'information_schema',
  'mysql',
  'performance_schema',
  'sys',
])

const DRIVERS = {
  mysql: {
    label: 'MySQL',
    options: mysqlOptions,

    connect(options) {
      return withMysqlConnection(options, async (connection) => {
        const [versionRows] = await connection.query('SELECT VERSION() AS version')
        const [databaseRows] = await connection.query('SHOW DATABASES')
        const databases = databaseRows
          .map((row) => row.Database)
          .filter((name) => name && !MYSQL_SYSTEM_DATABASES.has(name))
        return {
          version: versionRows[0]?.version || '',
          databases,
        }
      })
    },

    tables(options, database) {
      return withMysqlConnection({ ...options, database }, async (connection) => {
        const [rows] = await connection.query(
          `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, TABLE_COMMENT AS comment
             FROM information_schema.TABLES
            WHERE TABLE_SCHEMA = ?
            ORDER BY TABLE_NAME`,
          [database],
        )
        return {
          tables: rows.map((row) => ({
            name: row.name,
            type: row.type === 'VIEW' ? 'view' : 'table',
            // Views report "VIEW" as their comment, which is not useful in the UI.
            comment: row.type === 'VIEW' ? '' : row.comment || '',
          })),
        }
      })
    },

    columns(options, database, table, limit) {
      return withMysqlConnection({ ...options, database }, async (connection) => {
        const [columnRows] = await connection.query(
          `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
                  COLUMN_KEY AS \`key\`, COLUMN_COMMENT AS comment,
                  COLUMN_DEFAULT AS defaultValue
             FROM information_schema.COLUMNS
            WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
            ORDER BY ORDINAL_POSITION`,
          [database, table],
        )
        if (!columnRows.length) {
          throw new HttpError(404, '数据表不存在或没有字段')
        }

        const select = `SELECT * FROM ${mysql.escapeId(database)}.${mysql.escapeId(table)} LIMIT ${limit}`
        const [rows] = await connection.query(select)

        return {
          columns: columnRows.map((row) => ({
            name: row.name,
            type: row.type,
            nullable: row.nullable === 'YES',
            key: row.key || '',
            comment: row.comment || '',
            defaultValue:
              row.defaultValue === null ? null : String(row.defaultValue),
          })),
          rows: rows.map(normalizeRow),
        }
      })
    },
  },
  // Future: add `postgres` (pg) and `sqlserver` (mssql) drivers with the same
  // connect / tables / columns contract. The UI already exposes type selection.
}

async function withDriver(body, run) {
  const type = String(body.type || 'mysql').toLowerCase()
  const driver = DRIVERS[type]
  if (!driver) {
    throw new HttpError(400, `暂不支持该数据源类型：${type}`)
  }
  const config = driver.options(body)
  try {
    return await run(driver, config, type)
  } catch (error) {
    if (!(error instanceof HttpError)) {
      error.datasourceContext = { type, host: config.host, port: config.port }
    }
    throw error
  }
}

/** Friendly, non-sensitive error text for the UI. */
function describeError(error, context = {}) {
  switch (error?.code) {
    case 'ER_ACCESS_DENIED_ERROR':
    case '28000':
    case '28P01':
    case 'ELOGIN':
      return '数据库用户名或密码错误'
    case 'ECONNREFUSED':
      return `无法连接数据库（${context.host || '?'}:${context.port || '?'}），请确认服务已启动`
    case 'ENOTFOUND':
      return `找不到数据库主机 ${context.host || ''}`
    case 'ETIMEDOUT':
    case 'PROTOCOL_SEQUENCE_TIMEOUT':
      return '连接数据库超时'
    case 'ER_BAD_DB_ERROR':
    case '3D000':
      return '数据库不存在'
    case 'ER_NO_SUCH_TABLE':
    case '42P01':
      return '数据表不存在'
    default:
      return error?.sqlMessage || error?.message || '数据库查询失败'
  }
}

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '64kb' }))

function route(handler) {
  return async (req, res) => {
    try {
      res.json(await handler(req.body ?? {}))
    } catch (error) {
      if (error instanceof HttpError) {
        res.status(error.status).json({ error: error.message })
        return
      }
      console.error('[datasource]', error?.code || '', error?.message || error)
      res
        .status(502)
        .json({ error: describeError(error, error?.datasourceContext) })
    }
  }
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true })
})

app.post(
  '/api/datasource/connect',
  route(async (body) =>
    withDriver(body, (driver, config) => driver.connect(config)),
  ),
)

app.post(
  '/api/datasource/tables',
  route(async (body) =>
    withDriver(body, (driver, config) => {
      const database = databaseName(body)
      return driver.tables(config, database)
    }),
  ),
)

app.post(
  '/api/datasource/columns',
  route(async (body) =>
    withDriver(body, (driver, config) => {
      const database = databaseName(body)
      const table = tableName(body)
      const requested = Number(body.limit)
      const limit = Number.isFinite(requested)
        ? Math.min(Math.max(Math.trunc(requested), 1), 20)
        : 1
      return driver.columns(config, database, table, limit)
    }),
  ),
)

const distDir = path.join(root, 'dist')
const hasBuild = fs.existsSync(path.join(distDir, 'index.html'))

if (hasBuild) {
  app.use(express.static(distDir))
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) {
      next()
      return
    }
    res.sendFile(path.join(distDir, 'index.html'))
  })
} else {
  app.get('/', (req, res) => {
    res
      .type('text/plain; charset=utf-8')
      .send('DoPrint 数据服务已启动。开发模式请访问 Vite 地址（npm run dev）。')
  })
}

app.use('/api', (req, res) => {
  res.status(404).json({ error: '接口不存在' })
})

app.use((error, req, res, next) => {
  if (res.headersSent) {
    next(error)
    return
  }
  if (error?.type === 'entity.parse.failed') {
    res.status(400).json({ error: '请求数据不是有效的 JSON' })
    return
  }
  console.error('[server]', error)
  res.status(500).json({ error: '数据服务内部错误' })
})

const server = app.listen(PORT, HOST, () => {
  console.log(`[doprint] 数据服务 http://${HOST}:${PORT}`)
  if (hasBuild) console.log(`[doprint] 设计器   http://${HOST}:${PORT}/`)
})

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(
      `[doprint] 端口 ${PORT} 已被占用，可用 API_PORT=其他端口 启动。`,
    )
  } else {
    console.error('[doprint] 数据服务启动失败：', error)
  }
  process.exit(1)
})
