import React from 'react';
import './brand.css';

// Vector reconstruction of approved FG monogram01; no text/font dependency.
export function FGLogo({size=32,decorative=false}: {size?:number;decorative?:boolean}) {
  return <svg className="fg-brand-mark" viewBox="0 0 128 128" width={size} height={size} role={decorative?undefined:'img'} aria-label={decorative?undefined:'FG'} aria-hidden={decorative||undefined} focusable="false">
    <path className="fg-brand-f" d="M0 103V24L18 6H89L68 27H21V40H51L31 61H21V84Z"/>
    <path className="fg-brand-g" d="M68 34H113L125 46V56H62V98H103V87H71L91 66H125V99L105 120H52L40 108V62Z"/>
  </svg>;
}
