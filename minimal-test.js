#!/usr/bin/env node
/**
 * MCP Serverテストツール - 修正版 (メソッド名修正)
 * MCP SDK v0.6.0で使用される正しいJSON-RPCメソッド名を使用
 */

import { spawn } from 'child_process';

// サーバープロセスを開始
const server = spawn('node', [
  'dist/index.js',
  '--project-id', 'atamaplus-data-workspace',
  '--location', 'us-central1'
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
  
  // 試すメソッド名 - MCP SDK v0.6.0の正しいメソッド名を使用
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
            sql: 'SELECT product_name, SUM(price) as total_price FROM `atamaplus-data-workspace.mcp_test.mcp_test_table` GROUP BY product_name ORDER BY total_price DESC LIMIT 5'
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
          uri: 'bigquery://atamaplus-data-workspace/mcp_test/mcp_test_table/schema'
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
