import React, { useState, useEffect } from 'react';
import { db } from '../lib/firebase';
import { 
  collection, 
  getDocs, 
  doc, 
  setDoc, 
  deleteDoc, 
  writeBatch,
  query,
  limit,
  where,
  getDoc
} from 'firebase/firestore';
import { 
  Users, 
  Sliders, 
  Plus, 
  Trash2, 
  Edit, 
  Save, 
  Undo2, 
  Share2, 
  FileSpreadsheet, 
  CheckCircle, 
  X, 
  ShieldCheck, 
  Loader2, 
  AlertCircle,
  Hash,
  RefreshCw
} from 'lucide-react';

export interface QCUser {
  email: string;
  name: string;
  employeeId: string;
  floorGroup: string;
  permittedFloors: string[];
  role?: 'admin' | 'user';
  part?: 'ĐẾ' | 'MẶT GIÀY' | '';
}

export interface POMapping {
  order: string;
  colorCode: string;
}

const withTimeout = <T,>(promise: Promise<T>, ms: number, errorMsg = 'Action timeout exceeded'): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(errorMsg)), ms);
  });
  promise.catch(() => {});
  timeoutPromise.catch(() => {});
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId));
};

export const sanitizeMap = (rawMap: any): Record<string, string> => {
  if (!rawMap) return {};
  const cleaned: Record<string, string> = {};

  const processItem = (k: string, v: any) => {
    if (v && typeof v === 'object') {
      const order = v.order !== undefined ? v.order : (v.po !== undefined ? v.po : (v.poNo !== undefined ? v.poNo : v.id));
      const color = v.colorCode !== undefined ? v.colorCode : (v.color !== undefined ? v.color : v.colorName);
      if (order !== undefined && color !== undefined) {
        cleaned[String(order).trim()] = String(color).trim();
      }
    } else if (v !== undefined && v !== null && String(v).trim() !== '') {
      cleaned[String(k).trim()] = String(v).trim();
    }
  };

  if (Array.isArray(rawMap)) {
    for (let i = 0; i < rawMap.length; i++) {
      processItem(String(i), rawMap[i]);
    }
  } else if (typeof rawMap === 'object') {
    for (const key of Object.keys(rawMap)) {
      processItem(key, rawMap[key]);
    }
  }

  // Filter out invalid/artifact keys like "0" or "1" if they are residues of treatment as standard object indices or arrays, or generic object representations
  for (const k of Object.keys(cleaned)) {
    if (cleaned[k] === 'undefined' || cleaned[k] === 'null' || cleaned[k].includes('[object')) {
      delete cleaned[k];
    }
  }
  if (cleaned["0"] !== undefined && Object.keys(cleaned).length > 1) {
    delete cleaned["0"];
  }

  return cleaned;
};

interface AdminPanelProps {
  onMappingChange?: () => void;
}

