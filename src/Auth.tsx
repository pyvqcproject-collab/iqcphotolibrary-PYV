import React, { useState } from 'react';
import { User } from 'firebase/auth';
import { googleSignIn } from './lib/google-auth';
import { Loader2 } from 'lucide-react';

interface AuthProps {
  onSignIn: (user: User, token: string) => void;
}

export function Auth({ onSignIn }: AuthProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    setError('');
    setLoading(true);

    try {
      const result = await googleSignIn();
      if (result) {
        onSignIn(result.user, result.accessToken);
      }
    } catch (err: any) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error('Lỗi chi tiết:', err);
      }
      let errorMsg = 'Đăng nhập thất bại. Vui lòng thử lại với tài khoản Google.';
      
      if (err.code === 'auth/unauthorized-domain') {
        errorMsg = 'Lỗi: Tên miền chưa được cấp phép. Vui lòng thêm URL của ứng dụng vào danh sách Authorized domains trong Firebase Console.';
      } else if (err.code === 'auth/popup-closed-by-user') {
        errorMsg = 'Đăng nhập bị hủy bởi người dùng.';
      } else if (err.code === 'auth/popup-blocked') {
        errorMsg = 'Trình duyệt của bạn đã chặn cửa sổ đăng nhập. Vui lòng cho phép ứng dụng mở pop-up.';
      } else if (err.code === 'auth/network-request-failed') {
        errorMsg = 'Lỗi mạng hoặc bị trình duyệt chặn. Vui lòng thử đăng nhập lại.';
      } else if (err.code === 'auth/missing-initial-state' || (err.message && err.message.includes('SAML SSO')) || (err.message && err.message.includes('sessionStorage'))) {
        errorMsg = 'Trình duyệt của bạn đang chặn lưu trữ tạm thời (sessionStorage) hoặc bạn đang chạy trong AI Studio trên điện thoại. Vui lòng bấm vào nút "Mở thẻ mới" (↗) ở góc trên cùng để mở web ngoài Iframe và thử lại.';
      } else if (err.message) {
        errorMsg = `Lỗi: ${err.message}. Vui lòng thử mở thẻ mới trên trình duyệt (nút ↗).`;
      }
      
      setError(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-slate-900 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8 text-slate-100 font-sans relative overflow-hidden">
      {/* Subtle industrial grid lines background */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '32px 32px'
        }}
      />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-slate-800 border border-slate-700 rounded text-[11px] font-mono uppercase tracking-wider text-slate-300 mb-4">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            Hệ thống QA/QC Nhà máy
          </div>
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="font-extrabold text-3xl sm:text-4xl tracking-tight text-white font-mono">IQC</span>
            <span className="font-light text-3xl sm:text-4xl text-slate-400 tracking-tight">PHOTO</span>
            <span className="text-xs font-mono px-1.5 py-0.5 bg-blue-600/30 text-blue-400 border border-blue-500/40 rounded font-semibold ml-1">v1.4</span>
          </div>
          <p className="mt-2 text-xs uppercase tracking-widest text-slate-400 font-semibold">
            Quality Control & Defect Verification
          </p>
        </div>

        <div className="bg-slate-800/90 border border-slate-700/80 rounded-lg p-6 sm:p-8 shadow-xl backdrop-blur-sm">
          <div className="space-y-5">
            <div className="border-b border-slate-700 pb-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono">Xác thực đăng nhập</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">Sử dụng tài khoản Google doanh nghiệp hoặc tài khoản được cấp phép</p>
            </div>

            {error && (
              <div className="text-red-300 text-xs bg-red-950/60 p-3 rounded border border-red-800/80 font-medium leading-relaxed">
                {error}
              </div>
            )}
            
            <div className="pt-2">
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white p-3.5 rounded font-mono font-bold text-xs uppercase tracking-wider border border-blue-500/50 flex items-center justify-center gap-3 transition-colors shadow-sm disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin h-4 w-4" />
                    ĐANG XÁC THỰC HỆ THỐNG...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg">
                      <g transform="matrix(1, 0, 0, 1, 27.009001, -39.238998)">
                        <path fill="#4285F4" d="M -3.264 51.509 C -3.264 50.719 -3.334 49.969 -3.454 49.239 L -14.754 49.239 L -14.754 53.749 L -8.284 53.749 C -8.574 55.229 -9.424 56.479 -10.684 57.329 L -10.684 60.329 L -6.824 60.329 C -4.564 58.239 -3.264 55.159 -3.264 51.509 Z"/>
                        <path fill="#34A853" d="M -14.754 63.239 C -11.514 63.239 -8.804 62.159 -6.824 60.329 L -10.684 57.329 C -11.764 58.049 -13.134 58.489 -14.754 58.489 C -17.884 58.489 -20.534 56.379 -21.484 53.529 L -25.464 53.529 L -25.464 56.619 C -23.494 60.539 -19.444 63.239 -14.754 63.239 Z"/>
                        <path fill="#FBBC05" d="M -21.484 53.529 C -21.734 52.809 -21.864 52.039 -21.864 51.239 C -21.864 50.439 -21.724 49.669 -21.484 48.949 L -21.484 45.859 L -25.464 45.859 C -26.284 47.479 -26.754 49.299 -26.754 51.239 C -26.754 53.179 -26.284 54.999 -25.464 56.619 L -21.484 53.529 Z"/>
                        <path fill="#EA4335" d="M -14.754 43.989 C -12.984 43.989 -11.404 44.599 -10.154 45.789 L -6.734 42.369 C -8.804 40.429 -11.514 39.239 -14.754 39.239 C -19.444 39.239 -23.494 41.939 -25.464 45.859 L -21.484 48.949 C -20.534 46.099 -17.884 43.989 -14.754 43.989 Z"/>
                      </g>
                    </svg>
                    ĐĂNG NHẬP BẰNG GOOGLE
                  </>
                )}
              </button>
            </div>

            <div className="pt-2 text-center">
              <span className="text-[10px] text-slate-500 font-mono">PYV FACTORY MANAGEMENT SYSTEM • QC SECURE NODE</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

