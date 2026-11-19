# DoPrint 设计器

一款轻量化面向打印场景的可视化模板设计器，秉承极致的设计方案、告别复杂的设计模式、拥有流畅的设计体验和简单容易的集成效果。

（Vue 3 / Vue 2.7 组件库），支持文本、图形、图片、专业表格、二维码 / 条形码、数据绑定、毫米刻度尺、参考线、多模板管理，以及 SVG / PDF 预览与导出。

[官网](https://doprint.top) · [在线体验](https://doprint.fios.top) · [GitHub](https://github.com/eonsee/doprint) · [Gitee](https://gitee.com/mayekun/doprint)

![DoPrint 设计器总览](docs/images/overview.png)

*基于在线体验环境的 A4 产品标签示例：表格、二维码 / 条形码、版权水印与页面属性面板*

## 项目亮点

- **真实毫米尺寸的打印设计**：画布、元素、表格和底图全部使用毫米坐标，支持纸张预设、自定义尺寸、页边距、毫米刻度尺、参考线、网格与吸附，设计结果与打印尺寸一致
- **专业表格 + 多联标签**：自研 Univer 风格稀疏表格模型，支持单元格编辑、合并 / 拆分、逐边边框、行列拖拽与整体缩放旋转；一键生成 3 × 5 多联标签阵列，适合整版标签纸
- **字段驱动的复选框**：除 `{{字段名}}` 文本绑定外，支持 `{{#字段=值|☑|□}}` 勾选绑定；可把一个字段的多个取值一次性绑定到单元格中的多个方框，并可为每个方框填写描述文本；表格单元格会按示例数据直接显示勾选符号，预览和导出时自动替换
- **纸张底图对位与套打**：可导入扫描件或现有纸质单据作为纸张最底层底图，鼠标拖动平移、滚轮缩放或输入毫米值精确定位；「套打模式」下底图只作对位参考、不进入打印输出，并支持打印偏移校准，便于把数据套印到预印表单上
- **深色主题与界面自定义**：浅色 / 深色主题一键切换并持久化；「全局属性」可控制左侧工具、顶部主栏 / 属性栏、右侧标签页与属性分组的显示，偏好自动保存
- **不打断思路的编辑体验**：模板自动保存，撤销 / 重做保持当前缩放与滚动位置；点击纸张外空白区域即可取消选择，表格单元格修改即时生效；示例数据字段可一键开关后直接拖入页面生成绑定文本
- **模板中心**：内置开票联络单、商品价签、A5 送货单、出库单（明细重复）与物流面单等官方示例模板，实时生成缩略图，一键克隆到本地模板库后即可修改使用
- **多格式可印刷输出**：按实际毫米生成矢量 SVG 与 PDF，支持下载与打印；可导出 PNG / JPG / WebP 图片，也可导出 / 导入模板 JSON，在不同浏览器或设备间迁移
- **开箱即用的组件库**：同时提供 Vue 3 与 Vue 2.7 构建、ESM + CJS 与类型声明；支持 `closable`、主题切换和界面可见性 API，便于嵌入弹窗、抽屉或自有系统
- **本地优先的数据能力**：模板与示例数据默认保存在浏览器；可通过本机 Node 服务读取 MySQL 表结构和示例值，密码不落盘

## 功能特性

- **可视化设计**：文本、表格、多联标签、矩形、椭圆、线条、图片、二维码、条形码均可拖拽、缩放、旋转，并支持图层排序
- **专业表格**：支持单元格编辑、合并 / 拆分、逐边边框、对齐、加粗、行高列宽与整体缩放
- **数据绑定**：文本、表格单元格、二维码和条形码都支持 `{{字段名}}`，可从示例数据、JSON 或数据库字段中导入；可在「数据」面板开启「拖入页面」，把字段拖到画布落点直接生成绑定文本；默认在设计时显示示例值，避免占位符过长导致换行遮挡
- **主从明细绑定**：JSON 中的对象数组会识别为明细集合，表格可指定一行作为明细模板行，预览 / 导出时按子表行数自动重复，一条主表数据即可打印多条货品明细
- **特殊字符与复选框**：左侧「符号」可插入 □ / ☑ / ✓ 等字符，并支持把复选框绑定到字段（如 `{{#票种=普|☑|□}}`），预览 / 导出时按字段值显示勾选状态
- **打印版式**：画布以毫米为单位，支持 A4 / A5 / B5 / 连续纸 / 标签 / 自定义纸张、页边距可视化、毫米刻度尺、拖拽参考线、网格与吸附
- **纸张底图与套打**：可导入扫描件或已有模板图片铺在纸张最底层用于对位设计，支持显示开关、透明度、铺满 / 适应 / 拉伸，以及拖动平移 / 滚轮缩放 / 毫米值精确定位；套打模式下底图不随输出打印，并可设置打印偏移校准

- **深色主题**：顶栏按钮一键切换浅色 / 深色界面，偏好保存在浏览器；纸张与导出结果始终保持打印原色
- **界面自定义**：顶栏「全局属性」可按需显示 / 隐藏左侧工具、顶部主栏功能、顶部页面 / 元素属性、右侧标签页及页面 / 元素属性分组，偏好保存在浏览器
- **二维码 / 条形码**：二维码支持 UTF-8 文本，条形码使用 Code128，可直接绑定订单号等数据
- **版权水印**：可开启 / 关闭平铺水印，默认文字为 `Doprint预览版`，随模板保存并包含在预览 / 导出中
- **多模板管理**：每个模板独立自动保存到浏览器 localStorage，可新建、切换、导入和导出；顶栏「模板中心」提供官方示例模板，一键复制后即可修改
- **多种输出**：矢量预览并下载 SVG、按打印尺寸预览并下载 PDF、导出 / 导入模板 JSON
- **本地数据源**：通过本机 Node 服务读取 MySQL 库表结构和少量示例数据，密码不落盘
- **撤销 / 重做**：支持完整的编辑历史、快捷键操作和元素位置微调；撤销 / 重做时保持当前画布缩放与滚动位置

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端框架 | Vue 3 / Vue 2.7 + TypeScript |
| 构建工具 | Vite 4 |
| 画布与交互 | Fabric.js 6 |
| 表格模型 | 自研 Univer 风格稀疏数据模型 |
| 二维码 / 条形码 | qrcode + JsBarcode |
| PDF 生成 | pdf-lib |
| 图标 | lucide-vue-next |
| 本地数据服务 | Node.js + Express + mysql2 |
| 存储 | 浏览器 localStorage（模板 / 示例数据） |

## 快速开始

建议使用 Node.js 18 或更高版本。

```bash
npm install
npm run dev
```

`npm run dev` 会同时启动：

- 设计器：http://localhost:5173
- 本地数据服务：http://127.0.0.1:3301

开发服务器会将 `/api` 代理到本地数据服务。也可以分别启动：

```bash
npm run dev:web   # 只启动前端
npm run dev:api   # 只启动数据服务
```

生产模式：

```bash
npm run build
npm start
# 打开 http://127.0.0.1:3301
```

## 集成到你的项目（npm 组件库）

设计器同时提供 **Vue 3** 与 **Vue 2.7+** 两套构建，按项目所用版本选择入口（Vue 2.6 及更早版本不支持）。两套构建都包含 ESM + CJS 与 `.d.ts` 类型声明。

### 安装与版本要求

```bash
npm install doprint-designer
```

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Vue | `^3.5.0` 或 `^2.7.0` | peerDependency，由宿主项目提供 |
| Node.js | 18+ | 仅开发 / 构建需要，浏览器运行时不依赖 Node |

相关运行时依赖会随 `doprint-designer` 自动安装，无需单独引入；图标资源已经打进构建产物，不需要额外安装。

### 包入口

| 入口 | 内容 |
| --- | --- |
| `doprint-designer/vue3` | Vue 3 组件、`createDesigner`、`provideDesigner` / `useDesigner` 与全部类型 |
| `doprint-designer/vue3/style.css` | Vue 3 样式（必须引入） |
| `doprint-designer/vue2` | Vue 2.7 组件与类型 |
| `doprint-designer/vue2/style.css` | Vue 2 样式（必须引入） |
| `doprint-designer` | 等同于 `doprint-designer/vue3` |

### 组件属性与事件

| 属性 | 类型 | 默认值 | 说明 |
| --- | --- | --- | --- |
| `closable` | `boolean` | `false` | 在顶栏显示关闭按钮。组件不会自动隐藏，由宿主监听 `close` 后决定隐藏或卸载 |

| 事件 | 参数 | 说明 |
| --- | --- | --- |
| `ready` | `Designer` | 组件挂载完成，返回设计器实例 |
| `close` | - | 点击顶栏关闭按钮时触发（`closable` 为 `true` 时可用） |

嵌入弹窗、抽屉或页面区域时，宿主可以自行控制显示：

```vue
<template>
  <div v-if="designerOpen" class="designer-host">
    <DoPrintDesigner closable @ready="onReady" @close="designerOpen = false" />
  </div>
</template>
```

### Vue 3 集成

```vue
<!-- App.vue -->
<template>
  <!-- 容器必须有明确高度，设计器会撑满父容器 -->
  <div class="designer-host">
    <DoPrintDesigner @ready="onReady" />
  </div>
</template>

<script setup lang="ts">
import { DoPrintDesigner, type Designer, type PageTemplate } from 'doprint-designer/vue3'
import 'doprint-designer/vue3/style.css'

let designer: Designer | null = null

function onReady(instance: Designer) {
  // 组件挂载完成，拿到设计器实例
  designer = instance
}

/** 保存模板：serialize() 返回可直接 JSON 序列化的 PageTemplate */
function saveTemplate() {
  if (!designer) return
  const template: PageTemplate = designer.serialize()
  return JSON.stringify(template)
}

/** 回显模板：传入手工保存的 JSON 文本 */
async function loadTemplate(text: string) {
  await designer?.importTemplate(text)
}

/** 按打印尺寸导出 PDF 字节 */
async function exportPdf() {
  if (!designer) return
  const bytes: Uint8Array = await designer.generatePDF()
  const blob = new Blob([bytes], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  window.open(url)
  URL.revokeObjectURL(url)
}
</script>

<style>
.designer-host {
  height: 100vh;
}
</style>
```

### Vue 2.7+ 集成

```js
// main.js
import Vue from 'vue'
import App from './App.vue'
import { DoPrintDesigner } from 'doprint-designer/vue2'
import 'doprint-designer/vue2/style.css'

Vue.component('DoPrintDesigner', DoPrintDesigner)

new Vue({ render: (h) => h(App) }).$mount('#app')
```

```vue
<!-- App.vue -->
<template>
  <div class="designer-host">
    <DoPrintDesigner @ready="onReady" />
  </div>
</template>

<script>
export default {
  data() {
    return { designer: null }
  },
  methods: {
    onReady(designer) {
      this.designer = designer
    },
    saveTemplate() {
      return JSON.stringify(this.designer.serialize())
    },
    async loadTemplate(text) {
      await this.designer.importTemplate(text)
    },
  },
}
</script>

<style>
.designer-host {
  height: 100vh;
}
</style>
```

### 设计器实例 API

`ready` 事件在组件挂载后触发，参数是设计器实例，与 `createDesigner()` 的返回值一致。常用方法：

| 方法 | 说明 |
| --- | --- |
| `serialize()` | 导出当前模板为 `PageTemplate` 普通对象，可直接保存到后端 |
| `importTemplate(text)` | 从 JSON 文本导入模板并重建画布 |
| `generateSVG()` | 生成矢量 SVG 字符串 |
| `generatePDF()` | 生成 PDF 字节（`Uint8Array`） |
| `generateImage(format)` / `downloadImage(format)` | 生成 / 下载 PNG、JPG、WebP 图片（300dpi 以内，白底） |
| `newTemplate()` / `openTemplate(id)` | 新建 / 切换本地模板 |
| `duplicateTemplate(id)` / `deleteTemplate(id)` | 复制 / 删除本地模板（删除当前模板时自动切换，删空后新建空白模板） |
| `undo()` / `redo()` | 撤销 / 重做 |
| `addText()` / `addTable(rows, cols)` / `addLabelGrid(rows, cols)` / `addQrCode()` / `addBarcode()` | 以编程方式添加元素 |
| `addTextWithContent(text)` / `insertTextSymbol(text)` | 添加带内容的文本 / 向当前文本或表格单元格插入字符或绑定 token |
| `addFieldText(key, left?, top?)` / `dataDragEnabled` / `setDataDragEnabled(boolean)` | 创建字段绑定文本（可指定毫米位置）/ 控制「拖入页面」开关 |
| `showSampleValues` / `setShowSampleValues(boolean)` | 设计时显示示例值或 `{{字段}}` 占位符 |
| `setTableRepeatRow(source, row?)` / `clearTableRepeatRow()` | 把表格某行设为明细模板行 / 取消 |
| `setDetailRows(key, rows)` | 写入明细集合数据（对象数组），供主从明细表格重复打印 |
| `useOfficialTemplate(id)` / `renderTemplateThumbnail(template, maxW?, maxH?)` | 从模板中心复制官方模板 / 生成模板缩略图 |
| `updateSelected(patch)` | 修改选中元素属性 |
| `setPageSize(width, height)` | 设置页面尺寸（毫米） |
| `setPageBackgroundFile(file)` / `removePageBackground()` | 导入 / 移除纸张底图 |
| `setBackgroundAligning(boolean)` / `setBackgroundTransform(frame)` / `resetBackgroundTransform()` | 进入底图对位、写入毫米定位或恢复填充方式 |
| `setOverprint(boolean)` / `setPrintOffset(x, y)` | 套打模式与打印偏移（毫米，正值向右 / 向下） |
| `setTheme('light' \| 'dark')` / `toggleTheme()` | 切换设计器界面主题 |
| `setUiVisible(path, visible)` / `resetUiVisibility()` | 控制左侧工具、顶部属性栏、右侧标签页与页面属性分组的显示 |

实例上的响应式状态（`templates`、`page`、`selection`、`canUndo`、`canRedo` 等）也可以直接在模板中读取，用于自定义工具栏或保存按钮的禁用状态。

保存到后端的示例：

```ts
async function saveToServer(designer: Designer) {
  await fetch('/api/templates/1', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(designer.serialize()),
  })
}
```

### 样式与布局注意事项

- 必须引入与 Vue 版本对应的 `style.css`，否则布局和控件样式会缺失
- 组件根节点为 `.app-shell`，高度为 `100%`，外层容器必须有明确高度（如 `100vh` 或固定的 Flex 区域）
- 设计器依赖 Canvas、`localStorage` 和浏览器 API，只能在客户端渲染；Nuxt 等 SSR 框架请用 `<ClientOnly>` 或动态 `import()` 包裹
- 模板默认自动保存到浏览器 `localStorage`；需要跨设备共享时，用 `serialize()` / `importTemplate()` 接入自己的后端

### 数据绑定与数据源

- 在文本、表格单元格、二维码或条形码中写 `{{字段名}}`，预览和导出时会替换为示例数据中的值
- 「数据」面板支持手工维护示例数据、导入 JSON，这部分完全在浏览器内完成
- 数据库连接依赖仓库内的 `server/index.mjs` 本地服务，**不会随 npm 包发布**。纯前端项目如需隐藏或替换数据源入口，可以自行实现 `/api/datasource/*` 接口，或直接使用示例数据 / JSON 导入

### 常见问题

| 问题 | 解决方式 |
| --- | --- |
| 设计器高度为 0 或只显示一条边 | 给外层容器设置明确高度，例如 `height: 100vh` |
| 样式错乱、按钮没有图标 | 确认已引入 `doprint-designer/vue3/style.css` 或 `vue2/style.css` |
| Vue 2 项目报编译错误 | 升级到 Vue 2.7+，并使用 `doprint-designer/vue2` 入口 |
| 打包提示 `vue` 重复 | 确认宿主项目只安装一份 Vue，组件库已将 `vue` 设为 external |
| `importTemplate` 没有反应 | 导入的是模板 JSON 文本而不是对象；可通过 `serialize()` 生成标准格式 |
| 数据库按钮连接失败 | npm 包不包含本地数据服务，需按仓库 `server/index.mjs` 自行部署 |

## 使用指南

### 模板与页面

- 顶栏模板名旁的「+」可新建空白模板（A4），下拉箭头打开模板列表，可在多个模板之间切换；每个模板独立自动保存到浏览器 localStorage
- 模板列表悬停时会显示复制 / 删除按钮：复制会生成「xxx 副本」并自动打开，删除当前模板后会自动切换到相邻模板
- 顶栏「模板中心」提供开票联络单、商品价签、A5 送货单、出库单（明细重复）、物流面单等官方示例，卡片会实时渲染缩略图；点击「使用此模板」会复制一份到本地模板库，修改不会影响官方原件
- 右侧「页面设置」可切换 A4 / A5 / B5 / 连续纸 / 标签等预设，也可直接输入 20–1000 mm 的自定义宽高
- 未选中任何元素时，顶部属性栏会提供纸张预设、宽高、方向、页边距、底图导入 / 显示 / 移除和全局字体快捷设置；底图透明度、填充方式、随模板打印以及水印设置都在右侧面板中调整
- 顶栏齿轮按钮打开「全局属性」，可勾选左侧工具栏、顶部主栏功能、顶部页面 / 选中元素属性、右侧标签页、右侧页面 / 选中元素属性分组的显示 / 隐藏；隐藏项只影响界面，不会删除模板数据，可一键恢复默认
- 顶部「应用到全部」是一个开关：开启后，修改字体或字号会实时应用到全部文本与表格；关闭时只修改顶栏的取值，不改变画布内容
- 页边距支持上 / 下 / 左 / 右独立设置，并可用虚线框显示内容区域；虚线框只作设计参考，不会打印
- 右侧「页面设置 → 纸张底图」可导入扫描件或已有单据图片，作为固定铺在纸张最底层的设计参考，便于把文字、表格和条码对齐到纸质表单上
- 底图支持显示 / 隐藏、不透明度、铺满 / 适应 / 拉伸三种填充方式；默认只用于设计参考，开启「随模板打印」后才会包含在矢量预览、PDF 与导出中
- 点击「对位调整」进入底图对位：在画布上拖动底图平移，滚轮以光标为中心缩放，双击或「恢复填充」回到填充方式；也可在面板中直接输入 X / Y / 底图宽高（毫米）精确定位
- 「套打模式」用于预印纸张：底图只作为对位参考，不会进入 SVG / PDF；「打印偏移」X / Y 用于校准打印机与预印表单的错位（正值向右 / 向下），仅在套打模式下影响输出
- 超过约 1.2 MB 的底图会在导入时自动等比压缩到 2400 px 以内，避免撑爆 localStorage 的存储配额
- 从上方刻度尺向下拖动创建水平参考线，从左侧刻度尺向右拖动创建垂直参考线；拖动参考线可调整位置，拖回刻度尺或双击可删除
- 右侧「视图与吸附」中可隐藏或清除全部参考线、显示 / 隐藏网格和刻度尺，并设置网格间距与 1 mm 拖动吸附开关
- 顶栏的月亮 / 太阳按钮可切换深色主题；缩放栏的百分比按钮会把画布恢复到 120% 的舒适比例，页面上计时最多放大到 120% 以适配窗口
- 左侧工具栏顺序为文本、表格、标签、符号、矩形、椭圆、线条、图片、二维码、条形码
- 点击纸张外的灰色工作区，或纸张内没有元素的空白处，都会取消当前选中

### 表格

表格采用「数据模型 / 渲染 / 交互」分层结构：行高列宽、稀疏单元格、合并区域与样式注册表独立保存，渲染层只负责把快照绘制到画布，交互层处理命中测试、选区和编辑。表格快照随模板一起序列化，因此缩放、旋转、保存与导出始终使用真实毫米尺寸。

![表格单元格编辑、选区与浮动工具栏](docs/images/table-editing.png)

*双击单元格进入编辑；浮动工具栏支持合并 / 拆分、对齐、加粗和四边边框控制*

操作方式：

- 选中表格后可拖动 8 个控制点缩放，角点按住 Shift 等比缩放；松开后缩放会写回行高 / 列宽，表格恢复 `scaleX / scaleY = 1`，因此保存和导出始终使用真实毫米尺寸
- 表格也可以像其他元素一样旋转：选区、单元格命中测试和内联编辑器都会跟随旋转角度
- 双击表格进入单元格编辑：拖拽框选、Shift 扩展选区；方向键 / Tab 移动，`F2` / Enter 编辑，直接输入即可覆盖，Delete 清空，`Ctrl+A` 全选；按 Esc、点击其他元素或右侧「退出表格编辑」结束，修改会自动生效并进入撤销历史
- 浮动工具栏支持合并 / 拆分、水平与垂直对齐、加粗，以及分别显示或隐藏选区的四边边框；合并区域按整体参与选择、样式和边框操作
- 右侧「表格」面板可直接调整行数、列数、宽度、高度，并查看当前单元格内容
- 「明细行绑定」可把当前行设为明细模板行：选择明细集合后，预览 / 导出时该行会按子表记录重复，其余固定行保持不动

兼容性：旧版稠密表格（`rows / cols / cells / rowHeights / colWidths / merges`）会在加载时自动迁移为 v2 快照，并保留原有文字、合并、填充、对齐和隐藏边框；数据绑定同样递归解析表格单元格中的 `{{字段}}`。

### 主从明细（一条主表数据 + 多条子表记录）

1. 在「数据」标签的「从 JSON 导入」中粘贴包含数组的主表数据，例如：

```json
{
  "customer": "杭州示例商贸有限公司",
  "orderNo": "CK-2026-001",
  "items": [
    { "no": "1", "name": "A4 复印纸", "qty": "20", "price": "22.50", "amount": "450.00" },
    { "no": "2", "name": "中性笔", "qty": "200", "price": "1.20", "amount": "240.00" }
  ]
}
```

对象数组会成为明细集合（数据面板显示「明细 N 行」），其列可通过 `{{items.name}}`、`{{items.qty}}` 等点号路径访问。

2. 选中表格中的**一条**明细模板行，在右侧「明细行绑定」中选择 `items` 集合。设计画布会用第一条明细作为示例，预览 / 导出时自动把该行扩展成 N 行，主表字段（如 `{{customer}}`）在每一行中同样可用。
3. 合计行的 `{{total}}` 等主表字段不会重复，位置随扩展后的行数自动下移；建议在模板中预留足够空间，或在明细集合为空时删除多余占位行。
4. 通过 `setDetailRows(key, rows)` 可以在调用 `generateSVG()` / `generatePDF()` 前注入真实明细数据，适合对接后端打印任务。

### 多联标签

- 左侧工具栏的「标签」按钮一次生成 3 列 × 5 行的标签网格，单元格默认文本为「标签 01」到「标签 15」，适合整版标签纸打印
- 每个标签（单元格）都可以双击独立编辑，支持框选、合并、对齐、边框等表格操作
- 行数、列数、整版宽高可在右侧「表格」面板调整；标签网格作为一个元素整体移动、缩放和旋转
- 插入位置默认在页面内容区居中，如果模板中已有内容，可能会与新标签重叠，选中后拖动或调整尺寸即可

### 线条、图形与旋转

- 所有元素（文本、图形、图片、表格、线条、二维码 / 条形码）都支持旋转：拖动选中框上方的旋转控制点，或在顶栏 `∠` / 右侧「旋转」中输入角度
- 线条只有左右两个长度控制点，拖拽只会改变长度，不会把线条拉粗；粗细通过顶栏 `粗` 或右侧「粗细」数值定义
- 矩形与椭圆默认无填充，只显示描边；在右侧「填充」中选色即可加上背景，点「清除」恢复透明
- 表格旋转后仍可缩放，缩放会以拖动控制点对面的边 / 角为锚点写回真实行高列宽，不会发生跳位

### 版权水印与二维码 / 条形码

- 右侧「属性 → 版权水印」可开启 / 关闭平铺的版权水印，默认文字为 `Doprint预览版`，文字可修改
- 水印绘制在页面内容之上，随模板保存；开启时会包含在矢量预览、PDF 预览与导出中，关闭后不显示也不导出
- 左侧工具栏的「二维码」「条形码」按钮可插入对应元素，选中后在右侧修改内容，支持 `{{字段名}}` 数据绑定
- 二维码使用 UTF-8 编码；条形码使用 Code128，支持字母、数字和常用符号
- 两者和其他图片元素一样可以拖拽、缩放、旋转，并保持毫米尺寸；内容修改后会自动重新编码，不改变已设置的外框尺寸

![二维码内容与数据绑定](docs/images/qr-code.png)

*选中二维码后可编辑内容、绑定数据字段，缩放和旋转不会改变内容*

### 数据绑定

- 在文本或表格单元格中输入 `{{字段名}}`，预览和导出时会替换为示例数据中的对应值
- 二维码 / 条形码的内容同样支持绑定，例如订单号、物流单号等
- 右侧「数据」标签可维护示例数据，也支持导入 JSON；从数据库导入字段时，列名和首行示例值会合并到示例数据
- 开启「拖入页面」后，拖动字段左侧的拖拽手柄到画布任意位置，即可在该落点生成一个 `{{字段名}}` 绑定文本；关闭开关或窗口后设置会保存在浏览器
- 默认开启「设计时显示示例值」：画布上的文本和表格单元格直接显示示例数据，避免 `{{字段名}}` 占位符比真实数据长而换行、覆盖其他元素；双击编辑时仍显示绑定原文，关闭开关可恢复占位符显示
- 设计画布内部始终保存绑定原文，预览 / 导出、保存和撤销历史都使用原文，显示示例值只影响编辑视图
- 复选框绑定支持以下写法，预览和导出时替换为勾选符号：

| 写法 | 说明 |
| --- | --- |
| `{{#字段名}}` | 字段为真值（1 / true / 是 / √ / 非空文本）时显示 `☑`，否则显示 `□` |
| `{{#字段名=条件值}}` | 字段值等于条件值时显示 `☑`，例如 `{{#票种=普}}` |
| `{{#字段名\|☑\|□}}` | 自定义选中 / 未选中字符 |
| `{{#字段名=条件值\|☑\|□}}` | 条件判断 + 自定义字符 |

### 特殊字符与字段复选框

- 左侧「符号」打开特殊字符面板，符号按「方框与勾选 / 图形与标记 / 数学与单位」分组，点击 `□` `☑` `✓` `×` `℃` `￥` 等即可插入
- 插入位置：正在编辑文本时插入到光标处；选中文本或表格单元格时追加到末尾；未选中时自动新建一个文本元素
- 面板下方可绑定字段：选择数据字段、可选条件值、选中 / 未选中字符，然后插入 `{{#字段|☑|□}}` 形式的绑定复选框
- **描述文本**：单个绑定和批量绑定都可以为复选框填写一个描述文本，它会插入在复选框字符前面，例如填写「普」得到 `普{{#字段=普|☑|□}}`
- **批量绑定方框**：先在文本或表格单元格里放入多个方框（如 `类型：□□□`），选择字段后切换到「批量绑定方框」，为每个方框填写描述文本（可选）和字段值，一键生成带描述的绑定序列；第 1 个方框对应第 1 行，已存在的绑定 token 会自动跳过
- 批量绑定示例：单元格内容 `类型：□□□`，三行依次填写 `普 → 普`、`专 → 专`、`增 → 增` 后得到 `类型：普{{#类型=普|☑|□}}专{{#类型=专|☑|□}}增{{#类型=增|☑|□}}`
- 增值税等表单示例：
  - 两个布尔字段：`普{{#普通|☑|□}}专{{#专用|☑|□}}`
  - 一个票种字段：`普{{#票种=普|☑|□}}专{{#票种=专|☑|□}}`
  - 三个税率对应不同字段：`13% 普{{#pu13|☑|□}}专{{#zhuan13|☑|□}} 9% 普{{#pu9|☑|□}}专{{#zhuan9|☑|□}}`
- 判定规则：`1 / true / 是 / √ / 非空文本` 视为已勾选，`0 / false / 否 / 空` 视为未勾选；填写条件值后改为按值相等判断
- 绑定到表格单元格后，设计画布会按当前示例数据直接显示 ☑ / □，单元格里仍保存绑定原文（双击编辑时可见）；文本元素保持绑定原文，矢量预览、PDF 预览与导出时统一替换为实际符号

### 预览与导出

- **矢量预览**：生成按打印尺寸缩放的 SVG，可下载后继续用于印刷或排版，水印、表格、二维码 / 条形码以及开启「随模板打印」的纸张底图都会包含在内
- **PDF 预览**：按实际毫米尺寸生成 PDF，可在线预览并下载
- **图片导出**：顶栏「图片」菜单支持 PNG / JPG / WebP，按约 300dpi 生成带白色纸张背景的整页图片，适合分享或插入其他系统
- **导出 JSON**：保存当前模板及示例数据，可在其他浏览器或设备上通过「导入」恢复
- 顶栏会自动显示保存状态；模板内容变化后自动写入 localStorage
- 导出的 SVG / PDF / 模板 JSON 会写入不可见的生成器与版权元数据（SVG `<metadata>`、PDF 文档信息、JSON `meta` 字段），不影响页面显示与打印内容

![矢量预览](docs/images/vector-preview.png)

*矢量预览会保留表格、二维码 / 条形码和版权水印，可直接下载 SVG*

### 数据源

浏览器无法直接建立数据库的 TCP 连接，因此由 `server/index.mjs` 提供本机数据服务，前端通过 `/api/datasource/*` 读取库表结构。

![选择数据库类型](docs/images/datasource.png)

*数据库类型选择：当前支持 MySQL，PostgreSQL / SQL Server 已预留入口*

1. 打开右侧「数据」标签，在「数据源」中点击「连接数据源」
2. 在弹窗中选择数据库类型（当前支持 MySQL，PostgreSQL / SQL Server 标记为即将支持）
3. 填写主机、端口、用户、密码，点击「连接」
4. 选择数据库和数据表，勾选需要的字段，点击「导入 N 个字段」
5. 列名和首行示例值会合并到「示例数据」，可直接用 `{{字段名}}` 绑定

说明：

- 密码只随当前请求发送，不写入 localStorage 或模板文件；刷新页面后需要重新输入
- 主机、端口、用户、数据库会记住，方便下次连接
- 数据服务默认只监听 `127.0.0.1`，不对外网开放
- 只执行元数据查询和 `SELECT * ... LIMIT 1~20`，没有任意 SQL 接口
- 库名、表名会先通过 `information_schema` 校验，查询中的标识符会做转义处理
- 建议为设计器单独创建一个只读数据库账号
- 后端按驱动组织（`server/index.mjs` 中的 `DRIVERS`），新增 PostgreSQL / SQL Server 时补充 `connect`、`tables`、`columns` 三个方法即可；弹窗中的类型选择已预留
- 弹窗中的数据库图标来自 [Devicon](https://devicon.dev)（MIT）与 [Simple Icons](https://simpleicons.org)（CC0），商标归各自所有者

#### 服务端配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `API_PORT` | `3301` | 数据服务端口（开发代理会读取同名变量） |
| `API_HOST` | `127.0.0.1` | 数据服务监听地址 |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` | - | 直接调用 API 时的 MySQL 连接默认值 |

界面中的连接表单优先于环境变量；密码输入框不会从环境变量回填。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Ctrl/Cmd + Z` | 撤销 |
| `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` | 重做 |
| `Ctrl/Cmd + D` | 复制选中元素 |
| `Delete` / `Backspace` | 删除选中元素 |
| `方向键` | 移动选中元素 0.5 mm |
| `Shift + 方向键` | 移动选中元素 5 mm |
| `Esc` | 清除选择 / 退出表格单元格编辑 |

表格编辑中：`方向键` / `Tab` 移动单元格，`F2` / `Enter` 进入编辑，`Ctrl/Cmd + A` 全选，拖拽可框选区域。

## 项目结构

```text
server/
  index.mjs              本机数据服务
src/
  App.vue                演示入口（渲染 DoPrintDesigner）
  index.ts               组件库公共导出
  lib.ts                 组件库构建入口（额外引入全局样式）
  components/
    DoPrintDesigner.vue  设计器根组件：布局、预览弹窗与全局快捷键
    ...                  顶栏、工具栏、属性面板、图层面板、表格编辑器、预览弹窗等
  designer/
    designer.ts          画布、元素操作、历史记录、序列化与预览
    table.ts             表格数据模型与命令
    tableOverlay.ts      表格编辑框与选区绘制
    binding.ts           {{字段}} 数据绑定
    codes.ts             二维码 / 条形码生成
    pdf.ts               PDF 生成与预览
    types.ts             模板与元素类型定义
    units.ts             px / mm 换算
build/vue2/              Vue 2.7 组件库构建工具链
dist-lib/                组件库构建产物（npm 包内容，构建生成）
docs/images/             README 截图
LICENSE                  Apache License 2.0
```

## 部署到 Vercel / Cloudflare Pages

设计器前端是纯静态应用，可直接部署到 Vercel 或 Cloudflare Pages 做在线预览：

- Vercel：导入 GitHub 仓库，构建命令 `npm run build`，输出目录 `dist`；仓库已提供 `vercel.json`
- Cloudflare Pages：导入仓库，构建命令 `npm run build`，输出目录 `dist`；也可以使用 `npx wrangler pages deploy dist` 直接发布，`wrangler.toml` 中的项目名可按需修改
- 顶栏左上角 DoPrint 标志 / 文字会在新标签页打开官网 https://doprint.top
- 在线体验地址：https://doprint.fios.top

在线预览限制：

- 模板保存在浏览器 localStorage，不同设备 / 浏览器之间不共享
- 数据源连接依赖本机 `server/index.mjs` 的 Node 服务和可访问的 MySQL，纯静态部署不可用。线上如需数据库连接，Vercel 需要把 `server/index.mjs` 适配为 Serverless Function 并连接公网数据库；Cloudflare Workers 无法直接建立数据库 TCP 连接，需要 Hyperdrive 或独立 HTTP 后端

## 发布到 npm（维护者）

发布脚本、入口映射和 `files` 白名单已在 `package.json` 中配置好。以下流程用于维护者发布新版本。

### 1. 准备账号

1. 在 [npmjs.com](https://www.npmjs.com/signup) 注册账号并完成邮箱验证
2. 使用官方源登录（国内镜像 `registry.npmmirror.com` 只用于安装，不能发布）：

```bash
npm login --registry=https://registry.npmjs.org/
npm whoami --registry=https://registry.npmjs.org/
```

`package.json` 中已经配置：

```json
"publishConfig": {
  "access": "public",
  "registry": "https://registry.npmjs.org/"
}
```

因此 `npm publish` 会自动走官方源；但 `npm login` / `npm whoami` 不受它影响，需要显式加 `--registry`。

### 2. 构建并检查产物

```bash
npm install
npm run build:lib        # Vue 3 + Vue 2 + 类型声明
npm pack --dry-run       # 查看将要发布的文件，应包含 dist-lib、README、LICENSE
```

`build:lib` 会依次执行：

| 命令 | 作用 |
| --- | --- |
| `build:lib:vue3` | 构建 `dist-lib/vue3/` 并生成 `dist-lib/types/` |
| `build:lib:vue2` | 在 `build/vue2/` 中构建 Vue 2.7 产物 |
| `build:types:vue2` | 生成 `dist-lib/types-vue2/` |

### 3. 预演发布

```bash
npm publish --dry-run --registry=https://registry.npmjs.org/
```

预演会完整走一遍发布流程但不上传，适合首次发布前检查权限和 2FA。

### 4. 正式发布

```bash
npm publish --registry=https://registry.npmjs.org/
```

发布前会自动执行 `prepublishOnly`（即 `npm run build:lib`），确保 npm 上的产物与当前源码一致。如果账号开启了双重验证，会提示输入一次性验证码。

### 5. 验证发布结果

```bash
npm view doprint-designer --registry=https://registry.npmjs.org/
```

也可以在一个空目录中实际安装验证：

```bash
mkdir doprint-test && cd doprint-test && npm init -y
npm install doprint-designer
node -e "import('doprint-designer/vue3').then(m => console.log(Object.keys(m)))"
```

### 6. 发布后续版本

npm 不允许重复发布同一个版本号，每次发布前先升级版本：

```bash
npm version patch   # 0.1.0 -> 0.1.1，修复 bug
npm version minor   # 0.1.0 -> 0.2.0，新增功能
npm version major   # 0.1.0 -> 1.0.0，不兼容变更

git push --follow-tags
npm publish --registry=https://registry.npmjs.org/
```

### 7. 常见发布错误

| 报错 | 原因 / 解决 |
| --- | --- |
| `ENEEDAUTH` | 未登录官方源；使用 `npm login --registry=https://registry.npmjs.org/` |
| `E403 Forbidden` | 包名已被占用、账号无权限或邮箱未验证；到 npmjs.com 检查 |
| `E403 ... two-factor authentication` | 账号开启了 2FA，按提示输入 OTP，或使用 `--otp=123456` |
| `E404` | 包尚未发布；首次发布前用 `npm view` 查询返回 404 属正常 |
| `EPUBLISHCONFLICT` / `cannot publish over` | 版本号已存在，先执行 `npm version patch` |
| 安装后代码不是最新 | 淘宝镜像同步有延迟，用 `--registry=https://registry.npmjs.org/` 验证 |

### 8. GitHub Actions 自动发布（可选）

在仓库 Secrets 中配置 `NPM_TOKEN`（npmjs.com → Access Tokens → Automation），然后新建 `.github/workflows/publish.yml`：

```yaml
name: publish

on:
  push:
    tags: ['v*']

jobs:
  publish:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          registry-url: https://registry.npmjs.org
      - run: npm ci
      - run: npm publish --provenance --access public
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
```

之后推送版本标签即可自动构建并发布：

```bash
npm version patch
git push --follow-tags
```

## 说明

- 建议使用最新版 Chrome / Edge 等现代浏览器
- 画布以毫米为设计单位，字号在界面中以 px 展示，便于和常见设计稿对照
- 模板与示例数据默认保存在浏览器 localStorage，重要模板建议定期使用「导出 JSON」备份
- 二维码 / 条形码只保存内容文本，加载模板时重新生成，避免模板文件因图片体积过大

## 联系方式
- Email：info@dipaxis.com, 2532615203@qq.com, dev@doprint.top

## 开源协议

本项目基于 [Apache License 2.0](LICENSE) 开源。
