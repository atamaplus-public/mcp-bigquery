# BigQuery MCP Server

BigQueryデータをクエリするためのMCP (Model Context Protocol) サーバーです。AIアシスタント（Claude）がBigQueryデータに直接アクセスできるようになります。

## 機能

- 自然言語でBigQueryにSQLクエリを実行
- データセットとテーブルの一覧表示
- テーブルスキーマの表示
- 安全制御付きの読み取り専用クエリの実行

## 使用方法

### 前提条件

- BigQueryが有効なGoogleクラウドプロジェクト
- ローカルに設定された認証情報

```bash
gcloud auth application-default login
```

### Dockerでの実行

1. Dockerイメージをビルド:

```bash
docker build -t mcp-bigquery-server .
```

2. コンテナ実行:

```bash
docker run --rm \
  -v $HOME/.config/gcloud:/root/.config/gcloud \
  mcp-bigquery-server \
  --project-id YOUR_PROJECT_ID \
  --location YOUR_LOCATION
```

### ローカルでの実行

1. 依存関係のインストール:

```bash
npm install
```

2. プロジェクトのビルド:

```bash
npm run build
```

3. サーバーの起動:

```bash
npm start -- --project-id YOUR_PROJECT_ID --location YOUR_LOCATION
```

## 設定

サーバーは以下のコマンドライン引数を受け付けます:

- `--project-id`: (必須) GoogleクラウドプロジェクトID
- `--location`: (オプション) BigQueryのロケーション、デフォルトは 'us-central1'

## 制限事項

- 読み取り専用クエリのみが許可されます
- デフォルトのクエリ制限は処理データ1GBです
