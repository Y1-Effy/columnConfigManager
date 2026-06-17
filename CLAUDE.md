# Column Config Manager — CLAUDE.md

データテーブルの列定義をWebで管理するツール。変更履歴・バリデーション・JSON出力を備えた社内ツール型Webアプリ（ポートフォリオ作品）。

仕様の詳細は [docs/spec_column-config-manager.md](docs/spec_column-config-manager.md) が唯一の source of truth。スコープ外（認証・マルチユーザー等）には手を出さない。

---

## 開発コマンド

```bash
npm start          # 本番起動
npm run dev        # 開発起動（--watch）
npm test           # Jest テスト実行
npm run lint       # ESLint
npm run seed       # マスタ初期データ投入（.env の MONGO_URI 必須）
```

## 環境変数

`.env` に以下を設定（`.env.example` 参照）:

```
MONGO_URI=mongodb+srv://...
PORT=3000
```

---

## アーキテクチャ

### バックエンド構成

```
server.js               エントリポイント、ルート登録、グローバルエラーハンドラ
                        セキュリティミドルウェア（Compression / Helmet / Rate Limiting / Sanitize）
                        ヘルスチェック（GET /health）
src/
  db.js                 MongoDB接続
  constants.js          DATA_TYPES / FORMAT_DATA_TYPES の enum 定数
  models/
    Project.js          プロジェクト
    Category.js         カテゴリ
    Column.js           列定義
    Format.js           フォーマットマスタ
    CssClass.js         CSSクラスマスタ
    OperationLog.js     操作ログ
    Snapshot.js         復元ポイント
  routes/
    projects.js         /api/projects CRUD
    categories.js       /api/projects/:id/categories + /api/categories/:id（デュアル）
    columns.js          /api/projects/:id/columns + /api/columns/:id（デュアル）
    formats.js          /api/formats CRUD
    cssClasses.js       /api/css-classes CRUD
    export.js           GET /api/projects/:id/export
    operationLogs.js    GET /api/projects/:id/operation-logs
    save.js             POST /api/projects/:id/save
    snapshots.js        /api/projects/:id/snapshots CRUD + diff + restore
  services/
    projectService.js   deleteProject（カスケード削除）
    categoryService.js  reorderCategories
    columnService.js    reorderColumns
    reorderService.js   bulkWrite による共通並び替えロジック
    diffService.js      差分計算エンジン（before/after の operations 配列を生成）
    saveService.js      一括保存（バリデーション → 挿入/更新/削除）
    snapshotService.js  復元ポイント全機能（保存・一覧・詳細・差分・復元）
  utils/
    asyncHandler.js     try/catch を省略するラッパー
    respond.js          ok() / fail() レスポンスヘルパー
    validate.js         isValidId() ObjectId バリデーション
    checkDuplicate.js   重複チェック（更新時は自身を除外）
  seed.js               マスタ初期データ投入スクリプト
```

### フロントエンド構成（素のJS）

```
public/
  index.html              プロジェクト一覧
  workspace.html          エディタ画面（3ペイン）
  settings.html           マスタ管理
  history.html            変更履歴画面
  snapshots.html          復元ポイント確認画面（4ペイン）
  js/
    api.js                apiFetch ラッパー + 各エンドポイント関数（スナップショット含む）
    constants.js          グローバル定数（LOCALE / DATA_TYPES / UI設定）
    utils.js              共通ユーティリティ（escHtml / formatDate / モーダル / トースト等）
    projects.js           プロジェクト一覧画面ロジック
    workspace.js          エディタ画面ロジック（ドラフト編集・保存・復元ポイント保存）
    settings.js           マスタ管理画面ロジック
    history.js            変更履歴画面ロジック
    snapshots.js          復元ポイント確認画面ロジック
    operationDisplay.js   操作ログ表示ラベル・フォーマッタ（history / snapshots 共用）
    paneResize.js         ペイン幅ドラッグリサイズ共通ユーティリティ（workspace / snapshots 共用）
    preview.js            プレビューテーブル描画（サンプルデータ・フォーマット適用、workspace / snapshots 共用）
  css/style.css
```

---

## コーディングパターン

### レスポンス形式

全APIレスポンスは `{ data, error }` で統一。

```js
// 成功
return ok(res, data);          // 200
return ok(res, data, 201);     // 201

// 失敗
return fail(res, 'message', 400);  // 400/404/500
```

### 非同期ルートハンドラ

全ルートハンドラは `asyncHandler` でラップし、try/catchを書かない。

