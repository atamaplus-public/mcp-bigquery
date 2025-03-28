#!/usr/bin/env node
import { BigQuery } from '@google-cloud/bigquery';
import { runServer } from './server.js';

// ----- 1. 設定管理 -----

/**
 * サーバー構成のインターフェース
 */
export interface ServerConfig {
  projectId: string;
  location: string; // デフォルト値があるのでオプショナルにせず、初期化時に値を設定
}

/**
 * コマンドライン引数を解析して設定オブジェクトを返す
 */
export function parseArgs(): ServerConfig {
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

/**
 * 設定の妥当性を検証する
 */
export function validateConfig(config: ServerConfig): void {
  // プロジェクトID形式の検証（基本的なチェック）
  if (!/^[a-z0-9-]+$/.test(config.projectId)) {
    throw new Error('無効なプロジェクトID形式です');
  }

  // ロケーション形式の検証（指定されている場合）
  // if (!/^[a-z]+-[a-z]+\d+$/.test(config.location)) {
  //   throw new Error('無効なロケーション形式です');
  // }
}

/**
 * BigQueryクライアントを初期化する
 */
export function initializeBigQuery(config: ServerConfig): BigQuery {
  return new BigQuery({
    projectId: config.projectId
  });
}

// メイン処理の実行
runServer().catch((error) => {
  console.error('致命的なエラー:', error);
  process.exit(1);
});
