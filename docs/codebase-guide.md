# コードベースガイド

新しくプロジェクトに参加したメンバー向けに、ディレクトリ構成と各ソースファイルの役割をまとめたドキュメントです。  
機能仕様の詳細は [spec_column-config-manager.md](spec_column-config-manager.md) を参照してください。

---

## 技術スタック

| 領域 | 技術 |
|---|---|
| ランタイム | Node.js |
| Webフレームワーク | Express 4 |
| データベース | MongoDB Atlas（Mongoose 8） |
| フロントエンド | Vanilla JS（バンドラなし） |
| テスト | Jest + Supertest + mongodb-memory-server |
| 静的解析 | ESLint 9 |

---

## ディレクトリ構成

```
columnConfigManager/
├── server.js                    # サーバーエントリポイント
├── package.json
├── .env                         # 環境変数（Git管理外）
├── .env.example                 # 環境変数テンプレート
│
├── docs/
│   ├── spec_column-config-manager.md  # 仕様書（source of truth）
│   └── codebase-guide.md              # このファイル
│
├── src/                         # バックエンドソース
│   ├── db.js                    # MongoDB接続
│   ├── constants.js             # enum定数
│   ├── seed.js                  # マスタ初期データ投入スクリプト
│   │
│   ├── middleware/              # Expressミドルウェア
│   │   └── resolveProject.js    # /:id ルートのプロジェクト存在チェック
│   │
│   ├── models/                  # Mongooseスキーマ（7モデル）
│   │   ├── Project.js
│   │   ├── Category.js
│   │   ├── Column.js
│   │   ├── Format.js            # マスタ
│   │   ├── CssClass.js          # マスタ
│   │   ├── OperationLog.js
│   │   └── Snapshot.js          # 復元ポイント
│   │
│   ├── routes/                  # Expressルーター
│   │   ├── projects.js
│   │   ├── categories.js
│   │   ├── columns.js
│   │   ├── formats.js
│   │   ├── cssClasses.js
│   │   ├── export.js
│   │   ├── operationLogs.js
│   │   ├── save.js
│   │   └── snapshots.js         # 復元ポイント CRUD + diff + restore
│   │
│   ├── services/                # ビジネスロジック層
│   │   ├── projectService.js    # プロジェクトカスケード削除
│   │   ├── reorderService.js    # 並び替え汎用実装
│   │   ├── categoryService.js
│   │   ├── columnService.js
│   │   ├── diffService.js       # 保存前後の差分計算
│   │   ├── saveService.js       # ドラフト一括保存
│   │   └── snapshotService.js   # 復元ポイント全機能
│   │
│   └── utils/                   # ヘルパー
│       ├── asyncHandler.js
│       ├── respond.js
│       ├── validate.js
│       └── checkDuplicate.js    # 重複チェック（更新時の自身除外）
│
├── public/                      # フロントエンド（静的ファイル）
│   ├── index.html               # プロジェクト一覧画面
│   ├── workspace.html           # エディタ画面
│   ├── settings.html            # マスタ設定画面
│   ├── history.html             # 変更履歴画面
│   ├── snapshots.html           # 復元ポイント管理画面
│   │
│   ├── js/
│   │   ├── api.js               # APIクライアント
│   │   ├── constants.js         # フロント用定数
│   │   ├── utils.js             # UIヘルパー
│   │   ├── projects.js          # 一覧画面ロジック
│   │   ├── workspace.js         # エディタ画面ロジック
│   │   ├── settings.js          # マスタ設定画面ロジック
│   │   ├── history.js           # 履歴画面ロジック
│   │   ├── snapshots.js         # 復元ポイント画面ロジック
│   │   ├── operationDisplay.js  # 操作ログ表示フォーマッタ（共用）
│   │   ├── paneResize.js        # ペインドラッグリサイズ（共用）
│   │   └── preview.js           # プレビューテーブル描画（共用）
│   │
│   └── css/
│       └── style.css
│
└── tests/                       # Jestテスト
    ├── mongoHelper.js           # テスト用DB共通セットアップ
    ├── projects.test.js
    ├── categories.test.js
    ├── columns.test.js
    ├── formats.test.js
    ├── cssClasses.test.js
    ├── export.test.js
    ├── operationLogs.test.js
    ├── save.test.js
    ├── diffService.test.js
    └── snapshots.test.js
```

---

## バックエンド詳解

### エントリポイント — `server.js`

