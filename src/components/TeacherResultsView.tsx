import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  Search,
  Filter,
  ArrowUpDown,
  Download,
  Users,
  Award,
  TrendingUp,
  X,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  RotateCw,
  Trash2,
  Clock,
  Activity,
  Check,
} from 'lucide-react';
import { PublishedExam, StudentSubmission } from '../types';
import { api } from '../api';
import { ScoringConfigModal } from './ScoringConfigModal';

interface TeacherResultsViewProps {
  publishedExams: PublishedExam[];
  selectedExamId?: string;
  onSelectExamId?: (id: string) => void;
}

function stripLeadingQuestionPrefix(html: string): string {
  if (!html) return '';
  return html
    .replace(
      /^(?:\s*<p[^>]*>)*\s*(?:<(?:\/?(?:strong|b|em|i|span|p|font)[^>]*|br\s*\/?)>\s*)*(?:Câu|Cau|CÂU|CAU|Question)\s*(?:<\/(?:strong|b|em|i|span|p|font)>\s*)*(?:<(?:strong|b|em|i|span|font)[^>]*>\s*)*\d+\s*(?:<\/(?:strong|b|em|i|span|p|font)>\s*)*(?:<(?:strong|b|em|i|span|font)[^>]*>\s*)*(?:\s*\([^\)]*\)\s*)*[:.–-]?\s*(?:<\/(?:strong|b|em|i|span|p|font)>\s*)*/i,
      ''
    )
    .replace(/^(?:Câu|Cau|CÂU|CAU|Question)\s*\d+\s*(?:\([^\)]*\)\s*)?[\s.:–-]*\s*/i, '')
    .trim();
}

