import { ProfileDTO, CustomStatus } from '@fg/contracts';

export type UserCustomStatus = CustomStatus;
export type ProfileUser = ProfileDTO;

export const CUSTOM_STATUS_LABELS: Record<CustomStatus, string> = {
  LOOKING_FOR_TEAM: 'Đang tìm đội',
  PLAYING: 'Đang chơi',
  JUST_CHATTING: 'Chỉ trò chuyện',
};
