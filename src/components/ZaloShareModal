import React, { useState, useEffect } from 'react';
import { 
  X, 
  Copy, 
  Check, 
  Send, 
  Download, 
  ExternalLink, 
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { saveAs } from '../lib/download';
import JSZip from 'jszip';

export function ZaloIcon({ className = "w-5 h-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} fill="none">
      <circle cx="24" cy="24" r="22" fill="#0068FF" />
      <path 
        d="M13 18h11.2l-9.8 11.8H25v2.8H11.8v-2.3L21.7 18.5H13V18z" 
        fill="#FFFFFF" 
      />
      <circle cx="31.5" cy="24" r="3.2" fill="#FFFFFF" />
      <path d="M28.3 14h2.8v10h-2.8V14z" fill="#FFFFFF" />
      <path d="M37 18h2.8v14.6H37V18z" fill="#FFFFFF" />
      <ellipse cx="38.4" cy="27" rx="3.5" ry="3.5" fill="#FFFFFF" />
    </svg>
  );
}

export interface ZaloShareReportData {
  id?: string;
  order: string;
  shoeModel?: string;
  colorCode: string;
  errorName: string;
  errorNames?: string[];
  imageErrors?: string[];
  supplier: string;
  floor: string;
  part?: string;
  subPart?: string;
  date?: string;
  createdAt?: string | Date;
  employeeName?: string;
  employeeId?: string;
  note?: string;
  imageUrls?: string[];
  imageFiles?: File[];
}

interface ZaloShareModalProps {
  report: ZaloShareReportData | null;
  onClose: () => void;
  token?: string;
}

/**
 * Tạo nội dung tin nhắn Zalo cực kỳ ngắn gọn, súc tích:
 * Chỉ gồm thông tin đơn hàng thiết yếu, KHÔNG chứa chuỗi base64 dài dòng, KHÔNG ký tự thừa!
 */
export function buildZaloMessage(report: ZaloShareReportData, customNote?: string): string {
  const lines: string[] = [];

  // 1. PO
  lines.push(`PO: ${report.order || 'Không có PO'}`);

  // 2. Hình thể / Model (nếu có)
  if (report.shoeModel) {
    lines.push(`Hình thể: ${report.shoeModel}`);
  }

  // 3. Màu
  if (report.colorCode) {
    lines.push(`Màu: ${report.colorCode}`);
  }

  // 4. Bộ vị
  const partFull = report.subPart 
    ? `${report.part || ''} - ${report.subPart}`.trim() 
    : (report.part || '');
  if (partFull) {
    lines.push(`Bộ vị: ${partFull}`);
  }

  // 5. Lỗi
  const errorsList = report.errorNames && report.errorNames.length > 0 
    ? report.errorNames 
    : (report.errorName ? [report.errorName] : []);
  if (errorsList.length > 0) {
    lines.push(`Lỗi: ${errorsList.join(', ')}`);
  }

  // 6. Xưởng & Vị trí
  const loc = [report.supplier, report.floor].filter(Boolean).join(' - ');
  if (loc) {
    lines.push(`Xưởng/Vị trí: ${loc}`);
  }

  // 7. Ghi chú (nếu có)
  const note = (customNote || report.note || '').trim();
  if (note) {
    lines.push(`Ghi chú: ${note}`);
  }

  return lines.join('\n');
}

/**
 * Trợ giúp lấy Blob từ URL ảnh hoặc File
 */
async function resolveImageBlob(source: string | File, token?: string): Promise<Blob | null> {
  if (source instanceof File) {
    return source;
  }
  if (typeof source !== 'string') return null;

  // Base64 data URL
  if (source.startsWith('data:')) {
    try {
      const res = await fetch(source);
      return await res.blob();
    } catch {
      return null;
    }
  }

  // Google Drive URL
  const fileIdMatch = source.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) 
    || source.match(/[?&]id=([a-zA-Z0-9_-]+)/)
    || source.match(/open\?id=([a-zA-Z0-9_-]+)/);
  const fileId = fileIdMatch ? fileIdMatch[1] : null;

  if (fileId && token && token !== 'NO_TOKEN') {
    try {
      const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        return await res.blob();
      }
    } catch (_) {}
  }

  // Trực tiếp fetch
  try {
    const res = await fetch(source, { mode: 'cors' });
    if (res.ok) return await res.blob();
  } catch (_) {}

  // Fallback Canvas
  try {
    return await new Promise<Blob | null>((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.9);
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = source;
    });
  } catch {
    return null;
  }
}

