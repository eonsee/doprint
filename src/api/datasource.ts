export type DataSourceType = 'mysql' | 'postgres' | 'sqlserver'

export interface DataSourceCredentials {
  type: DataSourceType
  host: string
  port: number
  user: string
  password: string
}

export interface DataSourceTable {
  name: string
  type: 'table' | 'view'
  comment: string
}

export interface DataSourceColumn {
  name: string
  type: string
  nullable: boolean
  key: string
  comment: string
  defaultValue: string | null
}

export interface DataSourceTableData {
  columns: DataSourceColumn[]
  rows: Record<string, string>[]
}

interface DataSourceConnectResult {
  version: string
  databases: string[]
}

async function post<T>(path: string, body: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new Error(
      '无法连接本地数据服务，请确认已通过 npm run dev 启动（或 npm start）',
    )
  }

  const data = (await response.json().catch(() => null)) as {
    error?: string
  } | null
  if (!response.ok) {
    throw new Error(data?.error || `请求失败（HTTP ${response.status}）`)
  }
  return data as T
}

export function connectDataSource(credentials: DataSourceCredentials) {
  return post<DataSourceConnectResult>('/api/datasource/connect', credentials)
}

export function listDataSourceTables(
  credentials: DataSourceCredentials,
  database: string,
) {
  return post<{ tables: DataSourceTable[] }>('/api/datasource/tables', {
    ...credentials,
    database,
  })
}

export function fetchDataSourceFields(
  credentials: DataSourceCredentials,
  database: string,
  table: string,
  limit = 1,
) {
  return post<DataSourceTableData>('/api/datasource/columns', {
    ...credentials,
    database,
    table,
    limit,
  })
}
