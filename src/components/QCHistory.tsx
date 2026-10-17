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
  AlertTriangle,
  User as UserIcon,
  Copy,
  Check,
  Camera,
  UploadCloud,
  Image as ImageIcon,
  Box,
  ChevronDown,
  CheckCircle2,
  Plus,
  Filter
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import * as ExcelJS from 'exceljs';
import { saveAs } from '../lib/download';
import JSZip from 'jszip';
import { ZaloShareModal, ZaloIcon, ZaloShareReportData, buildZaloMessage, getPartType } from './ZaloShareModal';
import { 
  DEFAULT_SUB_PARTS,
  SupplierModelMapping,
  DEFAULT_SUPPLIER_MODELS,
  DEFAULT_COLORS_LIST
} from './AdminPanel';
import { compressImage } from '../lib/image-compression';

interface QCReport {
  id: string;
  date: string;
  floor: string;
  order: string;
  shoeModel?: string;
  colorCode: string;
  errorName: string;
  errorNames?: string[];
  imageErrors?: string[];
  supplier: string;
  imageUrls: string[];
  employeeId: string;
  employeeEmail: string;
  employeeName?: string;
  isDownloaded?: boolean;
  downloadedBy?: string[];
  part?: string;
  subPart?: string;
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
      <div className={`flex flex-col items-center justify-center bg-[#F8FAFC] border border-slate-100 text-slate-400 gap-1 rounded-lg ${className}`}>
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
  const [zaloReport, setZaloReport] = useState<ZaloShareReportData | null>(null);
  const [detailCopiedZalo, setDetailCopiedZalo] = useState(false);

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

  // Edit Image Item definition
  interface EditImageItem {
    id: string;
    source: string | File;
    previewUrl: string;
    isNew: boolean;
    errorName: string;
  }

