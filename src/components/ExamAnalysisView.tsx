import React, { useState } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ImageIcon,
  Shuffle,
  Eye,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Layers,
  Sparkles,
  Edit3,
} from 'lucide-react';
import { ExamSource, ParsedQuestion, Part1Option, Part2Statement } from '../types';
import { api } from '../api';

interface ExamAnalysisViewProps {
  exam: ExamSource;
  onOpenShuffleModal: () => void;
  onExamUpdated: (exam: ExamSource) => void;
}

export const ExamAnalysisView: React.FC<ExamAnalysisViewProps> = ({
  exam,
  onOpenShuffleModal,
  onExamUpdated,
}) => {
  const [selectedSection, setSelectedSection] = useState<number | 'all'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'needs_review' | 'confirmed' | 'error'>('all');
  const [expandedQId, setExpandedQId] = useState<string | null>(null);
  const [savingQId, setSavingQId] = useState<string | null>(null);

  // Total images & formulas count
  const totalImages = Object.keys(exam.mediaAssets || {}).length;
  const totalMathType = exam.questions.reduce((sum, q) => sum + (q.mathTypeCount || 0), 0);

  // Filtered questions
  const filteredQuestions = exam.questions.filter((q) => {
    if (selectedSection !== 'all' && q.section !== selectedSection) return false;
    if (filterStatus !== 'all' && q.status !== filterStatus) return false;
    return true;
  });

  const handleSelectPart1Answer = async (question: ParsedQuestion, optionId: string) => {
    if (!question.options) return;
    setSavingQId(question.id);
    const updatedOptions: Part1Option[] = question.options.map((opt) => ({
      ...opt,
      isCorrect: opt.id === optionId,
    }));

    try {
      const res = await api.updateQuestion(exam.id, question.id, {
        options: updatedOptions,
        status: 'confirmed',
      });
      onExamUpdated(res.exam);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingQId(null);
    }
  };

  const handleTogglePart2Statement = async (
    question: ParsedQuestion,
    stmtId: string,
    isCorrectValue: boolean
  ) => {
    if (!question.statements) return;
    setSavingQId(question.id);
    const updatedStmts: Part2Statement[] = question.statements.map((stmt) =>
      stmt.id === stmtId ? { ...stmt, isCorrect: isCorrectValue } : stmt
    );

    try {
      const res = await api.updateQuestion(exam.id, question.id, {
        statements: updatedStmts,
        status: 'confirmed',
      });
      onExamUpdated(res.exam);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingQId(null);
    }
  };

  const handleUpdatePart3Answer = async (question: ParsedQuestion, newAnswer: string) => {
    setSavingQId(question.id);
    try {
      const res = await api.updateQuestion(exam.id, question.id, {
        shortAnswerKey: newAnswer,
        status: newAnswer.trim() ? 'confirmed' : 'needs_review',
      });
      onExamUpdated(res.exam);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingQId(null);
    }
  };

  const hasCriticalErrors = exam.questions.some((q) => q.status === 'error');

  return (
    <div className="space-y-6">
      {/* 1. Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="text-xs text-gray-500 font-medium">Tổng số câu</div>
          <div className="text-2xl font-black text-gray-900 mt-1">{exam.totalQuestions}</div>
          <div className="text-[11px] text-gray-400 mt-0.5">3 phần thi Bộ GD&ĐT</div>
        </div>

        <div className="bg-blue-50/60 p-4 rounded-xl border border-blue-200 shadow-xs">
          <div className="text-xs text-blue-700 font-medium">Phần 1: Nhiều lựa chọn</div>
          <div className="text-2xl font-black text-blue-900 mt-1">{exam.part1Count}</div>
          <div className="text-[11px] text-blue-600 mt-0.5">Nhận diện A, B, C, D</div>
        </div>

        <div className="bg-emerald-50/60 p-4 rounded-xl border border-emerald-200 shadow-xs">
          <div className="text-xs text-emerald-700 font-medium">Phần 2: Đúng – Sai</div>
          <div className="text-2xl font-black text-emerald-900 mt-1">{exam.part2Count}</div>
          <div className="text-[11px] text-emerald-600 mt-0.5">Nhận diện a, b, c, d</div>
        </div>

        <div className="bg-amber-50/60 p-4 rounded-xl border border-amber-200 shadow-xs">
          <div className="text-xs text-amber-700 font-medium">Phần 3: Trả lời ngắn</div>
          <div className="text-2xl font-black text-amber-900 mt-1">{exam.part3Count}</div>
          <div className="text-[11px] text-amber-600 mt-0.5">Chuẩn hóa số / đơn vị</div>
        </div>

        <div className="bg-purple-50/60 p-4 rounded-xl border border-purple-200 shadow-xs">
          <div className="text-xs text-purple-700 font-medium">Ảnh & MathType</div>
          <div className="text-2xl font-black text-purple-900 mt-1">
            {totalImages + totalMathType}
          </div>
          <div className="text-[11px] text-purple-600 mt-0.5">
            {totalImages} ảnh • {totalMathType} công thức
          </div>
        </div>

        <div
          className={`p-4 rounded-xl border shadow-xs ${
            exam.warningsCount > 0
              ? 'bg-red-50/70 border-red-200 text-red-900'
              : 'bg-teal-50/70 border-teal-200 text-teal-900'
          }`}
        >
          <div className="text-xs font-medium">Cần kiểm tra lại</div>
          <div className="text-2xl font-black mt-1">{exam.warningsCount}</div>
          <div className="text-[11px] mt-0.5">
            {exam.warningsCount > 0 ? 'Cần thầy cô xác nhận' : '100% hợp lệ'}
          </div>
        </div>
      </div>

      {/* 2. Top Banner with Large Shuffling Action */}
      <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 text-white rounded-2xl p-6 shadow-md flex flex-col md:flex-row items-center justify-between gap-6">
        <div className="space-y-1.5 text-center md:text-left">
          <div className="flex items-center gap-2 justify-center md:justify-start">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-bold">Xác Nhận Khóa Đáp Án Và Trộn Đề Hóa Học</h3>
          </div>
          <p className="text-xs sm:text-sm text-blue-200 max-w-2xl">
            Sau khi kiểm tra đáp án gạch chân, nhấn <strong>TRỘN ĐỀ NGẪU NHIÊN</strong> để tự động sinh nhiều mã đề (HHCT001, HHCT002...), xáo trộn câu hỏi độc lập từng phần và tạo link thi Zalo.
          </p>
        </div>

        {/* Big Shuffle Button */}
        <button
          onClick={onOpenShuffleModal}
          disabled={hasCriticalErrors}
          className="w-full md:w-auto px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white text-base sm:text-lg font-black tracking-wide rounded-2xl shadow-xl hover:shadow-2xl transition transform hover:-translate-y-0.5 flex items-center justify-center gap-3 shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Shuffle className="w-6 h-6 animate-spin-slow" />
          TRỘN ĐỀ NGẪU NHIÊN
        </button>
      </div>

      {/* 3. Section Filter and Status Selector */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-xs p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        {/* Section Tabs */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setSelectedSection('all')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedSection === 'all'
                ? 'bg-blue-900 text-white shadow-xs'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            Tất cả ({exam.totalQuestions})
          </button>
          <button
            onClick={() => setSelectedSection(1)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedSection === 1
                ? 'bg-blue-700 text-white shadow-xs'
                : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
            }`}
          >
            Phần I: Nhiều lựa chọn ({exam.part1Count})
          </button>
          <button
            onClick={() => setSelectedSection(2)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedSection === 2
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            Phần II: Đúng – Sai ({exam.part2Count})
          </button>
          <button
            onClick={() => setSelectedSection(3)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition ${
              selectedSection === 3
                ? 'bg-amber-700 text-white shadow-xs'
                : 'bg-amber-50 text-amber-800 hover:bg-amber-100'
            }`}
          >
            Phần III: Trả lời ngắn ({exam.part3Count})
          </button>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 text-xs w-full sm:w-auto justify-end">
          <span className="text-gray-500 font-medium">Lọc:</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as any)}
            className="px-3 py-1.5 bg-gray-50 border border-gray-300 rounded-lg text-gray-700 font-medium outline-hidden"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="needs_review">⚠️ Cần kiểm tra ({exam.warningsCount})</option>
            <option value="confirmed">✅ Đã xác nhận</option>
            <option value="error">❌ Có lỗi</option>
          </select>
        </div>
      </div>

      {/* 4. Questions List */}
      <div className="space-y-4">
        {filteredQuestions.map((q, qIndex) => {
          const isExpanded = expandedQId === q.id || q.status !== 'confirmed';
          const isSaving = savingQId === q.id;

          // Check if this question is the first of its section in the list
          const prevQ = qIndex > 0 ? filteredQuestions[qIndex - 1] : null;
          const isFirstOfSection = !prevQ || prevQ.section !== q.section;

          return (
            <React.Fragment key={q.id}>
              {/* Distinct Section Header Banner */}
              {isFirstOfSection && (
                <div
                  className={`p-3.5 sm:p-4 rounded-xl text-white font-bold flex items-center justify-between text-xs sm:text-sm mt-6 first:mt-0 shadow-xs ${
                    q.section === 1
                      ? 'bg-gradient-to-r from-blue-900 via-indigo-900 to-blue-950'
                      : q.section === 2
                      ? 'bg-gradient-to-r from-emerald-900 via-teal-900 to-emerald-950'
                      : 'bg-gradient-to-r from-amber-900 via-orange-900 to-amber-950'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-white/20 flex items-center justify-center text-xs">
                      {q.section === 1 ? 'I' : q.section === 2 ? 'II' : 'III'}
                    </span>
                    <span>
                      {q.section === 1
                        ? `PHẦN I: CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN (Câu 1 - ${exam.part1Count})`
                        : q.section === 2
                        ? `PHẦN II: CÂU TRẮC NGHIỆM ĐÚNG - SAI (Câu ${exam.part1Count + 1} - ${exam.part1Count + exam.part2Count})`
                        : `PHẦN III: CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN (Câu ${exam.part1Count + exam.part2Count + 1} - ${exam.totalQuestions})`}
                    </span>
                  </div>
                  <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-full font-semibold">
                    {q.section === 1
                      ? `${exam.part1Count} câu`
                      : q.section === 2
                      ? `${exam.part2Count} câu`
                      : `${exam.part3Count} câu`}
                  </span>
                </div>
              )}

              <div
                className={`bg-white rounded-2xl border transition shadow-xs ${
                  q.status === 'confirmed'
                    ? 'border-gray-200'
                    : q.status === 'needs_review'
                    ? 'border-amber-300 ring-1 ring-amber-200'
                    : 'border-red-300 ring-1 ring-red-200'
                }`}
              >
                {/* Question Header */}
                <div
                  onClick={() => setExpandedQId(isExpanded ? null : q.id)}
                  className="p-4 sm:p-5 flex items-start justify-between gap-4 cursor-pointer hover:bg-gray-50/50 transition rounded-t-2xl"
                >
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="flex flex-col items-center gap-1">
                      <span className="inline-flex items-center justify-center min-w-8 h-8 px-1.5 rounded-xl bg-blue-900 text-white font-bold text-xs">
                        C{q.displayNumber || q.originalNumber}
                      </span>
                      <span className="text-[10px] font-semibold text-gray-500">
                        P.{q.section}
                      </span>
                    </div>

                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-gray-900">
                        {q.section === 1
                          ? 'Trắc nghiệm nhiều lựa chọn'
                          : q.section === 2
                          ? 'Trắc nghiệm Đúng – Sai'
                          : 'Trắc nghiệm Trả lời ngắn'}
                      </span>

                      {/* Status Badge */}
                      {q.status === 'confirmed' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-md">
                          <CheckCircle2 className="w-3 h-3" />
                          Đã xác nhận đáp án
                        </span>
                      ) : q.status === 'needs_review' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-md animate-pulse">
                          <AlertTriangle className="w-3 h-3" />
                          Đã nhận diện, cần xác nhận
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-red-50 text-red-700 border border-red-200 px-2 py-0.5 rounded-md">
                          <HelpCircle className="w-3 h-3" />
                          Có lỗi cấu trúc
                        </span>
                      )}

                      {q.images.length > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md border border-purple-200">
                          <ImageIcon className="w-3 h-3" />
                          {q.images.length} hình ảnh
                        </span>
                      )}
                    </div>

                    {/* Question Prompt Preview */}
                    <div
                      className="text-sm text-gray-800 line-clamp-2 chemistry-content"
                      dangerouslySetInnerHTML={{ __html: q.promptHtml }}
                    />

                    {q.statusMessage && (
                      <div className="text-xs text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md inline-block">
                        ⚠️ {q.statusMessage}
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button className="text-gray-400 hover:text-gray-600 p-1">
                    {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              {/* Question Detailed Inspector */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-5 bg-gray-50/50 space-y-4">
                  {/* Full Prompt with Images */}
                  <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-3">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Nội dung dẫn câu hỏi (Giữ nguyên công thức sub/sup, MathType, hình ảnh):
                    </div>
                    <div
                      className="text-sm sm:text-base text-gray-900 leading-relaxed font-sans"
                      dangerouslySetInnerHTML={{ __html: q.promptHtml }}
                    />

                    {q.images.length > 0 && (
                      <div className="flex flex-wrap gap-3 pt-2">
                        {q.images.map((img) => (
                          <div key={img.id} className="border border-gray-200 rounded-lg p-2 bg-gray-50">
                            <img
                              src={img.dataUrl}
                              alt="Hình đính kèm"
                              className="max-h-40 object-contain rounded"
                            />
                            <div className="text-[10px] text-gray-500 mt-1 text-center font-mono">
                              {img.fileName}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* PART 1 OPTIONS INSPECTOR */}
                  {q.section === 1 && q.options && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                          4 Phương án (Nhấn vào phương án để đổi đáp án đúng nếu cần):
                        </span>
                        <span className="text-xs text-emerald-700 font-medium">
                          Gạch chân trong Word = Đáp án đúng
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {q.options.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            disabled={isSaving}
                            onClick={() => handleSelectPart1Answer(q, opt.id)}
                            className={`p-3 rounded-xl border text-left flex items-start gap-3 transition ${
                              opt.isCorrect
                                ? 'bg-emerald-50 border-emerald-500 ring-2 ring-emerald-400/50 text-emerald-950 font-semibold'
                                : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50'
                            }`}
                          >
                            <span
                              className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                                opt.isCorrect
                                  ? 'bg-emerald-600 text-white shadow-xs'
                                  : 'bg-gray-100 text-gray-700'
                              }`}
                            >
                              {opt.label}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div
                                className="text-sm"
                                dangerouslySetInnerHTML={{ __html: opt.html }}
                              />
                              {opt.detectedUnderline && (
                                <span className="text-[10px] text-emerald-700 font-medium flex items-center gap-1 mt-0.5">
                                  ✓ Phát hiện ký tự gạch chân trong DOCX
                                </span>
                              )}
                            </div>
                            {opt.isCorrect && (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* PART 2 STATEMENTS INSPECTOR */}
                  {q.section === 2 && q.statements && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Các nhận định Đúng / Sai (Gạch chân = Đúng, Không gạch chân = Sai):
                        </span>
                      </div>

                      <div className="space-y-2">
                        {q.statements.map((stmt) => (
                          <div
                            key={stmt.id}
                            className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                              stmt.isCorrect
                                ? 'bg-emerald-50/70 border-emerald-200'
                                : 'bg-red-50/70 border-red-200'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 flex-1 min-w-0">
                              <span className="font-bold text-sm text-gray-900 shrink-0">
                                {stmt.label})
                              </span>
                              <div
                                className="text-sm text-gray-800"
                                dangerouslySetInnerHTML={{ __html: stmt.html }}
                              />
                            </div>

                            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleTogglePart2Statement(q, stmt.id, true)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                  stmt.isCorrect
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                ĐÚNG
                              </button>
                              <button
                                type="button"
                                disabled={isSaving}
                                onClick={() => handleTogglePart2Statement(q, stmt.id, false)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                                  !stmt.isCorrect
                                    ? 'bg-red-600 text-white shadow-xs'
                                    : 'bg-white border border-gray-300 text-gray-600 hover:bg-gray-50'
                                }`}
                              >
                                SAI
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* PART 3 SHORT ANSWER INSPECTOR */}
                  {q.section === 3 && (
                    <div className="bg-white p-4 rounded-xl border border-gray-200 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                          Đáp án chuẩn Phần III (Đã tách khỏi câu hỏi hiển thị cho học sinh):
                        </span>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          defaultValue={q.shortAnswerKey || ''}
                          placeholder="Ví dụ: 25 hoặc 0,25 mol hoặc 12,5%"
                          onBlur={(e) => handleUpdatePart3Answer(q, e.target.value)}
                          className="flex-1 px-3.5 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden"
                        />
                        <button
                          type="button"
                          className="px-3 py-2 bg-blue-900 text-white rounded-lg text-xs font-semibold hover:bg-blue-800 transition"
                        >
                          Lưu Đáp Án
                        </button>
                      </div>
                      <p className="text-[11px] text-gray-500">
                        Hệ thống tự động hỗ trợ cả dấu phẩy (0,25) và dấu chấm (0.25), bỏ qua khoảng trắng thừa khi chấm bài cho học sinh.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};
