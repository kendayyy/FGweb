import {describe,it,expect} from 'vitest';
import {ApiEndpointRegistry,AuthPasswordSchema,SignInEmailRequestSchema,ChangePasswordRequestSchema,ResetPasswordRequestSchema,AttachPasswordRequestSchema,SignUpEmailRequestSchema} from '../src/index.js';
describe('AUTH-PASSWORD-03 shared creation policy',()=>{
 it('enforces7/8/128/129 Unicode code-point boundaries',()=>{for(const count of [8,128])expect(AuthPasswordSchema.safeParse(`Aa!${'x'.repeat(count-3)}`).success).toBe(true);for(const count of [7,129])expect(AuthPasswordSchema.safeParse(`Aa!${'x'.repeat(count-3)}`).success).toBe(false);});
 it('requires uppercase Lu and punctuation/symbol special, excluding whitespace',()=>{for(const password of ['abcdefg!','ABCDEFGx','Aa      ','a!bcdefg'])expect(AuthPasswordSchema.safeParse(password).success).toBe(false);expect(AuthPasswordSchema.safeParse('Abcdefg!').success).toBe(true);});
 it('counts astral symbols as one code point rather than UTF16 units',()=>{expect(AuthPasswordSchema.safeParse(`A${'😀'.repeat(127)}`).success).toBe(true);expect(AuthPasswordSchema.safeParse(`A${'😀'.repeat(128)}`).success).toBe(false);expect(AuthPasswordSchema.safeParse('A😀😀😀😀😀😀😀').success).toBe(true);expect(AuthPasswordSchema.safeParse('A😀😀😀😀😀😀').success).toBe(false);});
 it('accepts real Unicode uppercase and distinguishes titlecase from Lu',()=>{expect(AuthPasswordSchema.safeParse('Ωabcde!x').success).toBe(true);expect(AuthPasswordSchema.safeParse('Ａabcde!x').success).toBe(true);expect(AuthPasswordSchema.safeParse('𐐀abcde!x').success).toBe(true);expect(AuthPasswordSchema.safeParse('ǅabcde!x').success).toBe(false);});
 it('preserves significant whitespace and normalization-distinct input exactly',()=>{for(const password of ['  Ωhello!  ','Ａabcdef!','A\u0301bcdef!'])expect(AuthPasswordSchema.parse(password)).toBe(password);});
 it('uses the same policy for signup/reset/change/attach',()=>{const valid='Abcdefg!',invalid='abcdefgh';const bodies=[(p:string)=>SignUpEmailRequestSchema.safeParse({name:'FG player',email:'owner@fixture.invalid',password:p}),(p:string)=>ResetPasswordRequestSchema.safeParse({token:'fixture',newPassword:p}),(p:string)=>ChangePasswordRequestSchema.safeParse({currentPassword:'old-legacy',newPassword:p}),(p:string)=>AttachPasswordRequestSchema.safeParse({token:'fixture',newPassword:p})];for(const parse of bodies){expect(parse(valid).success).toBe(true);expect(parse(invalid).success).toBe(false);}});
 it('does not composition-gate legacy signin or current-password proof',()=>{expect(SignInEmailRequestSchema.safeParse({email:'owner@fixture.invalid',password:'old lower only'}).success).toBe(true);expect(ChangePasswordRequestSchema.safeParse({currentPassword:'old lower only',newPassword:'Abcdefg!'}).success).toBe(true);});
});

describe('sole-admin username transport',()=>{
 it('accepts only the reserved alias with credential proof, never client grants',()=>{
  const endpoint=ApiEndpointRegistry.find(e=>e.path==='/api/auth/fg/sign-in/admin');expect(endpoint).toBeDefined();expect(endpoint?.auth).toBe('Public');expect(endpoint?.method).toBe('POST');
  const body={username:'kingame',password:'legacy lower password'};
  expect(endpoint?.requestSchema?.parse(body)).toEqual(body);
  for(const username of ['other','Kingame','kingame@fixture.invalid'])expect(endpoint?.requestSchema?.safeParse({...body,username}).success).toBe(false);
  for(const key of ['userId','email','role','admin','sessionId'])expect(endpoint?.requestSchema?.safeParse({...body,[key]:'forged'}).success).toBe(false);
  expect(endpoint?.requestSchema?.safeParse({...body,callbackURL:'https://evil.invalid/'}).success).toBe(false);
 });
 it('uses the verified native session response and strips private credential fields',()=>{
  const endpoint=ApiEndpointRegistry.find(e=>e.path==='/api/auth/fg/sign-in/admin');expect(endpoint).toBeDefined();
  const user={id:'sole-admin',name:'kingame',email:'admin@fixture.invalid',emailVerified:true,createdAt:'2026-10-07T00:00:00.000Z',updatedAt:'2026-10-07T00:00:00.000Z',password:'private',role:'admin'};
  const result=endpoint?.responseSchema.parse({redirect:false,token:'native-session',user});expect(result).toMatchObject({redirect:false,user:{id:'sole-admin'}});
  expect(result).not.toHaveProperty('user.password');expect(result).not.toHaveProperty('user.role');
  expect(endpoint?.responseSchema.safeParse({redirect:false,token:'native-session',user:{...user,emailVerified:false}}).success).toBe(false);
 });
});
