const gameBoard = document.getElementById('game-board');
const scoreDisplay = document.getElementById('score');
const levelDisplay = document.getElementById('level');
const startStopButton = document.getElementById('start-stop-button');
const takeMinorPrizeButton = document.getElementById('take-minor-prize-button');
const messageArea = document.getElementById('message-area');
const winMessage = document.getElementById('win-message');

const BOARD_WIDTH = 7;
const BOARD_HEIGHT = 15;
const MINOR_PRIZE_LEVEL = 11;
const MAJOR_PRIZE_LEVEL = 15;

let currentLevel = 1;
let score = 0;
let activeBlocks = []; // {row, col}
let placedBlocks = []; // [{row, col}...]
let blockSpeed = 333; // Milliseconds per move (approx 3 slots per second)
let blockCount = 3;
let currentDirection = 1; // 1 for right, -1 for left
let currentRow = 0; // Current row being built (0 is bottom)
let gameInterval;
let isGameRunning = false;
let canStop = false; // To prevent multiple stops

// Sound synthesis
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type, frequency, duration = 0.1, waveform = 'sine') {
    if (!audioContext) return;
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.type = waveform;
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime); // Volume
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
}

function playMoveSound() {
    playSound('move', 261.63); // C4
}

function playStackSound(level) {
    // Increases key with level (C major scale notes)
    const baseFrequencies = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25];
    const freqIndex = (level -1) % baseFrequencies.length;
    playSound('stack', baseFrequencies[freqIndex] * (1 + Math.floor((level-1)/baseFrequencies.length)), 0.15, 'triangle');
}

function playMinorPrizeSound() {
    const notes = [392.00, 440.00, 493.88]; // G4, A4, B4
    notes.forEach((note, i) => {
        setTimeout(() => playSound('minor_prize', note, 0.2, 'square'), i * 150);
    });
}

function playMajorPrizeSound() {
    const notes = [
        523.25, 587.33, 659.25, 698.46, 783.99, 880.00, 987.77, 1046.50,
        783.99, 659.25
    ]; // C5 octave up then down
    notes.forEach((note, i) => {
        setTimeout(() => playSound('major_prize', note, 0.15, 'sawtooth'), i * 100);
    });
}


function createBoard() {
    gameBoard.innerHTML = ''; // Clear previous board

    // Determine cell dimensions based on screen width for responsive prize line positioning
    const isSmallScreen = window.innerWidth <= 600;
    const cellHeight = isSmallScreen ? 25 : 30; // Matches CSS media query
    const cellGap = 2; // Matches CSS gap
    const totalCellHeight = cellHeight + cellGap;

    for (let r = 0; r < BOARD_HEIGHT; r++) {
        for (let c = 0; c < BOARD_WIDTH; c++) {
            const cell = document.createElement('div');
            cell.id = `cell-${BOARD_HEIGHT - 1 - r}-${c}`;
            gameBoard.appendChild(cell);
        }
    }

    // Add prize lines and labels
    const minorLine = document.createElement('div');
    minorLine.classList.add('prize-line');
    minorLine.id = 'minor-prize-line-js';
    // Line is effectively *above* the 10th row from the bottom (which is index 10 because currentRow is 0-indexed)
    // So it's at the top of the 11th visual slot. MINOR_PRIZE_LEVEL = 11
    // The 11th row from the bottom has its base at (11-1) * totalCellHeight. The line is above this.
    minorLine.style.bottom = `${(MINOR_PRIZE_LEVEL -1) * totalCellHeight + cellHeight}px`;
    minorLine.style.backgroundColor = 'yellow';
    gameBoard.appendChild(minorLine);

    const minorLabel = document.createElement('div');
    minorLabel.classList.add('prize-label');
    minorLabel.textContent = "Minor Prize (11)";
    minorLabel.style.bottom = `${(MINOR_PRIZE_LEVEL -1) * totalCellHeight + cellHeight + 2}px`; // Position slightly above the line
    minorLabel.style.color = 'yellow';
    gameBoard.appendChild(minorLabel);


    const majorLine = document.createElement('div');
    majorLine.classList.add('prize-line');
    majorLine.id = 'major-prize-line-js';
    // Line is above the 15th row (index 14)
    majorLine.style.bottom = `${(MAJOR_PRIZE_LEVEL -1) * totalCellHeight + cellHeight}px`;
    majorLine.style.backgroundColor = 'red';
    gameBoard.appendChild(majorLine);

    const majorLabel = document.createElement('div');
    majorLabel.classList.add('prize-label');
    majorLabel.textContent = "Major Prize (15)";
    // Position slightly above the line, adjust for visibility if it's at the very top
    let majorLabelBottom = (MAJOR_PRIZE_LEVEL -1) * totalCellHeight + cellHeight + 2;
    if (MAJOR_PRIZE_LEVEL === BOARD_HEIGHT) { // If major prize is the top-most row
       majorLabelBottom = (MAJOR_PRIZE_LEVEL -1) * totalCellHeight + cellHeight -18; // Adjust to be below line, within board
       majorLabel.style.backgroundColor = 'rgba(44, 62, 80, 0.7)'; // Add background for readability
    }
    majorLabel.style.bottom = `${majorLabelBottom}px`;
    majorLabel.style.color = 'red';
    gameBoard.appendChild(majorLabel);
}

