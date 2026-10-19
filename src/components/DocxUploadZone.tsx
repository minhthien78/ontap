import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileText,
  Trash2,
  Cpu,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Download,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  FileCheck2,
  BookOpen,
} from 'lucide-react';
import { api } from '../api';
import { ExamSource } from '../types';

interface DocxUploadZoneProps {
  currentExam: ExamSource | null;
  onExamParsed: (exam: ExamSource) => void;
  onClearExam: () => void;
  onStartAnalysis: () => void;
}

export const DocxUploadZone: React.FC<DocxUploadZoneProps> = ({
  currentExam,
  onExamParsed,
  onClearExam,
  onStartAnalysis,
}) => {
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.docx')) {
      setError('Vui lòng chọn tệp định dạng Word DOCX (.docx)');
      return;
    }

    if (file.size > 30 * 1024 * 1024) {
      setError('Kích thước tệp quá lớn (tối đa 30MB)');
      return;
    }

    setError(null);
    setUploading(true);

    try {
      const res = await api.uploadDocx(file);
      onExamParsed(res.exam);
    } catch (err: any) {
      setError(err.message || 'Lỗi xử lý tệp DOCX');
    } finally {
      setUploading(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleSampleCreate = async () => {
    setError(null);
    setUploading(true);
    try {
      const res = await api.createSampleExam();
      onExamParsed(res.exam);
    } catch (err: any) {
      setError(err.message || 'Lỗi tạo đề mẫu');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <UploadCloud className="w-5 h-5 text-blue-800" />
            Tải Lên Tệp Đề Thi Microsoft Word (.DOCX)
          </h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Nhận diện linh hoạt & chuẩn xác cả 3 Phần thi: Phần I (tối đa 40 câu 4 lựa chọn), Phần II (tối đa 10 câu Đúng/Sai), Phần III (tối đa 20 câu Trả lời ngắn).
          </p>
        </div>

        {/* Action Buttons for Sample File */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Download Sample DOCX button */}
          <a
            href={api.getSampleDocxDownloadUrl()}
            download="De_Thi_Mau_Hoa_Hoc_Chuan_25_Cau.docx"
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-50 hover:bg-blue-100 text-blue-900 border border-blue-200 rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition"
            title="Tải về tệp Word mẫu chuẩn để soạn đề"
          >
            <Download className="w-4 h-4 text-blue-700" />
            Tải Tệp Đề Mẫu Chuẩn (.docx)
          </a>

          {/* Load Sample into app */}
          <button
            onClick={handleSampleCreate}
            disabled={uploading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-gradient-to-r from-emerald-700 to-teal-800 hover:opacity-95 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-sm transition disabled:opacity-50"
            title="Nạp ngay 25 câu hỏi mẫu để kiểm tra tính năng"
          >
            <Sparkles className="w-4 h-4 text-emerald-200" />
            Nạp Đề Mẫu 25 Câu
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
          <div className="space-y-1">
            <span className="font-semibold">Đã xảy ra lỗi:</span>
            <p className="text-xs text-red-600">{error}</p>
          </div>
        </div>
      )}

      {/* Upload Box */}
      {!currentExam ? (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed rounded-2xl p-8 sm:p-12 text-center cursor-pointer transition flex flex-col items-center justify-center gap-3 ${
            dragActive
              ? 'border-blue-600 bg-blue-50/50'
              : 'border-gray-300 hover:border-blue-500 hover:bg-gray-50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files[0]) {
                handleFile(e.target.files[0]);
              }
            }}
          />

          <div className="p-4 bg-blue-100/70 text-blue-900 rounded-2xl">
            <UploadCloud className="w-10 h-10 animate-bounce" />
          </div>

          <div className="space-y-1">
            <p className="text-base font-semibold text-gray-800">
              Kéo thả tệp Word (.docx) vào đây, hoặc nhấn để chọn tệp
            </p>
            <p className="text-xs text-gray-500">
              Hỗ trợ công thức hóa học (H<sub>2</sub>SO<sub>4</sub>, Fe<sup>3+</sup>), MathType, hình ảnh thí nghiệm, bảng biểu
            </p>
          </div>

          <button
            type="button"
            disabled={uploading}
            className="mt-2 px-5 py-2.5 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-md transition"
          >
            {uploading ? 'Đang phân tích cấu trúc OOXML...' : 'TẢI TỆP ĐỀ THI (.DOCX)'}
          </button>
        </div>
      ) : (
        /* Loaded File Card */
        <div className="bg-blue-50/50 border border-blue-200 rounded-2xl p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-blue-900 text-white rounded-xl">
                <FileText className="w-7 h-7" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">{currentExam.title}</h3>
                <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-600">
                  <span className="bg-white px-2 py-0.5 rounded border border-gray-200 font-mono">
                    {currentExam.fileName}
                  </span>
                  <span>•</span>
                  <span>Tổng {currentExam.totalQuestions} câu hỏi (Phần 1: {currentExam.part1Count}, Phần 2: {currentExam.part2Count}, Phần 3: {currentExam.part3Count})</span>
                  <span>•</span>
                  <span className="text-emerald-700 font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Đã nhận diện {currentExam.detectedKeysCount} đáp án
                  </span>
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={onStartAnalysis}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-900 hover:bg-blue-800 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition"
              >
                <Cpu className="w-4 h-4" />
                PHÂN TÍCH ĐỀ THI
              </button>

              <button
                onClick={onClearExam}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-red-50 text-red-600 border border-red-200 rounded-xl text-xs sm:text-sm font-medium transition"
              >
                <Trash2 className="w-4 h-4" />
                XÓA TỆP ĐỀ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Formatting Standard Guide Card */}
      <div className="border border-blue-100 bg-blue-50/30 rounded-2xl p-4 transition">
        <button
          onClick={() => setShowGuide(!showGuide)}
          className="w-full flex items-center justify-between text-left text-sm font-bold text-blue-950 focus:outline-hidden"
        >
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-700" />
            <span>Hướng Dẫn Định Dạng Đề Thi Để App Nhận Diện Chuẩn Xác 100%</span>
          </div>
          {showGuide ? <ChevronUp className="w-4 h-4 text-blue-700" /> : <ChevronDown className="w-4 h-4 text-blue-700" />}
        </button>

        {showGuide && (
          <div className="mt-4 pt-3 border-t border-blue-100 text-xs text-gray-700 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-white p-3 rounded-xl border border-blue-100 shadow-2xs space-y-1.5">
                <div className="font-bold text-blue-900 flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center text-[10px]">1</span>
                  PHẦN I: Trắc Nghiệm 4 Lựa Chọn (Tối đa 40 câu)
                </div>
                <p className="text-gray-600">
                  • Các phương án bắt đầu bằng <strong>A.</strong>, <strong>B.</strong>, <strong>C.</strong>, <strong>D.</strong><br/>
                  • <strong>Đánh dấu đáp án đúng:</strong> Gạch chân chữ cái hoặc nội dung (nhấn <kbd className="bg-gray-100 px-1 py-0.5 rounded font-mono border">Ctrl+U</kbd>), hoặc tô màu đỏ, hoặc ghi dòng <em>Đáp án: A</em> ở cuối câu.
                </p>
              </div>

              <div className="bg-white p-3 rounded-xl border border-emerald-100 shadow-2xs space-y-1.5">
                <div className="font-bold text-emerald-900 flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center text-[10px]">2</span>
                  PHẦN II: Trắc Nghiệm Đúng - Sai (Tối đa 10 câu)
                </div>
                <p className="text-gray-600">
                  • 4 nhận định bắt đầu bằng <strong>a)</strong>, <strong>b)</strong>, <strong>c)</strong>, <strong>d)</strong><br/>
                  • <strong>Đánh dấu đáp án:</strong> Gạch chân ý Đúng (ý không gạch chân là Sai), hoặc ghi rõ <em>(Đúng)</em> / <em>(Sai)</em> ở cuối mỗi nhận định.
                </p>
              </div>

              <div className="bg-white p-3 rounded-xl border border-amber-100 shadow-2xs space-y-1.5">
                <div className="font-bold text-amber-900 flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center text-[10px]">3</span>
                  PHẦN III: Trả Lời Ngắn (Tối đa 20 câu)
                </div>
                <p className="text-gray-600">
                  • Thí sinh tự điền kết quả (số hoặc %)<br/>
                  • <strong>Đánh dấu đáp án:</strong> Ghi dòng <em>Đáp án: [kết quả]</em> ngay dưới đề bài (ví dụ: <em>Đáp án: 4</em> hoặc <em>Đáp án: 0,1 mol</em> hoặc <em>Đáp án: 12,5%</em>).
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-blue-100/60 text-gray-500">
              <span>💡 Thầy cô có thể tải tệp mẫu chuẩn Word (.docx) ở góc trên để tham khảo mẫu chuẩn hoặc chỉnh sửa nội dung bài giảng của mình.</span>
              <a
                href={api.getSampleDocxDownloadUrl()}
                download="De_Thi_Mau_Hoa_Hoc_Chuan_25_Cau.docx"
                className="text-blue-700 hover:text-blue-900 font-semibold underline flex items-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                Tải tệp mẫu ngay (.docx)
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
