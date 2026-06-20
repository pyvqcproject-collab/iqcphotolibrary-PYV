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
    <div className="min-h-[100dvh] bg-slate-100 flex flex-col justify-center py-12 pb-[30vh] md:pb-12 sm:px-6 lg:px-8 text-slate-800 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md flex flex-col items-center">
        <div className="flex items-center justify-center mb-6 w-full">
          <span className="font-extrabold text-3xl tracking-tight text-slate-800">IQC</span>
          <span className="font-light text-3xl text-slate-600">PHOTO</span>
        </div>
        <p className="text-center text-sm text-slate-500 font-medium mb-2">Hệ Thống Báo Cáo Chất Lượng</p>
      </div>

      <div className="mt-6 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-6 shadow-[0_4px_6px_-1px_rgba(0,0,0,0.1)] rounded-xl sm:px-10 border border-slate-200">
          <div className="space-y-5">
            {error && (
              <div className="text-red-800 text-xs bg-red-50 p-3 rounded-md border border-red-200 font-medium">
                {error}
              </div>
            )}
            
            <div className="pt-2">
              <button
                onClick={handleLogin}
                disabled={loading}
                className="w-full bg-blue-600 text-white p-3.5 rounded-lg font-semibold border-none flex items-center justify-center gap-2.5 hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 h-5 w-5" />
                    ĐANG XỬ LÝ...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" width="20" height="20" xmlns="http://www.w3.org/2000/svg">
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
          </div>
        </div>
      </div>
    </div>
  );
}