アプリケーション全体の起点。以下を担当します。

- ミドルウェアの登録（compression / Helmet / JSONパーサー / レート制限）
- 全ルーターのマウント
- 静的ファイル配信（`public/`）
- グローバルエラーハンドラ（ValidationError→400 / CastError→400 / 重複キー→409 / その他→500）
- `/health` エンドポイント

ルートのマウント構造は以下の通りです。

```
/api/projects          → projects.js
  /:id/categories      → categories.js（nestedRouter）
  /:id/columns         → columns.js（nestedRouter）
  /:id/export          → export.js
  /:id/operation-logs  → operationLogs.js
  /:id/save            → save.js
  /:id/snapshots       → snapshots.js
/api/categories        → categories.js（router）
/api/columns           → columns.js（router）
/api/formats           → formats.js
/api/css-classes       → cssClasses.js
```

---

### ミドルウェア — `src/middleware/`

**`resolveProject.js`**  
`/:id` を持つネストルートに挿入するミドルウェアです。ObjectId の妥当性チェック → `Project.findById()` による存在確認を行い、見つかった場合は `req.project` にセットして `next()` を呼びます。存在しない場合は 404 を返します。`projects.js` ルーター内で各ハンドラの前に使用することで、存在チェックを各ルートに重複して書かずに済みます。

---

### データベース接続・定数

**`src/db.js`**  
`mongoose.connect()` をラップした関数をエクスポートします。`server.js` の起動時に呼び出されます。接続文字列は環境変数 `MONGO_URI` から取得します。

**`src/constants.js`**  
`DATA_TYPES`（`string` / `number` / `date` / `boolean`）の enum オブジェクトをエクスポートします。Column スキーマの `dataType` フィールドと、フロントエンドの `public/js/constants.js` の両方で同じ値を使用しています。

---

### モデル層 — `src/models/`

Mongoose スキーマとモデルを定義します。各ファイルはモデルを `default export` します。

| ファイル | 主なフィールド | 備考 |
|---|---|---|
| `Project.js` | `name`（必須・最大100字）、`description` | |
| `Category.js` | `projectId`（必須）、`name`（必須）、`order` | `{ projectId, order }` にインデックス |
| `Column.js` | `projectId`（必須）、`key`（必須・英数字アンダースコア）、`label`（必須）、`dataType`、`formatId`、`cssClassIds`、`order`、`required`、`defaultValue`、`validation` | 最もフィールドが多い中心モデル |
| `Format.js` | `dataType`（`Date`または`Number`）、`value`（例: `yyyy/MM/dd`）、`description`、`order` | マスタ。`{ dataType, value }` にユニーク制約 |
| `CssClass.js` | `value`（例: `cell-center`）、`description`、`order` | マスタ。`value` にユニーク制約 |
| `OperationLog.js` | `projectId`（必須）、`operations`（必須・`entityType`/`entityId`/`action`/`label`/`fields` を持つエントリの配列） | 保存時の差分を記録。`{ projectId, createdAt, _id }` に降順インデックス |
| `Snapshot.js` | `projectId`（必須）、`projectName`（必須）、`name`、`categories`（配列・必須）、`columns`（配列・必須）、`hash`（必須）、`savedAt` | 復元ポイント。コンテンツハッシュで重複検出。最大5件保持。`{ projectId, savedAt }` / `{ projectId, hash }` にインデックス |

---

### ルーター層 — `src/routes/`

各リソースへの CRUD エンドポイントを実装します。

**`projects.js`**  
プロジェクトの CRUD。DELETE 時に配下の Category・Column・OperationLog・Snapshot をカスケード削除します（`projectService.deleteProject()` 経由）。

**`categories.js` / `columns.js`**  
2種類のルーターをエクスポートします（デュアルルーターパターン）。

- `nestedRouter`：`/api/projects/:id/categories` のようにプロジェクト配下でアクセスする場合（一覧取得・新規作成）
- `router`：`/api/categories/:categoryId` のように直接アクセスする場合（更新・削除・並び替え）

**`formats.js` / `cssClasses.js`**  
マスタデータの CRUD。DELETE 時に Column から参照されていないかチェックし、使用中なら 400 を返します。

**`export.js`**  
`GET /api/projects/:id/export` のみ実装。Column を populate（Format・CssClass の情報も展開）してから、クライアントが直接利用できる形式の JSON を組み立てて返します。

