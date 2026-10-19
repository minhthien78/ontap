import React, { useState, useEffect } from 'react';
import {
  Clock,
  User,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Send,
  HelpCircle,
  ImageIcon,
  ArrowLeft,
  Flame,
  Check,
  Loader2,
  ShieldAlert,
  RotateCcw,
} from 'lucide-react';
import { api } from '../api';
import { StudentResultView } from './StudentResultView';

interface StudentExamViewProps {
  accessCode: string;
  onExit?: () => void;
}

export const StudentExamView: React.FC<StudentExamViewProps> = ({
  accessCode,
  onExit,
}) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [examData, setExamData] = useState<any | null>(null);

  // Student details
  const [studentName, setStudentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [attemptNumber, setAttemptNumber] = useState<number>(1);
  const [hasStarted, setHasStarted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Answers state
  // Part 1: questionId -> optionId
  const [part1Answers, setPart1Answers] = useState<Record<string, string>>({});
  // Part 2: questionId -> statementId -> boolean (true=đúng, false=sai)
  const [part2Answers, setPart2Answers] = useState<Record<string, Record<string, boolean>>>({});
  // Part 3: questionId -> studentAnswerText
  const [part3Answers, setPart3Answers] = useState<Record<string, string>>({});

  // Timer
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [startedAt, setStartedAt] = useState<string>(new Date().toISOString());

  // Confirm submit modal
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Real-time autosave indicators
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);

  // Submission result
  const [submissionResult, setSubmissionResult] = useState<any | null>(null);

  // Exit confirm modal ("Thoát là nộp bài" in test mode)
  const [showExitConfirmModal, setShowExitConfirmModal] = useState(false);
  const [tabSwitchWarning, setTabSwitchWarning] = useState<string | null>(null);

  // Auto-restore saved completed result or progress from localStorage
  useEffect(() => {
    try {
      const codeKey = accessCode.trim().toUpperCase();

      // Check if student already submitted this exam
      const resultCached = localStorage.getItem(`hhct_result_${codeKey}`);
      if (resultCached) {
        const parsed = JSON.parse(resultCached);
        if (parsed && parsed.success && parsed.score) {
          if (parsed.studentName) setStudentName(parsed.studentName);
          if (parsed.studentClass) setStudentClass(parsed.studentClass);
          if (parsed.attemptNumber) setAttemptNumber(parsed.attemptNumber);
          setSubmissionResult(parsed);
          return;
        }
      }

      // Check if student has in-progress answers saved
      const storageKey = `hhct_progress_${codeKey}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.studentName) setStudentName(parsed.studentName);
        if (parsed.studentClass) setStudentClass(parsed.studentClass);
        if (parsed.part1Answers) setPart1Answers(parsed.part1Answers);
        if (parsed.part2Answers) setPart2Answers(parsed.part2Answers);
        if (parsed.part3Answers) setPart3Answers(parsed.part3Answers);
        if (parsed.hasStarted) setHasStarted(true);
        if (parsed.startedAt) setStartedAt(parsed.startedAt);
      }
    } catch (e) {}
  }, [accessCode]);

  // Auto-save progress whenever answers or student details change (both LocalStorage and Server)
  useEffect(() => {
    if (!hasStarted) return;
    try {
      const storageKey = `hhct_progress_${accessCode.trim().toUpperCase()}`;
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          studentName,
          studentClass,
          part1Answers,
          part2Answers,
          part3Answers,
          hasStarted,
          startedAt,
        })
      );
    } catch (e) {}

    // Debounced real-time sync to server ("trong suốt quá trình làm của học sinh")
    setSaveStatus('saving');
    const timer = setTimeout(() => {
      if (examData?.versionId && studentName.trim() && studentClass.trim()) {
        api
          .saveStudentProgress(accessCode.trim().toUpperCase(), {
            versionId: examData.versionId,
            studentName: studentName.trim(),
            studentClass: studentClass.trim(),
            startedAt,
            answers: {
              part1: part1Answers,
              part2: part2Answers,
              part3: part3Answers,
            },
          })
          .then(() => {
            setSaveStatus('saved');
            const now = new Date();
            setLastSavedTime(
              now.toLocaleTimeString('vi-VN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })
            );
          })
          .catch((err) => {
            console.warn('Auto-save progress to server warning:', err);
            setSaveStatus('idle');
          });
      }
    }, 800);

    return () => clearTimeout(timer);
  }, [
    accessCode,
    studentName,
    studentClass,
    part1Answers,
    part2Answers,
    part3Answers,
    hasStarted,
    startedAt,
    examData?.versionId,
  ]);

  // Fetch safe exam data
  useEffect(() => {
    const fetchExam = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await api.getStudentExam(accessCode.trim().toUpperCase());
        setExamData(data);
        if (data.durationMinutes && data.durationMinutes > 0) {
          setTimeLeft(data.durationMinutes * 60);
        }

        // Dynamically update submissionResult if already cached so student can retake if maxAttempts allows
        setSubmissionResult((prev: any) => {
          if (!prev) return null;
          const maxAtt = data.maxAttempts !== undefined ? data.maxAttempts : 3;
          const currentAtt = prev.attemptNumber || 1;
          const canRetake = maxAtt === 0 || currentAtt < maxAtt;
          const updated = {
            ...prev,
            maxAttempts: maxAtt,
            canRetake,
          };
          try {
            const codeKey = accessCode.trim().toUpperCase();
            localStorage.setItem(`hhct_result_${codeKey}`, JSON.stringify(updated));
          } catch (_) {}
          return updated;
        });
      } catch (err: any) {
        setError(err.message || 'Không thể tải đề thi');
      } finally {
        setLoading(false);
      }
    };

    fetchExam();
  }, [accessCode]);

  // Countdown timer
  useEffect(() => {
    if (!hasStarted || timeLeft === null || timeLeft <= 0) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null || prev <= 1) {
          clearInterval(timer);
          // Auto submit when time runs out
          handleSubmitExam();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [hasStarted, timeLeft]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Auto-submit on unload or closing tab in Test mode ("thoát là nộp bài")
  useEffect(() => {
    if (!hasStarted || submissionResult) return;
    const isTest = examData?.examMode === 'test' || examData?.maxAttempts === 1;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isTest) {
        try {
          const payload = JSON.stringify({
            versionId: examData.versionId,
            studentName: studentName.trim(),
            studentClass: studentClass.trim(),
            startedAt,
            answers: {
              part1: part1Answers,
              part2: part2Answers,
              part3: part3Answers,
            },
          });
          const url = `/api/student/exam/${encodeURIComponent(accessCode)}/submit`;
          if (navigator.sendBeacon) {
            const blob = new Blob([payload], { type: 'application/json' });
            navigator.sendBeacon(url, blob);
          } else {
            fetch(url, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: payload,
              keepalive: true,
            });
          }
        } catch (_) {}
        e.preventDefault();
        e.returnValue =
          'Đề thi ở chế độ Kiểm tra (Thoát là nộp bài). Nếu rời khỏi trang, bài làm sẽ tự động nộp!';
        return e.returnValue;
      }
    };

    const handleVisibilityChange = () => {
      if (!isTest) return;
      if (document.visibilityState === 'hidden') {
        // Auto-save immediately to prevent data loss
        api
          .saveStudentProgress(accessCode.trim().toUpperCase(), {
            versionId: examData.versionId,
            studentName: studentName.trim(),
            studentClass: studentClass.trim(),
            startedAt,
            answers: {
              part1: part1Answers,
              part2: part2Answers,
              part3: part3Answers,
            },
          })
          .catch(() => {});
      } else if (document.visibilityState === 'visible') {
        setTabSwitchWarning(
          '⚠️ Chú ý: Bạn vừa chuyển tab/rời màn hình thi! Trong chế độ Kiểm tra, thoát là nộp bài. Vui lòng tập trung hoàn thành bài thi.'
        );
        setTimeout(() => setTabSwitchWarning(null), 6000);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [
    hasStarted,
    submissionResult,
    examData,
    accessCode,
    studentName,
    studentClass,
    startedAt,
    part1Answers,
    part2Answers,
    part3Answers,
  ]);

  const handleExitClick = () => {
    if (!hasStarted || submissionResult) {
      onExit?.();
      return;
    }
    setShowExitConfirmModal(true);
  };

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim() || !studentClass.trim()) {
      setFormError('Vui lòng điền đầy đủ Họ và tên cùng Lớp học');
      return;
    }
    setFormError(null);

    // Check if student already has saved progress on server to resume
    try {
      const res = await api.getStudentProgress(
        accessCode.trim().toUpperCase(),
        studentName.trim(),
        studentClass.trim()
      );
      if (res) {
        const maxAtt =
          examData?.maxAttempts !== undefined
            ? examData.maxAttempts
            : res.maxAttempts !== undefined
            ? res.maxAttempts
            : 3;
        const subCount = res.submittedCount ?? 0;
        const canRetake = maxAtt === 0 || subCount < maxAtt;

        if (res.progress && (res.progress.status === 'submitted' || res.progress.submittedAt)) {
          const latestAttempt = res.progress.attemptNumber || subCount || 1;

          // Always allow student to retake and improve their score, saving all attempts
          setAttemptNumber(latestAttempt);
          setSubmissionResult({
            success: true,
            submissionId: res.progress.id,
            testCode: res.progress.testCode,
            studentName: res.progress.studentName,
            studentClass: res.progress.studentClass,
            attemptNumber: latestAttempt,
            maxAttempts: 0,
            canRetake: true,
            score: res.progress.score,
            allowShowResultImmediately: true,
            details: res.progress.score?.details,
          });
          return;
        } else if (res.progress && res.progress.status === 'in_progress') {
          // Restore in-progress answers
          if (res.progress.answers) {
            if (res.progress.answers.part1) setPart1Answers(res.progress.answers.part1);
            if (res.progress.answers.part2) setPart2Answers(res.progress.answers.part2);
            if (res.progress.answers.part3) setPart3Answers(res.progress.answers.part3);
          }
        }
      }
    } catch (e) {
      console.warn('Could not check server progress:', e);
    }

    setHasStarted(true);

    // Immediately register in_progress on the server so the teacher sees the student in real-time!
    if (examData?.versionId) {
      api
        .saveStudentProgress(accessCode.trim().toUpperCase(), {
          versionId: examData.versionId,
          studentName: studentName.trim(),
          studentClass: studentClass.trim(),
          startedAt,
          answers: {
            part1: part1Answers,
            part2: part2Answers,
            part3: part3Answers,
          },
        })
        .then(() => {
          setSaveStatus('saved');
          const now = new Date();
          setLastSavedTime(
            now.toLocaleTimeString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })
          );
        })
        .catch((e) => console.warn('Could not send initial progress:', e));
    }
  };

  // Answer handlers
  const handleSelectPart1 = (qId: string, optId: string) => {
    setPart1Answers((prev) => ({ ...prev, [qId]: optId }));
  };

  const handleSelectPart2 = (qId: string, stmtId: string, value: boolean) => {
    setPart2Answers((prev) => ({
      ...prev,
      [qId]: {
        ...(prev[qId] || {}),
        [stmtId]: value,
      },
    }));
  };

  const handleInputPart3 = (qId: string, text: string) => {
    setPart3Answers((prev) => ({ ...prev, [qId]: text }));
  };

  // Check unanswered count
  const calculateAnsweredCount = () => {
    if (!examData) return { answered: 0, total: 0 };
    let answered = 0;
    const total = examData.questions.length;

    for (const q of examData.questions) {
      if (q.section === 1) {
        if (part1Answers[q.id]) answered++;
      } else if (q.section === 2) {
        const stmtAnswers = part2Answers[q.id] || {};
        const stmtsCount = q.statements?.length || 4;
        if (Object.keys(stmtAnswers).length === stmtsCount) {
          answered++;
        }
      } else if (q.section === 3) {
        if (part3Answers[q.id] && part3Answers[q.id].trim().length > 0) {
          answered++;
        }
      }
    }

    return { answered, total };
  };

  const handleSubmitExam = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    setShowConfirmModal(false);

    try {
      const res = await api.submitStudentExam(accessCode, {
        versionId: examData.versionId,
        studentName: studentName.trim(),
        studentClass: studentClass.trim(),
        startedAt,
        answers: {
          part1: part1Answers,
          part2: part2Answers,
          part3: part3Answers,
        },
      });

      const effectiveMaxAttempts = 0;
      const currentAtt = res.attemptNumber || 1;
      const canRetake = true;

      const finalResult = {
        ...res,
        maxAttempts: 0,
        attemptNumber: currentAtt,
        canRetake: true,
      };

      // Clear saved progress and store submitted result in localStorage
      try {
        const codeKey = accessCode.trim().toUpperCase();
        localStorage.setItem(`hhct_result_${codeKey}`, JSON.stringify(finalResult));
        localStorage.removeItem(`hhct_progress_${codeKey}`);
      } catch (e) {}

      setSubmissionResult(finalResult);
      setAttemptNumber(currentAtt);
    } catch (err: any) {
      setSubmitError(err.message || 'Lỗi nộp bài');
    } finally {
      // CRITICAL: Always reset submitting flag so subsequent attempts can be submitted and graded!
      setSubmitting(false);
    }
  };

  const handleRetake = async () => {
    const codeKey = accessCode.trim().toUpperCase();
    try {
      localStorage.removeItem(`hhct_result_${codeKey}`);
      localStorage.removeItem(`hhct_progress_${codeKey}`);
    } catch (_) {}

    // Reset submitting and error states
    setSubmitting(false);
    setSubmitError(null);
    setShowConfirmModal(false);

    // Clear old student answers
    setSubmissionResult(null);
    setPart1Answers({});
    setPart2Answers({});
    setPart3Answers({});

    // Fetch fresh random version if possible
    let currentVersionId = examData?.versionId;
    try {
      const freshData = await api.getStudentExam(codeKey);
      if (freshData) {
        setExamData(freshData);
        currentVersionId = freshData.versionId;
        if (freshData.durationMinutes && freshData.durationMinutes > 0) {
          setTimeLeft(freshData.durationMinutes * 60);
        }
      }
    } catch (e) {
      if (examData?.durationMinutes && examData.durationMinutes > 0) {
        setTimeLeft(examData.durationMinutes * 60);
      }
    }

    const nextAttempt = (submissionResult?.attemptNumber || attemptNumber || 1) + 1;
    setAttemptNumber(nextAttempt);

    const newStartedAt = new Date().toISOString();
    setStartedAt(newStartedAt);
    setHasStarted(true);

    // Immediately register fresh in_progress on the server for the retake attempt
    if (currentVersionId && studentName && studentClass) {
      api
        .saveStudentProgress(codeKey, {
          versionId: currentVersionId,
          studentName: studentName.trim(),
          studentClass: studentClass.trim(),
          startedAt: newStartedAt,
          answers: { part1: {}, part2: {}, part3: {} },
        })
        .catch((e) => console.warn('Could not register retake progress:', e));
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <div className="w-12 h-12 border-4 border-blue-900 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm font-semibold text-gray-700">Đang chuẩn bị đề thi Hóa học...</p>
        </div>
      </div>
    );
  }

  if (error || !examData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-md w-full text-center space-y-4 shadow-lg">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
            <AlertCircle className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-bold text-gray-900">Không thể làm bài thi</h3>
            <p className="text-sm text-gray-600">{error || 'Đề thi không tồn tại hoặc đã đóng'}</p>
          </div>
          {onExit && (
            <button
              onClick={onExit}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-xl text-xs font-semibold transition"
            >
              Quay lại trang chủ
            </button>
          )}
        </div>
      </div>
    );
  }

  // If already submitted and showing result
  if (submissionResult) {
    return (
      <StudentResultView
        result={submissionResult}
        examTitle={examData.title}
        onRetake={handleRetake}
      />
    );
  }

  // 1. Initial Gate: Student Information Form
  if (!hasStarted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-950 via-indigo-950 to-slate-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
          <div className="bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 text-white p-6 sm:p-8 text-center space-y-2">
            <div className="inline-flex p-3 bg-white/10 rounded-2xl backdrop-blur-xs border border-white/20">
              <GraduationCap className="w-8 h-8 text-emerald-400" />
            </div>
            <h2 className="text-xl sm:text-2xl font-black">{examData.title}</h2>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-blue-200">
              <span className="bg-white/15 px-2.5 py-1 rounded-full font-mono font-bold text-emerald-300">
                Mã đề: {examData.testCode}
              </span>
              <span>•</span>
              <span>{examData.questions.length} câu hỏi</span>
              <span>•</span>
              <span>
                {examData.durationMinutes > 0
                  ? `${examData.durationMinutes} phút`
                  : 'Không giới hạn thời gian'}
              </span>
              <span>•</span>
              <span
                className={`px-2.5 py-1 rounded-full font-bold border ${
                  examData.examMode === 'test' || examData.maxAttempts === 1
                    ? 'bg-rose-500/25 text-rose-200 border-rose-400/40'
                    : 'bg-emerald-500/25 text-emerald-300 border-emerald-400/40'
                }`}
              >
                {examData.examMode === 'test' || examData.maxAttempts === 1
                  ? '🔒 Kiểm tra (1 lần, thoát là nộp)'
                  : '✨ Luyện tập (Không giới hạn)'}
              </span>
            </div>
          </div>

          <form onSubmit={handleStartExam} className="p-6 sm:p-8 space-y-5">
            <div className="text-center text-xs text-gray-500">
              Vui lòng điền đúng Họ tên và Lớp để hệ thống lưu kết quả và chấm điểm tự động.
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Họ và tên thí sinh <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <User className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="Ví dụ: Nguyễn Văn A"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden transition text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                  Lớp học <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <GraduationCap className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={studentClass}
                    onChange={(e) => setStudentClass(e.target.value)}
                    placeholder="Ví dụ: 11T1 hoặc 12T6"
                    className="w-full pl-10 pr-4 py-3 bg-gray-50 border border-gray-300 rounded-xl text-gray-900 font-semibold focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden transition text-sm"
                  />
                </div>
              </div>
            </div>

            <div className="p-4 bg-emerald-50 rounded-2xl border border-emerald-200 text-xs text-emerald-900 space-y-1.5">
              <div className="font-bold flex items-center gap-1.5 text-emerald-950">
                <Flame className="w-4 h-4 text-emerald-600" />
                Quy chế làm bài kiểm tra Hóa học:
              </div>
              <ul className="list-disc list-inside space-y-1 text-emerald-800 text-[11px]">
                <li className="font-semibold text-emerald-900">
                  {examData.examMode === 'test' || examData.maxAttempts === 1
                    ? '🔒 Hình thức KIỂM TRA: Học sinh chỉ được làm bài 1 lần duy nhất. Nếu thoát ra, rời khỏi trang hoặc đóng trình duyệt, hệ thống sẽ tự động nộp bài và tính điểm ngay!'
                    : '✨ Hình thức LUYỆN TẬP: Không giới hạn số lần làm bài và nộp bài. Hệ thống lưu lại kết quả và điểm số của tất cả các lần nộp bài.'}
                </li>
                <li>Đề thi gồm 3 phần: Trắc nghiệm 4 lựa chọn, Đúng - Sai và Trả lời ngắn.</li>
                <li>Hệ thống tự động lưu bài làm liên tục theo thời gian thực ("trong suốt quá trình làm").</li>
                <li>Nhấn NỘP BÀI sau khi hoàn thành để hệ thống chấm điểm và ghi nhận kết quả.</li>
              </ul>
            </div>

            {formError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{formError}</span>
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 bg-gradient-to-r from-blue-900 via-indigo-900 to-emerald-900 hover:opacity-95 text-white rounded-xl text-base font-bold shadow-lg transition"
            >
              BẮT ĐẦU LÀM BÀI
            </button>
          </form>
        </div>
      </div>
    );
  }

  // 2. Active Test View
  const { answered, total } = calculateAnsweredCount();
  const unansweredCount = total - answered;

  const part1Questions = examData.questions.filter((q: any) => q.section === 1);
  const part2Questions = examData.questions.filter((q: any) => q.section === 2);
  const part3Questions = examData.questions.filter((q: any) => q.section === 3);

  const p1Answered = part1Questions.filter((q: any) => part1Answers[q.id]).length;
  const p2Answered = part2Questions.filter((q: any) => {
    const ans = part2Answers[q.id] || {};
    const needed = q.statements?.length || 4;
    return Object.keys(ans).length === needed;
  }).length;
  const p3Answered = part3Questions.filter(
    (q: any) => (part3Answers[q.id] || '').trim().length > 0
  ).length;

  const p1PointsPerQ =
    examData?.scoringConfig?.part1PointsPerQ ?? part1Questions[0]?.points ?? 0.25;
  const p2PointsPerQ =
    examData?.scoringConfig?.part2PointsPerQ ?? part2Questions[0]?.points ?? 1.0;
  const p3PointsPerQ =
    examData?.scoringConfig?.part3PointsPerQ ?? part3Questions[0]?.points ?? 0.25;

  const formatPoints = (pts: number) => {
    return (Math.round(pts * 1000) / 1000).toString().replace('.', ',');
  };

  const renderQuestionCard = (q: any) => {
    const qPoints = q.section === 1 ? p1PointsPerQ : q.section === 2 ? p2PointsPerQ : p3PointsPerQ;

    return (
      <div
        key={q.id}
        id={`q_${q.id}`}
        className="bg-white rounded-2xl border border-gray-200 p-5 sm:p-6 shadow-xs space-y-4"
      >
        {/* Question Header */}
        <div className="flex items-start gap-3">
          <span
            className={`inline-flex items-center justify-center px-3 py-1.5 rounded-xl text-white font-bold text-xs shrink-0 mt-0.5 shadow-xs ${
              q.section === 1
                ? 'bg-blue-900'
                : q.section === 2
                ? 'bg-emerald-800'
                : 'bg-purple-900'
            }`}
          >
            {q.section === 1
              ? `Phần I - Câu ${q.displayNumber}`
              : q.section === 2
              ? `Phần II - Câu ${q.displayNumber}`
              : `Phần III - Câu ${q.displayNumber}`}
          </span>

          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                {q.section === 1
                  ? 'Chọn 1 phương án đúng'
                  : q.section === 2
                  ? 'Chọn Đúng hoặc Sai cho mỗi ý a, b, c, d'
                  : 'Điền đáp án ngắn'}
              </span>
              <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                {q.section === 2 ? `Tối đa ${formatPoints(qPoints)} đ` : `${formatPoints(qPoints)} đ`}
              </span>
            </div>

            {/* Question Prompt */}
            <div
              className="text-sm sm:text-base text-gray-900 leading-relaxed chemistry-content"
              dangerouslySetInnerHTML={{ __html: q.promptHtml }}
            />

            {/* Images */}
            {q.images &&
              q.images.filter((img: any) => !q.promptHtml?.includes(img.dataUrl)).length > 0 && (
                <div className="flex flex-wrap gap-3 pt-2">
                  {q.images
                    .filter((img: any) => !q.promptHtml?.includes(img.dataUrl))
                    .map((img: any) => (
                      <div key={img.id} className="border border-gray-200 rounded-xl p-2 bg-white shadow-xs">
                        <img
                          src={img.dataUrl}
                          alt="Hình minh họa"
                          className="max-h-56 max-w-full object-contain rounded-lg"
                        />
                      </div>
                    ))}
                </div>
              )}
          </div>
        </div>

        {/* PART 1 OPTIONS */}
        {q.section === 1 && q.options && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2">
            {q.options.map((opt: any) => {
              const isSelected = part1Answers[q.id] === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectPart1(q.id, opt.id)}
                  className={`p-3.5 rounded-xl border text-left flex items-start gap-3 transition ${
                    isSelected
                      ? 'bg-blue-50 border-blue-600 ring-2 ring-blue-500/40 text-blue-950 font-semibold'
                      : 'bg-white border-gray-200 text-gray-800 hover:border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <span
                    className={`w-6 h-6 rounded-lg text-xs font-bold flex items-center justify-center shrink-0 ${
                      isSelected
                        ? 'bg-blue-900 text-white shadow-xs'
                        : 'bg-gray-100 text-gray-700'
                    }`}
                  >
                    {opt.label}
                  </span>
                  <div
                    className="flex-1 text-sm"
                    dangerouslySetInnerHTML={{ __html: opt.html }}
                  />
                </button>
              );
            })}
          </div>
        )}

        {/* PART 2 STATEMENTS */}
        {q.section === 2 && q.statements && (
          <div className="space-y-2.5 pt-2">
            {q.statements.map((stmt: any) => {
              const choice = part2Answers[q.id]?.[stmt.id];
              return (
                <div
                  key={stmt.id}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    choice !== undefined
                      ? 'bg-blue-50/50 border-blue-200'
                      : 'bg-gray-50 border-gray-200'
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
                      onClick={() => handleSelectPart2(q.id, stmt.id, true)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                        choice === true
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      ĐÚNG
                    </button>
                    <button
                      type="button"
                      onClick={() => handleSelectPart2(q.id, stmt.id, false)}
                      className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${
                        choice === false
                          ? 'bg-red-600 text-white shadow-sm'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      SAI
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* PART 3 SHORT ANSWER */}
        {q.section === 3 && (
          <div className="pt-2 space-y-2">
            <label className="block text-xs font-semibold text-gray-600">
              Nhập câu trả lời của em (Ví dụ: số, nồng độ, mol hoặc phần trăm):
            </label>
            <input
              type="text"
              value={part3Answers[q.id] || ''}
              onChange={(e) => handleInputPart3(q.id, e.target.value)}
              placeholder="Nhập câu trả lời vào đây..."
              className="w-full sm:w-80 px-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm font-semibold text-gray-900 focus:bg-white focus:ring-2 focus:ring-blue-600 outline-hidden"
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      {/* Sticky Header with Timer and Student Info */}
      <header className="sticky top-0 z-30 bg-white border-b border-gray-200 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            {onExit && (
              <button
                onClick={handleExitClick}
                className="p-1.5 text-gray-500 hover:text-gray-900 rounded-lg hover:bg-gray-100 transition shrink-0 cursor-pointer"
                title="Thoát"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-gray-900 truncate">{examData.title}</h1>
              <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <span className="font-semibold text-blue-900">{studentName}</span>
                <span>•</span>
                <span>Lớp: {studentClass}</span>
                <span>•</span>
                <span className="font-mono font-bold bg-blue-100 text-blue-800 px-1.5 py-0.2 rounded">
                  Mã đề: {examData.testCode}
                </span>
                {examData.examMode === 'test' || examData.maxAttempts === 1 ? (
                  <span className="font-bold bg-rose-50 text-rose-900 border border-rose-200 px-2 py-0.5 rounded-full text-[11px] flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-rose-600" />
                    Kiểm tra (Thoát là nộp)
                  </span>
                ) : (
                  <span className="font-bold bg-emerald-50 text-emerald-900 border border-emerald-200 px-2 py-0.5 rounded-full text-[11px] flex items-center gap-1">
                    <RotateCcw className="w-3 h-3 text-emerald-600" />
                    Luyện tập (Lần {attemptNumber})
                  </span>
                )}
                {saveStatus === 'saving' && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 font-semibold bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                    <Loader2 className="w-3 h-3 animate-spin text-amber-600" />
                    Đang lưu bài...
                  </span>
                )}
                {saveStatus === 'saved' && (
                  <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                    <Check className="w-3 h-3 text-emerald-600" />
                    Đã lưu {lastSavedTime ? `(${lastSavedTime})` : ''}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Countdown Clock */}
          {timeLeft !== null && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-mono font-black shrink-0 ${
                timeLeft < 300
                  ? 'bg-red-50 text-red-600 border border-red-200 animate-pulse'
                  : 'bg-blue-50 text-blue-900 border border-blue-200'
              }`}
            >
              <Clock className="w-4 h-4" />
              <span>{formatTime(timeLeft)}</span>
            </div>
          )}
        </div>

        {/* Section Jump Bar */}
        <div className="border-t border-gray-100 bg-gray-50/90 px-4 py-2">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-2 overflow-x-auto no-scrollbar">
            <div className="flex items-center gap-2 text-xs">
              {part1Questions.length > 0 && (
                <a
                  href="#section-1"
                  className="px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 whitespace-nowrap bg-blue-900 text-white shadow-xs hover:bg-blue-950"
                >
                  <span>Phần I</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
                    {p1Answered}/{part1Questions.length}
                  </span>
                </a>
              )}
              {part2Questions.length > 0 && (
                <a
                  href="#section-2"
                  className="px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 whitespace-nowrap bg-emerald-800 text-white shadow-xs hover:bg-emerald-900"
                >
                  <span>Phần II</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
                    {p2Answered}/{part2Questions.length}
                  </span>
                </a>
              )}
              {part3Questions.length > 0 && (
                <a
                  href="#section-3"
                  className="px-3 py-1.5 rounded-lg font-bold transition flex items-center gap-1.5 whitespace-nowrap bg-purple-900 text-white shadow-xs hover:bg-purple-950"
                >
                  <span>Phần III</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20 font-mono">
                    {p3Answered}/{part3Questions.length}
                  </span>
                </a>
              )}
            </div>

            <div className="text-[11px] text-gray-500 font-semibold shrink-0">
              Tổng: <strong className="text-gray-900">{answered}</strong>/{total} câu
            </div>
          </div>
        </div>
      </header>

      {/* Warning on returning after tab switch in test mode */}
      {tabSwitchWarning && (
        <div className="bg-amber-500 text-white px-4 py-2 text-xs font-bold text-center shadow-md animate-in slide-in-from-top flex items-center justify-center gap-2 sticky top-[105px] z-20">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{tabSwitchWarning}</span>
        </div>
      )}

      {/* Questions Content strictly grouped: Part 1 -> Part 2 -> Part 3 */}
      <main className="max-w-4xl mx-auto px-4 py-6 space-y-8">
        {/* ========================================================= */}
        {/* PHẦN 1: TẤT CẢ CÂU HỎI TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN */}
        {/* ========================================================= */}
        {part1Questions.length > 0 && (
          <section id="section-1" className="space-y-4 scroll-mt-28">
            <div className="bg-gradient-to-r from-blue-950 via-blue-900 to-indigo-900 text-white rounded-2xl p-5 shadow-sm border border-blue-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 bg-white/20 rounded-lg text-xs font-black uppercase tracking-wider">
                    PHẦN I
                  </span>
                  <h2 className="text-base sm:text-lg font-black tracking-tight">
                    CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN
                  </h2>
                </div>
                <span className="text-xs bg-blue-800/80 px-2.5 py-1 rounded-full text-blue-200 font-semibold">
                  {part1Questions.length} câu • Mỗi câu {formatPoints(p1PointsPerQ)} điểm
                </span>
              </div>
              <p className="text-xs sm:text-sm text-blue-200 mt-2 leading-relaxed">
                Thí sinh trả lời từ câu 1 đến câu {part1Questions.length}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.
              </p>
            </div>

            <div className="space-y-4">
              {part1Questions.map((q: any) => renderQuestionCard(q))}
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* PHẦN 2: TẤT CẢ CÂU HỎI TRẮC NGHIỆM ĐÚNG - SAI             */}
        {/* ========================================================= */}
        {part2Questions.length > 0 && (
          <section id="section-2" className="space-y-4 pt-4 scroll-mt-28">
            <div className="bg-gradient-to-r from-emerald-950 via-emerald-900 to-teal-900 text-white rounded-2xl p-5 shadow-sm border border-emerald-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 bg-white/20 rounded-lg text-xs font-black uppercase tracking-wider">
                    PHẦN II
                  </span>
                  <h2 className="text-base sm:text-lg font-black tracking-tight">
                    CÂU TRẮC NGHIỆM ĐÚNG - SAI
                  </h2>
                </div>
                <span className="text-xs bg-emerald-800/80 px-2.5 py-1 rounded-full text-emerald-200 font-semibold">
                  {part2Questions.length} câu • Mỗi câu tối đa {formatPoints(p2PointsPerQ)} điểm
                </span>
              </div>
              <p className="text-xs sm:text-sm text-emerald-200 mt-2 leading-relaxed">
                Thí sinh trả lời từ câu 1 đến câu {part2Questions.length}. Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn Đúng hoặc Sai.
              </p>
            </div>

            <div className="space-y-4">
              {part2Questions.map((q: any) => renderQuestionCard(q))}
            </div>
          </section>
        )}

        {/* ========================================================= */}
        {/* PHẦN 3: TẤT CẢ CÂU HỎI TRẮC NGHIỆM TRẢ LỜI NGẮN          */}
        {/* ========================================================= */}
        {part3Questions.length > 0 && (
          <section id="section-3" className="space-y-4 pt-4 scroll-mt-28">
            <div className="bg-gradient-to-r from-purple-950 via-purple-900 to-indigo-900 text-white rounded-2xl p-5 shadow-sm border border-purple-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="px-3 py-1 bg-white/20 rounded-lg text-xs font-black uppercase tracking-wider">
                    PHẦN III
                  </span>
                  <h2 className="text-base sm:text-lg font-black tracking-tight">
                    CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN
                  </h2>
                </div>
                <span className="text-xs bg-purple-800/80 px-2.5 py-1 rounded-full text-purple-200 font-semibold">
                  {part3Questions.length} câu • Mỗi câu {formatPoints(p3PointsPerQ)} điểm
                </span>
              </div>
              <p className="text-xs sm:text-sm text-purple-200 mt-2 leading-relaxed">
                Thí sinh trả lời từ câu 1 đến câu {part3Questions.length}. Thí sinh tính toán và điền kết quả vào ô trống.
              </p>
            </div>

            <div className="space-y-4">
              {part3Questions.map((q: any) => renderQuestionCard(q))}
            </div>
          </section>
        )}
      </main>

      {/* Floating Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-md border-t border-gray-200 py-3.5 px-4 z-40 shadow-lg">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="text-xs sm:text-sm">
            <span className="text-gray-500">Đã làm: </span>
            <strong className="text-blue-900 font-bold">{answered}</strong>
            <span className="text-gray-400"> / {total} câu</span>
            {unansweredCount > 0 && (
              <span className="text-amber-600 ml-2 hidden sm:inline">
                (Còn {unansweredCount} câu chưa làm)
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setSubmitError(null);
              setShowConfirmModal(true);
            }}
            className="px-6 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-black text-sm sm:text-base rounded-xl shadow-md hover:shadow-lg transition flex items-center gap-2 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            NỘP BÀI
          </button>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-gray-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="text-center space-y-2">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
                  unansweredCount > 0
                    ? 'bg-amber-100 text-amber-600'
                    : 'bg-emerald-100 text-emerald-600'
                }`}
              >
                {unansweredCount > 0 ? (
                  <AlertCircle className="w-8 h-8" />
                ) : (
                  <CheckCircle2 className="w-8 h-8" />
                )}
              </div>
              <h3 className="text-lg font-bold text-gray-900">Xác Nhận Nộp Bài Thi</h3>
              <p className="text-xs text-gray-500">
                {unansweredCount > 0 ? (
                  <>
                    Em còn <strong className="text-amber-700">{unansweredCount} câu</strong> chưa
                    trả lời. Em có chắc chắn muốn nộp bài bây giờ không?
                  </>
                ) : (
                  'Em đã hoàn thành tất cả câu hỏi! Em đã sẵn sàng nộp bài?'
                )}
              </p>
            </div>

            <div className="bg-gray-50 p-3.5 rounded-xl border border-gray-200 text-xs space-y-1 text-gray-700">
              <div>
                Học sinh: <strong>{studentName}</strong>
              </div>
              <div>
                Lớp: <strong>{studentClass}</strong> • Mã đề: <strong>{examData.testCode}</strong>
              </div>
              <div className="text-red-600 font-medium pt-1">
                ⚠️ Sau khi nộp bài, em không thể sửa đổi câu trả lời.
              </div>
            </div>

            {submitError && (
              <div className="p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-200 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="flex-1 py-2.5 px-4 border border-gray-300 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
              >
                Làm tiếp
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleSubmitExam}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-bold shadow-md transition disabled:opacity-50"
              >
                {submitting ? 'Đang chấm điểm...' : 'Xác Nhận Nộp'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Exit Confirmation Modal ("Thoát là nộp bài" in Test mode) */}
      {showExitConfirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 space-y-5 border border-gray-100">
            <div className="text-center space-y-2">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center mx-auto ${
                  examData?.examMode === 'test' || examData?.maxAttempts === 1
                    ? 'bg-rose-100 text-rose-600'
                    : 'bg-blue-100 text-blue-600'
                }`}
              >
                {examData?.examMode === 'test' || examData?.maxAttempts === 1 ? (
                  <ShieldAlert className="w-8 h-8" />
                ) : (
                  <RotateCcw className="w-8 h-8" />
                )}
              </div>
              <h3 className="text-lg font-bold text-gray-900">
                {examData?.examMode === 'test' || examData?.maxAttempts === 1
                  ? 'CẢNH BÁO: BÀI THI KIỂM TRA'
                  : 'Xác Nhận Rời Phòng Thi'}
              </h3>
              <p className="text-xs text-gray-600 leading-relaxed">
                {examData?.examMode === 'test' || examData?.maxAttempts === 1 ? (
                  <>
                    Đề thi đang ở chế độ <strong>Kiểm tra (1 lần làm bài duy nhất, thoát là nộp bài)</strong>.
                    <br />
                    Nếu em thoát ra bây giờ, toàn bộ bài làm hiện tại sẽ được{' '}
                    <strong className="text-rose-600">
                      TỰ ĐỘNG NỘP VÀ CHẤM ĐIỂM NGAY LẬP TỨC
                    </strong>
                    . Em sẽ không thể làm lại bài này!
                  </>
                ) : (
                  'Bài làm của bạn đã được hệ thống tự động lưu. Bạn có chắc chắn muốn thoát về trang chủ không?'
                )}
              </p>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => setShowExitConfirmModal(false)}
                className="flex-1 py-2.5 px-4 border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 transition cursor-pointer"
              >
                Tiếp tục làm bài
              </button>
              {examData?.examMode === 'test' || examData?.maxAttempts === 1 ? (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={async () => {
                    setShowExitConfirmModal(false);
                    await handleSubmitExam();
                  }}
                  className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-xs font-bold shadow-md transition disabled:opacity-50 cursor-pointer"
                >
                  {submitting ? 'Đang nộp...' : 'Nộp Bài & Thoát'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setShowExitConfirmModal(false);
                    onExit?.();
                  }}
                  className="flex-1 py-2.5 px-4 bg-gray-800 hover:bg-gray-700 text-white rounded-xl text-xs font-bold shadow-md transition cursor-pointer"
                >
                  Thoát ra
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
