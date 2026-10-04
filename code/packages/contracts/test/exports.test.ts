import { describe, it, expect } from 'vitest';
import * as ContractsCompiled from '../dist/index.js';

describe('@fg/contracts Compiled Entrypoint Exports (Refactor Loop 1)', () => {
  it('exports all Zod schemas, registries, and constants from dist/index.js', () => {
    expect(ContractsCompiled.API_CONTRACT_VERSION1).toBe('1.0.0');
    expect(ContractsCompiled.ALLOWED_GAMES).toBeDefined();
    expect(ContractsCompiled.ALLOWED_GAMES).toHaveLength(7);
    expect(ContractsCompiled.ErrorCode.LOGIN_REQUIRED).toBe('LOGIN_REQUIRED');
    expect(ContractsCompiled.ErrorCodeToHttpStatus[ContractsCompiled.ErrorCode.LOGIN_REQUIRED]).toBe(401);
    expect(ContractsCompiled.SocketEventNames.MESSAGE_CREATED).toBe('message.created');

    expect(ContractsCompiled.GameSchema).toBeDefined();
    expect(ContractsCompiled.PublicProfileSchema).toBeDefined();
    expect(ContractsCompiled.PrivateProfileSchema).toBeDefined();
    expect(ContractsCompiled.RoomSchema).toBeDefined();
    expect(ContractsCompiled.RecruitmentSchema).toBeDefined();
    expect(ContractsCompiled.CallGroupSchema).toBeDefined();
    expect(ContractsCompiled.NotificationSchema).toBeDefined();
    expect(ContractsCompiled.ReportSchema).toBeDefined();

    expect(ContractsCompiled.SocketEventSchemaMap).toBeDefined();
    expect(ContractsCompiled.SocketEventSchemaMap['message.created']).toBeDefined();

    expect(ContractsCompiled.ApiEndpointRegistry).toBeDefined();
    expect(Array.isArray(ContractsCompiled.ApiEndpointRegistry)).toBe(true);
    expect(ContractsCompiled.ApiEndpointRegistry.length).toBeGreaterThan(15);
  });
});
