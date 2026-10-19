import React from 'react';
import {
  FlaskConical,
  GraduationCap,
  FileSpreadsheet,
  Shuffle,
  ShieldCheck,
  LogIn,
  LogOut,
  UserCheck,
  Lock,
  KeyRound,
} from 'lucide-react';
import { TeacherUser } from '../types';

interface HeaderProps {
  currentTab: 'upload' | 'published' | 'results' | 'test-suite';
  onSelectTab: (tab: 'upload' | 'published' | 'results' | 'test-suite') => void;
  teacher: TeacherUser | null;
  onOpenLogin: () => void;
  onLogout: () => void;
  onOpenChangePassword?: () => void;
  onStudentEnterCode?: (code: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  teacher,
  onOpenLogin,
  onLogout,
  onOpenChangePassword,
  onStudentEnterCode,
}) => {
  const [showStudentInput, setShowStudentInput] = React.useState(false);
  const [inputCode, setInputCode] = React.useState('');

  const handleStudentSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (inputCode.trim() && onStudentEnterCode) {
      onStudentEnterCode(inputCode.trim().toUpperCase());
      setShowStudentInput(false);
      setInputCode('');
    }
  };

  return (
    <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-xs">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 text-white py-3 px-4 sm:px-8">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-center md:text-left">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-xs border border-white/20">
              <FlaskConical className="w-8 h-8 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center justify-center md:justify-start">
                HỌC HÓA CÙNG THẦY THIỆN
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2 text-sm flex-wrap justify-center">
            {/* Student Exam Entry Button */}
            {onStudentEnterCode && (
              <div className="relative">
                {showStudentInput ? (
                  <form onSubmit={handleStudentSubmit} className="flex items-center gap-1.5 bg-white/20 p-1 rounded-xl backdrop-blur-xs">
                    <input
                      type="text"
                      autoFocus
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value.toUpperCase())}
                      placeholder="Mã phòng (VD: HHCT01)"
                      className="px-2.5 py-1 text-xs bg-white text-gray-900 rounded-lg outline-hidden font-mono uppercase font-bold w-36"
                    />
                    <button
                      type="submit"
                      className="px-2.5 py-1 bg-amber-400 hover:bg-amber-300 text-gray-950 font-bold rounded-lg text-xs transition cursor-pointer"
                    >
                      Vào thi
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowStudentInput(false)}
                      className="px-2 py-1 text-white/80 hover:text-white text-xs cursor-pointer"
                    >
                      ✕
                    </button>
                  </form>
                ) : (
                  <button
                    onClick={() => setShowStudentInput(true)}
                    className="flex items-center gap-1.5 bg-amber-400 hover:bg-amber-300 text-gray-950 font-bold px-3 py-1.5 rounded-lg shadow-sm transition text-xs sm:text-sm cursor-pointer"
                  >
                    <GraduationCap className="w-4 h-4 text-gray-950" />
                    Học sinh vào thi
                  </button>
                )}
              </div>
            )}

            {teacher ? (
              <div className="flex items-center gap-3 bg-white/10 px-3 py-1.5 rounded-xl border border-white/20">
                <div className="flex items-center gap-1.5 text-emerald-300 font-semibold text-xs sm:text-sm">
                  <UserCheck className="w-4 h-4" />
                  <span>{teacher.fullName} (Giáo viên)</span>
                </div>
                {onOpenChangePassword && (
                  <button
                    onClick={onOpenChangePassword}
                    className="flex items-center gap-1 text-xs text-blue-100 hover:text-white bg-blue-600/70 hover:bg-blue-600 px-2.5 py-1 rounded-lg transition cursor-pointer font-medium"
                    title="Đổi hoặc cấp lại mật khẩu quản trị"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-blue-200" />
                    <span>Đổi mật khẩu</span>
                  </button>
                )}
                <button
                  onClick={onLogout}
                  className="flex items-center gap-1 text-xs text-red-200 hover:text-white bg-red-600/60 hover:bg-red-600 px-2 py-1 rounded-lg transition cursor-pointer"
                  title="Đăng xuất"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Đăng xuất
                </button>
              </div>
            ) : (
              <button
                onClick={onOpenLogin}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-3.5 py-1.5 rounded-xl shadow-md transition text-xs sm:text-sm cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                Đăng nhập Giáo viên
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Navigation Tabs - ONLY visible when teacher is logged in */}
      <div className="max-w-7xl mx-auto px-4 sm:px-8">
        {teacher ? (
          <nav className="flex space-x-1 sm:space-x-4 overflow-x-auto py-2.5 text-sm font-medium scrollbar-none">
            <button
              onClick={() => onSelectTab('upload')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition whitespace-nowrap cursor-pointer ${
                currentTab === 'upload'
                  ? 'bg-blue-50 text-blue-800 font-semibold border-b-2 border-blue-800'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <GraduationCap className="w-4 h-4 text-blue-700" />
              1. Tải DOCX & Phân Tích Đề
            </button>

            <button
              onClick={() => onSelectTab('published')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition whitespace-nowrap cursor-pointer ${
                currentTab === 'published'
                  ? 'bg-emerald-50 text-emerald-800 font-semibold border-b-2 border-emerald-800'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <Shuffle className="w-4 h-4 text-emerald-700" />
              2. Đề Thi Đã Trộn & Link Zalo
            </button>

            <button
              onClick={() => onSelectTab('results')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition whitespace-nowrap cursor-pointer ${
                currentTab === 'results'
                  ? 'bg-indigo-50 text-indigo-800 font-semibold border-b-2 border-indigo-800'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-indigo-700" />
              3. Bảng Điểm & Xuất Excel
            </button>

            <button
              onClick={() => onSelectTab('test-suite')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg transition whitespace-nowrap cursor-pointer ${
                currentTab === 'test-suite'
                  ? 'bg-purple-50 text-purple-800 font-semibold border-b-2 border-purple-800'
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
              }`}
            >
              <ShieldCheck className="w-4 h-4 text-purple-700" />
              4. Kiểm Thử 12 Tình Huống
            </button>
          </nav>
        ) : (
          <div className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-gray-500">
            <div className="flex items-center gap-2 font-semibold text-gray-700">
              <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
              <span>Cổng làm bài kiểm tra Hóa học trực tuyến cho Học sinh</span>
            </div>
            <button
              onClick={onOpenLogin}
              className="text-blue-900 hover:text-blue-700 font-bold flex items-center gap-1 transition self-start sm:self-auto cursor-pointer"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Chức năng quản trị đề thi yêu cầu Giáo viên đăng nhập</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