export const TeacherResultsView: React.FC<TeacherResultsViewProps> = ({
  publishedExams,
  selectedExamId,
  onSelectExamId,
}) => {
  const [currentExamId, setCurrentExamId] = useState<string>(() => {
    return selectedExamId || localStorage.getItem('hhct_selected_result_exam_id') || 'all';
  });

  // LocalStorage instant recovery: Never lose submissions after closing/reopening the app!
  const [submissions, setSubmissions] = useState<StudentSubmission[]>(() => {
    try {
      const initialId = selectedExamId || localStorage.getItem('hhct_selected_result_exam_id') || 'all';
      const cached =
        localStorage.getItem(`hhct_subs_cache_${initialId}`) ||
        localStorage.getItem('hhct_subs_cache_all');
      if (cached) return JSON.parse(cached);
    } catch (e) {}
    return [];
  });

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchName, setSearchName] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [selectedCode, setSelectedCode] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'submitted' | 'in_progress'>('all');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Deleting submission confirmation state
  const [deletingSubId, setDeletingSubId] = useState<string | null>(null);

  // Drilldown modal for student submission
  const [activeSubmission, setActiveSubmission] = useState<StudentSubmission | null>(null);
  const [isScoringModalOpen, setIsScoringModalOpen] = useState(false);

  const fetchSubmissions = async (isBackground = false) => {
    if (!isBackground) setLoading(true);
    else setRefreshing(true);
    setError(null);

    try {
      let subs: StudentSubmission[] = [];
      if (currentExamId === 'all') {
        const res = await api.getAllSubmissions();
        subs = res.submissions;
      } else {
        const res = await api.getSubmissions(currentExamId);
        subs = res.submissions;
      }

      setSubmissions(subs);
      setLastRefreshedAt(new Date());

      // Save to localStorage immediately so data is permanently preserved across app close/reopen
      try {
        localStorage.setItem(`hhct_subs_cache_${currentExamId}`, JSON.stringify(subs));
        if (currentExamId === 'all') {
          localStorage.setItem('hhct_subs_cache_all', JSON.stringify(subs));
        }
      } catch (e) {}
    } catch (err: any) {
      console.warn('Network error loading submissions, falling back to local cache:', err);
      try {
        const cached =
          localStorage.getItem(`hhct_subs_cache_${currentExamId}`) ||
          localStorage.getItem('hhct_subs_cache_all');
        if (cached) {
          setSubmissions(JSON.parse(cached));
        }
      } catch (e) {}

      if (!isBackground) {
        setError(err.message || 'Lỗi tải danh sách bài làm');
      }
    } finally {
      if (!isBackground) setLoading(false);
      setRefreshing(false);
    }
  };

  const handleDeleteSubmission = async (subId: string) => {
    try {
      await api.deleteSubmission(subId);
      setSubmissions((prev) => prev.filter((s) => s.id !== subId));
      setDeletingSubId(null);
      fetchSubmissions(true);
    } catch (err: any) {
      alert(err.message || 'Lỗi xóa bài làm');
    }
  };

  useEffect(() => {
    if (selectedExamId) {
      setCurrentExamId(selectedExamId);
      try {
        localStorage.setItem('hhct_selected_result_exam_id', selectedExamId);
      } catch (e) {}
    }
  }, [selectedExamId]);

  useEffect(() => {
    fetchSubmissions(false);

    // Auto-refresh poll every 4 seconds to track in-progress students and newly submitted scores live
    const interval = setInterval(() => {
      fetchSubmissions(true);
    }, 4000);

    return () => clearInterval(interval);
  }, [currentExamId]);

  const activeExam = publishedExams.find((e) => e.id === currentExamId);

  // Unique classes and test codes for filter
  const classesList = Array.from(new Set(submissions.map((s) => s.studentClass))).filter(Boolean);
  const codesList = Array.from(new Set(submissions.map((s) => s.testCode))).filter(Boolean);

  // Filtered & Sorted submissions
  const filteredSubmissions = submissions
    .filter((s) => {
      if (searchName && !s.studentName.toLowerCase().includes(searchName.toLowerCase())) {
        return false;
      }
      if (selectedClass !== 'all' && s.studentClass !== selectedClass) {
        return false;
      }
      if (selectedCode !== 'all' && s.testCode !== selectedCode) {
        return false;
      }
      if (statusFilter !== 'all' && s.status !== statusFilter) {
        return false;
      }
      return true;
    })
    .sort((a, b) => {
      const scoreA = a.score?.totalScore ?? 0;
      const scoreB = b.score?.totalScore ?? 0;
      if (sortOrder === 'desc') {
        return scoreB - scoreA;
      }
      return scoreA - scoreB;
    });

  // Analytics calculation
  const totalStudents = submissions.length;
  const finishedSubmissions = submissions.filter((s) => s.status !== 'in_progress');
  const inProgressSubmissions = submissions.filter((s) => s.status === 'in_progress');
  const submittedCount = finishedSubmissions.length;
  const inProgressCount = inProgressSubmissions.length;

  const validScores = (finishedSubmissions.length > 0 ? finishedSubmissions : submissions).map(
    (s) => s.score?.totalScore ?? 0
  );
  const avgScore =
    validScores.length > 0
      ? (validScores.reduce((a, b) => a + b, 0) / validScores.length).toFixed(2)
      : '0.00';
  const maxScore = validScores.length > 0 ? Math.max(...validScores).toFixed(2) : '0.00';
  const minScore = validScores.length > 0 ? Math.min(...validScores).toFixed(2) : '0.00';
  const passCount = validScores.filter((s) => s >= 5.0).length;
  const passRate = validScores.length > 0 ? ((passCount / validScores.length) * 100).toFixed(1) : '0';

  // Hardest question analysis
  const questionWrongMap: Record<
    string,
    { section: number; num: number; wrong: number; total: number }
  > = {};

  submissions.forEach((sub) => {
    if (sub.score && Array.isArray(sub.score.details)) {
      sub.score.details.forEach((det) => {
        const key = `${det.section}_${det.displayNumber}`;
        if (!questionWrongMap[key]) {
          questionWrongMap[key] = {
            section: det.section,
            num: det.displayNumber,
            wrong: 0,
            total: 0,
          };
        }
        questionWrongMap[key].total++;
        if (!det.isCorrect) questionWrongMap[key].wrong++;
      });
    }
  });

  const hardestQuestions = Object.values(questionWrongMap)
    .filter((q) => q.total > 0 && q.wrong > 0)
    .sort((a, b) => b.wrong / b.total - a.wrong / a.total)
    .slice(0, 5);

  const handleDownloadExcel = () => {
    if (!currentExamId) return;
    window.location.href = `/api/published-exams/${currentExamId}/export-excel`;
  };

  return (
    <div className="space-y-6">
      {/* 1. Header with Exam Selector and Excel Export Button */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
            Chọn Bài Kiểm Tra:
          </label>
          <select
            value={currentExamId}
            onChange={(e) => {
              const val = e.target.value;
              setCurrentExamId(val);
              onSelectExamId?.(val);
              try {
                localStorage.setItem('hhct_selected_result_exam_id', val);
              } catch (err) {}
            }}
            className="w-full sm:w-96 px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden"
          >
            <option value="all">
              📊 TẤT CẢ BÀI THI ({totalStudents} học sinh toàn hệ thống)
            </option>
            {publishedExams.map((e) => (
              <option key={e.id} value={e.id}>
                📝 {e.title} ({e.accessCode}) – {e.stats.totalSubmissions || 0} bài đã nộp{e.stats.inProgressCount ? ` • ${e.stats.inProgressCount} đang làm` : ''}
              </option>
            ))}
          </select>
        </div>

        {/* Action Buttons: Scoring Config & Excel Download */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={() => fetchSubmissions(false)}
            disabled={refreshing}
            className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-gray-50 border border-gray-300 hover:bg-gray-100 text-gray-700 font-bold text-xs rounded-xl shadow-2xs transition shrink-0"
            title="Làm mới bảng điểm ngay lập tức"
          >
            <RotateCw className={`w-3.5 h-3.5 text-blue-700 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          {activeExam && (
            <button
              onClick={() => setIsScoringModalOpen(true)}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-white border border-gray-300 hover:bg-gray-50 text-gray-800 font-bold text-xs sm:text-sm rounded-xl shadow-2xs transition shrink-0"
              title="Cấu hình lại thang điểm cho các phần và tự động chấm lại toàn bộ bài thi"
            >
              <Award className="w-4 h-4 text-amber-600" />
              CẤU HÌNH ĐIỂM & CHẤM LẠI
            </button>
          )}

          {/* Real Excel Download Button */}
          <button
            onClick={handleDownloadExcel}
            disabled={submissions.length === 0}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition disabled:opacity-50 shrink-0"
          >
            <FileSpreadsheet className="w-5 h-5 text-emerald-200" />
            TẢI BẢNG ĐIỂM EXCEL (.XLSX)
          </button>
        </div>
      </div>

      {/* Scoring Configuration Overview Banner */}
      {activeExam && activeExam.scoringConfig && (
        <div className="bg-gradient-to-r from-blue-50 via-indigo-50 to-emerald-50 border border-blue-200/80 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-blue-950 flex items-center gap-1.5 uppercase tracking-wider text-[11px]">
                <Award className="w-4 h-4 text-emerald-600" />
                Quy Tắc Chấm Điểm Hiện Tại:
              </span>
              <span className="px-2 py-0.5 rounded-full font-bold bg-blue-100 text-blue-900 text-[11px]">
                {activeExam.scoringConfig.scoringMode === 'custom_sections'
                  ? 'Giáo viên tự nhập điểm theo từng phần'
                  : activeExam.scoringConfig.scoringMode === 'vietnam_standard'
                  ? 'Chuẩn Bộ GD&ĐT 2025'
                  : 'Chia đều theo số câu (10 điểm)'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-gray-700">
              <span>
                • <strong>Phần I:</strong> {activeExam.scoringConfig.part1TotalPoints ?? '-'}đ ({activeExam.scoringConfig.part1PointsPerQ} đ/câu)
              </span>
              <span>
                • <strong>Phần II:</strong> {activeExam.scoringConfig.part2TotalPoints ?? '-'}đ ({activeExam.scoringConfig.part2PointsPerQ} đ/câu, {activeExam.scoringConfig.part2GradingMode === 'vietnam_standard' ? 'thang Bộ 2025' : 'chia đều 4 ý'})
              </span>
              <span>
                • <strong>Phần III:</strong> {activeExam.scoringConfig.part3TotalPoints ?? '-'}đ ({activeExam.scoringConfig.part3PointsPerQ} đ/câu)
              </span>
              <span>
                • <strong>Thang điểm:</strong> {activeExam.scoringConfig.totalScale || 10} điểm
              </span>
            </div>
          </div>

          <button
            onClick={() => setIsScoringModalOpen(true)}
            className="self-start md:self-auto px-3 py-1.5 bg-white hover:bg-gray-50 border border-indigo-200 text-indigo-900 font-bold rounded-xl text-xs transition shadow-2xs shrink-0 flex items-center gap-1"
          >
            Thay đổi điểm số
          </button>
        </div>
      )}

      {/* 2. Statistical Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs text-gray-500 font-medium">Tổng số học sinh</span>
          <div className="text-2xl font-black text-blue-900 mt-1">{totalStudents}</div>
          <span className="text-[11px] text-gray-400">Đã nộp bài</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs text-gray-500 font-medium">Điểm trung bình</span>
          <div className="text-2xl font-black text-indigo-900 mt-1">{avgScore}</div>
          <span className="text-[11px] text-gray-400">Thang điểm 10</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs text-gray-500 font-medium">Điểm cao nhất</span>
          <div className="text-2xl font-black text-emerald-600 mt-1">{maxScore}</div>
          <span className="text-[11px] text-emerald-600 font-medium">Thủ khoa bài thi</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs text-gray-500 font-medium">Điểm thấp nhất</span>
          <div className="text-2xl font-black text-red-600 mt-1">{minScore}</div>
          <span className="text-[11px] text-red-500">Cần phụ đạo</span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <span className="text-xs text-gray-500 font-medium">Tỷ lệ đạt (≥ 5.0)</span>
          <div className="text-2xl font-black text-teal-700 mt-1">{passRate}%</div>
          <span className="text-[11px] text-teal-600 font-medium">{passCount} học sinh</span>
        </div>
      </div>

      {/* 3. Question Difficulty Analysis (Hardest Questions) */}
      {hardestQuestions.length > 0 && (
        <div className="bg-amber-50/70 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-900 uppercase tracking-wider">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            Cảnh Báo Câu Hỏi Nhiều Học Sinh Làm Sai (Cần Chữa Đề):
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 pt-1 text-xs">
            {hardestQuestions.map((hq) => {
              const wrongRate = ((hq.wrong / hq.total) * 100).toFixed(0);
              return (
                <div
                  key={`${hq.section}_${hq.num}`}
                  className="bg-white p-2.5 rounded-xl border border-amber-200 flex items-center justify-between"
                >
                  <span className="font-bold text-gray-800">
                    Phần {hq.section} - Câu {hq.num}
                  </span>
                  <span className="text-red-600 font-bold bg-red-50 px-2 py-0.5 rounded">
                    {wrongRate}% sai
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Filter Bar */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-xs space-y-3">
        {/* Top: Status Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <div className="flex items-center gap-1.5 p-1 bg-gray-100/90 rounded-xl">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                statusFilter === 'all'
                  ? 'bg-white text-blue-950 shadow-xs'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              Tất cả ({totalStudents})
            </button>
            <button
              onClick={() => setStatusFilter('submitted')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                statusFilter === 'submitted'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-emerald-700 hover:bg-emerald-50'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Đã nộp bài ({submittedCount})
            </button>
            <button
              onClick={() => setStatusFilter('in_progress')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
                statusFilter === 'in_progress'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-amber-700 hover:bg-amber-50'
              }`}
            >
              <Activity className="w-3.5 h-3.5 animate-spin" />
              Đang làm bài ({inProgressCount})
            </button>
          </div>

          <div className="text-xs text-gray-500 font-medium">
            Tự động cập nhật trực tiếp mỗi 4 giây
          </div>
        </div>

        {/* Bottom: Search & Select Filters */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Search */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo tên học sinh..."
              value={searchName}
              onChange={(e) => setSearchName(e.target.value)}
              className="w-full pl-9 pr-3.5 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden"
            />
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
            {/* Class Filter */}
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium text-gray-700 outline-hidden"
            >
              <option value="all">Tất cả các lớp ({classesList.length} lớp)</option>
              {classesList.map((c) => (
                <option key={c} value={c}>
                  Lớp {c}
                </option>
              ))}
            </select>

            {/* Test Code Filter */}
            <select
              value={selectedCode}
              onChange={(e) => setSelectedCode(e.target.value)}
              className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-xl text-xs font-medium text-gray-700 outline-hidden"
            >
              <option value="all">Tất cả mã đề</option>
              {codesList.map((code) => (
                <option key={code} value={code}>
                  Mã {code}
                </option>
              ))}
            </select>

            {/* Sort Order */}
            <button
              onClick={() => setSortOrder(sortOrder === 'desc' ? 'asc' : 'desc')}
              className="flex items-center gap-1 px-3 py-2 bg-gray-50 border border-gray-300 hover:bg-gray-100 rounded-xl text-xs font-semibold text-gray-700 transition"
            >
              <ArrowUpDown className="w-3.5 h-3.5" />
              Điểm: {sortOrder === 'desc' ? 'Cao xuống thấp' : 'Thấp lên cao'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirmation banner if deleting a submission */}
      {deletingSubId && (
        <div className="p-4 bg-red-50 border border-red-300 rounded-2xl text-xs text-red-900 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <span>Thầy cô có chắc chắn muốn xóa bài làm này khỏi bảng điểm? Hành động này không thể hoàn tác.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setDeletingSubId(null)}
              className="px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded-xl font-semibold text-gray-700"
            >
              Hủy
            </button>
            <button
              onClick={() => handleDeleteSubmission(deletingSubId)}
              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold"
            >
              Xác nhận xóa
            </button>
          </div>
        </div>
      )}

      {/* 5. Submissions Table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-blue-900 text-white font-bold uppercase tracking-wider">
              <tr>
                <th className="py-3 px-3 text-center w-12">STT</th>
                <th className="py-3 px-4">Họ và tên</th>
                <th className="py-3 px-3 text-center">Lớp</th>
                <th className="py-3 px-3 text-center">Lần thi</th>
                {currentExamId === 'all' && (
                  <th className="py-3 px-4">Tên bài thi</th>
                )}
                <th className="py-3 px-3 text-center">Mã đề</th>
                <th className="py-3 px-3 text-center">Trạng thái</th>
                <th className="py-3 px-4 text-center">Thời gian</th>
                <th className="py-3 px-3 text-center font-black">Điểm</th>
                <th className="py-3 px-3 text-center text-emerald-300">Đúng</th>
                <th className="py-3 px-3 text-center text-red-300">Sai / Trống</th>
                <th className="py-3 px-3 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredSubmissions.length === 0 ? (
                <tr>
                  <td colSpan={currentExamId === 'all' ? 12 : 11} className="py-12 text-center text-gray-500">
                    <Users className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                    <p className="font-semibold text-gray-700">Chưa có bài làm nào trong danh sách</p>
                    <p className="text-[11px] text-gray-400 mt-1">
                      {statusFilter === 'in_progress'
                        ? 'Hiện không có học sinh nào đang làm bài thi.'
                        : 'Các bài làm của học sinh sẽ tự động lưu và xuất hiện ở đây ngay khi học sinh bắt đầu làm.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredSubmissions.map((sub, idx) => {
                  const isInProgress = sub.status === 'in_progress';
                  const totalScore = sub.score?.totalScore ?? 0;

                  return (
                    <tr
                      key={sub.id}
                      className="hover:bg-blue-50/50 transition cursor-pointer"
                      onClick={() => setActiveSubmission(sub)}
                    >
                      <td className="py-3 px-3 text-center font-mono text-gray-500">{idx + 1}</td>
                      <td className="py-3 px-4 font-bold text-gray-900 flex items-center gap-1.5">
                        <span>{sub.studentName}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-gray-400" />
                      </td>
                      <td className="py-3 px-3 text-center font-semibold text-gray-700">
                        {sub.studentClass}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-50 text-blue-900 border border-blue-200 text-[11px] font-bold">
                          {sub.attemptNumber ? `Lần ${sub.attemptNumber}` : 'Lần 1'}
                        </span>
                      </td>
                      {currentExamId === 'all' && (
                        <td className="py-3 px-4 font-medium text-gray-600 max-w-xs truncate" title={sub.examTitle}>
                          {sub.examTitle || 'Đề thi trực tuyến'}
                        </td>
                      )}
                      <td className="py-3 px-3 text-center font-mono font-bold text-blue-900">
                        {sub.testCode}
                      </td>
                      <td className="py-3 px-3 text-center">
                        {isInProgress ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                            <Activity className="w-3 h-3 text-amber-600 animate-spin" />
                            Đang làm bài
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            Đã nộp bài
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center text-gray-500">
                        {isInProgress ? (
                          sub.lastActiveAt ? (
                            <span className="text-[11px]">
                              Cập nhật {new Date(sub.lastActiveAt).toLocaleTimeString('vi-VN')}
                            </span>
                          ) : (
                            <span className="text-[11px]">Vừa bắt đầu</span>
                          )
                        ) : sub.submittedAt ? (
                          <span className="text-[11px]">
                            {new Date(sub.submittedAt).toLocaleTimeString('vi-VN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}{' '}
                            {new Date(sub.submittedAt).toLocaleDateString('vi-VN')}
                          </span>
                        ) : (
                          <span>-</span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex flex-col items-center">
                          <span
                            className={`text-sm font-black px-2 py-0.5 rounded-lg ${
                              totalScore >= 8.0
                                ? 'bg-emerald-100 text-emerald-800'
                                : totalScore >= 5.0
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {totalScore.toFixed(2)}
                          </span>
                          {isInProgress && (
                            <span className="text-[10px] text-amber-600 font-semibold mt-0.5">
                              (Tạm tính)
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-emerald-700">
                        {sub.score?.correctQuestionsCount ?? 0}
                      </td>
                      <td className="py-3 px-3 text-center font-bold text-red-600">
                        {(sub.score?.wrongQuestionsCount ?? 0) + (sub.score?.unansweredQuestionsCount ?? 0)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => setActiveSubmission(sub)}
                            className="px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-900 rounded-lg font-semibold transition"
                          >
                            Chi tiết
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeletingSubId(sub.id)}
                            className="p-1 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                            title="Xóa bài làm này"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Drilldown Student Submission Modal */}
      {activeSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden border border-gray-100 my-8 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-blue-900 to-indigo-900 text-white p-5 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold flex items-center gap-2">
                  <span>Chi Tiết Bài Làm: {activeSubmission.studentName}</span>
                  {activeSubmission.status === 'in_progress' ? (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500 text-white animate-pulse">
                      Đang làm bài
                    </span>
                  ) : (
                    <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500 text-white">
                      Đã nộp bài
                    </span>
                  )}
                </h3>
                <p className="text-xs text-blue-200 mt-1">
                  Lớp: {activeSubmission.studentClass} • {activeSubmission.attemptNumber ? `Lần thi: Lần ${activeSubmission.attemptNumber} • ` : ''}Mã đề: {activeSubmission.testCode} • Điểm:{' '}
                  <strong className="text-emerald-300">
                    {(activeSubmission.score?.totalScore ?? 0).toFixed(2)}
                  </strong>
                  {activeSubmission.status === 'in_progress' ? ' (Tạm tính)' : ''}
                  {activeSubmission.lastActiveAt && (
                    <span className="ml-2">• Cập nhật lúc {new Date(activeSubmission.lastActiveAt).toLocaleTimeString('vi-VN')}</span>
                  )}
                </p>
              </div>

              <button
                onClick={() => setActiveSubmission(null)}
                className="p-1 rounded-lg hover:bg-white/10 text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body - Questions drilldown */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {(activeSubmission.score?.details || []).length === 0 ? (
                <div className="py-12 text-center text-gray-500 text-xs">
                  Học sinh chưa chọn đáp án nào hoặc đang trong quá trình đọc đề.
                </div>
              ) : (
                (activeSubmission.score?.details || []).map((det) => (
                <div
                  key={det.questionId}
                  className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                    det.isCorrect
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-red-200 bg-red-50/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-bold text-gray-900">
                      Phần {det.section} - Câu {det.displayNumber}
                    </span>
                    <span
                      className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                        det.isCorrect
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {det.isCorrect ? 'ĐÚNG' : 'SAI'} (+{det.pointsEarned.toFixed(2)} đ)
                    </span>
                  </div>

                  <div
                    className="text-gray-800 leading-relaxed chemistry-content"
                    dangerouslySetInnerHTML={{ __html: stripLeadingQuestionPrefix(det.promptHtml) }}
                  />

                  {det.section === 1 && (
                    <div className="bg-white p-2.5 rounded-lg border border-gray-100 space-y-1">
                      <div>
                        Học sinh chọn:{' '}
                        <strong>
                          {det.selectedOptionLabel
                            ? `Phương án ${det.selectedOptionLabel}`
                            : '(Chưa chọn)'}
                        </strong>
                      </div>
                      <div className="text-emerald-700 font-semibold">
                        Đáp án chuẩn: Phương án {det.correctOptionLabel}
                      </div>
                    </div>
                  )}

                  {det.section === 2 && det.statementResults && (
                    <div className="bg-white p-2.5 rounded-lg border border-gray-100 space-y-1">
                      {det.statementResults.map((s: any) => (
                        <div key={s.id} className="flex items-center justify-between">
                          <span>
                            <strong>{s.label})</strong> {s.textHtml}
                          </span>
                          <span>
                            HS: {s.studentChoice === true ? 'ĐÚNG' : s.studentChoice === false ? 'SAI' : '-'} | ĐA:{' '}
                            <strong className={s.correctChoice ? 'text-emerald-700' : 'text-red-700'}>
                              {s.correctChoice ? 'ĐÚNG' : 'SAI'}
                            </strong>
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {det.section === 3 && (
                    <div className="bg-white p-2.5 rounded-lg border border-gray-100 space-y-1">
                      <div>
                        Học sinh nhập: <strong>{det.studentAnswerText || '(Chưa nhập)'}</strong>
                      </div>
                      <div className="text-emerald-700 font-semibold">
                        Đáp án chuẩn: {det.standardAnswers?.join(' hoặc ')}
                      </div>
                    </div>
                  )}
                </div>
              ))
              )}
            </div>

            <div className="p-4 bg-gray-50 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setActiveSubmission(null)}
                className="px-4 py-2 bg-blue-900 text-white rounded-xl text-xs font-semibold hover:bg-blue-800 transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {isScoringModalOpen && activeExam && (
        <ScoringConfigModal
          isOpen={isScoringModalOpen}
          publishedExam={activeExam}
          onClose={() => setIsScoringModalOpen(false)}
          onUpdated={fetchSubmissions}
        />
      )}
    </div>
  );
};
