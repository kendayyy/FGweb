import fs from 'node:fs';
import assert from 'node:assert/strict';
import {parseEnv} from 'node:util';
import nodemailer from 'nodemailer';
import {validateEnv} from '../../../scripts/check-env.mjs';
const env=validateEnv(parseEnv(fs.readFileSync('.env.local','utf8')));
const version=JSON.parse(fs.readFileSync('node_modules/nodemailer/package.json')).version;assert.equal(version,'10.0.14');assert.equal(JSON.parse(fs.readFileSync('node_modules/@types/nodemailer/package.json')).version,'8.0.2');
const transport=nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT),secure:env.SMTP_PORT==='465',requireTLS:env.SMTP_PORT!=='465',auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD},connectionTimeout:15000,greetingTimeout:15000,socketTimeout:20000});
try{assert(await transport.verify());console.log(JSON.stringify({pinnedNodemailer:version,environmentSyntax:true,tlsSmtpAuthentication:true,testRecipientAuthorized:'namvupham2004@gmail.com',emailSent:false}));}
catch(error){const code=String(error.code??'UNKNOWN');console.error(JSON.stringify({smtpVerified:false,errorCode:/^[A-Z_]+$/.test(code)?code:'REDACTED',responseCode:Number(error.responseCode)||null,secretsRedacted:true}));process.exitCode=1;}
finally{transport.close();}
