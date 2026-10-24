/**
 * Pure matchmaking, rating, and CS 1.6 VGUI logic for 1.6 Pug Finder
 */

export interface PlayerInfo {
  id: string;
  name: string;
  elo: number;
}

export type MatchOutcome = 'A' | 'B' | 'X'; // A = CT/Team A, B = T/Team B, X = Void

export interface RankInfo {
  name: 'Recruit' | 'Regular' | 'Veteran' | 'Elite' | 'Legend';
  minElo: number;
  badgeClass: string;
}

export const MAPS = ['de_inferno', 'de_dust2', 'de_mirage'] as const;
export type MapName = typeof MAPS[number];

export const REGIONS = [
  { id: 'Europe', label: 'Europe (EU)' },
  { id: 'Americas', label: 'Americas (NA/SA)' },
  { id: 'Asia', label: 'Asia (AS/OCE)' },
] as const;
export type RegionId = typeof REGIONS[number]['id'];

/**
 * Validates player nickname according to 1.6 rules:
 * Max 16 characters; letters, numbers, space, _ . -
 */
export function validatePlayerName(name: string): { valid: boolean; error?: string } {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Name cannot be empty.' };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Name cannot be blank.' };
  }
  if (name.length > 16) {
    return { valid: false, error: 'Name must be 16 characters or fewer.' };
  }
  // letters, numbers, space, _ . -
  const validChars = /^[a-zA-Z0-9 _.-]+$/;
  if (!validChars.test(name)) {
    return {
      valid: false,
      error: 'Only letters, numbers, spaces, and _ . - are allowed.',
    };
  }
  return { valid: true };
}

/**
 * Returns rank tier based on Elo rating:
 * Recruit (<900), Regular (900), Veteran (1100), Elite (1300), Legend (1500+)
 */
export function getRank(elo: number): RankInfo {
  const currentElo = Math.max(100, Math.round(elo || 1000));
  if (currentElo >= 1500) {
    return { name: 'Legend', minElo: 1500, badgeClass: 'rank-legend' };
  }
  if (currentElo >= 1300) {
    return { name: 'Elite', minElo: 1300, badgeClass: 'rank-elite' };
  }
  if (currentElo >= 1100) {
    return { name: 'Veteran', minElo: 1100, badgeClass: 'rank-veteran' };
  }
  if (currentElo >= 900) {
    return { name: 'Regular', minElo: 900, badgeClass: 'rank-regular' };
  }
  return { name: 'Recruit', minElo: 0, badgeClass: 'rank-recruit' };
}

/**
 * Snake draft team balancing:
 * Sort 10 players by rating descending.
 * Assign pattern: A, B, B, A, A, B, B, A, A, B
 * (Team A is CT, Team B is T)
 */
export function balanceTeamsSnakeDraft(players: PlayerInfo[]): {
  teamA: PlayerInfo[];
  teamB: PlayerInfo[];
} {
  const sorted = [...players].sort((p1, p2) => {
    if (p2.elo !== p1.elo) return p2.elo - p1.elo;
    return p1.id.localeCompare(p2.id);
  });

  const pattern = ['A', 'B', 'B', 'A', 'A', 'B', 'B', 'A', 'A', 'B'];
  const teamA: PlayerInfo[] = [];
  const teamB: PlayerInfo[] = [];

  sorted.forEach((player, idx) => {
    const targetTeam = pattern[idx % pattern.length];
    if (targetTeam === 'A') {
      teamA.push(player);
    } else {
      teamB.push(player);
    }
  });

  return { teamA, teamB };
}

/**
 * Map tally: choose the map with the most votes (random tie-break)
 */
export function chooseMapFromVotes(
  votesPerPlayer: string[][],
  availableMaps: readonly string[] = MAPS,
  rng: () => number = Math.random
): string {
  const tally: Record<string, number> = {};
  for (const m of availableMaps) {
    tally[m] = 0;
  }

  for (const playerMaps of votesPerPlayer) {
    if (Array.isArray(playerMaps)) {
      for (const m of playerMaps) {
        if (tally[m] !== undefined) {
          tally[m]++;
        }
      }
    }
  }

  let maxVotes = -1;
  let topMaps: string[] = [];
  for (const m of availableMaps) {
    const count = tally[m] || 0;
    if (count > maxVotes) {
      maxVotes = count;
      topMaps = [m];
    } else if (count === maxVotes) {
      topMaps.push(m);
    }
  }

  if (topMaps.length === 0) {
    return availableMaps[0];
  }
  const chosenIdx = Math.floor(rng() * topMaps.length);
  return topMaps[chosenIdx];
}

