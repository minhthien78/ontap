import {
  ExamSource,
  ParsedQuestion,
  ShuffledExamVersion,
  ShuffledQuestion,
  ScoringConfig,
  StudentSubmission,
  SubmissionQuestionDetail,
} from './types';
import { stripOriginalQuestionNumber } from './docxParser';

/**
 * Fisher-Yates array shuffle helper
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function renumberPrompt(promptHtml: string, newNumber: number): string {
  const clean = stripOriginalQuestionNumber(promptHtml);
  return `<strong>Câu ${newNumber}: </strong>${clean}`;
}

/**
 * Generate a shuffled exam version from ExamSource
 */
export function createShuffledVersion(
  source: ExamSource,
  testCode: string,
  config: ScoringConfig
): ShuffledExamVersion {
  const versionId = `ver_${testCode}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

  // 1. Separate questions by section
  const part1Source = source.questions.filter((q) => q.section === 1);
  const part2Source = source.questions.filter((q) => q.section === 2);
  const part3Source = source.questions.filter((q) => q.section === 3);

  // 2. Shuffle questions strictly within their respective section
  const shuffledP1 = shuffleArray(part1Source);
  const shuffledP2 = shuffleArray(part2Source);
  const shuffledP3 = shuffleArray(part3Source);

  const answerKeys: ShuffledExamVersion['answerKeys'] = {
    part1: {},
    part2: {},
    part3: {},
  };

  const finalQuestions: ShuffledQuestion[] = [];

  // PROCESS PART 1
  shuffledP1.forEach((q, idx) => {
    // Shuffle options
    const originalOptions = q.options || [];
    const shuffledOpts = shuffleArray(originalOptions);
    const labels = ['A', 'B', 'C', 'D'];

    // Find the correct option before re-labeling
    const correctOpt = originalOptions.find((o) => o.isCorrect);
    if (correctOpt) {
      answerKeys.part1[q.id] = correctOpt.id;
    }

    const remappedOptions = shuffledOpts.map((opt, optIdx) => ({
      id: opt.id,
      label: labels[optIdx] || opt.label,
      html: opt.html,
      text: opt.text || opt.html.replace(/<[^>]+>/g, ''),
    }));

    finalQuestions.push({
      id: q.id,
      originalQuestionId: q.id,
      displayNumber: idx + 1,
      section: 1,
      promptHtml: renumberPrompt(q.promptHtml, idx + 1),
      images: q.images,
      tableHtml: q.tableHtml,
      options: remappedOptions,
      points: config.part1PointsPerQ,
    });
  });

  // PROCESS PART 2
  shuffledP2.forEach((q, idx) => {
    const originalStmts = q.statements || [];
    const shuffledStmts = shuffleArray(originalStmts);
    const stmtLabels = ['a', 'b', 'c', 'd'];

    // Map true/false status by statement ID
    answerKeys.part2[q.id] = {};
    originalStmts.forEach((stmt) => {
      answerKeys.part2[q.id][stmt.id] = stmt.isCorrect;
    });

    const remappedStmts = shuffledStmts.map((stmt, stmtIdx) => ({
      id: stmt.id,
      label: stmtLabels[stmtIdx] || stmt.label,
      html: stmt.html,
      text: stmt.text || stmt.html.replace(/<[^>]+>/g, ''),
    }));

    finalQuestions.push({
      id: q.id,
      originalQuestionId: q.id,
      displayNumber: idx + 1,
      section: 2,
      promptHtml: renumberPrompt(q.promptHtml, idx + 1),
      images: q.images,
      tableHtml: q.tableHtml,
      statements: remappedStmts,
      points: config.part2PointsPerQ,
    });
  });

  // PROCESS PART 3
  shuffledP3.forEach((q, idx) => {
    // Record standard answer keys
    const rawKey = q.shortAnswerKey || '';
    const acceptable = [rawKey];

    // Auto add dot/comma variations e.g. "0,25 mol" -> "0.25 mol", "0,25", "0.25"
    if (rawKey.includes(',')) {
      acceptable.push(rawKey.replace(/,/g, '.'));
    } else if (rawKey.includes('.')) {
      acceptable.push(rawKey.replace(/\./g, ','));
    }

    // If unit included e.g. "0,25 mol" -> also accept "0,25" and "0.25"
    const numberOnlyMatch = rawKey.match(/^([0-9.,]+)/);
    if (numberOnlyMatch) {
      const numVal = numberOnlyMatch[1];
      acceptable.push(numVal);
      acceptable.push(numVal.replace(/,/g, '.'));
      acceptable.push(numVal.replace(/\./g, ','));
    }

    answerKeys.part3[q.id] = Array.from(new Set(acceptable.filter((s) => s.trim().length > 0)));

    finalQuestions.push({
      id: q.id,
      originalQuestionId: q.id,
      displayNumber: idx + 1,
      section: 3,
      promptHtml: renumberPrompt(q.promptHtml, idx + 1),
      images: q.images,
      tableHtml: q.tableHtml,
      points: config.part3PointsPerQ,
    });
  });

  return {
    versionId,
    examId: source.id,
    testCode,
    title: source.title,
    createdAt: new Date().toISOString(),
    questions: finalQuestions,
    answerKeys,
  };
}

/**
 * Normalizes short text for chemistry comparisons
 */
function normalizeChemistryAnswer(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/,/g, '.');
}

/**
 * Compare student short answer with acceptable keys
 */
export function compareShortAnswer(studentAns: string, standardKeys: string[]): boolean {
  if (!studentAns || !studentAns.trim()) return false;
  const normStudent = normalizeChemistryAnswer(studentAns);

  for (const std of standardKeys) {
    const normStd = normalizeChemistryAnswer(std);
    if (normStudent === normStd) return true;

    // Numerical tolerance check: if both parse to number
    const studentNum = parseFloat(normStudent.replace(/[^0-9.-]/g, ''));
    const stdNum = parseFloat(normStd.replace(/[^0-9.-]/g, ''));
    if (!isNaN(studentNum) && !isNaN(stdNum) && Math.abs(studentNum - stdNum) < 1e-4) {
      return true;
    }
  }

  return false;
}

export function calculateScoringConfig(
  part1Count: number,
  part2Count: number,
  part3Count: number,
  options: {
    mode?: 'custom_sections' | 'equal_all' | 'vietnam_standard';
    part1Total?: number;
    part2Total?: number;
    part3Total?: number;
    part2GradingMode?: 'vietnam_standard' | 'equal_per_statement';
    totalScale?: number;
  }
): ScoringConfig {
  const totalScale = options.totalScale || 10;
  const totalQ = (part1Count + part2Count + part3Count) || 1;
  const part2GradingMode = options.part2GradingMode || 'equal_per_statement';

  // 1. Chế độ: Giáo viên tự nhập điểm cho từng phần (Phần 1, Phần 2, Phần 3)
  // Số điểm cho từng câu thì lấy điểm của giáo viên đã nhập chia cho tổng số câu của phần đó
  if (
    options.mode === 'custom_sections' ||
    (options.part1Total !== undefined && options.part2Total !== undefined && options.part3Total !== undefined)
  ) {
    const p1Total = options.part1Total !== undefined ? Number(options.part1Total) : 0;
    const p2Total = options.part2Total !== undefined ? Number(options.part2Total) : 0;
    const p3Total = options.part3Total !== undefined ? Number(options.part3Total) : 0;

    const p1PerQ = part1Count > 0 ? Math.round((p1Total / part1Count) * 1000) / 1000 : 0;
    const p2PerQ = part2Count > 0 ? Math.round((p2Total / part2Count) * 1000) / 1000 : 0;
    const p3PerQ = part3Count > 0 ? Math.round((p3Total / part3Count) * 1000) / 1000 : 0;
    const sumScale = Math.round((p1Total + p2Total + p3Total) * 100) / 100 || totalScale;

    return {
      scoringMode: 'custom_sections',
      part1TotalPoints: p1Total,
      part2TotalPoints: p2Total,
      part3TotalPoints: p3Total,
      part1PointsPerQ: p1PerQ,
      part2PointsPerQ: p2PerQ,
      part3PointsPerQ: p3PerQ,
      part2GradingMode,
      totalScale: sumScale,
    };
  }

  // 2. Chế độ: Chuẩn Bộ GD&ĐT 2025 (Chỉ dùng khi đúng 18 câu P1, 4 câu P2, 6 câu P3)
  if (options.mode === 'vietnam_standard' && part1Count === 18 && part2Count === 4 && part3Count === 6) {
    return {
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
  }

  // 3. Chế độ mặc định & 'equal_all': Chia đều cho từng câu/từng ý
  // Công thức: 10 điểm chia cho tổng số câu hỏi nhập vào của 3 phần để ra điểm trung bình của mỗi câu
  const avgPerQ = Math.round((totalScale / totalQ) * 1000) / 1000;
  const p1Total = Math.round(part1Count * avgPerQ * 100) / 100;
  const p2Total = Math.round(part2Count * avgPerQ * 100) / 100;
  const p3Total = Math.round((totalScale - p1Total - p2Total) * 100) / 100;

  return {
    scoringMode: 'equal_all',
    part1TotalPoints: p1Total,
    part2TotalPoints: p2Total,
    part3TotalPoints: p3Total,
    part1PointsPerQ: part1Count > 0 ? avgPerQ : 0,
    part2PointsPerQ: part2Count > 0 ? avgPerQ : 0,
    part3PointsPerQ: part3Count > 0 ? avgPerQ : 0,
    part2GradingMode: options.part2GradingMode || 'equal_per_statement',
    totalScale,
  };
}

/**
 * Server-side Grading Engine
 */
export function gradeSubmission(
  version: ShuffledExamVersion,
  answers: StudentSubmission['answers'],
  config: ScoringConfig
): StudentSubmission['score'] {
  let part1Score = 0;
  let part2Score = 0;
  let part3Score = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let unansweredCount = 0;

  const details: SubmissionQuestionDetail[] = [];

  for (const q of version.questions) {
    if (q.section === 1) {
      const selectedOptId = answers.part1[q.id];
      const correctOptId = version.answerKeys.part1[q.id];

      const selectedOpt = q.options?.find((o) => o.id === selectedOptId);
      const correctOpt = q.options?.find((o) => o.id === correctOptId);

      const isAnswered = !!selectedOptId;
      const isCorrect = isAnswered && selectedOptId === correctOptId;

      let pointsEarned = 0;
      if (isCorrect) {
        pointsEarned = config.part1PointsPerQ;
        part1Score += pointsEarned;
        correctCount++;
      } else if (!isAnswered) {
        unansweredCount++;
      } else {
        wrongCount++;
      }

      details.push({
        questionId: q.id,
        displayNumber: q.displayNumber,
        section: 1,
        promptHtml: q.promptHtml,
        pointsEarned: Math.round(pointsEarned * 100) / 100,
        maxPoints: config.part1PointsPerQ,
        isCorrect,
        selectedOptionLabel: selectedOpt ? selectedOpt.label : undefined,
        correctOptionLabel: correctOpt ? correctOpt.label : undefined,
        selectedOptionHtml: selectedOpt ? selectedOpt.html : undefined,
        correctOptionHtml: correctOpt ? correctOpt.html : undefined,
      });
    } else if (q.section === 2) {
      const qAnswers = answers.part2[q.id] || {};
      const qCorrectMap = version.answerKeys.part2[q.id] || {};
      const statements = q.statements || [];

      let correctStatementsCount = 0;
      let answeredCount = 0;

      const stmtResults = statements.map((stmt) => {
        const studentChoice = qAnswers[stmt.id] !== undefined ? qAnswers[stmt.id] : null;
        const correctChoice = qCorrectMap[stmt.id] ?? false;
        const stmtIsCorrect = studentChoice !== null && studentChoice === correctChoice;

        if (studentChoice !== null) answeredCount++;
        if (stmtIsCorrect) correctStatementsCount++;

        return {
          id: stmt.id,
          label: stmt.label,
          textHtml: stmt.html,
          studentChoice,
          correctChoice,
          isCorrect: stmtIsCorrect,
        };
      });

      let earned = 0;
      if (config.part2GradingMode === 'vietnam_standard') {
        // Vietnam 2025 standard Ministry rule for Part 2 (per 1.0 question):
        // 1 ý đúng = 0.1đ, 2 ý đúng = 0.25đ, 3 ý đúng = 0.5đ, 4 ý đúng = 1.0đ
        if (correctStatementsCount === 1) earned = 0.1 * (config.part2PointsPerQ / 1.0);
        else if (correctStatementsCount === 2) earned = 0.25 * (config.part2PointsPerQ / 1.0);
        else if (correctStatementsCount === 3) earned = 0.5 * (config.part2PointsPerQ / 1.0);
        else if (correctStatementsCount === 4) earned = 1.0 * (config.part2PointsPerQ / 1.0);
      } else {
        // Equal distribution per statement
        earned = (config.part2PointsPerQ / statements.length) * correctStatementsCount;
      }

      earned = Math.round(earned * 100) / 100;
      part2Score += earned;

      const isWholeQuestionCorrect = correctStatementsCount === statements.length;
      if (isWholeQuestionCorrect) correctCount++;
      else if (answeredCount === 0) unansweredCount++;
      else wrongCount++;

      details.push({
        questionId: q.id,
        displayNumber: q.displayNumber,
        section: 2,
        promptHtml: q.promptHtml,
        pointsEarned: earned,
        maxPoints: config.part2PointsPerQ,
        isCorrect: isWholeQuestionCorrect,
        statementResults: stmtResults,
      });
    } else if (q.section === 3) {
      const studentText = (answers.part3[q.id] || '').trim();
      const standardKeys = version.answerKeys.part3[q.id] || [];

      const isAnswered = studentText.length > 0;
      const isCorrect = isAnswered && compareShortAnswer(studentText, standardKeys);

      let earned = 0;
      if (isCorrect) {
        earned = config.part3PointsPerQ;
        part3Score += earned;
        correctCount++;
      } else if (!isAnswered) {
        unansweredCount++;
      } else {
        wrongCount++;
      }

      details.push({
        questionId: q.id,
        displayNumber: q.displayNumber,
        section: 3,
        promptHtml: q.promptHtml,
        pointsEarned: earned,
        maxPoints: config.part3PointsPerQ,
        isCorrect,
        studentAnswerText: studentText,
        standardAnswers: standardKeys,
      });
    }
  }

  // Calculate total scaled score
  const totalScore = Math.min(
    config.totalScale,
    Math.round((part1Score + part2Score + part3Score) * 100) / 100
  );

  return {
    totalScore,
    part1Score: Math.round(part1Score * 100) / 100,
    part2Score: Math.round(part2Score * 100) / 100,
    part3Score: Math.round(part3Score * 100) / 100,
    correctQuestionsCount: correctCount,
    wrongQuestionsCount: wrongCount,
    unansweredQuestionsCount: unansweredCount,
    details,
  };
}
