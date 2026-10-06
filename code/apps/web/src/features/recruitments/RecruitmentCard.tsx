import React from 'react';
import {Users,Clock,Gamepad2} from 'lucide-react';
import type {RecruitmentDTO} from '@fg/contracts';
import {displayBangkok} from './time.js';
export function RecruitmentCard({card}:{card:RecruitmentDTO}) {
 const full=card.currentPlayers>=card.playerCapacity;
 // List/create API clients validate Roblox URLs through the shared contract.
 const experienceLink=card.experienceUrl;
 return <article className="fg-recruit-card" aria-label={card.title}>
  <div className="fg-recruit-meta"><span><Gamepad2 size={16} aria-hidden="true"/>{card.mode}</span><span className={full?'':'fg-recruit-available'}>{card.state==='CLOSED'?'Tạm dừng tuyển':full?'Đã đủ người':`Còn ${card.playerCapacity-card.currentPlayers} chỗ`}</span></div>
  <h3>{card.title}</h3>
  <p className="fg-recruit-meta"><Users size={16} aria-hidden="true"/>{card.currentPlayers}/{card.playerCapacity} người{card.timingType==='now'?' · Chơi ngay':null}</p>
  {card.scheduledAt&&<p className="fg-recruit-meta"><Clock size={16} aria-hidden="true"/><time dateTime={card.scheduledAt}>{displayBangkok(card.scheduledAt)} · Bangkok</time></p>}
  {card.requirementText&&<p className="fg-recruit-note">{card.requirementText}</p>}
  {card.experienceName&&<p className="fg-recruit-note">Experience: {card.experienceName}{experienceLink&&<> · <a href={experienceLink} target="_blank" rel="noopener noreferrer">Mở Roblox</a></>}</p>}
 </article>;
}
