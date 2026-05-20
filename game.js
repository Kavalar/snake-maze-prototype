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

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const levelLabel = document.getElementById('levelLabel');
const movesLabel = document.getElementById('movesLabel');
const lengthLabel = document.getElementById('lengthLabel');
const scoreLabel = document.getElementById('scoreLabel');
const restartBtn = document.getElementById('restartBtn');
const speedInput = document.getElementById('speedInput');
const speedValue = document.getElementById('speedValue');
const nextBtn = document.getElementById('nextBtn');
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
let touchStart = null;
let loopId = null;
let tickMs = DEFAULT_TICK_MS;
let cellSize = 40;
let totalScore = 0;
let levelStartScore = 0;

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
  tickMs = clamped;
  speedValue.textContent = `${tickMs} мс`;
  startLoop();
}

function updateHud() {
  movesLabel.textContent = `Ходи: ${moves}`;
  lengthLabel.textContent = `Довжина: ${snake.length}`;
  scoreLabel.textContent = `Очки: ${totalScore}`;
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
  gameOver = false;
  gameWon = false;

  spawnFood();
  resizeCanvasForGrid();

  levelLabel.textContent = `Рівень ${levelIndex + 1}/${LEVELS.length}`;
  updateHud();
  statusEl.textContent = food
    ? 'Змійка рухається сама. Міняй напрямок, збирай червоні клітинки і дійди до виходу.'
    : 'На старті доступної їжі немає. Йди одразу до виходу.';
  draw();
}

function step() {
  if (gameOver || gameWon) return;

  if (queuedDirection && OPPOSITE[direction] !== queuedDirection) {
    direction = queuedDirection;
  }

  const d = DIRS[direction];
  const head = snake[0];
  const nx = head.x + d.x;
  const ny = head.y + d.y;

  if (isWall(nx, ny)) {
    gameOver = true;
    statusEl.textContent = 'Програш: врізався у стіну. Перезапусти рівень.';
    draw();
    return;
  }

  const ateFood = food && nx === food.x && ny === food.y;
  const tail = snake[snake.length - 1];
  const hitSelf = snake.some((part, idx) => {
    if (part.x !== nx || part.y !== ny) return false;
    return !(idx === snake.length - 1 && !ateFood && part.x === tail.x && part.y === tail.y);
  });

  if (hitSelf) {
    gameOver = true;
    statusEl.textContent = 'Програш: врізався у себе. Перезапусти рівень.';
    draw();
    return;
  }

  snake.unshift({ x: nx, y: ny });

  if (ateFood) {
    totalScore += FOOD_POINTS;
    spawnFood();
    if (!food && !gameWon) {
      statusEl.textContent = 'Попереду немає доступної їжі. Можна йти на вихід.';
    }
  } else {
    snake.pop();
  }

  moves += 1;
  updateHud();

  if (nx === exit.x && ny === exit.y) {
    totalScore += EXIT_POINTS;
    gameWon = true;
    updateHud();
    statusEl.textContent =
      levelIndex === LEVELS.length - 1
        ? 'Ти пройшов усі рівні. Можна додавати нові механіки.'
        : 'Рівень пройдено. Тисни "Наступний рівень".';
    draw();
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
  const pad = Math.max(2, Math.floor(cellSize * 0.12));
  const eyeR = Math.max(2, Math.floor(cellSize * 0.08));
  const eyeOffset = Math.floor(cellSize * 0.24);
  const centerX = px + Math.floor(cellSize / 2);
  const centerY = py + Math.floor(cellSize / 2);

  ctx.fillStyle = '#0f4d2c';
  ctx.fillRect(px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2);

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

  ctx.fillStyle = '#111111';
  ctx.beginPath();
  ctx.arc(eye1.x, eye1.y, Math.max(1, eyeR - 1), 0, Math.PI * 2);
  ctx.arc(eye2.x, eye2.y, Math.max(1, eyeR - 1), 0, Math.PI * 2);
  ctx.fill();
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

padButtons.forEach((btn) => {
  btn.addEventListener('click', () => setDirection(btn.dataset.dir));
});

speedInput.addEventListener('input', (e) => {
  const next = Number(e.target.value);
  setSpeed(Number.isFinite(next) ? next : DEFAULT_TICK_MS);
});

window.addEventListener('keydown', onKey, { passive: false });
canvas.addEventListener('touchstart', onTouchStart, { passive: true });
canvas.addEventListener('touchend', onTouchEnd, { passive: true });

setSpeed(Number(speedInput.value) || DEFAULT_TICK_MS);
resetLevel();
