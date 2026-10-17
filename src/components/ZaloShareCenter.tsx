import React, { useState, useEffect, useMemo } from 'react';
import { 
  Copy, 
  Check, 
  ExternalLink, 
  Download, 
  Image as ImageIcon, 
  Search, 
  Share2, 
  Calendar, 
  User as UserIcon, 
  CheckCircle2, 
  AlertCircle,
  FileSpreadsheet,
  ArrowRight,
  RefreshCw,
  MessageSquare
} from 'lucide-react';
import { ZaloIcon, ZaloShareReportData, buildZaloMessage, getPartType } from './ZaloShareModal';
import { saveAs } from '../lib/download';
import JSZip from 'jszip';
import { DriveImage } from './QCHistory';
import { format } from 'date-fns';

interface ZaloShareCenterProps {
  currentReport: ZaloShareReportData | null;
  historyReports?: any[];
  token?: string;
  onNavigateToCreate?: () => void;
  onNavigateToHistory?: () => void;
}

export function ZaloShareCenter({
  currentReport,
  historyReports = [],
  token,
  onNavigateToCreate,
  onNavigateToHistory
}: ZaloShareCenterProps) {
  // Source selection: 'current' | 'history'
  const [selectedSource, setSelectedSource] = useState<'current' | 'history'>(
    currentReport ? 'current' : (historyReports.length > 0 ? 'history' : 'current')
  );
  
  // Selected history report id
  const [selectedHistoryId, setSelectedHistoryId] = useState<string>(
    historyReports.length > 0 ? historyReports[0].id : ''
  );
  const [searchPo, setSearchPo] = useState('');
  const [customNote, setCustomNote] = useState('');
  const [copiedText, setCopiedText] = useState(false);
  const [copiedImageIdx, setCopiedImageIdx] = useState<number | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);
  const [isDownloadingZip, setIsDownloadingZip] = useState(false);

  // Filter history reports by PO search
  const filteredHistoryReports = useMemo(() => {
    if (!searchPo.trim()) return historyReports;
    const q = searchPo.toLowerCase().trim();
    return historyReports.filter(r => 
      (r.order && r.order.toLowerCase().includes(q)) ||
      (r.shoeModel && r.shoeModel.toLowerCase().includes(q)) ||
      (r.errorName && r.errorName.toLowerCase().includes(q)) ||
      (r.floor && r.floor.toLowerCase().includes(q))
    );
  }, [historyReports, searchPo]);

  // Determine active report to share
  const activeReport: ZaloShareReportData | null = useMemo(() => {
    if (selectedSource === 'current' && currentReport) {
      return currentReport;
    }

    if (historyReports.length > 0) {
      const target = historyReports.find(r => r.id === selectedHistoryId) || historyReports[0];
      if (target) {
        return {
          id: target.id,
          order: target.order || 'Không có PO',
          shoeModel: target.shoeModel,
          colorCode: target.colorCode || '',
          errorName: target.errorName || 'Lỗi',
          errorNames: target.errorNames || (target.errorName ? [target.errorName] : []),
          imageErrors: target.imageErrors,
          supplier: target.supplier || '',
          floor: target.floor || '',
          part: target.part,
          subPart: target.subPart,
          date: target.date,
          createdAt: target.createdAt,
          employeeName: target.employeeName,
          employeeId: target.employeeId,
          note: target.note,
          imageUrls: target.imageUrls || []
        };
      }
    }

    return currentReport || null;
  }, [selectedSource, currentReport, historyReports, selectedHistoryId]);

  // Text message generated
  const zaloMessage = useMemo(() => {
    if (!activeReport) return 'Chưa có thông tin đơn hàng để chia sẻ.';
    return buildZaloMessage(activeReport, customNote.trim() || undefined);
  }, [activeReport, customNote]);

  // Image items
  const photoItems = useMemo(() => {
    if (!activeReport) return [];
    const items: Array<{
      source: string | File;
      previewUrl: string;
      defectName: string;
      index: number;
    }> = [];

    if (activeReport.imageFiles && activeReport.imageFiles.length > 0) {
      activeReport.imageFiles.forEach((file, idx) => {
        const defect = (activeReport.imageErrors && activeReport.imageErrors[idx])
          || (activeReport.errorNames && activeReport.errorNames[idx])
          || activeReport.errorName
          || 'Lỗi';
        items.push({
          source: file,
          previewUrl: URL.createObjectURL(file),
          defectName: defect,
          index: idx
        });
      });
    } else if (activeReport.imageUrls && activeReport.imageUrls.length > 0) {
      activeReport.imageUrls.forEach((url, idx) => {
        const defect = (activeReport.imageErrors && activeReport.imageErrors[idx])
          || (activeReport.errorNames && activeReport.errorNames[idx])
          || activeReport.errorName
          || 'Lỗi';
        items.push({
          source: url,
          previewUrl: url,
          defectName: defect,
          index: idx
        });
      });
    }

    return items;
  }, [activeReport]);

  // 1. Sao chép nội dung tin nhắn
  const handleCopyText = async () => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(zaloMessage);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = zaloMessage;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }
      setCopiedText(true);
      setStatusNotice('Đã sao chép tin nhắn vào bộ nhớ tạm! Bạn có thể dán (Ctrl+V) vào Zalo ngay.');
      setTimeout(() => setCopiedText(false), 3000);
    } catch (_) {
      setStatusNotice('Đã chọn văn bản bên dưới, bạn hãy nhấn Ctrl + C để sao chép.');
    }
  };

  // 2. Tải 1 ảnh về máy
  const handleDownloadSinglePhoto = (item: typeof photoItems[0]) => {
    try {
      const fileName = `PO_${activeReport?.order || 'QC'}_Anh_${item.index + 1}_${item.defectName.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
      if (item.source instanceof File) {
        saveAs(item.source, fileName);
        setStatusNotice(`Đã tải ảnh #${item.index + 1} về máy.`);
      } else if (typeof item.source === 'string') {
        const a = document.createElement('a');
        a.href = item.source;
        a.download = fileName;
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setStatusNotice(`Đã chuẩn bị tải ảnh #${item.index + 1}.`);
      }
    } catch (e) {
      console.warn("Download photo error:", e);
    }
  };

  // 3. Sao chép ảnh vào Clipboard (Ctrl + V vào Zalo)
  const handleCopyPhotoToClipboard = async (item: typeof photoItems[0]) => {
    setStatusNotice('Đang xử lý ảnh để sao chép...');
    try {
      if (item.source instanceof File) {
        if (typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
          await navigator.clipboard.write([
            new ClipboardItem({ [item.source.type || 'image/png']: item.source })
          ]);
          setCopiedImageIdx(item.index);
          setStatusNotice(`Đã sao chép Ảnh #${item.index + 1}! Bạn sang Zalo nhấn Ctrl + V để dán.`);
          setTimeout(() => setCopiedImageIdx(null), 3000);
          return;
        }
      }
      // Fallback
      handleDownloadSinglePhoto(item);
    } catch (err) {
      handleDownloadSinglePhoto(item);
    }
  };

  // 4. Tải tất cả ảnh dạng ZIP
  const handleDownloadAllZip = async () => {
    if (photoItems.length === 0) return;
    setIsDownloadingZip(true);
    setStatusNotice('Đang chuẩn bị gói hình ảnh...');

    try {
      const zip = new JSZip();
      for (let i = 0; i < photoItems.length; i++) {
        const item = photoItems[i];
        const fileName = `PO_${activeReport?.order || 'QC'}_Anh_${i + 1}_${item.defectName.replace(/[^a-zA-Z0-9]/g, '_')}.jpg`;
        if (item.source instanceof File) {
          zip.file(fileName, item.source);
        } else if (typeof item.source === 'string') {
          try {
            const res = await fetch(item.source);
            if (res.ok) {
              const b = await res.blob();
              zip.file(fileName, b);
            }
          } catch (_) {
            // Skip failed cors image
          }
        }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      saveAs(blob, `PO_${activeReport?.order || 'QC'}_Hinh_Anh_Loi.zip`);
      setStatusNotice('Đã tải tệp ZIP chứa toàn bộ ảnh thành công!');
    } catch (e) {
      console.warn("ZIP failed:", e);
      setStatusNotice('Không thể nén tự động. Bạn có thể tải từng ảnh bên dưới.');
    } finally {
      setIsDownloadingZip(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-slate-100 overflow-y-auto p-3 sm:p-5 lg:p-6 pb-24 md:pb-6">
      <div className="max-w-6xl mx-auto w-full space-y-5">
        
        {/* Header Banner - Zalo Brand */}
        <div className="bg-gradient-to-r from-[#0068FF] to-blue-700 text-white rounded-2xl p-4 sm:p-6 shadow-md border border-blue-600/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-white p-1.5 flex items-center justify-center shadow-md shrink-0">
              <ZaloIcon className="w-10 h-10 sm:w-11 sm:h-11" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold uppercase tracking-wider bg-white/20 px-2 py-0.5 rounded-full text-blue-50">
                  TRUNG TÂM CHIA SẺ QC
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              </div>
              <h1 className="text-lg sm:text-2xl font-black tracking-tight mt-1">
                Chia Sẻ Biên Bản & Minh Chứng Qua Zalo
              </h1>
              <p className="text-xs sm:text-sm text-blue-100 font-sans mt-0.5 leading-relaxed">
                Tự động định dạng tin nhắn ngắn gọn, quản lý hình ảnh lỗi và hỗ trợ dán thẳng vào nhóm Zalo nhà máy
              </p>
            </div>
          </div>

          {/* Quick Actions in Header */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <a
              href="https://chat.zalo.me/"
              target="_blank"
              rel="noopener noreferrer"
              className="bg-white hover:bg-slate-100 text-[#0068FF] font-extrabold text-xs sm:text-sm py-2.5 px-4 rounded-xl flex items-center gap-2 shadow-sm transition-all hover:scale-[1.02] cursor-pointer"
              title="Mở ứng dụng Zalo trên trình duyệt Web (chat.zalo.me)"
            >
              <ExternalLink className="h-4 w-4 text-[#0068FF]" />
              <span>MỞ ZALO WEB</span>
            </a>

            <a
              href="zalo://"
              className="bg-blue-800/80 hover:bg-blue-900 text-white font-bold text-xs sm:text-sm py-2.5 px-3.5 rounded-xl flex items-center gap-2 border border-white/20 transition-all cursor-pointer"
              title="Mở phần mềm Zalo Desktop cài sẵn trên máy tính của bạn"
            >
              <MessageSquare className="h-4 w-4" />
              <span>MỞ APP ZALO</span>
            </a>
          </div>
        </div>

        {/* Status Notification Toast */}
        {statusNotice && (
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs sm:text-sm text-blue-950 flex items-center gap-2.5 font-medium shadow-xs animate-in fade-in duration-200">
            <CheckCircle2 className="h-5 w-5 text-[#0068FF] shrink-0" />
            <span className="flex-1">{statusNotice}</span>
            <button 
              onClick={() => setStatusNotice(null)}
              className="text-xs font-mono font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Source Selector: Current Form or History */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3.5 sm:p-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold text-slate-500 uppercase">NGUỒN DỮ LIỆU:</span>
            <div className="inline-flex rounded-lg bg-slate-100 p-1 border border-slate-200 text-xs font-mono font-bold">
              <button
                type="button"
                onClick={() => setSelectedSource('current')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  selectedSource === 'current' 
                    ? 'bg-[#0068FF] text-white shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ĐƠN VỪA TẠO / FORM HIỆN TẠI
              </button>
              <button
                type="button"
                onClick={() => setSelectedSource('history')}
                className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                  selectedSource === 'history' 
                    ? 'bg-[#0068FF] text-white shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                CHỌN TỪ LỊCH SỬ QC ({historyReports.length})
              </button>
            </div>
          </div>

          {selectedSource === 'history' && (
            <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
              <div className="relative w-full">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Tìm PO, hình thể, lỗi..."
                  value={searchPo}
                  onChange={e => setSearchPo(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-lg text-xs font-mono focus:bg-white focus:ring-1 focus:ring-blue-500 outline-none"
                />
              </div>
            </div>
          )}
        </div>

        {/* If History source is picked, show horizontal selector strip */}
        {selectedSource === 'history' && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-3 space-y-2">
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-500 font-bold uppercase">
                DANH SÁCH BÁO CÁO ({filteredHistoryReports.length}):
              </span>
              <span className="text-slate-400 text-[11px]">Bấm vào thẻ để nạp dữ liệu gửi Zalo</span>
            </div>

            {filteredHistoryReports.length === 0 ? (
              <div className="py-6 text-center text-xs text-slate-400 font-mono">
                Không tìm thấy báo cáo nào phù hợp.
              </div>
            ) : (
              <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
                {filteredHistoryReports.slice(0, 20).map(report => {
                  const isSelected = activeReport?.id === report.id || selectedHistoryId === report.id;
                  return (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => setSelectedHistoryId(report.id)}
                      className={`min-w-[210px] text-left p-2.5 rounded-xl border text-xs transition-all cursor-pointer shrink-0 ${
                        isSelected 
                          ? 'bg-blue-50 border-[#0068FF] shadow-xs ring-1 ring-[#0068FF]/30' 
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-slate-900 truncate">
                          PO: {report.order || 'N/A'}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">
                          {report.date ? format(new Date(report.date), 'dd/MM') : ''}
                        </span>
                      </div>
                      <div className="text-[11px] font-semibold text-red-600 truncate mt-1">
                        {report.errorName || 'Lỗi'}
                      </div>
                      <div className="flex items-center gap-1.5 mt-1 text-[10px] font-mono">
                        {(() => {
                          const partType = getPartType(report.part, report.subPart);
                          if (partType === 'sole') {
                            const val = report.shoeModel || report.colorCode;
                            return val ? (
                              <span className="font-bold text-teal-800 bg-teal-50 px-1.5 py-0.2 rounded border border-teal-200">
                                HT: {val}
                              </span>
                            ) : null;
                          } else {
                            const val = report.colorCode || report.shoeModel;
                            return val ? (
                              <span className="font-bold text-indigo-800 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-200">
                                MÃ MÀU: {val}
                              </span>
                            ) : null;
                          }
                        })()}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono flex items-center justify-between mt-1">
                        <span>{report.floor || 'Xưởng'}</span>
                        <span className="bg-slate-200 px-1.5 py-0.2 rounded font-bold">
                          {report.imageUrls?.length || 0} ảnh
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Main Content Workspace: 2 Columns */}
        {!activeReport ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-10 text-center space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mx-auto text-[#0068FF]">
              <ZaloIcon className="h-10 w-10" />
            </div>
            <div>
              <h3 className="font-extrabold text-base text-slate-800">Chưa có dữ liệu báo cáo để chia sẻ</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 leading-relaxed">
                Bạn có thể quay lại tab "Tạo báo cáo" để nhập thông số đơn hàng hoặc chọn một báo cáo từ lịch sử.
              </p>
            </div>
            {onNavigateToCreate && (
              <button
                type="button"
                onClick={onNavigateToCreate}
                className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-xs py-2.5 px-4 rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <span>+ ĐẾN MÀN HÌNH TẠO BÁO CÁO</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            
            {/* Left Column: Formatted Zalo Message (Cols 5) */}
            <div className="lg:col-span-5 bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-[#0068FF] text-white flex items-center justify-center text-xs font-mono font-bold">
                    01
                  </span>
                  <h3 className="font-extrabold text-xs sm:text-sm font-mono uppercase text-slate-800">
                    Nội Dung Tin Nhắn Zalo
                  </h3>
                </div>
                <span className="text-[11px] font-mono text-slate-500 font-semibold bg-slate-100 px-2 py-0.5 rounded">
                  {zaloMessage.length} ký tự
                </span>
              </div>

              {/* Quick 1-click Copy Button */}
              <button
                type="button"
                onClick={handleCopyText}
                className={`w-full py-3 px-4 rounded-xl font-mono font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-all cursor-pointer border ${
                  copiedText 
                    ? 'bg-emerald-600 text-white border-emerald-600' 
                    : 'bg-[#0068FF] hover:bg-[#0055d4] active:bg-[#0047b3] text-white border-blue-600 hover:shadow'
                }`}
                title="Sao chép nội dung ngắn gọn này vào bộ nhớ tạm"
              >
                {copiedText ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                <span>{copiedText ? 'ĐÃ SAO CHÉP THÀNH CÔNG!' : '📋 SAO CHÉP NỘI DUNG GỬI ZALO'}</span>
              </button>

              {/* Message Preview Box */}
              <div className="relative">
                <pre className="font-mono text-xs sm:text-[13px] bg-slate-900 text-slate-100 rounded-xl p-4 whitespace-pre-wrap leading-relaxed select-all border border-slate-800 overflow-x-auto shadow-inner">
                  {zaloMessage}
                </pre>
                <div className="absolute top-2 right-2 text-[10px] font-mono text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded border border-slate-700 pointer-events-none">
                  Chuẩn hóa Zalo
                </div>
              </div>

              {/* Optional Custom Note input */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[11px] font-mono font-bold text-slate-600 uppercase">
                  Lời nhắn gửi kèm thêm (Tùy chọn):
                </label>
                <input
                  type="text"
                  placeholder="Ví dụ: Lầu 2 vui lòng dừng kiểm tra đơn này..."
                  value={customNote}
                  onChange={e => setCustomNote(e.target.value)}
                  className="w-full text-xs font-sans p-2.5 bg-slate-50 border border-slate-300 rounded-xl outline-none focus:bg-white focus:border-[#0068FF] focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {/* Guide / 3 Steps */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl text-xs space-y-1.5 text-blue-950 font-sans mt-auto">
                <div className="font-bold font-mono text-[11px] text-blue-800 uppercase flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600"></span>
                  Hướng Dẫn Gửi Vào Zalo (3 Bước):
                </div>
                <div className="space-y-1 text-[11px] leading-relaxed text-blue-900">
                  <p><strong>1.</strong> Bấm nút <strong>"Sao chép nội dung"</strong> ở trên.</p>
                  <p><strong>2.</strong> Bấm <strong>"Mở Zalo Web"</strong> (hoặc mở ứng dụng Zalo trên máy tính).</p>
                  <p><strong>3.</strong> Nhấn phím <strong>Ctrl + V</strong> để dán tin nhắn vào khung chat nhóm nhà máy.</p>
                </div>
              </div>
            </div>

            {/* Right Column: Evidence Images & Download Tools (Cols 7) */}
            <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-slate-900 text-white flex items-center justify-center text-xs font-mono font-bold">
                    02
                  </span>
                  <h3 className="font-extrabold text-xs sm:text-sm font-mono uppercase text-slate-800 flex items-center gap-1.5">
                    <ImageIcon className="h-4 w-4 text-[#0068FF]" />
                    <span>Hình Ảnh Minh Chứng Lỗi ({photoItems.length})</span>
                  </h3>
                </div>

                {photoItems.length > 0 && (
                  <button
                    type="button"
                    onClick={handleDownloadAllZip}
                    disabled={isDownloadingZip}
                    className="text-xs font-mono font-bold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg border border-emerald-300 flex items-center gap-1.5 cursor-pointer transition-colors"
                    title="Tải toàn bộ hình ảnh dạng tệp ZIP"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span>{isDownloadingZip ? 'Đang nén ZIP...' : 'TẢI TOÀN BỘ ẢNH (ZIP)'}</span>
                  </button>
                )}
              </div>

              {photoItems.length === 0 ? (
                <div className="py-12 text-center text-slate-400 border border-dashed rounded-xl flex flex-col items-center justify-center gap-2">
                  <ImageIcon className="h-10 w-10 text-slate-300" />
                  <span className="text-xs font-mono">Báo cáo này chưa có hình ảnh đính kèm</span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {photoItems.map((item) => (
                    <div 
                      key={item.index}
                      className="bg-slate-900 border border-slate-300 rounded-xl overflow-hidden flex flex-col shadow-xs"
                    >
                      <div className="relative aspect-square w-full bg-slate-950 flex items-center justify-center">
                        <img 
                          src={item.previewUrl} 
                          alt={`Ảnh #${item.index + 1}`} 
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <span className="absolute top-1.5 left-1.5 bg-black/75 text-white font-mono text-[9px] px-1.5 py-0.5 rounded font-bold">
                          #{item.index + 1}
                        </span>
                      </div>

                      <div className="p-2 bg-slate-900 border-t border-slate-800 flex flex-col gap-1.5">
                        <span className="text-[11px] font-mono font-bold text-amber-300 truncate" title={item.defectName}>
                          {item.defectName || 'Lỗi kiểm định'}
                        </span>

                        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleCopyPhotoToClipboard(item)}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-mono font-bold py-1.5 px-1 rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors"
                            title="Sao chép ảnh để dán (Ctrl+V) vào Zalo"
                          >
                            {copiedImageIdx === item.index ? (
                              <Check className="h-3 w-3 text-emerald-300" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            <span>{copiedImageIdx === item.index ? 'Đã chép' : 'Chép ảnh'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDownloadSinglePhoto(item)}
                            className="bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-mono font-bold py-1.5 px-1 rounded-md flex items-center justify-center gap-1 cursor-pointer transition-colors border border-slate-700"
                            title="Tải ảnh này về máy tính"
                          >
                            <Download className="h-3 w-3" />
                            <span>Tải về</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Direct Web Links at Bottom of Card */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 mt-auto">
                <div className="flex items-center gap-2 text-xs text-slate-600 font-mono">
                  <span>PO hiện tại:</span>
                  <strong className="text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {activeReport.order || 'Không có PO'}
                  </strong>
                </div>

                <div className="flex items-center gap-2">
                  <a
                    href="https://chat.zalo.me/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-[#0068FF] hover:bg-[#0055d4] text-white text-xs font-mono font-bold py-2 px-3.5 rounded-lg shadow-2xs transition-colors cursor-pointer"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>MỞ ZALO WEB ĐỂ DÁN TIN</span>
                  </a>
                </div>
              </div>
            </div>

          </div>
        )}

      </div>
    </div>
  );
}
