FROM node:20-slim

WORKDIR /app

# パッケージファイルのコピー
COPY package.json ./

# 依存関係のインストール
RUN npm install

# ソースコードのコピー
COPY . .

# ビルド
RUN npm run build

# 実行権限の設定
RUN chmod +x dist/index.js

# エントリーポイントの設定
ENTRYPOINT ["node", "dist/index.js"]