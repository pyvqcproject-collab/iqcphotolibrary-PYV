import React, { useState, useRef, useEffect, useCallback } from 'react';
import { User } from 'firebase/auth';
import { collection, doc, setDoc, getDocs, getDoc, query, serverTimestamp } from 'firebase/firestore';
import { db } from './lib/firebase';
import { uploadFileToDrive } from './lib/drive';
import { uploadFileToStorage } from './lib/storage';
import { compressImage } from './lib/image-compression';
import { 
  LogOut, 
  UploadCloud, 
  CheckCircle, 
  Image as ImageIcon, 
  X, 
  ShieldAlert, 
  ShieldCheck, 
  Tag, 
  Layers, 
  MapPin, 
  Factory, 
  AlertCircle,
  PlusCircle,
  XCircle,
  History,
  Settings,
  Loader2,
  FileText,
  Lock
} from 'lucide-react';
import { format } from 'date-fns';
import { QCHistory } from './components/QCHistory';
import { AdminPanel, QCUser, POMapping, sanitizeMap } from './components/AdminPanel';

interface ImagePreviewProps {
  file: File;
  index: number;
}

function ImagePreview({ file, index }: ImagePreviewProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) return;
    
    let objectUrl: string | null = null;
    if (file.type.startsWith('image/')) {
      objectUrl = URL.createObjectURL(file);
      setPreviewUrl(objectUrl);
    }

    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [file]);

  if (!previewUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-2 bg-slate-100">
        <ImageIcon className="h-5 w-5 text-slate-400 mb-1" />
        <span className="text-[10px] text-slate-500 text-center line-clamp-2 break-all px-1 font-bold">
          [Ảnh {index + 1}]<br />{file.name}
        </span>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full h-full relative overflow-hidden bg-slate-950 flex items-center justify-center">
      <img
        src={previewUrl}
        alt={file.name}
        referrerPolicy="no-referrer"
        className="w-full h-full object-cover select-none"
      />
      <div className="absolute inset-x-0 bottom-0 bg-black/60 p-1.5 backdrop-blur-3xs text-center">
        <p className="text-[9px] text-white truncate px-1 font-bold" title={file.name}>
          [Ảnh {index + 1}]<br />{file.name}
        </p>
      </div>
    </div>
  );
}

interface QCFormProps {
  user: User;
  token: string;
  onLogout: () => void;
}

