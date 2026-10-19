import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Play,
  RotateCw,
  Cpu,
  FileCheck,
} from 'lucide-react';
import { api } from '../api';

export const TestSuiteView: React.FC = () => {
  const [running, setRunning] = useState(false);
  const [testResults, setTestResults] = useState<any[] | null>(null);
  const [allPassed, setAllPassed] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunTests = async () => {
    setRunning(true);
    setError(null);
    try {
      const res = await api.runVerification();
      setAllPassed(res.allPassed);
      setTestResults(res.results);
    } catch (err: any) {
      setError(err.message || 'Lỗi chạy kiểm thử');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-gray-100 pb-4">
          <div className="space-y-1">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-purple-700" />
              Kiểm Thử Tự Động 12 Tình Huống Kỹ Thuật Bắt Buộc
            </h2>
            <p className="text-xs text-gray-500">
              Kiểm tra tính đúng đắn của đáp án gạch chân, bảo toàn công thức sub/sup, ảnh, MathType, xáo trộn không đổi đáp án và bảo mật điểm số.
            </p>
          </div>

          <button
            onClick={handleRunTests}
            disabled={running}
            className="flex items-center gap-2 px-5 py-2.5 bg-purple-700 hover:bg-purple-600 text-white font-bold rounded-xl text-xs sm:text-sm shadow-md transition disabled:opacity-50 shrink-0"
          >
            {running ? (
              <>
                <RotateCw className="w-4 h-4 animate-spin" />
                Đang kiểm thử...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                CHẠY KIỂM THỬ 12 TÌNH HUỐNG
              </>
            )}
          </button>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
            {error}
          </div>
        )}

        {allPassed !== null && (
          <div
            className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
              allPassed
                ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                : 'bg-red-50 border-red-300 text-red-900'
            }`}
          >
            <div className="flex items-center gap-2 text-sm font-bold">
              {allPassed ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              ) : (
                <XCircle className="w-5 h-5 text-red-600" />
              )}
              <span>
                {allPassed
                  ? 'TẤT CẢ 12 TÌNH HUỐNG KIỂM THỬ ĐỀU ĐẠT CHUẨN 100%!'
                  : 'CÓ TÌNH HUỐNG KIỂM THỬ CHƯA ĐẠT.'}
              </span>
            </div>
            <span className="text-xs font-semibold px-2.5 py-1 bg-white/70 rounded-lg">
              {testResults?.filter((r) => r.passed).length || 0} / 12 Vượt qua
            </span>
          </div>
        )}
      </div>

      {/* Tests Results List */}
      {testResults && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {testResults.map((t) => (
            <div
              key={t.caseId}
              className={`p-4 rounded-2xl border transition shadow-xs flex items-start gap-3.5 ${
                t.passed
                  ? 'bg-white border-emerald-200'
                  : 'bg-red-50/50 border-red-200'
              }`}
            >
              <div className="mt-0.5">
                {t.passed ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 shrink-0" />
                )}
              </div>

              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-gray-900">
                    Trường hợp {t.caseId}:
                  </span>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                      t.passed
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {t.passed ? 'ĐẠT YÊU CẦU' : 'THẤT BẠI'}
                  </span>
                </div>

                <div className="text-xs text-gray-700 font-medium">{t.title}</div>
                <div className="text-[11px] text-gray-500">{t.message}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
