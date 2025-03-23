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

## Claudeデスクトップへのインストール

Claude Desktop設定ファイル（通常は`~/.config/Claude Desktop/claude_desktop_config.json`）に以下のエントリを追加します：

```json
{
  "mcpServers": {
    "bigquery": {
      "command": "node",
      "args": [
        "/absolute/path/to/dist/index.js",
        "--project-id",
        "YOUR_PROJECT_ID",
        "--location",
        "us"  // USマルチリージョンの場合
      ],
      "env": {
        "GOOGLE_APPLICATION_CREDENTIALS": "/absolute/path/to/your/credentials.json"
      }
    }
  }
}
```

## 動作確認

サーバが正しく動作しているか確認するには、以下のコマンドを実行します：

```bash
npm test
```

これにより、以下のテストが実行されます：

- リソース一覧の取得
- ツール一覧の取得
- SQLクエリの実行
- リソーススキーマの読み取り

## 設定

サーバーは以下のコマンドライン引数を受け付けます:

- `--project-id`: (必須) GoogleクラウドプロジェクトID
- `--location`: (オプション) BigQueryのロケーション、デフォルトは 'us-central1'
  - USマルチリージョンのデータセットには 'us' を指定

## 制限事項

- 読み取り専用クエリのみが許可されます
- デフォルトのクエリ制限は処理データ1GBです
