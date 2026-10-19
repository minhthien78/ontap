export type ExamSectionType = 1 | 2 | 3;

export interface ImageAsset {
  id: string;
  rId: string;
  fileName: string;
  mimeType: string;
  dataUrl: string; // base64 data url for browser display
}

export interface Part1Option {
  id: string;
  originalLabel: 'A' | 'B' | 'C' | 'D' | string;
  label: 'A' | 'B' | 'C' | 'D' | string;
  text: string;
  html: string;
  isCorrect: boolean;
  detectedUnderline?: boolean;
}

export interface Part2Statement {
  id: string;
  originalLabel: 'a' | 'b' | 'c' | 'd' | string;
  label: 'a' | 'b' | 'c' | 'd' | string;
  text: string;
  html: string;
  isCorrect: boolean; // true = Đúng, false = Sai
  detectedUnderline?: boolean;
}

export interface ParsedQuestion {
  id: string;
  originalNumber: number;
  displayNumber?: number;
  section: ExamSectionType;
  promptText: string;
  promptHtml: string;
  images: ImageAsset[];
  tableHtml?: string;
  mathTypeCount?: number;
  options?: Part1Option[]; // For Part 1
  statements?: Part2Statement[]; // For Part 2
  shortAnswerKey?: string; // For Part 3
  status: 'confirmed' | 'needs_review' | 'error';
  statusMessage?: string;
  points: number;
}

export interface ExamSource {
  id: string;
  title: string;
  fileName: string;
  uploadedAt: string;
  teacherId: string;
  part1Count: number;
  part2Count: number;
  part3Count: number;
  totalQuestions: number;
  detectedKeysCount: number;
  warningsCount: number;
  questions: ParsedQuestion[];
  mediaAssets: Record<string, ImageAsset>;
}

export interface ScoringConfig {
  scoringMode?: 'custom_sections' | 'equal_all' | 'vietnam_standard';
  part1TotalPoints?: number;
  part2TotalPoints?: number;
  part3TotalPoints?: number;
  part1PointsPerQ: number;
  part2GradingMode: 'vietnam_standard' | 'equal_per_statement'; // Vietnam 2025: 1 correct = 0.1, 2 = 0.25, 3 = 0.5, 4 = 1.0; or equal per statement
  part2PointsPerQ: number;
  part3PointsPerQ: number;
  totalScale: number; // usually 10
}

export interface ShuffledQuestion {
  id: string;
  originalQuestionId: string;
  displayNumber: number;
  section: ExamSectionType;
  promptHtml: string;
  images: ImageAsset[];
  tableHtml?: string;
  options?: {
    id: string;
    label: 'A' | 'B' | 'C' | 'D' | string;
    html: string;
    text?: string;
  }[];
  statements?: {
    id: string;
    label: 'a' | 'b' | 'c' | 'd' | string;
    html: string;
    text?: string;
  }[];
  points: number;
}

export interface ShuffledExamVersion {
  versionId: string;
  examId: string;
  testCode: string; // e.g. HHCT001
  title: string;
  createdAt: string;
  questions: ShuffledQuestion[];
  // Secure server-side answer key - NEVER sent to student before submit!
  answerKeys: {
    part1: Record<string, string>; // questionId -> optionId of correct option
    part2: Record<string, Record<string, boolean>>; // questionId -> statementId -> isCorrect
    part3: Record<string, string[]>; // questionId -> acceptable short answers
  };
}

export interface PublishedExam {
  id: string;
  examId: string;
  title: string;
  accessCode: string; // e.g. link access code
  createdAt: string;
  isOpen: boolean;
  durationMinutes: number; // 0 for unlimited
  allowShowResultImmediately: boolean;
  examMode?: 'test' | 'practice'; // 'test' = Kiểm tra (1 lần, thoát là nộp bài), 'practice' = Luyện tập (không giới hạn)
  maxAttempts?: number; // 1 (Kiểm tra) hoặc 0 (Luyện tập - không giới hạn)
  scoringConfig: ScoringConfig;
  versions: ShuffledExamVersion[];
  stats: {
    totalSubmissions: number;
    inProgressCount?: number;
    averageScore: number;
    highestScore: number;
    lowestScore: number;
  };
}

export interface StudentSubmission {
  id: string;
  publishedExamId: string;
  versionId: string;
  testCode: string;
  studentName: string;
  studentClass: string;
  attemptNumber?: number; // 1, 2, 3...
  startedAt: string;
  submittedAt: string;
  lastActiveAt?: string;
  status?: 'submitted' | 'in_progress';
  examTitle?: string;
  answers: {
    part1: Record<string, string>; // questionId -> selectedOptionId
    part2: Record<string, Record<string, boolean>>; // questionId -> statementId -> studentChoice
    part3: Record<string, string>; // questionId -> studentAnswerText
  };
  score: {
    totalScore: number; // max 10
    part1Score: number;
    part2Score: number;
    part3Score: number;
    correctQuestionsCount: number;
    wrongQuestionsCount: number;
    unansweredQuestionsCount: number;
    details: SubmissionQuestionDetail[];
  };
}

export interface SubmissionQuestionDetail {
  questionId: string;
  displayNumber: number;
  section: ExamSectionType;
  promptHtml: string;
  pointsEarned: number;
  maxPoints: number;
  isCorrect: boolean;
  // Part 1
  selectedOptionLabel?: string;
  correctOptionLabel?: string;
  selectedOptionHtml?: string;
  correctOptionHtml?: string;
  // Part 2
  statementResults?: {
    id: string;
    label: string;
    textHtml: string;
    studentChoice: boolean | null;
    correctChoice: boolean;
    isCorrect: boolean;
  }[];
  // Part 3
  studentAnswerText?: string;
  standardAnswers?: string[];
}

export interface TeacherUser {
  id: string;
  username: string;
  fullName: string;
  role: 'teacher' | 'admin';
  email?: string;
}
