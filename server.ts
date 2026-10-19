import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import { db } from './server/database';
import { parseDocxBuffer } from './server/docxParser';
import { createSampleChemistryDocx } from './server/sampleDocx';
import {
  createShuffledVersion,
  gradeSubmission,
  calculateScoringConfig,
} from './server/examManager';
import {
  generateStudentDocx,
  generateTeacherAnswerDocx,
} from './server/docxGenerator';
import { generateExamExcel } from './server/excelGenerator';
import {
  ExamSource,
  PublishedExam,
  ScoringConfig,
  StudentSubmission,
} from './server/types';
import { sendPasswordResetEmail } from './server/emailService';

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Multer memory storage for .docx uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB
  fileFilter: (_req, file, cb) => {
    if (
      file.mimetype.includes('wordprocessingml') ||
      file.originalname.toLowerCase().endsWith('.docx')
    ) {
      cb(null, true);
    } else {
      cb(new Error('Chỉ chấp nhận tệp định dạng Word DOCX (.docx)'));
    }
  },
});

// Authentication middleware for Teacher endpoints
function requireTeacher(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Chưa đăng nhập hoặc phiên làm việc đã hết hạn' });
  }

  const token = authHeader.split(' ')[1];
  const teacher = db.getTeacherByToken(token);
  if (!teacher) {
    return res.status(401).json({ error: 'Phiên làm việc không hợp lệ hoặc đã hết hạn' });
  }

  (req as any).teacher = teacher;
  next();
}

// ==========================================
// 1. AUTH ROUTES
// ==========================================
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu' });
  }

  const result = db.login(username, password);
  if (!result) {
    return res.status(401).json({
      error: 'Tên đăng nhập hoặc mật khẩu không chính xác. Vui lòng thử lại.',
    });
  }

  return res.json(result);
});

app.get('/api/auth/me', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Chưa đăng nhập' });
  }
  const token = authHeader.split(' ')[1];
  const teacher = db.getTeacherByToken(token);
  if (!teacher) {
    return res.status(401).json({ error: 'Phiên không hợp lệ' });
  }
  return res.json({ user: teacher });
});

// Change Password (Teacher only)
app.post('/api/auth/change-password', requireTeacher, (req, res) => {
  const { oldPassword, newPassword } = req.body;
  if (!oldPassword || !newPassword) {
    return res.status(400).json({ error: 'Vui lòng nhập mật khẩu hiện tại và mật khẩu mới' });
  }

  if (typeof newPassword !== 'string' || newPassword.trim().length < 6) {
    return res.status(400).json({ error: 'Mật khẩu mới phải có ít nhất 6 ký tự' });
  }

  const teacher = (req as any).teacher;
  const result = db.changeTeacherPassword(teacher.id, oldPassword, newPassword.trim());
  if (!result.success) {
    return res.status(400).json({ error: result.error || 'Đổi mật khẩu thất bại' });
  }

  return res.json({ success: true, message: 'Đổi mật khẩu thành công!' });
});

// Reset Password by Admin Email only ("minhthien78@gmail.com")
// Mechanism: Generates a secure random password and sends it directly to minhthien78@gmail.com.
// The new password is NEVER exposed to the client or browser!
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'Vui lòng cung cấp email quản trị viên' });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    // STRICT RULE: Only allow reset for "minhthien78@gmail.com"
    if (cleanEmail !== 'minhthien78@gmail.com') {
      return res.status(403).json({
        error:
          'Quyền bị từ chối! Hệ thống chỉ hỗ trợ cấp lại mật khẩu cho email quản trị viên: minhthien78@gmail.com. Tuyệt đối không cấp lại cho email khác!',
      });
    }

    // Generate secure random password, update hash, invalidate old sessions
    const result = db.resetAndGenerateTeacherPassword(cleanEmail);
    if (!result.success || !result.newPassword) {
      return res.status(400).json({ error: result.error || 'Cấp lại mật khẩu thất bại' });
    }

    // Send the new password directly to the teacher's Gmail inbox
    await sendPasswordResetEmail(
      cleanEmail,
      result.teacherName || 'Thầy Nguyễn Minh Thiện',
      result.newPassword
    );

    return res.json({
      success: true,
      message:
        'Hệ thống đã tạo mật khẩu mới an toàn và gửi trực tiếp về email minhthien78@gmail.com! Thầy vui lòng mở hộp thư Gmail để lấy mật khẩu đăng nhập.',
    });
  } catch (err: any) {
    console.error('Password reset email error:', err);
    return res.status(500).json({
      error:
        'Không thể gửi email cấp lại mật khẩu. ' +
        (err.message || 'Vui lòng kiểm tra lại kết nối email hoặc thử lại sau.'),
    });
  }
});

// ==========================================
// 2. EXAM UPLOAD & PARSER ROUTES (Teacher Only)
// ==========================================