**`operationLogs.js`**  
`GET /api/projects/:id/operation-logs` のみ実装。`OperationLog` を新しい順（`createdAt` 降順）で返します。

**`save.js`**  
`POST /api/projects/:id/save` を実装。`saveService.saveProjectState()` を呼び出し、カテゴリ・列のドラフト状態の一括保存と操作ログの記録を行います。

**`snapshots.js`**  
復元ポイントの 5 エンドポイントを実装します。

- `GET /api/projects/:id/snapshots` — 一覧（savedAt 降順）
- `POST /api/projects/:id/snapshots` — 保存（コンテンツが同一の場合は重複更新）
- `GET /api/projects/:id/snapshots/:snapshotId` — 詳細（categories/columns のフル内容）
- `GET /api/projects/:id/snapshots/:snapshotId/diff` — 現在の DB 状態との差分を operations 配列で返す
- `POST /api/projects/:id/snapshots/:snapshotId/restore` — 復元ポイントの状態を DB に書き戻す

---

### サービス層 — `src/services/`

ルートハンドラから切り出したビジネスロジックを置きます。

**`projectService.js`**  
`deleteProject(projectId)` を提供します。Project 本体と、配下の Category・Column・OperationLog・Snapshot をすべて削除するカスケード削除処理です。`projects.js` の DELETE ハンドラから呼び出されます。

**`reorderService.js`**  
`reorder(Model, ids, projectId)` を提供します。受け取った ID 配列の順序でドキュメントの `order` フィールドを `bulkWrite` で一括更新します（配列のインデックス = order 値）。`projectId` でフィルタリングすることで、他プロジェクトのデータを誤更新しないよう制限しています。

**`categoryService.js` / `columnService.js`**  
それぞれ `reorderService.reorder` を呼ぶ薄いラッパーです（`reorderCategories` / `reorderColumns`）。ルーター側がモデルを直接知らなくて済むよう分離しています。

**`diffService.js`**  
`computeDiff()` を提供します。保存前後の categories/columns（生ドキュメント配列）を `_id` で比較し、`created` / `updated` / `deleted` の操作エントリ配列を生成する純粋関数です（DBアクセスなし）。`categoryId`/`formatId`/`cssClassIds` は ID参照ではなく名称解決した値で記録します。

**`saveService.js`**  
`saveProjectState(projectId, { categories, columns })` を提供します。ドラフトのバリデーション（DB書き込み前）→ 新規カテゴリ・列の `insertMany`（一時ID→実IDの変換）→ 既存カテゴリ・列の `bulkWrite` 更新 → ドラフトに存在しない既存カテゴリ・列の `deleteMany` → `diffService.computeDiff()` による差分計算 → `operations.length > 0` の場合のみ `OperationLog.create()`、という流れで一括保存を行います。DB反映中に例外が発生した場合は挿入済みのカテゴリ・列をロールバックします。レスポンスはリクエストと同じ順序で返します。

**`snapshotService.js`**  
復元ポイントに関わるビジネスロジックを集約します。

| 関数 | 役割 |
|---|---|
| `saveSnapshot(projectId, projectName, { categories, columns, name })` | categories/columns のハッシュを計算し、同一ハッシュの既存スナップショットがあれば更新（名前・日付のみ差し替え）、なければ新規作成。最大5件を超えた場合は最古のものを削除 |
| `listSnapshots(projectId)` | savedAt 降順で一覧（_id / savedAt / name のみ返却） |
| `getSnapshot(projectId, snapshotId)` | categories/columns のフル内容を返す |
| `getSnapshotDiff(projectId, snapshotId)` | スナップショット時点と現在の DB 状態を比較し、operations 配列を生成（`diffService.computeDiff()` を利用） |
| `restoreSnapshot(projectId, snapshotId)` | スナップショットの categories/columns を DB に書き戻し、OperationLog を記録 |

---

### ユーティリティ — `src/utils/`

**`asyncHandler.js`**  
`(fn) => (req, res, next)` の形で async 関数をラップします。Promise が reject された場合に `next(err)` を呼んでグローバルエラーハンドラに転送します。全ルートハンドラはこれでラップするため、try/catch を書く必要がありません。

**`respond.js`**  
`ok(res, data, status=200)` と `fail(res, message, status=400)` を提供します。全 API レスポンスを `{ data, error }` の形式に統一します。

