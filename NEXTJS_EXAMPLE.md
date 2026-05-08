# Next.js (Server Actions) での利用例

この例では、Next.jsのサーバーサイドで処理を行うため、`BLOB_SECRET_KEY` をクライアント側に漏洩させずに安全に操作できます。

## 1. サーバーアクションの作成 (`app/actions/blob.ts`)

```typescript
'use server';

const BLOB_SERVER_URL = process.env.BLOB_SERVER_URL!;
const BLOB_SECRET_KEY = process.env.BLOB_SECRET_KEY!;

// アップロード
export async function uploadFile(formData: FormData) {
  const file = formData.get('file') as File;
  if (!file) throw new Error('No file provided');

  const blobFormData = new FormData();
  blobFormData.append('file', file);
  blobFormData.append('access', 'public'); // または 'private'
  blobFormData.append('path', 'uploads/images'); // 任意

  const response = await fetch(BLOB_SERVER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BLOB_SECRET_KEY}`,
    },
    body: blobFormData,
  });

  if (!response.ok) throw new Error('Upload failed');
  return await response.json();
}

// 一覧取得
export async function listFiles() {
  const response = await fetch(BLOB_SERVER_URL, {
    headers: {
      'Authorization': `Bearer ${BLOB_SECRET_KEY}`,
    },
  });

  if (!response.ok) throw new Error('Failed to fetch list');
  const data = await response.json();
  return data.blobs;
}

// 削除
export async function deleteFile(storagePath: string) {
  // storagePath は 'public/uploads/images/...' のような形式
  // APIは '/path/to/file' を期待するため、プレフィックスを削除
  const path = storagePath.replace(/^(public|private)\//, '');
  
  const response = await fetch(new URL(path, BLOB_SERVER_URL), {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${BLOB_SECRET_KEY}`,
    },
  });

  if (!response.ok) throw new Error('Delete failed');
  return { success: true };
}
```

## 2. フォームコンポーネント (`components/UploadForm.tsx`)

```tsx
'use client';

import { uploadFile } from '@/app/actions/blob';
import { useState } from 'react';

export function UploadForm() {
  const [url, setUrl] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsPending(true);
    const formData = new FormData(event.currentTarget);
    
    try {
      const result = await uploadFile(formData);
      setUrl(result.url);
      alert('アップロード成功！');
    } catch (error) {
      console.error(error);
      alert('アップロード失敗');
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="p-4 border rounded shadow">
      <form onSubmit={handleSubmit} className="space-y-4">
        <input type="file" name="file" required className="block w-full" />
        <button 
          type="submit" 
          disabled={isPending}
          className="bg-blue-500 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {isPending ? 'アップロード中...' : 'アップロード'}
        </button>
      </form>
      {url && (
        <div className="mt-4">
          <p className="font-bold">アップロード済みURL:</p>
          <a href={url} target="_blank" rel="noreferrer" className="text-blue-500 break-all underline">
            {url}
          </a>
        </div>
      )}
    </div>
  );
}
```

## .env.local の設定

```env
BLOB_SERVER_URL=https://your-subdomain.tcpexposer.com/
BLOB_SECRET_KEY=your-secret-key-here
```
