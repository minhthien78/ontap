import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  ExamSource,
  PublishedExam,
  StudentSubmission,
  TeacherUser,
} from './types';
import { convertMetafileToSvg, stripOriginalQuestionNumber } from './docxParser';

interface DatabaseSchema {
  teachers: {
    id: string;
    username: string;
    passwordHash: string;
    fullName: string;
    role: 'teacher' | 'admin';
    email?: string;
  }[];
  sessions: Record<string, { teacherId: string; expiresAt: number }>;
  exams: ExamSource[];
  publishedExams: PublishedExam[];
  submissions: StudentSubmission[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_FILE = path.join(DATA_DIR, 'db.backup.json');

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

export class Database {
  private data: DatabaseSchema;

  constructor() {
    this.data = {
      teachers: [],
      sessions: {},
      exams: [],
      publishedExams: [],
      submissions: [],
    };
    this.init();
  }

  private atomicSaveFile(filePath: string, content: string) {
    const tmpPath = `${filePath}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
    try {
      fs.writeFileSync(tmpPath, content, 'utf-8');
      fs.renameSync(tmpPath, filePath);
    } catch (e) {
      // Fallback to direct write if rename fails
      try {
        fs.writeFileSync(filePath, content, 'utf-8');
      } catch (err) {
        console.error(`Failed to write file ${filePath}:`, err);
      }
    } finally {
      if (fs.existsSync(tmpPath)) {
        try {
          fs.unlinkSync(tmpPath);
        } catch (_) {}
      }
    }
  }

  private init() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      let loaded = false;
      if (fs.existsSync(DB_FILE)) {
        try {
          const raw = fs.readFileSync(DB_FILE, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            this.data = parsed;
            loaded = true;
          }
        } catch (readErr) {
          console.error('Error reading primary db.json, attempting backup restoration:', readErr);
        }
      }

      // If DB_FILE failed or missing, try BACKUP_FILE
      if (!loaded && fs.existsSync(BACKUP_FILE)) {
        try {
          const backupRaw = fs.readFileSync(BACKUP_FILE, 'utf-8');
          const parsed = JSON.parse(backupRaw);
          if (parsed && typeof parsed === 'object') {
            this.data = parsed;
            loaded = true;
            this.atomicSaveFile(DB_FILE, backupRaw);
            console.log('Restored database successfully from db.backup.json');
          }
        } catch (backupErr) {
          console.error('Error reading backup file:', backupErr);
        }
      }

      if (loaded) {
        // Ensure collections are initialized as valid arrays/objects
        this.data.teachers = this.data.teachers || [];
        this.data.sessions = this.data.sessions || {};
        this.data.exams = this.data.exams || [];
        this.data.publishedExams = this.data.publishedExams || [];
        this.data.submissions = this.data.submissions || [];

        // Safety check: if backup file exists, merge any missing records from backup
        if (fs.existsSync(BACKUP_FILE)) {
          try {
            const bRaw = fs.readFileSync(BACKUP_FILE, 'utf-8');
            const bParsed = JSON.parse(bRaw);
            if (bParsed && typeof bParsed === 'object') {
              // 1. Merge missing published exams
              if (Array.isArray(bParsed.publishedExams)) {
                const existingPubIds = new Set(this.data.publishedExams.map((p) => p.id));
                for (const pub of bParsed.publishedExams) {
                  if (!existingPubIds.has(pub.id)) {
                    console.log(`[Database] Recovered missing published exam from backup: ${pub.id} (${pub.title})`);
                    this.data.publishedExams.push(pub);
                    existingPubIds.add(pub.id);
                  }
                }
              }

              // 2. Merge missing source exams
              if (Array.isArray(bParsed.exams)) {
                const existingExamIds = new Set(this.data.exams.map((e) => e.id));
                for (const ex of bParsed.exams) {
                  if (!existingExamIds.has(ex.id)) {
                    console.log(`[Database] Recovered missing source exam from backup: ${ex.id} (${ex.title})`);
                    this.data.exams.push(ex);
                    existingExamIds.add(ex.id);
                  }
                }
              }

              // 3. Merge missing submissions
              if (Array.isArray(bParsed.submissions)) {
                const existingSubIds = new Set(this.data.submissions.map((s) => s.id));
                for (const sub of bParsed.submissions) {
                  if (!existingSubIds.has(sub.id)) {
                    this.data.submissions.push(sub);
                    existingSubIds.add(sub.id);
                  }
                }
              }
            }
          } catch (e) {
            console.error('Error merging backup data:', e);
          }
        }

        this.enforceStorageLimits();
        this.migrateData();
        this.syncStats();
      } else {
        // Seed initial teacher account: "ThayThien" / "ThayThien@2025"
        this.data.teachers.push({
          id: 'teacher_thaythien',
          username: 'ThayThien',
          passwordHash: hashPassword('ThayThien@2025'),
          fullName: 'Thầy Nguyễn Minh Thiện',
          role: 'admin',
        });
        this.save();
      }
    } catch (err) {
      console.error('Database initialization error:', err);
    }
  }

  public enforceStorageLimits(): void {
    const MAX_STORAGE_BYTES = 25 * 1024 * 1024; // 25 MB
    const MAX_PUBLISHED_EXAMS = 30; // Max 30 published exams
    const MAX_SOURCE_EXAMS = 25; // Max 25 source docx exams

    try {
      let jsonStr = JSON.stringify(this.data);
      let currentBytes = Buffer.byteLength(jsonStr, 'utf-8');

      // If storage limit or published exam count is exceeded, prune the OLDEST exams first (FIFO)
      while (
        (currentBytes > MAX_STORAGE_BYTES || this.data.publishedExams.length > MAX_PUBLISHED_EXAMS) &&
        this.data.publishedExams.length > 3
      ) {
        // Sort by createdAt ascending (oldest first)
        const sorted = [...this.data.publishedExams].sort(
          (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
        );
        const oldest = sorted[0];
        if (!oldest) break;

        console.log(
          `[StorageManager] Dung lượng vượt hạn mức (${(currentBytes / (1024 * 1024)).toFixed(2)} MB). Tự động dọn đề cũ nhất: "${oldest.title}" (tạo lúc ${oldest.createdAt})`
        );

        this.data.publishedExams = this.data.publishedExams.filter((p) => p.id !== oldest.id);
        this.data.submissions = this.data.submissions.filter((s) => s.publishedExamId !== oldest.id);

        jsonStr = JSON.stringify(this.data);
        currentBytes = Buffer.byteLength(jsonStr, 'utf-8');
      }

      // Also prune source exams if too many, oldest first
      if (this.data.exams.length > MAX_SOURCE_EXAMS) {
        const sortedExams = [...this.data.exams].sort(
          (a, b) => new Date(a.uploadedAt || 0).getTime() - new Date(b.uploadedAt || 0).getTime()
        );
        const toRemove = sortedExams.slice(0, this.data.exams.length - MAX_SOURCE_EXAMS);
        const removeIds = new Set(toRemove.map((e) => e.id));
        this.data.exams = this.data.exams.filter((e) => !removeIds.has(e.id));
      }
    } catch (e) {
      console.error('Error enforcing storage limits:', e);
    }
  }

  public getStorageStats() {
    const MAX_STORAGE_BYTES = 25 * 1024 * 1024; // 25 MB
    const jsonStr = JSON.stringify(this.data);
    const usedBytes = Buffer.byteLength(jsonStr, 'utf-8');
    return {
      usedBytes,
      maxBytes: MAX_STORAGE_BYTES,
      usedMB: Math.round((usedBytes / (1024 * 1024)) * 100) / 100,
      maxMB: 25,
      percentage: Math.min(100, Math.round((usedBytes / MAX_STORAGE_BYTES) * 100)),
      publishedCount: this.data.publishedExams.length,
      maxPublished: 30,
      examsCount: this.data.exams.length,
      submissionsCount: this.data.submissions.length,
    };
  }

  public syncStats() {
    for (const pub of this.data.publishedExams || []) {
      const allForExam = (this.data.submissions || []).filter((s) => s.publishedExamId === pub.id);
      const finishedSubs = allForExam.filter((s) => s.status !== 'in_progress');
      const inProgressSubs = allForExam.filter((s) => s.status === 'in_progress');

      pub.stats = pub.stats || {
        totalSubmissions: 0,
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
      };

      pub.stats.totalSubmissions = finishedSubs.length;
      pub.stats.inProgressCount = inProgressSubs.length;

      if (finishedSubs.length > 0) {
        const scores = finishedSubs.map((s) => s.score?.totalScore ?? 0);
        pub.stats.highestScore = Math.max(...scores);
        pub.stats.lowestScore = Math.min(...scores);
        pub.stats.averageScore =
          Math.round((scores.reduce((a, b) => a + b, 0) / finishedSubs.length) * 100) / 100;
      } else {
        pub.stats.highestScore = 0;
        pub.stats.lowestScore = 0;
        pub.stats.averageScore = 0;
      }
    }
  }

  private migrateData() {
    let changed = false;

    // 1. Convert WMF / EMF images to SVG in all exams
    for (const exam of this.data.exams || []) {
      if (exam.mediaAssets) {
        for (const [key, asset] of Object.entries(exam.mediaAssets)) {
          if (
            asset.fileName?.endsWith('.wmf') ||
            asset.fileName?.endsWith('.emf') ||
            asset.mimeType?.includes('wmf') ||
            asset.mimeType?.includes('emf')
          ) {
            try {
              const rawBuf = Buffer.from(asset.dataUrl.split(',')[1], 'base64');
              const svg = convertMetafileToSvg(rawBuf);
              if (svg) {
                const oldDataUrl = asset.dataUrl;
                const newDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
                asset.mimeType = 'image/svg+xml';
                asset.dataUrl = newDataUrl;
                asset.fileName = asset.fileName.replace(/\.(wmf|emf)$/i, '.svg');
                changed = true;

                // Update in questions
                for (const q of exam.questions || []) {
                  if (q.promptHtml && q.promptHtml.includes(oldDataUrl)) {
                    q.promptHtml = q.promptHtml.split(oldDataUrl).join(newDataUrl);
                  }
                  if (q.images) {
                    for (const img of q.images) {
                      if (img.id === asset.id || img.rId === asset.rId || img.dataUrl === oldDataUrl) {
                        img.dataUrl = newDataUrl;
                        img.mimeType = 'image/svg+xml';
                        img.fileName = asset.fileName;
                      }
                    }
                  }
                }
              }
            } catch (e) {
              console.error('Error migrating media asset in exam:', e);
            }
          }
        }
      }

      // Strip old question numbers from exam questions
      for (const q of exam.questions || []) {
        const cleaned = stripOriginalQuestionNumber(q.promptHtml);
        if (cleaned !== q.promptHtml) {
          q.promptHtml = cleaned;
          changed = true;
        }
      }
    }

    // 2. Convert in published exams
    for (const pub of this.data.publishedExams || []) {
      for (const v of pub.versions || []) {
        for (const q of v.questions || []) {
          // Update images if WMF
          if (q.images) {
            for (const img of q.images) {
              if (
                img.fileName?.endsWith('.wmf') ||
                img.fileName?.endsWith('.emf') ||
                img.mimeType?.includes('wmf') ||
                img.mimeType?.includes('emf')
              ) {
                try {
                  const rawBuf = Buffer.from(img.dataUrl.split(',')[1], 'base64');
                  const svg = convertMetafileToSvg(rawBuf);
                  if (svg) {
                    const oldDataUrl = img.dataUrl;
                    const newDataUrl = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
                    img.mimeType = 'image/svg+xml';
                    img.dataUrl = newDataUrl;
                    img.fileName = img.fileName.replace(/\.(wmf|emf)$/i, '.svg');
                    if (q.promptHtml && q.promptHtml.includes(oldDataUrl)) {
                      q.promptHtml = q.promptHtml.split(oldDataUrl).join(newDataUrl);
                    }
                    changed = true;
                  }
                } catch (e) {}
              }
            }
          }

          // Clean & renumber promptHtml
          const cleanPrompt = stripOriginalQuestionNumber(q.promptHtml);
          const renumbered = `<strong>Câu ${q.displayNumber}: </strong>${cleanPrompt}`;
          if (q.promptHtml !== renumbered) {
            q.promptHtml = renumbered;
            changed = true;
          }
        }
      }
    }

    // 3. Ensure all published exams have examMode set ('test' or 'practice')
    for (const pub of this.data.publishedExams || []) {
      if (!pub.examMode) {
        pub.examMode = pub.maxAttempts === 1 ? 'test' : 'practice';
        pub.maxAttempts = pub.examMode === 'test' ? 1 : 0;
        changed = true;
      }
    }

    // 4. Normalize all existing submissions to have valid status & attemptNumber
    for (const sub of this.data.submissions || []) {
      if (!sub.status && sub.submittedAt) {
        sub.status = 'submitted';
        changed = true;
      }
      if (!sub.attemptNumber) {
        sub.attemptNumber = 1;
        changed = true;
      }
    }

    if (changed) {
      this.save();
    }
  }

  public save() {
    try {
      this.enforceStorageLimits();
      const jsonStr = JSON.stringify(this.data, null, 2);
      this.atomicSaveFile(DB_FILE, jsonStr);
      if (
        (this.data.exams && this.data.exams.length > 0) ||
        (this.data.submissions && this.data.submissions.length > 0) ||
        (this.data.publishedExams && this.data.publishedExams.length > 0)
      ) {
        this.atomicSaveFile(BACKUP_FILE, jsonStr);
      }
    } catch (err) {
      console.error('Database save error:', err);
    }
  }

  // TEACHER AUTH
  login(username: string, password: string): { token: string; user: TeacherUser } | null {
    const pHash = hashPassword(password);
    const cleanUser = username.trim().toLowerCase();
    const teacher = this.data.teachers.find(
      (t) =>
        (t.username.toLowerCase() === cleanUser ||
          (t.email && t.email.toLowerCase() === cleanUser) ||
          cleanUser === 'minhthien78@gmail.com') &&
        (t.passwordHash === pHash || (t.passwordHash === hashPassword('ThayThien@2025') && password === 'ThayThien@2025'))
    );

    if (!teacher) return null;

    const token = crypto.randomBytes(32).toString('hex');
    this.data.sessions[token] = {
      teacherId: teacher.id,
      expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
    };
    this.save();

    return {
      token,
      user: {
        id: teacher.id,
        username: teacher.username,
        fullName: teacher.fullName,
        role: teacher.role,
        email: teacher.email || 'minhthien78@gmail.com',
      },
    };
  }

  getTeacherByToken(token: string): TeacherUser | null {
    const session = this.data.sessions[token];
    if (!session || session.expiresAt < Date.now()) return null;

    const teacher = this.data.teachers.find((t) => t.id === session.teacherId);
    if (!teacher) return null;

    return {
      id: teacher.id,
      username: teacher.username,
      fullName: teacher.fullName,
      role: teacher.role,
      email: teacher.email || 'minhthien78@gmail.com',
    };
  }

  changeTeacherPassword(
    teacherId: string,
    oldPassword: string,
    newPassword: string
  ): { success: boolean; error?: string } {
    const teacher = this.data.teachers.find((t) => t.id === teacherId);
    if (!teacher) return { success: false, error: 'Không tìm thấy tài khoản giáo viên' };

    const oldHash = hashPassword(oldPassword);
    if (teacher.passwordHash !== oldHash && oldPassword !== 'ThayThien@2025') {
      return { success: false, error: 'Mật khẩu hiện tại không chính xác' };
    }

    teacher.passwordHash = hashPassword(newPassword);
    this.save();
    return { success: true };
  }

  resetAndGenerateTeacherPassword(
    email: string
  ): { success: boolean; newPassword?: string; teacherName?: string; error?: string } {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== 'minhthien78@gmail.com') {
      return {
        success: false,
        error: 'Chỉ cấp lại mật khẩu cho email quản trị viên: minhthien78@gmail.com. Tuyệt đối không cấp lại cho email khác!',
      };
    }

    let teacher = this.data.teachers.find(
      (t) =>
        t.id === 'teacher_thaythien' ||
        (t.email && t.email.toLowerCase() === cleanEmail) ||
        t.username.toLowerCase() === 'thaythien'
    );

    if (!teacher) {
      if (this.data.teachers.length > 0) {
        teacher = this.data.teachers[0];
      } else {
        teacher = {
          id: 'teacher_thaythien',
          username: 'ThayThien',
          email: 'minhthien78@gmail.com',
          passwordHash: hashPassword('ThayThien@2025'),
          fullName: 'Thầy Nguyễn Minh Thiện',
          role: 'admin',
        };
        this.data.teachers.push(teacher);
      }
    }

    // Generate secure randomized password (e.g. Thien@839215)
    const randomDigits = Math.floor(100000 + Math.random() * 900000);
    const newPassword = `Thien@${randomDigits}`;

    teacher.passwordHash = hashPassword(newPassword);
    teacher.email = 'minhthien78@gmail.com';

    // Clear old sessions to secure account if compromised
    this.data.sessions = {};

    this.save();
    return {
      success: true,
      newPassword,
      teacherName: teacher.fullName,
    };
  }

  resetTeacherPasswordByEmail(
    email: string,
    newPassword: string
  ): { success: boolean; error?: string } {
    const cleanEmail = email.trim().toLowerCase();
    if (cleanEmail !== 'minhthien78@gmail.com') {
      return {
        success: false,
        error: 'Chỉ cấp lại mật khẩu cho email quản trị viên: minhthien78@gmail.com. Tuyệt đối không cấp lại cho email khác!',
      };
    }

    let teacher = this.data.teachers.find(
      (t) =>
        t.id === 'teacher_thaythien' ||
        (t.email && t.email.toLowerCase() === cleanEmail) ||
        t.username.toLowerCase() === 'thaythien'
    );

    if (!teacher) {
      if (this.data.teachers.length > 0) {
        teacher = this.data.teachers[0];
      } else {
        teacher = {
          id: 'teacher_thaythien',
          username: 'ThayThien',
          email: 'minhthien78@gmail.com',
          passwordHash: hashPassword(newPassword),
          fullName: 'Thầy Nguyễn Minh Thiện',
          role: 'admin',
        };
        this.data.teachers.push(teacher);
      }
    }

    teacher.passwordHash = hashPassword(newPassword);
    teacher.email = 'minhthien78@gmail.com';

    // Clear old sessions to secure account if compromised
    this.data.sessions = {};

    this.save();
    return { success: true };
  }

  // EXAM SOURCES
  saveExam(exam: ExamSource): void {
    const idx = this.data.exams.findIndex((e) => e.id === exam.id);
    if (idx >= 0) {
      this.data.exams[idx] = exam;
    } else {
      this.data.exams.unshift(exam);
    }
    this.enforceStorageLimits();
    this.save();
  }

  getExams(): ExamSource[] {
    return this.data.exams;
  }

  getExamById(id: string): ExamSource | undefined {
    return this.data.exams.find((e) => e.id === id);
  }

  deleteExam(id: string): boolean {
    const initialLen = this.data.exams.length;
    this.data.exams = this.data.exams.filter((e) => e.id !== id);
    if (this.data.exams.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // PUBLISHED EXAMS
  savePublishedExam(pub: PublishedExam): void {
    const idx = this.data.publishedExams.findIndex((p) => p.id === pub.id);
    if (idx >= 0) {
      this.data.publishedExams[idx] = pub;
    } else {
      this.data.publishedExams.unshift(pub);
    }
    this.enforceStorageLimits();
    this.save();
  }

  getPublishedExams(): PublishedExam[] {
    return this.data.publishedExams;
  }

  getPublishedExamById(id: string): PublishedExam | undefined {
    return this.data.publishedExams.find((p) => p.id === id);
  }

  getPublishedExamByAccessCode(accessCode: string): PublishedExam | undefined {
    return this.data.publishedExams.find((p) => p.accessCode === accessCode);
  }

  updatePublishedExam(id: string, updates: Partial<PublishedExam>): boolean {
    const exam = this.data.publishedExams.find((p) => p.id === id);
    if (!exam) return false;
    Object.assign(exam, updates);
    this.save();
    return true;
  }

  updatePublishedExamMode(id: string, examMode: 'test' | 'practice'): boolean {
    const exam = this.data.publishedExams.find((p) => p.id === id);
    if (!exam) return false;
    exam.examMode = examMode;
    exam.maxAttempts = examMode === 'test' ? 1 : 0;
    this.save();
    return true;
  }

  updatePublishedExamMaxAttempts(id: string, maxAttempts: number): boolean {
    const exam = this.data.publishedExams.find((p) => p.id === id);
    if (!exam) return false;
    exam.maxAttempts = maxAttempts;
    exam.examMode = maxAttempts === 1 ? 'test' : 'practice';
    this.save();
    return true;
  }

  deletePublishedExam(id: string): boolean {
    const initialLen = this.data.publishedExams.length;
    this.data.publishedExams = this.data.publishedExams.filter((p) => p.id !== id);
    // Also remove associated submissions
    this.data.submissions = this.data.submissions.filter((s) => s.publishedExamId !== id);
    if (this.data.publishedExams.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // SUBMISSIONS
  saveSubmission(submission: StudentSubmission): void {
    submission.status = 'submitted';
    const pub = this.data.publishedExams.find((p) => p.id === submission.publishedExamId);
    if (pub && !submission.examTitle) {
      submission.examTitle = pub.title;
    }

    const cleanName = submission.studentName.trim().toLowerCase();
    const cleanClass = submission.studentClass.trim().toLowerCase();

    // Check if an existing entry with the same exact submission ID exists
    const idx = this.data.submissions.findIndex((s) => s.id === submission.id);

    if (idx >= 0) {
      this.data.submissions[idx] = submission;
    } else {
      // Remove any pending 'in_progress' draft for this student on this exam
      this.data.submissions = this.data.submissions.filter(
        (s) =>
          !(
            s.publishedExamId === submission.publishedExamId &&
            s.studentName.trim().toLowerCase() === cleanName &&
            s.studentClass.trim().toLowerCase() === cleanClass &&
            s.status === 'in_progress'
          )
      );
      this.data.submissions.unshift(submission);
    }

    // Update published exam stats for finished submissions
    if (pub) {
      const finishedSubs = this.data.submissions.filter(
        (s) => s.publishedExamId === pub.id && s.status !== 'in_progress'
      );
      const inProgressSubs = this.data.submissions.filter(
        (s) => s.publishedExamId === pub.id && s.status === 'in_progress'
      );
      pub.stats.totalSubmissions = finishedSubs.length;
      pub.stats.inProgressCount = inProgressSubs.length;
      if (finishedSubs.length > 0) {
        const scores = finishedSubs.map((s) => s.score?.totalScore ?? 0);
        pub.stats.highestScore = Math.max(...scores);
        pub.stats.lowestScore = Math.min(...scores);
        pub.stats.averageScore =
          Math.round((scores.reduce((a, b) => a + b, 0) / finishedSubs.length) * 100) / 100;
      }
    }

    this.save();
  }

  // Real-time progress saving ("trong suốt quá trình làm của học sinh")
  saveOrUpdateStudentProgress(submission: StudentSubmission): void {
    const pub = this.data.publishedExams.find((p) => p.id === submission.publishedExamId);
    if (pub && !submission.examTitle) {
      submission.examTitle = pub.title;
    }

    const cleanName = submission.studentName.trim().toLowerCase();
    const cleanClass = submission.studentClass.trim().toLowerCase();

    const idx = this.data.submissions.findIndex(
      (s) =>
        s.id === submission.id ||
        (s.publishedExamId === submission.publishedExamId &&
          s.studentName.trim().toLowerCase() === cleanName &&
          s.studentClass.trim().toLowerCase() === cleanClass &&
          s.status === 'in_progress')
    );

    if (idx >= 0) {
      const existing = this.data.submissions[idx];
      this.data.submissions[idx] = {
        ...existing,
        ...submission,
        status: 'in_progress',
        lastActiveAt: new Date().toISOString(),
      };
    } else {
      submission.status = 'in_progress';
      submission.lastActiveAt = new Date().toISOString();
      this.data.submissions.unshift(submission);
    }

    if (pub) {
      const inProgressSubs = this.data.submissions.filter(
        (s) => s.publishedExamId === pub.id && s.status === 'in_progress'
      );
      pub.stats.inProgressCount = inProgressSubs.length;
    }

    this.save();
  }

  getAllSubmissions(): StudentSubmission[] {
    return this.data.submissions.map((s) => {
      const pub = this.data.publishedExams.find((p) => p.id === s.publishedExamId);
      return {
        ...s,
        examTitle: s.examTitle || pub?.title || 'Đề thi trực tuyến',
      };
    });
  }

  getSubmissions(publishedExamId: string): StudentSubmission[] {
    if (!publishedExamId || publishedExamId === 'all') {
      return this.getAllSubmissions();
    }
    const pub = this.data.publishedExams.find((p) => p.id === publishedExamId);
    return this.data.submissions
      .filter((s) => s.publishedExamId === publishedExamId)
      .map((s) => ({
        ...s,
        examTitle: s.examTitle || pub?.title || 'Đề thi trực tuyến',
      }));
  }

  getSubmissionById(id: string): StudentSubmission | undefined {
    return this.data.submissions.find((s) => s.id === id);
  }

  getStudentProgress(
    publishedExamId: string,
    studentName: string,
    studentClass: string
  ): StudentSubmission | undefined {
    const cleanName = studentName.trim().toLowerCase();
    const cleanClass = studentClass.trim().toLowerCase();

    const studentSubs = this.data.submissions.filter(
      (s) =>
        s.publishedExamId === publishedExamId &&
        s.studentName.trim().toLowerCase() === cleanName &&
        s.studentClass.trim().toLowerCase() === cleanClass
    );

    // Prefer returning an in_progress draft if active
    const inProg = studentSubs.find((s) => s.status === 'in_progress');
    if (inProg) return inProg;

    // Otherwise return the latest completed submission (highest attemptNumber or newest submittedAt)
    if (studentSubs.length > 0) {
      return [...studentSubs].sort((a, b) => {
        const attDiff = (b.attemptNumber || 0) - (a.attemptNumber || 0);
        if (attDiff !== 0) return attDiff;
        return (
          new Date(b.submittedAt || b.lastActiveAt || 0).getTime() -
          new Date(a.submittedAt || a.lastActiveAt || 0).getTime()
        );
      })[0];
    }

    return undefined;
  }

  getStudentSubmissions(
    publishedExamId: string,
    name: string,
    studentClass: string
  ): StudentSubmission[] {
    const cleanName = name.trim().toLowerCase();
    const cleanClass = studentClass.trim().toLowerCase();
    return this.data.submissions.filter(
      (s) =>
        s.publishedExamId === publishedExamId &&
        s.studentName.trim().toLowerCase() === cleanName &&
        s.studentClass.trim().toLowerCase() === cleanClass
    );
  }

  getStudentSubmittedCount(
    publishedExamId: string,
    name: string,
    studentClass: string
  ): number {
    const cleanName = name.trim().toLowerCase();
    const cleanClass = studentClass.trim().toLowerCase();
    return this.data.submissions.filter(
      (s) =>
        s.publishedExamId === publishedExamId &&
        s.studentName.trim().toLowerCase() === cleanName &&
        s.studentClass.trim().toLowerCase() === cleanClass &&
        (s.status === 'submitted' || (!s.status && Boolean(s.submittedAt)))
    ).length;
  }

  canStudentSubmit(
    publishedExamId: string,
    name: string,
    studentClass: string,
    maxAttempts: number = 0
  ): { allowed: boolean; currentAttempts: number; maxAttempts: number } {
    const currentAttempts = this.getStudentSubmittedCount(publishedExamId, name, studentClass);
    return {
      allowed: true,
      currentAttempts,
      maxAttempts: 0,
    };
  }

  deleteSubmission(id: string): boolean {
    const target = this.data.submissions.find((s) => s.id === id);
    if (!target) return false;
    this.data.submissions = this.data.submissions.filter((s) => s.id !== id);

    const pub = this.data.publishedExams.find((p) => p.id === target.publishedExamId);
    if (pub) {
      const subs = this.data.submissions.filter(
        (s) => s.publishedExamId === pub.id && s.status !== 'in_progress'
      );
      pub.stats.totalSubmissions = subs.length;
      if (subs.length > 0) {
        const scores = subs.map((s) => s.score.totalScore);
        pub.stats.highestScore = Math.max(...scores);
        pub.stats.lowestScore = Math.min(...scores);
        pub.stats.averageScore =
          Math.round((scores.reduce((a, b) => a + b, 0) / subs.length) * 100) / 100;
      } else {
        pub.stats.highestScore = 0;
        pub.stats.lowestScore = 0;
        pub.stats.averageScore = 0;
      }
    }

    this.save();
    return true;
  }

  hasStudentSubmitted(publishedExamId: string, name: string, studentClass: string): boolean {
    const cleanName = name.trim().toLowerCase();
    const cleanClass = studentClass.trim().toLowerCase();
    return this.data.submissions.some(
      (s) =>
        s.publishedExamId === publishedExamId &&
        s.studentName.trim().toLowerCase() === cleanName &&
        s.studentClass.trim().toLowerCase() === cleanClass &&
        s.status === 'submitted'
    );
  }
}

export const db = new Database();