**`validate.js`**  
`isValidId(id)` を提供します。`mongoose.isValidObjectId()` のラッパーで、全ルートでパスパラメータの ObjectId 妥当性チェックに使います。

**`checkDuplicate.js`**  
`checkDuplicate(Model, filter, excludeId)` を提供します。更新系ルートで「自身を除いた重複」を検出するためのヘルパーです。`excludeId` を指定することで、自分自身のドキュメントを重複チェックから除外できます。

---

### シードスクリプト — `src/seed.js`

`npm run seed` で実行します（`.env` の `MONGO_URI` が必要）。以下のマスタデータと動作確認用サンプルプロジェクトを投入します。

- **Format マスタ**：Date型4件・Number型4件
- **CssClass マスタ**：`cell-left` / `cell-center` / `cell-right` / `cell-required` / `cell-highlight` の5件
- **サンプルプロジェクト**：「売上レポート（サンプル）」（3カテゴリ・8列）

---

## フロントエンド詳解

`public/` 以下をそのまま Express で静的配信します。バンドラは使用していません。各 HTML ファイルが必要な JS ファイルを `<script>` タグで読み込む形です。

### 画面構成

| HTML | 画面名 | 説明 |
|---|---|---|
| `index.html` | プロジェクト一覧 | プロジェクトの作成・編集・削除、ワークスペースへの遷移 |
| `workspace.html` | エディタ | サイドバー（カテゴリ/列ツリー）・編集フォーム・ライブプレビューの3ペイン |
| `settings.html` | マスタ設定 | Format・CssClass マスタの CRUD |
| `history.html` | 変更履歴 | 操作ログの一覧表示・詳細確認 |
| `snapshots.html` | 復元ポイント管理 | 保存済みスナップショットの一覧・詳細確認、現在との diff 表示、復元操作（4ペイン） |

### JS ファイル

**`js/api.js`**  
バックエンド API への全リクエストをここに集約します。`apiFetch(method, path, body)` を基底とし、各リソース（projects / categories / columns / formats / cssClasses / export / operationLogs / save）ごとに名前付き関数をエクスポートします。画面ロジック側は直接 `fetch` を呼ばず、必ずここの関数を使います。

**`js/constants.js`**  
`DATA_TYPES` と `LOCALE`（`ja-JP`）をフロントエンド用に定義します。バックエンドの `src/constants.js` と値を揃えています。

**`js/utils.js`**  
画面をまたいで使う UI ヘルパーをまとめます。

| 関数 | 役割 |
|---|---|
| `escHtml(str)` | テンプレートリテラルに埋め込む前のXSSエスケープ |
| `showToast(msg, type)` | 画面右下にトースト通知（成功3秒・エラー5秒） |
| `resolveId(val)` | populate済みオブジェクトまたはID文字列からIDを取り出す |
| `openModal(id)` / `closeModal(id)` | モーダルの表示・非表示 |
| `initModalDelegation()` | `data-modal-close` 属性を持つ要素クリックでモーダルを閉じる共通処理 |

**`js/projects.js`**  
`index.html` のロジック。プロジェクト一覧の取得・描画、新規作成・編集・削除を担当します。

**`js/workspace.js`**  
`workspace.html` のロジック。最もコード量が多いファイルです。データの初期ロード後、`categories`/`columns` 配列をそのまま編集中のドラフトとして保持し、カテゴリ・列の追加/編集/削除/並び替えやフォーム入力（`commitFormToColumn()`）はすべてローカル配列の操作のみで即時APIコールは行いません。サイドバー描画、ライブプレビューの更新、JSON出力モーダルに加え、「保存」ボタン（`btnSave`）押下時に `saveProject()` でドラフト全体を一括送信し、レスポンスで `categories`/`columns` を実IDのものに置き換えます。未保存の変更がある状態でページを離れようとすると `beforeunload` で警告します。

**`js/settings.js`**  
`settings.html` のロジック。Format と CssClass のマスタ管理（一覧・追加・編集・削除）を担当します。

**`js/history.js`**  
`history.html` のロジック。`getOperationLogs()` で操作ログ一覧を取得し、`entityType`/`action` ごとに件数集計した概要（例：「カテゴリ追加1件、列更新2件」）を一覧表示します。「詳細」ボタンでモーダルを開き、各操作エントリの `fields`（フィールド単位の before/after）を日本語ラベルに変換して表示します（`operationDisplay.js` を利用）。