function updateDisplay() {
    // Clear all blocks
    document.querySelectorAll('#game-board div:not(.prize-line)').forEach(cell => {
        cell.classList.remove('active-block', 'placed-block', 'block');
    });

    // Draw placed blocks
    placedBlocks.forEach(blockSegment => {
        blockSegment.forEach(b => {
            const cell = document.getElementById(`cell-${b.row}-${b.col}`);
            if (cell) {
                cell.classList.add('placed-block', 'block');
            }
        });
    });

    // Draw active blocks
    activeBlocks.forEach(b => {
        const cell = document.getElementById(`cell-${b.row}-${b.col}`);
        if (cell) {
            cell.classList.add('active-block', 'block');
        }
    });

    scoreDisplay.textContent = score;
    levelDisplay.textContent = currentLevel;
}

function moveBlocks() {
    if (!isGameRunning) return;

    // Clear previous active block positions
    activeBlocks.forEach(b => {
        const cell = document.getElementById(`cell-${b.row}-${b.col}`);
        if (cell) cell.classList.remove('active-block', 'block');
    });

    let canMove = true;
    let newActiveBlocks = activeBlocks.map(b => ({ ...b, col: b.col + currentDirection }));

    // Check boundaries
    if (newActiveBlocks.some(b => b.col < 0 || b.col >= BOARD_WIDTH)) {
        currentDirection *= -1; // Reverse direction
        newActiveBlocks = activeBlocks.map(b => ({ ...b, col: b.col + currentDirection })); // Move back and then in new direction
    }
    activeBlocks = newActiveBlocks;
    playMoveSound();
    updateDisplay();
}


function stopBlocks() {
    if (!canStop || !isGameRunning) return;
    canStop = false; // Prevent multiple stops before next round
    clearInterval(gameInterval);

    let currentPlacedLayer = [];
    if (currentRow === 0) { // First row
        currentPlacedLayer = activeBlocks.map(b => ({ ...b }));
    } else {
        const previousLayer = placedBlocks[placedBlocks.length - 1];
        activeBlocks.forEach(b => {
            if (previousLayer.some(pb => pb.col === b.col)) {
                currentPlacedLayer.push({ ...b });
            }
        });
    }

    if (currentPlacedLayer.length === 0) {
        gameOver("Missed completely!");
        return;
    }

    placedBlocks.push(currentPlacedLayer);
    blockCount = currentPlacedLayer.length; // Number of blocks for next round is what was successfully stacked
    playStackSound(currentLevel);


    if (currentRow + 1 === MINOR_PRIZE_LEVEL) {
        messageArea.textContent = "Minor Prize Level Reached! Take prize or continue?";
        takeMinorPrizeButton.style.display = 'inline-block';
        startStopButton.textContent = 'Continue';
        startStopButton.disabled = false; // Enable continue button
    } else if (currentRow + 1 === MAJOR_PRIZE_LEVEL) {
        majorPrizeWin();
        return;
    }

    // Prepare for next level if not at a prize decision point
    if (currentRow + 1 < MINOR_PRIZE_LEVEL || currentLevel > MINOR_PRIZE_LEVEL) {
         if (currentRow + 1 < MAJOR_PRIZE_LEVEL) {
            nextLevel();
        }
    }
     updateDisplay(); // Update to show newly placed blocks
}

