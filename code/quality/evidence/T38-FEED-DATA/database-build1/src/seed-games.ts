import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { ALLOWED_GAMES } from '@fg/contracts';
import { games, lobbies } from './schema/games.js';

export async function seedGames(db: NodePgDatabase<Record<string, unknown>>) {
  const seededGames: Array<{ id: string; title: string; lobbyId: string }> = [];

  for (const title of ALLOWED_GAMES) {
    let [existingGame] = await db
      .select()
      .from(games)
      .where(eq(games.title, title))
      .limit(1);

    if (!existingGame) {
      const gameId = crypto.randomUUID();
      [existingGame] = await db
        .insert(games)
        .values({
          id: gameId,
          title,
          description: `Lobby chính thức cho ${title}`,
        })
        .returning();
    }

    let [existingLobby] = await db
      .select()
      .from(lobbies)
      .where(eq(lobbies.gameId, existingGame.id))
      .limit(1);

    if (!existingLobby) {
      const lobbyId = crypto.randomUUID();
      [existingLobby] = await db
        .insert(lobbies)
        .values({
          id: lobbyId,
          gameId: existingGame.id,
          name: 'Lobby',
        })
        .returning();
    }

    seededGames.push({
      id: existingGame.id,
      title: existingGame.title,
      lobbyId: existingLobby.id,
    });
  }

  return seededGames;
}