**`js/snapshots.js`**  
`snapshots.html` のロジック。復元ポイントの一覧・詳細・現在の状態との diff 表示・復元操作を担当します。diff 結果の表示には `operationDisplay.js` を、プレビューの描画には `preview.js` を、ペインリサイズには `paneResize.js` を共用します。

**`js/operationDisplay.js`**  
操作ログエントリ（`entityType` / `action` / `fields`）を日本語の表示用ラベルや HTML に変換する共用フォーマッタです。`history.js` と `snapshots.js` の両方から読み込まれます。

**`js/paneResize.js`**  
マウスドラッグによるペイン幅調整ロジックを提供する共用ユーティリティです。`workspace.html`（3ペイン）と `snapshots.html`（4ペイン）から読み込まれます。

**`js/preview.js`**  
サンプルデータを用いたプレビューテーブルの描画ロジックを提供します。列定義に応じたフォーマット（日付・数値）適用と CSSクラスの付与を担い、`workspace.js` と `snapshots.js` から共用されます。

---

## テスト

### 戦略

- `mongodb-memory-server` でインメモリ MongoDB を起動し、実データベースへの接続なしにテスト可能
- `supertest` で HTTP レベルの API テストを行う（Express アプリを直接呼び出す）

### 共通セットアップ — `tests/mongoHelper.js`

`connect()` / `disconnect()` / `clearCollections()` を提供します。各テストファイルは以下のパターンで使います。

```js
beforeAll(() => mongoHelper.connect());
afterAll(() => mongoHelper.disconnect());
beforeEach(() => mongoHelper.clearCollections());
```

### 各テストファイルの対象

| ファイル | 主なテスト内容 |
|---|---|
| `projects.test.js` | CRUD、入力バリデーション、カスケード削除 |
| `categories.test.js` | ネストルート・直接ルートの両方、カスケード削除 |
| `columns.test.js` | CRUD、populate 済みレスポンスの確認、並び替え |
| `formats.test.js` | CRUD、重複キーエラー、使用中チェック |
| `cssClasses.test.js` | CRUD、重複キーエラー、使用中チェック |
| `export.test.js` | JSON 構造の検証、カテゴリ/列の populate |
| `diffService.test.js` | `computeDiff()` の created/updated/deleted 各パターン、ID参照フィールドの名称解決 |
| `save.test.js` | 一括保存API（新規作成の一時ID→実IDマッピング、更新、削除、バリデーション、参照整合性、操作ログ生成） |
| `operationLogs.test.js` | 操作ログ一覧取得（新しい順、404/400） |
| `snapshots.test.js` | 復元ポイントの保存・一覧・詳細・diff・restore、重複ハッシュ検出、最大5件制限 |

---

## 主要なアーキテクチャパターン

### 統一レスポンス形式

全 API は `{ data, error }` の形式で返します。クライアントは `response.error` の有無だけで成否を判定できます。

```js
// 成功
ok(res, data);         // 200
ok(res, data, 201);    // 201

// 失敗
fail(res, 'message', 400);
```

### asyncHandler パターン

`async` ルートハンドラは必ず `asyncHandler` でラップします。これにより各ルートで try/catch を書かずに済み、例外はグローバルエラーハンドラに集約されます。

```js
router.get('/', asyncHandler(async (req, res) => {
  const items = await Model.find();
  return ok(res, items);
}));
```

### デュアルルーターパターン

`categories.js` と `columns.js` は2つのルーターをエクスポートします。

- **nestedRouter**（`mergeParams: true`）：プロジェクトの `:id` を引き継ぐ形で使用（一覧取得・作成）
- **router**：リソース自身の `:categoryId` / `:columnId` で直接操作（更新・削除・並び替え）

この分割により、「プロジェクト配下として作る」「IDを直接指定して更新する」という2つの自然な操作を別ルートに明確に分離しています。

### reorder の bulkWrite 実装

並び替えは「フロントから ID の配列を受け取り、そのインデックスを `order` として保存する」方式です。1件ずつ UPDATE するのではなく `bulkWrite` で一括処理し、`projectId` によるフィルタで他プロジェクトへの誤更新を防いでいます。

```js
// services/reorderService.js の概要
// ids = ["id_a", "id_b", "id_c"] → order 0, 1, 2 に更新
const ops = ids.map((id, index) => ({
  updateOne: { filter: { _id: id, projectId }, update: { $set: { order: index } } }
}));
await Model.bulkWrite(ops);
```