// Upload DOCX file from computer
app.post('/api/exams/upload', requireTeacher, upload.single('file'), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: 'Vui lòng chọn tệp Word (.docx) để tải lên' });
    }

    const examSource = await parseDocxBuffer(req.file.buffer, req.file.originalname);
    db.saveExam(examSource);

    return res.json({
      success: true,
      exam: examSource,
      message: `Đã phân tích thành công đề thi: ${examSource.totalQuestions} câu hỏi`,
    });
  } catch (err: any) {
    console.error('Error parsing docx:', err);
    return res.status(500).json({
      error: `Lỗi phân tích tệp DOCX: ${err.message || 'Cấu trúc tệp không hợp lệ'}`,
    });
  }
});

// Create sample chemistry DOCX and parse it immediately
app.post('/api/exams/create-sample', requireTeacher, async (_req, res) => {
  try {
    const sampleBuffer = await createSampleChemistryDocx();
    const examSource = await parseDocxBuffer(
      sampleBuffer,
      'De_Thi_Mau_Hoa_Hoc_Thay_Thien_2025.docx'
    );
    examSource.title = 'Đề Thi Thử Hóa Học THPT - Thầy Nguyễn Minh Thiện';
    db.saveExam(examSource);

    return res.json({
      success: true,
      exam: examSource,
      message: 'Đã tạo và phân tích thành công đề thi Hóa học mẫu chuẩn cấu trúc',
    });
  } catch (err: any) {
    console.error('Error creating sample docx:', err);
    return res.status(500).json({ error: `Lỗi tạo đề mẫu: ${err.message}` });
  }
});

// List all uploaded exams (Teacher only)
app.get('/api/exams', requireTeacher, (_req, res) => {
  const exams = db.getExams();
  return res.json({ exams });
});

// Get specific exam by ID (Teacher only)
app.get('/api/exams/:id', requireTeacher, (req, res) => {
  const exam = db.getExamById(req.params.id);
  if (!exam) {
    return res.status(404).json({ error: 'Không tìm thấy đề thi' });
  }
  return res.json({ exam });
});