/**
 * Sao chép ảnh vào clipboard dưới dạng PNG để người dùng có thể Ctrl+V thẳng vào Zalo
 */
async function copyBlobToClipboard(blob: Blob): Promise<boolean> {
  try {
    let pngBlob = blob;
    // Clipboard API yêu cầu chuẩn image/png
    if (blob.type !== 'image/png') {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image decode failed'));
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || img.width;
      canvas.height = img.naturalHeight || img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const converted = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
        if (converted) pngBlob = converted;
      }
      URL.revokeObjectURL(url);
    }

    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': pngBlob })
      ]);
      return true;
    }
    return false;
  } catch (err) {
    console.warn("Lỗi sao chép ảnh vào clipboard:", err);
    return false;
  }
}

export function ZaloShareModal({ report, onClose, token }: ZaloShareModalProps) {
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImageIdx, setCopiedImageIdx] = useState<number | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [customNote, setCustomNote] = useState('');
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Danh sách hình ảnh preview (local URL hoặc web URL)
  const [photoPreviews, setPhotoPreviews] = useState<Array<{
    source: string | File;
    previewUrl: string;
    defectName: string;
    index: number;
  }>>([]);

  useEffect(() => {
    if (!report) return;

    const previews: Array<{
      source: string | File;
      previewUrl: string;
      defectName: string;
      index: number;
    }> = [];

    // Nếu có imageFiles (File cục bộ sau khi submit)
    if (report.imageFiles && report.imageFiles.length > 0) {
      report.imageFiles.forEach((file, idx) => {
        const specificError = (report.imageErrors && report.imageErrors[idx])
          ? report.imageErrors[idx]
          : (report.errorNames && report.errorNames[idx])
            ? report.errorNames[idx]
            : (report.errorName || 'Lỗi');
        previews.push({
          source: file,
          previewUrl: URL.createObjectURL(file),
          defectName: specificError,
          index: idx
        });
      });
    } else if (report.imageUrls && report.imageUrls.length > 0) {
      report.imageUrls.forEach((url, idx) => {
        const specificError = (report.imageErrors && report.imageErrors[idx])
          ? report.imageErrors[idx]
          : (report.errorNames && report.errorNames[idx])
            ? report.errorNames[idx]
            : (report.errorName || 'Lỗi');
        previews.push({
          source: url,
          previewUrl: url,
          defectName: specificError,
          index: idx
        });
      });
    }

    setPhotoPreviews(previews);

    return () => {
      // Dọn dẹp object URLs tạo từ File
      previews.forEach(p => {
        if (p.source instanceof File && p.previewUrl.startsWith('blob:')) {
          URL.revokeObjectURL(p.previewUrl);
        }
      });
    };
  }, [report]);

  if (!report) return null;

  // Tin nhắn ngắn gọn - chỉ thông tin đơn hàng
  const compactMessage = buildZaloMessage(report, customNote.trim() || undefined);
  const totalPhotos = photoPreviews.length;

  // 1. Sao chép nội dung thông tin đơn hàng
  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(compactMessage);
      setCopiedText(true);
      setStatusNotice('Đã sao chép thông tin đơn hàng! Vào Zalo nhấn Ctrl + V để dán.');
      setTimeout(() => {
        setCopiedText(false);
      }, 3000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = compactMessage;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      setCopiedText(true);
      setStatusNotice('Đã sao chép thông tin đơn hàng!');
      setTimeout(() => setCopiedText(false), 3000);
    }
  };

  // 2. Sao chép 1 tấm ảnh vào Clipboard (Ctrl + V vào Zalo để dán thẳng ảnh)
  const handleCopySingleImage = async (item: typeof photoPreviews[0]) => {
    try {
      setStatusNotice('Đang xử lý ảnh để sao chép...');
      const blob = await resolveImageBlob(item.source, token);
      if (!blob) {
        setStatusNotice('Không thể lấy dữ liệu ảnh để chép. Vui lòng thử nút Tải ảnh.');
        return;
      }

      const success = await copyBlobToClipboard(blob);
      if (success) {
        setCopiedImageIdx(item.index);
        setStatusNotice(`Đã sao chép Ảnh #${item.index + 1}! Bạn sang Zalo nhấn Ctrl + V để gửi ảnh.`);
        setTimeout(() => setCopiedImageIdx(null), 3000);
      } else {
        // Fallback tải ảnh
        saveAs(blob, `PO_${report.order}_${item.defectName.replace(/[^a-zA-Z0-9]/g, '_')}_${item.index + 1}.jpg`);
        setStatusNotice(`Đã tải Ảnh #${item.index + 1} về máy để bạn kéo thả vào Zalo.`);
      }
    } catch (e) {
      console.warn("Copy image failed:", e);
      setStatusNotice('Không hỗ trợ sao chép ảnh trực tiếp trên trình duyệt này. Đã sẵn sàng nút Tải ảnh.');
    }
  };

  // 3. Tải 1 tấm ảnh về máy
  const handleDownloadSingleImage = async (item: typeof photoPreviews[0]) => {
    try {
      const blob = await resolveImageBlob(item.source, token);
      if (blob) {
        saveAs(blob, `PO_${report.order}_${item.defectName.replace(/[^a-zA-Z0-9]/g, '_')}_${item.index + 1}.jpg`);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // 4. Chia sẻ trực tiếp qua Zalo (Web Share API kèm ảnh & tin nhắn)
  const handleNativeShare = async () => {
    setIsSharing(true);
    setStatusNotice(null);

    // Luôn copy thông tin đơn hàng vào bộ nhớ tạm trước làm phương án dự phòng
    try {
      await navigator.clipboard.writeText(compactMessage);
    } catch (_) {}

    try {
      // Chuẩn bị danh sách File để gửi qua Web Share API
      const filesToShare: File[] = [];

      for (let i = 0; i < photoPreviews.length; i++) {
        const item = photoPreviews[i];
        if (item.source instanceof File) {
          filesToShare.push(item.source);
        } else {
          const blob = await resolveImageBlob(item.source, token);
          if (blob) {
            filesToShare.push(
              new File(
                [blob], 
                `PO_${report.order}_${item.defectName.replace(/[^a-zA-Z0-9]/g, '_')}_${i + 1}.jpg`, 
                { type: blob.type || 'image/jpeg' }
              )
            );
          }
        }
      }

      // Kiểm tra hỗ trợ Web Share API với files
      if (typeof navigator !== 'undefined' && navigator.share) {
        if (filesToShare.length > 0 && navigator.canShare && navigator.canShare({ files: filesToShare })) {
          await navigator.share({
            title: `PO: ${report.order}`,
            text: compactMessage,
            files: filesToShare,
          });
          setIsSharing(false);
          return;
        }

        // Nếu không share được files cùng lúc thì share text
        await navigator.share({
          title: `PO: ${report.order}`,
          text: compactMessage,
        });
        setIsSharing(false);
        return;
      }

      // Môi trường không có Web Share (PC/Desktop) => Mở Zalo Web
      handleOpenZaloWeb();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        handleOpenZaloWeb();
      }
    } finally {
      setIsSharing(false);
    }
  };

  // 5. Mở Zalo Web an toàn (tránh bị trình duyệt chặn popup trong iframe)
  const handleOpenZaloWeb = () => {
    handleCopyText();
    const link = document.createElement('a');
    link.href = 'https://chat.zalo.me/';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 6. Tải toàn bộ ảnh
  const handleDownloadAllPhotos = async () => {
    if (photoPreviews.length === 0) return;
    setIsDownloading(true);
    try {
      if (photoPreviews.length === 1) {
        await handleDownloadSingleImage(photoPreviews[0]);
      } else {
        const zip = new JSZip();
        for (let i = 0; i < photoPreviews.length; i++) {
          const item = photoPreviews[i];
          const blob = await resolveImageBlob(item.source, token);
          if (blob) {
            zip.file(
              `PO_${report.order}_${item.defectName.replace(/[^a-zA-Z0-9]/g, '_')}_${i + 1}.jpg`, 
              blob
            );
          }
        }
        const content = await zip.generateAsync({ type: 'blob' });
        saveAs(content, `PO_${report.order}_Zalo_Photos.zip`);
      }
      setStatusNotice('Đã tải hình ảnh về máy thành công!');
    } catch (e: any) {
      console.error(e);
      setStatusNotice('Không thể nén tải tất cả ảnh. Vui lòng bấm tải từng ảnh bên dưới.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 select-none animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Zalo Theme */}
        <div className="bg-[#0068FF] text-white p-3.5 sm:p-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white p-1 flex items-center justify-center shadow-sm">
              <ZaloIcon className="w-7 h-7" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm sm:text-base tracking-wide flex items-center gap-1.5">
                Chia Sẻ Sang Zalo
              </h3>
              <p className="text-[11px] text-blue-100 font-mono">
                Thông tin đơn hàng + {totalPhotos} hình ảnh
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer border-none"
            title="Đóng"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-3.5 sm:p-4 overflow-y-auto space-y-3.5 flex-1 text-slate-800">
          
          {/* Thông báo trạng thái tương tác */}
          {statusNotice && (
            <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-[#0068FF] shrink-0" />
              <span className="flex-1">{statusNotice}</span>
            </div>
          )}

          {/* 1. KHUNG THÔNG TIN ĐƠN HÀNG (Cực kỳ ngắn gọn, trực quan) */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold text-slate-500 uppercase">
                Thông tin đơn hàng ({compactMessage.length} ký tự)
              </span>
              <button
                type="button"
                onClick={handleCopyText}
                className="text-xs font-mono font-bold text-[#0068FF] hover:text-blue-800 flex items-center gap-1 cursor-pointer transition-colors"
                title="Sao chép nội dung ngắn gọn này"
              >
                {copiedText ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                <span>{copiedText ? 'Đã sao chép' : 'Sao chép thông tin'}</span>
              </button>
            </div>

            {/* Preview text box */}
            <pre className="font-mono text-xs bg-white border border-slate-300 rounded-lg p-2.5 text-slate-800 whitespace-pre-wrap leading-relaxed select-all">
              {compactMessage}
            </pre>
          </div>

          {/* 2. KHUNG HÌNH ẢNH MINH CHỨNG */}
          {photoPreviews.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-mono font-bold text-slate-700 uppercase flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5 text-[#0068FF]" />
                  Hình ảnh kèm theo ({totalPhotos} ảnh):
                </span>
                <button
                  type="button"
                  onClick={handleDownloadAllPhotos}
                  disabled={isDownloading}
                  className="text-[11px] font-mono font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg border border-emerald-200 flex items-center gap-1 cursor-pointer transition-colors"
                  title="Tải tất cả ảnh về máy"
                >
                  <Download className="h-3 w-3" />
                  <span>{isDownloading ? 'Đang nén...' : 'Tải bộ ảnh'}</span>
                </button>
              </div>

              {/* Lưới hình ảnh trực quan */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {photoPreviews.map((item) => (
                  <div 
                    key={item.index}
                    className="bg-slate-900 border border-slate-300 rounded-xl overflow-hidden flex flex-col shadow-xs"
                  >
                    <div className="relative aspect-square w-full bg-slate-950 flex items-center justify-center">
                      <img 
                        src={item.previewUrl} 
                        alt={`Ảnh ${item.index + 1}`} 
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <span className="absolute top-1 left-1 bg-black/75 text-white font-mono text-[9px] px-1 py-0.5 rounded font-bold">
                        #{item.index + 1}
                      </span>
                    </div>

                    <div className="p-1.5 bg-slate-900 border-t border-slate-800 flex flex-col gap-1">
                      <span className="text-[10px] font-mono font-bold text-amber-300 truncate text-center" title={item.defectName}>
                        {item.defectName || 'Lỗi'}
                      </span>
                      
                      <div className="grid grid-cols-2 gap-1 pt-0.5">
                        <button
                          type="button"
                          onClick={() => handleCopySingleImage(item)}
                          className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-mono font-bold py-1 px-1 rounded flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          title="Sao chép ảnh để dán (Ctrl+V) vào Zalo"
                        >
                          {copiedImageIdx === item.index ? (
                            <Check className="h-2.5 w-2.5" />
                          ) : (
                            <Copy className="h-2.5 w-2.5" />
                          )}
                          <span>{copiedImageIdx === item.index ? 'Đã chép' : 'Chép ảnh'}</span>
                        </button>
                        
                        <button
                          type="button"
                          onClick={() => handleDownloadSingleImage(item)}
                          className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono font-bold py-1 px-1 rounded flex items-center justify-center gap-1 cursor-pointer transition-colors border border-slate-700"
                          title="Tải ảnh này về máy"
                        >
                          <Download className="h-2.5 w-2.5" />
                          <span>Tải về</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ghi chú thêm tùy chọn */}
          <div className="space-y-1">
            <input 
              type="text"
              value={customNote}
              onChange={e => setCustomNote(e.target.value)}
              placeholder="Thêm lời nhắn gửi kèm (tùy chọn)..."
              className="w-full text-xs font-sans p-2 border border-slate-300 rounded-lg outline-none focus:border-[#0068FF] focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3.5 sm:p-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleNativeShare}
            disabled={isSharing}
            className="w-full sm:flex-1 bg-[#0068FF] hover:bg-[#0055d4] active:bg-[#0047b3] text-white font-extrabold text-xs sm:text-sm py-2.5 px-3 rounded-xl flex items-center justify-center gap-2 shadow-sm hover:shadow transition-all cursor-pointer border-none"
            title="Mở ứng dụng Zalo để gửi tin nhắn kèm hình ảnh"
          >
            <Send className="h-4 w-4" />
            <span>{isSharing ? 'Đang chuẩn bị...' : 'GỬI TRỰC TIẾP QUA ZALO'}</span>
          </button>

          <button
            type="button"
            onClick={handleOpenZaloWeb}
            className="w-full sm:w-auto bg-white hover:bg-slate-100 active:bg-slate-200 border border-slate-300 text-slate-800 font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-colors shadow-2xs"
            title="Mở trang Zalo Web (chat.zalo.me)"
          >
            <ExternalLink className="h-3.5 w-3.5 text-[#0068FF]" />
            <span>Mở Zalo Web</span>
          </button>

          <button
            type="button"
            onClick={handleCopyText}
            className={`w-full sm:w-auto border text-xs font-bold py-2.5 px-3.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
              copiedText 
                ? 'bg-emerald-600 text-white border-emerald-600' 
                : 'bg-white hover:bg-slate-100 border-slate-300 text-slate-700'
            }`}
          >
            {copiedText ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5 text-slate-500" />}
            <span>{copiedText ? 'ĐÃ CHÉP' : 'SAO CHÉP'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
