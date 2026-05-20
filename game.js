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
const detailsLabel = document.getElementById('detailsLabel');
const scoreLabel = document.getElementById('scoreLabel');
const boosterTimerLabel = document.getElementById('boosterTimerLabel');
const buildLabel = document.getElementById('buildLabel');
const resultOverlay = document.getElementById('resultOverlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlayText = document.getElementById('overlayText');
const overlayStats = document.getElementById('overlayStats');
const overlayRestartBtn = document.getElementById('overlayRestartBtn');
const overlayNextBtn = document.getElementById('overlayNextBtn');
const startBtn = document.getElementById('startBtn');
const restartBtn = document.getElementById('restartBtn');
const speedInput = document.getElementById('speedInput');
const speedValue = document.getElementById('speedValue');
const nextBtn = document.getElementById('nextBtn');
const booster1Btn = document.getElementById('booster1Btn');
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
const BUILD_VERSION = 'v0.7';
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
      if (isSnake(nx, ny)) return;

      visited.add(key);
      queue.push({ x: nx, y: ny });

      if (grid[ny][nx] === CELL.EMPTY && !(nx === exit.x && ny === exit.y)) {
        candidates.push({ x: nx, y: ny });
      }
    });
  }

  return candidates;
}

function getInitialDirection(start) {
  const order = ['right', 'down', 'left', 'up'];
  return order.find((dir) => {
    const d = DIRS[dir];
    return !isWall(start.x + d.x, start.y + d.y);
  }) || 'right';
}

function buildInitialSnake(start, dirName) {
  const d = DIRS[dirName];
  const body = [{ x: start.x, y: start.y }];

  for (let i = 1; i <= 2; i += 1) {
    const bx = start.x - d.x * i;
    const by = start.y - d.y * i;
    if (isWall(bx, by) || (bx === exit.x && by === exit.y)) break;
    body.push({ x: bx, y: by });
  }

  return body;
}

function spawnFood() {
  const candidates = getReachableFoodCells();

  food = candidates.length
    ? candidates[Math.floor(Math.random() * candidates.length)]
    : null;
}

function setDirection(nextDir) {
  if (!DIRS[nextDir]) return;

  const baseDir = queuedDirection || direction;
  if (snake.length > 1 && OPPOSITE[baseDir] === nextDir) {
    return;
  }

  queuedDirection = nextDir;
}

function resizeCanvasForGrid() {
  const cols = grid[0].length;
  const rows = grid.length;
  cellSize = Math.floor(Math.min(MAX_CANVAS_SIZE / cols, MAX_CANVAS_SIZE / rows));
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
}

function setSpeed(ms) {
  const clamped = Math.max(120, Math.min(520, ms));
  baseTickMs = clamped;
  recalcTickMs();
  speedValue.textContent = `${baseTickMs} мс`;
}

function recalcTickMs() {
  const boosterActive = Date.now() < boosterActiveUntil;
  tickMs = boosterActive
    ? Math.max(60, Math.round(baseTickMs * BOOSTER_CONFIG.turboGhost.speedMultiplier))
    : baseTickMs;
  startLoop();
}

function setPlaying(nextPlaying) {
  isPlaying = nextPlaying;
  applyStartButtonMode();
}

function applyStartButtonMode() {
  if (START_BUTTON_MODE === 'hidden') {
    startBtn.style.display = 'none';
    startBtn.disabled = true;
    return;
  }

  startBtn.style.display = '';
  if (START_BUTTON_MODE === 'disabled') {
    startBtn.disabled = true;
    return;
  }

  startBtn.disabled = isPlaying;
}

function updateBoosterState() {
  const msLeft = Math.max(0, boosterActiveUntil - Date.now());
  const secLeft = (msLeft / 1000).toFixed(1);
  boosterTimerLabel.textContent = `Бустер: ${secLeft}с`;

  if (msLeft <= 0 && boosterActiveUntil !== 0) {
    boosterActiveUntil = 0;
    recalcTickMs();
  }

  booster1Btn.textContent =
    booster1Charges > 0
      ? `Бустер 1: Turbo Ghost (${booster1Charges})`
      : 'Бустер 1: Turbo Ghost (0)';
  booster1Btn.disabled = booster1Charges <= 0 || msLeft > 0 || gameOver || gameWon || !isPlaying;
}