```js
router.get('/', asyncHandler(async(req, res) => {
  // ...
}));
```

### デュアルルーターパターン

categories と columns はプロジェクト配下ルートと直接ルートの2本を export する。

```js
const nestedRouter = express.Router({ mergeParams: true }); // /api/projects/:id/xxx
const router = express.Router();                             // /api/xxx/:id

module.exports = { nestedRouter, router };
```

`server.js` でのマウント:
```js
projectsRouter.use('/:id/categories', categoriesNested);
app.use('/api/categories', categoriesRouter);
```

### IDバリデーション

全ルートで ObjectId の形式チェックを最初に行う。

```js
if (!isValidId(req.params.id)) {
  return fail(res, 'Invalid project id', 400);
}
```

### 重複チェック

更新系ルートで `checkDuplicate` を使い、自身を除外した重複検証を行う。

```js
await checkDuplicate(Model, { field: value }, excludeId);
```

### カスケード削除

- Project 削除 → Category + Column + OperationLog + Snapshot も削除
- Category 削除 → Column も削除

### reorder 実装

`bulkWrite` で全件を一括更新（index = order）。共通ロジックは `reorderService.js` の `reorder(Model, ids, projectId)` に集約。`columnService.js` / `categoryService.js` から呼び出す。

---

## テスト

- `mongodb-memory-server` でインメモリMongoDBを使用（実DBへの接続不要）
- `tests/mongoHelper.js` の `connect` / `disconnect` / `clearCollections` を `beforeAll`/`afterAll`/`beforeEach` で使用
- `supertest` でHTTPレベルのAPIテスト

```bash
npm test
```

---

## データモデル早見表

| モデル | 必須フィールド | 主なリレーション・備考 |
|---|---|---|
| Project | name | - |
| Category | projectId, name | → Project |
| Column | projectId, key, label | → Project, Category, Format, CssClass |
| Format | dataType, value | マスタ（Date/Number のみ） |
| CssClass | value | マスタ |
| OperationLog | projectId, operations | → Project。entityType: `'category'` \| `'column'` \| `'snapshot'` |
| Snapshot | projectId, name, categories, columns, hash, savedAt | → Project。最大5件保持、コンテンツハッシュで重複検出 |

---

## 実装状況（2026-06-16 時点）

### 完了

- 全7モデル定義（Project / Category / Column / Format / CssClass / OperationLog / Snapshot）
- Projects / Categories / Columns / Formats / CssClasses の CRUD API
- 一括保存API（`POST /api/projects/:id/save`）＋ 差分自動記録 → OperationLog
- 操作ログAPI（`GET /api/projects/:id/operation-logs`）
- Export API（`GET /api/projects/:id/export`）
- 並び替え API（reorder）
- スナップショット API（`/api/projects/:id/snapshots`：保存 / 一覧 / 詳細 / diff / restore）
- Projects / Categories / Columns / Formats / CssClasses / Export / Save / OperationLog / diffService / Snapshots の Jest テスト
- フロントエンド全画面（projects.js / workspace.js / settings.js / history.js / snapshots.js）
- フロントエンド共通モジュール（operationDisplay.js / paneResize.js / preview.js）
- ワークスペースのドラフト編集＋「保存」ボタンによる一括反映、未保存変更の警告
- 復元ポイント保存・確認・復元画面（snapshots.html）
- ライブプレビュー（右ペイン）
- seed スクリプト（Format + CssClass マスタ + サンプルプロジェクト「売上レポート」）
- README（掴み・課題・スタック・設計判断・できること・セットアップ手順）

### 未実装

- デプロイ（Render/Vercel等への実デプロイ、README内のデモURL記入）

---

## フロントエンド変更後の自動確認

`public/` 配下のファイル（HTML / JS / CSS）を変更したときは、明示的な指示がなくても Playwright MCP でブラウザを開いて動作確認を行うこと。

- 確認対象: 変更した画面の主要な操作フロー（モーダル・保存・ページ遷移など）
- サーバーは PreToolUse フックで自動起動されるため手動起動は不要
- バグや表示崩れを発見した場合はその場で修正し、再確認まで行うこと

---

## ESLint ルール（抜粋）

- シングルクォート、セミコロンあり、2スペースインデント
- `import/order`: builtin → external → internal → parent → sibling の順、アルファベット昇順
- `prefer-const` 必須、`no-var` 禁止
- `eqeqeq` 必須（`null` のみ例外）
- `consistent-return` 必須

## 言語設定
すべての応答・説明・コメントは日本語で行うこと。