function nextLevel() {
    currentLevel++;
    currentRow++;

    if (currentLevel >= 4 && currentLevel < 10) {
        blockCount = Math.min(blockCount, 2);
    } else if (currentLevel >= 10) {
        blockCount = Math.min(blockCount, 1);
    }
    if (blockCount === 0) { // Edge case if somehow blockCount reduced to 0 after check
        gameOver("No blocks left to stack!");
        return;
    }

    blockSpeed = Math.max(80, 333 - (currentLevel * 25)); // Increase speed more aggressively
    startNewRound();
}

function startNewRound() {
    activeBlocks = [];
    // const startCol = Math.floor((BOARD_WIDTH - blockCount) / 2);
    // Spawn new blocks at random positions
    const maxStartCol = BOARD_WIDTH - blockCount;
    const startCol = Math.floor(Math.random() * (maxStartCol + 1));

    for (let i = 0; i < blockCount; i++) {
        activeBlocks.push({ row: currentRow, col: startCol + i });
    }
    currentDirection = 1;
    startStopButton.textContent = 'Stop';
    startStopButton.disabled = false;
    takeMinorPrizeButton.style.display = 'none';
    messageArea.textContent = '';
    canStop = true;
    gameInterval = setInterval(moveBlocks, blockSpeed);
    updateDisplay();
}

function startGame() {
    isGameRunning = true;
    currentLevel = 1;
    score = 0;
    currentRow = 0;
    blockCount = 3;
    blockSpeed = 333;
    placedBlocks = [];
    winMessage.style.display = 'none';
    startStopButton.disabled = true; // Will be enabled in startNewRound

    createBoard(); // Initialize board cells
    startNewRound();
}


function gameOver(reason) {
    isGameRunning = false;
    clearInterval(gameInterval);
    messageArea.textContent = `Game Over! ${reason}`;
    startStopButton.textContent = 'Restart';
    startStopButton.disabled = false;
    takeMinorPrizeButton.style.display = 'none';
    // Optionally play a game over sound
    playSound('game_over', 100, 0.5, 'square');
}

function takeMinorPrize() {
    score += 100;
    gameOver("You took the Minor Prize!");
    updateDisplay();
    takeMinorPrizeButton.style.display = 'none';
    startStopButton.textContent = 'Restart';
}

function majorPrizeWin() {
    isGameRunning = false;
    clearInterval(gameInterval);
    score += 1000000;
    messageArea.textContent = "MAJOR PRIZE WON!!!";
    winMessage.style.display = 'block';
    startStopButton.textContent = 'Play Again?';
    startStopButton.disabled = false;
    takeMinorPrizeButton.style.display = 'none';
    playMajorPrizeSound();

    // Flashing "WIN" text (CSS handles animation, JS ensures it's visible)
    let flashCount = 0;
    const winFlashInterval = setInterval(() => {
        winMessage.style.color = flashCount % 2 === 0 ? '#f1c40f' : '#e67e22';
        flashCount++;
        if (flashCount > 20) clearInterval(winFlashInterval); // Stop flashing after some time
    }, 200);
}


startStopButton.addEventListener('click', () => {
    if (!isGameRunning && (startStopButton.textContent === 'Start' || startStopButton.textContent === 'Restart' || startStopButton.textContent === 'Play Again?')) {
        startGame();
    } else if (isGameRunning && startStopButton.textContent === 'Stop' && canStop) {
        stopBlocks();
    } else if (startStopButton.textContent === 'Continue') { // After reaching minor prize
        // Player chose to continue
        takeMinorPrizeButton.style.display = 'none';
        startStopButton.disabled = true; // Disable until next round starts
        nextLevel(); // This will call startNewRound
    }
});

takeMinorPrizeButton.addEventListener('click', takeMinorPrize);

document.addEventListener('keydown', (event) => {
    if (event.code === 'Space') {
        event.preventDefault(); // Prevent page scrolling
        // Simulate button click logic
        if (startStopButton.disabled) return;

        if (!isGameRunning && (startStopButton.textContent === 'Start' || startStopButton.textContent === 'Restart' || startStopButton.textContent === 'Play Again?')) {
            startGame();
        } else if (isGameRunning && startStopButton.textContent === 'Stop' && canStop) {
            stopBlocks();
        } else if (startStopButton.textContent === 'Continue') {
            takeMinorPrizeButton.style.display = 'none';
            startStopButton.disabled = true;
            nextLevel();
        }
    }
});

// Initial setup
createBoard(); // Draw the board initially so prize lines are visible
updateDisplay();
messageArea.textContent = "Click Start to Play!"; 