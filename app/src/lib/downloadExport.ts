/** Fetch protected exports with the same bearer authentication as tRPC.
 * Never put credentials in a download URL or forward them to another origin.
 */
export async function downloadExportFile(downloadUrl: string, filename: string, endpoint: string, token?: string | null): Promise<void> {
  const base = new URL(endpoint);
  const url = new URL(downloadUrl, base);
  if (url.origin !== base.origin || !url.pathname.startsWith('/api/file/')) throw new Error('导出文件地址无效');
  url.searchParams.set('download', 'true');
  const response = await fetch(url.href, {
    credentials: 'include',
    redirect: 'error',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '登录状态已失效，请重新登录后导出' : `下载失败（${response.status}），请重新导出`);
  if (response.headers.get('content-type')?.includes('application/json')) throw new Error('服务器未返回导出文件，请重试');
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  document.body.appendChild(link);
  try { link.click(); }
  finally {
    link.remove();
    // Chromium can resolve the blob asynchronously after the click returns.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
  }
}