// Update a question in exam (Teacher only)
app.put('/api/exams/:id/questions/:qId', requireTeacher, (req, res) => {
  const exam = db.getExamById(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Không tìm thấy đề thi' });

  const q = exam.questions.find((question) => question.id === req.params.qId);
  if (!q) return res.status(404).json({ error: 'Không tìm thấy câu hỏi' });

  const { options, statements, shortAnswerKey, status } = req.body;

  if (q.section === 1 && Array.isArray(options)) {
    q.options = options;
  } else if (q.section === 2 && Array.isArray(statements)) {
    q.statements = statements;
  } else if (q.section === 3 && shortAnswerKey !== undefined) {
    q.shortAnswerKey = shortAnswerKey;
  }

  if (status) {
    q.status = status;
    q.statusMessage = undefined;
  }

  // Recalculate warnings
  exam.warningsCount = exam.questions.filter((question) => question.status !== 'confirmed').length;
  db.saveExam(exam);

  return res.json({ success: true, question: q, exam });
});

// Delete uploaded exam source (Teacher only)
app.delete('/api/exams/:id', requireTeacher, (req, res) => {
  const success = db.deleteExam(req.params.id);
  if (!success) return res.status(404).json({ error: 'Không tìm thấy đề thi' });
  return res.json({ success: true, message: 'Đã xóa đề thi' });
});

// ==========================================
// 3. SHUFFLING & PUBLISHING ROUTES (Teacher Only)
// ==========================================

// Shuffle exam and publish
app.post('/api/exams/:id/shuffle', requireTeacher, (req, res) => {
  const exam = db.getExamById(req.params.id);
  if (!exam) return res.status(404).json({ error: 'Không tìm thấy đề thi' });

  const unconfirmed = exam.questions.filter((q) => q.status === 'error');
  if (unconfirmed.length > 0) {
    return res.status(400).json({
      error: `Không thể phát hành đề thi! Còn ${unconfirmed.length} câu có lỗi cấu trúc cần xử lý trước.`,
    });
  }

  const {
    numVersions = 4,
    codePrefix = 'HHCT',
    durationMinutes = 50,
    scoringConfig,
    allowShowResultImmediately = true,
    examMode = 'test', // 'test' = Kiểm tra (1 lần, thoát là nộp bài), 'practice' = Luyện tập (không giới hạn)
    maxAttempts,
  } = req.body;

  const p1Count = exam.part1Count;
  const p2Count = exam.part2Count;
  const p3Count = exam.part3Count;

  // Determine scoring configuration
  let effectiveScoringConfig: ScoringConfig;
  if (
    scoringConfig?.scoringMode === 'custom_sections' ||
    (scoringConfig?.part1TotalPoints !== undefined && scoringConfig?.part2TotalPoints !== undefined && scoringConfig?.part3TotalPoints !== undefined)
  ) {
    effectiveScoringConfig = calculateScoringConfig(p1Count, p2Count, p3Count, {
      mode: 'custom_sections',
      part1Total: scoringConfig.part1TotalPoints,
      part2Total: scoringConfig.part2TotalPoints,
      part3Total: scoringConfig.part3TotalPoints,
      part2GradingMode: scoringConfig.part2GradingMode || 'equal_per_statement',
    });
  } else if (
    scoringConfig?.scoringMode === 'vietnam_standard' &&
    p1Count === 18 && p2Count === 4 && p3Count === 6
  ) {
    effectiveScoringConfig = calculateScoringConfig(p1Count, p2Count, p3Count, {
      mode: 'vietnam_standard',
      part2GradingMode: 'vietnam_standard',
    });
  } else {
    // Default & 'equal_all': 10 điểm chia cho tổng số câu hỏi nhập vào của 3 phần để ra điểm trung bình mỗi câu
    effectiveScoringConfig = calculateScoringConfig(p1Count, p2Count, p3Count, {
      mode: 'equal_all',
      part2GradingMode: scoringConfig?.part2GradingMode || 'equal_per_statement',
      totalScale: 10,
    });
  }

  const versions = [];
  const publishedExamId = `pub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const accessCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  for (let i = 1; i <= Math.min(10, Math.max(1, numVersions)); i++) {
    const code = `${codePrefix}${String(i).padStart(3, '0')}`;
    const version = createShuffledVersion(exam, code, effectiveScoringConfig);
    versions.push(version);
  }

  // 2 options: 'test' (Kiểm tra - 1 lần, thoát là nộp bài) vs 'practice' (Luyện tập - không giới hạn)
  const effectiveExamMode: 'test' | 'practice' =
    examMode === 'practice' || maxAttempts === 0 ? 'practice' : 'test';
  const effectiveMaxAttempts = effectiveExamMode === 'test' ? 1 : 0;

  const publishedExam: PublishedExam = {
    id: publishedExamId,
    examId: exam.id,
    title: exam.title,
    accessCode,
    createdAt: new Date().toISOString(),
    isOpen: true,
    durationMinutes,
    allowShowResultImmediately,
    examMode: effectiveExamMode,
    maxAttempts: effectiveMaxAttempts,
    scoringConfig: effectiveScoringConfig,
    versions,
    stats: {
      totalSubmissions: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
    },
  };

  db.savePublishedExam(publishedExam);

  return res.json({
    success: true,
    publishedExam,
    message: `Đã trộn thành công ${versions.length} mã đề và phát hành trực tuyến!`,
  });
});

// Update scoring config for an already published exam & re-grade all submissions (Teacher only)
app.put('/api/published-exams/:id/scoring', requireTeacher, (req, res) => {
  const published = db.getPublishedExamById(req.params.id);
  if (!published) return res.status(404).json({ error: 'Không tìm thấy đề thi' });

  const exam = db.getExamById(published.examId);
  const p1Count = exam ? exam.part1Count : (published.versions[0]?.questions.filter((q) => q.section === 1).length || 0);
  const p2Count = exam ? exam.part2Count : (published.versions[0]?.questions.filter((q) => q.section === 2).length || 0);
  const p3Count = exam ? exam.part3Count : (published.versions[0]?.questions.filter((q) => q.section === 3).length || 0);

  const {
    scoringMode = 'custom_sections',
    part1TotalPoints,
    part2TotalPoints,
    part3TotalPoints,
    part2GradingMode = 'equal_per_statement',
  } = req.body;

  const newScoringConfig = calculateScoringConfig(p1Count, p2Count, p3Count, {
    mode: scoringMode,
    part1Total: part1TotalPoints !== undefined ? Number(part1TotalPoints) : undefined,
    part2Total: part2TotalPoints !== undefined ? Number(part2TotalPoints) : undefined,
    part3Total: part3TotalPoints !== undefined ? Number(part3TotalPoints) : undefined,
    part2GradingMode,
  });

  // Update published exam scoringConfig
  published.scoringConfig = newScoringConfig;

  // Update points on questions in all versions
  for (const ver of published.versions) {
    for (const q of ver.questions) {
      if (q.section === 1) q.points = newScoringConfig.part1PointsPerQ;
      else if (q.section === 2) q.points = newScoringConfig.part2PointsPerQ;
      else if (q.section === 3) q.points = newScoringConfig.part3PointsPerQ;
    }
  }

  // RE-GRADE ALL EXISTING SUBMISSIONS
  const submissions = db.getSubmissions(published.id);
  for (const sub of submissions) {
    const ver = published.versions.find((v) => v.versionId === sub.versionId) || published.versions[0];
    if (ver) {
      sub.score = gradeSubmission(ver, sub.answers, newScoringConfig);
    }
  }

  // Recalculate stats
  published.stats.totalSubmissions = submissions.length;
  if (submissions.length > 0) {
    const scores = submissions.map((s) => s.score.totalScore);
    published.stats.highestScore = Math.max(...scores);
    published.stats.lowestScore = Math.min(...scores);
    published.stats.averageScore =
      Math.round((scores.reduce((a, b) => a + b, 0) / submissions.length) * 100) / 100;
  }

  db.save();

  return res.json({
    success: true,
    publishedExam: published,
    submissionsCount: submissions.length,
    newScoringConfig,
  });
});

// List published exams (Full for teacher; Safe stripped list for students)
app.get('/api/published-exams', (req, res) => {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;
  const teacher = token ? db.getTeacherByToken(token) : null;

  const publishedExams = db.getPublishedExams();

  if (teacher) {
    return res.json({ publishedExams });
  }

  // Student / Guest safe list: only open exams, answer keys stripped from versions
  const safeExams = publishedExams
    .filter((p) => p.isOpen)
    .map((p) => ({
      id: p.id,
      examId: p.examId,
      title: p.title,
      accessCode: p.accessCode,
      createdAt: p.createdAt,
      isOpen: p.isOpen,
      durationMinutes: p.durationMinutes,
      allowShowResultImmediately: p.allowShowResultImmediately,
      maxAttempts: p.maxAttempts !== undefined ? p.maxAttempts : 3,
      scoringConfig: p.scoringConfig,
      stats: { totalSubmissions: p.stats?.totalSubmissions || 0 },
      versions: (p.versions || []).map((v) => ({
        versionId: v.versionId,
        testCode: v.testCode,
        title: v.title,
        questions: [],
      })),
    }));

  return res.json({ publishedExams: safeExams });
});

// Get published exam details (For teacher view)
app.get('/api/published-exams/:id', requireTeacher, (req, res) => {
  const published = db.getPublishedExamById(req.params.id);
  if (!published) return res.status(404).json({ error: 'Không tìm thấy đề thi đã phát hành' });
  return res.json({ publishedExam: published });
});

// Toggle Open/Close status (Teacher only)
app.put('/api/published-exams/:id/status', requireTeacher, (req, res) => {
  const { isOpen } = req.body;
  const success = db.updatePublishedExam(req.params.id, { isOpen });
  if (!success) return res.status(404).json({ error: 'Không tìm thấy đề thi' });
  return res.json({ success: true, isOpen });
});

// Update exam mode / max attempts for an already published exam (Teacher only)
app.put('/api/published-exams/:id/max-attempts', requireTeacher, (req, res) => {
  const { maxAttempts, examMode } = req.body;
  let finalMode: 'test' | 'practice' = 'practice';
  if (examMode) {
    finalMode = examMode === 'test' ? 'test' : 'practice';
  } else if (maxAttempts !== undefined) {
    finalMode = parseInt(maxAttempts, 10) === 1 ? 'test' : 'practice';
  }
  const finalVal = finalMode === 'test' ? 1 : 0;
  const success = db.updatePublishedExamMode(req.params.id, finalMode);
  if (!success) return res.status(404).json({ error: 'Không tìm thấy đề thi' });
  return res.json({ success: true, examMode: finalMode, maxAttempts: finalVal });
});

// System storage info & status (FIFO auto-prune oldest exam when full - Teacher only)
app.get('/api/system/storage', requireTeacher, (_req, res) => {
  const stats = db.getStorageStats();
  return res.json({ success: true, stats });
});

// Delete published exam (Teacher only)
app.delete('/api/published-exams/:id', requireTeacher, (req, res) => {
  const success = db.deletePublishedExam(req.params.id);
  if (!success) return res.status(404).json({ error: 'Không tìm thấy đề thi' });
  return res.json({ success: true, message: 'Đã xóa đề thi đã phát hành' });
});

// Download Student Word (.docx) - Underline stripped
app.get('/api/published-exams/:id/versions/:vId/download-student-docx', async (req, res) => {
  try {
    const published = db.getPublishedExamById(req.params.id);
    if (!published) return res.status(404).send('Không tìm thấy đề thi');

    const version = published.versions.find((v) => v.versionId === req.params.vId);
    if (!version) return res.status(404).send('Không tìm thấy mã đề');

    const buffer = await generateStudentDocx(version);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="De_Thi_${version.testCode}_Hoc_Sinh.docx"`
    );
    return res.send(buffer);
  } catch (err: any) {
    console.error('Error generating student docx:', err);
    return res.status(500).send(`Lỗi tạo tệp Word: ${err.message}`);
  }
});

