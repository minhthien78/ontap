import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { DocxUploadZone } from './components/DocxUploadZone';
import { ExamAnalysisView } from './components/ExamAnalysisView';
import { ShuffleModal } from './components/ShuffleModal';
import { PublishedExamsView } from './components/PublishedExamsView';
import { TeacherResultsView } from './components/TeacherResultsView';
import { TestSuiteView } from './components/TestSuiteView';
import { TeacherLoginModal } from './components/TeacherLoginModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { StudentExamView } from './components/StudentExamView';
import { StudentPortalView } from './components/StudentPortalView';
import { ExamSource, PublishedExam, TeacherUser } from './types';
import { api, authStorage } from './api';

export function App() {
  // Check URL query parameters for student exam access
  const urlParams = new URLSearchParams(window.location.search);
  const rawExamCode = urlParams.get('exam');
  const examCodeFromUrl = rawExamCode ? rawExamCode.trim().toUpperCase() : null;

  const [studentAccessCode, setStudentAccessCode] = useState<string | null>(examCodeFromUrl);

  // App navigation state with localStorage restoration
  const [currentTab, setCurrentTab] = useState<'upload' | 'published' | 'results' | 'test-suite'>(() => {
    return (localStorage.getItem('hhct_current_tab') as any) || 'upload';
  });

  const handleSelectTab = (tab: 'upload' | 'published' | 'results' | 'test-suite') => {
    setCurrentTab(tab);
    try {
      localStorage.setItem('hhct_current_tab', tab);
    } catch (e) {}
  };

  // Teacher Auth state
  const [teacher, setTeacher] = useState<TeacherUser | null>(null);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);

  // Exam state
  const [currentExam, setCurrentExam] = useState<ExamSource | null>(null);
  const [allExams, setAllExams] = useState<ExamSource[]>([]);
  const [publishedExams, setPublishedExams] = useState<PublishedExam[]>([]);
  const [selectedResultExamId, setSelectedResultExamId] = useState<string>(() => {
    return localStorage.getItem('hhct_selected_result_exam_id') || 'all';
  });

  // Shuffle Modal
  const [isShuffleModalOpen, setIsShuffleModalOpen] = useState(false);

  // Initial load
  useEffect(() => {
    // Check teacher session
    api.getMe().then((res) => {
      if (res?.user) {
        setTeacher(res.user);
        loadExams();
      }
    });

    // Load published exams for student portal or teacher view
    loadPublishedExams();
  }, []);

  const loadExams = async () => {
    try {
      const res = await api.getExams();
      setAllExams(res.exams);
      if (res.exams.length > 0 && !currentExam) {
        setCurrentExam(res.exams[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadPublishedExams = async () => {
    try {
      const res = await api.getPublishedExams();
      setPublishedExams(res.publishedExams);

      const saved = localStorage.getItem('hhct_selected_result_exam_id');
      if (saved && (saved === 'all' || res.publishedExams.some((e) => e.id === saved))) {
        setSelectedResultExamId(saved);
      } else {
        setSelectedResultExamId('all');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    authStorage.clearToken();
    setTeacher(null);
    setCurrentExam(null);
    setAllExams([]);
    loadPublishedExams();
  };

  const handleLoginSuccess = (user: TeacherUser) => {
    setTeacher(user);
    loadExams();
    loadPublishedExams();
  };

  // If a student opens the link directly or enters exam room
  if (studentAccessCode) {
    return (
      <StudentExamView
        accessCode={studentAccessCode}
        onExit={() => {
          setStudentAccessCode(null);
          window.history.replaceState({}, '', window.location.pathname);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-gray-900 font-sans selection:bg-blue-100 selection:text-blue-900">
      {/* Top Header */}
      <Header
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        teacher={teacher}
        onOpenLogin={() => setIsLoginModalOpen(true)}
        onLogout={handleLogout}
        onOpenChangePassword={() => setIsChangePasswordModalOpen(true)}
        onStudentEnterCode={(code) => setStudentAccessCode(code)}
      />

      {/* Main Content Body: Teacher Control Panel IF Logged In, otherwise Student Portal */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-6 sm:py-8 space-y-6">
        {!teacher ? (
          /* GUEST / STUDENT VIEW: Can only take exams, cannot edit or control app */
          <StudentPortalView
            publishedExams={publishedExams}
            onEnterExam={(code) => setStudentAccessCode(code)}
            onOpenTeacherLogin={() => setIsLoginModalOpen(true)}
          />
        ) : (
          /* TEACHER CONTROL PANEL: Unlocked only after teacher logs in */
          <>
            {/* TAB 1: UPLOAD DOCX & ANALYZE EXAM */}
            {currentTab === 'upload' && (
              <div className="space-y-6">
                <DocxUploadZone
                  currentExam={currentExam}
                  onExamParsed={(exam) => {
                    setCurrentExam(exam);
                    loadExams();
                  }}
                  onClearExam={() => setCurrentExam(null)}
                  onStartAnalysis={() => {}}
                />

                {currentExam && (
                  <ExamAnalysisView
                    exam={currentExam}
                    onOpenShuffleModal={() => setIsShuffleModalOpen(true)}
                    onExamUpdated={(updated) => {
                      setCurrentExam(updated);
                      loadExams();
                    }}
                  />
                )}
              </div>
            )}

            {/* TAB 2: PUBLISHED EXAMS & ZALO LINKS */}
            {currentTab === 'published' && (
              <PublishedExamsView
                publishedExams={publishedExams}
                onRefresh={loadPublishedExams}
                onOpenTestExam={(code) => setStudentAccessCode(code)}
                onViewResults={(examId) => {
                  setSelectedResultExamId(examId);
                  setCurrentTab('results');
                }}
              />
            )}

            {/* TAB 3: RESULTS & EXCEL EXPORT */}
            {currentTab === 'results' && (
              <TeacherResultsView
                publishedExams={publishedExams}
                selectedExamId={selectedResultExamId}
                onSelectExamId={(id) => {
                  setSelectedResultExamId(id);
                  try {
                    localStorage.setItem('hhct_selected_result_exam_id', id);
                  } catch (e) {}
                }}
              />
            )}

            {/* TAB 4: AUTOMATED 12 TEST CASES VERIFICATION */}
            {currentTab === 'test-suite' && <TestSuiteView />}
          </>
        )}
      </main>

      {/* Teacher Login Modal */}
      <TeacherLoginModal
        isOpen={isLoginModalOpen}
        onClose={() => setIsLoginModalOpen(false)}
        onLoginSuccess={handleLoginSuccess}
      />

      {/* Teacher Change & Reset Password Modal */}
      <ChangePasswordModal
        isOpen={isChangePasswordModalOpen}
        onClose={() => setIsChangePasswordModalOpen(false)}
      />

      {/* Shuffle and Publish Modal */}
      {currentExam && (
        <ShuffleModal
          isOpen={isShuffleModalOpen}
          exam={currentExam}
          onClose={() => setIsShuffleModalOpen(false)}
          onPublishSuccess={() => {
            loadPublishedExams();
            setCurrentTab('published');
          }}
        />
      )}

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-6 px-4 text-center text-xs text-gray-500">
        <div className="max-w-7xl mx-auto space-y-1">
          <p className="font-semibold text-gray-700">
            HỌC HÓA CÙNG THẦY THIỆN © 2025 – 2026
          </p>
          <p>
            Hệ thống trộn đề Hóa học thông minh – Nhận diện đáp án gạch chân OOXML – Thi trực tuyến qua Zalo – Chấm điểm tự động và xuất Excel.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
