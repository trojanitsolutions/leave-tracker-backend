import nodemailer from "nodemailer";
import { env } from "../config/env";

const transporter = nodemailer.createTransport({
  host: env.smtp.host,
  port: env.smtp.port,
  secure: env.smtp.port === 465,
  auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.password } : undefined,
});

export async function sendWelcomeEmail(
  to: string,
  fullName: string,
  temporaryPassword: string,
): Promise<boolean> {
  if (!env.smtp.user) {
    console.warn(`SMTP not configured — skipping welcome email to ${to}`);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"${env.smtp.fromName}" <${env.smtp.user}>`,
      to,
      subject: "Your Trojan Leave Tracker account",
      text: [
        `Hi ${fullName},`,
        "",
        "An account has been created for you on the Trojan Leave Tracker.",
        "",
        `Login email: ${to}`,
        `Temporary password: ${temporaryPassword}`,
        "",
        "Please sign in and change your password from your Profile page.",
        "",
        "— Trojan Technologies HR",
      ].join("\n"),
    });
    return true;
  } catch (err) {
    console.error(`Failed to send welcome email to ${to}:`, err);
    return false;
  }
}

export async function sendPasswordResetOtpEmail(
  to: string,
  fullName: string,
  otp: string,
  expiresInMinutes: number,
): Promise<boolean> {
  if (!env.smtp.user) {
    console.warn(`SMTP not configured — skipping password reset email to ${to}`);
    return false;
  }

  try {
    await transporter.sendMail({
      from: `"${env.smtp.fromName}" <${env.smtp.user}>`,
      to,
      subject: "Your Trojan Leave Tracker password reset code",
      text: [
        `Hi ${fullName},`,
        "",
        "We received a request to reset your Trojan Leave Tracker password.",
        "",
        `Your verification code: ${otp}`,
        "",
        `This code expires in ${expiresInMinutes} minutes. If you didn't request this, you can ignore this email.`,
        "",
        "— Trojan Technologies HR",
      ].join("\n"),
    });
    return true;
  } catch (err) {
    console.error(`Failed to send password reset email to ${to}:`, err);
    return false;
  }
}
