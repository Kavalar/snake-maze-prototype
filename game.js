const CELL = {
  WALL: '#',
  EMPTY: '.',
  EXIT: 'E',
  START: 'S',
};

const LEVELS = [
  [
    '############',
    '#S...#.....#',
    '#.##.#.###.#',
    '#....#...#.#',
    '####.###.#.#',
    '#......#.#.#',
    '#.######.#.#',
    '#........#E#',
    '############',
  ],
  [
    '############',
    '#S....#....#',
    '#.##.##.##.#',
    '#.#.....##.#',
    '#.#.###....#',
    '#...#..###.#',
    '###.#.##...#',
    '#....#....E#',
    '############',
  ],
  [
    '############',
    '#S.....#...#',
    '#.####.#.#.#',
    '#....#.#.#.#',
    '####.#.#.#.#',
    '#....#...#.#',
    '#.######.#.#',
    '#........#E#',
    '############',
  ],
  [
    '############',
    '#S...#.....#',
    '###.#.###..#',
    '#...#...##.#',
    '#.#####....#',
    '#.....####.#',
    '#.###......#',
    '#...######E#',
    '############',
  ],
  [
    '############',
    '#S......#..#',
    '#.#######.##',
    '#...#......#',
    '###.#.######',
    '#...#......#',
    '#.#####.##.#',
    '#.......##E#',
    '############',
  ],
];

const DIRS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const OPPOSITE = {
  up: 'down',
  down: 'up',
  left: 'right',
  right: 'left',
};

const DEFAULT_TICK_MS = 320;
const MAX_CANVAS_SIZE = 480;
const FOOD_POINTS = 10;
const EXIT_POINTS = 50;
const LEVEL_GOALS = [2, 2, 3, 3, 4];
const BOOSTER_CONFIG = {
  turboGhost: {
    durationMs: 7000,
    speedMultiplier: 0.55,
    chargesPerLevel: 1,
  },
};
// enabled | disabled | hidden
const START_BUTTON_MODE = 'hidden';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const levelLabel = document.getElementById('levelLabel');
const movesLabel = document.getElementById('movesLabel');
const lengthLabel = document.getElementById('lengthLabel');
const detailsLabel = document.getElementById('detailsLabel') || { textContent: '' };
const scoreLabel = document.getElementById('scoreLabel');
const boosterTimerLabel = document.getElementById('boosterTimerLabel') || { textContent: '' };
const buildLabel = document.getElementById('buildLabel') || { textContent: '' };
const resultOverlay = document.getElementById('resultOverlay') || { hidden: true };
const overlayTitle = document.getElementById('overlayTitle') || { textContent: '' };
const overlayText = document.getElementById('overlayText') || { textContent: '' };
const overlayStats = document.getElementById('overlayStats') || { innerHTML: '' };
const overlayRestartBtn = document.getElementById('overlayRestartBtn') || { addEventListener: () => {} };
const overlayNextBtn = document.getElementById('overlayNextBtn') || { addEventListener: () => {}, disabled: true, style: {} };
const startBtn = document.getElementById('startBtn') || { addEventListener: () => {}, disabled: true, style: {} };
const restartBtn = document.getElementById('restartBtn');
const speedInput = document.getElementById('speedInput');
const speedValue = document.getElementById('speedValue');
const nextBtn = document.getElementById('nextBtn');
const booster1Btn = document.getElementById('booster1Btn') || { addEventListener: () => {}, disabled: true, textContent: '' };
const padButtons = document.querySelectorAll('.pad button[data-dir]');

let levelIndex = 0;
let grid = [];
let snake = [];
let exit = { x: 0, y: 0 };
let food = null;
let direction = 'right';
let queuedDirection = 'right';
let moves = 0;
let gameOver = false;
let gameWon = false;
let isPlaying = false;
let touchStart = null;
let loopId = null;
let baseTickMs = DEFAULT_TICK_MS;
let tickMs = DEFAULT_TICK_MS;
let cellSize = 40;
let totalScore = 0;
let levelStartScore = 0;
let detailsCollected = 0;
let detailsGoal = 0;
const BUILD_VERSION = 'v0.8';
let booster1Charges = BOOSTER_CONFIG.turboGhost.chargesPerLevel;
let boosterActiveUntil = 0;

function parseLevel(levelRows) {
  const parsed = levelRows.map((row) => row.split(''));
  let start = null;
  let foundExit = null;

  parsed.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell === CELL.START) {
        start = { x, y };
        parsed[y][x] = CELL.EMPTY;
      }
      if (cell === CELL.EXIT) {
        foundExit = { x, y };
      }
    });
  });

  if (!start || !foundExit) {
    throw new Error('Рівень має містити S та E');
  }

  return { parsed, start, foundExit };
}

function inBounds(x, y) {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

function isWall(x, y) {
  return !inBounds(x, y) || grid[y][x] === CELL.WALL;
}

function isSnake(x, y) {
  return snake.some((part) => part.x === x && part.y === y);
}

function getReachableFoodCells() {
  if (!snake.length) return [];

  const rows = grid.length;
  const cols = grid[0].length;
  const visited = new Set();
  const queue = [snake[0]];
  const candidates = [];

  visited.add(`${snake[0].x},${snake[0].y}`);

  while (queue.length) {
    const current = queue.shift();

    Object.values(DIRS).forEach((dir) => {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const key = `${nx},${ny}`;

      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) return;
      if (visited.has(key)) return;
      if (grid[ny][nx] === CELL.WALL) return;