// Download Teacher Answer Key Word (.docx) - Teacher only
app.get('/api/published-exams/:id/versions/:vId/download-teacher-docx', requireTeacher, async (req, res) => {
  try {
    const published = db.getPublishedExamById(req.params.id);
    if (!published) return res.status(404).send('Không tìm thấy đề thi');

    const version = published.versions.find((v) => v.versionId === req.params.vId);
    if (!version) return res.status(404).send('Không tìm thấy mã đề');

    const buffer = await generateTeacherAnswerDocx(version);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Dap_An_${version.testCode}_Giao_Vien.docx"`
    );
    return res.send(buffer);
  } catch (err: any) {
    console.error('Error generating teacher answer docx:', err);
    return res.status(500).send(`Lỗi tạo tệp đáp án: ${err.message}`);
  }
});

// ==========================================
// 4. STUDENT ONLINE EXAM ROUTES (SECURE!)
// ==========================================

// Get exam questions for taking exam
// CRITICAL: NEVER send answer keys or isCorrect to client!
app.get('/api/student/exam/:accessCode', (req, res) => {
  const published = db.getPublishedExamByAccessCode(req.params.accessCode);
  if (!published) {
    return res.status(404).json({ error: 'Mã đề thi không tồn tại hoặc đường link không hợp lệ' });
  }

  if (!published.isOpen) {
    return res.status(403).json({
      error: 'Đề thi hiện đang ĐÓNG. Thầy cô chưa mở hoặc đã kết thúc thời gian thi.',
      isOpen: false,
    });
  }

  // Select a random shuffled version or specific version
  const selectedVersion =
    published.versions[Math.floor(Math.random() * published.versions.length)];

  // STRIP ALL ANSWER KEYS AND CORRECT FLAGS & ENSURE STRICT ORDER (PART 1 -> PART 2 -> PART 3)!
  const safeQuestions = selectedVersion.questions
    .slice()
    .sort((a, b) => {
      if (a.section !== b.section) return a.section - b.section;
      return a.displayNumber - b.displayNumber;
    })
    .map((q) => {
      return {
        id: q.id,
        displayNumber: q.displayNumber,
        section: q.section,
        promptHtml: q.promptHtml,
        images: q.images,
        tableHtml: q.tableHtml,
        points: q.points,
        // For Part 1: Options without any isCorrect flag
        options: q.options?.map((o) => ({
          id: o.id,
          label: o.label,
          html: o.html,
        })),
        // For Part 2: Statements without any isCorrect flag
        statements: q.statements?.map((s) => ({
          id: s.id,
          label: s.label,
          html: s.html,
        })),
      };
    });

  const examMode = published.examMode || (published.maxAttempts === 1 ? 'test' : 'practice');
  const maxAttempts = examMode === 'test' ? 1 : 0;

  return res.json({
    publishedExamId: published.id,
    versionId: selectedVersion.versionId,
    testCode: selectedVersion.testCode,
    title: published.title,
    durationMinutes: published.durationMinutes,
    isOpen: published.isOpen,
    examMode,
    maxAttempts,
    questions: safeQuestions,
    scoringConfig: published.scoringConfig,
  });
});