function activateBooster1() {
  if (booster1Charges <= 0 || gameOver || gameWon || !isPlaying) return;
  if (Date.now() < boosterActiveUntil) return;

  booster1Charges -= 1;
  boosterActiveUntil = Date.now() + BOOSTER_CONFIG.turboGhost.durationMs;
  statusEl.textContent = 'Turbo Ghost активний: прискорення, безсмертя і пробивання стін.';
  recalcTickMs();
  updateBoosterState();
}

function tryStartLevel() {
  if (gameOver || gameWon || isPlaying) return false;
  setPlaying(true);
  statusEl.textContent = `Рівень запущено. Збери ${detailsGoal} деталей і дійди до виходу.`;
  updateHud();
  return true;
}

function updateHud() {
  movesLabel.textContent = `Ходи: ${moves}`;
  lengthLabel.textContent = `Довжина: ${snake.length}`;
  detailsLabel.textContent = `Деталі: ${detailsCollected}/${detailsGoal}`;
  scoreLabel.textContent = `Очки: ${totalScore}`;
  buildLabel.textContent = BUILD_VERSION;
  updateBoosterState();
}

function hideOverlay() {
  resultOverlay.hidden = true;
}

function showOverlay(title, text, canGoNext) {
  const levelGain = totalScore - levelStartScore;

  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayStats.innerHTML = [
    `Очки: ${totalScore}`,
    `За рівень: +${Math.max(0, levelGain)}`,
    `Ходи: ${moves}`,
    `Довжина: ${snake.length}`,
    `Деталі: ${detailsCollected}/${detailsGoal}`,
  ]
    .map((item) => `<span>${item}</span>`)
    .join('');

  overlayNextBtn.disabled = !canGoNext;
  overlayNextBtn.style.opacity = canGoNext ? '1' : '0.5';
  resultOverlay.hidden = false;
}

function resetLevel(options = {}) {
  const { restartCurrent = false } = options;
  if (restartCurrent) {
    totalScore = levelStartScore;
  } else {
    levelStartScore = totalScore;
  }

  const { parsed, start, foundExit } = parseLevel(LEVELS[levelIndex]);
  grid = parsed;
  exit = foundExit;
  direction = getInitialDirection(start);
  queuedDirection = direction;
  snake = buildInitialSnake(start, direction);
  moves = 0;
  detailsCollected = 0;
  detailsGoal = LEVEL_GOALS[levelIndex] || 3;
  booster1Charges = BOOSTER_CONFIG.turboGhost.chargesPerLevel;
  boosterActiveUntil = 0;
  gameOver = false;
  gameWon = false;
  setPlaying(false);
  hideOverlay();

  spawnFood();
  resizeCanvasForGrid();

  levelLabel.textContent = `Рівень ${levelIndex + 1}/${LEVELS.length}`;
  updateHud();
  statusEl.textContent = food
    ? `Торкнись поля, щоб стартувати. Ціль: зібрати 0/${detailsGoal} деталей і дійти до виходу.`
    : 'На старті немає доступної деталі. Перезапусти рівень.';
  draw();
}

function step() {
  if (gameOver || gameWon || !isPlaying) return;

  updateBoosterState();
  const boosterActive = Date.now() < boosterActiveUntil;

  if (queuedDirection && OPPOSITE[direction] !== queuedDirection) {
    direction = queuedDirection;
  }

  const d = DIRS[direction];
  const head = snake[0];
  const nx = head.x + d.x;
  const ny = head.y + d.y;
  const tryingToExit = nx === exit.x && ny === exit.y;

  if (tryingToExit && detailsCollected < detailsGoal) {
    const missing = detailsGoal - detailsCollected;
    statusEl.textContent = `Ще треба зібрати деталей: ${missing}.`;
    draw();
    return;
  }

  if (isWall(nx, ny)) {
    if (boosterActive && inBounds(nx, ny) && grid[ny][nx] === CELL.WALL) {
      grid[ny][nx] = CELL.EMPTY;
    } else {
      gameOver = true;
      setPlaying(false);
      statusEl.textContent = 'Програш: врізався у стіну. Перезапусти рівень.';
      draw();
      showOverlay('Програш', 'Ти врізався у стіну.', false);
      return;
    }
  }

  const ateFood = food && nx === food.x && ny === food.y;
  const tail = snake[snake.length - 1];
  const hitSelf = snake.some((part, idx) => {
    if (part.x !== nx || part.y !== ny) return false;
    return !(idx === snake.length - 1 && !ateFood && part.x === tail.x && part.y === tail.y);
  });

  if (hitSelf && !boosterActive) {
    gameOver = true;
    setPlaying(false);
    statusEl.textContent = 'Програш: врізався у себе. Перезапусти рівень.';
    draw();
    showOverlay('Програш', 'Ти врізався у себе.', false);
    return;
  }

  snake.unshift({ x: nx, y: ny });

  if (ateFood) {
    totalScore += FOOD_POINTS;
    detailsCollected += 1;
    if (detailsCollected >= detailsGoal) {
      food = null;
      statusEl.textContent = 'Ціль виконана. Тепер йди на вихід.';
    } else {
      spawnFood();
      if (!food && !gameWon) {
        statusEl.textContent = 'Доступних деталей не залишилось. Спробуй перезапуск рівня.';
      }
    }
  } else {
    snake.pop();
  }

  moves += 1;
  updateHud();

  if (tryingToExit) {
    totalScore += EXIT_POINTS;
    gameWon = true;
    setPlaying(false);
    updateHud();
    const hasNext = levelIndex < LEVELS.length - 1;
    statusEl.textContent =
      !hasNext
        ? 'Ти пройшов усі рівні. Можна додавати нові механіки.'
        : 'Рівень пройдено. Тисни "Наступний рівень".';
    draw();
    showOverlay(
      !hasNext ? 'Фінальна Перемога' : 'Рівень Пройдено',
      !hasNext ? 'Ти закрив усі рівні.' : 'Круто, готовий до наступного?',
      hasNext
    );
    return;
  }

  draw();
}

