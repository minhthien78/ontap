import React from 'react';
import {
  CheckCircle2,
  XCircle,
  HelpCircle,
  Award,
  Calendar,
  User,
  GraduationCap,
  ArrowLeft,
  Share2,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';

interface StudentResultViewProps {
  result: {
    studentName: string;
    studentClass: string;
    testCode: string;
    attemptNumber?: number;
    maxAttempts?: number;
    canRetake?: boolean;
    score: {
      totalScore: number;
      part1Score: number;
      part2Score: number;
      part3Score: number;
      correctQuestionsCount: number;
      wrongQuestionsCount: number;
      unansweredQuestionsCount: number;
    };
    allowShowResultImmediately: boolean;
    details?: any[];
  };
  examTitle: string;
  onExit?: () => void;
  onRetake?: () => void;
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

export const StudentResultView: React.FC<StudentResultViewProps> = ({
  result,
  examTitle,
  onExit,
  onRetake,
}) => {
  const { score, allowShowResultImmediately, details } = result;

  const currentAttempt = result.attemptNumber || 1;
  const maxAttempts = 0;
  const isRetakeAllowed = Boolean(onRetake);
  const remainingAttempts = null;

  const renderDetailCard = (det: any) => {
    return (
      <div
        key={det.questionId}
        className={`p-4 rounded-xl border transition ${
          det.isCorrect
            ? 'border-emerald-200 bg-emerald-50/30'
            : 'border-red-200 bg-red-50/30'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 flex-1 min-w-0">
            <span
              className={`px-2 py-1 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 text-white ${
                det.isCorrect ? 'bg-emerald-600' : 'bg-red-600'
              }`}
            >
              Câu {det.displayNumber}
            </span>

            <div className="flex-1 space-y-2">
              <div
                className="text-sm text-gray-900 leading-relaxed font-sans chemistry-content"
                dangerouslySetInnerHTML={{ __html: stripLeadingQuestionPrefix(det.promptHtml) }}
              />

              {/* PART 1 DETAIL */}
              {det.section === 1 && (
                <div className="text-xs space-y-1 pt-1">
                  <div>
                    Em đã chọn:{' '}
                    <strong>
                      {det.selectedOptionLabel
                        ? `Phương án ${det.selectedOptionLabel}`
                        : '(Chưa chọn)'}
                    </strong>
                  </div>
                  <div className="text-emerald-700 font-semibold">
                    Đáp án đúng: Phương án {det.correctOptionLabel}
                  </div>
                </div>
              )}

              {/* PART 2 DETAIL */}
              {det.section === 2 && det.statementResults && (
                <div className="text-xs space-y-1.5 pt-1">
                  {det.statementResults.map((s: any) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between gap-2 p-1.5 rounded bg-white border border-gray-100"
                    >
                      <span>
                        <strong>{s.label})</strong> {s.textHtml}
                      </span>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-gray-600">
                          Em chọn:{' '}
                          <strong>
                            {s.studentChoice === true
                              ? 'ĐÚNG'
                              : s.studentChoice === false
                              ? 'SAI'
                              : '-'}
                          </strong>
                        </span>
                        <span>•</span>
                        <span
                          className={`font-bold ${
                            s.correctChoice ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          Đáp án: {s.correctChoice ? 'ĐÚNG' : 'SAI'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* PART 3 DETAIL */}
              {det.section === 3 && (
                <div className="text-xs space-y-1 pt-1">
                  <div>
                    Em đã nhập:{' '}
                    <strong>{det.studentAnswerText || '(Chưa nhập)'}</strong>
                  </div>
                  <div className="text-emerald-700 font-semibold">
                    Đáp án chuẩn: {det.standardAnswers?.join(' hoặc ')}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 text-right">
            <span
              className={`text-xs font-bold px-2 py-0.5 rounded-md ${
                det.isCorrect
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-red-100 text-red-800'
              }`}
            >
              +{det.pointsEarned.toFixed(2)} đ
            </span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 sm:px-6">
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Success Banner */}
        <div className="bg-gradient-to-r from-emerald-700 via-teal-800 to-blue-900 text-white rounded-3xl p-6 sm:p-8 shadow-xl text-center space-y-3 relative overflow-hidden">
          <div className="w-16 h-16 bg-white/10 rounded-2xl border border-white/20 flex items-center justify-center mx-auto backdrop-blur-xs">
            <Award className="w-10 h-10 text-emerald-300" />
          </div>

          <div>
            <h1 className="text-xl sm:text-3xl font-black tracking-tight">
              BẠN ĐÃ HOÀN THÀNH BÀI KIỂM TRA
            </h1>
            <p className="text-xs sm:text-sm text-emerald-200 mt-1">{examTitle}</p>
          </div>

          <div className="inline-flex flex-wrap items-center justify-center gap-3 bg-white/10 backdrop-blur-xs px-4 py-2 rounded-2xl border border-white/20 text-xs sm:text-sm">
            <span>
              Học sinh: <strong>{result.studentName}</strong>
            </span>
            <span>•</span>
            <span>
              Lớp: <strong>{result.studentClass}</strong>
            </span>
            <span>•</span>
            <span className="font-mono text-emerald-300 font-bold">
              Mã đề: {result.testCode}
            </span>
            <span>•</span>
            <span className="bg-emerald-500/20 text-emerald-200 border border-emerald-400/30 px-2.5 py-0.5 rounded-full font-bold">
              Lần làm: Lần {currentAttempt} (Không giới hạn số lần)
            </span>
          </div>
        </div>

        {/* Score Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-xs text-center">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Tổng Điểm (10)
            </span>
            <div className="text-3xl sm:text-4xl font-black text-emerald-600 mt-1">
              {score.totalScore.toFixed(2)}
            </div>
            <span className="text-[11px] text-gray-400">Đã làm tròn</span>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-xs text-center">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Số Câu Đúng
            </span>
            <div className="text-3xl sm:text-4xl font-black text-blue-900 mt-1">
              {score.correctQuestionsCount}
            </div>
            <span className="text-[11px] text-emerald-600 font-semibold">Đạt yêu cầu</span>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-xs text-center">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Số Câu Sai
            </span>
            <div className="text-3xl sm:text-4xl font-black text-red-600 mt-1">
              {score.wrongQuestionsCount}
            </div>
            <span className="text-[11px] text-red-500">Cần ôn lại</span>
          </div>

          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-gray-200 shadow-xs text-center">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Chưa Làm
            </span>
            <div className="text-3xl sm:text-4xl font-black text-gray-400 mt-1">
              {score.unansweredQuestionsCount}
            </div>
            <span className="text-[11px] text-gray-400">Bỏ trống</span>
          </div>
        </div>

        {/* PROMINENT TOP RETAKE BANNER (Immediately visible to student) */}
        {isRetakeAllowed && onRetake && (
          <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-50 via-teal-50 to-blue-50 border-2 border-emerald-300 rounded-3xl shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <div className="inline-flex items-center gap-2 font-bold text-emerald-950 text-sm sm:text-base">
                <RotateCcw className="w-5 h-5 text-emerald-600" />
                <span>
                  Không giới hạn số lần làm bài và nộp bài
                </span>
              </div>
              <p className="text-xs text-emerald-800">
                ✨ Em có thể làm lại bài thi bất cứ lúc nào. Hệ thống tự động chấm điểm và lưu lại kết quả, điểm số của <strong>tất cả các lần nộp bài</strong>!
              </p>
            </div>

            <button
              type="button"
              onClick={onRetake}
              className="w-full sm:w-auto px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-xs sm:text-sm font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer shrink-0 active:scale-98 ring-4 ring-emerald-500/20"
            >
              <RotateCcw className="w-4 h-4" />
              <span>
                LÀM LẠI BÀI THI (Lần {currentAttempt + 1})
              </span>
            </button>
          </div>
        )}

        {/* Breakdown by Sections */}
        <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-xs space-y-3">
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            Điểm Thành Phần Từng Phần Thi
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
            <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-xl space-y-0.5">
              <div className="font-semibold text-blue-900">Phần I: Nhiều lựa chọn</div>
              <div className="text-lg font-bold text-blue-950">{score.part1Score.toFixed(2)} đ</div>
            </div>

            <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-xl space-y-0.5">
              <div className="font-semibold text-emerald-900">Phần II: Đúng – Sai</div>
              <div className="text-lg font-bold text-emerald-950">{score.part2Score.toFixed(2)} đ</div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-0.5">
              <div className="font-semibold text-amber-900">Phần III: Trả lời ngắn</div>
              <div className="text-lg font-bold text-amber-950">{score.part3Score.toFixed(2)} đ</div>
            </div>
          </div>
        </div>

        {/* Detailed Question Review */}
        {allowShowResultImmediately && details && (
          <div className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-xs space-y-6">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wider">
                Chi Tiết Bài Làm Từng Câu Hỏi
              </h3>
              <span className="text-xs text-gray-500">Đối chiếu đáp án chuẩn theo từng phần</span>
            </div>

            {/* PART 1 DETAILS */}
            {details.some((d: any) => d.section === 1) && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 border border-blue-200 text-blue-950">
                  <span className="font-black text-xs uppercase tracking-wider">Phần I</span>
                  <span className="font-bold text-xs">Câu trắc nghiệm nhiều phương án lựa chọn</span>
                </div>
                <div className="space-y-3">
                  {details
                    .filter((d: any) => d.section === 1)
                    .map((det: any) => renderDetailCard(det))}
                </div>
              </div>
            )}

            {/* PART 2 DETAILS */}
            {details.some((d: any) => d.section === 2) && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950">
                  <span className="font-black text-xs uppercase tracking-wider">Phần II</span>
                  <span className="font-bold text-xs">Câu trắc nghiệm Đúng – Sai</span>
                </div>
                <div className="space-y-3">
                  {details
                    .filter((d: any) => d.section === 2)
                    .map((det: any) => renderDetailCard(det))}
                </div>
              </div>
            )}

            {/* PART 3 DETAILS */}
            {details.some((d: any) => d.section === 3) && (
              <div className="space-y-3 pt-2">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-purple-50 border border-purple-200 text-purple-950">
                  <span className="font-black text-xs uppercase tracking-wider">Phần III</span>
                  <span className="font-bold text-xs">Câu trắc nghiệm trả lời ngắn</span>
                </div>
                <div className="space-y-3">
                  {details
                    .filter((d: any) => d.section === 3)
                    .map((det: any) => renderDetailCard(det))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Actions: Retake (No Exit / Home button as requested) */}
        <div className="space-y-4 pt-3">
          {isRetakeAllowed && onRetake && (
            <div className="flex flex-col items-center justify-center gap-2">
              <button
                type="button"
                onClick={onRetake}
                className="w-full sm:w-auto px-8 py-3.5 bg-gradient-to-r from-emerald-600 via-teal-600 to-emerald-700 hover:from-emerald-500 hover:to-teal-500 text-white rounded-2xl text-sm font-bold shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2.5 cursor-pointer ring-4 ring-emerald-500/20 active:scale-98"
              >
                <RotateCcw className="w-5 h-5" />
                <span>
                  LÀM LẠI BÀI THI (Lần {currentAttempt + 1} - Không giới hạn)
                </span>
              </button>
              <p className="text-[11px] text-gray-500 text-center">
                ✨ Học sinh có thể làm lại nhiều lần, mỗi lần đều ghi lại kết quả và điểm số đầy đủ.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