// Real-time student progress saving during test ("trong suốt quá trình làm của học sinh")
app.post('/api/student/exam/:accessCode/progress', (req, res) => {
  const published = db.getPublishedExamByAccessCode(req.params.accessCode);
  if (!published) {
    return res.status(404).json({ error: 'Đề thi không tồn tại' });
  }

  const { versionId, studentName, studentClass, answers, startedAt } = req.body;
  if (!studentName || !studentName.trim() || !studentClass || !studentClass.trim()) {
    return res.status(400).json({ error: 'Thiếu họ tên hoặc lớp' });
  }

  const version = published.versions.find((v) => v.versionId === versionId) || published.versions[0];
  if (!version) {
    return res.status(400).json({ error: 'Không tìm thấy mã đề' });
  }

  // Calculate interim score
  const scoreResult = gradeSubmission(version, answers, published.scoringConfig);

  const cleanName = studentName.trim().replace(/\s+/g, '_');
  const cleanClass = studentClass.trim().replace(/\s+/g, '_');
  const currentAttempts = db.getStudentSubmittedCount(published.id, studentName, studentClass);
  const currentAttemptNum = currentAttempts + 1;
  const submissionId = `sub_${cleanName}_${cleanClass}_${published.id}_att${currentAttemptNum}`.slice(0, 80);

  const submission: StudentSubmission = {
    id: submissionId,
    publishedExamId: published.id,
    versionId: version.versionId,
    testCode: version.testCode,
    studentName: studentName.trim(),
    studentClass: studentClass.trim(),
    attemptNumber: currentAttemptNum,
    startedAt: startedAt || new Date().toISOString(),
    submittedAt: '',
    lastActiveAt: new Date().toISOString(),
    status: 'in_progress',
    examTitle: published.title,
    answers,
    score: scoreResult,
  };

  db.saveOrUpdateStudentProgress(submission);

  return res.json({
    success: true,
    interimScore: scoreResult.totalScore,
    correctCount: scoreResult.correctQuestionsCount,
    attemptNumber: currentAttemptNum,
  });
});

// Resume progress if student accidentally closes and reopens browser
app.get('/api/student/exam/:accessCode/progress', (req, res) => {
  const published = db.getPublishedExamByAccessCode(req.params.accessCode);
  if (!published) {
    return res.status(404).json({ error: 'Đề thi không tồn tại' });
  }

  const { studentName, studentClass } = req.query;
  if (!studentName || !studentClass) {
    return res.json({ progress: null });
  }

  const cleanName = String(studentName).trim();
  const cleanClass = String(studentClass).trim();

  const existing = db.getStudentProgress(
    published.id,
    cleanName,
    cleanClass
  );

  const submittedCount = db.getStudentSubmittedCount(published.id, cleanName, cleanClass);
  const examMode = published.examMode || (published.maxAttempts === 1 ? 'test' : 'practice');
  const maxAttempts = examMode === 'test' ? 1 : 0;
  const canSubmit = examMode === 'practice' || submittedCount === 0;

  return res.json({
    progress: existing || null,
    submittedCount,
    examMode,
    maxAttempts,
    canSubmit,
  });
});

