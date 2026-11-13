<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { CheckCircle2, Database, PlugZap, RefreshCw, X } from 'lucide-vue-next'
import mysqlLogo from '../assets/db/mysql.svg'
import postgresqlLogo from '../assets/db/postgresql.svg'
import sqlServerLogo from '../assets/db/sqlserver.svg'
import { useDesigner } from '../designer/context'
import {
  connectDataSource,
  fetchDataSourceFields,
  listDataSourceTables,
  type DataSourceColumn,
  type DataSourceCredentials,
  type DataSourceTable,
  type DataSourceType,
} from '../api/datasource'

interface SourceTypeOption {
  id: DataSourceType
  label: string
  logo: string
  tint: string
  description: string
  enabled: boolean
}

// Brand marks from Devicon (MIT) and Simple Icons (CC0): https://devicon.dev
const SOURCE_TYPES: SourceTypeOption[] = [
  {
    id: 'mysql',
    label: 'MySQL',
    logo: mysqlLogo,
    tint: '#eef7fb',
    description: 'MySQL 5.7 / 8.x',
    enabled: true,
  },
  {
    id: 'postgres',
    label: 'PostgreSQL',
    logo: postgresqlLogo,
    tint: '#eef3fb',
    description: 'PostgreSQL 12+',
    enabled: false,
  },
  {
    id: 'sqlserver',
    label: 'SQL Server',
    logo: sqlServerLogo,
    tint: '#fdf2f2',
    description: 'SQL Server 2016+',
    enabled: false,
  },
]

type Step = 'type' | 'connect' | 'fields'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const designer = useDesigner()
const STORAGE_KEY = 'doprint.datasource.mysql'

const step = ref<Step>('type')
const selectedType = ref<DataSourceType>('mysql')
const typeMeta = computed(
  () =>
    SOURCE_TYPES.find((option) => option.id === selectedType.value) ??
    SOURCE_TYPES[0],
)
const canContinue = computed(() => typeMeta.value.enabled)

const conn = reactive({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: '',
})

// Reuse settings from the previous inline MySQL form when present.
try {
  const saved = JSON.parse(
    localStorage.getItem(STORAGE_KEY) ||
      localStorage.getItem('doprint.mysql.connection') ||
      '{}',
  )
  if (typeof saved.host === 'string' && saved.host) conn.host = saved.host
  if (Number.isInteger(saved.port)) conn.port = saved.port
  if (typeof saved.user === 'string' && saved.user) conn.user = saved.user
  if (typeof saved.database === 'string') conn.database = saved.database
} catch {
  // Ignore damaged localStorage entries and keep the defaults.
}

watch(
  () => [conn.host, conn.port, conn.user, conn.database],
  () => {
    if (selectedType.value !== 'mysql') return
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          host: conn.host,
          port: conn.port,
          user: conn.user,
          database: conn.database,
        }),
      )
    } catch {
      // Storage may be unavailable (private mode); the form still works.
    }
  },
)

const version = ref('')
const databases = ref<string[]>([])
const tables = ref<DataSourceTable[]>([])
const columns = ref<DataSourceColumn[]>([])
const sampleRow = ref<Record<string, string> | null>(null)
const selectedColumns = ref<Set<string>>(new Set())
const selectedTable = ref('')
const loading = ref<'' | 'connect' | 'tables' | 'columns'>('')
const error = ref('')

const busy = computed(() => loading.value !== '')
const allSelected = computed(
  () =>
    columns.value.length > 0 &&
    selectedColumns.value.size === columns.value.length,
)

function credentials(): DataSourceCredentials {
  return {
    type: selectedType.value,
    host: conn.host.trim(),
    port: Number(conn.port),
    user: conn.user.trim(),
    password: conn.password,
  }
}

function resetTables() {
  tables.value = []
  columns.value = []
  sampleRow.value = null
  selectedColumns.value = new Set()
  selectedTable.value = ''
}

function goNext() {
  if (step.value !== 'type' || !canContinue.value) return
  error.value = ''
  step.value = 'connect'
}

function goBack() {
  if (busy.value) return
  error.value = ''
  if (step.value === 'fields') step.value = 'connect'
  else if (step.value === 'connect') step.value = 'type'
}

