#!/usr/bin/env node
/**
 * BigQuery MCP Server 疎通テストツール
 * MCP ServerとBigQuery間の接続性をテストします
 * 
 * 使用方法:
 * 1. config.sample.jsonをコピーしてconfig.jsonを作成
 * 2. config.jsonを編集して必要な設定を行う
 * 3. `node test/connectivity-test.js`を実行
 */

import { spawn } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// 設定ファイルを読み込む
const CONFIG_PATH = join(process.cwd(), 'config.json');
const SAMPLE_CONFIG_PATH = join(process.cwd(), 'config.sample.json');

// 設定ファイルの存在チェック
if (!existsSync(CONFIG_PATH)) {
  console.error('エラー: config.jsonが見つかりません');
  console.error('config.sample.jsonをコピーしてconfig.jsonを作成し、適切な設定を行ってください');
  process.exit(1);
}

// 設定を読み込む
let config;
try {
  const configData = readFileSync(CONFIG_PATH, 'utf8');
  config = JSON.parse(configData);
  
  // 必須項目の確認
  if (!config.projectId) {
    throw new Error('projectIdが設定されていません');
  }
} catch (error) {
  console.error(`設定ファイルの読み込みに失敗しました: ${error.message}`);
  process.exit(1);
}

// デフォルト値の設定
config.location = config.location || 'us-central1';
config.testQuery = config.testQuery || 'SELECT 1';
config.resourceUri = config.resourceUri || `bigquery://${config.projectId}/dataset/table/schema`;

console.log('設定を読み込みました:');
console.log(`- プロジェクトID: ${config.projectId}`);
console.log(`- ロケーション: ${config.location}`);

// サーバープロセスを開始
const server = spawn('node', [
  'dist/index.js',
  '--project-id', config.projectId,
  '--location', config.location
], { 
  stdio: ['pipe', 'pipe', 'pipe'] 
});

// エラー出力をコンソールに表示
server.stderr.on('data', (data) => {
  console.error(`SERVER LOG: ${data}`);
});

// 出力をコンソールに表示
server.stdout.on('data', (data) => {
  console.log(`SERVER OUTPUT: ${data}`);
});

// 3秒後にリクエストを送信
setTimeout(() => {
  console.log('リクエストを送信します...');
  
  // テスト一覧 - MCP ServerとBigQuery間の接続性をテスト
  const tests = [
    {
      name: 'リソース一覧',
      request: {
        jsonrpc: '2.0',
        id: '2',
        method: 'resources/list',
        params: {}
      }
    },
    {
      name: 'ツール一覧',
      request: {
        jsonrpc: '2.0',
        id: '3',
        method: 'tools/list',
        params: {}
      }
    },
    {
      name: 'サンプルクエリ実行',
      request: {
        jsonrpc: '2.0',
        id: '4',
        method: 'tools/call',
        params: {
          name: 'query',
          arguments: {
            sql: config.testQuery
          }
        }
      }
    },
    {
      name: 'リソース情報読み取り (成功しない場合はスキップ)',
      request: {
        jsonrpc: '2.0',
        id: '5',
        method: 'resources/read',
        params: {
          uri: config.resourceUri
        }
      }
    }
  ];
  
  // 最初のテストを開始
  sendNextTest(0);
  
  function sendNextTest(index) {
    if (index >= tests.length) {
      console.log('すべてのテストが完了しました。5秒後にプロセスを終了します...');
      setTimeout(() => {
        server.kill();
        process.exit(0);
      }, 5000);
      return;
    }
    
    const test = tests[index];
    console.log(`\n[テスト ${index + 1}/${tests.length}]: ${test.name}`);
    console.log('リクエスト:', JSON.stringify(test.request));
    
    // リクエストを送信
    server.stdin.write(JSON.stringify(test.request) + '\n');
    
    // 次のテストは3秒後
    setTimeout(() => sendNextTest(index + 1), 3000);
  }
}, 3000);

// 30秒後に強制終了
setTimeout(() => {
  console.log('タイムアウト：プロセスを終了します');
  server.kill();
  process.exit(1);
}, 30000);

// Ctrl+C で終了
process.on('SIGINT', () => {
  console.log('プロセスを終了しています...');
  server.kill();
  process.exit(0);
});
