import React, { useState } from 'react';
import {
  X,
  Lock,
  User,
  AlertCircle,
  KeyRound,
  Eye,
  EyeOff,
  Mail,
  CheckCircle2,
  ShieldAlert,
  RotateCcw,
  ArrowLeft,
} from 'lucide-react';
import { api } from '../api';
import { TeacherUser } from '../types';

interface TeacherLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: TeacherUser) => void;
}

export const TeacherLoginModal: React.FC<TeacherLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'reset'>('login');

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Reset form state
  const [resetEmail, setResetEmail] = useState('minhthien78@gmail.com');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError('Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu');
      return;
    }
    setError(null);
    setSuccess(null);
    setLoading(true);

    try {
      const res = await api.login(username.trim(), password);
      onLoginSuccess(res.user);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Đăng nhập thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const cleanEmail = resetEmail.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Vui lòng nhập email quản trị viên');
      return;
    }

    // STRICT USER REQUIREMENT: Only allow reset for "minhthien78@gmail.com"
    if (cleanEmail !== 'minhthien78@gmail.com') {
      setError(
        'Quyền bị từ chối! Hệ thống chỉ hỗ trợ cấp lại mật khẩu cho email chính thức của Thầy: minhthien78@gmail.com. Tuyệt đối không cấp lại cho email khác!'
      );
      return;
    }

    setLoading(true);
    try {
      const res = await api.resetPassword(cleanEmail);
      setSuccess(
        res.message ||
          'Hệ thống đã tạo mật khẩu mới an toàn và gửi trực tiếp về email minhthien78@gmail.com! Thầy vui lòng mở hộp thư Gmail để lấy mật khẩu đăng nhập.'
      );
      // Switch back to login form after 3 seconds so teacher can enter the emailed password
      setTimeout(() => {
        setMode('login');
        setUsername('ThayThien');
        setPassword('');
      }, 3500);
    } catch (err: any) {
      setError(err.message || 'Cấp lại mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  };

  const handleSwitchMode = (newMode: 'login' | 'reset') => {
    setMode(newMode);
    setError(null);
    setSuccess(null);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl border border-white/20">
              {mode === 'login' ? (
                <KeyRound className="w-6 h-6 text-emerald-400" />
              ) : (
                <RotateCcw className="w-6 h-6 text-amber-300" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">
                {mode === 'login' ? 'Đăng Nhập Giáo Viên' : 'Cấp Lại Mật Khẩu'}
              </h2>
              <p className="text-xs text-blue-200">
                {mode === 'login'
                  ? 'Xác thực tài khoản để quản trị đề thi và bảng điểm'
                  : 'Chỉ áp dụng xác thực cho email minhthien78@gmail.com'}
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        {mode === 'login' ? (
          <form onSubmit={handleLoginSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-start gap-2">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                <span>{success}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Tên đăng nhập / Email
              </label>
              <div className="relative">
                <User className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  required
                  autoFocus
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Nhập tên đăng nhập hoặc email"
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden transition text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Mật khẩu
              </label>
              <div className="relative">
                <Lock className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Nhập mật khẩu bảo mật"
                  className="w-full pl-10 pr-10 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden transition text-sm"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-800 hover:to-indigo-800 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Đang xác thực...' : 'Đăng Nhập'}
              </button>
            </div>

            <div className="pt-2 text-center border-t border-gray-100">
              <button
                type="button"
                onClick={() => handleSwitchMode('reset')}
                className="text-xs text-blue-900 hover:text-blue-700 font-semibold underline transition cursor-pointer"
              >
                Quên hoặc cần cấp lại mật khẩu?
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 space-y-2">
                <div className="flex items-start gap-2 font-bold text-emerald-800 text-sm">
                  <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                  <span>Đã gửi mật khẩu mới thành công!</span>
                </div>
                <p className="text-xs leading-relaxed text-emerald-800">
                  {success}
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('login')}
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Đến màn hình Đăng Nhập ngay</span>
                  </button>
                </div>
              </div>
            )}

            {!success && (
              <>
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Cơ chế bảo mật chống chiếm đoạt tài khoản:</span>
                  </div>
                  <p className="text-xs text-amber-900/90 leading-relaxed">
                    Hệ thống sẽ tự động tạo một mật khẩu mới ngẫu nhiên an toàn và <strong>gửi trực tiếp vào hộp thư Gmail: <span className="underline font-mono text-amber-950 font-bold">minhthien78@gmail.com</span></strong>. Người ngoài tuyệt đối không thể xem hay tự đặt mật khẩu mới trên màn hình này.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Email quản trị viên nhận mật khẩu mới
                  </label>
                  <div className="relative">
                    <Mail className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      required
                      autoFocus
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="minhthien78@gmail.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden transition text-sm font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => handleSwitchMode('login')}
                    className="flex-1 py-2.5 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span>Quay lại</span>
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2.5 px-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    <Mail className="w-4 h-4" />
                    <span>{loading ? 'Đang gửi...' : 'Gửi Mật Khẩu Về Email'}</span>
                  </button>
                </div>
              </>
            )}
          </form>
        )}
      </div>
    </div>
  );
};