  // Admin and comprehensive editing states
  const [isEditing, setIsEditing] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editFloor, setEditFloor] = useState('');
  const [editFloorOption, setEditFloorOption] = useState('');
  const [editPart, setEditPart] = useState('ĐẾ THÔ');
  const [editSubPart, setEditSubPart] = useState('');
  const [editSubPartOption, setEditSubPartOption] = useState('');
  const [editOrder, setEditOrder] = useState('');
  const [editIsNoPo, setEditIsNoPo] = useState(false);
  const [editShoeModel, setEditShoeModel] = useState('');
  const [editColorCode, setEditColorCode] = useState('');
  const [editSupplier, setEditSupplier] = useState('');
  const [editSupplierOption, setEditSupplierOption] = useState('');
  const [editSelectedErrors, setEditSelectedErrors] = useState<string[]>([]);
  const [editErrorOption, setEditErrorOption] = useState('');
  const [editCustomErrorInput, setEditCustomErrorInput] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editPhotos, setEditPhotos] = useState<EditImageItem[]>([]);
  const [editTargetUploadError, setEditTargetUploadError] = useState('');
  const [editShowModelDropdown, setEditShowModelDropdown] = useState(false);
  const [editModelFilterQuery, setEditModelFilterQuery] = useState('');
  const [editShowColorDropdown, setEditShowColorDropdown] = useState(false);
  const [editColorFilterQuery, setEditColorFilterQuery] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [saveEditStatus, setSaveEditStatus] = useState('');
  const [saveEditProgress, setSaveEditProgress] = useState(0);

  const editCameraInputRef = useRef<HTMLInputElement>(null);
  const editFileInputRef = useRef<HTMLInputElement>(null);
  
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

  // Dynamic configuration options for the edited report's part
  const editConfig = useMemo(() => {
    let key: 'detho' | 'deson' | 'matgiay' = 'detho';
    const norm = (editPart || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    if (norm.includes('MAT GIAY') || norm.includes('UPPER') || norm === 'MAT') {
      key = 'matgiay';
    } else if (norm.includes('PHUN SON') || norm.includes('SON')) {
      key = 'deson';
    } else {
      key = 'detho';
    }

    let configData: any = {};
    try {
      const stored = localStorage.getItem('local_app_config');
      if (stored) {
        const full = JSON.parse(stored);
        configData = full[key] || full['de'] || full;
      }
    } catch (_) {}

    const floors: string[] = (configData.floors && configData.floors.length) 
      ? configData.floors 
      : (userProfile?.permittedFloors && userProfile.permittedFloors.length > 0 ? userProfile.permittedFloors : ['K63A', 'K63B', 'K73A', 'K73B']);
    const suppliers: string[] = (configData.suppliers && configData.suppliers.length) 
      ? configData.suppliers 
      : ['JIA HOA', 'VĨNH TÀI', 'NỘI BỘ', 'KHÁC'];
    const subParts: string[] = (configData.subParts && configData.subParts.length) 
      ? configData.subParts 
      : (DEFAULT_SUB_PARTS[key] || []);
    const supplierModels: SupplierModelMapping[] = (configData.supplierModels && configData.supplierModels.length) 
      ? configData.supplierModels 
      : (DEFAULT_SUPPLIER_MODELS[key] || []);
    const colors: string[] = (configData.colors && configData.colors.length) 
      ? configData.colors 
      : (DEFAULT_COLORS_LIST[key] || []);
    const errors: string[] = (configData.errors && configData.errors.length) 
      ? configData.errors 
      : ['Vệ sinh', 'Quy cách', 'Kỹ thuật', 'Khác'];

    return { key, floors, suppliers, subParts, supplierModels, colors, errors };
  }, [editPart, userProfile]);

  const editAvailableModels = useMemo(() => {
    let list: string[] = [];
    if (editConfig.supplierModels.length > 0) {
      if (editSupplier && editSupplier !== 'KHÁC') {
        list = editConfig.supplierModels
          .filter(sm => sm.supplier.toUpperCase() === editSupplier.toUpperCase())
          .map(sm => sm.model);
      }
      if (list.length === 0) {
        list = Array.from(new Set(editConfig.supplierModels.map(sm => sm.model)));
      }
    }
    if (list.length === 0) {
      list = DEFAULT_SUPPLIER_MODELS[editConfig.key]?.map(sm => sm.model) || ['FCXV5', 'FCXV6', 'FCXV7'];
    }
    return Array.from(new Set(list));
  }, [editConfig, editSupplier]);

  const editAvailableColors = useMemo(() => {
    let list: string[] = [...editConfig.colors];
    if (list.length === 0) {
      list = DEFAULT_COLORS_LIST['matgiay'] || [];
    }
    return Array.from(new Set(list));
  }, [editConfig]);

  const handleEditPartChange = (newPart: string) => {
    setEditPart(newPart);
    setEditSubPart('');
    setEditSubPartOption('');
    setEditShoeModel('');
    setEditColorCode('');
  };

  const handleEditOrderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawVal = e.target.value.toUpperCase();
    const cleanNumeric = rawVal.replace(/[^0-9]/g, '');
    const finalVal = cleanNumeric.slice(0, 15);
    setEditOrder(finalVal);

    if (finalVal.length >= 3) {
      try {
        const localMap = JSON.parse(localStorage.getItem('local_po_color_mappings') || '{}');
        const matchedColor = localMap[finalVal];
        if (matchedColor) {
          const isSole = getPartType(editPart, editSubPart) === 'sole';
          if (isSole) {
            setEditShoeModel(matchedColor);
            setEditColorCode('');
          } else {
            setEditColorCode(matchedColor);
            setEditShoeModel('');
          }
          const matchedSm = editConfig.supplierModels.find(sm => sm.model.toUpperCase() === matchedColor.toUpperCase());
          if (matchedSm && (!editSupplier || editSupplier === 'KHÁC')) {
            setEditSupplier(matchedSm.supplier);
            setEditSupplierOption(matchedSm.supplier);
          }
        }
      } catch (_) {}
    }
  };

  const handleEditToggleError = (err: string) => {
    const trimmed = err.trim();
    if (!trimmed) return;
    if (editSelectedErrors.includes(trimmed)) {
      setEditSelectedErrors(prev => prev.filter(e => e !== trimmed));
    } else {
      setEditSelectedErrors(prev => [...prev, trimmed]);
    }
  };

  const handleEditAddError = (err: string) => {
    const trimmed = err.trim();
    if (!trimmed) return;
    if (!editSelectedErrors.includes(trimmed)) {
      setEditSelectedErrors(prev => [...prev, trimmed]);
    }
  };

  const selectEditModel = (model: string) => {
    setEditShoeModel(model);
    setEditColorCode('');
    setEditShowModelDropdown(false);
    setEditModelFilterQuery('');
    const matchedSm = editConfig.supplierModels.find(sm => sm.model.toUpperCase() === model.toUpperCase());
    if (matchedSm && (!editSupplier || editSupplier === 'KHÁC')) {
      setEditSupplier(matchedSm.supplier);
      setEditSupplierOption(matchedSm.supplier);
    }
  };

  const selectEditColor = (color: string) => {
    setEditColorCode(color);
    setEditShoeModel('');
    setEditShowColorDropdown(false);
    setEditColorFilterQuery('');
  };

  const handleEditFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileArray = (Array.from(e.target.files) as File[]).filter((f: File) => f.type.startsWith('image/'));
      if (fileArray.length > 0) {
        const assignedError = editTargetUploadError || editSelectedErrors[0] || 'Lỗi chung';
        const newItems: EditImageItem[] = fileArray.map((file: File, i: number) => ({
          id: `new_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          source: file,
          previewUrl: URL.createObjectURL(file),
          isNew: true,
          errorName: assignedError
        }));
        setEditPhotos(prev => [...prev, ...newItems]);
        setEditTargetUploadError('');
      }
      e.target.value = '';
    }
  };

  const handleEditDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileArray = (Array.from(e.dataTransfer.files) as File[]).filter((f: File) => f.type.startsWith('image/'));
      if (fileArray.length > 0) {
        const assignedError = editTargetUploadError || editSelectedErrors[0] || 'Lỗi chung';
        const newItems: EditImageItem[] = fileArray.map((file: File, i: number) => ({
          id: `new_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
          source: file,
          previewUrl: URL.createObjectURL(file),
          isNew: true,
          errorName: assignedError
        }));
        setEditPhotos(prev => [...prev, ...newItems]);
        setEditTargetUploadError('');
      }
    }
  };

  const handleEditRemovePhoto = (photoId: string) => {
    setEditPhotos(prev => {
      const target = prev.find(p => p.id === photoId);
      if (target && target.isNew && target.previewUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(target.previewUrl); } catch (_) {}
      }
      return prev.filter(p => p.id !== photoId);
    });
  };

  const handleEditChangePhotoError = (photoId: string, newError: string) => {
    setEditPhotos(prev => prev.map(p => p.id === photoId ? { ...p, errorName: newError } : p));
  };

  const triggerEditUploadForError = (errName: string, source: 'camera' | 'file') => {
    setEditTargetUploadError(errName);
    if (source === 'camera') {
      editCameraInputRef.current?.click();
    } else {
      editFileInputRef.current?.click();
    }
  };

  const startEditing = () => {
    if (!selectedReport || !isEditable) return;
    const initialPart = selectedReport.part || 'ĐẾ THÔ';
    setEditPart(initialPart);
    setEditDate(selectedReport.date || format(new Date(), 'yyyy-MM-dd'));

    const curFloor = selectedReport.floor || '';
    setEditFloor(curFloor);
    const floorsList = editConfig.floors || ['K63A', 'K63B', 'K73A', 'K73B'];
    setEditFloorOption(curFloor && !floorsList.includes(curFloor) ? 'CUSTOM' : curFloor);

    const curSubPart = selectedReport.subPart || '';
    setEditSubPart(curSubPart);
    const subPartsList = editConfig.subParts || [];
    setEditSubPartOption(curSubPart && !subPartsList.includes(curSubPart) ? 'CUSTOM' : curSubPart);

    const curOrder = selectedReport.order || '';
    const isNoPo = curOrder === 'Không có PO' || curOrder === 'Không' || curOrder === 'KHÔNG';
    setEditIsNoPo(isNoPo);
    setEditOrder(isNoPo ? 'KHÔNG' : curOrder);

    const isSole = getPartType(initialPart, curSubPart) === 'sole';
    if (isSole) {
      setEditShoeModel(selectedReport.shoeModel || selectedReport.colorCode || '');
      setEditColorCode('');
    } else {
      setEditColorCode(selectedReport.colorCode || selectedReport.shoeModel || '');
      setEditShoeModel('');
    }

    const curSupplier = selectedReport.supplier || '';
    setEditSupplier(curSupplier);
    const suppliersList = editConfig.suppliers || ['JIA HOA', 'VĨNH TÀI', 'NỘI BỘ', 'KHÁC'];
    setEditSupplierOption(curSupplier && !suppliersList.includes(curSupplier) ? 'CUSTOM' : curSupplier);

    setEditNote(selectedReport.note || '');

    let errorsList: string[] = [];
    if (selectedReport.errorNames && selectedReport.errorNames.length > 0) {
      errorsList = [...selectedReport.errorNames];
    } else if (selectedReport.errorName) {
      errorsList = selectedReport.errorName.split(',').map(s => s.trim()).filter(Boolean);
    }
    setEditSelectedErrors(errorsList);
    setEditErrorOption('');
    setEditCustomErrorInput('');

    const initialPhotos: EditImageItem[] = (selectedReport.imageUrls || []).map((url, idx) => {
      const defect = (selectedReport.imageErrors && selectedReport.imageErrors[idx])
        || (selectedReport.errorNames && selectedReport.errorNames[idx])
        || selectedReport.errorName
        || errorsList[0]
        || 'Lỗi chung';
      return {
        id: `existing_${idx}_${Date.now()}`,
        source: url,
        previewUrl: url,
        isNew: false,
        errorName: defect
      };
    });
    setEditPhotos(initialPhotos);
    setEditTargetUploadError('');
    setAdminActionError('');
    setSaveEditStatus('');
    setSaveEditProgress(0);
    setIsEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedReport || !isEditable) return;
    const isSole = getPartType(editPart, editSubPart) === 'sole';

    if (!editDate) {
      setAdminActionError('Vui lòng chọn ngày báo cáo.');
      return;
    }
    if (!editFloor.trim()) {
      setAdminActionError('Vui lòng chọn hoặc nhập lầu / khu vực.');
      return;
    }
    if (!editPart.trim()) {
      setAdminActionError('Vui lòng chọn bộ vị.');
      return;
    }
    if (!editSubPart.trim()) {
      setAdminActionError('Vui lòng chọn hoặc nhập thành phần nhỏ (chi tiết bộ vị).');
      return;
    }
    if (!editOrder.trim() && !editIsNoPo) {
      setAdminActionError("Vui lòng nhập mã đơn hàng (PO) hoặc tích 'Không có PO'.");
      return;
    }
    const finalShoeModel = isSole ? (editShoeModel.trim() || editColorCode.trim()) : '';
    const finalColorCode = isSole ? '' : (editColorCode.trim() || editShoeModel.trim());
    if (isSole && !finalShoeModel) {
      setAdminActionError('Vui lòng chọn hoặc nhập hình thể cho bộ vị đế.');
      return;
    }
    if (!isSole && !finalColorCode) {
      setAdminActionError('Vui lòng chọn hoặc nhập mã màu cho bộ vị mặt giày.');
      return;
    }
    if (!editSupplier.trim()) {
      setAdminActionError('Vui lòng chọn xưởng cung ứng.');
      return;
    }
    if (editSelectedErrors.length === 0) {
      setAdminActionError('Vui lòng chọn ít nhất 1 loại lỗi.');
      return;
    }
    if (editPhotos.length === 0) {
      setAdminActionError('Vui lòng đính kèm ít nhất 1 ảnh minh chứng lỗi.');
      return;
    }

    setIsSavingEdit(true);
    setSaveEditStatus('Đang chuẩn bị lưu dữ liệu...');
    setSaveEditProgress(15);
    setAdminActionError('');

    try {
      const finalOrder = editIsNoPo ? 'Không có PO' : editOrder.trim();
      const primaryError = editSelectedErrors[0];
      const allErrors = editSelectedErrors;
      const safePart = sanitizeName(editPart || 'Khong_Bo_Vi');
      const safeSubPart = editSubPart ? sanitizeName(editSubPart) : '';
      const safeOrder = sanitizeName(finalOrder);
      const safeModel = finalShoeModel ? sanitizeName(finalShoeModel) : '';
      const safeColor = sanitizeName(finalColorCode);
      const safeSupplier = sanitizeName(editSupplier);
      const safeFloor = sanitizeName(editFloor);
      const partPrefix = safeSubPart ? `${safePart}_${safeSubPart}` : safePart;
      const timestamp = Date.now();

      const finalUrls: string[] = [];
      const finalErrors: string[] = [];

      const fileToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      };

      const withUploadTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Action timeout exceeded')), ms);
        });
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
      };

      for (let i = 0; i < editPhotos.length; i++) {
        const item = editPhotos[i];
        const assignedErr = item.errorName || primaryError;
        if (!item.isNew) {
          // Existing photo
          finalUrls.push(item.source as string);
          finalErrors.push(assignedErr);
        } else {
          // Newly added photo: compress and upload
          setSaveEditStatus(`Đang nén và tải lên ảnh mới #${i + 1}...`);
          let blob: Blob = item.source as File;
          try {
            blob = await compressImage(item.source as File, 800, 800, 0.6);
          } catch (_) {
            blob = item.source as File;
          }
          const modelPart = safeModel ? `${safeModel}_` : '';
          const specificError = sanitizeName(assignedErr);
          const fileName = `${partPrefix}_${safeOrder}_${modelPart}${safeColor}_${specificError}_${safeSupplier}_${safeFloor}_edit_${i + 1}_${timestamp}.jpg`;
          
          let downloadUrl = '';
          if (!navigator.onLine) {
            downloadUrl = await fileToBase64(blob);
          } else if (token === 'NO_TOKEN') {
            try {
              downloadUrl = await withUploadTimeout(uploadFileToStorage(blob, fileName), 60000);
            } catch (_) {
              downloadUrl = await fileToBase64(blob);
            }
          } else {
            try {
              downloadUrl = await withUploadTimeout(uploadFileToDrive(blob, fileName, token), 60000);
            } catch (_) {
              try {
                downloadUrl = await withUploadTimeout(uploadFileToStorage(blob, fileName), 60000);
              } catch (_) {
                downloadUrl = await fileToBase64(blob);
              }
            }
          }

          finalUrls.push(downloadUrl);
          finalErrors.push(assignedErr);
        }

        const pct = 15 + Math.round(((i + 1) / editPhotos.length) * 65);
        setSaveEditProgress(pct);
      }

      setSaveEditStatus('Đang cập nhật cơ sở dữ liệu...');
      setSaveEditProgress(85);

      const updatedPayload: any = {
        date: editDate,
        floor: editFloor.trim(),
        order: finalOrder,
        shoeModel: finalShoeModel,
        colorCode: finalColorCode,
        errorName: allErrors.join(', '),
        errorNames: allErrors,
        imageErrors: finalErrors,
        imageUrls: finalUrls,
        supplier: editSupplier.trim(),
        part: editPart,
        subPart: editSubPart.trim(),
        note: editNote.trim()
      };

      if (selectedReport.isLocalOnly) {
        const localJson = localStorage.getItem('local_qc_reports');
        if (localJson) {
          const parsed = JSON.parse(localJson) as any[];
          const updated = parsed.map((item) => {
            if (item.id === selectedReport.id) {
              return { ...item, ...updatedPayload };
            }
            return item;
          });
          localStorage.setItem('local_qc_reports', JSON.stringify(updated));
        }
      } else {
        const docRef = doc(db, 'qc_reports', selectedReport.id);
        await updateDoc(docRef, updatedPayload);
      }

      const updatedReport: QCReport = {
        ...selectedReport,
        ...updatedPayload
      };

      setSelectedReport(updatedReport);
      setReports(prev => prev.map(r => r.id === selectedReport.id ? updatedReport : r));
      setSaveEditProgress(100);
      setSaveEditStatus('Cập nhật biên bản thành công!');
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
  const [selectedPart, setSelectedPart] = useState('all');
  const [selectedDownloaded, setSelectedDownloaded] = useState('all');
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
        { header: 'Hình thể', key: 'shoeModel', width: 16 },
        { header: 'Mã Màu', key: 'color', width: 15 },
        { header: 'Lỗi', key: 'error', width: 25 },
        { header: 'Khu vực', key: 'floor', width: 15 },
        { header: 'Xưởng', key: 'supplier', width: 15 },
        { header: 'Bộ vị', key: 'part', width: 15 },
        { header: 'Thành phần nhỏ', key: 'subPart', width: 18 },
        { header: 'Ngày lỗi', key: 'date', width: 15 },
        { header: 'Mã NV', key: 'reporter', width: 15 },
        { header: 'Tên nhân viên', key: 'reporterName', width: 20 },
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
          shoeModel: report.shoeModel || '',
          color: report.colorCode,
          error: report.errorName,
          floor: report.floor,
          supplier: report.supplier,
          part: report.part || '',
          subPart: report.subPart || '',
          date: format(parseISO(report.date), 'dd/MM/yyyy'),
          reporter: report.employeeId,
          reporterName: report.employeeName || '',
          note: report.note || ''
        });

        // Add All Images
        if (report.imageUrls && report.imageUrls.length > 0) {
          worksheet.getRow(rowIndex).height = 100; // row height 100
          
          for (let imgIndex = 0; imgIndex < report.imageUrls.length; imgIndex++) {
            const colIndex = imgIndex + 12; // Col M (12, 0-indexed) because of shoeModel column.
            
            // Ensure header exists for extra images
            if (imgIndex > 0) {
              const currentHeader = worksheet.getCell(1, colIndex + 1).value;
              if (!currentHeader) {
                 worksheet.getCell(1, colIndex + 1).value = `Hình ảnh lỗi ${imgIndex + 1}`;
                 worksheet.getColumn(colIndex + 1).width = 30;
              }
            }
            
            const base64 = await getBase64ImageFromUrl(report.imageUrls[imgIndex]);
            if (base64) {
              const imageId = workbook.addImage({
                base64: base64,
                extension: 'jpeg',
              });
              worksheet.addImage(imageId, {
                tl: { col: colIndex, row: rowIndex - 1 }, // 0-indexed column
                ext: { width: 120, height: 120 },
                editAs: 'oneCell'
              });
            } else {
               worksheet.getCell(rowIndex, colIndex + 1).value = "Lỗi tải ảnh";
            }
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
        const safePart = sanitizeName(report.part || 'Khong_Bo_Vi');
        const safeSubPart = report.subPart ? sanitizeName(report.subPart) : '';
        const safeOrder = sanitizeName(report.order);
        const safeColor = sanitizeName(report.colorCode);
        const safeError = sanitizeName(report.errorName);
        const safeSupplier = sanitizeName(report.supplier);
        const safeFloor = sanitizeName(report.floor);
        const partPrefix = safeSubPart ? `${safePart}_${safeSubPart}` : safePart;
        const namePrefix = `${partPrefix}_${safeOrder}_${safeColor}_${safeError}_${safeSupplier}_${safeFloor}`;
        
        for (let i = 0; i < report.imageUrls.length; i++) {
           const url = report.imageUrls[i];
           const currentError = (report.imageErrors && report.imageErrors[i])
             ? report.imageErrors[i]
             : (report.errorNames && report.errorNames[i])
               ? report.errorNames[i]
               : report.errorName;
           const safeImgError = sanitizeName(currentError);
           const namePrefix = `${partPrefix}_${safeOrder}_${safeColor}_${safeImgError}_${safeSupplier}_${safeFloor}`;
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

    if (isAdmin && !selectedReport.isLocalOnly) {
         try {
            const { arrayUnion: aU, updateDoc: uD, doc: fDoc } = await import('firebase/firestore');
            await uD(fDoc(db, 'qc_reports', selectedReport.id), { downloadedBy: aU(user.email || '') });
            setReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, downloadedBy: [...(r.downloadedBy || []), user.email || ''] } : r));
         } catch(e) { console.error("Failed to mark as downloaded:", e); }
    }

    const safePart = sanitizeName(selectedReport.part || 'Khong_Bo_Vi');
    const safeSubPart = selectedReport.subPart ? sanitizeName(selectedReport.subPart) : '';
    const safeOrder = sanitizeName(selectedReport.order);
    const safeModel = selectedReport.shoeModel ? sanitizeName(selectedReport.shoeModel) : '';
    const safeColor = sanitizeName(selectedReport.colorCode);
    const currentError = (selectedReport.imageErrors && selectedReport.imageErrors[activeDetailImageIndex])
      ? selectedReport.imageErrors[activeDetailImageIndex]
      : (selectedReport.errorNames && selectedReport.errorNames[activeDetailImageIndex])
        ? selectedReport.errorNames[activeDetailImageIndex]
        : selectedReport.errorName;
    const safeError = sanitizeName(currentError);
    const safeSupplier = sanitizeName(selectedReport.supplier);
    const safeFloor = sanitizeName(selectedReport.floor);
    const partPrefix = safeSubPart ? `${safePart}_${safeSubPart}` : safePart;
    const modelPrefix = safeModel ? `${safeModel}_` : '';
    const namePrefix = `${partPrefix}_${safeOrder}_${modelPrefix}${safeColor}_${safeError}_${safeSupplier}_${safeFloor}`;
    
    // We already have 'getBase64ImageFromUrl' which handles the CORS/object URL properly
    const actualDownloadUrl = loadedImageUrls[activeDetailImageIndex] || objectUrl;
    await downloadImage(actualDownloadUrl, activeDetailImageIndex, namePrefix);
  };

  const handleDownloadAllImages = async () => {
    if (!selectedReport || !selectedReport.imageUrls) return;
    setIsLoading(true);
    try {
      if (isAdmin && !selectedReport.isLocalOnly) {
         try {
            const docRef = doc(db, 'qc_reports', selectedReport.id);
            // Fallback for arrayUnion if it wasn't imported properly
            const { arrayUnion: aU, updateDoc: uD } = await import('firebase/firestore');
            await uD(docRef, { downloadedBy: aU(user.email || '') });
            setReports(prev => prev.map(r => r.id === selectedReport.id ? { ...r, downloadedBy: [...(r.downloadedBy || []), user.email || ''] } : r));
         } catch(e) { console.error("Failed to mark as downloaded:", e); }
      }
      const safePart = sanitizeName(selectedReport.part || 'Khong_Bo_Vi');
      const safeSubPart = selectedReport.subPart ? sanitizeName(selectedReport.subPart) : '';
      const safeOrder = sanitizeName(selectedReport.order);
      const safeModel = selectedReport.shoeModel ? sanitizeName(selectedReport.shoeModel) : '';
      const safeColor = sanitizeName(selectedReport.colorCode);
      const safeSupplier = sanitizeName(selectedReport.supplier);
      const safeFloor = sanitizeName(selectedReport.floor);
      const partPrefix = safeSubPart ? `${safePart}_${safeSubPart}` : safePart;
      const modelPrefix = safeModel ? `${safeModel}_` : '';

      if (selectedReport.imageUrls.length === 1) {
        const currentError = (selectedReport.imageErrors && selectedReport.imageErrors[0])
          ? selectedReport.imageErrors[0]
          : (selectedReport.errorNames && selectedReport.errorNames[0])
            ? selectedReport.errorNames[0]
            : selectedReport.errorName;
        const safeError = sanitizeName(currentError);
        const namePrefix = `${partPrefix}_${safeOrder}_${modelPrefix}${safeColor}_${safeError}_${safeSupplier}_${safeFloor}`;
        const actualDownloadUrl = loadedImageUrls[0] || selectedReport.imageUrls[0];
        await downloadImage(actualDownloadUrl, 0, namePrefix);
      } else {
        const zip = new JSZip();
        for (let i = 0; i < selectedReport.imageUrls.length; i++) {
          const url = selectedReport.imageUrls[i];
          const currentError = (selectedReport.imageErrors && selectedReport.imageErrors[i])
            ? selectedReport.imageErrors[i]
            : (selectedReport.errorNames && selectedReport.errorNames[i])
              ? selectedReport.errorNames[i]
              : selectedReport.errorName;
          const safeError = sanitizeName(currentError);
          const namePrefix = `${partPrefix}_${safeOrder}_${modelPrefix}${safeColor}_${safeError}_${safeSupplier}_${safeFloor}`;
          let base64 = await getBase64ImageFromUrl(url);
          if (base64) {
             const base64Data = base64.replace(/^data:image\/(png|jpeg|jpg);base64,/, "");
             zip.file(`${namePrefix}_${i + 1}.jpg`, base64Data, {base64: true});
          }
        }
        const content = await zip.generateAsync({type: "blob"});
        saveAs(content, `${partPrefix}_${safeOrder}_${modelPrefix}${safeColor}_Images.zip`);
      }
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
          const docErrorNames: string[] = Array.isArray(data.errorNames)
            ? data.errorNames
            : (data.errorName ? data.errorName.split(',').map((s: string) => s.trim()).filter(Boolean) : []);

          onlineReports.push({
            id: doc.id,
            date: data.date,
            floor: data.floor,
            order: data.order,
            shoeModel: data.shoeModel || '',
            colorCode: data.colorCode,
            errorName: data.errorName || docErrorNames.join(', '),
            errorNames: docErrorNames,
            imageErrors: Array.isArray(data.imageErrors) ? data.imageErrors : [],
            supplier: data.supplier,
            imageUrls: data.imageUrls || [],
            employeeId: data.employeeId,
            employeeEmail: data.employeeEmail,
            employeeName: data.employeeName || '',
            isDownloaded: data.isDownloaded || false,
            downloadedBy: data.downloadedBy || [],
            part: data.part || '',
            subPart: data.subPart || '',
            note: data.note || '',
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

      if (mergedList.length > 0 && typeof window !== 'undefined' && window.innerWidth >= 1024) {
        setSelectedReport(prev => prev || mergedList[0]);
      }

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
        shoeModel: report.shoeModel || '',
        colorCode: report.colorCode || '',
        errorName: report.errorName || '',
        errorNames: report.errorNames || (report.errorName ? report.errorName.split(',').map(s => s.trim()).filter(Boolean) : []),
        imageErrors: report.imageErrors || [],
        supplier: report.supplier || '',
        part: report.part || '',
        subPart: report.subPart || '',
        employeeName: report.employeeName || '',
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

  const uniqueParts = useMemo(() => {
    const parts = reports.map(r => (r.part || '').trim()).filter(Boolean);
    return Array.from(new Set(parts));
  }, [reports]);

  // Apply Search and Filters to raw reports list
  const filteredReports = useMemo(() => {
    let result = [...reports];

    // Query Text Filter (Order PO, Color, Error Name, Supplier, Floor, Part, SubPart)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => 
        r.order.toLowerCase().includes(q) ||
        r.colorCode.toLowerCase().includes(q) ||
        r.errorName.toLowerCase().includes(q) ||
        r.supplier.toLowerCase().includes(q) ||
        r.floor.toLowerCase().includes(q) ||
        (r.part && r.part.toLowerCase().includes(q)) ||
        (r.subPart && r.subPart.toLowerCase().includes(q)) ||
        (r.shoeModel && r.shoeModel.toLowerCase().includes(q))
      );
    }

    // Part Filter
    if (selectedPart !== 'all') {
      result = result.filter(r => (r.part || '').trim() === selectedPart);
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
    <div className="flex-1 min-h-0 h-auto md:h-full flex flex-col max-w-[1600px] w-full mx-auto p-3 sm:p-4 lg:p-6 overflow-visible md:overflow-hidden lg:flex-row lg:gap-5">
      
      {/* Left Column (Desktop Master Pane) */}
      <div className={`flex-1 flex-col min-w-0 min-h-0 h-auto md:h-full ${selectedReport ? 'hidden lg:flex lg:w-3/5 lg:flex-none' : 'flex w-full'}`}>
        {/* COMPACT INDUSTRIAL TOOLBAR */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs p-3 sm:p-4 mb-3 shrink-0 flex flex-col gap-3">
          {/* ROW 1: Stats & Filters */}
          <div className="flex flex-col xl:flex-row gap-3 items-start xl:items-center justify-between">
            {/* Stats (Compact Industrial) */}
            <div className="flex items-center flex-wrap gap-2 text-xs font-mono font-semibold w-full xl:w-auto">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 px-2.5 py-1.5 rounded flex-1 sm:flex-none justify-center">
                <span className="text-slate-500 uppercase tracking-wider text-[10px]">TỔNG:</span>
                <span className="text-slate-900 font-bold">{reports.length}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded flex-1 sm:flex-none justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600"></span>
                <span className="text-emerald-700 uppercase tracking-wider text-[10px]">ONLINE:</span>
                <span className="text-emerald-800 font-bold">{reports.filter(r => !r.isLocalOnly).length}</span>
              </div>
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded flex-1 sm:flex-none justify-center">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600"></span>
                <span className="text-amber-700 uppercase tracking-wider text-[10px]">TẠM LƯU:</span>
                <span className="text-amber-800 font-bold">{reports.filter(r => r.isLocalOnly).length}</span>
              </div>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
              <select
                value={selectedFloor}
                onChange={e => setSelectedFloor(e.target.value)}
                className="h-9 px-2.5 border border-slate-300 rounded text-xs bg-white outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 font-medium text-slate-800 flex-1 min-w-[110px]"
              >
                <option value="all">Tất cả khu vực</option>
                {uniqueFloors.map(floor => (
                  <option key={floor} value={floor}>{floor}</option>
                ))}
              </select>
              
              <select
                value={selectedSupplier}
                onChange={e => setSelectedSupplier(e.target.value)}
                className="h-9 px-2.5 border border-slate-300 rounded text-xs bg-white outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 font-medium text-slate-800 flex-1 min-w-[110px]"
              >
                <option value="all">Tất cả xưởng</option>
                {uniqueSuppliers.map(sup => (
                  <option key={sup} value={sup}>{sup}</option>
                ))}
              </select>

              {uniqueParts.length > 0 && (
                <select
                  value={selectedPart}
                  onChange={e => setSelectedPart(e.target.value)}
                  className="h-9 px-2.5 border border-slate-300 rounded text-xs bg-white outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 font-medium text-slate-800 flex-1 min-w-[110px]"
                >
                  <option value="all">Tất cả bộ vị</option>
                  {uniqueParts.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}

              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="h-9 px-2.5 border border-slate-300 rounded text-xs bg-white outline-none focus:ring-1 focus:ring-blue-600 focus:border-blue-600 font-medium text-slate-800 flex-1 min-w-[110px]"
              >
                <option value="all">Tất cả trạng thái</option>
                <option value="synced">Đã đồng bộ Cloud</option>
                <option value="offline">Lưu tạm ngoại tuyến</option>
              </select>

              <div className="flex items-center gap-1.5 h-9 bg-white border border-slate-300 rounded px-2.5 flex-1 min-w-[200px]">
                <Calendar className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  className="bg-transparent text-xs outline-none w-full min-w-0 font-mono text-slate-800"
                />
                <span className="text-slate-400 text-xs shrink-0 font-mono">~</span>
                <input 
                  type="date" 
                  value={selectedEndDate}
                  onChange={e => setSelectedEndDate(e.target.value)}
                  className="bg-transparent text-xs outline-none w-full min-w-0 font-mono text-slate-800"
                />
              </div>
            </div>
          </div>

          <div className="h-px bg-slate-200 w-full"></div>

          {/* ROW 2: Search & Actions */}
          <div className="flex flex-col sm:flex-row gap-2.5 items-start sm:items-center justify-between">
            {/* Search */}
            <div className="relative w-full sm:w-[320px]">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Tìm kiếm mã PO, loại lỗi, mã màu..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-3 h-9 border border-slate-300 rounded text-xs bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none font-medium text-slate-800 placeholder:text-slate-400"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center flex-wrap gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={toggleSortOrder}
                className="h-9 px-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded transition-colors cursor-pointer"
                title="Sắp xếp theo thời gian"
              >
                <ArrowUpDown className="h-3.5 w-3.5" />
                <span>{sortOrder === 'desc' ? 'MỚI NHẤT' : 'CŨ NHẤT'}</span>
              </button>
              
              {isAdmin && (
                <>
                  <button
                    onClick={handleExportToExcel}
                    disabled={isLoading || filteredReports.length === 0}
                    className="h-9 px-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 rounded transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">XUẤT EXCEL</span>
                  </button>
                  
                  <button
                    onClick={handleDownloadBulkZIP}
                    disabled={isLoading || filteredReports.length === 0}
                    className="h-9 px-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded transition-colors disabled:opacity-50 cursor-pointer"
                    title="Tải trọn bộ ảnh dạng tệp nén ZIP"
                  >
                    <Download className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">TẢI ZIP ẢNH</span>
                  </button>
                </>
              )}
              
              <button
                onClick={() => fetchReports(true)}
                disabled={isLoading}
                className="h-9 px-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-300 rounded transition-colors disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span className="hidden sm:inline">LÀM MỚI</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (selectedReport) {
                    setZaloReport(selectedReport);
                  } else if (filteredReports.length > 0) {
                    setZaloReport(filteredReports[0]);
                  }
                }}
                disabled={isLoading || filteredReports.length === 0}
                className="h-9 px-3 text-xs font-mono font-bold flex items-center justify-center gap-1.5 text-white bg-[#0068FF] hover:bg-[#0055d4] active:bg-[#0047b3] border border-blue-600 rounded transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
                title="Chia sẻ báo cáo chất lượng này sang Zalo"
              >
                <ZaloIcon className="h-4 w-4" />
                <span>CHIA SẺ ZALO</span>
              </button>
            </div>
          </div>
        </div>

      {/* Sync Status Banner */}
      {(syncStatusMsg || reports.some(r => r.isLocalOnly)) && (
        <div className="bg-amber-50 border border-amber-300 p-3 rounded-lg mb-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 text-amber-900 text-xs">
            <Info className={`h-4 w-4 text-amber-600 shrink-0 ${syncStatusMsg ? 'animate-pulse' : ''}`} />
            <span className="font-semibold">
               {syncStatusMsg || `Có ${reports.filter(r => r.isLocalOnly).length} báo cáo đang lưu tạm ngoại tuyến trên máy này. Hãy bấm ĐỒNG BỘ để tải lên máy chủ.`}
            </span>
          </div>
          {!syncStatusMsg && (
             <button
                onClick={handleSyncAllLocal}
                className="bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs py-1.5 px-3 rounded flex items-center gap-1.5 cursor-pointer border-none shadow-xs"
             >
                <RefreshCw className="h-3.5 w-3.5" />
                ĐỒNG BỘ LÊN CLOUD
             </button>
          )}
        </div>
      )}

      {/* Reports List */}
      <div className={`flex-1 min-h-0 h-auto md:overflow-y-auto pr-1 flex flex-col gap-2.5 pb-6 ${selectedReport ? 'hidden lg:flex' : 'flex'}`}>
          {isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center py-20 bg-white rounded-lg border border-slate-200 shadow-xs">
              <RefreshCw className="animate-spin h-8 w-8 text-blue-600 mb-3" />
              <p className="text-xs font-mono font-medium text-slate-500">ĐANG TẢI DỮ LIỆU BÁO CÁO...</p>
            </div>
          ) : filteredReports.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center py-16 bg-white rounded-lg border border-slate-200 shadow-xs text-center px-4">
              <FileText className="h-10 w-10 text-slate-300 mb-2" />
              <p className="text-sm font-bold text-slate-700 font-mono uppercase">Không tìm thấy báo cáo nào phù hợp</p>
              <p className="text-xs text-slate-500 max-w-sm mt-1">
                Thử điều chỉnh lại bộ lọc ngày hoặc từ khóa tìm kiếm.
              </p>
              <button 
                onClick={onNavigateToCreate}
                className="mt-4 bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-xs py-2 px-4 rounded cursor-pointer border-none"
              >
                + TẠO BÁO CÁO MỚI
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
                className={`shrink-0 border rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer bg-white transition-all shadow-xs ${selectedReport?.id === report.id ? 'border-blue-600 ring-1 ring-blue-600 bg-blue-50/15' : 'border-slate-200 hover:border-slate-400'}`}
              >
                <div className="flex-1 flex items-start gap-3 min-w-0">
                  <div className="h-14 w-14 rounded bg-slate-900 border border-slate-200 overflow-hidden flex items-center justify-center text-slate-400 shrink-0 relative">
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
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-bold text-slate-900 leading-tight">
                          {report.errorName || 'Chưa phân loại lỗi'}
                        </h3>
                        {report.errorNames && report.errorNames.length > 1 && (
                          <span className="text-[10px] font-mono font-bold text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.2 rounded">
                            {report.errorNames.length} LỖI
                          </span>
                        )}
                        {report.isLocalOnly ? (
                          <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                            <CloudOff className="h-3 w-3" /> LƯU TẠM
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 flex items-center gap-1">
                            <CheckCircle className="h-3 w-3" /> ONLINE
                          </span>
                        )}
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                        <span className="font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {report.part || 'Chưa chọn'}
                        </span>
                        {report.subPart && (
                          <span className="font-semibold text-blue-800 bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                            {report.subPart}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (report.order && report.order !== 'Không' && report.order !== 'N/A') {
                              setSearchQuery(report.order);
                            }
                          }}
                          className="font-bold text-slate-800 bg-slate-100 hover:bg-blue-100 hover:text-blue-800 px-2 py-0.5 rounded border border-slate-200 cursor-pointer transition-colors"
                          title="Bấm để lọc tất cả lỗi của đơn hàng PO này"
                        >
                          PO: {report.order || 'N/A'}
                        </button>
                        {(() => {
                          const partType = getPartType(report.part, report.subPart);
                          if (partType === 'sole') {
                            // Đế thô/ phun sơn: Chỉ cần hiện hình thể, không hiện màu
                            const modelVal = report.shoeModel || report.colorCode;
                            return modelVal ? (
                              <span className="font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                HT: {modelVal}
                              </span>
                            ) : null;
                          } else if (partType === 'upper') {
                            // Mặt giày: Chỉ cần hiện mã màu, không hiện hình thể
                            const colorVal = report.colorCode || report.shoeModel;
                            return colorVal ? (
                              <span className="font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                MÃ MÀU: {colorVal}
                              </span>
                            ) : null;
                          } else {
                            // Khác: giữ nguyên nếu có cả hai
                            return (
                              <>
                                {report.shoeModel && (
                                  <span className="font-bold text-teal-800 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                                    HT: {report.shoeModel}
                                  </span>
                                )}
                                {report.colorCode && (
                                  <span className="font-bold text-indigo-800 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">
                                    MÀU: {report.colorCode}
                                  </span>
                                )}
                              </>
                            );
                          }
                        })()}
                      </div>
                      
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500 font-mono">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400" /> {report.floor || 'N/A'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Factory className="h-3 w-3 text-slate-400" /> {report.supplier || 'N/A'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3 text-slate-400" /> {getFriendlyDate(report.date) || 'N/A'}
                        </span>
                        {(report.employeeName || report.employeeId) && (
                          <span className="flex items-center gap-1 text-slate-700 font-semibold" title={`QC: ${report.employeeName || ''} (${report.employeeId || ''})`}>
                            <UserIcon className="h-3 w-3 text-slate-400" />
                            <span className="break-words">{report.employeeName || report.employeeId}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto shrink-0 border-t sm:border-t-0 pt-2 sm:pt-0 justify-between sm:justify-end">
                  <div className="text-[11px] font-mono text-slate-400 flex items-center gap-1">
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
                        className="bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-xs font-mono font-bold py-1 px-2.5 rounded flex items-center gap-1 cursor-pointer border-none"
                        title="Đồng bộ thủ công"
                      >
                        <RefreshCw className={`h-3 w-3 ${syncingId === report.id ? 'animate-spin' : ''}`} />
                        Đồng bộ
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setZaloReport(report);
                      }}
                      className="px-2.5 py-1.5 rounded-md text-white bg-[#0068FF] hover:bg-[#0055d4] active:bg-[#0047b3] transition-all cursor-pointer flex items-center gap-1.5 text-xs font-mono font-bold shrink-0 shadow-xs"
                      title="Chia sẻ báo cáo đơn hàng này sang Zalo"
                    >
                      <ZaloIcon className="h-4 w-4" />
                      <span>Chia sẻ Zalo</span>
                    </button>
                    <ChevronRight className="h-4 w-4 text-slate-400 hidden sm:block" />
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Right Column (Desktop Detail Pane) */}
      <div className={`w-full lg:w-2/5 min-h-0 lg:min-w-[420px] flex-col h-auto md:h-full ${selectedReport ? 'flex' : 'hidden lg:flex'}`}>
        
        {/* Selected Details Drawer Pane */}
        <div className="bg-white rounded-lg border border-slate-200 shadow-xs flex flex-col lg:overflow-hidden flex-1 h-auto lg:h-full lg:min-h-0">
          {selectedReport ? (
            <div className="flex-1 flex flex-col h-auto lg:h-full lg:overflow-y-auto">
              {/* Header Title */}
              <div className="p-3.5 bg-slate-900 border-b border-slate-800 text-white shrink-0 flex items-center justify-between">
                <div>
                  <div className="text-[10px] text-slate-400 font-mono uppercase tracking-wider flex items-center gap-1.5 mb-0.5">
                    {selectedReport.isLocalOnly ? (
                      <span className="text-amber-400 flex items-center gap-1"><CloudOff className="h-3 w-3" /> BÁO CÁO LƯU TẠM</span>
                    ) : (
                      <span className="text-emerald-400 flex items-center gap-1"><CheckCircle className="h-3 w-3" /> ĐÃ LƯU TRỰC TUYẾN</span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold leading-tight font-mono break-words">{selectedReport.errorName}</h3>
                  {selectedReport.errorNames && selectedReport.errorNames.length > 1 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {selectedReport.errorNames.map((e, idx) => (
                        <span key={idx} className="text-[10px] font-mono font-bold bg-blue-900/60 text-blue-200 border border-blue-500/40 px-1.5 py-0.2 rounded">
                          {idx + 1}. {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <button 
                  onClick={() => setSelectedReport(null)}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-mono font-bold cursor-pointer border border-slate-700 flex items-center gap-1 shrink-0 transition-colors"
                >
                  ‹ QUAY LẠI
                </button>
              </div>

              {/* Informative Body */}
              <div className="flex-1 p-5 space-y-5">
                {/* Admin/User Error Notification */}
                {adminActionError && (
                  <div className="rounded-lg bg-red-50 p-3.5 border border-red-200 text-xs text-red-800 font-semibold leading-relaxed flex items-start gap-2.5 shadow-sm animate-in fade-in duration-200">
                    <AlertCircle className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
                    <span>{adminActionError}</span>
                  </div>
                )}

                {/* Embedded Zalo Share Section in Detail Pane */}
                {!isEditing && (
                  <div className="bg-gradient-to-br from-blue-50/90 via-sky-50 to-blue-50/50 border border-blue-200 rounded-xl p-3.5 space-y-2.5 shadow-2xs">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-lg bg-[#0068FF] text-white p-1 flex items-center justify-center shadow-xs">
                          <ZaloIcon className="h-5 w-5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-bold font-mono text-blue-950 uppercase">
                            Chia Sẻ Sang Zalo
                          </h4>
                          <span className="text-[10px] text-blue-700 font-mono">
                            PO: {selectedReport.order || 'Không có PO'} • {selectedReport.imageUrls?.length || 0} ảnh
                          </span>
                        </div>
                      </div>

                      <a
                        href="https://chat.zalo.me/"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] font-mono font-bold text-white bg-[#0068FF] hover:bg-[#0055d4] px-2.5 py-1 rounded-md flex items-center gap-1 shadow-2xs transition-colors"
                        title="Mở ứng dụng Zalo Web trên trình duyệt"
                      >
                        <ExternalLink className="h-3 w-3" />
                        <span>Mở Zalo Web</span>
                      </a>
                    </div>

                    {/* Pre-formatted message snippet */}
                    <div className="bg-white/95 border border-blue-200 rounded-lg p-2.5 font-mono text-[11px] text-slate-800 whitespace-pre-wrap leading-relaxed select-all">
                      {buildZaloMessage(selectedReport)}
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-0.5">
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            const msg = buildZaloMessage(selectedReport);
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                              await navigator.clipboard.writeText(msg);
                            }
                            setDetailCopiedZalo(true);
                            setTimeout(() => setDetailCopiedZalo(false), 3000);
                          } catch (_) {
                            setZaloReport(selectedReport);
                          }
                        }}
                        className={`border font-mono font-bold text-xs py-2 px-2.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-all ${
                          detailCopiedZalo 
                            ? 'bg-emerald-600 text-white border-emerald-600' 
                            : 'bg-white hover:bg-blue-50 border-blue-300 text-blue-900'
                        }`}
                        title="Sao chép tin nhắn ngắn gọn gửi Zalo"
                      >
                        {detailCopiedZalo ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5 text-blue-600" />}
                        <span>{detailCopiedZalo ? 'ĐÃ SAO CHÉP!' : 'SAO CHÉP TIN'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setZaloReport(selectedReport)}
                        className="bg-[#0068FF] hover:bg-[#0055d4] active:bg-[#0047b3] text-white font-mono font-bold text-xs py-2 px-2.5 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs transition-colors border-none"
                        title="Mở hộp thoại tải trọn bộ ảnh và chia sẻ Zalo"
                      >
                        <ZaloIcon className="h-3.5 w-3.5" />
                        <span>GỬI & TẢI ẢNH ZALO</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Edit & Delete Controls Panel */}
                {isEditable && !isEditing && !deleteConfirmOpen && (
                  <div className="animate-in slide-in-from-top-3 duration-200">
                    <div className="flex gap-2 text-xs">
                      <button
                        onClick={startEditing}
                        className="flex-1 bg-white hover:bg-[#F8FAFC] border border-slate-100 text-slate-800 font-extrabold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-sm cursor-pointer transition-all border border-slate-100 hover:border-slate-350"
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
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50/50 border border-blue-200 rounded-xl p-5 text-center space-y-3 shadow-xs animate-in zoom-in-95 duration-200">
                    <div className="w-11 h-11 rounded-xl bg-blue-600 text-white flex items-center justify-center mx-auto shadow-sm">
                      <Pencil className="h-5 w-5" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold font-mono text-blue-950 uppercase">
                        Đang Mở Bảng Chỉnh Sửa Toàn Diện
                      </h4>
                      <p className="text-[11px] text-blue-800 mt-1 leading-relaxed">
                        Cửa sổ chỉnh sửa toàn diện (chuẩn giao diện tạo báo cáo) đang hiển thị trên màn hình.
                      </p>
                    </div>
                    <div className="flex items-center justify-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsEditing(true)}
                        className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold font-mono cursor-pointer shadow-xs transition-colors flex items-center gap-1.5"
                      >
                        <Pencil className="h-3 w-3" />
                        Mở Lại Cửa Sổ Chỉnh Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => { setIsEditing(false); setAdminActionError(''); }}
                        className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg text-xs font-bold font-mono text-slate-700 cursor-pointer shadow-xs transition-colors"
                      >
                        Đóng / Hủy
                      </button>
                    </div>
                  </div>
                ) : (
                  /* VIEW MODE */
                  <>
                    {/* Industrial Metadata Specifications Grid */}
                    <div className="grid grid-cols-2 bg-slate-50 border border-slate-200 rounded overflow-hidden divide-y divide-slate-200 font-mono text-xs">
                      <div className="flex divide-x divide-slate-200 col-span-2">
                        <div className="p-2.5 flex-1 flex flex-col items-center justify-center text-center">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider">NGÀY KIỂM</span>
                          <span className="font-bold text-slate-800">{getFriendlyDate(selectedReport.date)}</span>
                        </div>
                        <div className="p-2.5 flex-1 flex flex-col items-center justify-center text-center">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider">KHU VỰC / LẦU</span>
                          <span className="font-bold text-slate-800">{selectedReport.floor}</span>
                        </div>
                      </div>
                      
                      <div className="flex divide-x divide-slate-200 col-span-2">
                        <div className="p-2.5 flex-1 flex flex-col items-center justify-center text-center">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider">BỘ VỊ & THÀNH PHẦN</span>
                          <span className="font-bold text-slate-800">{selectedReport.part || 'Không xác định'}</span>
                          {selectedReport.subPart && (
                            <span className="text-[11px] font-semibold text-blue-700 mt-0.5 font-sans">({selectedReport.subPart})</span>
                          )}
                        </div>
                        <div className="p-2.5 flex-1 flex flex-col items-center justify-center text-center">
                          <span className="text-[10px] text-slate-400 uppercase tracking-wider">ĐƠN HÀNG (PO)</span>
                          <span className="font-bold text-slate-900 font-mono tracking-wide">{selectedReport.order}</span>
                        </div>
                      </div>

                      <div className="flex divide-x divide-slate-200 col-span-2">
                        {(() => {
                          const partType = getPartType(selectedReport.part, selectedReport.subPart);
                          if (partType === 'sole') {
                            // Đế thô / phun sơn: Chỉ hiện hình thể, không hiện màu
                            return (
                              <div className="p-2.5 flex-1 flex flex-col items-center justify-center text-center">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider">HÌNH THỂ</span>
                                <span className="font-bold text-teal-800 font-mono">{selectedReport.shoeModel || selectedReport.colorCode || 'N/A'}</span>
                              </div>
                            );
                          } else if (partType === 'upper') {
                            // Mặt giày: Chỉ hiện mã màu, không hiện hình thể
                            return (
                              <div className="p-2.5 flex-1 flex flex-col items-center justify-center text-center">
                                <span className="text-[10px] text-slate-400 uppercase tracking-wider">MÃ MÀU</span>
                                <span className="font-bold text-indigo-800 font-mono">{selectedReport.colorCode || selectedReport.shoeModel || 'N/A'}</span>
                              </div>
                            );
                          } else {
                            return (
                              <>
                                {selectedReport.shoeModel && (
                                  <div className="p-2.5 flex-1 flex flex-col items-center justify-center text-center">
                                    <span className="text-[10px] text-slate-400 uppercase tracking-wider">HÌNH THỂ</span>
                                    <span className="font-bold text-teal-800 font-mono">{selectedReport.shoeModel}</span>
                                  </div>
                                )}
                                <div className="p-2.5 flex-1 flex flex-col items-center justify-center text-center">
                                  <span className="text-[10px] text-slate-400 uppercase tracking-wider">MÃ MÀU</span>
                                  <span className="font-bold text-indigo-800 font-mono">{selectedReport.colorCode || 'N/A'}</span>
                                </div>
                              </>
                            );
                          }
                        })()}
                      </div>
                    </div>

                    {/* Additional Metadata Info */}
                    <div className="border-t border-slate-200 pt-3 space-y-2 text-xs font-mono">
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-500 uppercase">Xưởng Cung Ứng:</span>
                        <span className="font-bold text-slate-900">{selectedReport.supplier}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-500 uppercase">Thành Phần Nhỏ:</span>
                        <span className="font-bold text-blue-700">{selectedReport.subPart || 'N/A'}</span>
                      </div>
                      {selectedReport.errorNames && selectedReport.errorNames.length > 1 && (
                        <div className="flex flex-col gap-1.5 py-1.5 border-b border-slate-100">
                          <span className="text-slate-500 uppercase text-[10px]">Danh sách các lỗi ({selectedReport.errorNames.length}):</span>
                          <div className="flex flex-wrap gap-1">
                            {selectedReport.errorNames.map((err, i) => (
                              <span key={i} className="text-xs font-semibold font-mono text-red-800 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                                {i + 1}. {err}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-1.5 border-b border-slate-100 gap-1">
                        <span className="text-slate-500 uppercase shrink-0">QC Phụ Trách:</span>
                        <div className="text-left sm:text-right">
                          <span className="font-bold text-slate-900 break-words">
                            {selectedReport.employeeName || selectedReport.employeeEmail || 'N/A'}
                          </span>
                          <span className="text-slate-500 font-mono text-[11px] ml-1.5 font-semibold">
                            (Mã: {selectedReport.employeeId || 'QC'})
                          </span>
                        </div>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-slate-100">
                        <span className="text-slate-500 uppercase">Thời Gian Tạo:</span>
                        <span className="text-slate-600">
                          {selectedReport.createdAt ? format(new Date(selectedReport.createdAt), 'dd/MM/yyyy HH:mm:ss') : 'Ngoại tuyến'}
                        </span>
                      </div>
                      
                      {selectedReport.note && (
                        <div className="flex flex-col gap-1 py-2 mt-1 bg-slate-50 p-2.5 rounded border border-slate-200">
                           <span className="font-bold text-slate-600 uppercase text-[10px]">Ghi chú kiểm tra:</span>
                           <span className="text-xs text-slate-800 font-sans whitespace-pre-wrap leading-relaxed">{selectedReport.note}</span>
                        </div>
                      )}
                    </div>
                  </>
                )}

                {/* Proof Images Carousel / Grid */}
                <div className="border-t border-slate-200 pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1.5">
                      Minh chứng hình ảnh ({selectedReport.imageUrls?.length || 0} ảnh)
                    </h4>
                    {selectedReport.imageUrls && selectedReport.imageUrls.length > 0 && (
                      <button
                        onClick={handleDownloadAllImages}
                        className="text-xs text-emerald-700 hover:text-emerald-900 font-bold font-mono flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded border border-emerald-200 transition-colors cursor-pointer"
                        title="Tải về máy tất cả hình ảnh"
                      >
                        <Download className="h-3 w-3" />
                        <span>TẢI TẤT CẢ</span>
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
                        className="relative group h-48 sm:h-56 bg-[#F8FAFC] border border-slate-100 rounded-xl overflow-hidden cursor-zoom-in shadow-inner flex items-center justify-center transition-all hover:border-blue-300"
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
                          {selectedReport.imageUrls.map((url, i) => {
                            const thumbError = (selectedReport.imageErrors && selectedReport.imageErrors[i])
                              ? selectedReport.imageErrors[i]
                              : (selectedReport.errorNames && selectedReport.errorNames[i])
                                ? selectedReport.errorNames[i]
                                : selectedReport.errorName;
                            return (
                              <button
                                key={i}
                                type="button"
                                onClick={() => setActiveDetailImageIndex(i)}
                                className={`relative h-16 w-16 rounded-lg bg-slate-100 overflow-hidden flex-shrink-0 cursor-pointer transition-all border-2 outline-none flex flex-col ${activeDetailImageIndex === i ? 'border-blue-600 ring-2 ring-blue-500/20 scale-95' : 'border-slate-100 hover:border-slate-350 opacity-75 hover:opacity-100'}`}
                                title={`Ảnh #${i + 1}: ${thumbError}`}
                              >
                                <DriveImage 
                                  url={url} 
                                  token={token} 
                                  className="w-full h-full object-cover" 
                                  alt={`Thumb ${i}`} 
                                  onLoaded={(objectUrl) => setLoadedImageUrls(prev => ({...prev, [i]: objectUrl}))}
                                />
                                <div className="absolute inset-x-0 bottom-0 bg-black/80 px-1 py-0.5 text-center pointer-events-none">
                                  <span className="text-[9px] font-mono text-white font-bold truncate block">
                                    {thumbError}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}

                      {/* Ghi chú tên lỗi bên dưới hình */}
                      {(() => {
                        const activeDefectName = (selectedReport.imageErrors && selectedReport.imageErrors[activeDetailImageIndex])
                          ? selectedReport.imageErrors[activeDetailImageIndex]
                          : (selectedReport.errorNames && selectedReport.errorNames[activeDetailImageIndex])
                            ? selectedReport.errorNames[activeDetailImageIndex]
                            : selectedReport.errorName;

                        return (
                          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mt-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="text-[10px] font-mono font-bold text-red-600 uppercase flex items-center gap-1 shrink-0 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0"></span>
                                LỖI ẢNH #{activeDetailImageIndex + 1}:
                              </span>
                              <span className="text-xs font-mono font-bold text-slate-800 break-words" title={activeDefectName}>
                                {activeDefectName || 'Lỗi chung'}
                              </span>
                            </div>

                            <div className="flex items-center gap-2 text-xs shrink-0 self-end sm:self-auto">
                              <button
                                onClick={handleDownloadActiveImage}
                                disabled={!loadedImageUrls[activeDetailImageIndex]}
                                className="text-[11px] text-green-700 hover:text-green-800 font-bold font-mono flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-green-50 border border-green-300 rounded shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                                title="Tải ảnh này về máy (đặt tên theo lỗi)"
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span>Tải xuống</span>
                              </button>
                              <a 
                                href={selectedReport.imageUrls[activeDetailImageIndex]} 
                                target="_blank" 
                                rel="noreferrer noopener"
                                className="text-[11px] text-blue-700 hover:text-blue-900 font-bold font-mono flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-blue-50 border border-blue-300 rounded shadow-2xs transition-colors cursor-pointer"
                              >
                                <span>Mở HD</span>
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            </div>
                          </div>
                        );
                      })()}
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
                      className="w-full bg-red-50 text-red-600 hover:bg-red-100 border border-slate-100 font-bold text-xs py-2 px-3 rounded-lg text-center cursor-pointer transition-colors"
                    >
                      Xóa cục bộ (Xóa bản nháp)
                    </button>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center mb-3 shadow-2xs">
                <ZaloIcon className="h-8 w-8" />
              </div>
              <p className="text-sm font-bold text-slate-800 font-mono uppercase">CHIA SẺ BÁO CÁO QUA ZALO</p>
              <p className="text-xs text-slate-500 max-w-[280px] mt-1.5 leading-relaxed">
                Chọn bất kỳ báo cáo lỗi nào ở danh sách để xem chi tiết hình ảnh, biên bản kiểm tra và bấm nút chia sẻ sang Zalo.
              </p>
              {filteredReports.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedReport(filteredReports[0]);
                    setActiveDetailImageIndex(0);
                    setLoadedImageUrls({});
                  }}
                  className="mt-4 bg-[#0068FF] hover:bg-[#0055d4] active:bg-[#0047b3] text-white text-xs font-mono font-bold py-2 px-3.5 rounded-lg flex items-center gap-2 cursor-pointer shadow-xs transition-colors"
                >
                  <ZaloIcon className="h-4 w-4" />
                  <span>XEM & CHIA SẺ BÁO CÁO NÀY</span>
                </button>
              )}
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
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-mono bg-white/10 px-3 py-1.5 rounded-full backdrop-blur">
                PO: <span className="font-bold">{selectedReport.order}</span> / Hình {lightboxIndex + 1} trên {selectedReport.imageUrls.length}
              </span>
              {(() => {
                const lbDefect = (selectedReport.imageErrors && selectedReport.imageErrors[lightboxIndex])
                  ? selectedReport.imageErrors[lightboxIndex]
                  : (selectedReport.errorNames && selectedReport.errorNames[lightboxIndex])
                    ? selectedReport.errorNames[lightboxIndex]
                    : selectedReport.errorName;
                return lbDefect ? (
                  <span className="text-xs font-mono bg-red-600/90 text-white px-3 py-1.5 rounded-full backdrop-blur font-bold flex items-center gap-1 shadow-sm">
                    <span>Lỗi:</span>
                    <span>{lbDefect}</span>
                  </span>
                ) : null;
              })()}
            </div>
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
          <div className="absolute bottom-6 left-4 right-4 flex flex-col items-center gap-2 z-10" onClick={(e) => e.stopPropagation()}>
            {(() => {
              const lbDefect = (selectedReport.imageErrors && selectedReport.imageErrors[lightboxIndex])
                ? selectedReport.imageErrors[lightboxIndex]
                : (selectedReport.errorNames && selectedReport.errorNames[lightboxIndex])
                  ? selectedReport.errorNames[lightboxIndex]
                  : selectedReport.errorName;
              return lbDefect ? (
                <div className="text-xs font-mono font-bold text-white bg-black/75 px-3.5 py-1 rounded-full border border-white/20 backdrop-blur">
                  Ghi chú lỗi: {lbDefect}
                </div>
              ) : null;
            })()}
            <div className="flex flex-wrap items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setZaloReport(selectedReport)}
                className="flex items-center gap-1.5 px-4 py-2.5 bg-[#0068FF] hover:bg-[#0055d4] text-white font-bold text-xs rounded-full shadow-lg transition-all hover:scale-105 cursor-pointer border-none"
                title="Chia sẻ báo cáo chất lượng và ảnh này sang Zalo"
              >
                <ZaloIcon className="h-4 w-4" />
                <span>CHIA SẺ SANG ZALO</span>
              </button>

              <a 
                href={selectedReport.imageUrls[lightboxIndex]} 
                target="_blank" 
                rel="noreferrer noopener"
                className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-full shadow-lg transition-all hover:scale-105 border border-white/20"
              >
                <ExternalLink className="h-4 w-4" />
                Mở ảnh gốc trên Google Drive
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Comprehensive Edit Report Modal (Exact Form Experience as QC Creation) */}
      {isEditing && selectedReport && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 md:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div 
            className="bg-slate-100 rounded-xl shadow-2xl border border-slate-300 w-full max-w-6xl max-h-[96vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-900 border-b border-slate-800 text-white p-3.5 sm:p-4 shrink-0 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-lg bg-blue-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Pencil className="h-5 w-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm sm:text-base font-bold font-mono uppercase tracking-wide">
                      Chỉnh Sửa Toàn Diện Báo Cáo QC
                    </h3>
                    {selectedReport.isLocalOnly ? (
                      <span className="text-[10px] font-mono font-bold text-amber-300 bg-amber-950/70 px-2 py-0.5 rounded border border-amber-600/50 flex items-center gap-1">
                        <CloudOff className="h-3 w-3" /> LƯU TẠM
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono font-bold text-emerald-300 bg-emerald-950/70 px-2 py-0.5 rounded border border-emerald-600/50 flex items-center gap-1">
                        <CheckCircle className="h-3 w-3" /> TRỰC TUYẾN
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Mã báo cáo: <span className="text-slate-300">{selectedReport.id}</span>
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (!isSavingEdit) {
                    setIsEditing(false);
                    setAdminActionError('');
                  }
                }}
                disabled={isSavingEdit}
                className="p-1.5 sm:px-3 sm:py-1.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 rounded-lg text-xs font-mono font-bold cursor-pointer border border-slate-700 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                title="Đóng cửa sổ chỉnh sửa"
              >
                <X className="h-4 w-4" />
                <span className="hidden sm:inline">Đóng / Hủy</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 md:p-6 space-y-4">
              {/* Error Alert */}
              {adminActionError && (
                <div className="rounded-lg bg-red-50 p-3.5 border border-red-200 text-xs text-red-900 font-semibold leading-relaxed flex items-start gap-2.5 shadow-xs animate-in fade-in duration-200">
                  <AlertCircle className="h-4.5 w-4.5 text-red-600 shrink-0 mt-0.5" />
                  <span>{adminActionError}</span>
                </div>
              )}

              {/* 2-Column Grid Layout identical to QCForm */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                
                {/* CỘT 1 (lg:col-span-7): THÔNG TIN BIÊN BẢN */}
                <section className="lg:col-span-7 bg-white rounded-lg border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col gap-4">
                  <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-blue-600 text-white font-mono text-xs flex items-center justify-center font-bold">01</span>
                      <h4 className="m-0 text-xs sm:text-sm font-bold text-slate-900 font-mono uppercase tracking-wider">Thông Tin Biên Bản (Chỉnh Sửa)</h4>
                    </div>
                    <span className="text-[11px] font-mono text-blue-800 font-bold bg-blue-50 px-2 py-0.5 rounded border border-blue-200">
                      QUY TRÌNH CHUẨN
                    </span>
                  </div>

                  {/* Hàng 1: Ngày kiểm & Bộ vị */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                        <Calendar className="h-3 w-3 text-slate-500" />
                        <span>Ngày Kiểm <span className="text-red-500">*</span></span>
                      </label>
                      <input 
                        type="date" 
                        required 
                        value={editDate} 
                        onChange={e => setEditDate(e.target.value)}
                        className="h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-mono font-bold text-slate-900 text-sm cursor-pointer"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                        <Layers className="h-3 w-3 text-slate-500" />
                        <span>Bộ Vị <span className="text-red-500">*</span></span>
                      </label>
                      <select
                        value={editPart}
                        onChange={(e) => handleEditPartChange(e.target.value)}
                        className="h-11 sm:h-10 px-3 bg-orange-50/60 border border-orange-300 rounded focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-bold text-slate-900 text-sm w-full truncate cursor-pointer"
                      >
                        <option value="ĐẾ THÔ">ĐẾ THÔ</option>
                        <option value="ĐẾ PHUN SƠN">ĐẾ PHUN SƠN</option>
                        <option value="MẶT GIÀY">MẶT GIÀY</option>
                      </select>
                    </div>
                  </div>

                  {/* Thành phần nhỏ / Chi tiết bộ vị */}
                  <div className="flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                        Thành phần nhỏ <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {editSubPart ? `Đang chọn: ${editSubPart}` : 'Bắt buộc'}
                      </span>
                    </div>
                    <select
                      value={editSubPartOption}
                      onChange={e => {
                        const val = e.target.value;
                        setEditSubPartOption(val);
                        if (val !== 'CUSTOM' && val !== '') {
                          setEditSubPart(val);
                        } else if (val === 'CUSTOM') {
                          setEditSubPart('');
                        }
                      }}
                      className="w-full h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-bold text-slate-900 text-sm cursor-pointer"
                    >
                      <option value="" disabled>-- Chọn thành phần nhỏ * --</option>
                      {editConfig.subParts.map(sp => (
                        <option key={sp} value={sp}>{sp}</option>
                      ))}
                      <option value="CUSTOM">➕ Tự nhập thành phần khác...</option>
                    </select>

                    {editSubPartOption === 'CUSTOM' && (
                      <input
                        type="text"
                        required
                        placeholder="Nhập tên thành phần nhỏ cụ thể (VD: Gót đế, Sơn viền, Lưỡi gà...)..."
                        value={editSubPart}
                        onChange={e => setEditSubPart(e.target.value)}
                        className="h-11 sm:h-10 px-3 bg-orange-50/50 border border-orange-300 rounded focus:bg-white focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all font-bold text-slate-900 text-sm mt-1"
                      />
                    )}

                    {/* Quick select chips for subParts */}
                    {editConfig.subParts.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                        <span className="text-[10px] text-slate-400 font-mono uppercase shrink-0">GỢI Ý:</span>
                        {editConfig.subParts.slice(0, 6).map(sp => (
                          <button
                            key={sp}
                            type="button"
                            onClick={() => { setEditSubPartOption(sp); setEditSubPart(sp); }}
                            className={`text-xs font-semibold px-2.5 py-1 rounded border whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                              editSubPart === sp 
                                ? 'bg-blue-600 text-white border-blue-600 font-bold' 
                                : 'bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border-slate-200'
                            }`}
                          >
                            {sp}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Lầu / Khu vực & Đơn hàng PO */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {/* Lầu / Khu vực */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                        <MapPin className="h-3 w-3 text-slate-500" />
                        <span>Lầu / Khu vực <span className="text-red-500">*</span></span>
                      </label>
                      <select
                        value={editFloorOption}
                        onChange={e => {
                          const val = e.target.value;
                          setEditFloorOption(val);
                          if (val !== 'CUSTOM' && val !== '') {
                            setEditFloor(val);
                          } else if (val === 'CUSTOM') {
                            setEditFloor('');
                          }
                        }}
                        className="h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-bold text-slate-900 text-sm cursor-pointer"
                      >
                        <option value="" disabled>-- Chọn lầu * --</option>
                        {editConfig.floors.map((fOpt) => (
                          <option key={fOpt} value={fOpt}>{fOpt}</option>
                        ))}
                        <option value="CUSTOM">➕ Tự viết / Thêm lầu mới...</option>
                      </select>
                      
                      {editFloorOption === 'CUSTOM' && (
                        <input
                          type="text"
                          required
                          placeholder="Nhập tên lầu mới..."
                          value={editFloor}
                          onChange={e => setEditFloor(e.target.value.toUpperCase())}
                          className="mt-1 h-10 px-3 bg-orange-50/50 border border-orange-300 rounded focus:bg-white focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all font-bold text-slate-900 text-sm"
                        />
                      )}
                    </div>

                    {/* Đơn hàng PO */}
                    <div className="flex flex-col gap-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                          Đơn hàng PO <span className="text-red-500">*</span>
                        </label>
                        <label 
                          className={`flex items-center gap-1 cursor-pointer px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border ${
                            editIsNoPo 
                              ? 'bg-red-50 text-red-700 border-red-200' 
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          <input 
                            type="checkbox" 
                            checked={editIsNoPo}
                            onChange={e => {
                              const checked = e.target.checked;
                              setEditIsNoPo(checked);
                              if (checked) {
                                setEditOrder('KHÔNG');
                              } else {
                                setEditOrder('');
                              }
                            }}
                            className="h-3.5 w-3.5 rounded text-red-600 focus:ring-red-500 border-slate-300 cursor-pointer"
                          />
                          <span>Không PO</span>
                        </label>
                      </div>
                      <input 
                        type="text" 
                        required={!editIsNoPo}
                        disabled={editIsNoPo}
                        inputMode={editIsNoPo ? undefined : "numeric"}
                        placeholder={editIsNoPo ? "KHÔNG CÓ PO" : "Số PO (VD: 123456) *"} 
                        value={editOrder} 
                        onChange={handleEditOrderChange}
                        className={`h-11 sm:h-10 px-3 border rounded outline-none transition-all font-mono font-bold text-sm ${
                          editIsNoPo 
                            ? 'bg-slate-100 border-slate-200 text-slate-500 italic cursor-not-allowed' 
                            : 'bg-white border-slate-300 hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 text-slate-900'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Hình thể / Mã màu & Xưởng cung ứng */}
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {/* Quy tắc: Đế thô/ phun sơn -> CHỈ HIỆN HÌNH THỂ. Mặt giày -> CHỈ HIỆN MÃ MÀU */}
                    {(() => {
                      const isSole = getPartType(editPart, editSubPart) === 'sole';
                      if (isSole) {
                        return (
                          <div className="flex flex-col gap-1.5 relative">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                                <Box className="h-3 w-3 text-blue-600" />
                                <span>Hình thể <span className="text-red-500">*</span></span>
                              </label>
                              <span className="text-[10px] text-blue-700 font-mono font-semibold">
                                [ĐẾ]
                              </span>
                            </div>
                            <div className="relative">
                              <input
                                type="text"
                                required
                                value={editShoeModel}
                                onChange={e => {
                                  const val = e.target.value.toUpperCase();
                                  setEditShoeModel(val);
                                  setEditColorCode('');
                                }}
                                onFocus={() => setEditShowModelDropdown(true)}
                                placeholder="NHẬP HÌNH THỂ (VD: FCXV5) *"
                                className="w-full h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-mono font-bold text-slate-900 text-sm uppercase pr-8"
                              />
                              <button
                                type="button"
                                onClick={() => setEditShowModelDropdown(!editShowModelDropdown)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                title="Mở danh sách hình thể"
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform ${editShowModelDropdown ? 'rotate-180' : ''}`} />
                              </button>
                            </div>

                            {/* Dropdown list of models */}
                            {editShowModelDropdown && (
                              <>
                                <div className="fixed inset-0 z-30" onClick={() => setEditShowModelDropdown(false)} />
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-40 p-2 space-y-1.5">
                                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                                    <span className="text-[10px] font-bold font-mono text-slate-700 uppercase">
                                      DANH SÁCH HÌNH THỂ {editSupplier ? `(${editSupplier})` : ''}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setEditShowModelDropdown(false)}
                                      className="text-[10px] text-slate-400 hover:text-slate-700 font-mono font-bold cursor-pointer"
                                    >
                                      ĐÓNG ✕
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={editModelFilterQuery}
                                    onChange={e => setEditModelFilterQuery(e.target.value)}
                                    placeholder="Lọc nhanh (VD: FCXV5)..."
                                    className="w-full p-2 text-xs font-mono font-semibold border border-slate-200 rounded outline-none focus:ring-1 focus:ring-blue-600 bg-slate-50 uppercase"
                                    autoFocus
                                  />
                                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                                    {editAvailableModels
                                      .filter(m => !editModelFilterQuery.trim() || m.toLowerCase().includes(editModelFilterQuery.toLowerCase()))
                                      .map(m => (
                                        <button
                                          key={m}
                                          type="button"
                                          onClick={() => selectEditModel(m)}
                                          className={`w-full text-left p-2 rounded text-xs font-mono font-bold flex items-center justify-between hover:bg-blue-50 transition-colors cursor-pointer ${editShoeModel === m ? 'text-blue-700 bg-blue-50 font-extrabold' : 'text-slate-800'}`}
                                        >
                                          <span>{m}</span>
                                          {editShoeModel === m && <Check className="h-3.5 w-3.5 text-blue-600" />}
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      } else {
                        return (
                          <div className="flex flex-col gap-1.5 relative">
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                                <Sparkles className="h-3 w-3 text-emerald-600" />
                                <span>Mã màu <span className="text-red-500">*</span></span>
                              </label>
                              <span className="text-[10px] text-emerald-700 font-mono font-semibold">
                                [MẶT GIÀY]
                              </span>
                            </div>
                            <div className="relative">
                              <input 
                                type="text" 
                                required 
                                placeholder="NHẬP MÃ MÀU (VD: MFCXVLI5) *" 
                                value={editColorCode} 
                                onChange={e => {
                                  const val = e.target.value.toUpperCase();
                                  setEditColorCode(val);
                                  setEditShoeModel('');
                                }}
                                onFocus={() => setEditShowColorDropdown(true)}
                                className="w-full h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all font-mono font-bold text-slate-900 uppercase text-sm pr-8" 
                              />
                              <button
                                type="button"
                                onClick={() => setEditShowColorDropdown(!editShowColorDropdown)}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                                title="Mở danh sách mã màu"
                              >
                                <ChevronDown className={`h-4 w-4 transition-transform ${editShowColorDropdown ? 'rotate-180' : ''}`} />
                              </button>
                            </div>

                            {/* Dropdown list for NHẬP MÃ MÀU */}
                            {editShowColorDropdown && (
                              <>
                                <div className="fixed inset-0 z-30" onClick={() => setEditShowColorDropdown(false)} />
                                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded-lg shadow-xl z-40 p-2 space-y-1.5">
                                  <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                                    <span className="text-[10px] font-bold font-mono text-emerald-800 uppercase">
                                      DANH SÁCH MÃ MÀU MẶT GIÀY
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => setEditShowColorDropdown(false)}
                                      className="text-[10px] text-slate-400 hover:text-slate-700 font-mono font-bold cursor-pointer"
                                    >
                                      ĐÓNG ✕
                                    </button>
                                  </div>
                                  <input
                                    type="text"
                                    value={editColorFilterQuery}
                                    onChange={e => setEditColorFilterQuery(e.target.value)}
                                    placeholder="Lọc nhanh (VD: MFCXVLI5)..."
                                    className="w-full p-2 text-xs font-mono font-semibold border border-slate-200 rounded outline-none focus:ring-1 focus:ring-emerald-600 bg-slate-50 uppercase"
                                    autoFocus
                                  />
                                  <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                                    {editAvailableColors
                                      .filter(item => !editColorFilterQuery.trim() || item.toLowerCase().includes(editColorFilterQuery.toLowerCase()))
                                      .map(item => (
                                        <button
                                          key={item}
                                          type="button"
                                          onClick={() => selectEditColor(item)}
                                          className={`w-full text-left p-2 rounded text-xs font-mono font-bold flex items-center justify-between hover:bg-emerald-50 transition-colors cursor-pointer ${editColorCode === item ? 'text-emerald-700 bg-emerald-50 font-extrabold' : 'text-slate-800'}`}
                                        >
                                          <span>{item}</span>
                                          {editColorCode === item && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                                        </button>
                                      ))}
                                  </div>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      }
                    })()}

                    {/* Xưởng cung ứng */}
                    <div className="flex flex-col gap-1.5">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
                        <Factory className="h-3 w-3 text-slate-500" />
                        <span>Xưởng cung ứng <span className="text-red-500">*</span></span>
                      </label>
                      <select
                        value={editSupplierOption}
                        onChange={e => {
                          const val = e.target.value;
                          setEditSupplierOption(val);
                          if (val !== 'CUSTOM' && val !== '') {
                            setEditSupplier(val);
                          } else if (val === 'CUSTOM') {
                            setEditSupplier('');
                          }
                        }}
                        className="h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-bold text-slate-900 text-sm cursor-pointer"
                      >
                        <option value="" disabled>-- Chọn xưởng * --</option>
                        {editConfig.suppliers.map((supplierName) => (
                          <option key={supplierName} value={supplierName}>{supplierName}</option>
                        ))}
                        <option value="CUSTOM">➕ Tự viết / Thêm xưởng mới...</option>
                      </select>
                      
                      {editSupplierOption === 'CUSTOM' && (
                        <input
                          type="text"
                          required
                          placeholder="Nhập tên xưởng mới..."
                          value={editSupplier}
                          onChange={e => setEditSupplier(e.target.value.toUpperCase())}
                          className="mt-1 h-10 px-3 bg-orange-50/50 border border-orange-300 rounded focus:bg-white focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all font-bold text-slate-900 text-sm"
                        />
                      )}
                    </div>
                  </div>

                  {/* Loại lỗi kỹ thuật: Multi-select & Add new */}
                  <div className="flex flex-col gap-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                        Loại lỗi kỹ thuật <span className="text-red-500">*</span>
                      </label>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {editSelectedErrors.length > 0 ? (
                          <span className="text-red-700 font-bold bg-red-50 border border-red-200 px-1.5 py-0.2 rounded">
                            Đã chọn: {editSelectedErrors.length} lỗi
                          </span>
                        ) : (
                          'Có thể chọn nhiều lỗi'
                        )}
                      </span>
                    </div>

                    {/* Selected Badges */}
                    {editSelectedErrors.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded">
                        {editSelectedErrors.map((err) => {
                          const count = editPhotos.filter(p => p.errorName === err).length;
                          return (
                            <span
                              key={err}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-50 text-red-800 border border-red-200 rounded text-xs font-bold font-mono"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 shrink-0"></span>
                              <span>{err}</span>
                              <span className="text-[10px] bg-red-100 text-red-700 px-1 rounded font-normal" title={`${count} ảnh gán cho lỗi này`}>
                                {count} ảnh
                              </span>
                              <button
                                type="button"
                                onClick={() => triggerEditUploadForError(err, 'camera')}
                                className="inline-flex items-center gap-0.5 text-[10px] bg-red-200/80 hover:bg-red-300 text-red-900 px-1 py-0.5 rounded cursor-pointer transition-colors ml-0.5"
                                title={`Chụp/tải ảnh riêng cho lỗi "${err}"`}
                              >
                                <Camera className="h-2.5 w-2.5" />
                                <span>+Ảnh</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEditToggleError(err)}
                                className="text-red-400 hover:text-red-700 ml-1 font-bold cursor-pointer"
                                title="Bỏ chọn lỗi này"
                              >
                                ✕
                              </button>
                            </span>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setEditSelectedErrors([])}
                          className="text-[10px] text-slate-400 hover:text-red-600 font-mono ml-auto self-center cursor-pointer underline"
                        >
                          Xóa hết
                        </button>
                      </div>
                    )}

                    <select
                      value={editErrorOption}
                      onChange={e => {
                        const val = e.target.value;
                        if (val === 'CUSTOM') {
                          setEditErrorOption('CUSTOM');
                        } else if (val) {
                          handleEditAddError(val);
                          setEditErrorOption('');
                        }
                      }}
                      className="h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm cursor-pointer"
                    >
                      <option value="">
                        {editSelectedErrors.length > 0 ? '+ Chọn thêm lỗi khác vào báo cáo...' : '-- Chọn loại lỗi đang bị * --'}
                      </option>
                      {editConfig.errors.map((eName) => {
                        const isPicked = editSelectedErrors.includes(eName);
                        return (
                          <option key={eName} value={eName} disabled={isPicked}>
                            {isPicked ? `✓ ${eName} (Đã thêm)` : eName}
                          </option>
                        );
                      })}
                      <option value="CUSTOM">➕ Tự viết / Thêm tên lỗi mới...</option>
                    </select>

                    {editErrorOption === 'CUSTOM' && (
                      <div className="flex gap-2 mt-1">
                        <input
                          type="text"
                          placeholder="Nhập chi tiết tên lỗi kỹ thuật mới..."
                          value={editCustomErrorInput}
                          onChange={e => setEditCustomErrorInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (editCustomErrorInput.trim()) {
                                handleEditAddError(editCustomErrorInput.trim());
                                setEditCustomErrorInput('');
                                setEditErrorOption('');
                              }
                            }
                          }}
                          className="flex-1 h-11 sm:h-10 px-3 border border-blue-400 rounded focus:ring-1 focus:ring-blue-600 outline-none transition-all font-semibold bg-blue-50/20 text-slate-900 text-sm"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (editCustomErrorInput.trim()) {
                              handleEditAddError(editCustomErrorInput.trim());
                              setEditCustomErrorInput('');
                              setEditErrorOption('');
                            }
                          }}
                          className="px-3 bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-xs rounded cursor-pointer shrink-0"
                        >
                          + THÊM LỖI
                        </button>
                      </div>
                    )}

                    {/* Quick chips for rapid error toggle */}
                    {editConfig.errors.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                        <span className="text-[10px] text-slate-400 font-mono uppercase shrink-0">CHỌN NHANH:</span>
                        {editConfig.errors.slice(0, 8).map(eName => {
                          const isSelected = editSelectedErrors.includes(eName);
                          return (
                            <button
                              key={eName}
                              type="button"
                              onClick={() => handleEditToggleError(eName)}
                              className={`text-xs font-semibold px-2 py-0.5 rounded border whitespace-nowrap transition-colors cursor-pointer shrink-0 ${
                                isSelected 
                                  ? 'bg-red-50 text-red-700 border-red-300 font-bold' 
                                  : 'bg-slate-100 hover:bg-blue-50 hover:text-blue-700 text-slate-700 border-slate-200'
                              }`}
                            >
                              {isSelected ? `✓ ${eName}` : eName}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Ghi chú kiểm tra */}
                  <div className="flex flex-col gap-1.5 text-xs">
                    <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                      Ghi chú kiểm tra (Tùy chọn)
                    </label>
                    <textarea
                      placeholder="Mô tả cụ thể vị trí lỗi, mức độ hoặc lưu ý xử lý nếu có..."
                      value={editNote}
                      onChange={e => setEditNote(e.target.value)}
                      rows={2}
                      className="p-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all text-slate-900 text-sm resize-y min-h-[70px]"
                    />
                  </div>
                </section>

                {/* CỘT 2 (lg:col-span-5): MINH CHỨNG HÌNH ẢNH */}
                <section className="lg:col-span-5 bg-white rounded-lg border border-slate-200 shadow-xs p-4 sm:p-5 flex flex-col gap-4">
                  <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-5 h-5 rounded bg-slate-900 text-white font-mono text-xs flex items-center justify-center font-bold">02</span>
                      <h4 className="m-0 text-xs sm:text-sm font-bold text-slate-900 font-mono uppercase tracking-wider">Minh Chứng Hình Ảnh Lỗi</h4>
                    </div>
                    <span className="text-[11px] font-mono text-slate-600 font-bold bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {editPhotos.length} ẢNH
                    </span>
                  </div>

                  {/* Bộ chọn / Tải ảnh riêng biệt cho từng lỗi */}
                  {editSelectedErrors.length > 1 && (
                    <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg flex flex-col gap-1.5 shrink-0">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-mono font-bold text-slate-700 uppercase flex items-center gap-1">
                          <Filter className="h-3 w-3 text-blue-600" />
                          Gán ảnh cho lỗi:
                        </span>
                        {editTargetUploadError && (
                          <button
                            type="button"
                            onClick={() => setEditTargetUploadError('')}
                            className="text-[10px] text-slate-400 hover:text-slate-600 underline font-mono cursor-pointer"
                          >
                            Mặc định
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditTargetUploadError('')}
                          className={`px-2 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer ${
                            !editTargetUploadError
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          Tất cả ({editPhotos.length})
                        </button>
                        {editSelectedErrors.map(err => {
                          const count = editPhotos.filter(p => p.errorName === err).length;
                          const isActive = editTargetUploadError === err;
                          return (
                            <button
                              key={err}
                              type="button"
                              onClick={() => setEditTargetUploadError(err)}
                              className={`px-2 py-1 rounded text-xs font-mono font-bold transition-all cursor-pointer flex items-center gap-1 ${
                                isActive
                                  ? 'bg-red-600 text-white shadow-2xs'
                                  : 'bg-white text-red-800 border border-red-200 hover:bg-red-50'
                              }`}
                            >
                              <span>{err}</span>
                              <span className={`text-[10px] px-1 rounded-full font-bold ${isActive ? 'bg-red-700 text-white' : 'bg-red-100 text-red-700'}`}>
                                {count}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {editTargetUploadError && (
                        <div className="text-[11px] text-red-700 font-mono flex items-center gap-1 pt-0.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                          Ảnh chụp/tải tiếp theo sẽ gán cho lỗi: <strong className="underline">{editTargetUploadError}</strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Nút chụp camera & Chọn file từ máy */}
                  <div className="grid grid-cols-2 gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => editCameraInputRef.current?.click()}
                      className="h-11 sm:h-10 px-3 bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-mono font-bold text-xs uppercase tracking-wider rounded border border-slate-800 flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                    >
                      <Camera className="h-4 w-4 text-blue-400" />
                      <span>Chụp Camera</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => editFileInputRef.current?.click()}
                      className="h-11 sm:h-10 px-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-mono font-bold text-xs uppercase tracking-wider rounded border border-slate-300 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                    >
                      <ImageIcon className="h-4 w-4 text-slate-600" />
                      <span>Chọn Từ Máy</span>
                    </button>

                    {/* Hidden Inputs */}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      className="hidden"
                      onChange={handleEditFileChange}
                      ref={editCameraInputRef}
                    />
                    <input
                      type="file"
                      multiple
                      accept="image/*"
                      className="hidden"
                      onChange={handleEditFileChange}
                      ref={editFileInputRef}
                    />
                  </div>

                  {/* Kéo thả ảnh Drop Zone */}
                  <div
                    onClick={() => editFileInputRef.current?.click()}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={handleEditDropFiles}
                    className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/20 cursor-pointer rounded p-4 text-center transition-all shrink-0 select-none"
                  >
                    <div className="flex flex-col items-center justify-center space-y-1">
                      <UploadCloud className="h-6 w-6 text-slate-400" />
                      <div className="font-bold text-xs tracking-wider text-slate-700 uppercase font-mono">
                        Kéo thả ảnh hoặc nhấn để tải thêm
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono">
                        {editTargetUploadError ? `Đang gán cho lỗi: ${editTargetUploadError} • ` : ''}Tự động nén HD tối ưu băng thông
                      </div>
                    </div>
                  </div>

                  {/* Thumbnail cards preview grid */}
                  {editPhotos.length > 0 ? (
                    <div className="overflow-y-auto min-h-[160px] max-h-[320px] pr-1">
                      <div className="grid grid-cols-2 gap-2.5">
                        {editPhotos.map((item, index) => (
                          <div 
                            key={item.id}
                            className="relative bg-slate-900 border border-slate-200 rounded overflow-hidden shadow-xs flex flex-col group"
                          >
                            <div className="relative aspect-4/3 w-full bg-slate-950 flex items-center justify-center overflow-hidden">
                              {item.isNew ? (
                                <img 
                                  src={item.previewUrl} 
                                  alt="Preview" 
                                  className="w-full h-full object-cover" 
                                />
                              ) : item.previewUrl.startsWith('data:image') ? (
                                <img 
                                  src={item.previewUrl} 
                                  alt="Preview" 
                                  className="w-full h-full object-cover" 
                                />
                              ) : (
                                <DriveImage 
                                  url={item.previewUrl} 
                                  token={token} 
                                  className="w-full h-full object-cover" 
                                  alt={`Ảnh ${index + 1}`} 
                                />
                              )}

                              {/* Index badge */}
                              <div className="absolute top-1.5 left-1.5 bg-black/75 backdrop-blur-xs text-white font-mono text-[10px] px-1.5 py-0.5 rounded font-bold pointer-events-none">
                                #{index + 1}
                              </div>

                              {/* Status badge: new vs existing */}
                              <div className="absolute bottom-1.5 left-1.5 pointer-events-none">
                                {item.isNew ? (
                                  <span className="text-[9px] font-mono font-bold bg-amber-500 text-black px-1.5 py-0.5 rounded shadow">
                                    ẢNH MỚI
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-mono font-bold bg-slate-800/90 text-slate-300 border border-white/20 px-1.5 py-0.5 rounded shadow">
                                    ẢNH GỐC
                                  </span>
                                )}
                              </div>

                              {/* Delete button */}
                              <button
                                type="button"
                                onClick={() => handleEditRemovePhoto(item.id)}
                                className="absolute top-1.5 right-1.5 bg-red-600/90 hover:bg-red-700 text-white rounded p-1 shadow cursor-pointer border-none flex items-center justify-center z-10 transition-colors"
                                title="Xóa ảnh này"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>

                            {/* Tag assigned error dropdown footer */}
                            <div className="p-2 bg-slate-900 border-t border-slate-800 flex flex-col gap-1 text-left">
                              <div className="flex items-center justify-between gap-1">
                                <span className="text-[10px] font-mono font-bold text-red-400 uppercase flex items-center gap-1 shrink-0">
                                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
                                  Lỗi:
                                </span>
                                {editSelectedErrors.length > 0 ? (
                                  <select
                                    value={item.errorName}
                                    onChange={e => handleEditChangePhotoError(item.id, e.target.value)}
                                    className="text-[11px] font-mono font-bold bg-slate-800 text-amber-300 border border-slate-700 hover:border-amber-400 rounded px-1.5 py-0.5 outline-none cursor-pointer truncate max-w-[145px] transition-colors"
                                    title="Đổi loại lỗi riêng cho hình ảnh này"
                                  >
                                    {editSelectedErrors.map(err => (
                                      <option key={err} value={err}>
                                        {err}
                                      </option>
                                    ))}
                                    {!editSelectedErrors.includes(item.errorName) && (
                                      <option value={item.errorName}>
                                        {item.errorName}
                                      </option>
                                    )}
                                  </select>
                                ) : (
                                  <span className="text-[11px] font-mono font-bold text-amber-300 truncate" title={item.errorName}>
                                    {item.errorName || 'Lỗi chung'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center text-slate-400 border border-dashed border-slate-300 rounded bg-slate-50">
                      <ImageIcon className="h-8 w-8 text-slate-300 mb-1" />
                      <span className="text-xs font-mono font-bold text-slate-600">Chưa có ảnh nào được đính kèm</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">Yêu cầu tối thiểu 1 ảnh minh chứng lỗi để lưu</span>
                    </div>
                  )}
                </section>
              </div>
            </div>

            {/* Modal Footer / Progress & Action Buttons */}
            <div className="bg-white border-t border-slate-200 p-3.5 sm:p-4 shrink-0 flex flex-col gap-3 shadow-xs">
              {/* Progress bar during save */}
              {isSavingEdit && (
                <div className="space-y-1.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between text-xs font-mono font-bold text-blue-900">
                    <span className="flex items-center gap-1.5">
                      <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />
                      <span>{saveEditStatus || 'Đang cập nhật dữ liệu...'}</span>
                    </span>
                    <span>{saveEditProgress}%</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-200">
                    <div 
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${saveEditProgress}%` }}
                    />
                  </div>
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => {
                    if (!isSavingEdit) {
                      setIsEditing(false);
                      setAdminActionError('');
                    }
                  }}
                  disabled={isSavingEdit}
                  className="w-full sm:w-auto px-5 py-2.5 bg-white hover:bg-slate-100 active:bg-slate-200 text-slate-700 font-mono font-bold text-xs uppercase tracking-wider rounded-lg border border-slate-300 cursor-pointer transition-colors disabled:opacity-50"
                >
                  HỦY BỎ
                </button>

                <button
                  type="button"
                  onClick={handleSaveEdit}
                  disabled={isSavingEdit}
                  className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 disabled:bg-blue-400 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all border border-blue-600 disabled:cursor-not-allowed"
                >
                  {isSavingEdit ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>ĐANG LƯU DỮ LIỆU...</span>
                    </>
                  ) : (
                    <>
                      <Save className="h-4 w-4" />
                      <span>LƯU CẬP NHẬT BIÊN BẢN</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Zalo Share Modal */}
      {zaloReport && (
        <ZaloShareModal 
          report={zaloReport} 
          onClose={() => setZaloReport(null)} 
          token={token} 
        />
      )}
    </div>
  );
});
