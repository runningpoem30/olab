import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';

let transport: Transporter | undefined;

export function getSmtpTransport(): Transporter {
  if (!env.ETHEREAL_USER || !env.ETHEREAL_PASS) {
    throw new Error('Ethereal credentials are not configured; set ETHEREAL_USER and ETHEREAL_PASS');
  }
  if (!transport) {
    transport = nodemailer.createTransport({
      host: env.ETHEREAL_HOST,
      port: env.ETHEREAL_PORT,
      secure: env.ETHEREAL_PORT === 465,
      auth: { user: env.ETHEREAL_USER, pass: env.ETHEREAL_PASS },
      disableFileAccess: true,
      disableUrlAccess: true,
      tls: { rejectUnauthorized: true },
    });
  }
  return transport;
}
