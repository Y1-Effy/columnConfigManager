# Column Config Manager

[![CI](https://github.com/Y1-Effy/columnConfigManager/actions/workflows/ci.yml/badge.svg)](https://github.com/Y1-Effy/columnConfigManager/actions/workflows/ci.yml)

> テーブルの列設定を Excel ＋ 手書きDBクエリで管理していると、壊れる・履歴が追えない・打ち間違える。これを、変更履歴・入力バリデーション・ワンクリックJSON出力を備えたWebツールに置き換える社内ツール型アプリ。

## 解決する課題

- 列定義（並び順・ラベル・型・フォーマット・スタイル）を表計算で管理しており、版管理・変更履歴を追えない
- 設定変更がアドホックで、オペミス・実データとの齟齬が起きやすい
- システム反映用のJSONを手作業で作っていてミスが出る

## できること

- **列定義 CRUD**：カテゴリでグルーピング、ドラッグ&ドロップで並び替え
- **ライブプレビュー**：編集中の定義をリアルタイムにサンプルテーブルへ反映（保存前に確認できる）
- **ワンクリック JSON 出力**：整形済みJSONを表示 & ダウンロード
- **変更履歴 + 復元**：保存ごとに差分を自動記録、スナップショットで任意の時点へ復元
- **入力バリデーション**：キー名の形式・データ型とフォーマットの整合性などをサーバ側で検証
- **マスタ管理**：表示フォーマット（日付・数値）と CSSクラスをUIで管理

## スタック

| レイヤー | 技術 |
|---|---|
| サーバ | Node.js / Express |
| DB | MongoDB + Mongoose |
| フロント | Vanilla JS / HTML / CSS（ビルドステップなし） |
| テスト | Jest + supertest + mongodb-memory-server |
| 静的解析 / CI | ESLint / GitHub Actions |

## 設計判断

- **フロントを素のJSにした理由**：MVPを最短で「動く・見せられる」状態にするため。
- **MongoDBを選んだ理由**：列定義はネストしたバリデーションルール（min/max/pattern等）を持つため、ドキュメント構造が自然に合う
- **`{ data, error }` 統一レスポンス**：フロントの分岐を一本化し、エラーハンドリングの抜け漏れを防ぐ
- **差分エンジンによる履歴**：保存前後の状態を比較して操作ログを自動生成し、変更履歴と復元の両方に再利用

## プロジェクト構成

```
server.js     エントリポイント（ルート登録・セキュリティミドルウェア・ヘルスチェック）
src/
  models/     Mongoose スキーマ（Project / Category / Column / Format / CssClass / OperationLog / Snapshot）
  routes/     APIエンドポイント（CRUD・一括保存・エクスポート・スナップショット 等）
  services/   ドメインロジック（差分計算・一括保存・スナップショット・並び替え）
  utils/      レスポンスヘルパー・バリデーション等の共通処理
public/       素のJSによる各画面（一覧 / エディタ / マスタ管理 / 変更履歴 / 復元ポイント）
tests/        Jest + supertest によるAPIテスト
```

## テスト & CI

- Jest + supertest による **138 件**のテスト。`mongodb-memory-server` でインメモリ MongoDB を起動するため、**実DBへの接続なしで** `npm test` が単体で完結する。
- push / Pull Request 時に GitHub Actions が **lint + test** を自動実行（上部の CI バッジ参照）。

```bash
npm test        # テスト実行（DB不要）
npm run lint    # ESLint チェック
```

## セットアップ

**動作要件:** Node.js 20 以上（CI は 22 で検証）、MongoDB Atlas アカウント（無料枠で可）

> アプリの起動には MongoDB Atlas の接続が必要です。テスト（`npm test`）はインメモリDBを使うため接続不要です。

```bash
# 1. 依存インストール
npm install

# 2. 環境変数設定（.env.example を参考に）
cp .env.example .env
# MONGO_URI に MongoDB Atlas の接続文字列を設定

# 3. 初期データ投入（マスタ + サンプルプロジェクト）
npm run seed

# 4. 起動
npm start        # 本番
npm run dev      # 開発（--watch）
```
