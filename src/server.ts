import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { BigQuery } from '@google-cloud/bigquery';

import { ServerConfig, parseArgs, validateConfig, initializeBigQuery } from './index.js';

// ----- 型定義 -----

/**
 * SQL クエリ引数の型定義
 */
interface QueryArguments {
  sql: string;
  maximumBytesBilled?: string;
}

/**
 * リソースメタデータの型定義
 */
interface ResourceMetadata {
  type: 'VIEW' | 'TABLE';
  schema: {
    fields: Array<unknown>;
  };
}

// ----- BigQuery操作関連ユーティリティ -----

/**
 * INFORMATION_SCHEMAクエリを修飾するヘルパー関数
 */
function qualifyTablePath(sql: string, projectId: string): string {
  // FROM INFORMATION_SCHEMA.TABLES または FROM dataset.INFORMATION_SCHEMA.TABLESにマッチする
  const unqualifiedPattern = /FROM\s+(?:(\w+)\.)?INFORMATION_SCHEMA\.TABLES/gi;
  return sql.replace(unqualifiedPattern, (match, dataset) => {
    if (dataset) {
      return `FROM \`${projectId}.${dataset}.INFORMATION_SCHEMA.TABLES\``;
    }
    throw new Error("INFORMATION_SCHEMAをクエリする場合はデータセットを指定する必要があります (例: dataset.INFORMATION_SCHEMA.TABLES)");
  });
}

/**
 * SQLクエリが読み取り専用かどうかを検証する
 */
function validateReadOnlyQuery(sql: string): void {
  const forbiddenPattern = /\b(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|MERGE|TRUNCATE|GRANT|REVOKE|EXECUTE|BEGIN|COMMIT|ROLLBACK)\b/i;
  if (forbiddenPattern.test(sql)) {
    throw new Error('読み取り操作のみが許可されています');
  }
}

// ----- MCP サーバーの実装 -----

/**
 * MCPサーバーを作成する
 */
function createServer(): Server {
  return new Server(
    {
      name: "mcp-server/bigquery",
      version: "0.1.0",
    },
    {
      capabilities: {
        resources: {},
        tools: {},
      },
    }
  );
}

/**
 * リソースのリストを取得するハンドラーを設定する
 * NOTE: Client（Claude Desktopなど）から定期的にpollingが来るので、dummy responseを返す
 *
 */
function setupListResourcesHandler(server: Server, bigquery: BigQuery, resourceBaseUrl: URL, schemaPath: string): void {
  server.setRequestHandler(ListResourcesRequestSchema, async () => {
    return { "success": true };
    // try {
      // console.error('データセットを取得中...');
      // const [datasets] = await bigquery.getDatasets();
      // console.error(`${datasets.length}個のデータセットを検出しました`);
      
      // const resources = [];

      // for (const dataset of datasets) {
      //   console.error(`データセット処理中: ${dataset.id}`);
      //   const [tables] = await dataset.getTables();
      //   console.error(`データセット${dataset.id}内に${tables.length}個のテーブルとビューを検出しました`);
        
      //   for (const table of tables) {
      //     // テーブルかビューかを確認するためのメタデータ取得
      //     const [metadata] = await table.getMetadata() as [ResourceMetadata, unknown];
      //     const resourceType = metadata.type === 'VIEW' ? 'view' : 'table';
          
      //     resources.push({
      //       uri: new URL(`${dataset.id}/${table.id}/${schemaPath}`, resourceBaseUrl).href,
      //       mimeType: "application/json",
      //       name: `"${dataset.id}.${table.id}" ${resourceType} schema`,
      //     });
      //   }
      // }

      // console.error(`合計${datasets.length}個のリソースを検出しました`);
      return { "success": true };
    // } catch (error) {
    //   console.error('ListResourcesRequestSchemaでエラー:', error);
    //   throw error;
    // }
  });
}

/**
 * リソース読み取りハンドラーを設定する
 */
function setupReadResourceHandler(server: Server, bigquery: BigQuery, schemaPath: string): void {
  server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
    try {
      const resourceUrl = new URL(request.params.uri);
      const pathComponents = resourceUrl.pathname.split("/");
      const schema = pathComponents.pop();
      const tableId = pathComponents.pop();
      const datasetId = pathComponents.pop();

      if (schema !== schemaPath) {
        throw new Error("無効なリソースURIです");
      }

      const dataset = bigquery.dataset(datasetId!);
      const table = dataset.table(tableId!);
      const [metadata] = await table.getMetadata() as [ResourceMetadata, unknown];

      return {
        contents: [
          {
            uri: request.params.uri,
            mimeType: "application/json",
            text: JSON.stringify(metadata.schema.fields, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('ReadResourceRequestSchemaでエラー:', error);
      throw error;
    }
  });
}

/**
 * ツールリストハンドラーを設定する
 */
function setupListToolsHandler(server: Server): void {
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
}

/**
 * ツール呼び出しハンドラーを設定する
 */
function setupCallToolHandler(server: Server, bigquery: BigQuery, config: ServerConfig): void {
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name === "query") {
      if (!request.params.arguments || typeof request.params.arguments.sql !== 'string') {
        throw new Error('SQLクエリが必要です');
      }
      const args = request.params.arguments as unknown as QueryArguments;
      let sql = args.sql;
      let maximumBytesBilled = args.maximumBytesBilled || "1000000000";
      
      try {
        // 読み取り専用クエリであることを検証
        validateReadOnlyQuery(sql);    

        // INFORMATION_SCHEMAクエリを修飾
        if (sql.toUpperCase().includes('INFORMATION_SCHEMA')) {
          sql = qualifyTablePath(sql, config.projectId);
        }

        const [rows] = await bigquery.query({
          query: sql,
          location: config.location,
          maximumBytesBilled: maximumBytesBilled.toString(),
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(rows, null, 2)
            }
          ]
        };
      } catch (error) {
        console.error('SQLクエリ実行でエラー:', error);
        return {
          content: [
            {
              type: "text",
              text: `クエリ実行中にエラーが発生しました: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    }
    throw new Error(`不明なツール: ${request.params.name}`);
  });
}

// ----- サーバー起動処理 -----

/**
 * サーバーを初期化し起動する
 */
export async function runServer(): Promise<void> {
  let config: ServerConfig;
  
  try {
    // 1. 設定の解析と検証
    config = parseArgs();
    validateConfig(config);
    
    // 2. 初期設定の表示
    console.error(`BigQueryを初期化します: プロジェクトID: ${config.projectId}, ロケーション: ${config.location}`);
    
    // 3. BigQueryクライアントの初期化
    const bigquery = initializeBigQuery(config);
    
    // 4. リソース関連の定数設定
    const resourceBaseUrl = new URL(`bigquery://${config.projectId}`);
    const SCHEMA_PATH = "schema";
    
    // 5. サーバーの作成
    const server = createServer();
    
    // 6. 各ハンドラーの設定
    setupListResourcesHandler(server, bigquery, resourceBaseUrl, SCHEMA_PATH);
    setupReadResourceHandler(server, bigquery, SCHEMA_PATH);
    setupListToolsHandler(server);
    setupCallToolHandler(server, bigquery, config);
    
    // 7. サーバー接続の確立
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('サーバーが正常に起動しました');
  } catch (error: unknown) {
    // エラーハンドリング
    if (error instanceof Error) {
      console.error('エラー:', error.message);
    } else {
      console.error('不明なエラーが発生しました:', error);
    }
    process.exit(1);
  }
}
