import { type Transporter } from 'nodemailer';
export declare function authMailTransport(): Transporter;
export declare function sendAuthMail(transport: Transporter, from: string, to: string, kind: 'VERIFY' | 'RESET' | 'ATTACH', url: string): Promise<void>;