export const AdminPanel = React.memo(function AdminPanel({ onMappingChange }: AdminPanelProps) {
  const [subTab, setSubTab] = useState<'users' | 'po_colors' | 'options'>('users');
  
  // Data lists
  const [users, setUsers] = useState<QCUser[]>([]);
  const [mappings, setMappings] = useState<POMapping[]>([]);
  
  // States
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingMappings, setLoadingMappings] = useState(true);
  const [adminError, setAdminError] = useState('');
  const [adminSuccess, setAdminSuccess] = useState('');

  // App Config States
  const [configPartTab, setConfigPartTab] = useState<'de' | 'matgiay'>('de');
  const [fullAppConfig, setFullAppConfig] = useState<any>({});
  const [appFloorsStr, setAppFloorsStr] = useState('');
  const [appErrorsStr, setAppErrorsStr] = useState('');
  const [appSuppliersStr, setAppSuppliersStr] = useState('');
  const [isSavingAppConfig, setIsSavingAppConfig] = useState(false);
  const [loadingAppConfig, setLoadingAppConfig] = useState(true);

  // User form state
  const [userEmail, setUserEmail] = useState('');
  const [userName, setUserName] = useState('');
  const [userEmployeeId, setUserEmployeeId] = useState('');
  const [userFloorGroup, setUserFloorGroup] = useState('K73F');
  const [userPermittedFloorsStr, setUserPermittedFloorsStr] = useState('K73A, K73B, K73C, K73D');
  const [userRole, setUserRole] = useState<'admin' | 'user'>('user');
  const [userPart, setUserPart] = useState<'ĐẾ' | 'MẶT GIÀY' | ''>('');
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);

  // Single PO mapping form state
  const [poNo, setPoNo] = useState('');
  const [poColor, setPoColor] = useState('');
  const [isSavingMapping, setIsSavingMapping] = useState(false);

  // Bulk PO mapping form state
  const [bulkText, setBulkText] = useState('');
  const [isBulkImporting, setIsBulkImporting] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [poSearch, setPoSearch] = useState('');
  
  const [isSyncingAll, setIsSyncingAll] = useState(false);

  // Custom Confirm Dialog States
  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    type: 'delete_user' | 'delete_mapping' | 'delete_all';
    targetId?: string;
  }>({ isOpen: false, title: '', message: '', type: 'delete_user' });

  // Load QC Users
  const fetchUsers = async () => {
    if (users.length === 0) setLoadingUsers(true);
    try {
      const colRef = collection(db, 'qc_users');
      const snapshot: any = await withTimeout(getDocs(colRef), 10000); // reduced timeout to fail fast
      const list: QCUser[] = [];
      snapshot.forEach((doc: any) => {
        const d = doc.data();
        list.push({
          email: doc.id,
          name: d.name || '',
          employeeId: d.employeeId || '',
          floorGroup: d.floorGroup || '',
          permittedFloors: Array.isArray(d.permittedFloors) ? d.permittedFloors : [],
          role: d.role || 'user',
          part: d.part || ''
        });
      });

      // If empty in Firestore, load from standard initial or local
      if (list.length === 0) {
        // Seeding standard users
        const defaultUsers: QCUser[] = [
          {
            email: 'pyvqcproject@gmail.com',
            name: 'Admin',
            employeeId: 'ADMIN-01',
            floorGroup: 'K73F',
            permittedFloors: ['K73A', 'K73B', 'K73C', 'K73D'],
            role: 'admin',
            part: ''
          }
        ];
        // Save them to Firestore for demo (without blocking UI too long)
        Promise.all(defaultUsers.map(u => 
          setDoc(doc(db, 'qc_users', u.email.toLowerCase()), {
            name: u.name,
            employeeId: u.employeeId,
            floorGroup: u.floorGroup,
            permittedFloors: u.permittedFloors,
            role: u.role,
            part: u.part
          }).catch(console.warn)
        ));
        list.push(...defaultUsers);
      }

      setUsers(list);
      localStorage.setItem('local_qc_users', JSON.stringify(list));
    } catch (err: any) {
      console.warn("Load users failed:", err);
      // Fallback local
      const local = localStorage.getItem('local_qc_users');
      if (local) {
        setUsers(JSON.parse(local));
      } else {
        const defaultUsers: QCUser[] = [
          {
            email: 'pyvqcproject@gmail.com',
            name: 'Admin',
            employeeId: 'ADMIN-01',
            floorGroup: 'K73F',
            permittedFloors: ['K73A', 'K73B', 'K73C', 'K73D'],
            role: 'admin',
            part: ''
          }
        ];
        setUsers(defaultUsers);
        localStorage.setItem('local_qc_users', JSON.stringify(defaultUsers));
        setAdminError(`Lỗi kết nối CSDL hiện tại: ${err.message}`);
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  // HELPER: Chunked Save
  const saveMappingsInChunks = async (fullMapData: Record<string, string>, timeoutPerChunk = 15000) => {
    const keys = Object.keys(fullMapData);
    const CHUNK_SIZE = 15000;
    const updateDoc = (await import('firebase/firestore')).updateDoc;
    const deleteField = (await import('firebase/firestore')).deleteField;

    const totalChunks = Math.ceil(keys.length / CHUNK_SIZE);
    
    // Save chunks
    for (let i = 0; i < Math.max(totalChunks, 1); i++) {
        const chunkKeys = keys.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
        const chunkMap: Record<string, string> = {};
        chunkKeys.forEach(k => chunkMap[k] = fullMapData[k]);
        
        const docId = i === 0 ? 'po_mappings_global' : `po_mappings_global_${i + 1}`;
        const docRef = doc(db, 'settings', docId);
        await withTimeout(setDoc(docRef, { map: chunkMap }, { merge: false }), timeoutPerChunk, `Lỗi timeout kết nối đoạn ${i + 1}. Hãy mở Tab Mới nếu đang dùng Iframe.`);
    }
    
    // Clean up older leftover chunks up to 10 to prevent ghostly merges
    for (let i = Math.max(totalChunks, 1); i < 10; i++) {
        const docId = i === 0 ? 'po_mappings_global' : `po_mappings_global_${i + 1}`;
        try {
           await setDoc(doc(db, 'settings', docId), { map: {} });
        } catch(e) {}
    }
  };

  // Load PO mappings
  const fetchMappings = async (search = poSearch) => {
    if (mappings.length === 0) setLoadingMappings(true);
    try {
      let fullMapData: Record<string, string> = {};
      let hasData = false;

      // Read chunk 0
      const docRef0 = doc(db, 'settings', 'po_mappings_global');
      const docSnap0: any = await withTimeout(getDoc(docRef0), 15000); // lower for background sync
      if (docSnap0.exists() && docSnap0.data().map) {
          Object.assign(fullMapData, docSnap0.data().map);
          hasData = true;
      }

      // Read chunks 1 to 9 (parallelized safely)
      const chunkPromises = [];
      for (let i = 1; i < 10; i++) {
          const docId = `po_mappings_global_${i + 1}`;
          const chunkRef = doc(db, 'settings', docId);
          chunkPromises.push(withTimeout(getDoc(chunkRef), 15000).catch(() => null));
      }
      const snaps = await Promise.all(chunkPromises);
      snaps.forEach((snap: any) => {
          if (snap && snap.exists() && snap.data().map) {
              Object.assign(fullMapData, snap.data().map);
              hasData = true;
          }
      });

      if (!hasData) {
        // Seed default mappings
        fullMapData = {
          '111': 'Navy-01',
          '222': 'Crimson-Red',
          '333': 'Charcoal-Black',
          '12345': 'Emerald-Green-02',
          '67890': 'Sky-Blue-05',
          '77777': 'Sunny-Yellow'
        };
        saveMappingsInChunks(fullMapData).catch(console.warn);
      } else {
        fullMapData = sanitizeMap(fullMapData);
      }

      let list: POMapping[] = Object.keys(fullMapData).map(order => ({
        order,
        colorCode: fullMapData[order]
      }));

      if (search.trim()) {
        const uppercaseSearch = search.trim().toUpperCase();
        list = list.filter(m => m.order.includes(uppercaseSearch));
      }

      // Sort numerically or alphabetically
      list.sort((a, b) => {
        const an = parseInt(a.order, 10);
        const bn = parseInt(b.order, 10);
        if (isNaN(an) || isNaN(bn)) return a.order.localeCompare(b.order);
        return a.order.localeCompare(b.order, undefined, { numeric: true });
      });

      // Limit to 150 for rendering speed manually if needed
      if (list.length > 150 && !search.trim()) {
        list = list.slice(0, 150);
      }

      setMappings(list);
      // Save to localStorage for client lookup
      localStorage.setItem('local_po_color_mappings', JSON.stringify(fullMapData));
    } catch (err: any) {
      console.warn("Load mappings failed:", err);
      // Fallback local
      const local = localStorage.getItem('local_po_color_mappings');
      if (local) {
        const parsed = JSON.parse(local);
        const cleaned = sanitizeMap(parsed);
        const list = Object.keys(cleaned).map(order => ({ order, colorCode: cleaned[order] })).slice(0, 150);
        setMappings(list);
        setAdminError(`Lỗi mạng (Cục bộ): ${err.message}`);
      } else {
        const defaultMapData = {
          '111': 'Navy-01',
          '222': 'Crimson-Red',
          '333': 'Charcoal-Black',
          '12345': 'Emerald-Green-02',
          '67890': 'Sky-Blue-05',
          '77777': 'Sunny-Yellow'
        };
        const list = Object.keys(defaultMapData).map(order => ({ order, colorCode: defaultMapData[order as keyof typeof defaultMapData] })).slice(0, 150);
        setMappings(list);
        localStorage.setItem('local_po_color_mappings', JSON.stringify(defaultMapData));
      }
    } finally {
      setLoadingMappings(false);
    }
  };

  // Load App Config
  const fetchAppConfig = async () => {
    if (!appFloorsStr) setLoadingAppConfig(true);
    try {
      const configRef = doc(db, 'settings', 'app_config');
      const configSnap: any = await withTimeout(getDoc(configRef), 10000);
      
      let configData: any = {};
      if (configSnap.exists()) {
        configData = configSnap.data();
      } else {
        const local = localStorage.getItem('local_app_config');
        if (local) {
          try { configData = JSON.parse(local); } catch(e) {}
        }
      }
      
      setFullAppConfig(configData);
      const currentData = configData['de'] || configData;
      setAppFloorsStr((currentData.floors || []).join(', '));
      setAppErrorsStr((currentData.errors || []).join(', '));
      setAppSuppliersStr((currentData.suppliers || []).join(', '));
      
      if (Object.keys(configData).length > 0) {
        localStorage.setItem('local_app_config', JSON.stringify(configData));
      }
    } catch (err: any) {
      console.warn("Failed to load app config, using defaults", err);
    } finally {
      setLoadingAppConfig(false);
    }
  };

  useEffect(() => {
    // 1. Instantly load QC Users from localStorage for zero-latency display
    const localUsers = localStorage.getItem('local_qc_users');
    if (localUsers) {
      try {
        setUsers(JSON.parse(localUsers));
      } catch (e) {}
    }

    // 2. Instantly load PO mappings from localStorage for zero-latency display
    const localMappings = localStorage.getItem('local_po_color_mappings');
    if (localMappings) {
      try {
        const cleaned = sanitizeMap(JSON.parse(localMappings));
        const list = Object.keys(cleaned).map(order => ({ order, colorCode: cleaned[order] }));
        if (list.length > 0) {
          setMappings(list.slice(0, 150));
        }
      } catch (e) {}
    }

    fetchUsers();
    fetchMappings();
    fetchAppConfig();
  }, []);

  const handleConfigTabChange = (newTab: 'de' | 'matgiay') => {
    // Save current strings to memory
    const updatedConfig = {
      ...fullAppConfig,
      [configPartTab]: {
        floors: appFloorsStr.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0),
        errors: appErrorsStr.split(',').map(s => s.trim()).filter(s => s.length > 0),
        suppliers: appSuppliersStr.split(',').map(s => s.trim()).filter(s => s.length > 0)
      }
    };
    setFullAppConfig(updatedConfig);
    
    // Load strings for new tab
    const newData = updatedConfig[newTab] || {};
    setAppFloorsStr((newData.floors || []).join(', '));
    setAppErrorsStr((newData.errors || []).join(', '));
    setAppSuppliersStr((newData.suppliers || []).join(', '));
    
    setConfigPartTab(newTab);
  };

  // Save App Config
  const handleSaveAppConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingAppConfig(true);
    setAdminError('');
    setAdminSuccess('');

    try {
      const parsedFloors = appFloorsStr.split(',').map(s => s.trim().toUpperCase()).filter(s => s.length > 0);
      const parsedErrors = appErrorsStr.split(',').map(s => s.trim()).filter(s => s.length > 0);
      const parsedSuppliers = appSuppliersStr.split(',').map(s => s.trim()).filter(s => s.length > 0);

      const finalConfigToSave = {
        ...fullAppConfig,
        [configPartTab]: {
          floors: parsedFloors,
          errors: parsedErrors,
          suppliers: parsedSuppliers
        }
      };
      
      setFullAppConfig(finalConfigToSave);

      const docRef = doc(db, 'settings', 'app_config');
      let isOffline = false;
      try {
        await withTimeout(setDoc(docRef, finalConfigToSave), 8000, 'Lỗi timeout khi kết nối cơ sở dữ liệu');
      } catch (err: any) {
        console.warn("Firestore error when saving app config:", err);
        isOffline = true;
      }

      localStorage.setItem('local_app_config', JSON.stringify(finalConfigToSave));

      if (isOffline) {
        setAdminSuccess('Đã lưu cấu hình Cục bộ thành công! LƯU Ý: Vui lòng click "ĐỒNG BỘ LÊN CLOUD" trước khi đăng xuất hoặc chuyển sang máy khác.');
      } else {
        setAdminSuccess('Đã lưu cấu hình danh sách dùng chung thành công!');
      }
    } catch (err: any) {
      setAdminError(`Lỗi lưu cấu hình: ${err.message}`);
    } finally {
      setIsSavingAppConfig(false);
    }
  };

  // Save or Update QC User
  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userEmail.trim() || !userName.trim() || !userEmployeeId.trim()) {
      setAdminError("Vui lòng điền đủ: Email, Họ Tên, và Mã nhân viên.");
      return;
    }

    setIsSavingUser(true);
    setAdminError('');
    setAdminSuccess('');

    const targetEmail = userEmail.trim().toLowerCase();

    // Format list of permitted floors split by comma
    const listFloors = userPermittedFloorsStr
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(s => s.length > 0);

    try {
      const docRef = doc(db, 'qc_users', targetEmail);
      const payload: Omit<QCUser, 'email'> = {
        name: userName.trim(),
        employeeId: userEmployeeId.trim().toUpperCase(),
        floorGroup: userFloorGroup.trim().toUpperCase(),
        permittedFloors: listFloors,
        role: userRole,
        part: userPart || ''
      };

      try {
        await withTimeout(setDoc(docRef, payload), 5000, 'Lỗi timeout khi lưu tài khoản. Bạn vui lòng làm mới trang hoặc kết nối lại mạng.');
      } catch (fbError: any) {
        console.warn("Firestore save user timeout/error, saving locally:", fbError);
        // Fallback to local storage
        const local = localStorage.getItem('local_qc_users');
        let localUsers: any[] = local ? JSON.parse(local) : [];
        const existingIdx = localUsers.findIndex(u => u.email === targetEmail);
        const newUser = { email: targetEmail, ...payload };
        if (existingIdx >= 0) {
          localUsers[existingIdx] = newUser;
        } else {
          localUsers.push(newUser);
        }
        localStorage.setItem('local_qc_users', JSON.stringify(localUsers));
      }

      setAdminSuccess(editingEmail ? `Đã cập nhật tài khoản ${targetEmail} thành công!` : `Đã thêm tài khoản QC mới ${targetEmail} thành công!`);
      
      // Reset User Form
      resetUserForm();
      
      // Update local state and storage instantly
      setUsers(prev => {
        const next = [...prev];
        const existingIdx = next.findIndex(u => u.email === targetEmail);
        const newUserObj = { email: targetEmail, ...payload };
        if (existingIdx >= 0) {
          next[existingIdx] = newUserObj;
        } else {
          next.push(newUserObj);
        }
        localStorage.setItem('local_qc_users', JSON.stringify(next));
        return next;
      });

      // Try fetching in background to sync
      fetchUsers().catch(console.warn);

    } catch (err: any) {
      console.error(err);
      setAdminError("Lỗi lưu tài khoản: " + err.message);
    } finally {
      setIsSavingUser(false);
    }
  };

  const resetUserForm = () => {
    setUserEmail('');
    setUserName('');
    setUserEmployeeId('');
    setUserFloorGroup('K73F');
    setUserPermittedFloorsStr('K73A, K73B, K73C, K73D');
    setUserRole('user');
    setUserPart('');
    setEditingEmail(null);
  };

  const startEditUser = (u: QCUser) => {
    setUserEmail(u.email);
    setUserName(u.name);
    setUserEmployeeId(u.employeeId);
    setUserFloorGroup(u.floorGroup || '');
    setUserPermittedFloorsStr((u.permittedFloors || []).join(', '));
    setUserRole(u.role || 'user');
    setUserPart(u.part || '');
    setEditingEmail(u.email);
    setAdminError('');
    setAdminSuccess('');
  };

  const confirmDeleteUser = (email: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Xóa Tài Khoản',
      message: `Bạn có chắc chắn muốn xóa tài khoản QC này: ${email}?`,
      type: 'delete_user',
      targetId: email
    });
  };

  const executeDeleteUser = async (email: string) => {
    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
    setAdminError('');
    setAdminSuccess('');
    try {
      const emailLower = email.toLowerCase();
      try {
        await withTimeout(deleteDoc(doc(db, 'qc_users', emailLower)), 5000);
      } catch (fbError: any) {
        console.warn("Delete doc timeout or error", fbError);
        // Ensure local list also removes
      }
      
      const local = localStorage.getItem('local_qc_users');
      if (local) {
        let localUsers: QCUser[] = JSON.parse(local);
        localUsers = localUsers.filter(u => u.email.toLowerCase() !== emailLower);
        localStorage.setItem('local_qc_users', JSON.stringify(localUsers));
      }

      setUsers(prev => prev.filter(u => u.email.toLowerCase() !== emailLower));

      setAdminSuccess(`Đã xóa tài khoản ${email} thành công!`);
      // Background sync
      fetchUsers().catch(console.warn);
    } catch (err: any) {
      setAdminError("Lỗi xóa tài khoản: " + err.message);
    }
  };

  // Save Single POMapping
  const handleSaveSingleMapping = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPo = poNo.replace(/[^0-9]/g, ''); // PO is strictly numerical as requested
    if (!cleanPo || !poColor.trim()) {
      setAdminError("Lỗi: Mã đơn hàng PO bắt buộc là số, mã màu không được bỏ trống.");
      return;
    }

    setIsSavingMapping(true);
    setAdminError('');
    setAdminSuccess('');
    try {
      // 1. Instantly update Local Cache
      const local = localStorage.getItem('local_po_color_mappings');
      let mapData = local ? sanitizeMap(JSON.parse(local)) : {};
      mapData[cleanPo] = poColor.trim().toUpperCase();
      localStorage.setItem('local_po_color_mappings', JSON.stringify(mapData));

      // 2. Instantly refresh listed state
      let list: POMapping[] = Object.keys(mapData).map(order => ({
        order,
        colorCode: mapData[order]
      }));
      if (poSearch.trim()) {
        const uppercaseSearch = poSearch.trim().toUpperCase();
        list = list.filter(m => m.order.includes(uppercaseSearch));
      }
      list.sort((a, b) => {
        const an = parseInt(a.order, 10);
        const bn = parseInt(b.order, 10);
        if (isNaN(an) || isNaN(bn)) return a.order.localeCompare(b.order);
        return a.order.localeCompare(b.order, undefined, { numeric: true });
      });
      if (list.length > 150 && !poSearch.trim()) {
        list = list.slice(0, 150);
      }
      setMappings(list);

      // 3. Async background Firestore sync with timeout
      let isOffline = false;
      try {
        // Find existing from local storage
        const local = localStorage.getItem('local_po_color_mappings');
        let fullMap = local ? sanitizeMap(JSON.parse(local)) : {};
        fullMap[cleanPo] = poColor.trim().toUpperCase();
        
        await saveMappingsInChunks(fullMap, 8000);
      } catch (fbErr: any) {
        console.warn("Firestore save mapping timed out or failed:", fbErr);
        isOffline = true;
      }

      if (isOffline) {
        setAdminSuccess(`Đã lưu Đơn hàng PO ${cleanPo} -> Màu: ${poColor.trim().toUpperCase()} thành công Cục bộ! NHỚ NHẤN "ĐỒNG BỘ LÊN CLOUD" TRƯỚC KHI ĐỔI MÁY.`);
      } else {
        setAdminSuccess(`Đã lưu Đơn hàng PO ${cleanPo} -> Màu: ${poColor.trim().toUpperCase()} thành công!`);
      }

      setPoNo('');
      setPoColor('');
      if (onMappingChange) onMappingChange();
    } catch (err: any) {
      setAdminError("Không thể lưu đơn hàng: " + err.message);
    } finally {
      setIsSavingMapping(false);
    }
  };

  // Bulk Import Mapping
  const handleBulkImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bulkText.trim()) {
      setAdminError("Vui lòng dán danh sách dữ liệu PO / Mã màu từ Excel hoặc tài liệu.");
      return;
    }

    setIsBulkImporting(true);
    setAdminError('');
    setAdminSuccess('');
    setImportProgress({ current: 0, total: 0 });

    const lines = bulkText.split('\n');
    let importedCount = 0;
    let failedCount = 0;

    try {
      // Create mappings object
      const parsedMappings: Record<string, string> = {};

      for (let line of lines) {
        line = line.trim();
        if (!line) continue;

        // Split by tabs, semicolons, commas, or spaces
        const parts = line.split(/[\t,;]/);
        let rawPo = '';
        let rawColor = '';

        if (parts.length >= 2) {
          rawPo = parts[0].trim();
          rawColor = parts[1].trim();
        } else {
          // Fallback splits by multi-spaces or single space
          const spaceParts = line.split(/\s+/);
          if (spaceParts.length >= 2) {
            rawPo = spaceParts[0].trim();
            rawColor = spaceParts.slice(1).join(' ').trim();
          }
        }

        const cleanPo = rawPo.replace(/[^0-9]/g, '');
        if (cleanPo && rawColor) {
          parsedMappings[cleanPo] = rawColor.toUpperCase();
          importedCount++;
        } else {
          failedCount++;
        }
      }

      if (Object.keys(parsedMappings).length === 0) {
        throw new Error("Không tìm thấy dòng hợp lệ nào. Cú pháp chuẩn Excel: [Số Đơn Hàng PO] [Mã Màu] (Cách nhau bởi khoảng trắng hoặc tab)");
      }

      setImportProgress({ current: Math.floor(importedCount / 2), total: importedCount });

      // 1. Instantly merge into Local Cache
      const local = localStorage.getItem('local_po_color_mappings');
      let mapData = local ? sanitizeMap(JSON.parse(local)) : {};
      for (const k of Object.keys(parsedMappings)) {
        mapData[k] = parsedMappings[k];
      }
      localStorage.setItem('local_po_color_mappings', JSON.stringify(mapData));

      // 2. Instantly update State list
      let list: POMapping[] = Object.keys(mapData).map(order => ({
        order,
        colorCode: mapData[order]
      }));
      list.sort((a, b) => {
        const an = parseInt(a.order, 10);
        const bn = parseInt(b.order, 10);
        if (isNaN(an) || isNaN(bn)) return a.order.localeCompare(b.order);
        return a.order.localeCompare(b.order, undefined, { numeric: true });
      });
      if (list.length > 150) {
        list = list.slice(0, 150);
      }
      setMappings(list);
      setImportProgress({ current: importedCount, total: importedCount });

      // 3. Try to sync to Firestore in background
      let isOffline = false;
      try {
        await saveMappingsInChunks(mapData, 8000);
      } catch (fbErr: any) {
        console.warn("Firestore bulk sync failed:", fbErr);
        isOffline = true;
      }

      if (isOffline) {
        setAdminSuccess(`Đã lưu thành công ${importedCount} đơn hàng vào bộ nhớ Cục bộ! NHỚ NHẤN "ĐỒNG BỘ LÊN CLOUD" TRƯỚC KHI ĐỔI MÁY (Lỗi bỏ qua: ${failedCount} dòng)`);
      } else {
        setAdminSuccess(`Nhập dữ liệu thành công! Đã đồng bộ trực tuyến ${importedCount} đơn hàng mới. Lỗi bỏ qua: ${failedCount} dòng.`);
      }

      setBulkText('');
      if (onMappingChange) onMappingChange();
    } catch (err: any) {
      console.error(err);
      setAdminError("Lỗi nạp dữ liệu hàng loạt: " + err.message);
    } finally {
      setIsBulkImporting(false);
    }
  };

  const confirmDeleteAllMappings = () => {
    setConfirmConfig({
      isOpen: true,
      title: 'XÓA TOÀN BỘ ĐƠN HÀNG',
      message: 'CẢNH BÁO: Hành động này sẽ XÓA TOÀN BỘ danh sách đơn hàng PO trên hệ thống.\n\nVui lòng gõ "XOA" (viết hoa) vào ô bên dưới để xác nhận.',
      type: 'delete_all'
    });
  };

  const executeDeleteAllMappings = async () => {
    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
    setIsBulkImporting(true);
    setAdminError('');
    setAdminSuccess('');

    try {
      // 1. Instantly clear Local Cache
      localStorage.setItem('local_po_color_mappings', JSON.stringify({}));
      setMappings([]);

      // 2. Try Firestore sync in background
      let isOffline = false;
      try {
        await saveMappingsInChunks({}, 8000);
      } catch (fbErr: any) {
        console.warn("Firestore clear mappings failed:", fbErr);
        isOffline = true;
      }

      if (isOffline) {
        setAdminSuccess(`Đã xóa thành công toàn bộ đơn hàng ở bộ nhớ Cục bộ!`);
      } else {
        setAdminSuccess(`Đã xóa thành công toàn bộ đơn hàng trực tuyến và Cục bộ!`);
      }
      setPoSearch('');
      if (onMappingChange) onMappingChange();
    } catch (err: any) {
      console.error(err);
      setAdminError("Lỗi xóa toàn bộ đơn hàng: " + err.message);
    } finally {
      setIsBulkImporting(false);
    }
  };

  const confirmDeleteMapping = (order: string) => {
    setConfirmConfig({
      isOpen: true,
      title: 'Xóa Đơn Hàng',
      message: `Xóa ánh xạ màu cho đơn hàng ${order}?`,
      type: 'delete_mapping',
      targetId: order
    });
  };

  const executeDeleteMapping = async (order: string) => {
    setConfirmConfig(prev => ({ ...prev, isOpen: false }));
    setAdminError('');
    setAdminSuccess('');
    try {
      // 1. Instantly update Local Cache
      const local = localStorage.getItem('local_po_color_mappings');
      let mapData = local ? sanitizeMap(JSON.parse(local)) : {};
      delete mapData[order];
      localStorage.setItem('local_po_color_mappings', JSON.stringify(mapData));

      // 2. Instantly update State list
      let list: POMapping[] = Object.keys(mapData).map(ord => ({
        order: ord,
        colorCode: mapData[ord]
      }));
      if (poSearch.trim()) {
        const uppercaseSearch = poSearch.trim().toUpperCase();
        list = list.filter(m => m.order.includes(uppercaseSearch));
      }
      list.sort((a, b) => {
        const an = parseInt(a.order, 10);
        const bn = parseInt(b.order, 10);
        if (isNaN(an) || isNaN(bn)) return a.order.localeCompare(b.order);
        return a.order.localeCompare(b.order, undefined, { numeric: true });
      });
      if (list.length > 150 && !poSearch.trim()) {
        list = list.slice(0, 150);
      }
      setMappings(list);

      // 3. Try Firestore sync in background
      let isOffline = false;
      try {
        const local = localStorage.getItem('local_po_color_mappings');
        let fullMap = local ? sanitizeMap(JSON.parse(local)) : {};
        delete fullMap[order];
        await saveMappingsInChunks(fullMap, 8000);
      } catch (fbErr: any) {
        console.warn("Firestore delete mapping failed, running in offline mode:", fbErr);
        isOffline = true;
      }

      if (isOffline) {
        setAdminSuccess(`Đã xóa thành công đơn hàng ${order} ở bộ nhớ Cục bộ! Hãy nhấn ĐỒNG BỘ LÊN CLOUD để áp dụng cho thiết bị khác.`);
      } else {
        setAdminSuccess(`Đã xóa thành công đơn hàng ${order}`);
      }
      if (onMappingChange) onMappingChange();
    } catch (err: any) {
      setAdminError("Lỗi xóa đơn hàng: " + err.message);
    }
  };

  const handleSyncSettings = async () => {
    setIsSyncingAll(true);
    setAdminError('');
    setAdminSuccess('');
    
    try {
      let syncResult = [];
      const withLongTimeout = <T,>(p: Promise<T>): Promise<T> => withTimeout(p, 30000, 'Lỗi timeout mạng. Nếu dùng trong thẻ nhúng (iframe), hãy Mở ứng dụng trong Tab Mới. Hoặc kiểm tra chặn quảng cáo/Cookies.');

      // 1. Sync App Config
      const localAppConfig = localStorage.getItem('local_app_config');
      if (localAppConfig) {
        try {
          const docRef = doc(db, 'settings', 'app_config');
          const parsed = JSON.parse(localAppConfig);
          await withLongTimeout(setDoc(docRef, parsed));
          syncResult.push('Cấu hình danh sách');
        } catch(e: any) {
          throw new Error(`Cấu hình danh sách: ${e.message}`);
        }
      }

      // 2. Sync Global PO Mappings
      const localMapStr = localStorage.getItem('local_po_color_mappings');
      if (localMapStr) {
        try {
          const parsed = sanitizeMap(JSON.parse(localMapStr));
          await saveMappingsInChunks(parsed, 20000);
          syncResult.push('Bảng mã Đơn hàng (PO)');
        } catch(e: any) {
          throw new Error(`Bảng mã Đơn hàng: ${e.message}`);
        }
      }

      // 3. Sync Users
      const localUsersStr = localStorage.getItem('local_qc_users');
      if (localUsersStr) {
        try {
          const parsed = JSON.parse(localUsersStr);
          if (Array.isArray(parsed)) {
            // Sync each user
            const ops = parsed.map(u => {
              if (u.email) {
                 return withLongTimeout(setDoc(doc(db, 'qc_users', u.email.toLowerCase()), u));
              }
              return Promise.resolve();
            });
            await Promise.all(ops);
            syncResult.push('Danh sách Tài khoản');
          }
        } catch(e: any) {
             throw new Error(`Danh sách Tài khoản: ${e.message}`);
        }
      }

      if (syncResult.length > 0) {
        setAdminSuccess(`Đã đồng bộ thành công dữ liệu cục bộ lên hệ thống Cloud: ${syncResult.join(', ')}.`);
        fetchAppConfig();
        fetchMappings('');
        fetchUsers();
      } else {
        setAdminSuccess('Chưa có dữ liệu nào lưu tạm ngoại tuyến cần đồng bộ.');
      }
    } catch (err: any) {
      setAdminError(`Lỗi đồng bộ: quá trình đẩy dữ liệu thất bại (${err.message}) - Vui lòng kiểm tra kết nối mạng của bạn!`);
    } finally {
      setIsSyncingAll(false);
    }
  };

  return (
    <div className="md:h-full flex flex-col bg-slate-50 md:overflow-hidden">
      {/* Sub Header & Tabs inside AdminPanel */}
      <h1 className="hidden">Admin Panel</h1>
      <div className="bg-white border-b border-slate-200 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between shrink-0 gap-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-blue-600" />
          <h2 className="text-base font-extrabold text-slate-800 tracking-tight uppercase">Trung tâm quản trị dữ liệu QC (ADMIN)</h2>
        </div>
        
        {/* Sub tabs switcher */}
        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs text-nowrap overflow-x-auto">
          <button
            type="button"
            onClick={() => { setSubTab('users'); setAdminError(''); setAdminSuccess(''); }}
            className={`px-4 py-2 font-extrabold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${subTab === 'users' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Users className="h-4 w-4 text-blue-500" />
            QUẢN LÝ NHÂN SỰ
          </button>
          <button
            type="button"
            onClick={() => { setSubTab('po_colors'); setAdminError(''); setAdminSuccess(''); }}
            className={`px-4 py-2 font-extrabold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${subTab === 'po_colors' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <FileSpreadsheet className="h-4 w-4 text-emerald-500 shrink-0" />
            ĐƠN HÀNG PO & MÃ MÀU
          </button>
          <button
            type="button"
            onClick={() => { setSubTab('options'); setAdminError(''); setAdminSuccess(''); }}
            className={`px-4 py-2 font-extrabold rounded-md flex items-center gap-1.5 transition-all cursor-pointer ${subTab === 'options' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
          >
            <Sliders className="h-4 w-4 text-orange-500 shrink-0" />
            CẤU HÌNH DANH SÁCH
          </button>
        </div>

        <button
          type="button"
          onClick={handleSyncSettings}
          disabled={isSyncingAll}
          className="ml-auto px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white text-xs font-extrabold rounded-lg flex items-center gap-2 shadow-sm shrink-0 whitespace-nowrap transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${isSyncingAll ? 'animate-spin' : ''}`} />
          {isSyncingAll ? 'ĐANG ĐỒNG BỘ...' : 'ĐỒNG BỘ LÊN CLOUD'}
        </button>
      </div>

      {/* Main Form Fields / Feedback messages */}
      <div className="flex-1 md:overflow-y-auto p-4 md:p-6 pb-[40vh] md:pb-6 space-y-4">
        {adminError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex gap-3 text-red-800 max-w-4xl mx-auto items-start">
            <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
            <span className="text-xs md:text-sm font-semibold leading-relaxed">{adminError}</span>
          </div>
        )}

        {adminSuccess && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 flex gap-3 text-emerald-800 max-w-4xl mx-auto items-start">
            <CheckCircle className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
            <span className="text-xs md:text-sm font-semibold leading-relaxed">{adminSuccess}</span>
          </div>
        )}

        {subTab === 'users' ? (
          /* MANAGING USER ACCOUNTS & FLOORS */
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
            
            {/* User Form Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="border-b border-slate-100 pb-2">
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  {editingEmail ? <Edit className="h-4 w-4 text-orange-500" /> : <Plus className="h-4 w-4 text-blue-500" />}
                  {editingEmail ? "SỬA THÔNG TIN NHÂN VIÊN" : "THÊM TÀI KHOẢN QC MỚI"}
                </h3>
                <p className="text-[11px] text-slate-400 mt-1">
                  Định cấu hình các lầu được hiển thị trong dropdown cho mỗi nhân viên cụ thể.
                </p>
              </div>

              <form onSubmit={handleSaveUser} className="space-y-4 text-xs">
                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block uppercase tracking-wide">Email đăng nhập (Tài khoản Google)</label>
                  <input
                    type="email"
                    required
                    disabled={editingEmail !== null}
                    placeholder="VD: pyvqcproject@gmail.com"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-700 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block uppercase tracking-wide">Họ tên nhân viên</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: Nguyễn Văn A"
                    value={userName}
                    onChange={(e) => setUserName(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block uppercase tracking-wide">Mã nhân viên (Employee ID)</label>
                  <input
                    type="text"
                    required
                    placeholder="VD: K73-04"
                    value={userEmployeeId}
                    onChange={(e) => setUserEmployeeId(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-mono font-bold uppercase text-slate-800"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block uppercase tracking-wide">Nhóm tổ máy / Lầu quản lý (Ví dụ)</label>
                  <input
                    type="text"
                    placeholder="VD: K73F"
                    value={userFloorGroup}
                    onChange={(e) => setUserFloorGroup(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-slate-805"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 block uppercase tracking-wide">Phân quyền</label>
                    <select
                      value={userRole}
                      onChange={(e) => setUserRole(e.target.value as 'admin' | 'user')}
                      className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-slate-800 bg-white"
                    >
                      <option value="user">User (Chỉ truy cập lầu cho phép)</option>
                      <option value="admin">Admin (Toàn quyền)</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-bold text-slate-600 block uppercase tracking-wide">Bộ vị</label>
                    <select
                      value={userPart}
                      onChange={(e) => setUserPart(e.target.value as 'ĐẾ' | 'MẶT GIÀY' | '')}
                      className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-bold text-slate-800 bg-white"
                    >
                      <option value="">-- Không chỉ định --</option>
                      <option value="ĐẾ">ĐẾ</option>
                      <option value="MẶT GIÀY">MẶT GIÀY</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-bold text-slate-600 block uppercase tracking-wide flex justify-between">
                    <span>DANH SÁCH LẦU ĐƯỢC CHỌN (DROPDOWN)</span>
                    <span className="text-[10px] text-blue-600 text-right">Phân cách qua dấu phẩy (,)</span>
                  </label>
                  <textarea
                    rows={3}
                    placeholder="K73A, K73B, K73C, K73D"
                    value={userPermittedFloorsStr}
                    onChange={(e) => setUserPermittedFloorsStr(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-extrabold text-slate-800 tracking-wide"
                  />
                  <span className="text-[10px] text-slate-450 italic leading-snug block">
                    Ví dụ khi gõ <strong>K73A, K73B, K73C, K73D</strong>, nhân viên này sẽ CHỈ được phép chọn 1 trong 4 lầu trên khi báo lỗi.
                  </span>
                </div>

                <div className="flex gap-2.5 pt-2">
                  <button
                    type="submit"
                    disabled={isSavingUser}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-extrabold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow-sm border-none cursor-pointer"
                  >
                    <Save className="h-3.5 w-3.5" />
                    {isSavingUser ? "Đang lưu..." : "LƯU TÀI KHOẢN"}
                  </button>

                  {editingEmail && (
                    <button
                      type="button"
                      onClick={resetUserForm}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold py-2 px-3 rounded-lg flex items-center justify-center cursor-pointer border border-slate-200"
                    >
                      <Undo2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Users Directory Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[400px]">
              <div className="bg-slate-550 border-b border-slate-200 px-5 py-3 flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-700 tracking-wider flex items-center gap-1.5 uppercase">
                  <Users className="h-4.5 w-4.5 text-blue-500" />
                  DANH SÁCH NHÂN SỰ QC & PHÂN QUYỀN LẦU ({users.length})
                </span>
                <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold">Live Sync</span>
              </div>

              {loadingUsers ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-450 gap-2">
                  <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                  <span className="text-xs font-semibold">Đang truy vấn cơ sở dữ liệu nhân viên...</span>
                </div>
              ) : users.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400 gap-1.5">
                  <AlertCircle className="h-8 w-8 text-slate-300" />
                  <span className="text-xs font-bold">Chưa có cấu hình nhân viên nào.</span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b border-slate-250 font-extrabold uppercase">
                        <th className="p-3.5 pl-5">Thông Tin Tài Khoản</th>
                        <th className="p-3.5">Mã NV</th>
                        <th className="p-3.5">Bộ Vị</th>
                        <th className="p-3.5">Vai Trò</th>
                        <th className="p-3.5">Tổ / Lầu Phụ Trách</th>
                        <th className="p-3.5">Lầu Dropdown Cho Phép</th>
                        <th className="p-3.5 pr-5 text-right">Thao Tác</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                      {users.map((u) => (
                        <tr key={u.email} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3.5 pl-5">
                            <div className="font-extrabold text-slate-800 text-[13px]">{u.name}</div>
                            <div className="text-[11px] text-slate-400 font-mono tracking-tight lowercase mt-0.5">{u.email}</div>
                          </td>
                          <td className="p-3.5">
                            <span className="font-mono bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold border border-slate-200">
                              {u.employeeId}
                            </span>
                          </td>
                          <td className="p-3.5">
                            {u.part ? (
                              <span className="font-bold bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded border border-indigo-100 text-[10px] uppercase">
                                {u.part}
                              </span>
                            ) : (
                              <span className="text-slate-300 italic text-[10px]">Chưa chọn</span>
                            )}
                          </td>
                          <td className="p-3.5">
                            {u.role === 'admin' ? (
                              <span className="font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded border border-amber-200 text-[10px] uppercase">
                                Admin
                              </span>
                            ) : (
                              <span className="font-bold bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 text-[10px] uppercase">
                                User
                              </span>
                            )}
                          </td>
                          <td className="p-3.5 font-bold text-slate-850">
                            {u.floorGroup || "(Chưa gán)"}
                          </td>
                          <td className="p-3.5 max-w-[200px]">
                            <div className="flex flex-wrap gap-1">
                              {u.permittedFloors.map((floorName) => (
                                <span key={floorName} className="text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 px-1.5 py-0.5 rounded">
                                  {floorName}
                                </span>
                              ))}
                              {u.permittedFloors.length === 0 && (
                                <span className="text-[10px] text-slate-400 font-semibold italic">Tất cả lầu mặc định</span>
                              )}
                            </div>
                          </td>
                          <td className="p-3.5 pr-5 text-right space-x-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => startEditUser(u)}
                              className="p-1 px-2 border border-slate-200 hover:border-orange-200 hover:bg-orange-50 text-slate-500 hover:text-orange-700 rounded-md cursor-pointer transition-all"
                              title="Sửa phân quyền"
                            >
                              <Edit className="h-3 w-3 inline" />
                            </button>
                            <button
                              type="button"
                              onClick={() => confirmDeleteUser(u.email)}
                              className="p-1 px-2 border border-slate-200 hover:border-red-200 hover:bg-red-50 text-slate-500 hover:text-red-700 rounded-md cursor-pointer transition-all"
                              title="Xóa tài khoản"
                            >
                              <Trash2 className="h-3 w-3 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        ) : (
          /* MANAGING PO & COLORS DICTIONARY */
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[400px_1fr] gap-6 items-start animate-in fade-in duration-200">
            
            {/* Forms section */}
            <div className="space-y-6">
              
              {/* Single Mapping Add Card */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <Hash className="h-4.5 w-4.5 text-blue-600" />
                    THÊM LẺ ĐƠN HÀNG PO
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Nhập mã đơn hàng PO (chuẩn số) để hệ thống tự điền mã màu khi nhân viên gõ.
                  </p>
                </div>

                <form onSubmit={handleSaveSingleMapping} className="space-y-4 text-xs">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="font-bold text-slate-600 block uppercase">MÃ PO (BẮT BUỘC SỐ)</label>
                      <input
                        type="text"
                        pattern="[0-9]*"
                        required
                        placeholder="VD: 9811"
                        value={poNo}
                        onChange={(e) => setPoNo(e.target.value.replace(/[^0-9]/g, ''))}
                        className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-extrabold text-slate-800"
                        title="Vui lòng chỉ nhập số"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="font-bold text-slate-600 block uppercase">MÃ MÀU SẢN PHẨM</label>
                      <input
                        type="text"
                        required
                        placeholder="VD: RED-22"
                        value={poColor}
                        onChange={(e) => setPoColor(e.target.value)}
                        className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-bold uppercase text-slate-800"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSavingMapping}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-extrabold py-2 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow border-none"
                  >
                    <Plus className="h-4 w-4" />
                    {isSavingMapping ? "Đang gửi..." : "THÊM ÁNH XẠ"}
                  </button>
                </form>
              </div>

              {/* Bulk Mapping Paste Card */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="border-b border-slate-100 pb-2">
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                    <FileSpreadsheet className="h-4.5 w-4.5 text-emerald-600" />
                    NHẬP HÀNG LOẠT (EXCEL / SHEETS)
                  </h3>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Sao chép 2 cột (Đơn hàng và Mã Màu) trong Excel và dán trực tiếp vào đây để nạp nhanh.
                  </p>
                </div>

                <form onSubmit={handleBulkImport} className="space-y-3.5 text-xs">
                  <textarea
                    rows={7}
                    placeholder="123456   BLUE-01&#10;789012   NAVY-RED-FF&#10;555222   CHARCOAL"
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    className="w-full p-2.5 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none font-mono font-bold leading-relaxed bg-slate-50 focus:bg-white text-slate-750 placeholder:text-slate-350"
                  />
                  
                  <div className="text-[10px] text-slate-450 leading-relaxed space-y-1 bg-slate-50 p-2.5 rounded border border-slate-150">
                    <div>⚠️ <strong>Cú pháp chuẩn nhận diện:</strong></div>
                    <div>Các dòng dán từ Excel (Po cách màu bằng phím Tab hoặc Khoảng trắng) tự được bóc tách và tạo bản ghi trực tuyến. Cột đơn hàng sẽ tự lọc lấy chữ số.</div>
                  </div>

                  <button
                    type="submit"
                    disabled={isBulkImporting}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-extrabold py-2.5 px-3 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shadow border-none transition-all"
                  >
                    <CheckCircle className="h-4 w-4" />
                    {isBulkImporting 
                      ? (importProgress.total > 0 ? `Đang nạp... (${importProgress.current}/${importProgress.total})` : "Đang xử lý nạp...") 
                      : "NẠP DANH SÁCH EXCEL"
                    }
                  </button>
                </form>
              </div>

            </div>

            {/* Mappings List Directory Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
              <div className="bg-slate-550 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
                <span className="text-xs font-extrabold text-slate-700 tracking-wider flex items-center gap-1.5 uppercase">
                  <Sliders className="h-4.5 w-4.5 text-emerald-500" />
                  DANH SÁCH ĐƠN HÀNG (HIỂN THỊ TỐI ĐA 150 DÒNG | VUI LÒNG DÙNG TÌM KIẾM)
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Tìm mã PO..."
                    value={poSearch}
                    onChange={(e) => setPoSearch(e.target.value)}
                    onKeyDown={(e) => { if(e.key === 'Enter') fetchMappings(poSearch) }}
                    className="p-1 px-2 text-xs border border-slate-300 rounded focus:ring-1 focus:ring-emerald-500 focus:outline-none w-32"
                  />
                  <button type="button" onClick={() => fetchMappings(poSearch)} className="bg-emerald-100 hover:bg-emerald-200 text-emerald-700 px-2 py-1 rounded text-xs font-bold cursor-pointer">Tìm</button>
                  <button type="button" onClick={confirmDeleteAllMappings} className="bg-red-100 hover:bg-red-200 text-red-700 px-2 py-1 rounded text-xs font-bold cursor-pointer ml-1">Xóa Tất Cả</button>
                </div>
              </div>

              {loadingMappings ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-450 gap-2">
                  <Loader2 className="h-8 w-8 text-blue-500 animate-spin" />
                  <span className="text-xs font-semibold">Đang nạp bảng tra sắc màu từ Cloud DB...</span>
                </div>
              ) : mappings.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-12 text-slate-400 gap-1.5">
                  <AlertCircle className="h-8 w-8 text-slate-300" />
                  <span className="text-xs font-bold">Chưa có đơn hàng PO & Mã màu nào được liên kết.</span>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 text-slate-500 border-b border-slate-250 font-extrabold uppercase sticky top-0 z-10 shadow-sm">
                        <th className="p-3.5 pl-6">Đơn Hàng (PO Code)</th>
                        <th className="p-3.5">Mã Màu Ánh Xạ</th>
                        <th className="p-3.5 pr-6 text-right">Lệnh gỡ bỏ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-755 font-mono text-[13px]">
                      {mappings.map((m) => (
                        <tr key={m.order} className="hover:bg-slate-50/50 transition-colors">
                          <td className="p-3.5 pl-6 font-bold text-blue-700">
                            {m.order}
                          </td>
                          <td className="p-3.5 font-bold tracking-wider text-slate-800">
                            <span className="bg-slate-100 border border-slate-150 px-2.5 py-0.5 rounded font-bold text-xs uppercase text-slate-700 select-all">
                              {m.colorCode}
                            </span>
                          </td>
                          <td className="p-3.5 pr-6 text-right">
                            <button
                              type="button"
                              onClick={() => confirmDeleteMapping(m.order)}
                              className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-md cursor-pointer transition-colors"
                              title="Xóa đơn hàng"
                            >
                              <Trash2 className="h-3.5 w-3.5 inline" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

          </div>
        )}

        {/* Cấu Hình Danh Sách */}
        {subTab === 'options' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden text-sm">
              <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3">
                <h3 className="font-extrabold text-slate-700 flex items-center gap-2 uppercase tracking-wide">
                  <Sliders className="h-4 w-4 text-orange-500" />
                  Quản lý danh sách dùng chung
                </h3>
                <div className="flex bg-slate-200/50 p-1 rounded-lg border border-slate-200">
                  <button
                    type="button"
                    onClick={() => handleConfigTabChange('de')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${configPartTab === 'de' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    BỘ VỊ: ĐẾ
                  </button>
                  <button
                    type="button"
                    onClick={() => handleConfigTabChange('matgiay')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all ${configPartTab === 'matgiay' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    BỘ VỊ: MẶT GIÀY
                  </button>
                </div>
              </div>

              {loadingAppConfig ? (
                <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center gap-2 font-semibold">
                  <Loader2 className="h-6 w-6 animate-spin text-orange-500 mb-1" />
                  Đang tải cấu hình...
                </div>
              ) : (
                <form onSubmit={handleSaveAppConfig} className="p-5 flex flex-col gap-6">
                  
                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-600 block uppercase tracking-wide flex justify-between">
                      <span>Danh sách Các Lầu / Khu Vực</span>
                      <span className="text-[10px] text-blue-600">Cách nhau bởi dấu phẩy (,)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={appFloorsStr}
                      onChange={(e) => setAppFloorsStr(e.target.value)}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-800 bg-slate-50 focus:bg-white"
                      placeholder="VD: K73A, K73B, Lầu 1..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-600 block uppercase tracking-wide flex justify-between">
                      <span>Danh sách Xưởng Cung Ứng</span>
                      <span className="text-[10px] text-blue-600">Cách nhau bởi dấu phẩy (,)</span>
                    </label>
                    <textarea
                      rows={3}
                      value={appSuppliersStr}
                      onChange={(e) => setAppSuppliersStr(e.target.value)}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-800 bg-slate-50 focus:bg-white"
                      placeholder="VD: Xưởng A, Xưởng May 1..."
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="font-bold text-slate-600 block uppercase tracking-wide flex justify-between">
                      <span>Danh sách Tên Lỗi Kỹ Thuật</span>
                      <span className="text-[10px] text-blue-600">Cách nhau bởi dấu phẩy (,)</span>
                    </label>
                    <textarea
                      rows={4}
                      value={appErrorsStr}
                      onChange={(e) => setAppErrorsStr(e.target.value)}
                      className="w-full p-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none transition-all font-semibold text-slate-800 bg-slate-50 focus:bg-white"
                      placeholder="VD: Lỗi mũi chỉ, Lỗi lệch tâm..."
                    />
                  </div>

                  <div className="pt-2 flex flex-col sm:flex-row justify-end gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setAppFloorsStr('');
                        setAppSuppliersStr('');
                        setAppErrorsStr('');
                      }}
                      className="bg-slate-200 hover:bg-slate-300 text-slate-700 px-6 py-3 rounded-lg font-bold flex items-center justify-center gap-2 transition-all cursor-pointer w-full sm:w-auto"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                      XÓA TRẮNG FORM
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingAppConfig}
                      className="bg-orange-600 hover:bg-orange-700 disabled:opacity-70 text-white px-8 py-3 rounded-lg font-extrabold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-md select-none w-full sm:w-auto"
                    >
                      {isSavingAppConfig ? (
                        <>
                          <Loader2 className="h-4.5 w-4.5 animate-spin" />
                          ĐANG LƯU...
                        </>
                      ) : (
                        <>
                          <Save className="h-4.5 w-4.5" />
                          LƯU CẤU HÌNH DANH SÁCH MỚI
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
      
      {/* Custom Confirm Dialog Modal */}
      {confirmConfig.isOpen && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full mx-auto overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-slate-100 bg-slate-50">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <AlertCircle className={`h-5 w-5 ${confirmConfig.type === 'delete_all' ? 'text-red-500' : 'text-amber-500'}`} />
                {confirmConfig.title}
              </h3>
            </div>
            <div className="p-5 text-sm text-slate-600 whitespace-pre-wrap">
              {confirmConfig.message}
              {confirmConfig.type === 'delete_all' && (
                <div className="mt-4">
                  <input
                    type="text"
                    id="confirm-delete-all-input"
                    className="w-full border border-slate-300 rounded p-2 focus:ring-2 focus:ring-red-500 outline-none text-center font-bold tracking-widest uppercase"
                    placeholder="Nhập chữ XOA"
                  />
                </div>
              )}
            </div>
            <div className="p-3 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmConfig(prev => ({ ...prev, isOpen: false }))}
                className="px-4 py-2 text-xs font-semibold text-slate-600 bg-slate-200 hover:bg-slate-300 rounded-md transition-colors cursor-pointer"
              >
                HỦY BỎ
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmConfig.type === 'delete_user' && confirmConfig.targetId) {
                    executeDeleteUser(confirmConfig.targetId);
                  } else if (confirmConfig.type === 'delete_mapping' && confirmConfig.targetId) {
                    executeDeleteMapping(confirmConfig.targetId);
                  } else if (confirmConfig.type === 'delete_all') {
                    const inputEl = document.getElementById('confirm-delete-all-input') as HTMLInputElement;
                    if (inputEl && (inputEl.value === 'XOA' || inputEl.value === 'xoa')) {
                      executeDeleteAllMappings();
                    } else {
                      alert('Bạn phải nhập đúng chữ "XOA" để tiếp tục');
                    }
                  }
                }}
                className={`px-4 py-2 text-xs font-bold text-white rounded-md transition-colors cursor-pointer ${
                  confirmConfig.type === 'delete_all' 
                    ? 'bg-red-500 hover:bg-red-600' 
                    : 'bg-amber-500 hover:bg-amber-600'
                }`}
              >
                XÁC NHẬN XÓA
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
