import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validatePlayerName,
  getRank,
  balanceTeamsSnakeDraft,
  chooseMapFromVotes,
  computeEloDeltas,
  generateServerPassword,
  generateHldsCommand,
  generateConnectCommand,
  generateWarmupConsoleCommand,
  generateWarmupHldsCommand,
} from './matchmaking';

test('validatePlayerName checks length and allowed characters', () => {
  assert.equal(validatePlayerName('HeatoN').valid, true);
  assert.equal(validatePlayerName('f0rest_1.6-pro').valid, true);
  assert.equal(validatePlayerName('Neo 1337').valid, true);
  assert.equal(validatePlayerName('1234567890123456').valid, true); // exactly 16 chars

  // invalid
  assert.equal(validatePlayerName('').valid, false);
  assert.equal(validatePlayerName('   ').valid, false);
  assert.equal(validatePlayerName('WayTooLongPlayerNameThatExceeds16').valid, false);
  assert.equal(validatePlayerName('Sp@m$ter!').valid, false);
});

test('getRank maps ratings correctly to specified tiers', () => {
  assert.equal(getRank(850).name, 'Recruit');
  assert.equal(getRank(900).name, 'Regular');
  assert.equal(getRank(1000).name, 'Regular');
  assert.equal(getRank(1100).name, 'Veteran');
  assert.equal(getRank(1299).name, 'Veteran');
  assert.equal(getRank(1300).name, 'Elite');
  assert.equal(getRank(1499).name, 'Elite');
  assert.equal(getRank(1500).name, 'Legend');
  assert.equal(getRank(2000).name, 'Legend');
});

test('balanceTeamsSnakeDraft distributes 10 players by A,B,B,A,A,B,B,A,A,B', () => {
  const players = [
    { id: 'p1', name: 'P1', elo: 1500 },
    { id: 'p2', name: 'P2', elo: 1400 },
    { id: 'p3', name: 'P3', elo: 1300 },
    { id: 'p4', name: 'P4', elo: 1200 },
    { id: 'p5', name: 'P5', elo: 1100 },
    { id: 'p6', name: 'P6', elo: 1000 },
    { id: 'p7', name: 'P7', elo: 950 },
    { id: 'p8', name: 'P8', elo: 900 },
    { id: 'p9', name: 'P9', elo: 850 },
    { id: 'p10', name: 'P10', elo: 800 },
  ];

  const { teamA, teamB } = balanceTeamsSnakeDraft(players);
  assert.equal(teamA.length, 5);
  assert.equal(teamB.length, 5);

  assert.deepEqual(teamA.map((p) => p.id), ['p1', 'p4', 'p5', 'p8', 'p9']);
  assert.deepEqual(teamB.map((p) => p.id), ['p2', 'p3', 'p6', 'p7', 'p10']);

  const avgA = teamA.reduce((sum, p) => sum + p.elo, 0) / 5;
  const avgB = teamB.reduce((sum, p) => sum + p.elo, 0) / 5;
  assert.equal(avgA, 1110);
  assert.equal(avgB, 1090);
});

test('chooseMapFromVotes selects highest voted map or tie-break', () => {
  const votes = [
    ['de_inferno', 'de_dust2'],
    ['de_dust2'],
    ['de_dust2', 'de_mirage'],
    ['de_inferno'],
  ];
  const map = chooseMapFromVotes(votes, ['de_inferno', 'de_dust2', 'de_mirage']);
  assert.equal(map, 'de_dust2');

  const tieVotes = [
    ['de_inferno'],
    ['de_mirage'],
  ];
  const tieMap = chooseMapFromVotes(tieVotes, ['de_inferno', 'de_mirage'], () => 0);
  assert.equal(tieMap, 'de_inferno');
});

test('computeEloDeltas calculates K=24 Elo adjustments and handles minimum rating & void', () => {
  const teamA = [
    { id: 'a1', name: 'A1', elo: 1000 },
    { id: 'a2', name: 'A2', elo: 1000 },
    { id: 'a3', name: 'A3', elo: 1000 },
    { id: 'a4', name: 'A4', elo: 1000 },
    { id: 'a5', name: 'A5', elo: 1000 },
  ];
  const teamB = [
    { id: 'b1', name: 'B1', elo: 1000 },
    { id: 'b2', name: 'B2', elo: 1000 },
    { id: 'b3', name: 'B3', elo: 1000 },
    { id: 'b4', name: 'B4', elo: 1000 },
    { id: 'b5', name: 'B5', elo: 1000 },
  ];

  const deltasWinA = computeEloDeltas(teamA, teamB, 'A');
  assert.equal(deltasWinA['a1'], 12);
  assert.equal(deltasWinA['b1'], -12);

  const deltasVoid = computeEloDeltas(teamA, teamB, 'X');
  assert.equal(deltasVoid['a1'], 0);
  assert.equal(deltasVoid['b1'], 0);

  const lowPlayerTeam = [{ id: 'low', name: 'Low', elo: 105 }];
  const normalTeam = [{ id: 'norm', name: 'Norm', elo: 1200 }];
  const deltasLoss = computeEloDeltas(lowPlayerTeam, normalTeam, 'B');
  assert.ok(105 + deltasLoss['low'] >= 100);
});

test('command generators format HLDS, connect, and warmup training strings properly', () => {
  const hlds = generateHldsCommand('de_inferno', 'pug123');
  assert.equal(
    hlds,
    'hlds.exe -console -game cstrike +port 27015 +maxplayers 11 +map de_inferno +sv_password pug123 +hostname "PUG de_inferno"'
  );

  const connect = generateConnectCommand('192.168.1.100:27015', 'pug123');
  assert.equal(connect, 'connect 192.168.1.100:27015; password pug123');

  const pw = generateServerPassword();
  assert.equal(pw.length, 6);

  // Warmup commands
  const warmupBot = generateWarmupConsoleCommand('de_dust2', 'bots');
  assert.equal(
    warmupBot,
    'map de_dust2; bot_quota 9; mp_roundtime 9; mp_freezetime 0; mp_buytime 99; mp_startmoney 16000'
  );

  const warmupPractice = generateWarmupConsoleCommand('de_inferno', 'practice');
  assert.equal(
    warmupPractice,
    'map de_inferno; sv_cheats 1; sv_infinite_ammo 1; mp_roundtime 9; mp_buytime 99; mp_startmoney 16000; mp_freezetime 0'
  );

  const warmupHlds = generateWarmupHldsCommand('de_mirage', 27016);
  assert.equal(
    warmupHlds,
    'hlds.exe -console -game cstrike +port 27016 +maxplayers 10 +map de_mirage +hostname "CS 1.6 Warmup Training"'
  );
});