async function connect() {
  if (busy.value) return
  error.value = ''
  loading.value = 'connect'
  let connected = false
  try {
    const result = await connectDataSource(credentials())
    if (!result.databases.length) {
      throw new Error('该账号下没有可用的数据库')
    }
    version.value = result.version
    databases.value = result.databases
    conn.database = result.databases.includes(conn.database)
      ? conn.database
      : result.databases[0]
    resetTables()
    step.value = 'fields'
    connected = true
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    loading.value = ''
  }
  if (connected) await loadTables()
}

async function loadTables() {
  if (!conn.database || busy.value) return
  error.value = ''
  loading.value = 'tables'
  resetTables()
  try {
    const result = await listDataSourceTables(credentials(), conn.database)
    tables.value = result.tables
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    loading.value = ''
  }
}

async function onDatabaseChange() {
  if (busy.value) return
  await loadTables()
}

async function loadFields() {
  if (!conn.database || !selectedTable.value || busy.value) return
  error.value = ''
  loading.value = 'columns'
  columns.value = []
  sampleRow.value = null
  selectedColumns.value = new Set()
  try {
    const result = await fetchDataSourceFields(
      credentials(),
      conn.database,
      selectedTable.value,
      1,
    )
    columns.value = result.columns
    sampleRow.value = result.rows[0] ?? null
    selectedColumns.value = new Set(result.columns.map((column) => column.name))
  } catch (err) {
    error.value = (err as Error).message
  } finally {
    loading.value = ''
  }
}

function tableLabel(item: DataSourceTable) {
  if (item.type === 'view') return `${item.name}（视图）`
  return item.comment ? `${item.name}（${item.comment}）` : item.name
}

function toggleColumn(name: string) {
  const next = new Set(selectedColumns.value)
  if (next.has(name)) next.delete(name)
  else next.add(name)
  selectedColumns.value = next
}

function toggleAll() {
  selectedColumns.value = allSelected.value
    ? new Set()
    : new Set(columns.value.map((column) => column.name))
}

function importFields() {
  const fields = columns.value
    .filter((column) => selectedColumns.value.has(column.name))
    .map((column) => ({
      key: column.name,
      value: sampleRow.value?.[column.name] ?? '',
    }))
  if (!fields.length) {
    error.value = '请至少选择一个字段'
    return
  }
  designer.importDataFields(fields)
  emit('close')
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') emit('close')
}

onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div class="source-modal-mask" data-modal @click.self="emit('close')">
      <div
        class="source-modal"
        role="dialog"
        aria-modal="true"
        aria-label="连接数据源"
      >
        <div class="source-modal-head">
          <div class="source-modal-title">
            <span class="source-modal-icon"><Database :size="17" /></span>
            <div>
              <strong>连接数据源</strong>
              <span>读取表结构，把字段和示例值导入当前模板</span>
            </div>
          </div>
          <button class="icon-btn" title="关闭" @click="emit('close')">
            <X :size="17" />
          </button>
        </div>

        <div class="source-steps">
          <span :class="{ active: step === 'type', done: step !== 'type' }">
            <em>1</em>选择类型
          </span>
          <span :class="{ active: step === 'connect', done: step === 'fields' }">
            <em>2</em>连接
          </span>
          <span :class="{ active: step === 'fields' }"><em>3</em>选择字段</span>
        </div>

        <div class="source-modal-body">
          <!-- ---------------------------------------------------- step 1 -->
          <template v-if="step === 'type'">
            <p class="source-lead">
              选择要连接的数据库类型。后续会逐步支持更多数据库。
            </p>
            <div class="source-type-grid">
              <button
                v-for="option in SOURCE_TYPES"
                :key="option.id"
                type="button"
                class="source-type-card"
                :class="{
                  active: selectedType === option.id,
                  disabled: !option.enabled,
                }"
                :disabled="!option.enabled"
                @click="selectedType = option.id"
              >
                <span class="source-type-icon" :style="{ background: option.tint }">
                  <img :src="option.logo" alt="" draggable="false" />
                </span>
                <span class="source-type-copy">
                  <strong>{{ option.label }}</strong>
                  <span>{{ option.description }}</span>
                </span>
                <span v-if="option.enabled" class="source-type-badge">已支持</span>
                <span v-else class="source-type-badge soon">即将支持</span>
              </button>
            </div>
          </template>

          <!-- ---------------------------------------------------- step 2 -->
          <template v-else-if="step === 'connect'">
            <p class="source-lead">
              连接 {{ typeMeta.label }}。密码只发送到本机数据服务，不会保存。
            </p>
            <div class="source-conn-grid">
              <label class="source-field">
                <span>主机</span>
                <input
                  v-model.trim="conn.host"
                  spellcheck="false"
                  placeholder="127.0.0.1"
                />
              </label>
              <label class="source-field">
                <span>端口</span>
                <input v-model.number="conn.port" type="number" min="1" max="65535" />
              </label>
              <label class="source-field">
                <span>用户</span>
                <input v-model.trim="conn.user" spellcheck="false" placeholder="root" />
              </label>
              <label class="source-field">
                <span>密码</span>
                <input
                  v-model="conn.password"
                  type="password"
                  autocomplete="new-password"
                  placeholder="数据库密码"
                  @keyup.enter="connect"
                />
              </label>
            </div>
            <p v-if="error" class="source-error">{{ error }}</p>
            <p class="source-note">
              建议使用只读账号。设计器只读取表结构，以及表的第一行数据作为示例值。
            </p>
          </template>

          <!-- ---------------------------------------------------- step 3 -->
          <template v-else>
            <div class="source-connected">
              <span class="source-ok">
                <CheckCircle2 :size="14" />
                {{ typeMeta.label }} {{ version }}
              </span>
              <span>{{ databases.length }} 个数据库</span>
            </div>

            <div class="source-selects">
              <label class="source-field">
                <span>数据库</span>
                <select
                  v-model="conn.database"
                  :disabled="busy || !databases.length"
                  @change="onDatabaseChange"
                >
                  <option
                    v-for="database in databases"
                    :key="database"
                    :value="database"
                  >
                    {{ database }}
                  </option>
                </select>
              </label>
              <label class="source-field source-grow">
                <span>数据表</span>
                <select
                  v-model="selectedTable"
                  :disabled="busy || !tables.length"
                  @change="loadFields"
                >
                  <option v-if="!tables.length" value="">
                    {{ loading === 'tables' ? '读取中…' : '没有数据表' }}
                  </option>
                  <option v-for="item in tables" :key="item.name" :value="item.name">
                    {{ tableLabel(item) }}
                  </option>
                </select>
              </label>
              <button
                class="icon-btn"
                title="刷新数据表"
                :disabled="busy || !conn.database"
                @click="loadTables"
              >
                <RefreshCw :size="15" />
              </button>
            </div>

            <p v-if="loading === 'columns'" class="source-note">正在读取字段…</p>

            <div v-if="columns.length" class="source-columns">
              <div class="source-columns-head">
                <button type="button" class="source-link" @click="toggleAll">
                  {{ allSelected ? '取消全选' : '全选' }}
                </button>
                <span>{{ selectedColumns.size }} / {{ columns.length }} 个字段</span>
              </div>
              <div class="source-columns-list">
                <label
                  v-for="column in columns"
                  :key="column.name"
                  class="source-column"
                  :title="column.comment || column.name"
                >
                  <input
                    type="checkbox"
                    :checked="selectedColumns.has(column.name)"
                    @change="toggleColumn(column.name)"
                  />
                  <span class="source-col-name">{{ column.name }}</span>
                  <span class="source-col-type">{{ column.type }}</span>
                  <span class="source-col-value">
                    {{ sampleRow?.[column.name] || '—' }}
                  </span>
                </label>
              </div>
              <p class="source-note source-columns-note">
                示例值取自表的第一行，导入后可以在数据面板中修改。
              </p>
            </div>

            <p v-if="error" class="source-error">{{ error }}</p>
          </template>
        </div>

        <div class="source-modal-foot">
          <template v-if="step === 'type'">
            <div class="source-foot-spacer"></div>
            <button class="btn primary" :disabled="!canContinue" @click="goNext">
              下一步
            </button>
          </template>
          <template v-else-if="step === 'connect'">
            <button class="btn ghost" :disabled="busy" @click="goBack">
              上一步
            </button>
            <div class="source-foot-spacer"></div>
            <button
              class="btn primary"
              :disabled="busy || !conn.host || !conn.user"
              @click="connect"
            >
              <PlugZap :size="15" />
              {{ loading === 'connect' ? '连接中…' : '连接' }}
            </button>
          </template>
          <template v-else>
            <button class="btn ghost" :disabled="busy" @click="goBack">
              上一步
            </button>
            <div class="source-foot-spacer"></div>
            <button
              class="btn primary"
              :disabled="!selectedColumns.size"
              @click="importFields"
            >
              <Database :size="15" />
              导入 {{ selectedColumns.size }} 个字段
            </button>
          </template>
        </div>
      </div>
  </div>
</template>
