import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { X, Download, Copy, Check, ExternalLink, QrCode as QrIcon } from 'lucide-react';
import { getStudentExamUrl } from '../utils/urlHelper';

interface ExamQrModalProps {
  isOpen: boolean;
  onClose: () => void;
  examTitle: string;
  accessCode: string;
}

export const ExamQrModal: React.FC<ExamQrModalProps> = ({
  isOpen,
  onClose,
  examTitle,
  accessCode,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedLink, setCopiedLink] = useState(false);

  const examUrl = getStudentExamUrl(accessCode);

  useEffect(() => {
    if (!isOpen) return;

    QRCode.toDataURL(examUrl, {
      width: 320,
      margin: 2,
      color: {
        dark: '#1e3a8a',
        light: '#ffffff',
      },
    })
      .then((url) => setQrDataUrl(url))
      .catch((err) => console.error('Error generating QR:', err));
  }, [isOpen, examUrl]);

  if (!isOpen) return null;

  const handleDownloadQr = () => {
    if (!qrDataUrl) return;
    const link = document.createElement('a');
    link.download = `QR_ThiHoaHoc_${accessCode}.png`;
    link.href = qrDataUrl;
    link.click();
  };

  const handleCopyLink = async () => {
    await navigator.clipboard.writeText(examUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-gray-100 overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-700 to-indigo-800 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-white/10 rounded-lg">
              <QrIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base leading-tight">Mã QR Làm Bài Thi</h3>
              <p className="text-xs text-blue-200">Gửi vào nhóm Zalo để học sinh quét</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 text-center space-y-4">
          <div>
            <span className="inline-block px-3 py-1 bg-blue-50 text-blue-800 rounded-full text-xs font-semibold uppercase tracking-wider mb-1">
              Mã đề: {accessCode}
            </span>
            <h4 className="text-sm font-semibold text-gray-900 line-clamp-1">{examTitle}</h4>
          </div>

          {/* QR Container */}
          <div className="flex justify-center">
            <div className="p-3 bg-white rounded-2xl border-2 border-dashed border-blue-200 shadow-xs inline-block">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR Code bài thi"
                  className="w-56 h-56 rounded-lg object-contain mx-auto"
                />
              ) : (
                <div className="w-56 h-56 flex items-center justify-center text-gray-400 text-sm">
                  Đang tạo mã QR...
                </div>
              )}
            </div>
          </div>

          <p className="text-xs text-gray-500">
            Học sinh mở <strong>Zalo</strong> hoặc <strong>Camera điện thoại</strong> quét mã để vào làm bài.
          </p>

          {/* Link box */}
          <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-left flex items-center justify-between gap-2">
            <div className="truncate text-xs font-mono text-slate-700 flex-1">{examUrl}</div>
            <button
              onClick={handleCopyLink}
              className="shrink-0 p-1.5 text-xs font-medium text-blue-700 hover:bg-blue-100 rounded-lg transition-colors flex items-center gap-1"
            >
              {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copiedLink ? 'Đã chép' : 'Chép link'}</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <button
              onClick={handleDownloadQr}
              className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors"
            >
              <Download className="w-4 h-4" />
              <span>Tải ảnh QR (.png)</span>
            </button>

            <button
              onClick={() => window.open(examUrl, '_blank')}
              className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-800 text-xs font-semibold rounded-xl flex items-center justify-center gap-2 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Mở thử link</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
