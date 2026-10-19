import React, { useState } from 'react';
import {
  X,
  Lock,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  RotateCcw,
  Mail,
  ShieldAlert,
} from 'lucide-react';
import { api } from '../api';

interface ChangePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'change' | 'reset'>('change');

  // Change password state
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showOld, setShowOld] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Reset password state
  const [resetEmail, setResetEmail] = useState('minhthien78@gmail.com');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleTabSwitch = (tab: 'change' | 'reset') => {
    setActiveTab(tab);
    setError(null);
    setSuccess(null);
  };

  const handleChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!oldPassword) {
      setError('Vui lòng nhập mật khẩu hiện tại');
      return;
    }

    if (!newPassword || newPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu mới không khớp!');
      return;
    }

    setLoading(true);
    try {
      const res = await api.changePassword(oldPassword, newPassword);
      setSuccess(res.message || 'Đổi mật khẩu thành công!');
      setTimeout(() => {
        onClose();
        setSuccess(null);
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
      }, 1800);
    } catch (err: any) {
      setError(err.message || 'Đổi mật khẩu thất bại');
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
        'Quyền bị từ chối! Hệ thống chỉ hỗ trợ cấp lại mật khẩu cho email quản trị viên: minhthien78@gmail.com. Tuyệt đối không cấp lại cho email khác!'
      );
      return;
    }

    setLoading(true);
    try {
      const res = await api.resetPassword(cleanEmail);
      setSuccess(
        res.message ||
          'Hệ thống đã tạo mật khẩu mới an toàn và gửi trực tiếp về email minhthien78@gmail.com! Thầy vui lòng mở Gmail để lấy mật khẩu mới.'
      );
    } catch (err: any) {
      setError(err.message || 'Cấp lại mật khẩu thất bại');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 text-white p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl border border-white/20">
              {activeTab === 'change' ? (
                <KeyRound className="w-6 h-6 text-emerald-400" />
              ) : (
                <RotateCcw className="w-6 h-6 text-amber-300" />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold">
                {activeTab === 'change' ? 'Đổi Mật Khẩu Quản Trị' : 'Cấp Lại Mật Khẩu Quản Trị'}
              </h2>
              <p className="text-xs text-blue-200">
                {activeTab === 'change'
                  ? 'Cập nhật mật khẩu mới khi biết mật khẩu cũ'
                  : 'Cấp lại mật khẩu qua email minhthien78@gmail.com'}
              </p>
            </div>
          </div>

          {/* Mode Switch Tabs */}
          <div className="mt-4 flex bg-black/20 p-1 rounded-xl border border-white/15">
            <button
              type="button"
              onClick={() => handleTabSwitch('change')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'change'
                  ? 'bg-white text-blue-950 shadow-sm'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              <span>Đổi mật khẩu</span>
            </button>
            <button
              type="button"
              onClick={() => handleTabSwitch('reset')}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition cursor-pointer flex items-center justify-center gap-1.5 ${
                activeTab === 'reset'
                  ? 'bg-amber-400 text-gray-950 shadow-sm font-black'
                  : 'text-white/80 hover:text-white'
              }`}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Cấp lại qua Email</span>
            </button>
          </div>
        </div>

        {/* Form Body */}
        {activeTab === 'change' ? (
          <form onSubmit={handleChangeSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            {success && (
              <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs text-emerald-800 flex items-center gap-2 font-semibold">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Mật khẩu hiện tại
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showOld ? 'text' : 'password'}
                  required
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="Nhập mật khẩu đang dùng"
                  className="w-full pl-9 pr-10 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 text-sm focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden transition"
                />
                <button
                  type="button"
                  onClick={() => setShowOld(!showOld)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showOld ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Mật khẩu mới
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showNew ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Tối thiểu 6 ký tự"
                  className="w-full pl-9 pr-10 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 text-sm focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden transition"
                />
                <button
                  type="button"
                  onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Xác nhận mật khẩu mới
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Nhập lại mật khẩu mới"
                  className="w-full pl-9 pr-10 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 text-sm focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden transition"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="pt-2 flex gap-3">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 py-2.5 px-4 bg-gradient-to-r from-blue-900 to-indigo-900 hover:from-blue-800 hover:to-indigo-800 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
              >
                {loading ? 'Đang cập nhật...' : 'Lưu Mật Khẩu Mới'}
              </button>
            </div>

            <div className="text-center pt-2 border-t border-gray-100">
              <button
                type="button"
                onClick={() => handleTabSwitch('reset')}
                className="text-xs text-blue-900 hover:text-blue-700 font-semibold underline cursor-pointer"
              >
                Quên mật khẩu hiện tại? Cấp lại qua Email minhthien78@gmail.com
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleResetSubmit} className="p-6 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
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
                    onClick={onClose}
                    className="w-full py-2 bg-emerald-700 hover:bg-emerald-600 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <span>Đóng cửa sổ</span>
                  </button>
                </div>
              </div>
            )}

            {!success && (
              <>
                <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 space-y-1.5">
                  <div className="flex items-center gap-1.5 font-bold text-amber-950">
                    <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Cơ chế bảo mật chống lộ mật khẩu:</span>
                  </div>
                  <p className="text-xs text-amber-900/90 leading-relaxed">
                    Hệ thống sẽ tự động tạo một mật khẩu mới ngẫu nhiên an toàn và <strong>gửi trực tiếp vào hộp thư Gmail: <span className="underline font-mono text-amber-950 font-bold">minhthien78@gmail.com</span></strong>. Không ai có thể tự chọn mật khẩu trên giao diện này.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                    Email quản trị viên nhận mật khẩu mới
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      required
                      value={resetEmail}
                      onChange={(e) => setResetEmail(e.target.value)}
                      placeholder="minhthien78@gmail.com"
                      className="w-full pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 text-sm focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden transition font-mono"
                    />
                  </div>
                </div>

                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 py-2.5 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
                  >
                    Hủy
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
