import React, { useState } from 'react';
import { X, Award, Calculator, Sliders, ShieldAlert, CheckCircle2, RotateCw, Info } from 'lucide-react';
import { PublishedExam, ScoringConfig } from '../types';
import { api } from '../api';

interface ScoringConfigModalProps {
  isOpen: boolean;
  publishedExam: PublishedExam;
  onClose: () => void;
  onUpdated: () => void;
}

export const ScoringConfigModal: React.FC<ScoringConfigModalProps> = ({
  isOpen,
  publishedExam,
  onClose,
  onUpdated,
}) => {
  const version = publishedExam.versions[0];
  const p1Count = version?.questions.filter((q) => q.section === 1).length || 0;
  const p2Count = version?.questions.filter((q) => q.section === 2).length || 0;
  const p3Count = version?.questions.filter((q) => q.section === 3).length || 0;
  const totalQuestions = p1Count + p2Count + p3Count || 1;
  const isStandard28 = p1Count === 18 && p2Count === 4 && p3Count === 6;

  const currentConfig = publishedExam.scoringConfig;
  const [scoringMode, setScoringMode] = useState<'equal_all' | 'custom_sections' | 'vietnam_standard'>(
    currentConfig.scoringMode || (isStandard28 ? 'vietnam_standard' : 'equal_all')
  );

  const avgPointsPerQ = Math.round((10 / totalQuestions) * 1000) / 1000;
  const avgPointsPerStmt = Math.round((avgPointsPerQ / 4) * 10000) / 10000;

  // Custom sections state
  const [part1Total, setPart1Total] = useState<number>(
    currentConfig.part1TotalPoints !== undefined
      ? currentConfig.part1TotalPoints
      : Math.round(p1Count * avgPointsPerQ * 10) / 10
  );
  const [part2Total, setPart2Total] = useState<number>(
    currentConfig.part2TotalPoints !== undefined
      ? currentConfig.part2TotalPoints
      : Math.round(p2Count * avgPointsPerQ * 10) / 10
  );
  const [part3Total, setPart3Total] = useState<number>(
    currentConfig.part3TotalPoints !== undefined
      ? currentConfig.part3TotalPoints
      : Math.round((10 - part1Total - part2Total) * 10) / 10
  );
  const [part2GradingMode, setPart2GradingMode] = useState<'equal_per_statement' | 'vietnam_standard'>(
    currentConfig.part2GradingMode || 'equal_per_statement'
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const customP1PerQ = p1Count > 0 ? Math.round((part1Total / p1Count) * 1000) / 1000 : 0;
  const customP2PerQ = p2Count > 0 ? Math.round((part2Total / p2Count) * 1000) / 1000 : 0;
  const customP2PerStmt = Math.round((customP2PerQ / 4) * 10000) / 10000;
  const customP3PerQ = p3Count > 0 ? Math.round((part3Total / p3Count) * 1000) / 1000 : 0;
  const customTotalScale = Math.round((part1Total + part2Total + part3Total) * 100) / 100;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      await api.updatePublishedExamScoring(publishedExam.id, {
        scoringMode,
        part1TotalPoints: scoringMode === 'custom_sections' ? part1Total : undefined,
        part2TotalPoints: scoringMode === 'custom_sections' ? part2Total : undefined,
        part3TotalPoints: scoringMode === 'custom_sections' ? part3Total : undefined,
        part2GradingMode: scoringMode === 'custom_sections' ? part2GradingMode : 'equal_per_statement',
      });
      onUpdated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Lỗi cập nhật cấu hình điểm');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-xl w-full overflow-hidden border border-gray-100 my-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-teal-900 text-white p-5 sm:p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl border border-white/20">
              <Award className="w-6 h-6 text-emerald-300" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Cấu Hình Điểm Số & Chấm Lại Bài Thi</h2>
              <p className="text-xs text-blue-200">
                {publishedExam.title} • Mã phòng: {publishedExam.accessCode}
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSave} className="p-5 sm:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Notice about auto re-grading */}
          <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-xl text-xs text-blue-900 flex items-start gap-2">
            <RotateCw className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              Khi thầy cô thay đổi cấu hình điểm, hệ thống sẽ <strong>tự động chấm lại toàn bộ {publishedExam.stats.totalSubmissions} bài làm</strong> đã nộp theo thang điểm mới!
            </div>
          </div>

          {/* Question Stats */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex items-center justify-between text-xs">
            <span className="font-semibold text-gray-700">Tổng số câu hỏi: {totalQuestions}</span>
            <span className="text-gray-500">
              P.I: {p1Count} câu • P.II: {p2Count} câu • P.III: {p3Count} câu
            </span>
          </div>

          {/* Mode Selection */}
          <div className="space-y-3">
            {/* OPTION 1: Chia đều 10 điểm */}
            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border transition cursor-pointer ${
                scoringMode === 'equal_all'
                  ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-500/20'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="modalScoringMode"
                checked={scoringMode === 'equal_all'}
                onChange={() => setScoringMode('equal_all')}
                className="mt-1 text-blue-900 focus:ring-blue-900"
              />
              <div className="space-y-1 flex-1 text-xs">
                <div className="flex items-center justify-between font-bold text-gray-900">
                  <span className="flex items-center gap-1.5">
                    <Calculator className="w-4 h-4 text-blue-700" />
                    Chia đều cho từng câu / từng ý (10 điểm / {totalQuestions} câu)
                  </span>
                  <span className="bg-blue-100 text-blue-900 px-2 py-0.5 rounded-full font-bold">
                    {avgPointsPerQ} đ/câu
                  </span>
                </div>
                <p className="text-gray-600">
                  10 điểm chia cho tổng {totalQuestions} câu hỏi của 3 phần = <strong>{avgPointsPerQ} điểm/câu</strong> (Phần II mỗi ý đúng = {avgPointsPerStmt}đ).
                </p>
              </div>
            </label>

            {/* OPTION 2: Giáo viên tự nhập điểm */}
            <label
              className={`flex items-start gap-3 p-3.5 rounded-xl border transition cursor-pointer ${
                scoringMode === 'custom_sections'
                  ? 'border-indigo-600 bg-indigo-50/40 ring-1 ring-indigo-500/20'
                  : 'border-gray-200 bg-white hover:bg-gray-50'
              }`}
            >
              <input
                type="radio"
                name="modalScoringMode"
                checked={scoringMode === 'custom_sections'}
                onChange={() => setScoringMode('custom_sections')}
                className="mt-1 text-indigo-900 focus:ring-indigo-900"
              />
              <div className="space-y-2 flex-1 text-xs">
                <div className="font-bold text-gray-900 flex items-center gap-1.5">
                  <Sliders className="w-4 h-4 text-indigo-700" />
                  Giáo viên tự nhập điểm cho từng phần (Phần 1, 2, 3)
                </div>
                <p className="text-gray-600">
                  Thầy cô nhập số điểm cho mỗi phần, điểm mỗi câu = điểm phần / số câu của phần đó.
                </p>

                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-white p-2.5 rounded-lg border border-gray-200 space-y-1">
                    <div className="font-bold text-blue-900">P.I ({p1Count}c)</div>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="10"
                      value={part1Total}
                      onChange={(e) => {
                        setScoringMode('custom_sections');
                        setPart1Total(parseFloat(e.target.value) || 0);
                      }}
                      className="w-full px-2 py-1 bg-gray-50 border border-gray-300 rounded text-xs font-bold"
                    />
                    <div className="text-[10px] text-gray-500 font-semibold">= {customP1PerQ}đ/c</div>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-gray-200 space-y-1">
                    <div className="font-bold text-emerald-900">P.II ({p2Count}c)</div>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="10"
                      value={part2Total}
                      onChange={(e) => {
                        setScoringMode('custom_sections');
                        setPart2Total(parseFloat(e.target.value) || 0);
                      }}
                      className="w-full px-2 py-1 bg-gray-50 border border-gray-300 rounded text-xs font-bold"
                    />
                    <div className="text-[10px] text-gray-500 font-semibold">= {customP2PerQ}đ/c</div>
                  </div>

                  <div className="bg-white p-2.5 rounded-lg border border-gray-200 space-y-1">
                    <div className="font-bold text-amber-900">P.III ({p3Count}c)</div>
                    <input
                      type="number"
                      step="0.05"
                      min="0"
                      max="10"
                      value={part3Total}
                      onChange={(e) => {
                        setScoringMode('custom_sections');
                        setPart3Total(parseFloat(e.target.value) || 0);
                      }}
                      className="w-full px-2 py-1 bg-gray-50 border border-gray-300 rounded text-xs font-bold"
                    />
                    <div className="text-[10px] text-gray-500 font-semibold">= {customP3PerQ}đ/c</div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1">
                  <span>
                    Tổng thang điểm: <strong className="font-bold text-emerald-700">{customTotalScale} đ</strong>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-gray-500">Quy tắc P.II:</span>
                    <select
                      value={part2GradingMode}
                      onChange={(e) => setPart2GradingMode(e.target.value as any)}
                      className="text-[11px] border border-gray-300 rounded px-1.5 py-0.5"
                    >
                      <option value="equal_per_statement">Chia đều 4 ý</option>
                      <option value="vietnam_standard">Thang Bộ 2025</option>
                    </select>
                  </div>
                </div>
              </div>
            </label>

            {/* OPTION 3: Chuẩn Bộ 2025 */}
            {isStandard28 && (
              <label
                className={`flex items-start gap-3 p-3.5 rounded-xl border transition cursor-pointer ${
                  scoringMode === 'vietnam_standard'
                    ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-500/20'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="modalScoringMode"
                  checked={scoringMode === 'vietnam_standard'}
                  onChange={() => setScoringMode('vietnam_standard')}
                  className="mt-1 text-emerald-900 focus:ring-emerald-900"
                />
                <div className="space-y-0.5 flex-1 text-xs">
                  <div className="font-bold text-gray-900 flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-emerald-700" />
                    Chuẩn Bộ GD&ĐT 2025 (4.5đ - 4.0đ - 1.5đ)
                  </div>
                  <p className="text-gray-600">
                    Phần I: 0.25đ/câu • Phần II: 1.0đ/câu (thang phân hóa 0.1-0.25-0.5-1.0) • Phần III: 0.25đ/câu.
                  </p>
                </div>
              </label>
            )}
          </div>

          {/* Action buttons */}
          <div className="pt-3 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-2 py-2.5 px-4 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <RotateCw className={`w-3.5 h-3.5 ${saving ? 'animate-spin' : ''}`} />
              {saving ? 'Đang chấm lại bài thi...' : 'LƯU & CHẤM LẠI TOÀN BỘ BÀI THI'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