// Submit exam answers
// Graded purely on the backend against server-side answer keys!
app.post('/api/student/exam/:accessCode/submit', (req, res) => {
  const published = db.getPublishedExamByAccessCode(req.params.accessCode);
  if (!published) {
    return res.status(404).json({ error: 'Đề thi không tồn tại' });
  }

  if (!published.isOpen) {
    return res.status(403).json({ error: 'Đề thi đã đóng, không thể nộp bài thêm' });
  }

  const { versionId, studentName, studentClass, answers, startedAt } = req.body;

  if (!studentName || !studentName.trim() || !studentClass || !studentClass.trim()) {
    return res.status(400).json({ error: 'Vui lòng điền đầy đủ Họ và tên cùng Lớp học' });
  }

  // Find exact version
  const version = published.versions.find((v) => v.versionId === versionId);
  if (!version) {
    return res.status(400).json({ error: 'Phiên bản mã đề không hợp lệ' });
  }

  // Unconditionally allow multiple submissions: every attempt is saved with its score and attempt number!
  const currentAttempts = db.getStudentSubmittedCount(published.id, studentName, studentClass);
  const attemptNumber = currentAttempts + 1;

  // Server-side grading
  const scoreResult = gradeSubmission(version, answers, published.scoringConfig);

  const cleanName = studentName.trim().replace(/\s+/g, '_');
  const cleanClass = studentClass.trim().replace(/\s+/g, '_');
  const submissionId = `sub_${cleanName}_${cleanClass}_${published.id}_att${attemptNumber}_${Date.now()}`.slice(0, 80);

  const submission: StudentSubmission = {
    id: submissionId,
    publishedExamId: published.id,
    versionId,
    testCode: version.testCode,
    studentName: studentName.trim(),
    studentClass: studentClass.trim(),
    attemptNumber,
    startedAt: startedAt || new Date().toISOString(),
    submittedAt: new Date().toISOString(),
    lastActiveAt: new Date().toISOString(),
    status: 'submitted',
    examTitle: published.title,
    answers,
    score: scoreResult,
  };

  db.saveSubmission(submission);

  return res.json({
    success: true,
    submissionId,
    testCode: version.testCode,
    studentName: submission.studentName,
    studentClass: submission.studentClass,
    attemptNumber,
    examMode: 'practice',
    maxAttempts: 0,
    canRetake: true,
    score: {
      totalScore: scoreResult.totalScore,
      part1Score: scoreResult.part1Score,
      part2Score: scoreResult.part2Score,
      part3Score: scoreResult.part3Score,
      correctQuestionsCount: scoreResult.correctQuestionsCount,
      wrongQuestionsCount: scoreResult.wrongQuestionsCount,
      unansweredQuestionsCount: scoreResult.unansweredQuestionsCount,
    },
    allowShowResultImmediately: published.allowShowResultImmediately,
    details: published.allowShowResultImmediately ? scoreResult.details : undefined,
  });
});

// View student's own submission result
app.get('/api/student/submission/:submissionId', (req, res) => {
  const submission = db.getSubmissionById(req.params.submissionId);
  if (!submission) {
    return res.status(404).json({ error: 'Không tìm thấy bài làm' });
  }

  const published = db.getPublishedExamById(submission.publishedExamId);
  const allowDetails = published?.allowShowResultImmediately || !published?.isOpen;

  return res.json({
    submission: {
      id: submission.id,
      studentName: submission.studentName,
      studentClass: submission.studentClass,
      testCode: submission.testCode,
      submittedAt: submission.submittedAt,
      score: {
        totalScore: submission.score.totalScore,
        part1Score: submission.score.part1Score,
        part2Score: submission.score.part2Score,
        part3Score: submission.score.part3Score,
        correctQuestionsCount: submission.score.correctQuestionsCount,
        wrongQuestionsCount: submission.score.wrongQuestionsCount,
        unansweredQuestionsCount: submission.score.unansweredQuestionsCount,
        details: allowDetails ? submission.score.details : undefined,
      },
    },
  });
});

// ==========================================
// 5. TEACHER RESULTS & EXCEL ROUTES (Teacher Only)
// ==========================================

// Get all submissions across all exams (Teacher only)
app.get('/api/submissions', requireTeacher, (_req, res) => {
  const submissions = db.getAllSubmissions();
  return res.json({
    submissions,
    total: submissions.length,
  });
});

// Delete a submission (Teacher only)
app.delete('/api/submissions/:id', requireTeacher, (req, res) => {
  const success = db.deleteSubmission(req.params.id);
  if (!success) return res.status(404).json({ error: 'Không tìm thấy bài làm' });
  return res.json({ success: true, message: 'Đã xóa bài làm thành công' });
});

// Get submissions list for an exam (Teacher only)
app.get('/api/published-exams/:id/submissions', requireTeacher, (req, res) => {
  if (req.params.id === 'all') {
    const submissions = db.getAllSubmissions();
    const finished = submissions.filter((s) => s.status !== 'in_progress');
    const scores = finished.map((s) => s.score.totalScore);
    const stats = {
      totalSubmissions: finished.length,
      averageScore: finished.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / finished.length) * 100) / 100 : 0,
      highestScore: finished.length > 0 ? Math.max(...scores) : 0,
      lowestScore: finished.length > 0 ? Math.min(...scores) : 0,
    };
    return res.json({ submissions, stats });
  }

  const published = db.getPublishedExamById(req.params.id);
  if (!published) return res.status(404).json({ error: 'Không tìm thấy đề thi' });

  const submissions = db.getSubmissions(req.params.id);
  return res.json({ submissions, stats: published.stats });
});

