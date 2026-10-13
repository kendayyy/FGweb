import 'reflect-metadata';
import {Body,Controller,Get,HttpCode,INestApplication,Module,Post,Put,Req} from '@nestjs/common';
import {NestFactory} from '@nestjs/core';
import type {Request} from 'express';
import request from 'supertest';
import {createHash} from 'node:crypto';
import {configureFgHttpBodyParsers} from '../src/modules/chat-crypto/http-body-parsers.js';

@Controller()
class FixtureController{
 @Post('api/v1/ordinary')@HttpCode(200)ordinary(@Body()body:{data:string}){return {size:body.data.length};}
 @Post('api/v1/crypto/conversations/fixture/messages')@HttpCode(200)message(@Body()body:{data:string}){return {size:body.data.length};}
 @Post('api/v1/crypto/to-device')@HttpCode(200)toDevice(@Body()body:{data:string}){return {size:body.data.length};}
 @Put('api/v1/crypto/recovery')recovery(@Body()body:{data:string}){return {size:body.data.length};}
 @Get('api/v1/crypto/recovery')read(){return {success:true};}
 @Post('api/media/webhook')@HttpCode(200)webhook(@Req()req:Request){return {raw:Buffer.isBuffer(req.body),digest:createHash('sha256').update(req.body).digest('hex')};}
}
@Module({controllers:[FixtureController]})class FixtureApp{}
describe('Actual HTTP parsing preserves ordinary limits and raw media bytes',()=>{
 let app:INestApplication,base:string;
 beforeAll(async()=>{app=await NestFactory.create(FixtureApp,{logger:false,bodyParser:false});configureFgHttpBodyParsers(app);await app.listen(0,'127.0.0.1');base=await app.getUrl();});
 afterAll(async()=>{await app?.close();});
 it('keeps ordinary JSON limited to 100 KiB',async()=>{
  expect((await request(base).post('/api/v1/ordinary').send({data:'a'.repeat(90*1024)})).status).toBe(200);
  expect((await request(base).post('/api/v1/ordinary').send({data:'a'.repeat(101*1024)})).status).toBe(413);
 });
 it('bounds messages at 192 KiB and to-device batches at 256 KiB',async()=>{
  expect((await request(base).post('/api/v1/crypto/conversations/fixture/messages').send({data:'a'.repeat(150*1024)})).status).toBe(200);
  expect((await request(base).post('/api/v1/crypto/conversations/fixture/messages').send({data:'a'.repeat(193*1024)})).status).toBe(413);
  expect((await request(base).post('/api/v1/crypto/to-device').send({data:'a'.repeat(250*1024)})).status).toBe(200);
  expect((await request(base).post('/api/v1/crypto/to-device').send({data:'a'.repeat(257*1024)})).status).toBe(413);
 });
 it('permits large recovery writes but refuses oversized bodies and large read bodies',async()=>{
  expect((await request(base).put('/api/v1/crypto/recovery').send({data:'a'.repeat(500*1024)})).status).toBe(200);
  expect((await request(base).put('/api/v1/crypto/recovery').send({data:'a'.repeat(17*1024*1024)})).status).toBe(413);
  expect((await request(base).get('/api/v1/crypto/recovery').send({data:'a'.repeat(257*1024)})).status).toBe(413);
 });
 it('preserves exact signed webhook bytes with a separate 64 KiB ceiling',async()=>{
  const raw='{\n  "sample": 1\n}';
  const response=await request(base).post('/api/media/webhook').set('Content-Type','application/json').send(raw);
  expect(response.status).toBe(200);expect(response.body).toEqual({raw:true,digest:createHash('sha256').update(raw).digest('hex')});
  expect((await request(base).post('/api/media/webhook').set('Content-Type','application/json').send(JSON.stringify({data:'a'.repeat(65*1024)}))).status).toBe(413);
 });
});
