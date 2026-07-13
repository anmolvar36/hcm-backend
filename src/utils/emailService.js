const nodemailer = require('nodemailer');

const createTransporter = async () => {
  // Use env variables if available
  if (process.env.SMTP_HOST && process.env.SMTP_USER) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }

  // Fallback for development without SMTP credentials
  console.log('⚠️  No SMTP credentials provided. Using mock email service.');
  return {
    sendMail: async (mailOptions) => {
      console.log('\n--- MOCK EMAIL SENT ---');
      console.log('To:', mailOptions.to);
      console.log('Subject:', mailOptions.subject);
      console.log('Text:', mailOptions.text);
      console.log('-----------------------\n');
      return { messageId: `mock-${Date.now()}` };
    }
  };
};

const sendEmail = async (options) => {
  try {
    const transporter = await createTransporter();
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || '"HCM Portal" <noreply@hcmportal.local>',
      to: options.to,
      subject: options.subject,
      text: options.text,
      html: options.html,
    };

    const info = await transporter.sendMail(mailOptions);
    return { success: true, info };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error };
  }
};

module.exports = { sendEmail };