function startLoop() {
  if (loopId) clearInterval(loopId);
  loopId = setInterval(step, tickMs);
}

function drawCell(x, y, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize);
}

function drawHead(x, y, dirName) {
  const px = x * cellSize;
  const py = y * cellSize;
  const pad = Math.max(2, Math.floor(cellSize * 0.08));
  const eyeR = Math.max(3, Math.floor(cellSize * 0.16));
  const eyeOffset = Math.floor(cellSize * 0.23);
  const tip = Math.max(4, Math.floor(cellSize * 0.24));
  const centerX = px + Math.floor(cellSize / 2);
  const centerY = py + Math.floor(cellSize / 2);

  ctx.fillStyle = '#0b3f24';
  if (dirName === 'up') {
    ctx.fillRect(px + pad, py + pad + tip, cellSize - pad * 2, cellSize - pad * 2 - tip);
    ctx.beginPath();
    ctx.moveTo(centerX, py + pad);
    ctx.lineTo(px + cellSize - pad, py + pad + tip + 1);
    ctx.lineTo(px + pad, py + pad + tip + 1);
    ctx.closePath();
    ctx.fill();
  } else if (dirName === 'down') {
    ctx.fillRect(px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2 - tip);
    ctx.beginPath();
    ctx.moveTo(centerX, py + cellSize - pad);
    ctx.lineTo(px + cellSize - pad, py + cellSize - pad - tip - 1);
    ctx.lineTo(px + pad, py + cellSize - pad - tip - 1);
    ctx.closePath();
    ctx.fill();
  } else if (dirName === 'left') {
    ctx.fillRect(px + pad + tip, py + pad, cellSize - pad * 2 - tip, cellSize - pad * 2);
    ctx.beginPath();
    ctx.moveTo(px + pad, centerY);
    ctx.lineTo(px + pad + tip + 1, py + pad);
    ctx.lineTo(px + pad + tip + 1, py + cellSize - pad);
    ctx.closePath();
    ctx.fill();
  } else {
    ctx.fillRect(px + pad, py + pad, cellSize - pad * 2 - tip, cellSize - pad * 2);
    ctx.beginPath();
    ctx.moveTo(px + cellSize - pad, centerY);
    ctx.lineTo(px + cellSize - pad - tip - 1, py + pad);
    ctx.lineTo(px + cellSize - pad - tip - 1, py + cellSize - pad);
    ctx.closePath();
    ctx.fill();
  }

  let eye1 = { x: centerX - eyeOffset, y: centerY - eyeOffset };
  let eye2 = { x: centerX + eyeOffset, y: centerY - eyeOffset };

  if (dirName === 'down') {
    eye1 = { x: centerX - eyeOffset, y: centerY + eyeOffset };
    eye2 = { x: centerX + eyeOffset, y: centerY + eyeOffset };
  } else if (dirName === 'left') {
    eye1 = { x: centerX - eyeOffset, y: centerY - eyeOffset };
    eye2 = { x: centerX - eyeOffset, y: centerY + eyeOffset };
  } else if (dirName === 'right') {
    eye1 = { x: centerX + eyeOffset, y: centerY - eyeOffset };
    eye2 = { x: centerX + eyeOffset, y: centerY + eyeOffset };
  }

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(eye1.x, eye1.y, eyeR, 0, Math.PI * 2);
  ctx.arc(eye2.x, eye2.y, eyeR, 0, Math.PI * 2);
  ctx.fill();

  const pupilShift = Math.max(1, Math.floor(cellSize * 0.08));
  const d = DIRS[dirName] || DIRS.right;
  const p1x = eye1.x + d.x * pupilShift;
  const p1y = eye1.y + d.y * pupilShift;
  const p2x = eye2.x + d.x * pupilShift;
  const p2y = eye2.y + d.y * pupilShift;

  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(p1x, p1y, Math.max(2, eyeR - 2), 0, Math.PI * 2);
  ctx.arc(p2x, p2y, Math.max(2, eyeR - 2), 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#f2994a';
  if (dirName === 'up') {
    ctx.fillRect(centerX - 3, py + pad - 1, 6, 4);
  } else if (dirName === 'down') {
    ctx.fillRect(centerX - 3, py + cellSize - pad - 3, 6, 4);
  } else if (dirName === 'left') {
    ctx.fillRect(px + pad - 1, centerY - 3, 4, 6);
  } else {
    ctx.fillRect(px + cellSize - pad - 3, centerY - 3, 4, 6);
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < grid.length; y += 1) {
    for (let x = 0; x < grid[y].length; x += 1) {
      const cell = grid[y][x];
      drawCell(x, y, cell === CELL.WALL ? '#111' : '#fff');

      if (x === exit.x && y === exit.y) {
        drawCell(x, y, '#d35400');
      }
    }
  }

  if (food) {
    drawCell(food.x, food.y, '#d32f2f');
  }

  snake.forEach((part, idx) => {
    if (idx === 0) {
      drawHead(part.x, part.y, direction);
    } else {
      drawCell(part.x, part.y, '#2e8b57');
    }
  });

  const cols = grid[0].length;
  const rows = grid.length;
  ctx.strokeStyle = '#e7e7e7';
  ctx.lineWidth = 1;

  for (let x = 0; x <= cols; x += 1) {
    const px = x * cellSize;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvas.height);
    ctx.stroke();
  }

  for (let y = 0; y <= rows; y += 1) {
    const py = y * cellSize;
    ctx.beginPath();
    ctx.moveTo(0, py);
    ctx.lineTo(canvas.width, py);
    ctx.stroke();
  }
}

