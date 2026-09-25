import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
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
  Lock,
  Box,
  Sparkles,
  Check,
  ChevronDown,
  Filter,
  Camera,
  User as UserIcon
} from 'lucide-react';
import { format } from 'date-fns';
import { QCHistory } from './components/QCHistory';
import { 
  AdminPanel, 
  QCUser, 
  POMapping, 
  sanitizeMap, 
  DEFAULT_SUB_PARTS,
  SupplierModelMapping,
  DEFAULT_SUPPLIER_MODELS,
  DEFAULT_COLORS_LIST
} from './components/AdminPanel';

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
  const sanitizeName = (str: string) => {
    if (!str) return 'Unknown';
    let s = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    s = s.replace(/đ/g, "d").replace(/Đ/g, "D");
    s = s.replace(/[^a-zA-Z0-9-[]() ]/g, " ");
    return s.trim().replace(/\s+/g, "_");
  };

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
  const [currentPart, setCurrentPart] = useState<string>(() => {
    return localStorage.getItem('qc_current_part') || '';
  });
  const [poMappings, setPoMappings] = useState<POMapping[]>([]);
  const [floorOption, setFloorOption] = useState('');
  const [supplierOption, setSupplierOption] = useState('');
  const [errorOption, setErrorOption] = useState('');
  const [customErrorInput, setCustomErrorInput] = useState('');
  
  const [colorOption, setColorOption] = useState('');
  const [customColorInput, setCustomColorInput] = useState('');

  // Shoe Model (Hình thể) & Supplier Model states
  const [shoeModel, setShoeModel] = useState('');
  const [shoeModelOption, setShoeModelOption] = useState('');
  const [isNoPo, setIsNoPo] = useState(false);
  const [supplierModels, setSupplierModels] = useState<SupplierModelMapping[]>([]);
  const [colorsList, setColorsList] = useState<string[]>([]);

  // Dropdown list pickers for NHẬP MÃ MÀU and HÌNH THỂ
  const [showColorDropdown, setShowColorDropdown] = useState(false);
  const [colorFilterQuery, setColorFilterQuery] = useState('');
  const [showModelDropdown, setShowModelDropdown] = useState(false);
  const [modelFilterQuery, setModelFilterQuery] = useState('');
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Sub-component (Thành phần nhỏ) states
  const [subPart, setSubPart] = useState('');
  const [subPartOption, setSubPartOption] = useState('');
  const [subPartOptions, setSubPartOptions] = useState<string[]>([]);

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
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Standard predefined floor list (Fallback)
  const [defaultFloors, setDefaultFloors] = useState<string[]>(['K63A', 'K63B', 'K73A', 'K73B']);

  // Predefined error types dropdown
  const [errorOptions, setErrorOptions] = useState<string[]>(['Vệ sinh', 'Quy cách', 'Kỹ thuật', 'Khác']);

  // Supplier Options list (Xưởng cung ứng dropdown)
  const [supplierOptions, setSupplierOptions] = useState<string[]>(['JIA HOA', 'VĨNH TÀI', 'NỘI BỘ', 'KHÁC']);

  // Colors config map list
  const [colorConfigList, setColorConfigList] = useState<{ colorCode: string, supplier: string }[]>([]);

  const floorOptions = userProfile?.role === 'admin' 
    ? defaultFloors 
    : (userProfile?.permittedFloors && userProfile.permittedFloors.length > 0
        ? userProfile.permittedFloors
        : defaultFloors);

  // Store global mappings from db
  const [globalMappingsMap, setGlobalMappingsMap] = useState<Record<string, string>>({});

  // Admin capability check
  const isAdmin = userProfile?.role === 'admin' || (user.email || '').toLowerCase() === 'pyvqcproject@gmail.com' || (user.email || '').toLowerCase().includes('admin');

  const checkIsSolePart = (partName: string) => {
    if (!partName) return true; // Default to sole if unselected
    const norm = partName.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    return norm.includes('DE') || partName.toUpperCase().includes('ĐẾ');
  };

  const parseColorsConfig = (colorsArray: string[]) => {
    if (!colorsArray || !Array.isArray(colorsArray)) return [];
    return colorsArray.map(str => {
      const parts = str.split(':');
      if (parts.length >= 2) {
        return { colorCode: parts[0].trim(), supplier: parts.slice(1).join(':').trim() };
      }
      return { colorCode: str.trim(), supplier: '' };
    }).filter(c => c.colorCode);
  };

  const updatePartConfig = (partKey: string, fullConfigFromStorage: any) => {
    if (!fullConfigFromStorage) return;
    const normKey = (partKey || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
    let configKey: 'detho' | 'deson' | 'matgiay' = 'detho';
    if (normKey.includes('MAT GIAY') || normKey.includes('MAT') || normKey.includes('UPPER')) {
      configKey = 'matgiay';
    } else if (normKey.includes('PHUN SON') || normKey.includes('SON')) {
      configKey = 'deson';
    } else {
      configKey = 'detho';
    }

    const targetPartConfig = fullConfigFromStorage[configKey] 
      || (configKey === 'deson' ? fullConfigFromStorage['detho'] : null)
      || fullConfigFromStorage['de'] 
      || fullConfigFromStorage;

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
    if (targetPartConfig.colors && Array.isArray(targetPartConfig.colors)) {
      setColorConfigList(parseColorsConfig(targetPartConfig.colors));
      setColorsList(targetPartConfig.colors);
    } else {
      setColorsList(DEFAULT_COLORS_LIST[configKey] || []);
    }
    const loadedSubParts = (targetPartConfig.subParts && Array.isArray(targetPartConfig.subParts) && targetPartConfig.subParts.length > 0)
      ? targetPartConfig.subParts
      : (DEFAULT_SUB_PARTS[configKey] || []);
    setSubPartOptions(loadedSubParts);

    const loadedSupplierModels = (targetPartConfig.supplierModels && Array.isArray(targetPartConfig.supplierModels) && targetPartConfig.supplierModels.length > 0)
      ? targetPartConfig.supplierModels
      : (DEFAULT_SUPPLIER_MODELS[configKey] || []);
    setSupplierModels(loadedSupplierModels);
  };

  const handlePartChange = (newPart: string) => {
    setCurrentPart(newPart);
    localStorage.setItem('qc_current_part', newPart);
    if (userProfile) {
      const updatedProfile = { ...userProfile, part: newPart as QCUser['part'] };
      setUserProfile(updatedProfile);
    }
    setSubPart('');
    setSubPartOption('');
    setShoeModel('');
    setShoeModelOption('');
    setColorCode('');
    setColorOption('');
    
    // Load matching config from localStorage
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
          let activePartKey = 'detho';
          let localUsersForPart: any = null;
          try { localUsersForPart = JSON.parse(localStorage.getItem('local_qc_users') || "[]"); } catch(e){}
          const cachedUserForPart = Array.isArray(localUsersForPart) ? localUsersForPart.find((u: any) => u.email.toLowerCase() === emailKey) : null;
          if (cachedUserForPart && cachedUserForPart.part === 'MẶT GIÀY') {
            activePartKey = 'matgiay';
          } else if (cachedUserForPart && cachedUserForPart.part === 'ĐẾ PHUN SƠN') {
            activePartKey = 'deson';
          }
          const parsed = parsedConfigOrig[activePartKey] || parsedConfigOrig;
          
          if (parsed.floors && parsed.floors.length) setDefaultFloors(parsed.floors);
          if (parsed.errors && parsed.errors.length) setErrorOptions(parsed.errors);
          if (parsed.suppliers && parsed.suppliers.length) setSupplierOptions(parsed.suppliers);
          if (parsed.colors && parsed.colors.length) setColorConfigList(parseColorsConfig(parsed.colors));
          const cachedSubParts = (parsed.subParts && Array.isArray(parsed.subParts) && parsed.subParts.length > 0)
            ? parsed.subParts
            : (DEFAULT_SUB_PARTS[activePartKey] || []);
          setSubPartOptions(cachedSubParts);
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
    
    let configKey = 'detho';
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
        if (matched.part) {
          setCurrentPart(prev => prev || matched.part);
          localStorage.setItem('qc_current_part', matched.part);
        } else {
          setCurrentPart(prev => prev || localStorage.getItem('qc_current_part') || 'ĐẾ THÔ');
        }
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
        let userPartContext = currentPart || matched?.part || localStorage.getItem('qc_current_part') || 'ĐẾ THÔ';
        const normKey = userPartContext.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        configKey = 'detho';
        if (normKey.includes('MAT GIAY') || normKey.includes('MAT') || normKey.includes('UPPER')) {
          configKey = 'matgiay';
        } else if (normKey.includes('PHUN SON') || normKey.includes('SON')) {
          configKey = 'deson';
        } else {
          configKey = 'detho';
        }
        let targetPartConfig = fullConfig[configKey] || (configKey === 'deson' ? fullConfig['detho'] : null) || fullConfig['de'] || fullConfig;

        if (targetPartConfig.floors && Array.isArray(targetPartConfig.floors)) setDefaultFloors(targetPartConfig.floors);
        if (targetPartConfig.errors && Array.isArray(targetPartConfig.errors)) setErrorOptions(targetPartConfig.errors);
        if (targetPartConfig.suppliers && Array.isArray(targetPartConfig.suppliers)) setSupplierOptions(targetPartConfig.suppliers);
        if (targetPartConfig.colors && Array.isArray(targetPartConfig.colors)) {
          setColorConfigList(parseColorsConfig(targetPartConfig.colors));
          setColorsList(targetPartConfig.colors);
        } else {
          setColorsList(DEFAULT_COLORS_LIST[configKey] || []);
        }
        const subPartsToUse = (targetPartConfig.subParts && Array.isArray(targetPartConfig.subParts) && targetPartConfig.subParts.length > 0)
          ? targetPartConfig.subParts
          : (DEFAULT_SUB_PARTS[configKey] || []);
        setSubPartOptions(subPartsToUse);

        const supplierModelsToUse = (targetPartConfig.supplierModels && Array.isArray(targetPartConfig.supplierModels) && targetPartConfig.supplierModels.length > 0)
          ? targetPartConfig.supplierModels
          : (DEFAULT_SUPPLIER_MODELS[configKey] || []);
        setSupplierModels(supplierModelsToUse);
        
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
          const target = parsed[configKey] || parsed;
          if (target.floors) setDefaultFloors(target.floors);
          if (target.errors) setErrorOptions(target.errors);
          if (target.suppliers) setSupplierOptions(target.suppliers);
          if (target.colors) {
            setColorConfigList(parseColorsConfig(target.colors));
            setColorsList(target.colors);
          }
          if (target.supplierModels) setSupplierModels(target.supplierModels);
          if (target.subParts) setSubPartOptions(target.subParts);
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
          if (parsed.colors) {
            setColorConfigList(parseColorsConfig(parsed.colors));
            setColorsList(parsed.colors);
          }
          if (parsed.supplierModels) setSupplierModels(parsed.supplierModels);
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

  // Check if current part is Sole (Đế thô or Đế phun sơn)
  const isSolePart = checkIsSolePart(currentPart || userProfile?.part || '');

  // Available models based on selected supplier (or all models)
  const availableModels = useMemo(() => {
    let list: string[] = [];
    if (supplierModels && supplierModels.length > 0) {
      if (supplier && supplier !== 'KHÁC') {
        list = supplierModels
          .filter(sm => sm.supplier.toUpperCase() === supplier.toUpperCase())
          .map(sm => sm.model);
      }
      if (list.length === 0) {
        list = Array.from(new Set(supplierModels.map(sm => sm.model)));
      }
    }
    if (list.length === 0) {
      const fallbackKey = isSolePart ? 'detho' : 'matgiay';
      list = DEFAULT_SUPPLIER_MODELS[fallbackKey]?.map(sm => sm.model) || ['FCXV5', 'FCXV6', 'FCXV7'];
    }
    return Array.from(new Set(list));
  }, [supplierModels, supplier, isSolePart]);

  // Available colors list: ONLY GENUINE COLOR CODES FOR MẶT GIÀY (UPPER PART)
  // For Sole (Đế thô / Đế phun sơn), "NHẬP MÃ MÀU" uses availableModels directly!
  const availableColors = useMemo(() => {
    let list: string[] = [];
    if (colorsList && colorsList.length > 0) {
      list = [...colorsList];
    }
    
    // Also include color codes from PO mappings
    if (globalMappingsMap && Object.keys(globalMappingsMap).length > 0) {
      const mapColors: string[] = Object.values(globalMappingsMap).filter((v): v is string => Boolean(v));
      list = [...list, ...mapColors];
    }

    if (list.length === 0) {
      list = DEFAULT_COLORS_LIST['matgiay'] || [];
    }

    // Deduplicate
    let unique = Array.from(new Set(list.map(c => c.trim()).filter(Boolean)));

    // Filter out any models (e.g. FCXV5, FCXV6) so colors NEVER show models
    if (supplierModels && supplierModels.length > 0) {
      const modelSet = new Set(supplierModels.map(sm => sm.model.toUpperCase()));
      unique = unique.filter(c => !modelSet.has(c.toUpperCase()));
    }
    const knownModels = new Set(['FCXV5', 'FCXV6', 'FCXV7', 'FCXV8', 'PEG40', 'AF1-SOLE', 'DUNK-HIGH', 'PEGASUS-40']);
    unique = unique.filter(c => !knownModels.has(c.toUpperCase()));

    if (unique.length === 0) {
      unique = ['MFCXVLI5', 'MFCXV2ZU', '100-WHITE', '001-BLACK', '400-ROYAL', 'RED-CRIMSON', '101-SAIL', '010-WOLF-GREY', 'NAVY-01', 'CHARCOAL-BLACK'];
    }

    return unique;
  }, [colorsList, globalMappingsMap, supplierModels]);

  const selectModel = (model: string) => {
    setShoeModel(model);
    setShoeModelOption(model);
    setColorCode(model);
    setColorOption(model);
    const matchedSm = supplierModels.find(sm => sm.model.toUpperCase() === model.toUpperCase());
    if (matchedSm && (!supplier || supplier === 'KHÁC')) {
      setSupplier(matchedSm.supplier);
      setSupplierOption(matchedSm.supplier);
    }
    setShowModelDropdown(false);
  };

  const selectColor = (colorOrModel: string) => {
    setColorCode(colorOrModel);
    setColorOption(colorOrModel);
    setShoeModel(colorOrModel);
    setShoeModelOption(colorOrModel);
    if (isSolePart) {
      const matchedSm = supplierModels.find(sm => sm.model.toUpperCase() === colorOrModel.toUpperCase());
      if (matchedSm && (!supplier || supplier === 'KHÁC')) {
        setSupplier(matchedSm.supplier);
        setSupplierOption(matchedSm.supplier);
      }
    } else {
      const match = colorConfigList.find(c => c.colorCode.toUpperCase() === colorOrModel.toUpperCase());
      if (match && match.supplier && (!supplier || supplier === 'KHÁC')) {
        setSupplier(match.supplier);
        setSupplierOption(match.supplier);
      }
    }
    setShowColorDropdown(false);
  };

  // Handle PO input change (forces numbers only + resolves matching color via useEffect API)
  const handleOrderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numericValue = e.target.value.replace(/[^0-9]/g, ''); // PO is strictly digits
    setOrder(numericValue);
    if (isNoPo) setIsNoPo(false);
  };

  // Find color mapping when order changes
  useEffect(() => {
    if (!order || isNoPo || order === 'KHÔNG') return;
    
    // Search directly from local memory (sync loaded)
    const exactMatchColor = globalMappingsMap[order];
    if (exactMatchColor) {
      setColorCode(exactMatchColor);
      if (isSolePart) {
        setShoeModel(exactMatchColor);
      }
      const matchedSm = supplierModels.find(sm => sm.model.toUpperCase() === exactMatchColor.toUpperCase());
      if (matchedSm && (!supplier || supplier === 'KHÁC')) {
        setSupplier(matchedSm.supplier);
        setSupplierOption(matchedSm.supplier);
      }
    } else {
      // Don't clear automatically if already entered
    }
  }, [order, globalMappingsMap, isSolePart, supplierModels, isNoPo, supplier]);

  // Sync colorOption with colorCode when it changes externally
  useEffect(() => {
    if (!colorCode) {
      setColorOption('');
    } else {
      const isMapped = colorConfigList.some(c => c.colorCode.toUpperCase() === colorCode.toUpperCase());
      if (isMapped) {
        const exactItem = colorConfigList.find(c => c.colorCode.toUpperCase() === colorCode.toUpperCase());
        setColorOption(exactItem ? exactItem.colorCode : colorCode);
      } else {
        setColorOption('CUSTOM');
      }
    }
  }, [colorCode, colorConfigList]);

  // Find supplier mapping when colorCode changes
  useEffect(() => {
    if (!colorCode) return;
    const match = colorConfigList.find(c => c.colorCode.toUpperCase() === colorCode.toUpperCase());
    if (match && match.supplier) {
      setSupplierOption(match.supplier);
      setSupplier(match.supplier);
    }
  }, [colorCode, colorConfigList]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  };

  // --- Mobile Scroll Hide Logic ---
  const [isAtTop, setIsAtTop] = useState(true);

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    setIsAtTop(e.currentTarget.scrollTop <= 10);
  };

  const handleLogout = () => {
    onLogout();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date) {
      setError('Vui lòng chọn ngày kiểm hàng.');
      return;
    }
    const finalPart = currentPart || userProfile?.part || '';
    if (!finalPart) {
      setError('Vui lòng chọn hoặc gán bộ vị kiểm tra.');
      return;
    }
    if (!subPart.trim()) {
      setError('Vui lòng chọn hoặc nhập Thành phần nhỏ (chi tiết bộ vị). Không được để trống!');
      return;
    }
    if (!floor) {
      setError('Vui lòng chọn Lầu / Khu vực thực hiện.');
      return;
    }
    if (!order.trim()) {
      setError("Vui lòng nhập đơn hàng (PO) dạng số hoặc tích chọn 'Không' nếu không có đơn hàng.");
      return;
    }
    const effectiveModel = isSolePart
      ? (shoeModel.trim() || colorCode.trim())
      : (shoeModel.trim() || colorCode.trim());
    const effectiveColor = isSolePart
      ? (colorCode.trim() || shoeModel.trim())
      : colorCode.trim();

    if (isSolePart) {
      if (!effectiveModel) {
        setError('Vui lòng chọn hoặc nhập Hình thể đế (ví dụ: FCXV5). Không được để trống!');
        return;
      }
    } else {
      if (!effectiveColor) {
        setError('Vui lòng chọn hoặc nhập Mã màu mặt giày (ví dụ: MFCXVLI5). Không được để trống!');
        return;
      }
    }
    if (!supplier) {
      setError('Vui lòng chọn Xưởng cung ứng. Không được để trống!');
      return;
    }
    if (!errorName.trim()) {
      setError('Vui lòng chọn hoặc nhập Loại lỗi kỹ thuật. Không được để trống!');
      return;
    }
    if (files.length === 0) {
      setError('Vui lòng chọn hoặc chụp ít nhất 1 hình ảnh báo cáo lỗi.');
      return;
    }
    
    setError('');
    setSuccess(true);
    setSuccessMessage('Báo cáo đang được xử lý ngầm. Bạn có thể tiếp tục xem và tạo biên bản mới ngay lập tức.');
    
    const reportFiles = [...files];
    const reportPayloadBase: any = {
      date,
      floor,
      order: order.trim(),
      colorCode: effectiveColor,
      shoeModel: effectiveModel,
      errorName: errorName.trim(),
      supplier: supplier.trim(),
      part: finalPart,
      subPart: subPart.trim(),
      employeeId: userProfile?.employeeId || user.email?.split('@')[0] || 'Unknown',
      employeeName: userProfile?.name || '',
      employeeEmail: user.email || '',
    };
    if (note.trim()) {
      reportPayloadBase.note = note.trim();
    }

    const taskId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `task_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const taskTitle = `PO: ${order} - ${effectiveModel || effectiveColor} (${floor})`;

    setBackgroundTasks(prev => [...prev, { id: taskId, title: taskTitle, progress: 0, status: 'uploading' }]);

    // Reset form immediately
    setOrder('');
    setIsNoPo(false);
    setColorCode('');
    setColorOption('');
    setCustomColorInput('');
    setShoeModel('');
    setShoeModelOption('');
    setErrorOption('');
    setCustomErrorInput('');
    setSubPart('');
    setSubPartOption('');
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
      const safePart = sanitizeName(reportPayloadBase.part || 'Khong_Bo_Vi');
      const safeSubPart = reportPayloadBase.subPart ? sanitizeName(reportPayloadBase.subPart) : '';
      const safeOrder = sanitizeName(reportPayloadBase.order);
      const safeModel = reportPayloadBase.shoeModel ? sanitizeName(reportPayloadBase.shoeModel) : '';
      const safeColor = sanitizeName(reportPayloadBase.colorCode);
      const safeError = sanitizeName(reportPayloadBase.errorName);
      const safeSupplier = sanitizeName(reportPayloadBase.supplier);
      const safeFloor = sanitizeName(reportPayloadBase.floor);
      const partPrefix = safeSubPart ? `${safePart}_${safeSubPart}` : safePart;

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
        
        const modelPart = safeModel ? `${safeModel}_` : '';
        const fileName = `${partPrefix}_${safeOrder}_${modelPart}${safeColor}_${safeError}_${safeSupplier}_${safeFloor}_${i + 1}_${timestamp}.jpg`;
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
        <div className="flex-1 flex flex-col items-center justify-center p-6 bg-[#F8FAFC] relative z-50">
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
      {/* Industrial Header */}
      <header className="bg-slate-900 border-b border-slate-800 text-white px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between shadow-xs shrink-0 z-40 sticky top-0">
        <div className="flex items-center gap-3 sm:gap-6 min-w-0">
          <div className="flex items-center shrink-0">
            <div className="flex flex-col leading-none">
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-white font-mono">IQC PHOTO</span>
                <span className="text-[10px] font-mono px-1.5 py-0.2 bg-blue-600/30 text-blue-400 border border-blue-500/40 rounded font-semibold hidden xs:inline">PYV</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono tracking-wider mt-1 hidden sm:block">
                QUALITY ASSURANCE SYSTEM
              </span>
            </div>
          </div>

          {/* Navigation Tabs (Desktop / Tablet) */}
          <nav className="hidden md:flex items-center bg-slate-800/80 p-1 rounded-md border border-slate-700/80 font-mono text-xs">
            <button
              type="button"
              onClick={() => setActiveTab('create')}
              className={`px-3 py-1.5 rounded transition-all cursor-pointer font-bold ${activeTab === 'create' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`}
            >
              + TẠO BÁO CÁO
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-3 py-1.5 rounded transition-all cursor-pointer font-bold ${activeTab === 'history' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`}
            >
              LỊCH SỬ QC
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('admin')}
                className={`px-3 py-1.5 rounded transition-all cursor-pointer font-bold ${activeTab === 'admin' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:text-white hover:bg-slate-700/50'}`}
              >
                CẤU HÌNH ADMIN
              </button>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          {isAdmin && (
            <div className="bg-slate-800 text-blue-400 border border-blue-500/40 px-2 py-0.5 rounded text-[10px] font-mono font-bold hidden md:flex items-center gap-1 shrink-0">
              <ShieldCheck className="h-3 w-3 text-blue-400" />
              QUẢN TRỊ VIÊN
            </div>
          )}
          <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-300 font-mono shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>HỆ THỐNG ONLINE</span>
          </div>

          {/* User Profile Badge (Clickable for full profile on both Mobile and Desktop) */}
          <button
            type="button"
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-2 sm:gap-2.5 border-l border-slate-800 pl-2 sm:pl-3 bg-transparent border-none text-left cursor-pointer hover:bg-slate-800/80 p-1 rounded transition-colors min-w-0"
            title="Bấm để xem chi tiết thông tin nhân viên"
          >
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-300 shrink-0 font-bold font-mono text-xs">
              {(userProfile?.name || user.email?.split('@')[0] || 'QC').charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col min-w-0 text-left">
              <div 
                className="text-xs font-bold text-slate-100 tracking-tight leading-tight max-w-[140px] xs:max-w-[200px] sm:max-w-[280px] truncate" 
                title={userProfile?.name || user.email?.split('@')[0]}
              >
                {userProfile?.name || user.email?.split('@')[0]}
              </div>
              <div className="text-[10px] text-slate-400 font-mono flex items-center gap-1.5 leading-none mt-0.5">
                <span>MÃ NV: <strong className="text-slate-200">{userProfile?.employeeId || 'Khách'}</strong></span>
                {currentPart && <span className="text-blue-400 font-semibold hidden xs:inline">• {currentPart}</span>}
              </div>
            </div>
          </button>

          <button
            type="button"
            onClick={handleLogout}
            className="h-8 w-8 bg-slate-800 hover:bg-slate-700 border border-slate-700/80 flex items-center justify-center rounded transition-colors text-slate-300 hover:text-white cursor-pointer shrink-0"
            title="Đăng xuất khỏi hệ thống"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Content Workspace */}
      <main onScroll={handleScroll} className={`flex-1 overflow-y-auto p-3 sm:p-5 lg:p-6 pb-24 md:pb-6 bg-slate-100 ${activeTab === 'create' ? 'block' : 'hidden'}`}>
        
        <form onSubmit={handleSubmit} className="max-w-6xl mx-auto flex flex-col lg:grid lg:grid-cols-12 gap-5 pb-6">
            {/* Form Card: Specifications */}
            <section className="lg:col-span-7 bg-white rounded-lg border border-slate-200 shadow-xs p-4 sm:p-6 flex flex-col gap-4">
              <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-slate-900 text-white font-mono text-xs flex items-center justify-center font-bold">01</span>
                  <h2 className="m-0 text-xs sm:text-sm font-bold text-slate-900 font-mono uppercase tracking-wider">Thông Số Kiểm Định Lô Hàng</h2>
                </div>
                <span className="text-[11px] font-mono text-slate-500 font-semibold">
                  {currentPart || userProfile?.part || 'Đang chọn'}
                </span>
              </div>
              
              {/* QC Inspector Banner: Displays full inspector name clearly on Mobile & Desktop */}
              <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="flex items-center gap-2 min-w-0">
                  <UserIcon className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-slate-500 font-semibold text-[11px]">Nhân viên QC:</span>
                  <span className="font-bold text-slate-900 text-xs sm:text-sm break-words">
                    {userProfile?.name || user.email?.split('@')[0]}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="bg-white border border-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded text-[11px]">
                    Mã NV: <strong className="text-slate-900">{userProfile?.employeeId || 'QC'}</strong>
                  </span>
                  {userProfile?.floorGroup && (
                    <span className="bg-blue-50 border border-blue-200 text-blue-700 font-semibold px-2 py-0.5 rounded text-[11px]">
                      {userProfile.floorGroup}
                    </span>
                  )}
                </div>
              </div>
              
              {/* Date Input & Part (Bộ vị) */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="date" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center justify-between">
                    <span>Ngày Kiểm <span className="text-red-500">*</span></span>
                  </label>
                  <input 
                    type="date" 
                    id="date" 
                    required 
                    value={date} 
                    onChange={e => setDate(e.target.value)} 
                    className="h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-semibold text-sm w-full text-slate-900" 
                  />
                </div>
                
                <div className="flex flex-col gap-1.5 text-xs">
                  <label className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center justify-between">
                    <span>Bộ Vị <span className="text-red-500">*</span></span>
                    {!isAdmin && (!userProfile?.parts || userProfile.parts.length <= 1) && <Lock className="h-3 w-3 text-slate-400" />}
                  </label>
                  {isAdmin ? (
                    <select
                      value={currentPart}
                      onChange={(e) => handlePartChange(e.target.value)}
                      className="h-11 sm:h-10 px-3 bg-orange-50/60 border border-orange-300 rounded focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-bold text-slate-900 text-sm w-full truncate cursor-pointer"
                    >
                      <option value="">-- Chọn bộ vị --</option>
                      <option value="ĐẾ THÔ">ĐẾ THÔ</option>
                      <option value="ĐẾ PHUN SƠN">ĐẾ PHUN SƠN</option>
                      <option value="MẶT GIÀY">MẶT GIÀY</option>
                    </select>
                  ) : userProfile?.parts && userProfile.parts.length > 1 ? (
                    <select
                      value={currentPart}
                      onChange={(e) => handlePartChange(e.target.value)}
                      className="h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-bold text-slate-900 text-sm w-full truncate cursor-pointer"
                    >
                      {userProfile.parts.map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  ) : (
                    <div className="h-11 sm:h-10 px-3 bg-slate-100 border border-slate-200 rounded font-bold text-slate-600 text-sm select-none truncate flex items-center">
                      {currentPart || userProfile?.part || 'Bộ vị (Chưa gán...)'}
                    </div>
                  )}
                </div>
              </div>

              {/* Thành phần nhỏ / Chi tiết bộ vị */}
              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <label htmlFor="subPart" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                    Thành phần nhỏ <span className="text-red-500">*</span>
                  </label>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {subPart ? `Đang chọn: ${subPart}` : 'Bắt buộc'}
                  </span>
                </div>
                <div className="relative">
                  <select
                    id="subPart"
                    required
                    value={subPartOption}
                    onChange={e => {
                      const val = e.target.value;
                      setSubPartOption(val);
                      if (val !== 'CUSTOM' && val !== '') {
                        setSubPart(val);
                      } else if (val === 'CUSTOM') {
                        setSubPart('');
                      } else {
                        setSubPart('');
                      }
                    }}
                    className="w-full h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-bold text-slate-900 text-sm cursor-pointer"
                  >
                    <option value="" disabled>-- Chọn thành phần nhỏ * --</option>
                    {subPartOptions.map(sp => (
                      <option key={sp} value={sp}>{sp}</option>
                    ))}
                    <option value="CUSTOM">➕ Tự nhập thành phần khác...</option>
                  </select>
                </div>

                {subPartOption === 'CUSTOM' && (
                  <input
                    type="text"
                    required
                    placeholder="Nhập tên thành phần nhỏ cụ thể (VD: Gót đế, Sơn viền, Lưỡi gà...)..."
                    value={subPart}
                    onChange={e => setSubPart(e.target.value)}
                    className="h-11 sm:h-10 px-3 bg-orange-50/50 border border-orange-300 rounded focus:bg-white focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all font-bold text-slate-900 text-sm"
                  />
                )}

                {/* Quick select chips for rapid 1-tap choice on factory floor */}
                {subPartOptions.length > 0 && !subPartOption && (
                  <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none">
                    <span className="text-[10px] text-slate-400 font-mono uppercase shrink-0">GỢI Ý:</span>
                    {subPartOptions.slice(0, 6).map(sp => (
                      <button
                        key={sp}
                        type="button"
                        onClick={() => { setSubPartOption(sp); setSubPart(sp); }}
                        className="text-xs font-semibold bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-300 text-slate-700 px-2.5 py-1 rounded border border-slate-200 whitespace-nowrap transition-colors cursor-pointer shrink-0"
                      >
                        {sp}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Floor and Order Block */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                
                {/* LẦU / KHU VỰC DROPDOWN */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="floor" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                      Lầu / Khu vực <span className="text-red-500">*</span>
                    </label>
                  </div>
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
                    className="h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-bold text-slate-900 text-sm cursor-pointer"
                  >
                    <option value="" disabled>-- Chọn lầu * --</option>
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
                      className="mt-1 h-10 px-3 bg-orange-50/50 border border-orange-300 rounded focus:bg-white focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all font-bold text-slate-900 text-sm"
                    />
                  )}
                </div>

                {/* ĐƠN HÀNG PO: NUMERIC OR CHECK "KHÔNG" */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="order" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                      Đơn hàng PO <span className="text-red-500">*</span>
                    </label>
                    <label 
                      className={`flex items-center gap-1 cursor-pointer px-1.5 py-0.5 rounded text-[11px] font-mono font-bold transition-all border ${
                        isNoPo 
                          ? 'bg-red-50 text-red-700 border-red-200' 
                          : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                      }`}
                      title="Nếu không có PO hoặc chưa có đơn hàng, hãy tích chọn 'Không'"
                    >
                      <input 
                        type="checkbox" 
                        id="noPoCheck"
                        checked={isNoPo}
                        onChange={e => {
                          const checked = e.target.checked;
                          setIsNoPo(checked);
                          if (checked) {
                            setOrder('KHÔNG');
                          } else {
                            setOrder('');
                          }
                        }}
                        className="h-3.5 w-3.5 rounded text-red-600 focus:ring-red-500 border-slate-300 cursor-pointer"
                      />
                      <span>Không PO</span>
                    </label>
                  </div>
                  <input 
                    type="text" 
                    id="order" 
                    required={!isNoPo}
                    disabled={isNoPo}
                    pattern={isNoPo ? undefined : "[0-9]*"}
                    inputMode={isNoPo ? undefined : "numeric"}
                    placeholder={isNoPo ? "KHÔNG CÓ PO" : "Số PO (VD: 123456) *"} 
                    value={order} 
                    onChange={handleOrderChange}
                    className={`h-11 sm:h-10 px-3 border rounded outline-none transition-all font-mono font-bold text-sm ${
                      isNoPo 
                        ? 'bg-slate-100 border-slate-200 text-slate-500 italic cursor-not-allowed' 
                        : 'bg-white border-slate-300 hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 text-slate-900'
                    }`}
                    title={isNoPo ? "Đã chọn không có PO" : "Mã PO bắt buộc là số"}
                  />
                </div>
              </div>

              {/* HÀNG 1: HÌNH THỂ HOẶC MÃ MÀU (KHÔNG HIỂN THỊ CÙNG LÚC) & XƯỞNG CUNG ỨNG */}
              <div className="grid grid-cols-2 gap-3 text-xs">
                
                {/* 1. BỘ VỊ ĐẾ (ĐẾ THÔ + PHUN SƠN): CHỈ HIỂN THỊ "NHẬP HÌNH THỂ", ẨN Ô MÃ MÀU */}
                {isSolePart && (
                  <div className="flex flex-col gap-1.5 relative">
                    <div className="flex items-center justify-between">
                      <label htmlFor="shoeModel" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
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
                        id="shoeModel"
                        required
                        value={shoeModel}
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          setShoeModel(val);
                          setColorCode(val);
                        }}
                        onFocus={() => setShowModelDropdown(true)}
                        placeholder="NHẬP HÌNH THỂ (VD: FCXV5) *"
                        className="w-full h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-mono font-bold text-slate-900 text-sm uppercase pr-8"
                      />
                      <button
                        type="button"
                        onClick={() => setShowModelDropdown(!showModelDropdown)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                        title="Mở danh sách hình thể"
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${showModelDropdown ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {/* Dropdown list of models for Sole */}
                    {showModelDropdown && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setShowModelDropdown(false)} />
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded shadow-lg z-30 p-2 space-y-1.5">
                          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                            <span className="text-[10px] font-bold font-mono text-slate-700 uppercase">
                              DANH SÁCH HÌNH THỂ {supplier ? `(${supplier})` : ''}
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowModelDropdown(false)}
                              className="text-[10px] text-slate-400 hover:text-slate-700 font-mono font-bold cursor-pointer"
                            >
                              ĐÓNG ✕
                            </button>
                          </div>
                          <input
                            type="text"
                            value={modelFilterQuery}
                            onChange={e => setModelFilterQuery(e.target.value)}
                            placeholder="Lọc nhanh (VD: FCXV5)..."
                            className="w-full p-2 text-xs font-mono font-semibold border border-slate-200 rounded outline-none focus:ring-1 focus:ring-blue-600 bg-slate-50 uppercase"
                            autoFocus
                          />
                          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                            {availableModels
                              .filter(m => !modelFilterQuery.trim() || m.toLowerCase().includes(modelFilterQuery.toLowerCase()))
                              .map(m => (
                                <button
                                  key={m}
                                  type="button"
                                  onClick={() => selectModel(m)}
                                  className={`w-full text-left p-2 rounded text-xs font-mono font-bold flex items-center justify-between hover:bg-blue-50 transition-colors cursor-pointer ${shoeModel === m ? 'text-blue-700 bg-blue-50 font-extrabold' : 'text-slate-800'}`}
                                >
                                  <span>{m}</span>
                                  {shoeModel === m && <Check className="h-3.5 w-3.5 text-blue-600" />}
                                </button>
                              ))}
                            {availableModels.filter(m => !modelFilterQuery.trim() || m.toLowerCase().includes(modelFilterQuery.toLowerCase())).length === 0 && (
                              <div className="text-center py-2 text-slate-400 text-xs italic">
                                Không có trong list. Bạn có thể tự gõ tên hình thể.
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* 2. BỘ VỊ MẶT GIÀY: CHỈ HIỂN THỊ "NHẬP MÃ MÀU", ẨN Ô HÌNH THỂ */}
                {!isSolePart && (
                  <div className="flex flex-col gap-1.5 relative">
                    <div className="flex items-center justify-between">
                      <label htmlFor="colorCode" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono flex items-center gap-1">
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
                        id="colorCode" 
                        required 
                        placeholder="NHẬP MÃ MÀU (VD: MFCXVLI5) *" 
                        value={colorCode} 
                        onChange={e => {
                          const val = e.target.value.toUpperCase();
                          setColorCode(val);
                          setShoeModel(val);
                        }}
                        onFocus={() => setShowColorDropdown(true)}
                        className="w-full h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-emerald-600 focus:border-emerald-600 outline-none transition-all font-mono font-bold text-slate-900 uppercase text-sm pr-8" 
                      />
                      <button
                        type="button"
                        onClick={() => setShowColorDropdown(!showColorDropdown)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer p-1"
                        title="Mở danh sách mã màu"
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${showColorDropdown ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {/* Dropdown list for NHẬP MÃ MÀU (Mặt giày) */}
                    {showColorDropdown && (
                      <>
                        <div className="fixed inset-0 z-20" onClick={() => setShowColorDropdown(false)} />
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-300 rounded shadow-lg z-30 p-2 space-y-1.5">
                          <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                            <span className="text-[10px] font-bold font-mono text-emerald-800 uppercase">
                              DANH SÁCH MÃ MÀU MẶT GIÀY
                            </span>
                            <button
                              type="button"
                              onClick={() => setShowColorDropdown(false)}
                              className="text-[10px] text-slate-400 hover:text-slate-700 font-mono font-bold cursor-pointer"
                            >
                              ĐÓNG ✕
                            </button>
                          </div>
                          <input
                            type="text"
                            value={colorFilterQuery}
                            onChange={e => setColorFilterQuery(e.target.value)}
                            placeholder="Lọc nhanh (VD: MFCXVLI5)..."
                            className="w-full p-2 text-xs font-mono font-semibold border border-slate-200 rounded outline-none focus:ring-1 focus:ring-emerald-600 bg-slate-50 uppercase"
                            autoFocus
                          />
                          <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                            {availableColors
                              .filter(item => !colorFilterQuery.trim() || item.toLowerCase().includes(colorFilterQuery.toLowerCase()))
                              .map(item => (
                                <button
                                  key={item}
                                  type="button"
                                  onClick={() => selectColor(item)}
                                  className={`w-full text-left p-2 rounded text-xs font-mono font-bold flex items-center justify-between hover:bg-emerald-50 transition-colors cursor-pointer ${colorCode === item ? 'text-emerald-700 bg-emerald-50 font-extrabold' : 'text-slate-800'}`}
                                >
                                  <span>{item}</span>
                                  {colorCode === item && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                                </button>
                              ))}
                            {availableColors.filter(item => !colorFilterQuery.trim() || item.toLowerCase().includes(colorFilterQuery.toLowerCase())).length === 0 && (
                              <div className="text-center py-2 text-slate-400 text-xs italic">
                                Không có trong danh sách. Bạn có thể tự gõ mã màu.
                              </div>
                            )}
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}

                {/* XƯỞNG CUNG ỨNG: DROPDOWN CHOSEN */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <label htmlFor="supplier" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                      Xưởng cung ứng <span className="text-red-500">*</span>
                    </label>
                  </div>
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
                    className="h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-bold text-slate-900 text-sm cursor-pointer"
                  >
                    <option value="" disabled>-- Chọn xưởng * --</option>
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
                      onChange={e => setSupplier(e.target.value.toUpperCase())}
                      className="mt-1 h-10 px-3 bg-orange-50/50 border border-orange-300 rounded focus:bg-white focus:ring-1 focus:ring-orange-500 focus:border-orange-500 outline-none transition-all font-bold text-slate-900 text-sm"
                    />
                  )}
                </div>
              </div>

              {/* HÀNG 2: TÊN LOẠI LỖI KỸ THUẬT: DROPDOWN OR ADD NEW */}
              <div className="flex flex-col gap-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <label htmlFor="errorDropdown" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                    Loại lỗi kỹ thuật <span className="text-red-500">*</span>
                  </label>
                </div>
                
                <select
                  id="errorDropdown"
                  required
                  value={errorOption}
                  onChange={e => {
                    setErrorOption(e.target.value);
                    if (e.target.value !== 'CUSTOM') setCustomErrorInput('');
                  }}
                  className="h-11 sm:h-10 px-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all font-semibold text-slate-900 text-sm cursor-pointer"
                >
                  <option value="">-- Chọn loại lỗi đang bị * --</option>
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
                    className="mt-1 h-11 sm:h-10 px-3 border border-blue-400 rounded focus:ring-1 focus:ring-blue-600 outline-none transition-all font-semibold bg-blue-50/20 text-slate-900 text-sm"
                  />
                )}
              </div>

              {/* GHI CHÚ CHI TIẾT */}
              <div className="flex flex-col gap-1.5 text-xs">
                <label htmlFor="note" className="text-[11px] font-bold text-slate-700 uppercase tracking-wider font-mono">
                  Ghi chú kiểm tra (Tùy chọn)
                </label>
                <textarea
                  id="note"
                  placeholder="Mô tả cụ thể vị trí lỗi, mức độ hoặc lưu ý xử lý nếu có..."
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={2}
                  className="p-3 bg-white border border-slate-300 rounded hover:border-slate-400 focus:bg-white focus:ring-1 focus:ring-blue-600 focus:border-blue-600 outline-none transition-all text-slate-900 text-sm resize-y min-h-[70px]"
                />
              </div>
            </section>

            {/* Upload Card: Evidence */}
            <section className="lg:col-span-5 bg-white rounded-lg border border-slate-200 shadow-xs p-4 sm:p-6 flex flex-col gap-4">
              <div className="border-b border-slate-200 pb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-5 h-5 rounded bg-slate-900 text-white font-mono text-xs flex items-center justify-center font-bold">02</span>
                  <h2 className="m-0 text-xs sm:text-sm font-bold text-slate-900 font-mono uppercase tracking-wider">Minh Chứng Hình Ảnh Lỗi</h2>
                </div>
                <span className="text-[11px] font-mono text-slate-500 font-bold">
                  {files.length} ẢNH
                </span>
              </div>

              {success && (
                <div className="rounded bg-emerald-50 p-3.5 border border-emerald-200 flex flex-col gap-1 shrink-0 animate-in fade-in duration-200">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span className="text-xs font-bold text-emerald-900 font-mono">ĐÃ GỬI BÁO CÁO THÀNH CÔNG!</span>
                  </div>
                  <p className="text-xs text-emerald-800 ml-6 leading-relaxed">
                    {successMessage || 'Biên bản đã được lưu trữ và tiến hành tải ngầm lên hệ thống.'}
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded bg-red-50 p-3.5 border border-red-200 shrink-0 flex items-start gap-2 text-xs text-red-900 font-semibold leading-relaxed">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action Buttons for Mobile & Desktop */}
              <div className="grid grid-cols-2 gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="h-11 sm:h-10 px-3 bg-slate-900 hover:bg-slate-800 active:bg-black text-white font-mono font-bold text-xs uppercase tracking-wider rounded border border-slate-800 flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  <Camera className="h-4 w-4 text-blue-400" />
                  <span>Chụp Camera</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="h-11 sm:h-10 px-3 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-800 font-mono font-bold text-xs uppercase tracking-wider rounded border border-slate-300 flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <ImageIcon className="h-4 w-4 text-slate-600" />
                  <span>Chọn Từ Máy</span>
                </button>

                {/* Hidden File Inputs */}
                <input
                  id="camera-upload"
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handleFileChange}
                  ref={cameraInputRef}
                />
                <input
                  id="file-upload"
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                  ref={fileInputRef}
                />
              </div>

              {/* Drag and Drop Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-slate-300 hover:border-blue-500 bg-slate-50/70 hover:bg-blue-50/20 cursor-pointer rounded p-5 text-center transition-all shrink-0 select-none"
              >
                <div className="flex flex-col items-center justify-center space-y-1">
                  <UploadCloud className="h-7 w-7 text-slate-400" />
                  <div className="font-bold text-xs tracking-wider text-slate-700 uppercase font-mono">
                    Kéo thả ảnh hoặc nhấn để tải lên
                  </div>
                  <div className="text-[11px] text-slate-500 font-mono">
                    Nén tự động chuẩn HD • Tối ưu băng thông mạng nhà máy
                  </div>
                </div>
              </div>

              {/* Files grid preview */}
              {files.length > 0 ? (
                <div className="flex-1 overflow-y-auto min-h-[140px] max-h-[300px]">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pr-1 pb-2">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="relative group aspect-square bg-slate-900 rounded overflow-hidden border border-slate-200 flex flex-col shadow-xs">
                        <ImagePreview file={file} index={index} />
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="absolute top-1 right-1 bg-red-600 hover:bg-red-700 text-white rounded p-1 shadow cursor-pointer border-none flex items-center justify-center z-10 transition-colors"
                          title="Xóa ảnh này"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center py-6 text-center text-slate-400 border border-slate-100 rounded">
                  <ImageIcon className="h-8 w-8 text-slate-300 mb-1" />
                  <span className="text-xs font-mono">Chưa có ảnh nào được đính kèm</span>
                  <span className="text-[10px] text-slate-400 mt-0.5">Yêu cầu tối thiểu 1 ảnh minh chứng lỗi</span>
                </div>
              )}

              {/* Submit CTA */}
              <div className="mt-auto shrink-0 pt-2 flex flex-col gap-2">
                <button
                  type="submit"
                  className="bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white text-xs py-3.5 px-4 rounded font-mono font-bold uppercase tracking-wider border border-blue-500/50 flex w-full items-center justify-center gap-2 transition-colors shadow-xs cursor-pointer"
                >
                  <UploadCloud className="h-4.5 w-4.5" />
                  <span>XÁC NHẬN & GỬI BÁO CÁO</span>
                </button>
              </div>
            </section>
          </form>
        </main>

     <main onScroll={handleScroll} className={`flex-1 overflow-y-auto md:overflow-hidden pb-24 md:pb-0 bg-slate-100 ${activeTab === 'history' ? 'flex flex-col' : 'hidden'}`}>
        <QCHistory user={user} token={token} userProfile={userProfile} onNavigateToCreate={handleNavigateToCreate} isActive={activeTab === 'history'} />
      </main>

      {isAdmin && (
        <main onScroll={handleScroll} className={`flex-1 overflow-y-auto md:overflow-hidden pb-24 md:pb-0 bg-slate-100 ${activeTab === 'admin' ? 'flex flex-col' : 'hidden'}`}>
          <AdminPanel onMappingChange={loadConfiguration} />
        </main>
      )}

      {/* Industrial Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-slate-900 border-t border-slate-800 pb-safe h-14 flex items-center justify-around z-50 shadow-lg">
        <button
          type="button"
          onClick={() => setActiveTab('create')}
          className={`flex-1 h-full flex flex-col items-center justify-center gap-1 cursor-pointer border-none bg-transparent select-none transition-colors ${activeTab === 'create' ? 'text-blue-400 font-bold border-t-2 border-blue-500 -mt-[2px]' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <PlusCircle className="h-5 w-5" />
          <span className="text-[10px] font-mono tracking-wider">BÁO CÁO</span>
        </button>
        
        <button
          type="button"
          onClick={() => setActiveTab('history')}
          className={`flex-1 h-full flex flex-col items-center justify-center gap-1 cursor-pointer border-none bg-transparent select-none transition-colors ${activeTab === 'history' ? 'text-blue-400 font-bold border-t-2 border-blue-500 -mt-[2px]' : 'text-slate-400 hover:text-slate-200'}`}
        >
          <History className="h-5 w-5" />
          <span className="text-[10px] font-mono tracking-wider">LỊCH SỬ</span>
        </button>
        
        {isAdmin && (
          <button
            type="button"
            onClick={() => setActiveTab('admin')}
            className={`flex-1 h-full flex flex-col items-center justify-center gap-1 cursor-pointer border-none bg-transparent select-none transition-colors ${activeTab === 'admin' ? 'text-blue-400 font-bold border-t-2 border-blue-500 -mt-[2px]' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Settings className="h-5 w-5" />
            <span className="text-[10px] font-mono tracking-wider">QUẢN TRỊ</span>
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

      {/* Employee Profile Detail Modal (Full Name & Account Specs) */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-lg border border-slate-300 shadow-2xl max-w-md w-full overflow-hidden animate-in zoom-in-95 duration-150 font-sans">
            <div className="bg-slate-900 px-4 py-3 border-b border-slate-800 flex items-center justify-between text-white">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded bg-blue-600 flex items-center justify-center text-xs font-mono font-bold">
                  QC
                </div>
                <h3 className="text-xs sm:text-sm font-bold font-mono uppercase tracking-wider text-slate-100">
                  Thông Tin Nhân Viên QC
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowProfileModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 flex flex-col gap-4 text-xs">
              <div className="flex items-center gap-3.5 bg-slate-50 border border-slate-200 p-3.5 rounded-lg">
                <div className="w-12 h-12 rounded-lg bg-blue-600 text-white font-mono font-bold text-lg flex items-center justify-center shrink-0">
                  {(userProfile?.name || user.email?.split('@')[0] || 'QC').charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-[11px] font-mono uppercase tracking-wider text-slate-500">Họ và Tên Nhân Viên</span>
                  <span className="text-base font-bold text-slate-900 break-words">
                    {userProfile?.name || user.email?.split('@')[0]}
                  </span>
                  <span className="text-[11px] font-mono text-slate-500 mt-0.5">
                    Email: <span className="text-slate-700 font-semibold">{user.email}</span>
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 font-mono">
                <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase">Mã Nhân Viên</span>
                  <span className="text-sm font-bold text-slate-900 mt-0.5">{userProfile?.employeeId || 'QC'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase">Vai Trò Hệ Thống</span>
                  <span className="text-xs font-bold text-blue-700 mt-0.5 uppercase">
                    {userProfile?.role === 'admin' ? 'Quản Trị Viên (Admin)' : 'Nhân Viên QC'}
                  </span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase">Bộ Vị Đang Chọn</span>
                  <span className="text-xs font-bold text-slate-900 mt-0.5">{currentPart || userProfile?.part || 'Chưa chọn'}</span>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase">Tổ / Khu Vực</span>
                  <span className="text-xs font-bold text-slate-900 mt-0.5">{userProfile?.floorGroup || 'Mặc định'}</span>
                </div>
              </div>

              {userProfile?.permittedFloors && userProfile.permittedFloors.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded p-2.5 flex flex-col gap-1 font-mono">
                  <span className="text-[10px] text-slate-500 uppercase">Lầu Được Phép Báo Cáo</span>
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    {userProfile.permittedFloors.map(f => (
                      <span key={f} className="bg-white border border-slate-300 text-slate-700 px-2 py-0.5 rounded text-[11px] font-bold">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-3 py-2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded font-mono font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  ĐĂNG XUẤT
                </button>
                <button
                  type="button"
                  onClick={() => setShowProfileModal(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded font-mono font-bold text-xs cursor-pointer transition-colors"
                >
                  ĐÓNG
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </>
      )}
    </div>
  );
}
