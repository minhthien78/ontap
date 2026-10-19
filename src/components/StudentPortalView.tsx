import React, { useState } from 'react';
import {
  GraduationCap,
  FlaskConical,
  Clock,
  Sparkles,
  ArrowRight,
  RotateCcw,
  BookOpen,
  Lock,
  LogIn,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from 'lucide-react';
import { PublishedExam } from '../types';

interface StudentPortalViewProps {
  publishedExams: PublishedExam[];
  onEnterExam: (accessCode: string) => void;
  onOpenTeacherLogin: () => void;
}

export const StudentPortalView: React.FC<StudentPortalViewProps> = ({
  publishedExams,
  onEnterExam,
  onOpenTeacherLogin,
}) => {
  const [accessCodeInput, setAccessCodeInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Filter only exams that are currently OPEN for students
  const openExams = publishedExams.filter((exam) => exam.isOpen);

  const handleSubmitCode = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = accessCodeInput.trim().toUpperCase();
    if (!clean) {
      setError('Vui lòng nhập mã phòng thi để bắt đầu làm bài');
      return;
    }
    setError(null);
    onEnterExam(clean);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300 pb-12">
      {/* Hero Welcome Card */}
      <div className="bg-gradient-to-r from-blue-950 via-indigo-900 to-emerald-950 text-white rounded-3xl p-6 sm:p-10 shadow-2xl relative overflow-hidden border border-blue-800/40">
        <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-10 -top-10 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-2xl mx-auto text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 backdrop-blur-xs border border-white/20 text-xs font-semibold text-emerald-300">
            <FlaskConical className="w-4 h-4 text-emerald-400" />
            CỔNG THI TRỰC TUYẾN DÀNH CHO HỌC SINH
          </div>

          <h2 className="text-2xl sm:text-4xl font-black tracking-tight text-white leading-tight">
            Kiểm Tra Hóa Học Trực Tuyến
          </h2>

          <p className="text-sm text-blue-200 leading-relaxed max-w-xl mx-auto">
            Hệ thống làm bài thi Hóa học tự động, nhận diện mã đề ngẫu nhiên, chấm điểm chuẩn Bộ Giáo dục 2025 và lưu trữ lịch sử thi an toàn.
          </p>

          {/* Room Code Entry Form */}
          <form onSubmit={handleSubmitCode} className="pt-2 max-w-md mx-auto space-y-3">
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  required
                  value={accessCodeInput}
                  onChange={(e) => {
                    setAccessCodeInput(e.target.value.toUpperCase());
                    setError(null);
                  }}
                  placeholder="Nhập mã phòng (VD: HHCT01)"
                  className="w-full px-4 py-3.5 bg-white text-gray-900 rounded-2xl font-mono uppercase font-bold text-center sm:text-left text-base shadow-inner outline-hidden focus:ring-4 focus:ring-emerald-400/30 transition placeholder:text-gray-400 placeholder:normal-case placeholder:font-sans placeholder:text-sm"
                />
              </div>

              <button
                type="submit"
                className="px-6 py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-gray-950 font-black rounded-2xl text-sm shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2 cursor-pointer active:scale-98 shrink-0"
              >
                <span>VÀO THI NGAY</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="p-2.5 bg-red-500/20 border border-red-400/40 rounded-xl text-xs text-red-200 flex items-center justify-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-red-300 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </form>
        </div>
      </div>

      {/* List of Open Exams */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 pb-3">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-900" />
              Danh Sách Bài Thi Đang Mở Thi
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Chọn bài kiểm tra bên dưới để vào làm bài ngay mà không cần nhập mã
            </p>
          </div>

          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200 self-start sm:self-auto">
            {openExams.length} bài thi đang mở
          </span>
        </div>

        {openExams.length === 0 ? (
          <div className="bg-white rounded-3xl border border-gray-200 p-10 text-center space-y-4 shadow-xs">
            <div className="w-14 h-14 bg-gray-100 text-gray-400 rounded-2xl flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-base font-bold text-gray-800">
                Chưa có đề thi nào mở công khai
              </h4>
              <p className="text-xs text-gray-500 leading-relaxed">
                Thầy cô có thể đã cài đặt phòng thi riêng qua mã hoặc đang đóng đề thi. Nếu bạn có mã đề thi từ thầy cô, vui lòng nhập vào ô tìm kiếm ở trên để làm bài.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {openExams.map((exam) => {
              const maxAtt = exam.maxAttempts !== undefined ? exam.maxAttempts : 3;
              return (
                <div
                  key={exam.id}
                  className="bg-white rounded-2xl border border-gray-200 shadow-xs hover:shadow-md transition-all p-5 flex flex-col justify-between space-y-4 group hover:border-blue-400"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Đang mở thi
                      </span>
                      <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-blue-50 text-blue-900 border border-blue-200">
                        MÃ: {exam.accessCode}
                      </span>
                    </div>

                    <div>
                      <h4 className="font-bold text-base text-gray-900 group-hover:text-blue-900 transition line-clamp-2">
                        {exam.title}
                      </h4>
                    </div>

                    <div className="space-y-1.5 text-xs text-gray-600 pt-1">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-gray-400" />
                        <span>
                          Thời gian: <strong>{exam.durationMinutes > 0 ? `${exam.durationMinutes} phút` : 'Tự do'}</strong>
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {exam.examMode === 'test' || maxAtt === 1 ? (
                          <>
                            <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                            <span>
                              Hình thức:{' '}
                              <strong className="text-rose-700">Kiểm tra (1 lần, thoát là nộp)</strong>
                            </span>
                          </>
                        ) : (
                          <>
                            <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                            <span>
                              Hình thức:{' '}
                              <strong className="text-emerald-700">Luyện tập (Không giới hạn)</strong>
                            </span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                        <span>
                          Số mã đề trộn: <strong>{exam.versions.length} mã đề</strong>
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onEnterExam(exam.accessCode)}
                    className="w-full py-2.5 px-4 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 shadow-xs group-hover:bg-gradient-to-r group-hover:from-blue-900 group-hover:to-indigo-900 cursor-pointer"
                  >
                    <span>VÀO LÀM BÀI THI</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Teacher Authentication Gate Notice */}
      <div className="bg-slate-100 border border-slate-200 rounded-3xl p-6 sm:p-7 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="space-y-1">
          <div className="flex items-center justify-center sm:justify-start gap-2 text-sm font-bold text-gray-900">
            <Lock className="w-4 h-4 text-blue-900" />
            <span>Khu vực dành cho Giáo viên</span>
          </div>
          <p className="text-xs text-gray-600 max-w-xl">
            Chức năng tải tệp DOCX, chỉnh sửa câu hỏi, cấu hình trộn đề, quản lý bài thi và bảng điểm chi tiết được bảo mật. Thầy cô vui lòng đăng nhập để sử dụng.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenTeacherLogin}
          className="px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold transition shadow-sm flex items-center gap-2 shrink-0 cursor-pointer"
        >
          <LogIn className="w-4 h-4" />
          <span>Đăng Nhập Quản Trị</span>
        </button>
      </div>
    </div>
  );
};
