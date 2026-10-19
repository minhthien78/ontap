import nodemailer, { TestAccount } from 'nodemailer';

export interface EmailSendResult {
  success: boolean;
  messageId?: string;
  previewUrl?: string;
  error?: string;
}

let etherealAccountPromise: Promise<TestAccount> | null = null;

async function getTransporter() {
  const smtpUser = process.env.SMTP_USER || process.env.GMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.GMAIL_APP_PASSWORD;

  if (smtpUser && smtpPass) {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT) || 587;
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  }

  // Fallback to auto-created Ethereal test account if SMTP credentials are not yet configured
  if (!etherealAccountPromise) {
    etherealAccountPromise = nodemailer.createTestAccount();
  }
  const testAccount = await etherealAccountPromise;

  return nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass,
    },
  });
}

/**
 * Sends a newly generated secure password to the authorized admin email ONLY.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  teacherName: string,
  newPassword: string
): Promise<EmailSendResult> {
  const cleanEmail = toEmail.trim().toLowerCase();

  // STRICT ENFORCEMENT: Only send to minhthien78@gmail.com
  if (cleanEmail !== 'minhthien78@gmail.com') {
    throw new Error('Chỉ cấp lại mật khẩu cho email quản trị viên: minhthien78@gmail.com');
  }

  const transporter = await getTransporter();

  const formattedDate = new Date().toLocaleString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour12: false,
  });

  const mailOptions = {
    from: '"Học Hóa Cùng Thầy Thiện" <noreply@hochoacungthaythien.edu.vn>',
    to: cleanEmail,
    subject: `[Học Hóa Cùng Thầy Thiện] Mật khẩu đăng nhập mới của Thầy (${formattedDate})`,
    text: `Kính gửi ${teacherName},

Hệ thống vừa nhận được yêu cầu cấp lại mật khẩu đăng nhập cho tài khoản Giáo viên liên kết với email ${cleanEmail}.

THÔNG TIN ĐĂNG NHẬP MỚI CỦA THẦY:
- Tên đăng nhập: ThayThien
- Mật khẩu mới: ${newPassword}
- Thời gian cấp: ${formattedDate}

LƯU Ý BẢO MẬT QUAN TRỌNG:
1. Mật khẩu này được tạo ngẫu nhiên bảo mật cao và CHỈ gửi trực tiếp vào hòm thư Gmail của Thầy.
2. Không ai khác trên trình duyệt có thể nhìn thấy mật khẩu này.
3. Sau khi đăng nhập bằng mật khẩu trên, Thầy có thể bấm vào nút "Đổi mật khẩu" ở góc trên màn hình để đặt lại mật khẩu theo ý muốn bất cứ lúc nào.

Trân trọng,
Hệ Thống Trộn Đề & Thi Trực Tuyến Học Hóa Cùng Thầy Thiện`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #1e293b; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 25px rgba(0,0,0,0.06); border: 1px solid #e2e8f0; }
    .header { background: linear-gradient(135deg, #1e3a8a, #312e81, #065f46); color: #ffffff; padding: 32px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px; }
    .header p { margin: 8px 0 0; font-size: 13px; color: #93c5fd; }
    .content { padding: 32px 24px; }
    .greeting { font-size: 16px; font-weight: 700; color: #0f172a; margin-bottom: 16px; }
    .notice { font-size: 14px; line-height: 1.6; color: #334155; margin-bottom: 24px; }
    .card { background: #f0fdf4; border: 2px dashed #10b981; border-radius: 16px; padding: 20px; text-align: center; margin-bottom: 24px; }
    .card-label { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #065f46; margin-bottom: 8px; }
    .password-box { font-family: 'Courier New', monospace; font-size: 26px; font-weight: 800; color: #047857; letter-spacing: 2px; background: #ffffff; padding: 12px 20px; border-radius: 12px; display: inline-block; border: 1px solid #a7f3d0; margin-bottom: 8px; user-select: all; }
    .info-row { font-size: 13px; color: #475569; margin-top: 6px; }
    .security-box { background: #eff6ff; border-left: 4px solid #3b82f6; padding: 16px; border-radius: 8px; font-size: 13px; line-height: 1.6; color: #1e40af; margin-bottom: 24px; }
    .footer { background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>HỌC HÓA CÙNG THẦY THIỆN</h1>
      <p>Hệ thống thi trắc nghiệm Hóa học trực tuyến – Chấm điểm & Quản trị đề thi</p>
    </div>
    <div class="content">
      <div class="greeting">Kính gửi Thầy Nguyễn Minh Thiện,</div>
      <div class="notice">
        Hệ thống vừa xử lý yêu cầu cấp lại mật khẩu đăng nhập quản trị dành riêng cho email <strong>${cleanEmail}</strong>.
      </div>

      <div class="card">
        <div class="card-label">Mật Khẩu Đăng Nhập Mới Của Thầy</div>
        <div class="password-box">${newPassword}</div>
        <div class="info-row">Tên đăng nhập: <strong>ThayThien</strong></div>
        <div class="info-row">Thời gian cấp lại: <strong>${formattedDate}</strong></div>
      </div>

      <div class="security-box">
        <strong>Lá chắn bảo mật:</strong>
        <br>• Mật khẩu này được sinh ngẫu nhiên an toàn và <strong>chỉ gửi vào hòm thư Gmail của Thầy</strong>. Người lạ thao tác trên web không thể xem hay lấy được mật khẩu.
        <br>• Sau khi đăng nhập, Thầy có thể sử dụng tính năng <em>"Đổi mật khẩu"</em> trên thanh điều khiển để đổi lại mật khẩu cá nhân theo ý muốn.
      </div>
    </div>
    <div class="footer">
      Email này được gửi tự động từ hệ thống Học Hóa Cùng Thầy Thiện © 2025 – 2026.<br>
      Vui lòng không chuyển tiếp email này cho người khác để bảo vệ an toàn tài khoản.
    </div>
  </div>
</body>
</html>
`,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    const previewUrl = nodemailer.getTestMessageUrl(info) || undefined;
    if (previewUrl) {
      console.log(`[Email Service] Sent reset password email to ${cleanEmail}. Ethereal Preview: ${previewUrl}`);
    } else {
      console.log(`[Email Service] Sent reset password email to ${cleanEmail}. Message ID: ${info.messageId}`);
    }
    return {
      success: true,
      messageId: info.messageId,
      previewUrl: previewUrl || undefined,
    };
  } catch (err: any) {
    console.error('[Email Service Error]', err);
    throw new Error('Không thể gửi email: ' + (err.message || 'Lỗi kết nối máy chủ gửi thư'));
  }
}
