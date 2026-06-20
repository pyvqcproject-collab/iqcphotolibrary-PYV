import React, { useState, useEffect, useMemo, useRef } from 'react';
import { User } from 'firebase/auth';
import { collection, query, where, getDocs, doc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../lib/firebase';
import { uploadFileToDrive } from '../lib/drive';
import { uploadFileToStorage } from '../lib/storage';
import { 
  Search, 
  Calendar, 
  RefreshCw, 
  ExternalLink,
  Download, 
  FileText, 
  CheckCircle, 
  CloudOff, 
  CloudLightning, 
  Maximize2, 
  Info, 
  MapPin, 
  Tag, 
  Factory, 
  Binary, 
  AlertCircle,
  Clock,
  ChevronRight,
  Sparkles,
  Layers,
  ArrowUpDown,
  ChevronLeft,
  X,
  Pencil,
  Trash2,
  Save,
  Undo2,
  ShieldCheck,
  AlertTriangle
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import JSZip from 'jszip';

interface QCReport {
  id: string;
  date: string;
  floor: string;
  order: string;
  colorCode: string;
  errorName: string;
  supplier: string;
  imageUrls: string[];
  employeeId: string;
  employeeEmail: string;
  note?: string;
  createdAt: any; // String ISO representation or Firebase timestamp
  isLocalOnly?: boolean;
}

interface QCHistoryProps {
  user: User;
  token: string;
  userProfile?: any;
  onNavigateToCreate: () => void;
  isActive?: boolean;
}

// A helper component to render a Google Drive image thumbnail
interface DriveImageProps {
  url: string;
  token?: string;
  className?: string;
  alt?: string;
  onLoaded?: (objectUrl: string) => void;
}

export function DriveImage({ url, token, className = '', alt = 'Hình ảnh QC', onLoaded }: DriveImageProps) {
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorSec, setErrorSec] = useState(false);

  const fileId = useMemo(() => {
    if (!url) return null;
    if (url.startsWith('data:image')) return null;
    const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match1) return match1[1];
    const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (match2) return match2[1];
    const match3 = url.match(/open\?id=([a-zA-Z0-9_-]+)/);
    if (match3) return match3[1];
    return null;
  }, [url]);

  useEffect(() => {
    if (!fileId) {
      if (url && (url.startsWith('data:image') || url.startsWith('http'))) {
        setImgSrc(url);
        setLoading(false);
        if (onLoaded) onLoaded(url);
      } else {
        setErrorSec(true);
        setLoading(false);
      }
      return;
    }

    let isMounted = true;
    let objectUrl: string | null = null;

    const fetchImg = async () => {
      setLoading(true);
      setErrorSec(false);
      try {
        if (token) {
          // Attempt high-quality authenticated download for private file permissions
          const apiRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
            headers: {
              Authorization: `Bearer ${token}`
            }
          });
          if (apiRes.ok) {
            const blob = await apiRes.blob();
            if (isMounted) {
              objectUrl = URL.createObjectURL(blob);
              setImgSrc(objectUrl);
              setLoading(false);
              if (onLoaded) onLoaded(objectUrl);
              return;
            }
          }
        }

        // Offline / Unauthenticated/Fallback: Google Drive public thumbnail API
        const thumbUrl = `https://drive.google.com/thumbnail?sz=w300&id=${fileId}`;
        const img = new Image();
        img.src = thumbUrl;
        img.onload = () => {
          if (isMounted) {
            setImgSrc(thumbUrl);
            setLoading(false);
            if (onLoaded) onLoaded(thumbUrl);
          }
        };
        img.onerror = () => {
          // Alternative Google server fallback
          const alternativeUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
          const imgAlt = new Image();
          imgAlt.src = alternativeUrl;
          imgAlt.onload = () => {
            if (isMounted) {
              setImgSrc(alternativeUrl);
              setLoading(false);
              if (onLoaded) onLoaded(alternativeUrl);
            }
          };
          imgAlt.onerror = () => {
            if (isMounted) {
              setErrorSec(true);
              setLoading(false);
            }
          };
        };
      } catch (err) {
        console.warn("Could not preview Drive file", fileId, err);
        if (isMounted) {
          setErrorSec(true);
          setLoading(false);
        }
      }
    };

    fetchImg();

    return () => {
      isMounted = false;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [fileId, token, url]);

  if (loading) {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-100 rounded-lg animate-pulse ${className}`}>
        <RefreshCw className="h-4 w-4 animate-spin text-slate-450" />
      </div>
    );
  }

  if (errorSec || !imgSrc) {
    return (
      <div className={`flex flex-col items-center justify-center bg-slate-50 border border-slate-200 text-slate-400 gap-1 rounded-lg ${className}`}>
        <AlertCircle className="h-4 w-4 text-slate-400" />
        <span className="text-[9px] font-medium leading-none">Lỗi tải ảnh</span>
      </div>
    );
  }

  return (
    <img 
      src={imgSrc} 
      alt={alt} 
      className={`object-cover ${className}`}
      referrerPolicy="no-referrer"
    />
  );
}

export const QCHistory = React.memo(function QCHistory({ user, token, userProfile, onNavigateToCreate, isActive = true }: QCHistoryProps) {
  const [reports, setReports] = useState<QCReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncStatusMsg, setSyncStatusMsg] = useState('');
  const [selectedReport, setSelectedReport] = useState<QCReport | null>(null);
  const [activeDetailImageIndex, setActiveDetailImageIndex] = useState<number>(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [loadedImageUrls, setLoadedImageUrls] = useState<Record<number, string>>({});

  // Admin capability check
  const isAdmin = useMemo(() => {
    if (!user || !user.email) return false;
    const emailLower = user.email.toLowerCase();
    return emailLower === 'pyvqcproject@gmail.com' || emailLower.includes('admin');
  }, [user]);

  // Edit capability logic
  const isEditable = useMemo(() => {
    if (!selectedReport) return false;
    if (isAdmin) return true;

    // Check if report belongs to user's permitted floors or was created by them
    const isMyFloor = userProfile?.permittedFloors?.includes(selectedReport.floor) || selectedReport.employeeEmail === user?.email;
    if (!isMyFloor) return false;

    // Local-only reports are fully editable
    if (selectedReport.isLocalOnly) return true;

    // Respect 24h limit for synced reports
    if (selectedReport.createdAt) {
      const createdTime = new Date(selectedReport.createdAt).getTime();
      const now = new Date().getTime();
      if (now - createdTime > 24 * 60 * 60 * 1000) {
        return false;
      }
    }
    return true;
  }, [selectedReport, isAdmin, userProfile, user]);

  // Admin and standard editing/deleting states
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editOrder, setEditOrder] = useState('');
  const [editColorCode, setEditColorCode] = useState('');
  const [editErrorName, setEditErrorName] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [adminActionError, setAdminActionError] = useState('');

  // Auto-reset active image index when the user switches reports
  useEffect(() => {
    setActiveDetailImageIndex(0);
    setLoadedImageUrls({});
    setIsEditing(false);
    setDeleteConfirmOpen(false);
    setAdminActionError('');
    setIsSavingEdit(false);
  }, [selectedReport?.id]);

  const startEditing = () => {
    if (!selectedReport || !isEditable) return;
    setEditDate(selectedReport.date);
    setEditFloor(selectedReport.floor);
    setEditOrder(selectedReport.order);
    setEditColorCode(selectedReport.colorCode);
    setEditErrorName(selectedReport.errorName);
    setEditSupplier(selectedReport.supplier);
    setAdminActionError('');
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedReport || !isEditable) return;
    if (!editFloor.trim() || !editOrder.trim() || !editColorCode.trim() || !editErrorName.trim() || !editSupplier.trim() || !editDate.trim()) {
      setAdminActionError('Vui lòng nhập đầy đủ tất cả thông tin.');
      return;
    }

    setIsSavingEdit(true);
    setAdminActionError('');
    try {
      if (selectedReport.isLocalOnly) {
        // Edit local-only report
        const localJson = localStorage.getItem('local_qc_reports');
        if (localJson) {
          const parsed = JSON.parse(localJson) as any[];
          const updated = parsed.map((item) => {
            if (item.id === selectedReport.id) {
              return {
                ...item,
                date: editDate,
                floor: editFloor,
                order: editOrder,
                colorCode: editColorCode,
                errorName: editErrorName,
                supplier: editSupplier
              };
            }
            return item;
          });
          localStorage.setItem('local_qc_reports', JSON.stringify(updated));
        }

        const updatedReport: QCReport = {
          ...selectedReport,
          date: editDate,
          floor: editFloor,
          order: editOrder,
          colorCode: editColorCode,
          errorName: editErrorName,
          supplier: editSupplier
        };

        setSelectedReport(updatedReport);
        setReports(prev => prev.map(r => r.id === selectedReport.id ? updatedReport : r));
      } else {
        // Update in Firestore
        const docRef = doc(db, 'qc_reports', selectedReport.id);
        await updateDoc(docRef, {
          date: editDate,
          floor: editFloor,
          order: editOrder,
          colorCode: editColorCode,
          errorName: editErrorName,
          supplier: editSupplier
        });

        const updatedReport: QCReport = {
          ...selectedReport,
          date: editDate,
          floor: editFloor,
          order: editOrder,
          colorCode: editColorCode,
          errorName: editErrorName,
          supplier: editSupplier
        };

        setSelectedReport(updatedReport);
        setReports(prev => prev.map(r => r.id === selectedReport.id ? updatedReport : r));
      }
      setIsEditing(false);
    } catch (err: any) {
      console.error("Failed to edit report:", err);
      setAdminActionError("Không thể cập nhật báo cáo: " + (err.message || err.toString()));
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDeleteReport = async () => {
    if (!selectedReport || !isEditable) return;
    setIsDeleting(true);
    setAdminActionError('');
    try {
      if (selectedReport.isLocalOnly) {
        // Remove from local storage
        const localJson = localStorage.getItem('local_qc_reports');
        if (localJson) {
          const parsed = JSON.parse(localJson) as QCReport[];
          const updated = parsed.filter(item => item.id !== selectedReport.id);
          localStorage.setItem('local_qc_reports', JSON.stringify(updated));
        }
      } else {
        // 1. Try to delete Drive files if accessToken and imageUrls are available
        if (token && selectedReport.imageUrls && selectedReport.imageUrls.length > 0) {
          for (const imageUrl of selectedReport.imageUrls) {
            try {
              const fileIdMatch = imageUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/) || imageUrl.match(/[?&]id=([a-zA-Z0-9_-]+)/);
              if (fileIdMatch) {
                const fileId = fileIdMatch[1];
                await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
                  method: 'DELETE',
                  headers: {
                    Authorization: `Bearer ${token}`
                  }
                });
              }
            } catch (driveErr) {
              console.warn("Could not delete file from Google Drive during report deletion:", imageUrl, driveErr);
            }
          }
        }
        
        // 2. Delete Firestore Doc
        const docRef = doc(db, 'qc_reports', selectedReport.id);
        await deleteDoc(docRef);
      }

      // 3. Update States
      const deletedId = selectedReport.id;
      setReports(prev => prev.filter(r => r.id !== deletedId));
      setSelectedReport(null);
      setDeleteConfirmOpen(false);
    } catch (err: any) {
      console.error("Failed to delete report:", err);
      setAdminActionError("Không thể xóa báo cáo: " + (err.message || err.toString()));
    } finally {
      setIsDeleting(false);
    }
  };

  // Keyboard navigation for the Lightbox modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (lightboxIndex === null || !selectedReport || !selectedReport.imageUrls) return;
      
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === 'ArrowLeft' && selectedReport.imageUrls.length > 1) {
        setLightboxIndex(prev => prev !== null ? (prev - 1 + selectedReport.imageUrls.length) % selectedReport.imageUrls.length : null);
      } else if (e.key === 'ArrowRight' && selectedReport.imageUrls.length > 1) {
        setLightboxIndex(prev => prev !== null ? (prev + 1) % selectedReport.imageUrls.length : null);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxIndex, selectedReport]);
  
  // Filtering and Searching State
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedFloor, setSelectedFloor] = useState('all');
  const [selectedSupplier, setSelectedSupplier] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedDate, setSelectedDate] = useState('');
  const [selectedEndDate, setSelectedEndDate] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const getBase64ImageFromUrl = async (url: string): Promise<string | null> => {
    return new Promise((resolve) => {
      if (!url) return resolve(null);
      if (url.startsWith('data:image')) return resolve(url);
      
      let fileId = null;
      const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match1) fileId = match1[1];
      const match2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
      if (match2) fileId = match2[1];
      if (url.includes('lh3.googleusercontent.com/d/')) {
        fileId = url.split('/').pop()?.split('?')[0];
      }

      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // keep image max size
        let w = img.width;
        let h = img.height;
        if (w > 800) {
          h = h * (800 / w);
          w = 800;
        }
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', 0.8));
        } catch (e) {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      
      if (fileId) {
         img.src = `https://lh3.googleusercontent.com/d/${fileId}`;
      } else {
         img.src = url;
      }
    });
  };

  const handleExportToExcel = async () => {
    try {
      setIsLoading(true); // show loading state while creating excel!
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Báo Cáo QC');

      // Define columns
      worksheet.columns = [
        { header: 'PO', key: 'po', width: 15 },
        { header: 'Mã Màu', key: 'color', width: 15 },
        { header: 'Lỗi', key: 'error', width: 25 },
        { header: 'Khu vực', key: 'floor', width: 15 },
        { header: 'Xưởng', key: 'supplier', width: 15 },
        { header: 'Ngày lỗi', key: 'date', width: 15 },
        { header: 'Người báo cáo', key: 'reporter', width: 15 },
        { header: 'Ghi chú', key: 'note', width: 25 },
        { header: 'Hình ảnh lỗi', key: 'image', width: 30 }
      ];

      // Style headers
      worksheet.getRow(1).font = { bold: true };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

      for (let i = 0; i < filteredReports.length; i++) {
        const report = filteredReports[i];
        
        // Add row data
        const rowIndex = i + 2; 
        const row = worksheet.addRow({
          po: report.order,
          color: report.colorCode,
          error: report.errorName,
          floor: report.floor,
          supplier: report.supplier,
          date: format(parseISO(report.date), 'dd/MM/yyyy'),
          reporter: report.employeeId,
          note: report.note || ''
        });

        // Add Image
        if (report.imageUrls && report.imageUrls.length > 0) {
          worksheet.getRow(rowIndex).height = 100; // row height 100
          
          const base64 = await getBase64ImageFromUrl(report.imageUrls[0]);
          if (base64) {
            const imageId = workbook.addImage({
              base64: base64,
              extension: 'jpeg',
            });
            worksheet.addImage(imageId, {
              tl: { col: 8, row: rowIndex - 1 }, // Column I (0-indexed 8)
              ext: { width: 120, height: 120 },
              editAs: 'oneCell'
            });
          } else {
             worksheet.getCell(`I${rowIndex}`).value = "Lỗi tải ảnh";
          }
        }
        
        // alignment
        row.alignment = { vertical: 'middle', wrapText: true };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const fileName = `QC_Reports_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`;
      saveAs(new Blob([buffer]), fileName);

    } catch (e: any) {
      console.error(e);
      alert("Lỗi xuất Excel: " + (e.message || "Không xác định"));
    } finally {
      setIsLoading(false);
    }
  };

  const sanitizeName = (str: string) => {
    let s = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    s = s.replace(/đ/g, "d").replace(/Đ/g, "D");
    s = s.replace(/[^a-zA-Z0-9-[\]() ]/g, " ");
    return s.trim().replace(/\s+/g, " ");
  };

  const handleDownloadBulkZIP = async () => {
    try {
      setIsLoading(true);
      const zip = new JSZip();
      for (const report of filteredReports) {
        if (!report.imageUrls || report.imageUrls.length === 0) continue;
        const safeOrder = sanitizeName(report.order);
        const safeColor = sanitizeName(report.colorCode);
        const safeError = sanitizeName(report.errorName);
        const safeSupplier = sanitizeName(report.supplier);
        const safeFloor = sanitizeName(report.floor);
        const namePrefix = `${safeOrder}_${safeColor}_${safeError}_${safeSupplier}_${safeFloor}`;
        
        for (let i = 0; i < report.imageUrls.length; i++) {
           const url = report.imageUrls[i];
           let base64 = await getBase64ImageFromUrl(url);
           if (base64) {
              const base64Data = base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
              // Store in a Folder named after PO
              zip.file(`PO_${safeOrder}/${namePrefix}_${i + 1}.jpg`, base64Data, {base64: true});
           }
        }
      }
      const archiveCount = Object.keys(zip.files).length;
      if (archiveCount === 0) {
        alert("Không tìm thấy hình ảnh nào để tải về.");
        return;
      }
      
      const content = await zip.generateAsync({type: "blob"});
      saveAs(content, `QC_Images_${format(new Date(), 'yyyyMMdd_HHmmss')}.zip`);
    } catch (e: any) {
      console.error(e);
      alert("Lỗi tải ZIP: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadImageUrls = async (urls: string[], namePrefix: string) => {
    if (urls.length === 1) {
      await downloadImage(urls[0], 0, namePrefix);
    } else {
      const zip = new JSZip();
      for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        let base64 = await getBase64ImageFromUrl(url);
        if (base64) {
           const base64Data = base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
           zip.file(`${namePrefix}_${i + 1}.jpg`, base64Data, {base64: true});
        }
      }
      const content = await zip.generateAsync({type: "blob"});
      saveAs(content, `${namePrefix}_Images.zip`);
    }
  };

  const handleDownloadActiveImage = async () => {
    if (!selectedReport) return;
    const objectUrl = selectedReport.imageUrls[activeDetailImageIndex];
    if (!objectUrl) return;

    const safeOrder = sanitizeName(selectedReport.order);
    const safeColor = sanitizeName(selectedReport.colorCode);
    const safeError = sanitizeName(selectedReport.errorName);
    const safeSupplier = sanitizeName(selectedReport.supplier);
    const safeFloor = sanitizeName(selectedReport.floor);
    const namePrefix = `${safeOrder}_${safeColor}_${safeError}_${safeSupplier}_${safeFloor}`;
    
    // We already have 'getBase64ImageFromUrl' which handles the CORS/object URL properly
    const actualDownloadUrl = loadedImageUrls[activeDetailImageIndex] || objectUrl;
    await downloadImage(actualDownloadUrl, activeDetailImageIndex, namePrefix);
  };

  const handleDownloadAllImages = async () => {
    if (!selectedReport || !selectedReport.imageUrls) return;
    setIsLoading(true);
    try {
      const safeOrder = sanitizeName(selectedReport.order);
      const safeColor = sanitizeName(selectedReport.colorCode);
      const safeError = sanitizeName(selectedReport.errorName);
      const safeSupplier = sanitizeName(selectedReport.supplier);
      const safeFloor = sanitizeName(selectedReport.floor);
      const namePrefix = `${safeOrder}_${safeColor}_${safeError}_${safeSupplier}_${safeFloor}`;

      await downloadImageUrls(selectedReport.imageUrls, namePrefix);
    } catch (e: any) {
      console.error(e);
      alert("Lỗi tải ảnh: " + e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadImage = async (objectUrl: string, index: number, namePrefix: string) => {
    const downloadName = `${namePrefix}_${index + 1}.jpg`;

    try {
      if (!objectUrl.startsWith('data:')) {
        let base64 = await getBase64ImageFromUrl(objectUrl);
        if (base64) {
          const res = await fetch(base64);
          const blob = await res.blob();
          saveAs(blob, downloadName);
        } else {
             // Fallback
             saveAs(objectUrl, downloadName);
        }
      } else {
        saveAs(objectUrl, downloadName);
      }
    } catch (err) {
      console.warn("Failed to download", err);
      saveAs(objectUrl, downloadName);
    }
  };

  // Load merged reports
  const fetchReports = async (isManual = false) => {
    if (isManual || reports.length === 0) setIsLoading(true);
    setErrorMsg('');

    // Instant local load to avoid blank screen
    let localReports: QCReport[] = [];
    try {
      const localJson = localStorage.getItem('local_qc_reports');
      if (localJson) {
        const parsed = JSON.parse(localJson);
        localReports = parsed.map((item: any) => ({
          ...item,
          isLocalOnly: true
        }));
        if (!isManual) setReports(localReports); // Display immediately
      }
    } catch (err) {
      console.error("Failed to parse local reports:", err);
    }
    
    try {
      let onlineReports: QCReport[] = [];
      let firestoreHealthy = true;

      try {
        // Query reports from Firestore
        const reportsRef = collection(db, 'qc_reports');
        const q = query(reportsRef);
        
        // Timeout query if offline or Iframe WebSocket blocked
        const queryPromise = getDocs(q);
        queryPromise.catch(() => {}); // Prevent unhandled rejection if timeout wins
        let timeoutId: any;
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Query timeout exceeded")), 15000); // 15s instead of 60s
        });
        timeoutPromise.catch(() => {});

        const querySnapshot = await Promise.race([queryPromise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
        
        querySnapshot.forEach((doc) => {
          const data = doc.data();
          onlineReports.push({
            id: doc.id,
            date: data.date,
            floor: data.floor,
            order: data.order,
            colorCode: data.colorCode,
            errorName: data.errorName,
            supplier: data.supplier,
            imageUrls: data.imageUrls || [],
            employeeId: data.employeeId,
            employeeEmail: data.employeeEmail,
            createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt,
            isLocalOnly: false
          });
        });
      } catch (err) {
        console.warn("Could not query Firestore, relying on local storage fallback:", err);
        firestoreHealthy = false;
      }

      // Merge online and offline records (using ID as primary key to avoid duplicates)
      const mergedMap = new Map<string, QCReport>();
      
      // Load online ones first
      onlineReports.forEach(r => mergedMap.set(r.id, r));
      
      // Load offline ones. If duplicate ID already exists of an online one, keep the online one as truth
      localReports.forEach(r => {
        if (!mergedMap.has(r.id)) {
          mergedMap.set(r.id, r);
        }
      });

      const mergedList = Array.from(mergedMap.values());
      setReports(mergedList);

      if (!firestoreHealthy && localReports.length > 0) {
        setSyncStatusMsg('Đang hiển thị ở chế độ ngoại tuyến. Các báo cáo chưa đồng bộ được gắn nhãn riêng.');
      } else {
        setSyncStatusMsg('');
      }

    } catch (err: any) {
      console.warn("Fetch reports warning:", err);
      setErrorMsg('Không thể tải lịch sử báo cáo. Vui lòng kết nối mạng và thử lại.');
    } finally {
      setIsLoading(false);
    }
  };

  // Load initially
  useEffect(() => {
    if (isActive) {
      fetchReports();
    }
  }, [user.email, isActive]);

  const autoSyncedRef = useRef(false);

  // Auto-sync offline reports when connection is restored or on initial load
  useEffect(() => {
    const offlineCount = reports.filter(r => r.isLocalOnly).length;
    
    // Auto-sync immediately if we load the page, have offline reports, and are online
    if (offlineCount > 0 && navigator.onLine && !autoSyncedRef.current) {
      autoSyncedRef.current = true;
      handleSyncAllLocal();
    }

    const handleOnline = () => {
      const currentOfflineCount = reports.filter(r => r.isLocalOnly).length;
      if (currentOfflineCount > 0) {
        handleSyncAllLocal();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [reports]);

  // Sync all offline reports using batched concurrency to prevent network timeout
  const handleSyncAllLocal = async () => {
    const offlineReports = reports.filter(r => r.isLocalOnly);
    if (!offlineReports.length) return;

    setSyncStatusMsg(`Đang đồng bộ 0/${offlineReports.length} báo cáo...`);
    setIsLoading(true);

    let successCount = 0;
    
    // Process in batches of 3 to avoid hanging browser network pool 
    // and hitting the 60,000ms Firebase/Firestore timeout.
    const concurrency = 3;
    for (let i = 0; i < offlineReports.length; i += concurrency) {
      const chunk = offlineReports.slice(i, i + concurrency);
      
      await Promise.allSettled(chunk.map(async (report) => {
        try {
          await handleSyncReport(report, true); // Pass skipRefresh flag
          successCount++;
          setSyncStatusMsg(`Đang đồng bộ ${successCount}/${offlineReports.length} báo cáo...`);
        } catch (err) {
          console.warn("Lỗi đồng bộ báo cáo:", err);
        }
      }));
    }

    if (successCount === offlineReports.length) {
      setSyncStatusMsg('');
    } else {
      setSyncStatusMsg(`Hoàn tất. Có lỗi xảy ra với ${offlineReports.length - successCount} báo cáo.`);
    }
    setIsLoading(false);
    fetchReports(); // Refresh once everything finishes
  };

  // Sync a single offline report to Firestore
  const handleSyncReport = async (report: QCReport, skipRefresh = false) => {
    if (!report.isLocalOnly) return;
    setSyncingId(report.id);
    
    try {
      const docRef = doc(db, 'qc_reports', report.id);
      
      // 1. Upload any Base64 offline images to Cloud Storage so we don't blow up Firestore 1MB limits
      const sourceUrls = report.imageUrls || [];
      const uploadPromises = sourceUrls.map(async (url, i) => {
        if (url.startsWith('data:image')) {
          try {
            // Native, fastest way to convert data URI to Blob
            const response = await fetch(url);
            const blob = await response.blob();
            const fileName = `qc_images/${report.id}_local_${i}.jpg`;
            
            // Re-use logic from QCForm
            const withTimeout = <T,>(promise: Promise<T>, ms: number) => {
              let timeoutId: any;
              const timeoutPromise = new Promise<T>((_, reject) => {
                timeoutId = setTimeout(() => reject(new Error('Action timeout exceeded')), ms);
              });
              promise.catch(() => {});
              timeoutPromise.catch(() => {});
              return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
            };

            let downloadUrl = '';
            
            if (!navigator.onLine) {
               console.warn("Ngoại tuyến, không thể đồng bộ hình ảnh");
               throw new Error("Offline"); // Force catch block to retain original url
            }
            
            if (token === 'NO_TOKEN') {
              try {
                downloadUrl = await withTimeout(uploadFileToStorage(blob, fileName), 60000);
              } catch (e) {
                console.warn("Storage upload failed during sync, retaining base64", e);
                downloadUrl = url;
              }
            } else {
              try {
                downloadUrl = await withTimeout(uploadFileToDrive(blob, fileName, token), 60000);
              } catch (e) {
                console.warn("Drive failed during sync, fallback to Storage");
                try {
                  downloadUrl = await withTimeout(uploadFileToStorage(blob, fileName), 60000);
                } catch (storageErr) {
                  console.warn("Storage upload also failed during sync, retaining base64", storageErr);
                  downloadUrl = url;
                }
              }
            }
            
            return downloadUrl;
          } catch (e) {
            console.error("Failed to parse base64 image during sync, retaining original", e);
            return url;
          }
        } else {
          return url;
        }
      });
      
      const finalImageUrls = await Promise.all(uploadPromises);

      // Build payload exactly as required by Firestore schema
      const payload: any = {
        date: report.date || '',
        floor: report.floor || '',
        order: report.order || '',
        colorCode: report.colorCode || '',
        errorName: report.errorName || '',
        supplier: report.supplier || '',
        imageUrls: finalImageUrls,
        employeeId: report.employeeId || '',
        employeeEmail: user.email || report.employeeEmail || '',
        createdAt: serverTimestamp() // Set standard Firestore server time
      };

      if (report.note) {
        payload.note = report.note;
      }
      
      const savePromise = setDoc(docRef, payload);
      savePromise.catch(() => {}); // Prevent unhandled rejection if timeout wins
      
      let timeoutId: any;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error("Quá thời gian kết nối (60s). Vui lòng kiểm tra lại mạng.")), 60000);
      });
      timeoutPromise.catch(() => {});

      await Promise.race([savePromise, timeoutPromise]).finally(() => clearTimeout(timeoutId));

      // Update LocalStorage: remove this report from local queue OR strip isLocalOnly flag
      const localJson = localStorage.getItem('local_qc_reports');
      if (localJson) {
        const parsed = JSON.parse(localJson) as QCReport[];
        const updated = parsed.filter(item => item.id !== report.id); // Filter out since now synced to Firestore
        localStorage.setItem('local_qc_reports', JSON.stringify(updated));
      }

      // Update local state directly
      setReports(prev => prev.map(r => r.id === report.id ? { ...r, isLocalOnly: false } : r));
      
      // Update selected report if it was active
      if (selectedReport?.id === report.id) {
        setSelectedReport(prev => prev ? { ...prev, isLocalOnly: false } : null);
      }
      
      // Trigger a silent refresh to verify
      if (!skipRefresh) fetchReports();
    } catch (err: any) {
      console.warn("Sync failed:", err);
      setAdminActionError(`Đồng bộ thất bại: ${err.message || 'Lỗi mạng hoặc chưa cấu hình đúng Authentication/Firestore'}`);
    } finally {
      if (!skipRefresh) setSyncingId(null);
    }
  };

  // Delete local report from LocalStorage only (safely)
  const handleDeleteLocalReport = (reportId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa báo cáo lưu tạm này? Thao tác này không thể hoàn tác.')) return;
    
    try {
      const localJson = localStorage.getItem('local_qc_reports');
      if (localJson) {
        const parsed = JSON.parse(localJson) as QCReport[];
        const updated = parsed.filter(item => item.id !== reportId);
        localStorage.setItem('local_qc_reports', JSON.stringify(updated));
        
        // Remove from local list
        setReports(prev => prev.filter(r => r.id !== reportId));
        if (selectedReport?.id === reportId) {
          setSelectedReport(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Get unique options for filters
  const uniqueFloors = useMemo(() => {
    const floors = reports.map(r => r.floor.trim()).filter(Boolean);
    return Array.from(new Set(floors));
  }, [reports]);

  const uniqueSuppliers = useMemo(() => {
    const suppliers = reports.map(r => r.supplier.trim()).filter(Boolean);
    return Array.from(new Set(suppliers));
  }, [reports]);

  // Apply Search and Filters to raw reports list
  const filteredReports = useMemo(() => {
    let result = [...reports];

    // Query Text Filter (Order PO, Color, Error Name, Supplier, Floor)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => 
        r.order.toLowerCase().includes(q) ||
        r.colorCode.toLowerCase().includes(q) ||
        r.errorName.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q) ||
        r.floor.toLowerCase().includes(q)
      );
    }

    // Floor Filter
    if (selectedFloor !== 'all') {
      result = result.filter(r => r.floor.trim() === selectedFloor);
    }

    // Supplier Filter
    if (selectedSupplier !== 'all') {
      result = result.filter(r => r.supplier.trim() === selectedSupplier);
    }

    // Status Filter
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'synced') {
        result = result.filter(r => !r.isLocalOnly);
      } else if (selectedStatus === 'offline') {
        result = result.filter(r => r.isLocalOnly);
      }
    }

    // Date Range Filter (Từ ngày - Đến ngày)
    if (selectedDate && selectedEndDate) {
      result = result.filter(r => r.date >= selectedDate && r.date <= selectedEndDate);
    } else if (selectedDate) {
      result = result.filter(r => r.date >= selectedDate);
    } else if (selectedEndDate) {
      result = result.filter(r => r.date <= selectedEndDate);
    }

    // Sort by Date & Timestamp
    result.sort((a, b) => {
      // Compare by report date
      const dateCompare = b.date.localeCompare(a.date);
      if (dateCompare !== 0) {
        return sortOrder === 'desc' ? dateCompare : -dateCompare;
      }
      
      // Fallback compare parseISO created time
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
    });

    return result;
  }, [reports, searchQuery, selectedFloor, selectedSupplier, selectedStatus, selectedDate, selectedEndDate, sortOrder]);

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'desc' ? 'asc' : 'desc');
  };

  const getFriendlyDate = (dateStr: string) => {
    try {
      const dateParts = dateStr.split('-');
      if (dateParts.length === 3) {
        return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="h-auto md:h-full flex flex-col max-w-[1600px] w-full mx-auto p-3 sm:p-4 lg:p-6 overflow-visible md:overflow-hidden lg:flex-row lg:gap-6">
      
      {/* Left Column (Desktop 2/3) */}
      <div className={`flex-1 flex-col min-w-0 min-h-0 h-auto md:h-full lg:w-2/3 ${selectedReport ? 'hidden lg:flex' : 'flex'}`}>
        {/* Grid Dashboard Header Info Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-5 shrink-0">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Tổng báo cáo</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-slate-800">{reports.length}</span>
            <span className="text-xs text-slate-500">tổng số</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Đã đồng bộ Cloud</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-emerald-600">
              {reports.filter(r => !r.isLocalOnly).length}
            </span>
            <span className="text-xs text-slate-500">an toàn</span>
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Lưu tạm ngoại tuyến</span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-black text-amber-500">
              {reports.filter(r => r.isLocalOnly).length}
            </span>
            <span className="text-xs text-slate-500">trên máy</span>
          </div>
        </div>
      </div>

      {/* Sync Status Banner */}
      {(syncStatusMsg || reports.some(r => r.isLocalOnly)) && (
        <div className="bg-amber-50 border border-amber-200 py-2.5 px-4 rounded-lg mb-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-amber-800 text-xs">
            <Info className={`h-4 w-4 text-amber-500 shrink-0 ${syncStatusMsg ? 'animate-pulse' : ''}`} />
            <span className={`font-semibold ${syncStatusMsg ? 'animate-pulse' : ''}`}>
               {syncStatusMsg || `Có ${reports.filter(r => r.isLocalOnly).length} báo cáo đang lưu tạm ngoại tuyến trên máy này. Để tránh mất dữ liệu khi chuyển sang máy khác, hãy nhấn ĐỒNG BỘ LÊN CLOUD ngay!`}
            </span>
          </div>
          {!syncStatusMsg && (
             <button
                onClick={handleSyncAllLocal}
                className="bg-amber-500 hover:bg-amber-600 text-white font-bold text-xs py-1.5 px-3 rounded-lg flex flex-shrink-0 items-center justify-center gap-1.5 cursor-pointer shadow-sm transition-colors border-none"
             >
                <RefreshCw className="h-3.5 w-3.5" />
                Đồng bộ tất cả lên Cloud (Nhanh)
             </button>
          )}
        </div>
      )}

      {/* Filter and Search Section */}
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-3.5 sm:p-4 mb-4 shrink-0">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-9 gap-3 sm:gap-3.5 items-end">
          {/* Text Search */}
          <div className="col-span-1 sm:col-span-2 md:col-span-3 flex flex-col gap-1.5">
            <div className="flex justify-between items-center">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Tìm kiếm nhanh</label>
              <button
                type="button"
                onClick={() => setShowMobileFilters(!showMobileFilters)}
                className="md:hidden text-[11px] font-bold py-1 px-2.5 rounded-lg text-blue-600 bg-blue-50 border border-blue-100/50 hover:bg-blue-100 cursor-pointer select-none transition-all duration-150 flex items-center gap-1 leading-none"
              >
                {showMobileFilters ? 'Ẩn bộ lọc ✕' : 'Lọc nâng cao ⚙️'}
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Nhập mã đơn, mã màu, lỗi..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg text-sm bg-slate-50 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-semibold text-slate-800"
              />
            </div>
          </div>

          {/* Floor Selection */}
          <div className={`col-span-1 md:col-span-2 flex flex-col gap-1.5 ${showMobileFilters ? 'flex animate-in slide-in-from-top-1 duration-150' : 'hidden md:flex'}`}>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Khu vực / Lầu</label>
            <select
              value={selectedFloor}
              onChange={e => setSelectedFloor(e.target.value)}
              className="w-full py-2 px-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-semibold text-slate-800"
            >
              <option value="all">Tất cả khu vực</option>
              {uniqueFloors.map(floor => (
                <option key={floor} value={floor}>{floor}</option>
              ))}
            </select>
          </div>

          {/* Supplier Selection */}
          <div className={`col-span-1 md:col-span-2 flex flex-col gap-1.5 ${showMobileFilters ? 'flex animate-in slide-in-from-top-1 duration-150' : 'hidden md:flex'}`}>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Xưởng cung ứng</label>
            <select
              value={selectedSupplier}
              onChange={e => setSelectedSupplier(e.target.value)}
              className="w-full py-2 px-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-semibold text-slate-800"
            >
              <option value="all">Tất cả xưởng</option>
              {uniqueSuppliers.map(sup => (
                <option key={sup} value={sup}>{sup}</option>
              ))}
            </select>
          </div>

          {/* Synchronized Status */}
          <div className={`col-span-1 md:col-span-2 flex flex-col gap-1.5 ${showMobileFilters ? 'flex animate-in slide-in-from-top-1 duration-150' : 'hidden md:flex'}`}>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Trạng thái lưu</label>
            <select
              value={selectedStatus}
              onChange={e => setSelectedStatus(e.target.value)}
              className="w-full py-2 px-2.5 border border-slate-200 rounded-lg text-sm bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-semibold text-slate-800"
            >
              <option value="all">Tất cả trạng thái</option>
              <option value="synced">Đã đồng bộ mây</option>
              <option value="offline">Lưu tạm offline</option>
            </select>
          </div>

          {/* Date Picker Group (From - To Date) */}
          <div className={`col-span-1 md:col-span-3 flex flex-col gap-1.5 justify-end lg:hidden ${showMobileFilters ? 'flex animate-in slide-in-from-top-1 duration-150' : 'hidden md:flex'}`}>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" /> Ngày báo cáo (Từ - Đến)
            </label>
            <div className="flex items-center gap-1.5 w-full">
              <input 
                type="date" 
                id="selectedDate"
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full flex-1 py-1.5 px-2 border border-slate-200 rounded-lg text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-semibold"
                title="Từ ngày"
              />
              <span className="text-slate-400 text-xs shrink-0 font-bold">~</span>
              <input 
                type="date" 
                id="selectedEndDate"
                value={selectedEndDate}
                onChange={e => setSelectedEndDate(e.target.value)}
                className="w-full flex-1 py-1.5 px-2 border border-slate-200 rounded-lg text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-semibold"
                title="Đến ngày"
              />
              {(selectedDate || selectedEndDate) && (
                <button 
                  onClick={() => { setSelectedDate(''); setSelectedEndDate(''); }}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold cursor-pointer text-slate-500 shrink-0"
                  title="Xóa bộ lọc ngày"
                >
                  X
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-slate-100 mt-3 pt-3 lg:hidden flex-wrap gap-3">
          <div className="text-xs text-slate-400">
            Hiển thị <span className="font-bold text-slate-700">{filteredReports.length}</span> / {reports.length} báo cáo lỗi
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSortOrder}
              className="text-xs flex items-center gap-1.5 text-slate-600 hover:text-slate-800 font-semibold cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 py-1.5 px-3 rounded-lg"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              Sắp xếp: {sortOrder === 'desc' ? 'Mới nhất' : 'Cũ nhất'}
            </button>
            {isAdmin && (
              <>
                <button
                  onClick={handleExportToExcel}
                  disabled={isLoading || filteredReports.length === 0}
                  className="text-xs flex items-center gap-1.5 text-green-600 hover:text-green-800 font-semibold cursor-pointer bg-green-50 hover:bg-green-100 border border-green-200 py-1.5 px-3 rounded-lg transition-all"
                >
                  <Download className="h-3.5 w-3.5" />
                  Xuất Excel
                </button>
                <button
                  onClick={handleDownloadBulkZIP}
                  disabled={isLoading || filteredReports.length === 0}
                  className="text-xs flex items-center gap-1.5 text-amber-600 hover:text-amber-800 font-semibold cursor-pointer bg-amber-50 hover:bg-amber-100 border border-amber-200 py-1.5 px-3 rounded-lg transition-all"
                  title="Tải toàn bộ hình ảnh trong danh sách hiện tại thành file ZIP"
                >
                  <Download className="h-3.5 w-3.5" />
                  Tải Ảnh ZIP
                </button>
              </>
            )}
            <button
              onClick={() => fetchReports(true)}
              disabled={isLoading}
              className="text-xs flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-semibold cursor-pointer bg-blue-50 hover:bg-blue-100/75 border border-blue-100 py-1.5 px-3 rounded-lg transition-all"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Đang tải...' : 'Làm mới'}
            </button>
          </div>
        </div>
      </section>

      {/* Reports List */}
      <div className={`flex-1 min-h-0 h-auto md:overflow-y-auto pr-1 flex flex-col gap-3 pb-6 ${selectedReport ? 'hidden lg:flex' : 'flex'}`}>
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white rounded-xl border border-slate-200">
              <RefreshCw className="animate-spin h-8 w-8 text-blue-600 mb-3" />
              <p className="text-sm font-medium text-slate-500">Đang quét tìm báo cáo lưu trữ...</p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 bg-white rounded-xl border border-slate-200 text-center px-4">
              <FileText className="h-12 w-12 text-slate-300 mb-2.5" />
              <p className="text-base font-bold text-slate-600">Không tìm thấy báo cáo nào</p>
              <p className="text-xs text-slate-400 max-w-sm mt-1">
                Hãy thử nới lỏng từ khóa hoặc bộ lọc tìm kiếm của bạn, hoặc tạo một báo cáo lỗi mới ngay hôm nay.
              </p>
              <button 
                onClick={onNavigateToCreate}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2 px-4 rounded-lg cursor-pointer border-none"
              >
                Tạo Báo Cáo Mới
              </button>
            </div>
          ) : (
            filteredReports.map((report) => (
              <div 
                key={report.id}
                onClick={() => {
                  setSelectedReport(report);
                  setActiveDetailImageIndex(0);
                  setLoadedImageUrls({});
                }}
                className={`shrink-0 group border rounded-xl overflow-hidden shadow-sm transition-all p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 cursor-pointer bg-white ${selectedReport?.id === report.id ? 'border-blue-500 ring-2 ring-blue-500/15' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <div className="flex-1 flex items-start gap-3.5">
                  <div className="h-12 w-12 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600 transition-all shrink-0 relative shadow-sm">
                    {report.imageUrls && report.imageUrls.length > 0 ? (
                      <DriveImage 
                        url={report.imageUrls[0]} 
                        token={token} 
                        className="w-full h-full object-cover" 
                        alt="Thumbnail" 
                      />
                    ) : (
                      <FileText className="h-5 w-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col gap-1.5 min-w-0">
                      <h3 className="text-base font-extrabold text-slate-800 leading-tight">
                        {report.errorName || 'Chưa phân loại lỗi'}
                      </h3>
                      
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold font-mono text-slate-600 bg-slate-100/80 px-2 py-0.5 rounded border border-slate-200/60">
                          PO: {report.order || 'N/A'}
                        </span>
                        <span className="text-xs font-bold font-mono text-blue-700 bg-blue-50 px-2 py-0.5 rounded border border-blue-100">
                          Màu: {report.colorCode || 'N/A'}
                        </span>
                        
                        {report.isLocalOnly ? (
                          <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                            <CloudOff className="h-3 w-3" /> Nháp
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-100 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> Đã lưu
                          </span>
                        )}

                        {isAdmin && report.employeeId && (
                          <span className="text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded-full">
                            QC: {report.employeeId}
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap gap-x-3 gap-y-1.5 text-xs text-slate-600 font-medium">
                        <span className="flex items-center gap-1.5 bg-slate-50 px-1.5 rounded pr-2 border border-slate-100/50">
                          <MapPin className="h-3.5 w-3.5 text-slate-400" /> {report.floor || 'N/A'}
                        </span>
                        <span className="flex items-center gap-1.5 bg-slate-50 px-1.5 rounded pr-2 border border-slate-100/50">
                          <Factory className="h-3.5 w-3.5 text-slate-400" /> {report.supplier || 'N/A'}
                        </span>
                        <span className="flex items-center gap-1.5 bg-slate-50 px-1.5 rounded pr-2 border border-slate-100/50">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" /> {getFriendlyDate(report.date) || 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 justify-between sm:justify-end">
                  <div className="text-[11px] text-slate-400 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {report.createdAt ? format(new Date(report.createdAt), 'HH:mm') : ''}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {report.isLocalOnly && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSyncReport(report);
                        }}
                        disabled={syncingId === report.id}
                        className="bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white text-xs font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 relative cursor-pointer border-none"
                        title="Đồng bộ thủ công"
                      >
                        <RefreshCw className={`h-3 w-3 ${syncingId === report.id ? 'animate-spin' : ''}`} />
                        Đồng bộ
                      </button>
                    )}
                    <ChevronRight className="h-5 w-5 text-slate-300 group-hover:text-blue-500 transition-colors hidden sm:block" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Column (Desktop 1/3) */}
      <div className={`w-full lg:w-1/3 min-h-0 lg:min-w-[420px] lg:max-w-[480px] flex-col h-auto md:h-full lg:gap-5 ${selectedReport ? 'flex' : 'hidden lg:flex'}`}>
        
        {/* Desktop Date Filter & Actions */}
        <section className="hidden lg:flex bg-white rounded-xl border border-slate-200 shadow-sm p-4 shrink-0 flex-col gap-3">
          <div className="flex flex-col gap-1.5 justify-end">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-slate-400" /> Ngày báo cáo (Từ - Đến)
            </label>
            <div className="flex items-center gap-1.5 w-full">
              <input 
                type="date" 
                value={selectedDate}
                onChange={e => setSelectedDate(e.target.value)}
                className="w-full flex-1 py-1.5 px-2 border border-slate-200 rounded-lg text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-semibold"
                title="Từ ngày"
              />
              <span className="text-slate-400 text-xs shrink-0 font-bold">~</span>
              <input 
                type="date" 
                value={selectedEndDate}
                onChange={e => setSelectedEndDate(e.target.value)}
                className="w-full flex-1 py-1.5 px-2 border border-slate-200 rounded-lg text-xs bg-slate-50 outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer font-semibold"
                title="Đến ngày"
              />
              {(selectedDate || selectedEndDate) && (
                <button 
                  onClick={() => { setSelectedDate(''); setSelectedEndDate(''); }}
                  className="px-2 py-1.5 border border-slate-200 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold cursor-pointer text-slate-500 shrink-0"
                  title="Xóa bộ lọc ngày"
                >
                  X
                </button>
              )}
            </div>
          </div>
          
          <div className="flex items-center justify-between border-t border-slate-100 mt-1 pt-3 flex-wrap gap-2">
            <button
              onClick={toggleSortOrder}
              className="text-xs flex items-center gap-1.5 text-slate-600 hover:text-slate-800 font-semibold cursor-pointer bg-slate-50 hover:bg-slate-100 border border-slate-200 py-1.5 px-3 rounded-lg flex-1 justify-center whitespace-nowrap"
            >
              <ArrowUpDown className="h-3.5 w-3.5" />
              {sortOrder === 'desc' ? 'Mới nhất' : 'Cũ nhất'}
            </button>
            <button
              onClick={() => fetchReports(true)}
              disabled={isLoading}
              className="text-xs flex items-center gap-1.5 text-blue-600 hover:text-blue-800 font-semibold cursor-pointer bg-blue-50 hover:bg-blue-100/75 border border-blue-100 py-1.5 px-3 rounded-lg transition-all flex-1 justify-center whitespace-nowrap"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {isLoading ? 'Đang tải...' : 'Làm mới'}
            </button>
            
            {isAdmin && (
              <div className="w-full flex gap-2 mt-1">
                <button
                  onClick={handleExportToExcel}
                  disabled={isLoading || filteredReports.length === 0}
                  className="text-xs flex items-center gap-1.5 text-green-600 hover:text-green-800 font-semibold cursor-pointer bg-green-50 hover:bg-green-100 border border-green-200 py-1.5 px-3 rounded-lg transition-all flex-1 justify-center whitespace-nowrap"
                >
                  <Download className="h-3.5 w-3.5" />
                  Xuất Excel
                </button>
                <button
                  onClick={handleDownloadBulkZIP}
                  disabled={isLoading || filteredReports.length === 0}
                  className="text-xs flex items-center gap-1.5 text-amber-600 hover:text-amber-800 font-semibold cursor-pointer bg-amber-50 hover:bg-amber-100 border border-amber-200 py-1.5 px-3 rounded-lg transition-all flex-1 justify-center whitespace-nowrap"
                  title="Tải toàn bộ hình ảnh"
                >
                  <Download className="h-3.5 w-3.5" />
                  Tải Ảnh ZIP
                </button>
              </div>
            )}
          </div>
        </section>

        {/* Selected Details Drawer Pane */}
        <div className={`bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden flex-1 min-h-[450px] lg:min-h-0 pb-16 lg:pb-0 ${selectedReport ? 'flex' : 'hidden lg:flex'}`}>
          {selectedReport ? (
            <div className="h-full flex flex-col">
              {/* Header Title */}
              <div className="p-4 bg-slate-800 text-white shrink-0 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-300 font-bold uppercase tracking-widest flex items-center gap-1 mb-0.5">
                    {selectedReport.isLocalOnly ? (
                      <span className="text-amber-400 flex items-center gap-1"><CloudOff className="h-3 w-3" /> BÁO CÁO LƯU TẠM</span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> ĐÃ LƯU TRÊN MÂY</span>
                    )}
                  </div>
                  <h3 className="text-sm font-extrabold line-clamp-1 leading-tight">{selectedReport.errorName}</h3>
                </div>
                <button 
                  onClick={() => setSelectedReport(null)}
                  className="px-2.5 py-1.5 bg-slate-700 hover:bg-slate-600 hover:text-white text-slate-200 rounded-lg text-xs font-extrabold cursor-pointer border-none flex items-center gap-1 shrink-0 transition-colors"
                >
                  ‹ Quay lại
                </button>
              </div>

              {/* Informative Body */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">
                {/* Admin/User Error Notification */}
                {adminActionError && (
                  <div className="rounded-lg bg-red-50 p-3.5 border border-red-200 text-xs text-red-800 font-semibold leading-relaxed flex items-start gap-2.5 shadow-sm animate-in fade-in duration-200">
                    <AlertCircle className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
                    <span>{adminActionError}</span>
                  </div>
                )}

                {/* Edit & Delete Controls Panel */}
                {isEditable && !isEditing && !deleteConfirmOpen && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 flex flex-col gap-2.5 shadow-sm animate-in slide-in-from-top-3 duration-200">
                    <div className="flex items-center gap-1.5 text-xs font-extrabold text-slate-700 tracking-wider">
                      <ShieldCheck className={`h-4.5 w-4.5 ${isAdmin ? 'text-emerald-600' : 'text-blue-600'} shrink-0`} />
                      QUẢN LÝ BÁO CÁO {isAdmin ? '(QUYỀN QUẢN TRỊ VIÊN)' : '(CỦA BẠN)'}
                    </div>
                    
                    <div className="text-[11px] text-slate-500 leading-snug">
                      Bạn có quyền thay đổi thông tin biên bản hoặc xóa vĩnh viễn báo cáo chất lượng này.
                    </div>

                    <div className="flex gap-2 text-xs pt-1">
                      <button
                        onClick={startEditing}
                        className="flex-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-800 font-extrabold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all border border-slate-200 hover:border-slate-350"
                      >
                        <Pencil className="h-3.5 w-3.5 text-blue-600" />
                        SỬA BÁO CÁO
                      </button>
                      
                      <button
                        onClick={() => { setDeleteConfirmOpen(true); setAdminActionError(''); }}
                        className="flex-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 font-extrabold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        XÓA BÁO CÁO
                      </button>
                    </div>
                  </div>
                )}
                
                {/* 24h Lock Message for My Floor */}
                {!isEditable && !isAdmin && (() => {
                  const isMyFloor = userProfile?.permittedFloors?.includes(selectedReport.floor) || selectedReport.employeeEmail === user?.email;
                  const isOver24h = selectedReport.createdAt && !selectedReport.isLocalOnly && (new Date().getTime() - new Date(selectedReport.createdAt).getTime() > 24 * 60 * 60 * 1000);
                  if (isMyFloor && isOver24h) {
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex gap-2">
                        <AlertCircle className="h-4.5 w-4.5 text-amber-500 shrink-0" />
                        <span className="text-[11px] text-amber-800 leading-tight block">
                          Báo cáo của lầu bạn đã qua 24H kể từ lúc tạo, bạn không thể tự chỉnh sửa hay xóa. Vui lòng liên hệ Admin nếu muốn xóa.
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}

                {/* Custom Delete Confirmation Modal in-place */}
                {deleteConfirmOpen && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex flex-col gap-3 shadow-inner animate-in zoom-in-95 duration-200">
                    <div className="flex items-start gap-2.5 text-red-800">
                      <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5 animate-pulse" />
                      <div>
                        <h4 className="font-extrabold text-xs uppercase tracking-wider text-red-900">Xác Nhận Xóa Báo Cáo</h4>
                        <p className="text-xs text-red-700 font-semibold leading-relaxed mt-1">
                          Hành động này sẽ xóa vĩnh viễn báo cáo chất lượng này khỏi cơ sở dữ liệu Cloud{selectedReport.isLocalOnly ? ' (Cục bộ)' : ' và gỡ bỏ hoàn toàn file ảnh khỏi thư mục Google Drive của bạn'}. <strong>Thao tác này không thể hoàn tác!</strong>
                        </p>
                      </div>
                    </div>

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleDeleteReport}
                        disabled={isDeleting}
                        className="flex-1 bg-red-650 hover:bg-red-750 disabled:bg-red-400 text-white font-extrabold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow border-none"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {isDeleting ? 'Đang xóa...' : 'XÓA NGAY LẬP TỨC'}
                      </button>
                      
                      <button
                        onClick={() => setDeleteConfirmOpen(false)}
                        disabled={isDeleting}
                        className="bg-white hover:bg-slate-100 border border-slate-250 text-slate-700 font-bold text-xs py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        HỦY BỎ
                      </button>
                    </div>
                  </div>
                )}

                {isEditing ? (
                  /* EDITING FORM */
                  <div className="space-y-4 bg-slate-50 p-4 rounded-xl border border-blue-200 animate-in slide-in-from-right-3 duration-200">
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                      <div className="flex items-center gap-1.5 text-blue-800 font-extrabold text-xs uppercase tracking-wider">
                        <Pencil className="h-3.5 w-3.5 text-blue-600" />
                        Chỉnh Sửa Biên Bản
                      </div>
                      <span className="text-[10px] font-mono text-slate-450 bg-slate-200 px-2 py-0.5 rounded">
                        Mã: {selectedReport.id.substring(0, 8)}
                      </span>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-slate-400" /> Ngày Báo Cáo
                      </label>
                      <input 
                        type="date"
                        value={editDate}
                        onChange={e => setEditDate(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all cursor-pointer font-bold text-slate-800"
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-slate-400" /> Lầu / Khu Vực
                      </label>
                      <input 
                        type="text"
                        value={editFloor}
                        onChange={e => setEditFloor(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all text-slate-800 font-bold"
                        placeholder="Nhập lầu hoặc khu vực..."
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 font-mono">
                        <Tag className="h-3 w-3 text-slate-400" /> Đơn Hàng (PO)
                      </label>
                      <input 
                        type="text"
                        value={editOrder}
                        onChange={e => setEditOrder(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-bold text-slate-800"
                        placeholder="Nhập mã đơn hàng..."
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1 font-mono">
                        <Layers className="h-3 w-3 text-slate-400" /> Mã Màu
                      </label>
                      <input 
                        type="text"
                        value={editColorCode}
                        onChange={e => setEditColorCode(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-bold text-slate-805"
                        placeholder="Nhập mã màu..."
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <FileText className="h-3 w-3 text-slate-400" /> Tên Loại Lỗi
                      </label>
                      <input 
                        type="text"
                        value={editErrorName}
                        onChange={e => setEditErrorName(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-bold text-slate-805"
                        placeholder="Nhập tên loại lỗi..."
                      />
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                        <Factory className="h-3 w-3 text-slate-400" /> Xưởng Cung Ứng
                      </label>
                      <input 
                        type="text"
                        value={editSupplier}
                        onChange={e => setEditSupplier(e.target.value)}
                        className="w-full p-2 border border-slate-200 rounded-lg text-sm bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-bold text-slate-805"
                        placeholder="Nhập xưởng cung ứng..."
                      />
                    </div>

                    <div className="flex gap-2.5 pt-2 border-t border-slate-200 mt-2">
                      <button
                        type="button"
                        onClick={handleSaveEdit}
                        disabled={isSavingEdit}
                        className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-extrabold text-xs py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow border-none transition-all hover:scale-[1.01]"
                      >
                        <Save className="h-4 w-4" />
                        {isSavingEdit ? 'Đang lưu...' : 'LƯU THAY ĐỔI'}
                      </button>
                      
                      <button
                        type="button"
                        onClick={() => { setIsEditing(false); setAdminActionError(''); }}
                        disabled={isSavingEdit}
                        className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 font-extrabold text-xs py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer transition-all"
                      >
                        <Undo2 className="h-4 w-4 text-slate-500" />
                        HỦY
                      </button>
                    </div>
                  </div>
                ) : (
                  /* VIEW MODE */
                  <>
                    {/* Visual Metadata Fields Grid */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                          <Calendar className="h-3 w-3 text-slate-400" /> Ngày Báo Cáo
                        </span>
                        <span className="text-sm font-bold text-slate-700">{getFriendlyDate(selectedReport.date)}</span>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                          <MapPin className="h-3 w-3 text-slate-400" /> Lầu / Khu Vực
                        </span>
                        <span className="text-sm font-bold text-slate-700">{selectedReport.floor}</span>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                          <Tag className="h-3 w-3 text-slate-400" /> Đơn Hàng (PO)
                        </span>
                        <span className="text-sm font-bold text-slate-800 font-mono tracking-wide">{selectedReport.order}</span>
                      </div>

                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1 mb-1">
                          <Layers className="h-3 w-3 text-slate-400" /> Mã Màu
                        </span>
                        <span className="text-sm font-bold text-slate-700 font-mono">{selectedReport.colorCode}</span>
                      </div>
                    </div>

                    {/* Additional Metadata Info */}
                    <div className="border-t border-slate-100 pt-4 space-y-3 text-sm">
                      <div className="flex justify-between items-center py-1">
                        <span className="font-medium text-slate-500">Xưởng cung ứng:</span>
                        <span className="font-extrabold text-slate-800">{selectedReport.supplier}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="font-medium text-slate-500">Mã nhân viên:</span>
                        <span className="font-semibold text-slate-700 break-all">{selectedReport.employeeId}</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="font-medium text-slate-500">Thời gian tạo:</span>
                        <span className="text-xs text-slate-550">
                          {selectedReport.createdAt ? format(new Date(selectedReport.createdAt), 'dd/MM/yyyy HH:mm:ss') : 'Ngoại tuyến'}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {/* Proof Images Carousel / Grid */}
                <div className="border-t border-slate-100 pt-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                      Hình ảnh minh chứng ({selectedReport.imageUrls?.length || 0} ảnh)
                    </h4>
                    {selectedReport.imageUrls && selectedReport.imageUrls.length > 0 && (
                      <button
                        onClick={handleDownloadAllImages}
                        className="text-[11px] text-green-600 hover:text-green-800 font-bold flex items-center gap-1 hover:bg-green-50 px-2 py-1 rounded transition-colors cursor-pointer"
                        title="Tải về máy tất cả hình ảnh"
                      >
                        <Download className="h-3 w-3" />
                        <span>Tải tất cả</span>
                      </button>
                    )}
                  </div>
                  
                  {(!selectedReport.imageUrls || selectedReport.imageUrls.length === 0) ? (
                    <div className="py-8 text-center text-xs text-slate-400 border border-dashed rounded-lg">
                      Không có hình ảnh đính kèm
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {/* Large Active Image Preview Container */}
                      <div 
                        className="relative group h-48 sm:h-56 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden cursor-zoom-in shadow-inner flex items-center justify-center transition-all hover:border-blue-300"
                        onClick={() => setLightboxIndex(activeDetailImageIndex)}
                        title="Bấm để phóng to ảnh"
                      >
                        <DriveImage 
                          url={selectedReport.imageUrls[activeDetailImageIndex]} 
                          token={token} 
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" 
                          alt="Bản xem trước hình ảnh QC" 
                          onLoaded={(objectUrl) => setLoadedImageUrls(prev => ({...prev, [activeDetailImageIndex]: objectUrl}))}
                        />
                        
                        {/* Hover Overlay Zoom Indicator */}
                        <div className="absolute inset-0 bg-slate-900/45 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white font-bold text-xs gap-2">
                          <Maximize2 className="h-6 w-6 text-white animate-bounce-subtle" />
                          <span className="tracking-wide">Bấm để phóng to hình ảnh</span>
                        </div>
                        
                        {/* Static Subtle indicator at bottom right */}
                        <div className="absolute right-3 bottom-3 p-1.5 bg-black/60 backdrop-blur-sm rounded-lg text-white pointer-events-none">
                          <Maximize2 className="h-3.5 w-3.5" />
                        </div>

                        {/* Pagination indicator at bottom left */}
                        <div className="absolute left-3 bottom-3 py-1 px-2 bg-black/60 backdrop-blur-sm rounded-md text-white font-mono text-[10px] pointer-events-none font-bold">
                          {activeDetailImageIndex + 1} / {selectedReport.imageUrls.length}
                        </div>
                      </div>

                      {/* Small Carousel Thumb Row selector if report contains more than 1 image */}
                      {selectedReport.imageUrls.length > 1 && (
                        <div className="flex items-center gap-2 overflow-x-auto pb-1.5 max-w-full scrollbar-thin">
                          {selectedReport.imageUrls.map((url, i) => (
                            <button
                              key={i}
                              type="button"
                              onClick={() => setActiveDetailImageIndex(i)}
                              className={`relative h-14 w-14 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0 cursor-pointer transition-all border-2 outline-none ${activeDetailImageIndex === i ? 'border-blue-600 ring-2 ring-blue-500/15 scale-95' : 'border-slate-200 hover:border-slate-350 opacity-70 hover:opacity-100'}`}
                            >
                              <DriveImage 
                                url={url} 
                                token={token} 
                                className="w-full h-full object-cover" 
                                alt={`Thumb ${i}`} 
                                onLoaded={(objectUrl) => setLoadedImageUrls(prev => ({...prev, [i]: objectUrl}))}
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      {/* Action buttons under active image */}
                      <div className="pt-2 flex items-center justify-between text-xs gap-2 border-t border-slate-50 mt-1">
                        <span className="text-slate-450 font-mono text-[10px] truncate max-w-[120px]" title={selectedReport.imageUrls[activeDetailImageIndex]}>
                          Ảnh {activeDetailImageIndex + 1}: {selectedReport.imageUrls[activeDetailImageIndex]?.split('?')[0].split('/').pop() || 'Drive File'}
                        </span>
                        
                        <div className="flex items-center gap-3">
                          <button
                            onClick={handleDownloadActiveImage}
                            disabled={!loadedImageUrls[activeDetailImageIndex]}
                            className="text-[11px] text-green-600 hover:text-green-800 font-bold flex items-center gap-1 hover:underline transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                            title="Tải ảnh về máy"
                          >
                            <span>Tải xuống</span>
                            <Download className="h-3.5 w-3.5" />
                          </button>
                          <a 
                            href={selectedReport.imageUrls[activeDetailImageIndex]} 
                            target="_blank" 
                            rel="noreferrer noopener"
                            className="text-[11px] text-blue-600 hover:text-blue-800 font-bold flex items-center gap-1 hover:underline transition-colors cursor-pointer shrink-0"
                          >
                            <span>Mở HD</span>
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Action Row for Fallback Local report */}
                {selectedReport.isLocalOnly && (
                  <div className="border-t border-slate-100 pt-4 flex flex-col gap-2 mt-4">
                    <div className="rounded-lg bg-amber-50 p-3 border border-amber-200 text-xs text-amber-800 leading-relaxed font-semibold flex items-start gap-2">
                      <AlertCircle className="h-4.5 w-4.5 text-amber-500 shrink-0 mt-0.5" />
                      <span>Báo cáo này hiện chưa được đồng bộ lên máy chủ cơ sở dữ liệu. Thư mục hình ảnh vẫn an toàn trên Google Drive của bạn.</span>
                    </div>

                    <button
                      onClick={() => handleSyncReport(selectedReport)}
                      disabled={syncingId === selectedReport.id}
                      className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-extrabold text-sm py-3 px-4 rounded-lg flex items-center justify-center gap-2 shadow cursor-pointer border-none"
                    >
                      <RefreshCw className={`h-4 w-4 ${syncingId === selectedReport.id ? 'animate-spin' : ''}`} />
                      {syncingId === selectedReport.id ? 'Đang gửi thông tin...' : 'ĐỒNG BỘ LÊN CƠ SỞ DỮ LIỆU'}
                    </button>

                    <button
                      onClick={() => handleDeleteLocalReport(selectedReport.id)}
                      className="w-full bg-red-50 text-red-600 hover:bg-red-100 border border-slate-200 font-bold text-xs py-2 px-3 rounded-lg text-center cursor-pointer transition-colors"
                    >
                      Xóa cục bộ (Xóa bản nháp)
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-slate-400">
              <Info className="h-10 w-10 text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-500">Xem chi tiết báo cáo</p>
              <p className="text-xs text-slate-400 max-w-[240px] mt-1 space-y-1">
                <span>Chọn bất kỳ báo cáo lỗi nào ở danh sách để hiển thị chi tiết hình ảnh & biên bản.</span>
              </p>
            </div>
          )}
        </div>

      </div>

      {/* Lightbox Modal */}
      {lightboxIndex !== null && selectedReport && selectedReport.imageUrls && (
        <div 
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-sm flex flex-col items-center justify-center p-4 select-none animate-in fade-in duration-200"
          onClick={() => setLightboxIndex(null)}
        >
          {/* Top header */}
          <div className="absolute top-4 left-4 right-4 flex items-center justify-between text-white z-10">
            <span className="text-xs font-mono bg-white/10 px-3 py-1.5 rounded-full backdrop-blur">
              PO: <span className="font-bold">{selectedReport.order}</span> / Hình {lightboxIndex + 1} trên {selectedReport.imageUrls.length}
            </span>
            <button 
              onClick={(e) => { e.stopPropagation(); setLightboxIndex(null); }}
              className="p-2 cursor-pointer bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors outline-none"
              title="Đóng (ESC)"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Large image wrapper */}
          <div className="relative max-w-full max-h-[80vh] flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <DriveImage 
              url={selectedReport.imageUrls[lightboxIndex]} 
              token={token} 
              className="max-w-[90vw] max-h-[75vh] object-contain rounded-lg shadow-2xl" 
              alt={`Ảnh lớn ${lightboxIndex + 1}`} 
            />
            
            {/* Left Nav Button */}
            {selectedReport.imageUrls.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(prev => prev !== null ? (prev - 1 + selectedReport.imageUrls.length) % selectedReport.imageUrls.length : null);
                }}
                className="absolute -left-1 sm:-left-16 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/75 hover:scale-105 active:scale-95 text-white rounded-full transition-all cursor-pointer shadow-lg outline-none border border-white/10"
                title="Ảnh trước"
              >
                <ChevronLeft className="h-6 w-6" />
              </button>
            )}

            {/* Right Nav Button */}
            {selectedReport.imageUrls.length > 1 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLightboxIndex(prev => prev !== null ? (prev + 1) % selectedReport.imageUrls.length : null);
                }}
                className="absolute -right-1 sm:-right-16 top-1/2 -translate-y-1/2 p-3 bg-black/50 hover:bg-black/75 hover:scale-105 active:scale-95 text-white rounded-full transition-all cursor-pointer shadow-lg outline-none border border-white/10"
                title="Ảnh tiếp theo"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Bottom link to open original link */}
          <div className="absolute bottom-6 left-4 right-4 flex justify-center gap-4 z-10" onClick={(e) => e.stopPropagation()}>
            <a 
              href={selectedReport.imageUrls[lightboxIndex]} 
              target="_blank" 
              rel="noreferrer noopener"
              className="flex items-center gap-1.5 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-full shadow-lg transition-all hover:scale-105"
            >
              <ExternalLink className="h-4 w-4" />
              Mở ảnh gốc trên Google Drive
            </a>
          </div>
        </div>
      )}
    </div>
  );
});
