const nodemailer = require('nodemailer');

/**
 * Email Service - Handles all transactional email notifications
 * Integrates with SMTP provider (Gmail, SendGrid, Mailtrap, etc.)
 */
class EmailService {
  constructor() {
    this.transporter = null;
    this.initializeTransporter();
  }

  /**
   * Initialize nodemailer transporter based on environment
   */
  initializeTransporter() {
    if (process.env.NODE_ENV === 'production') {
      // Production SMTP configuration
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
    } else {
      // Development: Use Mailtrap or test SMTP
      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.mailtrap.io',
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });
    }
  }

  /**
   * Send welcome email to new user
   */
  async sendWelcomeEmail(email, userName, role) {
    const subject = `Welcome to Projexify - ${role.charAt(0).toUpperCase() + role.slice(1)} Account`;
    
    const htmlContent = this.getWelcomeTemplate(userName, role);
    
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@projexify.io',
        to: email,
        subject,
        html: htmlContent,
        text: this.htmlToText(htmlContent)
      });
      
      console.log(`Welcome email sent to ${email}`);
      return { success: true, message: 'Welcome email sent' };
    } catch (error) {
      console.error(`Failed to send welcome email to ${email}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email verification link
   */
  async sendVerificationEmail(email, verificationToken) {
    const verificationUrl = `${process.env.FRONTEND_URL}/verify?token=${verificationToken}`;
    const subject = 'Verify your Projexify email address';
    
    const htmlContent = `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f172a;">Verify Your Email</h2>
        <p>Thank you for signing up! Please verify your email address by clicking the link below:</p>
        <a href="${verificationUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
          Verify Email
        </a>
        <p style="color: #666; font-size: 14px;">Or copy and paste this link in your browser:</p>
        <p style="color: #666; font-size: 14px; word-break: break-all;">${verificationUrl}</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">This link expires in 24 hours.</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@projexify.io',
        to: email,
        subject,
        html: htmlContent,
        text: 'Click the link above to verify your email address'
      });
      
      console.log(`Verification email sent to ${email}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to send verification email:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send password reset email
   */
  async sendPasswordResetEmail(email, resetToken) {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    const subject = 'Reset your Projexify password';
    
    const htmlContent = `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f172a;">Reset Your Password</h2>
        <p>We received a request to reset your password. Click the link below to create a new password:</p>
        <a href="${resetUrl}" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
          Reset Password
        </a>
        <p style="color: #666; font-size: 14px;">This link expires in 1 hour.</p>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">If you didn't request this, please ignore this email.</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@projexify.io',
        to: email,
        subject,
        html: htmlContent
      });
      
      console.log(`Password reset email sent to ${email}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to send password reset email:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send project submission notification to mentor
   */
  async sendProjectSubmissionNotification(mentorEmail, mentorName, studentGroupName, projectName, sessionUrl) {
    const subject = `New Project Submission - ${projectName}`;
    
    const htmlContent = `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f172a;">New Project Submission</h2>
        <p>Hi ${mentorName},</p>
        <p>The student group <strong>${studentGroupName}</strong> has submitted their work on <strong>${projectName}</strong>.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Group:</strong> ${studentGroupName}</p>
          <p><strong>Project:</strong> ${projectName}</p>
          <p><strong>Status:</strong> Awaiting Review</p>
        </div>
        <a href="${sessionUrl}" style="display: inline-block; background-color: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
          Review Submission
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 30px;">Log in to your mentor dashboard to provide feedback and approve the milestone.</p>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@projexify.io',
        to: mentorEmail,
        subject,
        html: htmlContent,
        text: `New submission from ${studentGroupName} for review`
      });
      
      console.log(`Submission notification sent to ${mentorEmail}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to send submission notification:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send milestone approval notification to student group
   */
  async sendMilestoneApprovalNotification(studentEmails, groupName, projectName, milestoneName, feedback = '') {
    const subject = `Milestone Approved - ${milestoneName}`;
    
    const htmlContent = `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f172a;">🎉 Milestone Approved!</h2>
        <p>Congratulations! Your milestone has been approved.</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <p><strong>Group:</strong> ${groupName}</p>
          <p><strong>Project:</strong> ${projectName}</p>
          <p><strong>Milestone:</strong> ${milestoneName}</p>
        </div>
        ${feedback ? `<div style="background-color: #f3f4f6; padding: 15px; border-radius: 8px; margin: 20px 0;"><strong>Mentor Feedback:</strong><p>${feedback}</p></div>` : ''}
        <p style="color: #666;">Check your dashboard to view your progress and the next milestone.</p>
      </div>
    `;

    try {
      for (const email of studentEmails) {
        await this.transporter.sendMail({
          from: process.env.SMTP_FROM || 'noreply@projexify.io',
          to: email,
          subject,
          html: htmlContent,
          text: `Your milestone ${milestoneName} has been approved!`
        });
      }
      
      console.log(`Approval notification sent to ${studentEmails.length} students`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to send approval notification:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send escrow release notification (payment processed)
   */
  async sendEscrowReleaseNotification(centerEmail, centerName, amount, projectName, transactionId) {
    const subject = `Payment Released - ${projectName}`;
    
    const htmlContent = `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f172a;">Payment Released</h2>
        <p>Hi ${centerName},</p>
        <p>The escrow funds for a completed milestone have been released to your account.</p>
        <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <p><strong>Project:</strong> ${projectName}</p>
          <p><strong>Amount Released:</strong> $${amount.toFixed(2)}</p>
          <p><strong>Transaction ID:</strong> ${transactionId}</p>
          <p style="color: #666; font-size: 14px;">Expected in your bank account within 2-3 business days.</p>
        </div>
        <a href="${process.env.FRONTEND_URL}/pages/center/dashboard.html" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
          View Dashboard
        </a>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@projexify.io',
        to: centerEmail,
        subject,
        html: htmlContent,
        text: `Payment of $${amount.toFixed(2)} has been released for ${projectName}`
      });
      
      console.log(`Payment notification sent to ${centerEmail}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to send payment notification:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send center verification status notification
   */
  async sendCenterVerificationNotification(centerEmail, centerName, status, message = '') {
    const isApproved = status === 'verified';
    const subject = isApproved ? 'Center Verified ✓' : 'Center Verification Pending';
    
    const htmlContent = `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f172a;">Center Verification Update</h2>
        <p>Hi ${centerName},</p>
        <div style="background-color: ${isApproved ? '#f0fdf4' : '#fef3c7'}; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${isApproved ? '#10b981' : '#f59e0b'};">
          <p style="font-size: 18px; margin: 0;"><strong>${isApproved ? '✓ Center Verified' : '⏳ Verification Status: ' + status}</strong></p>
          ${message ? `<p style="margin-top: 10px; color: #666;">${message}</p>` : ''}
        </div>
        ${isApproved ? `<p style="color: #666;">You can now start uploading projects and managing mentors on the platform.</p>` : `<p style="color: #666;">Our team is reviewing your submission. We'll notify you once the verification is complete.</p>`}
        <a href="${process.env.FRONTEND_URL}/pages/center/dashboard.html" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
          Go to Dashboard
        </a>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@projexify.io',
        to: centerEmail,
        subject,
        html: htmlContent,
        text: `Your center verification status: ${status}`
      });
      
      console.log(`Verification notification sent to ${centerEmail}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to send verification notification:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send mentor assignment notification
   */
  async sendMentorAssignmentNotification(mentorEmail, mentorName, groupName, projectName, kickoffTime) {
    const subject = `New Assignment - ${projectName}`;
    
    const htmlContent = `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0f172a;">New Mentorship Assignment</h2>
        <p>Hi ${mentorName},</p>
        <p>You've been assigned to mentor a new student group.</p>
        <div style="background-color: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p><strong>Group:</strong> ${groupName}</p>
          <p><strong>Project:</strong> ${projectName}</p>
          <p><strong>Kickoff Time:</strong> ${new Date(kickoffTime).toLocaleString()}</p>
        </div>
        <p style="color: #666;">Log in to your mentor dashboard to access the virtual lab and begin working with your assigned group.</p>
        <a href="${process.env.FRONTEND_URL}/pages/mentor/dashboard.html" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
          View Assignment
        </a>
      </div>
    `;

    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM || 'noreply@projexify.io',
        to: mentorEmail,
        subject,
        html: htmlContent,
        text: `You've been assigned to mentor ${groupName} for ${projectName}`
      });
      
      console.log(`Assignment notification sent to ${mentorEmail}`);
      return { success: true };
    } catch (error) {
      console.error(`Failed to send assignment notification:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send batch email (for admins/announcements)
   */
  async sendBatchEmail(recipientList, subject, htmlContent, from = 'Projexify Notifications') {
    const fromAddress = `${from} <${process.env.SMTP_FROM || 'noreply@projexify.io'}>`;
    
    try {
      for (const recipient of recipientList) {
        await this.transporter.sendMail({
          from: fromAddress,
          to: recipient.email,
          subject: subject.replace('{name}', recipient.name),
          html: htmlContent,
          text: this.htmlToText(htmlContent)
        });
      }
      
      console.log(`Batch email sent to ${recipientList.length} recipients`);
      return { success: true, count: recipientList.length };
    } catch (error) {
      console.error(`Failed to send batch email:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get welcome email template based on role
   */
  getWelcomeTemplate(userName, role) {
    const roleMessages = {
      student: {
        title: 'Start Your Learning Journey',
        message: 'Browse our marketplace for exciting projects, join a team, and learn from industry mentors.'
      },
      mentor: {
        title: 'Ready to Mentor?',
        message: 'Guide student groups through real-world projects, provide feedback, and approve milestones.'
      },
      center_admin: {
        title: 'Welcome to Your Dashboard',
        message: 'Upload projects, manage mentors, track revenue, and grow your incubation center.'
      },
      admin: {
        title: 'Platform Administration',
        message: 'Monitor global metrics, verify centers, manage disputes, and oversee the escrow vault.'
      }
    };

    const roleInfo = roleMessages[role] || roleMessages.student;

    return `
      <div style="font-family: Inter, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: white; padding: 40px; text-align: center; border-radius: 8px 8px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">Welcome to Projexify</h1>
          <p style="margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">${roleInfo.title}</p>
        </div>
        <div style="background-color: #f9fafb; padding: 40px; border-radius: 0 0 8px 8px;">
          <p>Hi ${userName},</p>
          <p style="color: #666;">Thank you for joining Projexify! We're excited to have you on board.</p>
          <p>${roleInfo.message}</p>
          <div style="background-color: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4f46e5;">
            <h3 style="margin-top: 0; color: #0f172a;">Quick Start Guide</h3>
            <ul style="color: #666; line-height: 1.8;">
              <li>Complete your profile</li>
              <li>Review platform guidelines and code of conduct</li>
              <li>Set up payment or banking information</li>
              <li>Start exploring or mentoring!</li>
            </ul>
          </div>
          <a href="${process.env.FRONTEND_URL}/pages/${role === 'admin' ? 'admin' : role}/dashboard.html" style="display: inline-block; background-color: #4f46e5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; margin: 20px 0;">
            Go to Your Dashboard
          </a>
          <p style="color: #999; font-size: 12px; margin-top: 30px;">Need help? Contact support@projexify.io</p>
        </div>
      </div>
    `;
  }

  /**
   * Helper: Convert HTML to plain text
   */
  htmlToText(html) {
    return html
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  /**
   * Test email connectivity
   */
  async testConnection() {
    try {
      await this.transporter.verify();
      console.log('Email service connected successfully');
      return { success: true, message: 'Email service is ready' };
    } catch (error) {
      console.error('Email service connection failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();
