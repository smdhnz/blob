# Personal Blob Storage (Vercel Blob Style)

BunとSQLiteを使用した、セキュアで高速な個人用Blobストレージ。

## 特徴
- **セキュア**: パス・トラバーサル対策、ファイルサイズ制限（100MB）、MIMEタイプ保持。
- **高速・低メモリ**: ストリーミング処理による効率的なアップロード。メタデータをSQLite (WALモード) で管理。
- **Vercel Blobライク**: シンプルなAPI、推測困難なID付きURL。
- **プライベート/パブリック**: ファイル単位でアクセス制御可能。
- **署名付きURL**: プライベートファイルでも一時的にブラウザで表示可能。
- **高耐久**: クリーンシャットダウン対応。

## セットアップ

1. `.env.example` を `.env` にコピーし、`BLOB_SECRET_KEY` を設定します。
2. `PUID`, `PGID` を実行ユーザーに合わせて設定します（デフォルト1000）。
3. `docker compose up -d` で起動。

## API リファレンス

### アップロード (POST `/`)
```bash
curl -X POST -H "Authorization: Bearer your-secret-key" \
  -F "file=@photo.jpg" \
  -F "access=public" \
  -F "path=images/2026" \
  http://localhost:8080/
```
- **Response**: `{ url: string, id: string, filename: string, access: string }`

### 一覧取得 (GET `/`)
```bash
curl -H "Authorization: Bearer your-secret-key" \
  "http://localhost:8080/?limit=100&offset=0"
```
- **Response**: `{ blobs: Array<{ id, filename, path, access, contentType, size, uploadedAt, storagePath, url }> }`
- プライベートファイルの場合、`url` には有効期限1時間の署名付きURLが自動的に設定されます。

### ダウンロード (GET `/:path*`)
- **パブリック**: 直接アクセス可能 (`http://localhost:8080/path/to/file.jpg`)
- **プライベート**:
  - `Authorization` ヘッダーが必要。
  - または、署名付きURL (`?expires=...&signature=...`) を使用。

### 削除 (DELETE `/:path*`)
```bash
curl -X DELETE -H "Authorization: Bearer your-secret-key" \
  http://localhost:8080/images/2026/photo.jpg
```