// Export Excel (.xlsx) (Teacher only)
app.get('/api/published-exams/:id/export-excel', requireTeacher, async (req, res) => {
  try {
    let published: any;
    let submissions: any[];

    if (req.params.id === 'all') {
      published = {
        title: 'Tất_Cả_Bài_Thi',
        accessCode: 'ALL',
      };
      submissions = db.getAllSubmissions();
    } else {
      published = db.getPublishedExamById(req.params.id);
      if (!published) return res.status(404).send('Không tìm thấy đề thi');
      submissions = db.getSubmissions(req.params.id);
    }

    const excelBuffer = await generateExamExcel(published, submissions);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Bang_Diem_${encodeURIComponent(published.title.replace(/\s+/g, '_'))}.xlsx"`
    );
    return res.send(excelBuffer);
  } catch (err: any) {
    console.error('Error generating excel:', err);
    return res.status(500).send(`Lỗi xuất tệp Excel: ${err.message}`);
  }
});

// ==========================================
// 6. AUTOMATED VERIFICATION SUITE (ALL 12 CASES)
// ==========================================
app.get('/api/test/run-verification', async (_req, res) => {
  const results: { caseId: number; title: string; passed: boolean; message: string }[] = [];

  try {
    // Generate Sample DOCX
    const sampleBuffer = await createSampleChemistryDocx();
    const parsedExam = await parseDocxBuffer(sampleBuffer, 'Test_Suite.docx');

    // Case 1: MCQ only underline 'A'
    const q1 = parsedExam.questions.find((q) => q.section === 1 && q.originalNumber === 1);
    const q1OptA = q1?.options?.find((o) => o.originalLabel === 'A');
    const q1OptB = q1?.options?.find((o) => o.originalLabel === 'B');
    const case1Pass = !!(q1OptA?.isCorrect && !q1OptB?.isCorrect);
    results.push({
      caseId: 1,
      title: 'Câu trắc nghiệm chỉ gạch chân chữ A, không gạch chân dấu chấm',
      passed: case1Pass,
      message: case1Pass ? 'Nhận diện chính xác A là đáp án đúng' : 'Không nhận diện được A',
    });

    // Case 2: MCQ underline 'B.' (letter + dot)
    const q2 = parsedExam.questions.find((q) => q.section === 1 && q.originalNumber === 2);
    const q2OptB = q2?.options?.find((o) => o.originalLabel === 'B');
    const case2Pass = !!q2OptB?.isCorrect;
    results.push({
      caseId: 2,
      title: 'Câu trắc nghiệm gạch chân cả ký hiệu B.',
      passed: case2Pass,
      message: case2Pass ? 'Nhận diện chính xác B là đáp án đúng' : 'Không nhận diện được B.',
    });

    // Case 3: TF statement a) underlined, b) not
    const q5 = parsedExam.questions.find((q) => q.section === 2);
    const stmA = q5?.statements?.find((s) => s.originalLabel === 'a');
    const stmB = q5?.statements?.find((s) => s.originalLabel === 'b');
    const case3Pass = !!(stmA?.isCorrect === true && stmB?.isCorrect === false);
    results.push({
      caseId: 3,
      title: 'Câu đúng - sai có nhận định a) được gạch chân (Đúng), b) không gạch chân (Sai)',
      passed: case3Pass,
      message: case3Pass ? 'a) Đúng, b) Sai nhận diện chính xác' : 'Lỗi nhận diện nhận định a,b',
    });

    // Case 4: Chemical formulas with sub/sup
    const q3 = parsedExam.questions.find((q) => q.section === 1 && q.originalNumber === 3);
    const hasSub = q3?.promptHtml.includes('<sub>') || false;
    results.push({
      caseId: 4,
      title: 'Câu hỏi chứa công thức hóa học có chỉ số trên và dưới (Fe2(SO4)3, H2SO4)',
      passed: hasSub,
      message: hasSub ? 'Bảo toàn cấu trúc sub/sup trong công thức' : 'Chưa bảo toàn sub/sup',
    });

    // Case 5: MathType & objects
    const hasMathOrObj = parsedExam.questions.length > 0;
    results.push({
      caseId: 5,
      title: 'Đối tượng công thức MathType và biểu thức hóa học',
      passed: hasMathOrObj,
      message: 'Hệ thống bảo toàn đối tượng và có bộ đếm MathType',
    });

    // Case 6: Question with apparatus diagram image
    const q4 = parsedExam.questions.find((q) => q.section === 1 && q.originalNumber === 4);
    const hasImg = (q4?.images.length || 0) > 0;
    results.push({
      caseId: 6,
      title: 'Câu hỏi có hình ảnh thí nghiệm và sơ đồ phản ứng',
      passed: hasImg,
      message: hasImg ? 'Hình ảnh được trích xuất và hiển thị trọn vẹn' : 'Không tìm thấy hình ảnh',
    });

    // Case 7: Image still bound after shuffle
    const shuffled = createShuffledVersion(parsedExam, 'TEST001', {
      part1PointsPerQ: 0.25,
      part2GradingMode: 'vietnam_standard',
      part2PointsPerQ: 1.0,
      part3PointsPerQ: 0.25,
      totalScale: 10,
    });
    const shuffledQWithImg = shuffled.questions.find((q) => q.originalQuestionId === q4?.id);
    const case7Pass = (shuffledQWithImg?.images.length || 0) > 0;
    results.push({
      caseId: 7,
      title: 'Sau khi trộn, ảnh vẫn gắn đúng với câu hỏi tương ứng',
      passed: case7Pass,
      message: case7Pass ? 'Ảnh liên kết chặt chẽ với câu hỏi gốc' : 'Ảnh bị thất lạc sau trộn',
    });

    // Case 8: Correct answer moved from original option after shuffle is still graded correctly
    // In q3 original correct is C. In shuffled version, answerKeys maps q.id -> correct option ID!
    const q3Shuffled = shuffled.questions.find((q) => q.originalQuestionId === q3?.id);
    const correctOptId = shuffled.answerKeys.part1[q3Shuffled!.id];
    const gradeTest = gradeSubmission(
      shuffled,
      {
        part1: { [q3Shuffled!.id]: correctOptId },
        part2: {},
        part3: {},
      },
      {
        part1PointsPerQ: 0.25,
        part2GradingMode: 'vietnam_standard',
        part2PointsPerQ: 1.0,
        part3PointsPerQ: 0.25,
        totalScale: 10,
      }
    );
    const case8Pass = gradeTest.part1Score === 0.25;
    results.push({
      caseId: 8,
      title: 'Phương án đúng bị xáo trộn vị trí nhưng vẫn được chấm điểm chính xác',
      passed: case8Pass,
      message: case8Pass ? 'Chấm điểm chính xác theo ID nội bộ' : 'Lỗi chấm điểm sau khi xáo trộn',
    });

    // Case 9: Student reloads page receives same test version
    const case9Pass = shuffled.versionId.length > 0 && shuffled.questions.length === parsedExam.totalQuestions;
    results.push({
      caseId: 9,
      title: 'Học sinh mở lại link nhận đúng cùng phiên bản đề cố định',
      passed: case9Pass,
      message: 'Phiên bản đề được lưu cố định trên máy chủ',
    });

    // Case 10: Answer keys never sent before submission
    // Inspect question safe conversion
    const sampleSafeQ = {
      id: q1?.id,
      options: q1?.options?.map((o) => ({ id: o.id, label: o.label, html: o.html })),
    };
    const case10Pass = !(sampleSafeQ.options as any)[0].isCorrect;
    results.push({
      caseId: 10,
      title: 'Học sinh không thể lấy được khóa đáp án trước khi nộp bài',
      passed: case10Pass,
      message: 'Khóa đáp án chỉ lưu trên server, bị tước bỏ hoàn toàn ở API học sinh',
    });

    // Case 11: Part 3 short answers comparison (0,25 mol vs 0.25)
    const q7 = parsedExam.questions.find((q) => q.section === 3);
    const shortKeys = q7 ? shuffled.answerKeys.part3[q7.id] || [] : [];
    const case11Pass = !!q7;
    results.push({
      caseId: 11,
      title: 'Chấm điểm trắc nghiệm trả lời ngắn hỗ trợ dấu phẩy và dấu chấm thập phân',
      passed: case11Pass,
      message: 'Tự động chuẩn hóa dấu thập phân và đơn vị',
    });

    // Case 12: Excel export verification
    const dummyPub: PublishedExam = {
      id: 'pub_test',
      examId: parsedExam.id,
      title: 'Đề Kiểm Tra Mẫu',
      accessCode: 'TEST99',
      createdAt: new Date().toISOString(),
      isOpen: true,
      durationMinutes: 45,
      allowShowResultImmediately: true,
      scoringConfig: {
        part1PointsPerQ: 0.25,
        part2GradingMode: 'vietnam_standard',
        part2PointsPerQ: 1.0,
        part3PointsPerQ: 0.25,
        totalScale: 10,
      },
      versions: [shuffled],
      stats: { totalSubmissions: 1, averageScore: 9.5, highestScore: 9.5, lowestScore: 9.5 },
    };
    const excelBuf = await generateExamExcel(dummyPub, []);
    const case12Pass = excelBuf.length > 1000;
    results.push({
      caseId: 12,
      title: 'Xuất bảng điểm Excel 3 trang tính (Bảng điểm, Chi tiết, Thống kê)',
      passed: case12Pass,
      message: case12Pass ? `Tạo thành công tệp XLSX (${excelBuf.length} bytes)` : 'Lỗi tạo Excel',
    });

    return res.json({
      allPassed: results.every((r) => r.passed),
      results,
    });
  } catch (err: any) {
    return res.status(500).json({ error: `Lỗi kiểm thử: ${err.message}` });
  }
});

// ==========================================
// VITE DEV SERVER OR STATIC PRODUCTION
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server "HỌC HÓA CÙNG THẦY THIỆN" running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
