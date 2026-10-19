import React, { useState, useEffect } from 'react';
import {
  Link as LinkIcon,
  Copy,
  ExternalLink,
  MessageCircle,
  Download,
  Lock,
  Unlock,
  Users,
  Check,
  FileText,
  Clock,
  Trash2,
  Share2,
  QrCode,
  Globe,
  Settings,
  Award,
  RotateCcw,
  HardDrive,
  Database,
  Sparkles,
  ShieldAlert,
  X,
} from 'lucide-react';
import { PublishedExam } from '../types';
import { api } from '../api';
import {
  getStudentExamUrl,
  formatZaloShareText,
  getActiveBaseUrl,
  getCustomPublicBaseUrl,
  setCustomPublicBaseUrl,
} from '../utils/urlHelper';
import { ExamQrModal } from './ExamQrModal';
import { ScoringConfigModal } from './ScoringConfigModal';

interface PublishedExamsViewProps {
  publishedExams: PublishedExam[];
  onRefresh: () => void;
  onOpenTestExam: (accessCode: string) => void;
  onViewResults: (publishedExamId: string) => void;
}

export const PublishedExamsView: React.FC<PublishedExamsViewProps> = ({
  publishedExams,
  onRefresh,
  onOpenTestExam,
  onViewResults,
}) => {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedZaloId, setCopiedZaloId] = useState<string | null>(null);
  const [qrModalExam, setQrModalExam] = useState<{ title: string; accessCode: string } | null>(null);

  // Storage Stats state
  const [storageStats, setStorageStats] = useState<{
    usedMB: number;
    maxMB: number;
    percentage: number;
    publishedCount: number;
    maxPublished: number;
  } | null>(null);

  // Quick edit exam mode state (Kiểm tra vs Luyện tập)
  const [editingModeExam, setEditingModeExam] = useState<PublishedExam | null>(null);
  const [selectedModeVal, setSelectedModeVal] = useState<'test' | 'practice'>('test');
  const [savingMode, setSavingMode] = useState(false);

  // Custom Domain state
  const [isDomainSettingsOpen, setIsDomainSettingsOpen] = useState(false);
  const [customDomainInput, setCustomDomainInput] = useState(getCustomPublicBaseUrl() || getActiveBaseUrl());
  const [domainSaved, setDomainSaved] = useState(false);

  // Deletion confirm state
  const [deletingExamId, setDeletingExamId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Scoring config modal state
  const [scoringModalExam, setScoringModalExam] = useState<PublishedExam | null>(null);

  const fetchStorage = () => {
    api
      .getStorageStats()
      .then((res) => {
        if (res?.stats) setStorageStats(res.stats);
      })
      .catch(() => {});
  };

  useEffect(() => {
    fetchStorage();
  }, [publishedExams.length]);

  const handleCopyLink = async (accessCode: string, examId: string) => {
    const url = getStudentExamUrl(accessCode);
    await navigator.clipboard.writeText(url);
    setCopiedId(examId);
    setTimeout(() => setCopiedId(null), 2500);
  };

  const handleCopyZalo = async (exam: PublishedExam) => {
    const text = formatZaloShareText(exam.title, exam.accessCode, exam.durationMinutes);
    await navigator.clipboard.writeText(text);
    setCopiedZaloId(exam.id);
    setTimeout(() => setCopiedZaloId(null), 2500);
  };

  const handleToggleStatus = async (examId: string, currentStatus: boolean) => {
    try {
      setActionError(null);
      await api.toggleExamStatus(examId, !currentStatus);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi đổi trạng thái đề thi');
    }
  };

  const handleDelete = async (examId: string) => {
    try {
      setActionError(null);
      await api.deletePublishedExam(examId);
      setDeletingExamId(null);
      fetchStorage();
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi xóa đề thi');
    }
  };

  const handleSaveMode = async () => {
    if (!editingModeExam) return;
    try {
      setSavingMode(true);
      setActionError(null);
      await api.updatePublishedExamMode(editingModeExam.id, selectedModeVal);
      setEditingModeExam(null);
      onRefresh();
    } catch (err: any) {
      setActionError(err.message || 'Lỗi cập nhật hình thức thi');
    } finally {
      setSavingMode(false);
    }
  };

  const handleSaveCustomDomain = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomPublicBaseUrl(customDomainInput.trim());
    setDomainSaved(true);
    setTimeout(() => {
      setDomainSaved(false);
      setIsDomainSettingsOpen(false);
    }, 1200);
  };

  if (publishedExams.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center space-y-4">
        <div className="w-14 h-14 bg-blue-50 text-blue-700 rounded-2xl flex items-center justify-center mx-auto">
          <Share2 className="w-7 h-7" />
        </div>
        <div className="space-y-1">
          <h3 className="text-lg font-bold text-gray-900">Chưa có đề thi nào được phát hành</h3>
          <p className="text-xs text-gray-500 max-w-md mx-auto">
            Vui lòng tải tệp Word (.docx) ở Tab 1, kiểm tra đáp án gạch chân và nhấn "TRỘN ĐỀ NGẪU NHIÊN" để phát hành trực tuyến.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-gray-100">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Danh Sách Đề Thi Trực Tuyến & Link Zalo</h2>
          <p className="text-xs text-gray-500">
            Học sinh bấm link hoặc quét mã QR qua Zalo để vào làm bài trực tuyến.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              fetchStorage();
              onRefresh();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold shadow-2xs transition"
            title="Làm mới danh sách và kiểm tra bộ nhớ"
          >
            <RotateCcw className="w-3.5 h-3.5 text-blue-700" />
            <span>Làm mới</span>
          </button>

          <button
            onClick={() => {
              setCustomDomainInput(getCustomPublicBaseUrl() || getActiveBaseUrl());
              setIsDomainSettingsOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 rounded-xl text-xs font-semibold shadow-2xs transition"
            title="Tùy chỉnh đường link nếu sử dụng tên miền riêng"
          >
            <Settings className="w-3.5 h-3.5 text-gray-500" />
            <span>Cấu hình tên miền</span>
          </button>
        </div>
      </div>

      {/* Storage and Retention Policy Card */}
      {storageStats && (
        <div className="bg-gradient-to-r from-blue-950 via-slate-900 to-indigo-950 text-white rounded-2xl p-4 sm:p-5 shadow-sm border border-blue-800/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-blue-600/30 rounded-xl border border-blue-400/30 text-emerald-400">
                <HardDrive className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-white">Quản Lý Dung Lượng Lưu Trữ Bài Thi</h4>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-semibold">
                    Đang an toàn
                  </span>
                </div>
                <p className="text-xs text-blue-200 mt-0.5">
                  Dung lượng: <strong className="text-white font-mono">{storageStats.usedMB} MB</strong> / {storageStats.maxMB} MB ({storageStats.percentage}%) • Đang lưu: <strong className="text-white font-mono">{storageStats.publishedCount}</strong> / {storageStats.maxPublished} đề thi
                </p>
              </div>
            </div>

            <div className="text-xs text-emerald-200 bg-emerald-950/60 border border-emerald-500/30 px-3 py-1.5 rounded-xl flex items-center gap-1.5 self-start sm:self-auto">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Chính sách FIFO: Khi hết dung lượng sẽ <strong>xóa bài thi cũ nhất trước</strong>, bảo toàn tuyệt đối các đề thi mới tạo.</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-white/10 rounded-full h-2.5 overflow-hidden p-0.5 border border-white/10">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                storageStats.percentage > 85 ? 'bg-amber-400' : 'bg-gradient-to-r from-emerald-400 to-teal-300'
              }`}
              style={{ width: `${Math.max(4, storageStats.percentage)}%` }}
            />
          </div>
        </div>
      )}

      {actionError && (
        <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200">
          {actionError}
        </div>
      )}

      {/* Published Exams List */}
      <div className="space-y-4">
        {publishedExams.map((exam) => {
          const studentUrl = getStudentExamUrl(exam.accessCode);
          const isTestMode = exam.examMode === 'test' || exam.maxAttempts === 1;

          return (
            <div
              key={exam.id}
              className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden transition hover:shadow-md"
            >
              {/* Card Header */}
              <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-gray-50/50">
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-gray-900">{exam.title}</h3>
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${
                        exam.isOpen
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {exam.isOpen ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      {exam.isOpen ? 'ĐANG MỞ THI' : 'ĐÃ ĐÓNG ĐỀ'}
                    </span>
                    <span className="text-xs font-mono bg-blue-100 text-blue-900 px-2 py-0.5 rounded-md font-bold tracking-wider border border-blue-200">
                      MÃ PHÒNG: {exam.accessCode}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                      isTestMode
                        ? 'bg-rose-50 text-rose-900 border-rose-200'
                        : 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    }`}>
                      {isTestMode ? (
                        <>
                          <ShieldAlert className="w-3 h-3 text-rose-600" />
                          <span>Kiểm tra (1 lần, thoát là nộp)</span>
                        </>
                      ) : (
                        <>
                          <RotateCcw className="w-3 h-3 text-emerald-600" />
                          <span>Luyện tập (Không giới hạn)</span>
                        </>
                      )}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {exam.durationMinutes > 0 ? `${exam.durationMinutes} phút` : 'Tự do'}
                    </span>
                    <span>•</span>
                    <span>Tạo: {new Date(exam.createdAt).toLocaleDateString('vi-VN')}</span>
                    <span>•</span>
                    <span className="font-semibold text-emerald-700">
                      {exam.versions.length} mã đề ({exam.versions.map((v) => v.testCode).join(', ')})
                    </span>
                  </div>
                </div>

                {/* Right Top Status, Scoring & Delete */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    onClick={() => {
                      setEditingModeExam(exam);
                      setSelectedModeVal(isTestMode ? 'test' : 'practice');
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-blue-900 transition shadow-2xs cursor-pointer"
                    title="Đổi hình thức thi: 1 là Kiểm tra (1 lần, thoát là nộp) hoặc 2 là Luyện tập (không giới hạn)"
                  >
                    {isTestMode ? (
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
                    ) : (
                      <RotateCcw className="w-3.5 h-3.5 text-emerald-600" />
                    )}
                    <span>{isTestMode ? 'Hình thức: Kiểm tra' : 'Hình thức: Luyện tập'}</span>
                  </button>

                  <button
                    onClick={() => setScoringModalExam(exam)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white border border-gray-300 text-gray-700 hover:bg-gray-50 hover:text-blue-900 transition shadow-2xs"
                    title="Cấu hình thang điểm & Chấm lại toàn bộ bài thi"
                  >
                    <Award className="w-3.5 h-3.5 text-amber-600" />
                    <span>Cấu hình điểm</span>
                  </button>

                  <button
                    onClick={() => handleToggleStatus(exam.id, exam.isOpen)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition ${
                      exam.isOpen
                        ? 'bg-amber-50 text-amber-800 border border-amber-300 hover:bg-amber-100'
                        : 'bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100'
                    }`}
                  >
                    {exam.isOpen ? (
                      <>
                        <Lock className="w-3.5 h-3.5" />
                        ĐÓNG ĐỀ
                      </>
                    ) : (
                      <>
                        <Unlock className="w-3.5 h-3.5" />
                        MỞ LẠI
                      </>
                    )}
                  </button>

                  <button
                    onClick={() => setDeletingExamId(exam.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Xóa đề thi"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Confirm deletion banner if clicked */}
              {deletingExamId === exam.id && (
                <div className="p-3 bg-red-50 border-b border-red-200 text-xs text-red-800 flex items-center justify-between gap-3">
                  <span>Thầy cô có chắc chắn muốn xóa đề thi này? Dữ liệu bài làm của học sinh sẽ bị xóa.</span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setDeletingExamId(null)}
                      className="px-2.5 py-1 bg-white border border-gray-300 rounded text-gray-700 font-semibold"
                    >
                      Hủy
                    </button>
                    <button
                      onClick={() => handleDelete(exam.id)}
                      className="px-2.5 py-1 bg-red-600 text-white rounded font-bold hover:bg-red-700"
                    >
                      Xác nhận xóa
                    </button>
                  </div>
                </div>
              )}

              {/* Card Body - Link & Zalo actions */}
              <div className="p-4 sm:p-5 space-y-4">
                {/* Clean Link Bar */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2 text-xs font-bold text-slate-800">
                    <span className="flex items-center gap-1.5 uppercase tracking-wider text-[11px] text-blue-900">
                      <LinkIcon className="w-3.5 h-3.5 text-blue-700" />
                      Link Làm Bài Học Sinh
                    </span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      Mã phòng: <strong className="font-mono text-blue-900 font-bold">{exam.accessCode}</strong>
                    </span>
                  </div>

                  <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={studentUrl}
                      className="flex-1 px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono text-gray-800 outline-hidden select-all shadow-2xs"
                    />

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <button
                        onClick={() => handleCopyLink(exam.accessCode, exam.id)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-semibold shadow-xs transition"
                        title="Sao chép đường link"
                      >
                        {copiedId === exam.id ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            Đã Chép!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            CHÉP LINK
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => handleCopyZalo(exam)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-500 hover:to-indigo-600 text-white rounded-xl text-xs font-semibold shadow-xs transition"
                        title="Sao chép tin nhắn Zalo kèm lời dặn và mã đề"
                      >
                        {copiedZaloId === exam.id ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-400" />
                            Đã Chép Tin Nhắn!
                          </>
                        ) : (
                          <>
                            <MessageCircle className="w-4 h-4" />
                            CHÉP TIN NHẮN ZALO
                          </>
                        )}
                      </button>

                      <button
                        onClick={() => setQrModalExam({ title: exam.title, accessCode: exam.accessCode })}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 bg-white border border-blue-300 hover:bg-blue-50 text-blue-900 rounded-xl text-xs font-bold shadow-2xs transition"
                        title="Xem mã QR quét qua Zalo"
                      >
                        <QrCode className="w-4 h-4 text-blue-700" />
                        MÃ QR
                      </button>

                      <button
                        onClick={() => onOpenTestExam(exam.accessCode)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold shadow-xs transition"
                        title="Xem thử giao diện làm bài như học sinh"
                      >
                        <ExternalLink className="w-4 h-4" />
                        LÀM THỬ
                      </button>
                    </div>
                  </div>
                </div>

                {/* Submissions Summary & Word DOCX Downloads */}
                <div className="pt-2 flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-t border-gray-100">
                  {/* Results preview */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onViewResults(exam.id)}
                      className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-900 border border-indigo-200 rounded-xl text-xs font-bold transition"
                    >
                      <Users className="w-4 h-4 text-indigo-700" />
                      Bảng Điểm ({exam.stats.totalSubmissions} Học Sinh)
                    </button>

                    {exam.stats.totalSubmissions > 0 && (
                      <div className="text-xs text-gray-600 flex items-center gap-2">
                        <span>TB: <strong>{exam.stats.averageScore}</strong></span>
                        <span>•</span>
                        <span className="text-emerald-700 font-semibold">Max: {exam.stats.highestScore}</span>
                        <span>•</span>
                        <span className="text-red-700 font-semibold">Min: {exam.stats.lowestScore}</span>
                      </div>
                    )}
                  </div>

                  {/* Versions Word DOCX download list */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs text-gray-500 font-medium mr-1">Tải Word:</span>
                    {exam.versions.map((ver) => (
                      <div key={ver.versionId} className="flex items-center gap-0.5">
                        <a
                          href={`/api/published-exams/${exam.id}/versions/${ver.versionId}/download-student-docx`}
                          download
                          className="flex items-center gap-1 px-2.5 py-1 bg-gray-50 hover:bg-gray-100 text-gray-800 border border-gray-300 rounded-lg text-xs font-semibold transition"
                          title="Tải đề thi Word cho học sinh"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-700" />
                          Đề {ver.testCode}
                        </a>

                        <a
                          href={`/api/published-exams/${exam.id}/versions/${ver.versionId}/download-teacher-docx`}
                          download
                          className="flex items-center gap-1 px-2 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-semibold transition"
                          title="Tải đáp án Word cho giáo viên"
                        >
                          <Download className="w-3 h-3" />
                          ĐA
                        </a>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* QR Code Modal */}
      {qrModalExam && (
        <ExamQrModal
          isOpen={!!qrModalExam}
          onClose={() => setQrModalExam(null)}
          examTitle={qrModalExam.title}
          accessCode={qrModalExam.accessCode}
        />
      )}

      {/* Custom Domain Settings Modal */}
      {isDomainSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Globe className="w-5 h-5 text-blue-400" />
                <h3 className="font-bold text-sm sm:text-base">Cấu Hình Đường Link Cho Học Sinh</h3>
              </div>
              <button
                onClick={() => setIsDomainSettingsOpen(false)}
                className="text-gray-400 hover:text-white text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveCustomDomain} className="p-6 space-y-4">
              <p className="text-xs text-gray-600 leading-relaxed">
                Tùy chỉnh tên miền hoặc địa chỉ trang web muốn tạo link Zalo và mã QR:
              </p>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1.5">
                  Địa chỉ trang web (Base URL):
                </label>
                <input
                  type="text"
                  value={customDomainInput}
                  onChange={(e) => setCustomDomainInput(e.target.value)}
                  placeholder="https://..."
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-xs font-mono text-gray-800 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden"
                />
              </div>

              {domainSaved && (
                <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs rounded-xl flex items-center gap-1.5 border border-emerald-200">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Đã lưu cấu hình đường link thành công!</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setCustomDomainInput(getActiveBaseUrl());
                  }}
                  className="px-3 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 transition"
                >
                  Khôi phục mặc định
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-xs transition"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Cấu Hình 2 Tùy Chọn: 1. Kiểm tra vs 2. Luyện tập */}
      {editingModeExam && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full shadow-2xl border border-gray-100 overflow-hidden space-y-0">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gradient-to-r from-blue-900 to-indigo-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-white/10 rounded-xl">
                  <ShieldAlert className="w-5 h-5 text-amber-400" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base">Hình Thức Tổ Chức Thi</h3>
                  <p className="text-[11px] text-blue-200">Chọn 1 trong 2 hình thức cho học sinh</p>
                </div>
              </div>
              <button
                onClick={() => setEditingModeExam(null)}
                className="text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-0.5">
                <span className="text-gray-500">Đề thi: </span>
                <strong className="text-gray-900 font-bold">{editingModeExam.title}</strong>
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Chọn hình thức tổ chức thi:
                </label>

                <div className="space-y-3">
                  {/* Option 1: Kiểm tra */}
                  <div
                    onClick={() => setSelectedModeVal('test')}
                    className={`p-4 rounded-2xl border text-left transition flex items-start gap-3.5 cursor-pointer ${
                      selectedModeVal === 'test'
                        ? 'bg-rose-50/70 border-rose-500 shadow-sm ring-2 ring-rose-500/20'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100/70 hover:border-gray-300'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                        selectedModeVal === 'test'
                          ? 'bg-rose-600 text-white shadow-xs'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      <ShieldAlert className="w-5 h-5" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-gray-900 uppercase tracking-wider">
                          1. Kiểm tra (1 lần làm bài, thoát là nộp bài)
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            selectedModeVal === 'test'
                              ? 'bg-rose-600 text-white'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          Chính thức
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 leading-relaxed">
                        Học sinh <strong>chỉ làm bài 1 lần duy nhất</strong>. Nếu học sinh bấm thoát, rời khỏi trang hoặc đóng trình duyệt, hệ thống sẽ <strong>tự động nộp bài và tính điểm ngay</strong>.
                      </p>
                    </div>
                  </div>

                  {/* Option 2: Luyện tập */}
                  <div
                    onClick={() => setSelectedModeVal('practice')}
                    className={`p-4 rounded-2xl border text-left transition flex items-start gap-3.5 cursor-pointer ${
                      selectedModeVal === 'practice'
                        ? 'bg-emerald-50/70 border-emerald-600 shadow-sm ring-2 ring-emerald-500/20'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100/70 hover:border-gray-300'
                    }`}
                  >
                    <div
                      className={`p-2.5 rounded-xl shrink-0 mt-0.5 ${
                        selectedModeVal === 'practice'
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      <RotateCcw className="w-5 h-5" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-gray-900 uppercase tracking-wider">
                          2. Luyện tập (Không giới hạn số lần làm bài và nộp bài)
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            selectedModeVal === 'practice'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          Tự do ∞
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-600 leading-relaxed">
                        Học sinh <strong>không bị giới hạn số lần làm bài và nộp bài</strong>. Hệ thống <strong>lưu lại kết quả và điểm số của tất cả các lần nộp bài</strong> để thầy cô và học sinh theo dõi tiến bộ.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 leading-relaxed">
                {selectedModeVal === 'test'
                  ? '🔒 Chế độ Kiểm tra: Mỗi học sinh chỉ được nộp bài 1 lần với Họ tên và Lớp. Bất kỳ thao tác thoát nào đều kích hoạt nộp bài tự động.'
                  : '✨ Chế độ Luyện tập: Học sinh có thể làm lại bài nhiều lần (Lần 1, Lần 2, Lần 3...). Thầy cô xem được tất cả các lần nộp trong Bảng Điểm.'}
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingModeExam(null)}
                  className="px-4 py-2 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-300 rounded-xl transition cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="button"
                  disabled={savingMode}
                  onClick={handleSaveMode}
                  className="px-5 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-4 h-4" />
                  {savingMode ? 'Đang lưu...' : 'Lưu Thay Đổi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {scoringModalExam && (
        <ScoringConfigModal
          isOpen={!!scoringModalExam}
          publishedExam={scoringModalExam}
          onClose={() => setScoringModalExam(null)}
          onUpdated={onRefresh}
        />
      )}
    </div>
  );
};
