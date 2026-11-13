# DoPrint 设计器

基于 Vue 3 + Vite + Fabric.js 的打印模板设计器，支持文本、图形、表格、数据绑定、毫米刻度尺、参考线、多模板管理，以及矢量 / PDF 预览。

## 启动

```bash
npm install
npm run dev
```

`npm run dev` 会同时启动：

- 设计器（Vite）：http://localhost:5173
- 本地数据服务：http://127.0.0.1:3301

Vite 会将 `/api` 代理到本地数据服务。生产模式：

```bash
npm run build
npm start
# 打开 http://127.0.0.1:3301
```

## 部署到 Vercel / Cloudflare Pages

设计器前端是纯静态的 Vite 应用，可直接部署到 Vercel 或 Cloudflare Pages 做在线预览：

- Vercel：导入仓库，Framework Preset 选择 Vite。仓库已提供 `vercel.json`，构建命令 `npm run build`，输出目录 `dist`
- Cloudflare Pages：导入仓库，Framework Preset 选择 Vite，构建命令 `npm run build`，输出目录 `dist`；也可以使用 `npx wrangler pages deploy dist` 直接发布，`wrangler.toml` 中的项目名可按需修改
- 顶栏左上角 DoPrint 标志 / 文字会在新标签页打开官网 https://doprint.top

在线预览限制：

- 模板保存在浏览器 localStorage，不同设备 / 浏览器之间不共享
- 数据源连接依赖本机 `server/index.mjs` 的 Node 服务和可访问的 MySQL，纯静态部署不可用。线上如需数据库连接，Vercel 需要把 `server/index.mjs` 适配为 Serverless Function 并连接公网数据库；Cloudflare Workers 无法直接使用 `mysql2` 的 TCP 连接，需要 Hyperdrive 或独立 HTTP 后端

## 模板与参考线

- 顶栏模板名旁的「+」可新建空白模板（A4），下拉箭头打开模板列表，可在多个模板之间切换；每个模板独立自动保存到浏览器 localStorage
- 从上方刻度尺向下拖动创建水平参考线，从左侧刻度尺向右拖动创建垂直参考线；拖动参考线可调整位置，拖回刻度尺或双击可删除
- 右侧「视图与吸附」中可隐藏或清除全部参考线；参考线随模板保存，只作设计参考，不参与 SVG / PDF 导出

## 表格

表格采用「数据模型 / 渲染 / 交互」分层的结构，单元格数据参考 Univer 工作表快照设计，表格逻辑不依赖 Fabric：

- `src/designer/table.ts`：纯数据模型与命令。`rowData` / `columnData` 保存行高列宽，`cellData[row][col] = { v, s }` 为稀疏单元格，`mergeData` 使用首尾闭区间，`styles` 是复用的样式注册表；支持默认样式、行样式、单元格样式三级继承
- `src/designer/tableFabric.ts`：把快照渲染为 Fabric `Group`，包含底色、单元格填充、逐边边框和自动换行文本；快照序列化在 `group.tableData` 中，并写入模板的 `element.table`
- `src/designer/tableOverlay.ts`：在 Fabric `after:render` 中以毫米坐标绘制编辑框和选区，不进入序列化 / SVG / PDF
- `src/components/CanvasTableEditor.vue`：只保留单元格文本编辑器和浮动工具栏；命中测试、选区、控制点缩放全部由 Fabric 处理

操作方式：

- 选中表格后可拖动 8 个控制点缩放，角点按住 Shift 等比缩放；松开后缩放会写回行高 / 列宽，表格恢复 `scaleX / scaleY = 1`，因此保存和导出始终使用真实毫米尺寸
- 表格也可以像其他元素一样旋转：选区、单元格命中测试和内联编辑器都会跟随旋转角度
- 双击表格进入单元格编辑：拖拽框选、Shift 扩展选区；方向键 / Tab 移动，`F2` / Enter 编辑，直接输入即可覆盖，Delete 清空，`Ctrl+A` 全选，Esc 或「完成」退出
- 浮动工具栏支持合并 / 拆分、水平与垂直对齐、加粗，以及分别显示或隐藏选区的四边边框；合并区域按整体参与选择、样式和边框操作

兼容性：旧版稠密表格（`rows / cols / cells / rowHeights / colWidths / merges`）会在加载时自动迁移为 v2 快照，并保留原有文字、合并、填充、对齐和隐藏边框；数据绑定同样递归解析表格单元格中的 `{{字段}}`。

## 线条与旋转

- 所有元素（文本、图形、图片、表格、线条）都支持旋转：拖动选中框上方的旋转控制点，或在顶栏 `∠` / 右侧「旋转」中输入角度
- 线条只有左右两个长度控制点，拖拽只会改变长度，不会把线条拉粗；粗细通过顶栏 `粗` 或右侧「粗细」数值定义
- 矩形与椭圆默认无填充，只显示描边；在右侧「填充」中选色即可加上背景，点「清除」恢复透明
- 表格旋转后仍可缩放，缩放会以拖动控制点对面的边 / 角为锚点写回真实行高列宽，不会发生跳位

## 版权水印与二维码 / 条形码

- 右侧「属性 → 版权水印」可开启 / 关闭平铺的版权水印，默认文字为 `Doprint预览版`，文字可修改
- 水印绘制在页面内容之上，随模板保存；开启时会包含在矢量预览、PDF 预览与导出中，关闭后不显示也不导出
- 左侧工具栏新增「二维码」「条形码」，插入后可在右侧修改内容，支持 `{{字段名}}` 数据绑定
- 二维码使用 UTF-8 编码；条形码使用 Code128，支持字母、数字和常用符号
- 两者和其他图片元素一样可以拖拽、缩放、旋转，并保持毫米尺寸

## 数据源

浏览器无法直接建立数据库的 TCP 连接，因此由 `server/index.mjs` 提供本机数据服务，前端通过 `/api/datasource/*` 读取库表结构。

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
- 库名、表名会先通过 `information_schema` 校验，查询中的标识符使用 `mysql2` 转义
- 建议为设计器单独创建一个只读数据库账号
- 后端按驱动组织（`server/index.mjs` 中的 `DRIVERS`），新增 PostgreSQL / SQL Server 时补充 `connect`、`tables`、`columns` 三个方法即可；弹窗中的类型选择已预留
- 弹窗中的数据库图标来自 [Devicon](https://devicon.dev)（MIT）与 [Simple Icons](https://simpleicons.org)（CC0），商标归各自所有者

### 服务端配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `API_PORT` | `3301` | 数据服务端口（Vite 代理会读取同名变量） |
| `API_HOST` | `127.0.0.1` | 数据服务监听地址 |
| `MYSQL_HOST` / `MYSQL_PORT` / `MYSQL_USER` / `MYSQL_PASSWORD` | - | 直接调用 API 时的 MySQL 连接默认值 |

界面中的连接表单优先于环境变量；密码输入框不会从环境变量回填。