export function QCForm({ user, token, onLogout }: QCFormProps) {
  const [activeTab, setActiveTab] = useState<'create' | 'history' | 'admin'>('create');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [floor, setFloor] = useState('');
  const [order, setOrder] = useState('');
  const [colorCode, setColorCode] = useState('');
  const [errorName, setErrorName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  
  // Custom states added for requested enhancements
  const [userProfile, setUserProfile] = useState<QCUser | null>(null);
  const [poMappings, setPoMappings] = useState<POMapping[]>([]);
  const [floorOption, setFloorOption] = useState('');
  const [supplierOption, setSupplierOption] = useState('');
  const [errorOption, setErrorOption] = useState('');
  const [customErrorInput, setCustomErrorInput] = useState('');

  const [isSearchingColor, setIsSearchingColor] = useState(false);

  const [success, setSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [error, setError] = useState('');
  const [isUnauthorized, setIsUnauthorized] = useState(false);

  interface BackgroundTask {
    id: string;
    title: string;
    progress: number;
    status: 'uploading' | 'success' | 'success_local' | 'error';
    error?: string;
  }
  const [backgroundTasks, setBackgroundTasks] = useState<BackgroundTask[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Standard predefined floor list (Fallback)
  const [defaultFloors, setDefaultFloors] = useState<string[]>(['K63A', 'K63B', 'K73A', 'K73B']);

  // Predefined error types dropdown
  const [errorOptions, setErrorOptions] = useState<string[]>(['Vệ sinh', 'Quy cách', 'Kỹ thuật', 'Khác']);

  // Supplier Options list (Xưởng cung ứng dropdown)
  const [supplierOptions, setSupplierOptions] = useState<string[]>(['JIA HOA', 'VĨNH TÀI', 'NỘI BỘ', 'KHÁC']);

  const floorOptions = userProfile?.role === 'admin' 
    ? defaultFloors 
    : (userProfile?.permittedFloors && userProfile.permittedFloors.length > 0
        ? userProfile.permittedFloors
        : defaultFloors);

  // Store global mappings from db
  const [globalMappingsMap, setGlobalMappingsMap] = useState<Record<string, string>>({});

  // Admin capability check
  const isAdmin = userProfile?.role === 'admin' || (user.email || '').toLowerCase() === 'pyvqcproject@gmail.com' || (user.email || '').toLowerCase().includes('admin');

  const updatePartConfig = (partKey: string, fullConfigFromStorage: any) => {
    let targetPartConfig = fullConfigFromStorage; // fallback
    if (partKey === 'MẶT GIÀY') {
      targetPartConfig = fullConfigFromStorage['matgiay'] || fullConfigFromStorage;
    } else if (partKey === 'ĐẾ' || fullConfigFromStorage['de']) {
      targetPartConfig = fullConfigFromStorage['de'] || fullConfigFromStorage;
    }

    if (targetPartConfig.floors && Array.isArray(targetPartConfig.floors)) {
      setDefaultFloors(targetPartConfig.floors);
      // Reset floor if the new list doesn't include the current floor, otherwise keep it
      if (floor && !targetPartConfig.floors.includes(floor)) {
        setFloorOption('');
        setFloor('');
      }
    }
    if (targetPartConfig.errors && Array.isArray(targetPartConfig.errors)) setErrorOptions(targetPartConfig.errors);
    if (targetPartConfig.suppliers && Array.isArray(targetPartConfig.suppliers)) setSupplierOptions(targetPartConfig.suppliers);
  };

  const handleAdminPartChange = (newPart: string) => {
    if (!userProfile || !isAdmin) return;
    
    // Update local profile state
    const updatedProfile = { ...userProfile, part: newPart as QCUser['part'] };
    setUserProfile(updatedProfile);
    
    // Load matching config from localeStorage
    const localAppConfigStr = localStorage.getItem('local_app_config');
    if (localAppConfigStr) {
       try {
         const fullConfig = JSON.parse(localAppConfigStr);
         updatePartConfig(newPart, fullConfig);
       } catch(e) {}
    }
  };

  const handleNavigateToCreate = useCallback(() => setActiveTab('create'), []);

  // Fetch logged in user profile and PO mappings
  const loadConfiguration = useCallback(async () => {
    if (!user.email) return;

    const emailKey = user.email.toLowerCase();

    // -- FAST INITIAL RENDER FROM LOCAL CACHE --
    try {
       const localUsersStr = localStorage.getItem('local_qc_users');
       if (localUsersStr) {
          const localUsers = JSON.parse(localUsersStr);
          const cachedUser = Array.isArray(localUsers) ? localUsers.find(u => u.email.toLowerCase() === emailKey) : null;
          if (cachedUser) {
             setUserProfile(cachedUser);
          } else if (emailKey === 'pyvqcproject@gmail.com') {
             setUserProfile({
                email: 'pyvqcproject@gmail.com', name: 'Admin', employeeId: 'ADMIN-01', floorGroup: 'K73F', permittedFloors: ['K73A', 'K73B', 'K73C', 'K73D'], role: 'admin', part: ''
             });
          }
       } else if (emailKey === 'pyvqcproject@gmail.com') {
          setUserProfile({ email: 'pyvqcproject@gmail.com', name: 'Admin', employeeId: 'ADMIN-01', floorGroup: 'K73F', permittedFloors: ['K73A', 'K73B', 'K73C', 'K73D'], role: 'admin', part: ''});
       }
       
       const localMapStr = localStorage.getItem('local_po_color_mappings');
       if (localMapStr) {
          setGlobalMappingsMap(JSON.parse(localMapStr));
       }

       const localAppConfigStr = localStorage.getItem('local_app_config');
       if (localAppConfigStr) {
          const parsedConfigOrig = JSON.parse(localAppConfigStr);
          // Detect user part from cached state
          let activePartKey = 'de';
          let localUsersForPart: any = null;
          try { localUsersForPart = JSON.parse(localStorage.getItem('local_qc_users') || "[]"); } catch(e){}
          const cachedUserForPart = Array.isArray(localUsersForPart) ? localUsersForPart.find((u: any) => u.email.toLowerCase() === emailKey) : null;
          if (cachedUserForPart && cachedUserForPart.part === 'MẶT GIÀY') {
            activePartKey = 'matgiay';
          }
          const parsed = parsedConfigOrig[activePartKey] || parsedConfigOrig;
          
          if (parsed.floors && parsed.floors.length) setDefaultFloors(parsed.floors);
          if (parsed.errors && parsed.errors.length) setErrorOptions(parsed.errors);
          if (parsed.suppliers && parsed.suppliers.length) setSupplierOptions(parsed.suppliers);
       }
    } catch (e) {
       console.warn("Failed to load local cache", e);
    }

    const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Action timeout exceeded')), ms);
      });
      promise.catch(() => {});
      timeoutPromise.catch(() => {});
      return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
    };
    
    try {
      // 1. Load user perm floors from Firestore
      const userDocRef = doc(db, 'qc_users', emailKey);
      
      const docSnapUser: any = await withTimeout(getDoc(userDocRef), 30000);
      
      let matched: QCUser | null = null;
      if (docSnapUser.exists()) {
        const d = docSnapUser.data();
        matched = {
          email: docSnapUser.id,
          name: d.name || '',
          employeeId: d.employeeId || '',
          floorGroup: d.floorGroup || '',
          permittedFloors: Array.isArray(d.permittedFloors) ? d.permittedFloors : [],
          role: d.role || 'user',
          part: d.part || ''
        };
      } else if (emailKey === 'pyvqcproject@gmail.com') {
        matched = {
          email: 'pyvqcproject@gmail.com',
          name: 'Admin',
          employeeId: 'ADMIN-01',
          floorGroup: 'K73F',
          permittedFloors: ['K73A', 'K73B', 'K73C', 'K73D'],
          role: 'admin',
          part: ''
        };
      }
      
      if (matched) {
        setUserProfile(matched);
        setIsUnauthorized(false);
        // Save/merge into local_qc_users so we can load it instantly next time on this device
        try {
          const localUsersStr = localStorage.getItem('local_qc_users');
          let localUsers: any[] = [];
          if (localUsersStr) {
            localUsers = JSON.parse(localUsersStr);
          }
          if (!Array.isArray(localUsers)) localUsers = [];
          const index = localUsers.findIndex((u: any) => u.email.toLowerCase() === emailKey);
          if (index > -1) {
            localUsers[index] = matched;
          } else {
            localUsers.push(matched);
          }
          localStorage.setItem('local_qc_users', JSON.stringify(localUsers));
        } catch (e) {
          console.warn("Failed to update local_qc_users cache:", e);
        }
      } else {
        setIsUnauthorized(true);
        return; // Dừng lại không parse data tiếp nữa
      }
      
      // 2. Load global mappings once (from chunks to support >1MB payload)
      let fullMapData: Record<string, string> = {};
      let hasData = false;

      // Base chunk
      const docRef = doc(db, 'settings', 'po_mappings_global');
      const docSnap: any = await withTimeout(getDoc(docRef), 30000);
      if (docSnap.exists() && docSnap.data().map) {
        Object.assign(fullMapData, docSnap.data().map);
        hasData = true;
      }
      
      // Parallel fetch chunks 1 to 9
      const chunkPromises = [];
      for (let i = 1; i < 10; i++) {
        const docId = `po_mappings_global_${i + 1}`;
        chunkPromises.push(withTimeout(getDoc(doc(db, 'settings', docId)), 30000).catch(() => null));
      }
      const snaps = await Promise.all(chunkPromises);
      snaps.forEach((snap: any) => {
        if (snap && snap.exists() && snap.data().map) {
           Object.assign(fullMapData, snap.data().map);
           hasData = true;
        }
      });
      
      if (hasData) {
        const sanitized = sanitizeMap(fullMapData);
        setGlobalMappingsMap(sanitized);
        localStorage.setItem('local_po_color_mappings', JSON.stringify(sanitized));
      }

      // 3. Load App Dropdown configs
      const configRef = doc(db, 'settings', 'app_config');
      const configSnap: any = await withTimeout(getDoc(configRef), 30000);
      if (configSnap.exists()) {
        const fullConfig = configSnap.data();
        let targetPartConfig = fullConfig; // original flat config fallback
        
        let userPartContext = matched?.part || '';
        if (userPartContext === 'MẶT GIÀY') {
           targetPartConfig = fullConfig['matgiay'] || fullConfig;
        } else if (userPartContext === 'ĐẾ' || fullConfig['de']) {
           targetPartConfig = fullConfig['de'] || fullConfig;
        }

        if (targetPartConfig.floors && Array.isArray(targetPartConfig.floors)) setDefaultFloors(targetPartConfig.floors);
        if (targetPartConfig.errors && Array.isArray(targetPartConfig.errors)) setErrorOptions(targetPartConfig.errors);
        if (targetPartConfig.suppliers && Array.isArray(targetPartConfig.suppliers)) setSupplierOptions(targetPartConfig.suppliers);
        
        localStorage.setItem('local_app_config', JSON.stringify(fullConfig));
      }
    } catch (err) {
      console.warn("Real-time config loading timed out/failed. Loading from client fallback memory.", err);
      
      // Fallback load user profile
      const localUsersStr = localStorage.getItem('local_qc_users');
      if (localUsersStr) {
        const localUsers = JSON.parse(localUsersStr);
        const match = localUsers.find((u: any) => u.email === emailKey);
        if (match) {
           setUserProfile(match);
           setIsUnauthorized(false);
        } else {
           setIsUnauthorized(true);
           return;
        }
      } else {
        // Fallback seed profile for admin
        if (emailKey === 'pyvqcproject@gmail.com') {
          setUserProfile({
            email: 'pyvqcproject@gmail.com',
            name: 'Admin',
            employeeId: 'ADMIN-01',
            floorGroup: 'K73F',
            permittedFloors: ['K73A', 'K73B', 'K73C', 'K73D'],
            role: 'admin',
            part: ''
          });
          setIsUnauthorized(false);
        } else {
          setUserProfile(null);
          setIsUnauthorized(true);
          return;
        }
      }

      // Fallback load global mappings
      const localMapStr = localStorage.getItem('local_po_color_mappings');
      if (localMapStr) {
        try {
          setGlobalMappingsMap(sanitizeMap(JSON.parse(localMapStr)));
        } catch (e) {
          setGlobalMappingsMap({});
        }
      } else {
        setGlobalMappingsMap({
          '111': 'Navy-01',
          '222': 'Crimson-Red',
          '333': 'Charcoal-Black',
          '12345': 'Emerald-Green-02',
          '67890': 'Sky-Blue-05',
          '77777': 'Sunny-Yellow'
        });
      }

      // Fallback load app config
      const localConfig = localStorage.getItem('local_app_config');
      if (localConfig) {
        try {
          const parsed = JSON.parse(localConfig);
          if (parsed.floors) setDefaultFloors(parsed.floors);
          if (parsed.errors) setErrorOptions(parsed.errors);
          if (parsed.suppliers) setSupplierOptions(parsed.suppliers);
        } catch(e) {}
      }
    }
  }, [user.email]);

  useEffect(() => {
    if (user.email) {
      const emailKey = user.email.toLowerCase();
      
      // 1. Preload user profile from local cache
      const localUsersStr = localStorage.getItem('local_qc_users');
      if (localUsersStr) {
        try {
          const localUsers = JSON.parse(localUsersStr);
          const match = localUsers.find((u: any) => u.email === emailKey);
          if (match) {
             setUserProfile(match);
             setIsUnauthorized(false);
          } else {
             // Let the async loadConfiguration determine if unauthorized
             // to avoid flashing error before network check
          }
        } catch (e) {}
      } else if (emailKey === 'pyvqcproject@gmail.com') {
        setUserProfile({
          email: 'pyvqcproject@gmail.com',
          name: 'Admin',
          employeeId: 'ADMIN-01',
          floorGroup: 'K73F',
          permittedFloors: ['K73A', 'K73B', 'K73C', 'K73D'],
          role: 'admin',
          part: ''
        });
        setIsUnauthorized(false);
      }

      // 2. Preload mappings from local cache
      const localMapStr = localStorage.getItem('local_po_color_mappings');
      if (localMapStr) {
        try {
          setGlobalMappingsMap(sanitizeMap(JSON.parse(localMapStr)));
        } catch (e) {}
      } else {
        setGlobalMappingsMap({
          '111': 'Navy-01',
          '222': 'Crimson-Red',
          '333': 'Charcoal-Black',
          '12345': 'Emerald-Green-02',
          '67890': 'Sky-Blue-05',
          '77777': 'Sunny-Yellow'
        });
      }

      // 3. Preload app config dropdowns from local cache
      const localConfig = localStorage.getItem('local_app_config');
      if (localConfig) {
        try {
          const parsed = JSON.parse(localConfig);
          if (parsed.floors) setDefaultFloors(parsed.floors);
          if (parsed.errors) setErrorOptions(parsed.errors);
          if (parsed.suppliers) setSupplierOptions(parsed.suppliers);
        } catch (e) {}
      }
    }

    loadConfiguration();
  }, [user.email]);

  // Adjust floor state if floor options change or exclude current selection
  useEffect(() => {
    if (floorOptions.length > 0 && !floorOptions.includes(floor)) {
      setFloor(floorOptions[0]);
    }
  }, [JSON.stringify(floorOptions)]);

  // Keep final errorName state in sync with dropdown selection or typed input
  useEffect(() => {
    if (errorOption === 'CUSTOM') {
      setErrorName(customErrorInput.trim());
    } else if (errorOption) {
      setErrorName(errorOption);
    } else {
      setErrorName('');
    }
  }, [errorOption, customErrorInput]);

  // Handle PO input change (forces numbers only + resolves matching color via useEffect API)
  const handleOrderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/[^0-9]/g, ''); // PO is strictly digits
    setOrder(numericValue);
  };

  // Find color mapping when order changes
  useEffect(() => {
    if (!order) return;
    
    // Search directly from local memory (sync loaded)
    const exactMatchColor = globalMappingsMap[order];
    if (exactMatchColor) {
      setColorCode(exactMatchColor);
    } else {
      setColorCode(''); // Clear if not found
    }
  }, [order, globalMappingsMap]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLogout = () => {
    onLogout();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!floor) {
      setError('Vui lòng chọn lầu / khu vực thực hiện.');
      return;
    }
    if (!order) {
      setError('Vui lòng nhập đơn hàng (PO) dạng số.');
      return;
    }
    if (!colorCode.trim()) {
      setError('Vui lòng nhập / cấu hình mã màu cho đơn hàng này.');
      return;
    }
    if (!supplier) {
      setError('Vui lòng chọn xưởng cung ứng.');
      return;
    }
    if (!errorName.trim()) {
      setError('Vui lòng kiểm tra và nhập tên loại lỗi kỹ thuật.');
      return;
    }
    if (files.length === 0) {
      setError('Vui lòng chọn ít nhất 1 hình ảnh báo cáo lỗi.');
      return;
    }
    
    setError('');
    setSuccess(true);
    setSuccessMessage('Báo cáo đang được xử lý ngầm. Bạn có thể tiếp tục xem và tạo biên bản mới ngay lập tức.');
    
    const reportFiles = [...files];
    const reportPayloadBase: any = {
      date,
      floor,
      order,
      colorCode,
      errorName,
      supplier,
      employeeId: userProfile?.employeeId || user.email?.split('@')[0] || 'Unknown',
      employeeEmail: user.email || '',
    };
    if (note.trim()) {
      reportPayloadBase.note = note.trim();
    }

    const taskId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const taskTitle = `PO: ${order} - Lỗi: ${errorName}`;

    setBackgroundTasks(prev => [...prev, { id: taskId, title: taskTitle, progress: 0, status: 'uploading' }]);

    // Reset form immediately
    setOrder('');
    setColorCode('');
    setErrorOption('');
    setCustomErrorInput('');
    setNote('');
    setFiles([]);
    if (fileInputRef.current) fileInputRef.current.value = '';

    // Run async upload without blocking
    processBackgroundReport(taskId, taskTitle, reportFiles, reportPayloadBase);
  };

  const processBackgroundReport = async (taskId: string, title: string, reportFiles: File[], reportPayloadBase: any) => {
    try {
      const totalFiles = reportFiles.length;
      const timestamp = Date.now();
      const safeOrder = reportPayloadBase.order.replace(/[^a-zA-Z0-9]/g, '');
      const safeColor = reportPayloadBase.colorCode.replace(/[^a-zA-Z0-9]/g, '');
      const safeError = reportPayloadBase.errorName.replace(/[^a-zA-Z0-9]/g, '');
      const safeSupplier = reportPayloadBase.supplier.replace(/[^a-zA-Z0-9]/g, '');
      const safeFloor = reportPayloadBase.floor.replace(/[^a-zA-Z0-9]/g, '');

      let completedUploads = 0;

      const fileToBase64 = (blob: Blob): Promise<string> => {
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      };

      const withTimeout = <T,>(promise: Promise<T>, ms: number): Promise<T> => {
        let timeoutId: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<T>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Action timeout exceeded')), ms);
        });
        promise.catch(() => {});
        timeoutPromise.catch(() => {});
        return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
      };

      // Run compression and upload in parallel for speed
      const uploadPromises = reportFiles.map(async (file, i) => {
        let compressedBlob: Blob;
        try {
          compressedBlob = await compressImage(file, 800, 800, 0.6);
        } catch (e) {
          console.warn("Compression failed, using original file:", e);
          compressedBlob = file;
        }
        
        const fileName = `${safeOrder}_${safeColor}_${safeError}_${safeSupplier}_${safeFloor}_${i + 1}_${timestamp}.jpg`;
        let downloadUrl = '';
        
        if (!navigator.onLine) {
          downloadUrl = await fileToBase64(compressedBlob);
        } else {
          if (token === 'NO_TOKEN') {
            try {
              downloadUrl = await withTimeout(uploadFileToStorage(compressedBlob, fileName), 60000);
            } catch (storageErr) {
              console.warn("Upload timedout, fallback base64:", storageErr);
              downloadUrl = await fileToBase64(compressedBlob);
            }
          } else {
            try {
              downloadUrl = await withTimeout(uploadFileToDrive(compressedBlob, fileName, token), 60000);
            } catch (e: any) {
              console.warn("Drive timedout, fallback storage.", e);
              try {
                downloadUrl = await withTimeout(uploadFileToStorage(compressedBlob, fileName), 60000);
              } catch (storageErr) {
                downloadUrl = await fileToBase64(compressedBlob);
              }
            }
          }
        }

        completedUploads++;
        const pct = Math.round((completedUploads / totalFiles) * 80);
        setBackgroundTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress: pct } : t));
        
        return downloadUrl;
      });

      const imageUrls = await Promise.all(uploadPromises);
      setBackgroundTasks(prev => prev.map(t => t.id === taskId ? { ...t, progress: 90 } : t));
      
      const reportId = `report_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      const reportData: any = {
        ...reportPayloadBase,
        imageUrls
      };

      let firestoreSaved = false;
      try {
        const docRef = doc(db, 'qc_reports', reportId);
        let timeoutId: any;
        const timeoutPromise = new Promise<void>((_, reject) => {
          timeoutId = setTimeout(() => reject(new Error("Upload timeout exceeded")), 60000);
        });
        timeoutPromise.catch(() => {});

        const savePromise = setDoc(docRef, {
          ...reportData,
          createdAt: serverTimestamp(),
        });
        savePromise.catch(() => {}); // Prevent unhandled rejection if timeout wins

        await Promise.race([savePromise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
        firestoreSaved = true;
      } catch (dbError: any) {
        console.warn("Firestore save fallback:", dbError);
        try {
          const localReportsJson = localStorage.getItem('local_qc_reports') || '[]';
          const localReports = JSON.parse(localReportsJson);
          localReports.push({
            ...reportData,
            id: reportId,
            createdAt: new Date().toISOString(),
            isLocalOnly: true
          });
          localStorage.setItem('local_qc_reports', JSON.stringify(localReports));
        } catch (storageError) {
          console.error("Local save error:", storageError);
        }
      }

      setBackgroundTasks(prev => prev.map(t => t.id === taskId ? { 
        ...t, 
        progress: 100, 
        status: firestoreSaved ? 'success' : 'success_local' 
      } : t));

      setTimeout(() => {
        setBackgroundTasks(prev => prev.filter(t => t.id !== taskId));
      }, 5000);

    } catch (err: any) {
      console.warn("Background upload warning:", err);
      setBackgroundTasks(prev => prev.map(t => t.id === taskId ? { 
        ...t, 
        status: 'error', 
        error: err.message 
      } : t));
      
      setTimeout(() => {
        setBackgroundTasks(prev => prev.filter(t => t.id !== taskId));
      }, 8000);
    }
  };

  return (
    <div className="h-[100dvh] flex flex-col bg-slate-100 text-slate-800 font-sans overflow-hidden relative">
      {isUnauthorized ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-50 relative z-50">
          <div className="bg-white p-8 rounded-xl shadow-md border border-red-200 max-w-md w-full text-center">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-extrabold text-slate-800 mb-2">Truy Cập Bị Từ Chối</h2>
            <p className="text-slate-600 text-sm mb-6 leading-relaxed">
              Tài khoản email <strong>{user?.email}</strong> chưa được Admin cấp phép truy cập vào hệ thống báo cáo chất lượng PYV QC.
              <br /><br />
              Vui lòng liên hệ quản trị viên để được cấp tài khoản, hoặc đăng nhập bằng tài khoản khác.
            </p>
            <button
              onClick={handleLogout}
              className="w-full bg-red-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-red-700 transition flex items-center justify-center gap-2"
            >
              <LogOut className="h-5 w-5" />
              Đăng Xuất
            </button>
          </div>
        </div>
      ) : (
        <>
      {/* Header */}
      <header className="bg-[#000080] text-white px-3 sm:px-6 h-16 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-3 sm:gap-6">
          <div className="flex items-center shrink-0">
            <div className="flex flex-col leading-tight">
              <span className="font-extrabold text-sm sm:text-base tracking-tight text-white uppercase">IQC photo</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="font-light text-xs sm:text-sm text-slate-300 uppercase leading-[0.8]">Library</span>
                <span className="text-slate-300 leading-[0.8] text-xs font-light">-</span>
                <span className="font-extrabold text-sm sm:text-base tracking-tight text-white uppercase leading-[0.8]">PYV</span>
              </div>
            </div>
            
            <div className="ml-3 pl-3 border-l border-white/30 flex items-center gap-2 sm:hidden">
              <div className="flex flex-col">
                <span className="text-[11px] font-semibold text-white tracking-wide">{userProfile?.name || user.email?.split('@')[0]}</span>
                <span className="text-[9px] text-slate-300 tracking-wider">MaNV: {userProfile?.employeeId || 'Khách'}</span>
              </div>
            </div>

            <span className="ml-3 text-xs opacity-50 border-l border-white/30 pl-3 hidden lg:inline-block">Hệ Thống Báo Cáo Chất Lượng</span>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center bg-slate-900/60 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${activeTab === 'create' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
            >
              Tạo Báo Cáo
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${activeTab === 'history' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
            >
              Lịch Sử QC
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all cursor-pointer ${activeTab === 'admin' ? 'bg-blue-600 text-white' : 'text-slate-300 hover:text-white hover:bg-white/5'}`}
              >
                Cấu hình (Admin)
              </button>
            )}
          </nav>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {isAdmin && (
            <div className="bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-md text-[10px] font-bold hidden md:flex items-center gap-1 shrink-0">
              <ShieldCheck className="h-3 w-3 text-blue-400" />
              QUẢN TRỊ
            </div>
          )}
          <div className="bg-emerald-500 text-white px-2.5 py-1 rounded-full text-xs font-semibold hidden md:flex items-center gap-1.5 shadow-inner">
            <div className="w-1.5 h-1.5 bg-white rounded-full animate-pulse"></div> 
            Đã kết nối
          </div>
          <div className="text-right flex items-center gap-2 sm:gap-3 border-l border-white/10 pl-3 sm:pl-4 ml-1">
            <div className="hidden sm:flex flex-col text-right">
              <div className="text-sm font-semibold">{userProfile?.name || user.email?.split('@')[0]}</div>
              <div className="text-[10px] opacity-75 flex justify-end gap-1.5 text-right font-medium">
                <span>MaNV: {userProfile?.employeeId || 'Khách'}</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleLogout}
              className="h-8 w-8 bg-slate-700/50 hover:bg-slate-700 flex items-center justify-center rounded-full transition-colors text-slate-200 cursor-pointer border-none shrink-0"
              title="Đăng xuất"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className={`flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 pb-[50vh] md:pb-6 bg-slate-50 ${activeTab === 'create' ? 'block' : 'hidden'}`}>
        
        {/* User restrictions notification */}
          {userProfile?.role === 'admin' ? (
            <div className="max-w-6xl mx-auto mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3 px-4 flex items-center justify-between gap-3 text-xs text-amber-800 animate-in slide-in-from-top-3 duration-200">
              <div className="flex items-center gap-2">
                 <ShieldCheck className="h-4.5 w-4.5 text-amber-600 shrink-0" />
                 <span className="font-semibold leading-relaxed">
                   Tài khoản <strong>Admin</strong>. Bạn có toàn quyền truy cập tất cả các lầu.
                 </span>
              </div>
              <span className="text-[10px] font-bold text-amber-700 bg-white border border-amber-200 px-2 py-0.5 rounded-full select-none shrink-0">Admin Access</span>
            </div>
          ) : (userProfile?.permittedFloors && userProfile.permittedFloors.length > 0 && (
            <div className="max-w-6xl mx-auto mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 px-4 flex items-center justify-between gap-3 text-xs text-blue-800 animate-in slide-in-from-top-3 duration-200">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4.5 w-4.5 text-blue-600 shrink-0" />
                <span className="font-semibold leading-relaxed">
                  Nhóm tổ máy: <strong>{userProfile.floorGroup}</strong> — Bạn được giới hạn báo lỗi tại các khu vực: <strong>{userProfile.permittedFloors.join(', ')}</strong>.
                </span>
              </div>
              <span className="text-[10px] font-bold text-blue-600 bg-white border border-blue-205 px-2 py-0.5 rounded-full select-none shrink-0">Đã kích hoạt khóa lầu</span>
            </div>
          ))}

          <form onSubmit={handleSubmit} className="flex-1 flex flex-col lg:grid lg:grid-cols-[380px_1fr] gap-4 sm:gap-6 max-w-6xl mx-auto pb-6">
            {/* Form Card */}
            <section className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 flex flex-col gap-3.5 sm:gap-4 shrink-0 lg:h-max shadow-sm">
              <div className="border-b border-slate-100 pb-2.5 sm:pb-3 flex items-center justify-between">
                <h2 className="m-0 text-sm sm:text-base font-extrabold text-slate-800 uppercase tracking-tight">Chi tiết đơn hàng</h2>
                <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 font-bold uppercase">Mẫu v1.4</span>
              </div>
              
              {/* Date Input & Part (Bộ vị) */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 text-xs">
                <div className="flex flex-col gap-1 sm:gap-1.5">
                  <label htmlFor="date" className="font-bold text-slate-600 uppercase tracking-wide">Ngày kiểm hàng</label>
                  <input 
                    type="date" 
                    id="date" 
                    required 
                    value={date} 
                    onChange={e => setDate(e.target.value)} 
                    className="px-3 py-2.5 sm:py-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-semibold text-sm w-full" 
                  />
                </div>
                
                <div className="flex flex-col gap-1 sm:gap-1.5 text-xs">
                  <label className="font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                    Bộ Vị {!isAdmin && <Lock className="h-3 w-3 text-slate-400" />}
                  </label>
                  {isAdmin ? (
                    <select
                      value={userProfile?.part || ''}
                      onChange={(e) => handleAdminPartChange(e.target.value)}
                      className="px-3 py-2.5 sm:py-3 border border-slate-200 rounded-lg bg-orange-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-slate-800 text-sm w-full truncate"
                    >
                      <option value="">Chưa gán (Tất cả)</option>
                      <option value="ĐẾ">ĐẾ</option>
                      <option value="MẶT GIÀY">MẶT GIÀY</option>
                    </select>
                  ) : (
                    <div className="px-3 py-2.5 sm:py-3 border border-slate-200 rounded-lg bg-slate-100 font-bold text-slate-500 text-sm select-none truncate h-full flex items-center">
                      {userProfile?.part || 'Chưa gán (Tất cả)'}
                    </div>
                  )}
                </div>
              </div>

              {/* Floor and Order Block */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 text-xs">
                
                {/* LẦU / KHU VỰC DROPDOWN */}
                <div className="flex flex-col gap-1 sm:gap-1.5">
                  <label htmlFor="floor" className="font-bold text-slate-600 uppercase tracking-wide flex justify-between gap-1 items-center">
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                      Lầu / Khu vực
                    </span>
                    {floorOption === 'CUSTOM' && <span className="text-orange-600 font-extrabold">[Chế độ tự nhập]</span>}
                  </label>
                  <select
                    id="floor"
                    required
                    value={floorOption}
                    onChange={e => {
                      setFloorOption(e.target.value);
                      if (e.target.value !== 'CUSTOM' && e.target.value !== '') {
                        setFloor(e.target.value);
                      } else if (e.target.value === 'CUSTOM') {
                        setFloor('');
                      }
                    }}
                    className="px-3 py-2.5 sm:py-3 border border-slate-205 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-slate-800 text-sm"
                  >
                    <option value="" disabled>-- Chọn lầu --</option>
                    {floorOptions.map((fOpt) => (
                      <option key={fOpt} value={fOpt}>
                        {fOpt}
                      </option>
                    ))}
                    {isAdmin && <option value="CUSTOM">➕ Tự viết / Thêm lầu mới...</option>}
                  </select>
                  
                  {floorOption === 'CUSTOM' && (
                    <input
                      type="text"
                      required
                      placeholder="Nhập tên lầu mới..."
                      value={floor}
                      onChange={e => setFloor(e.target.value.toUpperCase())}
                      className="mt-1.5 px-3 py-2.5 border-2 border-orange-200 rounded-lg bg-orange-50 focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-200 outline-none transition-all font-bold text-slate-800 text-sm"
                    />
                  )}
                </div>

                {/* ĐƠN HÀNG PO: NUMERIC FORCED */}
                <div className="flex flex-col gap-1 sm:gap-1.5">
                  <label htmlFor="order" className="font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                    <Tag className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                    Đơn hàng (PO)
                  </label>
                  <input 
                    type="text" 
                    id="order" 
                    required 
                    pattern="[0-9]*"
                    inputMode="numeric"
                    placeholder="Chỉ nhập số" 
                    value={order} 
                    onChange={handleOrderChange}
                    onFocus={(e) => {
                      setTimeout(() => {
                        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                      }, 300);
                    }}
                    className="px-3 py-2.5 sm:py-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-mono font-bold text-slate-800 text-sm" 
                    title="Mã PO bắt buộc là số"
                  />
                </div>
              </div>

              {/* Color Code and Supplier Block */}
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3 text-xs">
                
                {/* MÃ MÀU: AUTO RESOLVED OR MANUAL */}
                <div className="flex flex-col gap-1 sm:gap-1.5">
                  <label htmlFor="colorCode" className="font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1">
                    <Layers className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                    Mã màu
                    {isSearchingColor && (
                      <Loader2 className="h-3 w-3 text-blue-500 animate-spin ml-1" />
                    )}
                  </label>
                  <input 
                    type="text" 
                    id="colorCode" 
                    required 
                    placeholder="Nhập mã màu" 
                    value={colorCode} 
                    onChange={e => setColorCode(e.target.value)} 
                    className="px-3 py-2.5 sm:py-3 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all font-semibold text-slate-800 uppercase text-sm" 
                  />
                </div>

                {/* XƯỞNG CUNG ỨNG: DROPDOWN CHOSEN */}
                <div className="flex flex-col gap-1 sm:gap-1.5">
                  <label htmlFor="supplier" className="font-bold text-slate-600 uppercase tracking-wide flex justify-between gap-1 items-center">
                    <span className="flex items-center gap-1">
                      <Factory className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      Xưởng Cung Ứng
                    </span>
                    {supplierOption === 'CUSTOM' && <span className="text-orange-600 font-extrabold">[Chế độ tự nhập]</span>}
                  </label>
                  <select
                    id="supplier"
                    required
                    value={supplierOption}
                    onChange={e => {
                      setSupplierOption(e.target.value);
                      if (e.target.value !== 'CUSTOM' && e.target.value !== '') {
                        setSupplier(e.target.value);
                      } else if (e.target.value === 'CUSTOM') {
                        setSupplier('');
                      }
                    }}
                    className="px-3 py-2.5 sm:py-3 border border-slate-205 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-800 text-sm"
                  >
                    <option value="" disabled>-- Chọn xưởng --</option>
                    {supplierOptions.map((supplierName) => (
                      <option key={supplierName} value={supplierName}>
                        {supplierName}
                      </option>
                    ))}
                    {isAdmin && <option value="CUSTOM">➕ Tự viết / Thêm xưởng mới...</option>}
                  </select>
                  
                  {supplierOption === 'CUSTOM' && (
                    <input
                      type="text"
                      required
                      placeholder="Nhập tên xưởng mới..."
                      value={supplier}
                      onChange={e => setSupplier(e.target.value)}
                      className="mt-1.5 px-3 py-2.5 border-2 border-orange-200 rounded-lg bg-orange-50 focus:bg-white focus:border-orange-400 focus:ring-2 focus:ring-orange-200 outline-none transition-all font-bold text-slate-800 text-sm"
                    />
                  )}
                </div>
              </div>

              {/* TÊN LOẠI LỖI KỸ THUẬT: DROPDOWN OR ADD NEW */}
              <div className="flex flex-col gap-1 sm:gap-1.5 text-xs">
                <label htmlFor="errorDropdown" className="font-bold text-slate-600 uppercase tracking-wide flex justify-between">
                  <span>Tên lỗi</span>
                  {errorOption === 'CUSTOM' && <span className="text-orange-600 font-extrabold">[Chế độ tự nhập]</span>}
                </label>
                
                <select
                  id="errorDropdown"
                  required
                  value={errorOption}
                  onChange={e => {
                    setErrorOption(e.target.value);
                    if (e.target.value !== 'CUSTOM') setCustomErrorInput('');
                  }}
                  className="px-3 py-2.5 sm:py-3 border border-slate-205 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-800 text-sm"
                >
                  <option value="">-- Chọn loại lỗi đang bị --</option>
                  {errorOptions.map((eName) => (
                    <option key={eName} value={eName}>
                      {eName}
                    </option>
                  ))}
                  {isAdmin && <option value="CUSTOM">➕ Tự viết / Thêm tên lỗi mới...</option>}
                </select>

                {errorOption === 'CUSTOM' && (
                  <input
                    type="text"
                    required
                    placeholder="Nhập chi tiết tên lỗi kỹ thuật mới..."
                    value={customErrorInput}
                    onChange={e => setCustomErrorInput(e.target.value)}
                    className="mt-1 px-3 py-2.5 sm:py-3 border border-blue-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold bg-blue-50/20 text-slate-805 text-sm animate-in slide-in-from-top-1.5 duration-150"
                  />
                )}
              </div>

              {/* GHI CHÚ CHI TIẾT */}
              <div className="flex flex-col gap-1 sm:gap-1.5 text-xs">
                <label htmlFor="note" className="font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1 mt-1">
                  <FileText className="h-3.5 w-3.5 text-slate-500 shrink-0" />
                  Ghi chú chi tiết vấn đề
                </label>
                <textarea
                  id="note"
                  placeholder="Mô tả cụ thể vấn đề hoặc hướng xử lý (không bắt buộc)..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  className="px-3 py-2.5 sm:py-3 border border-slate-205 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all text-slate-800 text-sm resize-y min-h-[60px]"
                />
              </div>

              <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 mt-2">
                <div className="text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3.5 text-emerald-500" />
                  Mẫu đặt tên thông minh
                </div>
                <div className="text-[10px] text-slate-500 leading-normal">
                  File ảnh tải lên sẽ tự động đổi tên thành <strong>[Đơn_hàng]_[Mã_màu]_[Tên_lỗi]_[Xưởng]_[Lầu]...jpg</strong> để phục vụ lưu trữ khoa học.
                </div>
              </div>
            </section>

            {/* Upload Card */}
            <section className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col gap-4 lg:overflow-hidden min-h-[500px] shadow-sm">
              <div className="flex justify-between items-center border-b border-slate-100 pb-3 shrink-0">
                <h2 className="m-0 text-base font-extrabold text-slate-800 uppercase tracking-tight">Hình ảnh minh chứng (QC Photos)</h2>
                <span className="text-xs text-slate-500 font-semibold bg-slate-100 px-2.5 py-0.5 rounded-full">Đã chọn {files.length} ảnh</span>
              </div>

              {success && (
                <div className="rounded-xl bg-emerald-50 p-4 border border-emerald-200 flex flex-col gap-1.5 shrink-0 animate-in zoom-in-95 duration-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4.5 w-4.5 text-emerald-500 shrink-0" />
                    <span className="text-sm font-bold text-emerald-800">Đã gửi báo cáo thành công!</span>
                  </div>
                  <p className="text-xs text-emerald-700 ml-6 leading-relaxed font-semibold">
                    {successMessage || 'Báo cáo đã được lưu trữ & tải ảnh hoàn tất.'}
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-xl bg-red-50 p-3.5 border border-red-200 shrink-0 flex items-start gap-2 text-xs text-red-800 font-semibold">
                  <AlertCircle className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              <label
                htmlFor="file-upload"
                className="border-2 border-dashed border-slate-350 bg-slate-50/50 hover:border-blue-500 hover:bg-blue-50/30 cursor-pointer rounded-xl p-6 sm:p-8 text-center transition-all shrink-0"
              >
                <div className="flex flex-col items-center justify-center space-y-2 select-none">
                  <div className="text-3xl font-light text-slate-400 hover:text-blue-500 mb-1">+</div>
                  <div className="font-extrabold text-xs tracking-wider text-slate-650 uppercase">Nhấn để tải lên hoặc kéo thả ảnh lỗi</div>
                  <div className="text-[10px] text-slate-450">Tự động nén chất lượng cao siêu tốc (Max 1280px)</div>
                </div>
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                />
              </label>

              {/* Files grid preview */}
              {files.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 gap-3 mt-2 overflow-y-auto pr-1 pb-2">
                  {files.map((file, index) => (
                    <div key={`${file.name}-${index}`} className="relative group aspect-square bg-slate-100 rounded-lg overflow-hidden border border-slate-200 flex flex-col shadow-sm">
                      <ImagePreview file={file} index={index} />
                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        className="absolute top-1.5 right-1.5 bg-red-600 hover:bg-red-700 text-white rounded-full p-1 shadow-md cursor-pointer border-none flex items-center justify-center z-10"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-auto shrink-0 pt-4 flex flex-col gap-3">
                <button
                  type="submit"
                  className="bg-blue-600 text-white text-xs py-3.5 px-4 rounded-xl font-extrabold border-none flex w-full items-center justify-center gap-2 transition-transform active:scale-[0.99] shadow-sm cursor-pointer hover:bg-blue-700"
                >
                  <UploadCloud className="h-4.5 w-4.5" />
                  GỬI BÁO CÁO NGAY
                </button>
              </div>
            </section>
          </form>
        </main>

     <main className={`flex-1 overflow-y-auto md:overflow-hidden pb-[50vh] md:pb-0 bg-slate-50 ${activeTab === 'history' ? 'flex flex-col' : 'hidden'}`}>
        <QCHistory user={user} token={token} userProfile={userProfile} onNavigateToCreate={handleNavigateToCreate} isActive={activeTab === 'history'} />
      </main>

      {isAdmin && (
        <main className={`flex-1 overflow-y-auto md:overflow-hidden pb-[50vh] md:pb-0 bg-slate-50 ${activeTab === 'admin' ? 'flex flex-col' : 'hidden'}`}>
          <AdminPanel onMappingChange={loadConfiguration} />
        </main>
      )}

      {/* Mobile Bottom Tab Navigation */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-[#000080] border-t border-white/10 pb-safe pt-2 px-4 flex justify-around items-center z-50 shadow-xl">
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          className={`flex flex-col items-center justify-center gap-1.5 py-1 px-3 rounded-lg text-center cursor-pointer border-none bg-transparent select-none transition-all ${activeTab === 'create' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-white'}`}
        >
          <PlusCircle className="h-5.5 w-5.5" />
          <span className="text-[10px] tracking-wide font-bold">Tạo Báo Cáo</span>
        </button>
        
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex flex-col items-center justify-center gap-1.5 py-1 px-3 rounded-lg text-center cursor-pointer border-none bg-transparent select-none transition-all ${activeTab === 'history' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-white'}`}
        >
          <History className="h-5.5 w-5.5" />
          <span className="text-[10px] tracking-wide font-bold">Lịch Sử QC</span>
        </button>
        
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`flex flex-col items-center justify-center gap-1.5 py-1 px-3 rounded-lg text-center cursor-pointer border-none bg-transparent select-none transition-all ${activeTab === 'admin' ? 'text-blue-400 font-extrabold scale-105' : 'text-slate-400 hover:text-white'}`}
          >
            <Settings className="h-5.5 w-5.5" />
            <span className="text-[10px] tracking-wide font-bold">Cấu hình</span>
          </button>
        )}
      </nav>

      {/* Floating Background Tasks UI */}
      {backgroundTasks.length > 0 && (
        <div className="fixed bottom-20 md:bottom-6 right-4 md:right-6 w-full max-w-sm flex flex-col gap-2 z-50 pointer-events-none">
          {backgroundTasks.map(task => (
            <div key={task.id} className="bg-white rounded-lg shadow-xl border border-slate-200 p-3 pointer-events-auto flex flex-col gap-2 relative overflow-hidden transition-all duration-300 transform translate-y-0 opacity-100">
              <div className="flex justify-between items-start gap-2">
                <div className="flex-1">
                  <h4 className="text-sm font-bold text-slate-800 line-clamp-1">{task.title}</h4>
                  <div className="text-xs font-semibold mt-0.5">
                    {task.status === 'uploading' && <span className="text-blue-600">Đang lưu... ({task.progress}%)</span>}
                    {task.status === 'success' && <span className="text-emerald-600">Lưu trực tuyến thành công</span>}
                    {task.status === 'success_local' && <span className="text-amber-600">Lưu ngoại tuyến (rớt mạng)</span>}
                    {task.status === 'error' && <span className="text-red-600 line-clamp-1">Lỗi: {task.error}</span>}
                  </div>
                </div>
                {task.status === 'success' || task.status === 'success_local' ? (
                  <CheckCircle className={`h-5 w-5 shrink-0 ${task.status === 'success' ? 'text-emerald-500' : 'text-amber-500'}`} />
                ) : task.status === 'error' ? (
                  <XCircle className="h-5 w-5 shrink-0 text-red-500" />
                ) : (
                  <UploadCloud className="h-5 w-5 shrink-0 text-blue-500 animate-pulse" />
                )}
              </div>
              
              {/* Progress bar background */}
              <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100">
                <div 
                  className={`h-full transition-all duration-300 ${
                    task.status === 'success' ? 'bg-emerald-500' : 
                    task.status === 'success_local' ? 'bg-amber-500' : 
                    task.status === 'error' ? 'bg-red-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}
