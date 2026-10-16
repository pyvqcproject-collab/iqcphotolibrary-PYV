/**
 * Tiện ích tải file an toàn tuyệt đối trên mọi trình duyệt web và thiết bị di động (Chrome, Safari, iOS, Android, PC).
 * Hoạt động độc lập, không bị lỗi CommonJS / ESM khi đóng gói với Vite / Rollup trên Vercel hoặc Cloudflare.
 */
export function saveAs(blobOrUrl: Blob | string, filename: string = 'download'): void {
  if (typeof window === 'undefined') return;

  try {
    // Nếu là string URL thông thường (http://, https://)
    if (typeof blobOrUrl === 'string' && !blobOrUrl.startsWith('blob:') && !blobOrUrl.startsWith('data:')) {
      const a = document.createElement('a');
      a.href = blobOrUrl;
      a.download = filename;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }

    const blob = typeof blobOrUrl === 'string' 
      ? new Blob([blobOrUrl]) 
      : blobOrUrl;

    // Fallback cho IE / Edge cũ nếu có
    if ((window.navigator as any)?.msSaveOrOpenBlob) {
      (window.navigator as any).msSaveOrOpenBlob(blob, filename);
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Thu hồi Object URL sau một khoảng thời gian hợp lý
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch (_) {}
    }, 40000);
  } catch (err) {
    console.error('Lỗi khi tải file xuống:', err);
  }
}