/**
 * Computes Elo rating deltas:
 * Start 1000, K=24, expected score from the average rating of each team, minimum rating 100.
 * Void changes nothing (delta 0).
 */
export function computeEloDeltas(
  teamA: PlayerInfo[],
  teamB: PlayerInfo[],
  outcome: MatchOutcome
): Record<string, number> {
  const deltas: Record<string, number> = {};

  if (outcome === 'X') {
    // Void match changes nothing
    for (const p of [...teamA, ...teamB]) {
      deltas[p.id] = 0;
    }
    return deltas;
  }

  const avgA = teamA.reduce((sum, p) => sum + (p.elo || 1000), 0) / (teamA.length || 1);
  const avgB = teamB.reduce((sum, p) => sum + (p.elo || 1000), 0) / (teamB.length || 1);

  // Expected score for Team A
  const expectedA = 1 / (1 + Math.pow(10, (avgB - avgA) / 400));
  const expectedB = 1 - expectedA;

  const actualA = outcome === 'A' ? 1 : 0;
  const actualB = outcome === 'B' ? 1 : 0;

  const K = 24;
  const baseDeltaA = Math.round(K * (actualA - expectedA));
  const baseDeltaB = Math.round(K * (actualB - expectedB));

  for (const p of teamA) {
    const currentElo = p.elo || 1000;
    let delta = baseDeltaA;
    if (currentElo + delta < 100) {
      delta = 100 - currentElo;
    }
    deltas[p.id] = delta;
  }

  for (const p of teamB) {
    const currentElo = p.elo || 1000;
    let delta = baseDeltaB;
    if (currentElo + delta < 100) {
      delta = 100 - currentElo;
    }
    deltas[p.id] = delta;
  }

  return deltas;
}

/**
 * Generates a random 6-character server password.
 */
export function generateServerPassword(length = 6): string {
  const chars = '23456789abcdefghjkmnpqrstuvwxyz'; // readable charset without 0/O/1/l
  let pw = '';
  for (let i = 0; i < length; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
}

/**
 * Builds the ready-to-run HLDS command line for the host:
 * hlds.exe -console -game cstrike +port 27015 +maxplayers 11 +map <map> +sv_password <pw> +hostname "PUG <Map>"
 */
export function generateHldsCommand(map: string, pw: string): string {
  const cleanMap = map || 'de_dust2';
  return `hlds.exe -console -game cstrike +port 27015 +maxplayers 11 +map ${cleanMap} +sv_password ${pw} +hostname "PUG ${cleanMap}"`;
}

/**
 * Builds the player console connect command:
 * connect <ip:port>; password <pw>
 */
export function generateConnectCommand(addr: string, pw: string): string {
  return `connect ${addr}; password ${pw}`;
}

/**
 * Generates an in-game console command to launch a local training server while waiting in queue:
 */
export function generateWarmupConsoleCommand(
  map: string,
  preset: 'bots' | 'practice' | 'vanilla' = 'bots'
): string {
  const cleanMap = map || 'de_dust2';
  if (preset === 'bots') {
    return `map ${cleanMap}; bot_quota 9; mp_roundtime 9; mp_freezetime 0; mp_buytime 99; mp_startmoney 16000`;
  }
  if (preset === 'practice') {
    return `map ${cleanMap}; sv_cheats 1; sv_infinite_ammo 1; mp_roundtime 9; mp_buytime 99; mp_startmoney 16000; mp_freezetime 0`;
  }
  return `map ${cleanMap}`;
}

/**
 * Builds dedicated HLDS warmup server launch command (port 27016 to avoid clashing with match port 27015):
 */
export function generateWarmupHldsCommand(map: string, port = 27016): string {
  const cleanMap = map || 'de_dust2';
  return `hlds.exe -console -game cstrike +port ${port} +maxplayers 10 +map ${cleanMap} +hostname "CS 1.6 Warmup Training"`;
}

