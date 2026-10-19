import {
  ExamSource,
  PublishedExam,
  ScoringConfig,
  StudentSubmission,
  TeacherUser,
} from './types';

const TOKEN_KEY = 'hhct_teacher_token';

export const authStorage = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  setToken: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clearToken: () => localStorage.removeItem(TOKEN_KEY),
};

function getHeaders(isFormData = false): HeadersInit {
  const headers: Record<string, string> = {};
  if (!isFormData) {
    headers['Content-Type'] = 'application/json';
  }
  const token = authStorage.getToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

export const api = {
  // Auth
  async login(username: string, password: string): Promise<{ token: string; user: TeacherUser }> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Đăng nhập thất bại');
    authStorage.setToken(data.token);
    return data;
  },

  async getMe(): Promise<{ user: TeacherUser } | null> {
    const token = authStorage.getToken();
    if (!token) return null;
    const res = await fetch('/api/auth/me', {
      headers: getHeaders(),
    });
    if (!res.ok) {
      authStorage.clearToken();
      return null;
    }
    return res.json();
  },

  async changePassword(
    oldPassword: string,
    newPassword: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ oldPassword, newPassword }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Đổi mật khẩu thất bại');
    return data;
  },

  async resetPassword(
    email: string
  ): Promise<{ success: boolean; message: string }> {
    const res = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Cấp lại mật khẩu thất bại');
    return data;
  },

  // Exam upload & creation
  async uploadDocx(file: File): Promise<{ success: boolean; exam: ExamSource; message: string }> {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch('/api/exams/upload', {
      method: 'POST',
      headers: {
        ...(authStorage.getToken() ? { Authorization: `Bearer ${authStorage.getToken()}` } : {}),
      },
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi tải tệp DOCX');
    return data;
  },

  async createSampleExam(): Promise<{ success: boolean; exam: ExamSource; message: string }> {
    const res = await fetch('/api/exams/create-sample', {
      method: 'POST',
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi tạo đề mẫu');
    return data;
  },

  getSampleDocxDownloadUrl(): string {
    return '/api/download-sample-docx';
  },

  async getExams(): Promise<{ exams: ExamSource[] }> {
    const res = await fetch('/api/exams', { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi tải danh sách đề');
    return data;
  },

  async getExamById(id: string): Promise<{ exam: ExamSource }> {
    const res = await fetch(`/api/exams/${id}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi tải đề thi');
    return data;
  },

  async updateQuestion(
    examId: string,
    qId: string,
    body: any
  ): Promise<{ success: boolean; question: any; exam: ExamSource }> {
    const res = await fetch(`/api/exams/${examId}/questions/${qId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật câu hỏi');
    return data;
  },

  async deleteExam(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/exams/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi xóa đề');
    return data;
  },

  // Shuffling & Publishing
  async shuffleAndPublish(
    examId: string,
    payload: {
      numVersions: number;
      codePrefix: string;
      durationMinutes: number;
      scoringConfig: ScoringConfig;
      allowShowResultImmediately: boolean;
      examMode?: 'test' | 'practice';
      maxAttempts?: number;
    }
  ): Promise<{ success: boolean; publishedExam: PublishedExam; message: string }> {
    const res = await fetch(`/api/exams/${examId}/shuffle`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi trộn đề thi');
    return data;
  },

  async getPublishedExams(): Promise<{ publishedExams: PublishedExam[] }> {
    const res = await fetch('/api/published-exams', { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi tải danh sách đề phát hành');
    return data;
  },

  async getPublishedExam(id: string): Promise<{ publishedExam: PublishedExam }> {
    const res = await fetch(`/api/published-exams/${id}`, { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi tải chi tiết đề phát hành');
    return data;
  },

  async toggleExamStatus(id: string, isOpen: boolean): Promise<{ success: boolean; isOpen: boolean }> {
    const res = await fetch(`/api/published-exams/${id}/status`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ isOpen }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi thay đổi trạng thái đề thi');
    return data;
  },

  async updatePublishedExamMode(
    id: string,
    examMode: 'test' | 'practice'
  ): Promise<{ success: boolean; examMode: 'test' | 'practice'; maxAttempts: number }> {
    const res = await fetch(`/api/published-exams/${id}/max-attempts`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ examMode, maxAttempts: examMode === 'test' ? 1 : 0 }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật hình thức thi');
    return data;
  },

  async updatePublishedExamMaxAttempts(
    id: string,
    maxAttempts: number
  ): Promise<{ success: boolean; maxAttempts: number }> {
    const res = await fetch(`/api/published-exams/${id}/max-attempts`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ maxAttempts }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật số lần làm bài');
    return data;
  },

  async getStorageStats(): Promise<{
    success: boolean;
    stats: {
      usedBytes: number;
      maxBytes: number;
      usedMB: number;
      maxMB: number;
      percentage: number;
      publishedCount: number;
      maxPublished: number;
      examsCount: number;
      submissionsCount: number;
    };
  }> {
    const res = await fetch('/api/system/storage', { headers: getHeaders() });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi kiểm tra dung lượng lưu trữ');
    return data;
  },

  async updatePublishedExamScoring(
    id: string,
    payload: {
      scoringMode: 'equal_all' | 'custom_sections' | 'vietnam_standard';
      part1TotalPoints?: number;
      part2TotalPoints?: number;
      part3TotalPoints?: number;
      part2GradingMode?: 'vietnam_standard' | 'equal_per_statement';
    }
  ): Promise<{ success: boolean; publishedExam: PublishedExam; newScoringConfig: ScoringConfig; submissionsCount: number }> {
    const res = await fetch(`/api/published-exams/${id}/scoring`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi cập nhật cấu hình điểm');
    return data;
  },

  async deletePublishedExam(id: string): Promise<{ success: boolean }> {
    const res = await fetch(`/api/published-exams/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi xóa đề thi phát hành');
    return data;
  },

  // Student Online Exam
  async getStudentExam(accessCode: string): Promise<{
    publishedExamId: string;
    versionId: string;
    testCode: string;
    title: string;
    durationMinutes: number;
    isOpen: boolean;
    examMode?: 'test' | 'practice';
    maxAttempts?: number;
    questions: any[];
    scoringConfig?: ScoringConfig;
  }> {
    const res = await fetch(`/api/student/exam/${accessCode}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Không thể tải đề thi học sinh');
    return data;
  },

  async submitStudentExam(
    accessCode: string,
    payload: {
      versionId: string;
      studentName: string;
      studentClass: string;
      startedAt: string;
      answers: any;
    }
  ): Promise<any> {
    const res = await fetch(`/api/student/exam/${accessCode}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi nộp bài');
    return data;
  },

  async saveStudentProgress(
    accessCode: string,
    payload: {
      versionId: string;
      studentName: string;
      studentClass: string;
      startedAt: string;
      answers: any;
    }
  ): Promise<{ success: boolean; interimScore: number; correctCount: number; attemptNumber?: number }> {
    const res = await fetch(`/api/student/exam/${accessCode}/progress`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi lưu tiến trình');
    return data;
  },

  async getStudentProgress(
    accessCode: string,
    studentName: string,
    studentClass: string
  ): Promise<{
    progress: StudentSubmission | null;
    submittedCount?: number;
    examMode?: 'test' | 'practice';
    maxAttempts?: number;
    canSubmit?: boolean;
  }> {
    const params = new URLSearchParams({ studentName, studentClass });
    const res = await fetch(`/api/student/exam/${accessCode}/progress?${params.toString()}`);
    const data = await res.json();
    return data;
  },

  async getSubmissionResult(submissionId: string): Promise<{ submission: any }> {
    const res = await fetch(`/api/student/submission/${submissionId}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi tải kết quả bài làm');
    return data;
  },

  // Teacher Submissions & Stats
  async getSubmissions(publishedExamId: string): Promise<{
    submissions: StudentSubmission[];
    stats: any;
  }> {
    const res = await fetch(`/api/published-exams/${publishedExamId}/submissions`, {
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi tải bảng điểm học sinh');
    return data;
  },

  async getAllSubmissions(): Promise<{
    submissions: StudentSubmission[];
    total: number;
  }> {
    const res = await fetch('/api/submissions', {
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi tải tất cả bảng điểm');
    return data;
  },

  async deleteSubmission(id: string): Promise<{ success: boolean; message: string }> {
    const res = await fetch(`/api/submissions/${id}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi xóa bài làm');
    return data;
  },

  // Verification Test Suite
  async runVerification(): Promise<{ allPassed: boolean; results: any[] }> {
    const res = await fetch('/api/test/run-verification');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Lỗi chạy kiểm thử hệ thống');
    return data;
  },
};
