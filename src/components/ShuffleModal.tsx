import React, { useState, useMemo } from 'react';
import {
  X,
  Shuffle,
  Clock,
  Award,
  ShieldAlert,
  Sparkles,
  Calculator,
  Sliders,
  CheckCircle2,
  Info,
  RotateCcw,
} from 'lucide-react';
import { ExamSource, ScoringConfig } from '../types';
import { api } from '../api';

interface ShuffleModalProps {
  isOpen: boolean;
  exam: ExamSource;
  onClose: () => void;
  onPublishSuccess: () => void;
}

export const ShuffleModal: React.FC<ShuffleModalProps> = ({
  isOpen,
  exam,
  onClose,
  onPublishSuccess,
}) => {
  const [numVersions, setNumVersions] = useState(4);
  const [codePrefix, setCodePrefix] = useState('HHCT');
  const [durationMinutes, setDurationMinutes] = useState(50);
  const [examMode, setExamMode] = useState<'test' | 'practice'>('test'); // 'test' = Kiểm tra (1 lần, thoát là nộp bài), 'practice' = Luyện tập (không giới hạn)
  const [allowShowResult, setAllowShowResult] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const totalQuestionsInput =
    exam.totalQuestions || exam.part1Count + exam.part2Count + exam.part3Count || 1;
  const isStandard28 =
    exam.part1Count === 18 && exam.part2Count === 4 && exam.part3Count === 6;

  // Scoring mode: default to 'equal_all' unless it's strictly standard 28
  const [scoringMode, setScoringMode] = useState<
    'equal_all' | 'custom_sections' | 'vietnam_standard'
  >(isStandard28 ? 'vietnam_standard' : 'equal_all');

  // Equal All mode calculations: 10 điểm chia cho tổng số câu hỏi nhập vào của 3 phần
  const avgPointsPerQ = useMemo(() => {
    return Math.round((10 / totalQuestionsInput) * 1000) / 1000;
  }, [totalQuestionsInput]);

  const avgPointsPerStatement = useMemo(() => {
    return Math.round((avgPointsPerQ / 4) * 10000) / 10000;
  }, [avgPointsPerQ]);

  // Custom sections inputs
  const initialP1Total = useMemo(() => {
    if (exam.part1Count === 0) return 0;
    if (isStandard28) return 4.5;
    return Math.round(exam.part1Count * avgPointsPerQ * 10) / 10;
  }, [exam.part1Count, isStandard28, avgPointsPerQ]);

  const initialP2Total = useMemo(() => {
    if (exam.part2Count === 0) return 0;
    if (isStandard28) return 4.0;
    return Math.round(exam.part2Count * avgPointsPerQ * 10) / 10;
  }, [exam.part2Count, isStandard28, avgPointsPerQ]);

  const initialP3Total = useMemo(() => {
    if (exam.part3Count === 0) return 0;
    if (isStandard28) return 1.5;
    return Math.round((10 - initialP1Total - initialP2Total) * 10) / 10;
  }, [exam.part3Count, isStandard28, initialP1Total, initialP2Total]);

  const [part1CustomTotal, setPart1CustomTotal] = useState<number>(initialP1Total);
  const [part2CustomTotal, setPart2CustomTotal] = useState<number>(initialP2Total);
  const [part3CustomTotal, setPart3CustomTotal] = useState<number>(initialP3Total);
  const [customPart2Grading, setCustomPart2Grading] = useState<
    'equal_per_statement' | 'vietnam_standard'
  >('equal_per_statement');

  // Custom per-question points
  const customP1PerQ =
    exam.part1Count > 0 ? Math.round((part1CustomTotal / exam.part1Count) * 1000) / 1000 : 0;
  const customP2PerQ =
    exam.part2Count > 0 ? Math.round((part2CustomTotal / exam.part2Count) * 1000) / 1000 : 0;
  const customP2PerStmt = Math.round((customP2PerQ / 4) * 10000) / 10000;
  const customP3PerQ =
    exam.part3Count > 0 ? Math.round((part3CustomTotal / exam.part3Count) * 1000) / 1000 : 0;
  const customTotalScale =
    Math.round((part1CustomTotal + part2CustomTotal + part3CustomTotal) * 100) / 100;

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    let finalScoringConfig: ScoringConfig;

    if (scoringMode === 'custom_sections') {
      finalScoringConfig = {
        scoringMode: 'custom_sections',
        part1TotalPoints: part1CustomTotal,
        part2TotalPoints: part2CustomTotal,
        part3TotalPoints: part3CustomTotal,
        part1PointsPerQ: customP1PerQ,
        part2PointsPerQ: customP2PerQ,
        part3PointsPerQ: customP3PerQ,
        part2GradingMode: customPart2Grading,
        totalScale: customTotalScale || 10,
      };
    } else if (scoringMode === 'vietnam_standard' && isStandard28) {
      finalScoringConfig = {
        scoringMode: 'vietnam_standard',
        part1TotalPoints: 4.5,
        part2TotalPoints: 4.0,
        part3TotalPoints: 1.5,
        part1PointsPerQ: 0.25,
        part2PointsPerQ: 1.0,
        part3PointsPerQ: 0.25,
        part2GradingMode: 'vietnam_standard',
        totalScale: 10,
      };
    } else {
      // Default: 10 điểm chia đều cho tổng số câu hỏi nhập vào của cả 3 phần
      const p1Tot = Math.round(exam.part1Count * avgPointsPerQ * 100) / 100;
      const p2Tot = Math.round(exam.part2Count * avgPointsPerQ * 100) / 100;
      const p3Tot = Math.round((10 - p1Tot - p2Tot) * 100) / 100;

      finalScoringConfig = {
        scoringMode: 'equal_all',
        part1TotalPoints: p1Tot,
        part2TotalPoints: p2Tot,
        part3TotalPoints: p3Tot,
        part1PointsPerQ: exam.part1Count > 0 ? avgPointsPerQ : 0,
        part2PointsPerQ: exam.part2Count > 0 ? avgPointsPerQ : 0,
        part3PointsPerQ: exam.part3Count > 0 ? avgPointsPerQ : 0,
        part2GradingMode: 'equal_per_statement',
        totalScale: 10,
      };
    }

    try {
      await api.shuffleAndPublish(exam.id, {
        numVersions,
        codePrefix,
        durationMinutes,
        scoringConfig: finalScoringConfig,
        allowShowResultImmediately: allowShowResult,
        examMode,
        maxAttempts: examMode === 'test' ? 1 : 0,
      });
      onPublishSuccess();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Lỗi trộn và phát hành đề thi');
    } finally {
      setLoading(false);
    }
  };

  const handleResetCustomProportional = () => {
    const p1Tot = Math.round(exam.part1Count * avgPointsPerQ * 10) / 10;
    const p2Tot = Math.round(exam.part2Count * avgPointsPerQ * 10) / 10;
    const p3Tot = Math.round((10 - p1Tot - p2Tot) * 10) / 10;
    setPart1CustomTotal(p1Tot);
    setPart2CustomTotal(p2Tot);
    setPart3CustomTotal(p3Tot);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full overflow-hidden border border-gray-100 my-6 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 text-white p-5 sm:p-6 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white/10 rounded-2xl border border-white/20">
              <Shuffle className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold">Cấu Hình Trộn Đề & Phân Bổ Điểm Số</h2>
              <p className="text-xs text-blue-200">
                Tự động tạo nhiều mã đề • Tính điểm chuẩn xác theo số câu hỏi thực tế
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-2">
              <ShieldAlert className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Exam Overview Banner */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div>
              <span className="text-slate-500">Đề thi hiện tại: </span>
              <strong className="text-slate-900">{exam.title}</strong>
            </div>
            <div className="flex items-center gap-2">
              <span className="bg-blue-100 text-blue-900 font-bold px-2.5 py-0.5 rounded-full">
                Tổng: {totalQuestionsInput} câu hỏi
              </span>
              <span className="text-slate-400">•</span>
              <span className="text-slate-600 font-medium">
                P.I: {exam.part1Count}c | P.II: {exam.part2Count}c | P.III: {exam.part3Count}c
              </span>
            </div>
          </div>

          {/* Number of Shuffled Versions */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
              Số lượng mã đề cần tạo
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[2, 4, 6, 8].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setNumVersions(n)}
                  className={`py-2 rounded-xl text-sm font-bold border transition ${
                    numVersions === n
                      ? 'bg-blue-900 text-white border-blue-900 shadow-sm'
                      : 'bg-gray-50 text-gray-700 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  {n} Mã đề
                </button>
              ))}
            </div>
            <p className="text-[11px] text-gray-500">
              Ví dụ: {numVersions} mã đề sẽ có tên {codePrefix}001, {codePrefix}002...
            </p>
          </div>

          {/* Code Prefix & Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Tiền tố mã đề
              </label>
              <input
                type="text"
                required
                value={codePrefix}
                onChange={(e) => setCodePrefix(e.target.value.toUpperCase())}
                placeholder="HHCT"
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-semibold uppercase text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Thời gian làm bài (Phút)
              </label>
              <div className="relative">
                <Clock className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="number"
                  min="5"
                  max="180"
                  required
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(parseInt(e.target.value, 10) || 50)}
                  className="w-full pl-9 pr-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden"
                />
              </div>
            </div>
          </div>

          {/* Option: Exam Mode (2 Tùy chọn: 1. Kiểm tra vs 2. Luyện tập) */}
          <div className="space-y-2 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-gray-800 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-blue-700" />
                Hình thức tổ chức thi:
              </label>
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                examMode === 'test'
                  ? 'bg-rose-50 text-rose-900 border-rose-200'
                  : 'bg-emerald-50 text-emerald-900 border-emerald-200'
              }`}>
                {examMode === 'test' ? '🔒 Kiểm tra (1 lần, thoát là nộp)' : '✨ Luyện tập (Không giới hạn)'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Option 1: Kiểm tra */}
              <button
                type="button"
                onClick={() => setExamMode('test')}
                className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
                  examMode === 'test'
                    ? 'bg-gradient-to-br from-rose-50/80 to-red-50/50 border-rose-500 shadow-sm ring-2 ring-rose-500/20'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100/80 hover:border-gray-300'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                  examMode === 'test' ? 'bg-rose-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  <ShieldAlert className="w-4 h-4" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-900 uppercase tracking-wider">
                      1. Kiểm tra
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      examMode === 'test' ? 'bg-rose-600 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      1 lần duy nhất
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    Học sinh <strong>chỉ làm bài 1 lần</strong>. Nếu thoát trình duyệt, rời khỏi trang hoặc chuyển tab thì hệ thống <strong>tự động nộp bài ngay</strong>.
                  </p>
                </div>
              </button>

              {/* Option 2: Luyện tập */}
              <button
                type="button"
                onClick={() => setExamMode('practice')}
                className={`p-3.5 rounded-2xl border text-left transition flex items-start gap-3 cursor-pointer ${
                  examMode === 'practice'
                    ? 'bg-gradient-to-br from-emerald-50/80 to-teal-50/50 border-emerald-600 shadow-sm ring-2 ring-emerald-500/20'
                    : 'bg-gray-50 border-gray-200 hover:bg-gray-100/80 hover:border-gray-300'
                }`}
              >
                <div className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                  examMode === 'practice' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'
                }`}>
                  <RotateCcw className="w-4 h-4" />
                </div>
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-gray-900 uppercase tracking-wider">
                      2. Luyện tập
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                      examMode === 'practice' ? 'bg-emerald-600 text-white' : 'bg-gray-200 text-gray-600'
                    }`}>
                      Không giới hạn (∞)
                    </span>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed">
                    <strong>Không giới hạn số lần làm và nộp bài</strong>. Hệ thống tự động chấm điểm và lưu lại kết quả, điểm số của <strong>tất cả các lần nộp</strong>.
                  </p>
                </div>
              </button>
            </div>

            <p className="text-[11px] text-gray-500 leading-relaxed pt-1">
              {examMode === 'test'
                ? '📌 Phù hợp cho kiểm tra 15 phút, kiểm tra giữa kỳ, cuối kỳ, thi thử chính thức. Mỗi học sinh chỉ có 1 cơ hội làm bài, học sinh thoát ra là hệ thống thu bài.'
                : '📌 Phù hợp ôn tập kiến thức, giải bài tập. Học sinh có thể làm lại nhiều lần (Lần 1, Lần 2, Lần 3...), thầy cô theo dõi sự tiến bộ qua từng lần nộp.'}
            </p>
          </div>

          {/* MAIN FEATURE: SCORING DISTRIBUTION SCHEME */}
          <div className="space-y-3 pt-2 border-t border-gray-100">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-gray-900 uppercase tracking-wider flex items-center gap-1.5">
                <Award className="w-4 h-4 text-emerald-600" />
                Phương Thức Phân Bổ Điểm Số & Chấm Điểm
              </label>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Thang điểm 10
              </span>
            </div>

            {/* 3 Options Tabs */}
            <div className="space-y-3">
              {/* OPTION 1: Chia đều 10 điểm cho tất cả câu hỏi */}
              <label
                className={`flex items-start gap-3.5 p-4 rounded-2xl border transition cursor-pointer ${
                  scoringMode === 'equal_all'
                    ? 'border-blue-600 bg-blue-50/50 ring-2 ring-blue-500/20'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="scoringMode"
                  checked={scoringMode === 'equal_all'}
                  onChange={() => setScoringMode('equal_all')}
                  className="mt-1 text-blue-900 focus:ring-blue-900"
                />
                <div className="space-y-2 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                      <Calculator className="w-4 h-4 text-blue-700" />
                      Chia đều cho từng câu / từng ý (10 điểm / {totalQuestionsInput} câu)
                    </span>
                    <span className="text-xs font-black bg-blue-900 text-white px-2.5 py-0.5 rounded-full">
                      {avgPointsPerQ} đ/câu
                    </span>
                  </div>

                  <p className="text-xs text-gray-600 leading-relaxed">
                    Công thức: <strong className="text-blue-950 font-bold">10 điểm chia cho tổng {totalQuestionsInput} câu hỏi nhập vào của 3 phần</strong> = <strong className="text-emerald-700 font-bold">{avgPointsPerQ} điểm trung bình mỗi câu</strong>.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs pt-1">
                    <div className="p-2.5 rounded-xl bg-white border border-blue-200/80 shadow-2xs space-y-0.5">
                      <div className="font-bold text-blue-900">Phần I ({exam.part1Count} câu)</div>
                      <div className="text-gray-700 font-medium">
                        {avgPointsPerQ} đ/câu • Tổng {Math.round(exam.part1Count * avgPointsPerQ * 100) / 100}đ
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white border border-emerald-200/80 shadow-2xs space-y-0.5">
                      <div className="font-bold text-emerald-900">Phần II ({exam.part2Count} câu)</div>
                      <div className="text-gray-700 font-medium">
                        {avgPointsPerQ} đ/câu • Mỗi ý = {avgPointsPerStatement}đ
                      </div>
                    </div>

                    <div className="p-2.5 rounded-xl bg-white border border-amber-200/80 shadow-2xs space-y-0.5">
                      <div className="font-bold text-amber-900">Phần III ({exam.part3Count} câu)</div>
                      <div className="text-gray-700 font-medium">
                        {avgPointsPerQ} đ/câu • Tổng {Math.round(exam.part3Count * avgPointsPerQ * 100) / 100}đ
                      </div>
                    </div>
                  </div>
                </div>
              </label>

              {/* OPTION 2: Giáo viên tự nhập điểm cho từng phần */}
              <label
                className={`flex items-start gap-3.5 p-4 rounded-2xl border transition cursor-pointer ${
                  scoringMode === 'custom_sections'
                    ? 'border-indigo-600 bg-indigo-50/40 ring-2 ring-indigo-500/20'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="scoringMode"
                  checked={scoringMode === 'custom_sections'}
                  onChange={() => setScoringMode('custom_sections')}
                  className="mt-1 text-indigo-900 focus:ring-indigo-900"
                />
                <div className="space-y-3 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                      <Sliders className="w-4 h-4 text-indigo-700" />
                      Giáo viên tự nhập điểm cho từng phần (Phần 1, Phần 2, Phần 3)
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setScoringMode('custom_sections');
                        handleResetCustomProportional();
                      }}
                      className="text-[11px] font-semibold text-indigo-700 hover:text-indigo-900 hover:underline"
                    >
                      Chia tỷ lệ 10đ
                    </button>
                  </div>

                  <p className="text-xs text-gray-600">
                    Thầy cô tự điền điểm cho từng phần. Số điểm cho từng câu sẽ tự động lấy điểm phần chia cho tổng số câu của phần đó.
                  </p>

                  {/* Section Points Inputs */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
                    {/* Part 1 Input */}
                    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-blue-900">
                        <span>Phần I</span>
                        <span className="text-[11px] text-gray-500 font-normal">
                          {exam.part1Count} câu
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="10"
                          value={part1CustomTotal}
                          onChange={(e) => {
                            setScoringMode('custom_sections');
                            setPart1CustomTotal(parseFloat(e.target.value) || 0);
                          }}
                          className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">
                          đ
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500">
                        = <strong className="text-indigo-900">{customP1PerQ} đ/câu</strong>
                      </div>
                    </div>

                    {/* Part 2 Input */}
                    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-emerald-900">
                        <span>Phần II (Đ/S)</span>
                        <span className="text-[11px] text-gray-500 font-normal">
                          {exam.part2Count} câu
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="10"
                          value={part2CustomTotal}
                          onChange={(e) => {
                            setScoringMode('custom_sections');
                            setPart2CustomTotal(parseFloat(e.target.value) || 0);
                          }}
                          className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">
                          đ
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500">
                        = <strong className="text-emerald-900">{customP2PerQ} đ/câu</strong> (ý = {customP2PerStmt}đ)
                      </div>
                    </div>

                    {/* Part 3 Input */}
                    <div className="bg-white p-3 rounded-xl border border-gray-200 shadow-2xs space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-amber-900">
                        <span>Phần III</span>
                        <span className="text-[11px] text-gray-500 font-normal">
                          {exam.part3Count} câu
                        </span>
                      </div>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.05"
                          min="0"
                          max="10"
                          value={part3CustomTotal}
                          onChange={(e) => {
                            setScoringMode('custom_sections');
                            setPart3CustomTotal(parseFloat(e.target.value) || 0);
                          }}
                          className="w-full px-2.5 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-sm font-bold text-gray-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-hidden"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">
                          đ
                        </span>
                      </div>
                      <div className="text-[11px] text-gray-500">
                        = <strong className="text-amber-900">{customP3PerQ} đ/câu</strong>
                      </div>
                    </div>
                  </div>

                  {/* Summary of Custom Scale */}
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-gray-600">
                      Tổng điểm đề thi: <strong className={`font-black ${customTotalScale === 10 ? 'text-emerald-600' : 'text-amber-600'}`}>{customTotalScale} điểm</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500 text-[11px]">Quy tắc Phần II:</span>
                      <select
                        value={customPart2Grading}
                        onChange={(e) => setCustomPart2Grading(e.target.value as any)}
                        className="text-[11px] font-semibold bg-white border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="equal_per_statement">Chia đều cho 4 ý</option>
                        <option value="vietnam_standard">Thang phân hóa Bộ 2025</option>
                      </select>
                    </div>
                  </div>
                </div>
              </label>

              {/* OPTION 3: Chuẩn Bộ Giáo dục 2025 (4.5đ - 4.0đ - 1.5đ) */}
              <label
                className={`flex items-start gap-3.5 p-4 rounded-2xl border transition cursor-pointer ${
                  scoringMode === 'vietnam_standard'
                    ? 'border-emerald-600 bg-emerald-50/40 ring-2 ring-emerald-500/20'
                    : 'border-gray-200 bg-white hover:bg-gray-50'
                }`}
              >
                <input
                  type="radio"
                  name="scoringMode"
                  checked={scoringMode === 'vietnam_standard'}
                  onChange={() => setScoringMode('vietnam_standard')}
                  className="mt-1 text-emerald-900 focus:ring-emerald-900"
                />
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-sm text-gray-900 flex items-center gap-1.5">
                      <Award className="w-4 h-4 text-emerald-700" />
                      Chuẩn Bộ Giáo dục & Đào tạo 2025 (Đề 28 câu: 18 - 4 - 6)
                    </span>
                    {isStandard28 ? (
                      <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                        Khuyên dùng cho đề 28 câu
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Info className="w-3 h-3" />
                        Đề hiện tại có {totalQuestionsInput} câu
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-gray-600 leading-relaxed">
                    Phần I: 18 câu = 4.5đ (0.25đ/câu) • Phần II: 4 câu = 4.0đ (1 ý=0.1đ, 2 ý=0.25đ, 3 ý=0.5đ, 4 ý=1.0đ) • Phần III: 6 câu = 1.5đ (0.25đ/câu).
                  </div>

                  {!isStandard28 && scoringMode === 'vietnam_standard' && (
                    <div className="p-2.5 bg-amber-50 rounded-xl border border-amber-200 text-xs text-amber-800 flex items-start gap-2 mt-2">
                      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        Đề thi hiện tại có <strong>{totalQuestionsInput} câu hỏi</strong> (khác với 28 câu chuẩn). Nếu chọn chuẩn Bộ, điểm mỗi câu sẽ mặc định là 0.25đ khiến tổng điểm tối đa không đạt 10đ. Thầy cô nên chọn <strong>"Chia đều cho từng câu"</strong> hoặc <strong>"Tự nhập điểm"</strong> ở trên!
                      </div>
                    </div>
                  )}
                </div>
              </label>
            </div>
          </div>

          {/* Show Result Option */}
          <div className="pt-1">
            <label className="flex items-center gap-3 p-3 rounded-xl bg-blue-50/60 border border-blue-200 cursor-pointer">
              <input
                type="checkbox"
                checked={allowShowResult}
                onChange={(e) => setAllowShowResult(e.target.checked)}
                className="w-4 h-4 text-blue-900 rounded border-gray-300 focus:ring-blue-900"
              />
              <span className="text-xs font-semibold text-blue-950">
                Cho phép học sinh xem điểm số và đáp án chi tiết ngay sau khi nộp bài
              </span>
            </label>
          </div>

          {/* Shuffling Rules Notice */}
          <div className="p-3.5 bg-emerald-50 rounded-xl border border-emerald-200 text-xs text-emerald-800 space-y-1">
            <div className="font-bold text-emerald-950 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-emerald-600" />
              Cam kết bảo toàn kỹ thuật:
            </div>
            <ul className="list-disc list-inside space-y-0.5 text-emerald-800 text-[11px]">
              <li>Trộn độc lập từng Phần (không xáo trộn câu giữa 3 phần).</li>
              <li>Ảnh, bảng biểu và công thức Hóa học luôn gắn chặt với đúng câu hỏi.</li>
              <li>Phương án A, B, C, D và nhận định a, b, c, d được xáo trộn và đánh lại nhãn.</li>
              <li>Đáp án đúng gắn chặt theo ID nội bộ, đảm bảo chấm điểm tuyệt đối chính xác.</li>
            </ul>
          </div>

          {/* Buttons */}
          <div className="pt-2 flex gap-3">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              Hủy bỏ
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-2 py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Shuffle className="w-4 h-4" />
              {loading ? 'Đang trộn đề...' : 'BẮT ĐẦU TRỘN & PHÁT HÀNH ĐỀ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
