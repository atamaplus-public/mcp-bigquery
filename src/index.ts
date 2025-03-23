#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BigQuery } from '@google-cloud/bigquery';

// サーバー構成のインターフェース
interface ServerConfig {
  projectId: string;
  location?: string;
}

// コマンドライン引数の解析
function parseArgs(): ServerConfig {
  const args = process.argv.slice(2);
  const config: ServerConfig = {
    projectId: '',
    location: 'us-central1' // デフォルトロケーション
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg.startsWith('--')) {
      throw new Error(`無効な引数: ${arg}`);
    }

    const key = arg.slice(2);
    if (i + 1 >= args.length || args[i + 1].startsWith('--')) {
      throw new Error(`引数の値がありません: ${arg}`);
    }

    const value = args[++i];
    
    switch (key) {
      case 'project-id':
        config.projectId = value;
        break;
      case 'location':
        config.location = value;
        break;
      default:
        throw new Error(`不明な引数: ${arg}`);
    }
  }

  if (!config.projectId) {
    throw new Error(
      "必須引数がありません: --project-id\n" +
      "使用方法: mcp-bigquery-server --project-id <project-id> [--location <location>]"
    );
  }

  return config;
}

// MCPサーバーの作成と設定
const server = new Server(
  {
    name: "mcp-server/bigquery",
    version: "0.1.0",
  },
  {
    capabilities: {
      resources: {},
      tools: {},
    },
  },
);

// コマンドライン引数の解析
const config = parseArgs();
console.error(`BigQueryを初期化します: プロジェクトID: ${config.projectId}, ロケーション: ${config.location}`);

// ローカル認証を使用してBigQueryクライアントを初期化
const bigquery = new BigQuery({
  projectId: config.projectId
});

// リソースのベースURL
const resourceBaseUrl = new URL(`bigquery://${config.projectId}`);

// スキーマリソースのパス
const SCHEMA_PATH = "schema";

// INFORMATION_SCHEMAクエリを修飾するヘルパー関数
function qualifyInformationSchemaQuery(sql: string, projectId: string): string {
  // FROM INFORMATION_SCHEMA.TABLES または FROM dataset.INFORMATION_SCHEMA.TABLESにマッチする
  const unqualifiedPattern = /FROM\s+(?:(\w+)\.)?INFORMATION_SCHEMA\.TABLES/gi;
  return sql.replace(unqualifiedPattern, (match, dataset) => {
    if (dataset) {
      return `FROM \`${projectId}.${dataset}.INFORMATION_SCHEMA.TABLES\``;
    }
    throw new Error("INFORMATION_SCHEMAをクエリする場合はデータセットを指定する必要があります (例: dataset.INFORMATION_SCHEMA.TABLES)");
  });
}

// リソース（データセットとテーブル）のリスト取得処理
server.setRequestHandler(ListResourcesRequestSchema, async () => {
  try {
    console.error('データセットを取得中...');
    const [datasets] = await bigquery.getDatasets();
    console.error(`${datasets.length}個のデータセットを検出しました`);
    
    const resources = [];

    for (const dataset of datasets) {
      console.error(`データセット処理中: ${dataset.id}`);
      const [tables] = await dataset.getTables();
      console.error(`データセット${dataset.id}内に${tables.length}個のテーブルとビューを検出しました`);
      
      for (const table of tables) {
        // テーブルかビューかを確認するためのメタデータ取得
        const [metadata] = await table.getMetadata();
        const resourceType = metadata.type === 'VIEW' ? 'view' : 'table';
        
        resources.push({
          uri: new URL(`${dataset.id}/${table.id}/${SCHEMA_PATH}`, resourceBaseUrl).href,
          mimeType: "application/json",
          name: `"${dataset.id}.${table.id}" ${resourceType} schema`,
        });
      }
    }

    console.error(`合計${resources.length}個のリソースを検出しました`);
    return { resources };
  } catch (error) {
    console.error('ListResourcesRequestSchemaでエラー:', error);
    throw error;
  }
});

// リソーススキーマの読み取り処理
server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
  const resourceUrl = new URL(request.params.uri);
  const pathComponents = resourceUrl.pathname.split("/");
  const schema = pathComponents.pop();
  const tableId = pathComponents.pop();
  const datasetId = pathComponents.pop();

  if (schema !== SCHEMA_PATH) {
    throw new Error("無効なリソースURIです");
  }

  const dataset = bigquery.dataset(datasetId!);
  const table = dataset.table(tableId!);
  const [metadata] = await table.getMetadata();

  return {
    contents: [
      {
        uri: request.params.uri,
        mimeType: "application/json",
        text: JSON.stringify(metadata.schema.fields, null, 2),
      },
    ],
  };
});

// 利用可能なツールのリスト処理
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "query",
        description: "読み取り専用のBigQuery SQLクエリを実行する",
        inputSchema: {
          type: "object",
          properties: {
            sql: { type: "string" },
            maximumBytesBilled: { 
              type: "string",
              description: "課金される最大バイト数（デフォルト: 1GB）",
              optional: true
            }
          },
        },
      },
    ],
  };
});

// ツール呼び出し処理
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "query") {
    let sql = request.params.arguments?.sql as string;
    let maximumBytesBilled = request.params.arguments?.maximumBytesBilled || "1000000000";
    
    // 読み取り専用クエリであることを検証
    const forbiddenPattern = /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|MERGE|TRUNCATE|GRANT|REVOKE|EXECUTE|BEGIN|COMMIT|ROLLBACK)\b/i;
    if (forbiddenPattern.test(sql)) {
      throw new Error('読み取り操作のみが許可されています');
    }    

    try {
      // INFORMATION_SCHEMAクエリを修飾
      if (sql.toUpperCase().includes('INFORMATION_SCHEMA')) {
        sql = qualifyInformationSchemaQuery(sql, config.projectId);
      }

      const [rows] = await bigquery.query({
        query: sql,
        location: config.location,
        maximumBytesBilled: maximumBytesBilled.toString(),
      });

      return {
        content: [{ type: "text", text: JSON.stringify(rows, null, 2) }],
        isError: false,
      };
    } catch (error) {
      throw error;
    }
  }
  throw new Error(`不明なツール: ${request.params.name}`);
});

// サーバー開始
async function runServer() {
  try {
    const transport = new StdioServerTransport();
    await server.connect(transport);
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error('エラー:', error.message);
    } else {
      console.error('不明なエラーが発生しました:', error);
    }
    process.exit(1);
  }
}

runServer().catch(console.error);