function onKey(e) {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    tryStartLevel();
    return;
  }

  const keyMap = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    w: 'up',
    s: 'down',
    a: 'left',
    d: 'right',
  };

  const dir = keyMap[e.key];
  if (dir) {
    e.preventDefault();
    setDirection(dir);
  }
}

function onTouchStart(e) {
  tryStartLevel();
  const t = e.changedTouches[0];
  touchStart = { x: t.clientX, y: t.clientY };
}

function onTouchEnd(e) {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x;
  const dy = t.clientY - touchStart.y;
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);

  if (Math.max(absX, absY) < 18) {
    touchStart = null;
    return;
  }

  if (absX > absY) {
    setDirection(dx > 0 ? 'right' : 'left');
  } else {
    setDirection(dy > 0 ? 'down' : 'up');
  }

  touchStart = null;
}

restartBtn.addEventListener('click', () => resetLevel({ restartCurrent: true }));
nextBtn.addEventListener('click', () => {
  if (levelIndex < LEVELS.length - 1) {
    levelIndex += 1;
    resetLevel();
  }
});
startBtn.addEventListener('click', () => {
  tryStartLevel();
});
overlayRestartBtn.addEventListener('click', () => resetLevel({ restartCurrent: true }));
overlayNextBtn.addEventListener('click', () => {
  if (levelIndex < LEVELS.length - 1) {
    levelIndex += 1;
    resetLevel();
  }
});

padButtons.forEach((btn) => {
  btn.addEventListener('click', () => setDirection(btn.dataset.dir));
});
booster1Btn.addEventListener('click', activateBooster1);

speedInput.addEventListener('input', (e) => {
  const next = Number(e.target.value);
  setSpeed(Number.isFinite(next) ? next : DEFAULT_TICK_MS);
});

window.addEventListener('keydown', onKey, { passive: false });
canvas.addEventListener('click', tryStartLevel);
canvas.addEventListener('touchstart', onTouchStart, { passive: true });
canvas.addEventListener('touchend', onTouchEnd, { passive: true });

setSpeed(Number(speedInput.value) || DEFAULT_TICK_MS);
resetLevel();
