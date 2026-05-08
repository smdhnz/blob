# Blob Server (with Tunnel)

Bun + SQLite で動作する、シンプルで高速なファイルストレージサーバーです。
`tcpexposer` を利用したSSHトンネル機能が組み込まれており、ローカル環境で起動するだけで外部からアクセス可能なストレージとして利用できます。

## 特徴

- **高速 & 軽量**: Bun Runtime と SQLite (WAL mode) を使用。
- **簡単セットアップ**: Docker Compose 一発でストレージとトンネルが起動。
- **アクセス制御**: `public` (誰でも閲覧可能) と `private` (署名付きURLが必要) の2つのモード。
- **外部公開**: `tcpexposer.com` 経由で、複雑なネットワーク設定なしにHTTPS公開が可能。

## セットアップ

### 1. 準備
SSH鍵（`id_ed25519` 等）が `~/.ssh/` に存在することを確認してください。トンネルの認証に使用します。

### 2. 環境設定
`.env.example` を `.env` にコピーし、環境に合わせて編集します。

```bash
cp .env.example .env
```

`.env` の主要な項目:
- `SUBDOMAIN`: `tcpexposer.com` で使用するサブドメイン名。
- `TCPEXPOSER_USERNAME`: `tcpexposer.com` のユーザー名。
- `BLOB_SECRET_KEY`: API認証および署名URL生成に使用するランダムな文字列。
- `SSH_SECRET_KEY_FILENAME`: `~/.ssh/` 内の秘密鍵ファイル名。

### 3. 起動
```bash
docker compose up -d --build
```

起動後、`http://<SUBDOMAIN>.tcpexposer.com/health` にアクセスして `OK` が返れば準備完了です。

## API 利用手順

全ての操作において、ヘッダーに `Authorization: Bearer <BLOB_SECRET_KEY>` が必要です（ダウンロードを除く）。

### ファイルのアップロード
`POST /` に対して `multipart/form-data` で送信します。

| パラメータ | 型 | 内容 |
| :--- | :--- | :--- |
| `file` | File | アップロードするファイル本体（必須） |
| `access` | string | `public` または `private` (デフォルト: `private`) |
| `path` | string | ストレージ内での保存サブパス (任意) |

**例 (curl):**
```bash
curl -X POST -H "Authorization: Bearer your-secret" \
     -F "file=@photo.png" \
     -F "access=public" \
     https://your-subdomain.tcpexposer.com/
```

### ファイルの一覧取得
`GET /` でアップロード済みファイルの一覧を取得します。

**例 (curl):**
```bash
curl -H "Authorization: Bearer your-secret" https://your-subdomain.tcpexposer.com/
```

### ファイルの削除
`DELETE /<filename>` または `DELETE /<subpath>/<filename>` で削除します。

**例 (curl):**
```bash
curl -X DELETE -H "Authorization: Bearer your-secret" \
     https://your-subdomain.tcpexposer.com/your-file.png
```

## クライアント実装例 (Next.js Server Actions)

サーバーサイドで処理を行うことで、`BLOB_SECRET_KEY` を安全に管理できます。

```typescript
'use server';

const BLOB_URL = 'https://your-subdomain.tcpexposer.com/';
const AUTH = { 'Authorization': `Bearer ${process.env.BLOB_SECRET_KEY}` };

// アップロード
export async function upload(formData: FormData) {
  const response = await fetch(BLOB_URL, {
    method: 'POST',
    headers: AUTH,
    body: formData, // file, access, path を含む
  });
  return await response.json();
}

// 一覧取得
export async function list() {
  const response = await fetch(BLOB_URL, { headers: AUTH });
  const data = await response.json();
  return data.blobs;
}
```

## 注意事項
- **セキュリティ**: `BLOB_SECRET_KEY` は十分に長く推測困難な文字列に設定してください。
- **データ永続化**: アップロードされたファイルとデータベースは、ホスト側の `./data` ディレクトリに保存されます。
