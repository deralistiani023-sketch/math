
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Layout } from './components/Layout';
import { Topic, Question, Material, UserProgress, AdminUser, UploadedFile, Order } from './types';
import { INITIAL_QUESTIONS, INITIAL_MATERIALS } from './constants';
import { generateAIContent, generateAIQuestions } from './services/geminiService';
import { supabase, checkSupabaseConnection } from './supabase';

// --- Cliff Jump Game Component ---

interface CliffJumpProps {
  onFall: () => void;
  isPaused: boolean;
  onJump: () => void;
  lives: number;
}

const CliffJump: React.FC<CliffJumpProps> = ({ onFall, isPaused, onJump, lives }) => {
  const [playerY, setPlayerY] = useState(0);
  const [playerVY, setPlayerVY] = useState(0);
  const [platforms, setPlatforms] = useState<{ x: number; width: number }[]>(() => {
    // Initialize with first platform to prevent immediate fall
    return [{ x: 0, width: 400 }];
  });
  const [gameX, setGameX] = useState(0);
  const [isGrounded, setIsGrounded] = useState(true);
  const [showInstructions, setShowInstructions] = useState(true);
  const gameRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(null);
  const jumpCountRef = useRef(0);
  
  // Physics constants
  const GRAVITY = 0.45; 
  const JUMP_FORCE = -10.5;
  const SPEED = 4.2;
  const PLAYER_X = 50;
  const GROUND_Y = 0;

  // Refs for physics to avoid stale closures and jitter
  const physicsRef = useRef({
    y: 0,
    vy: 0,
    x: 0,
    isGrounded: true,
    platforms: [{ x: 0, width: 400 }]
  });

  useEffect(() => {
    // Generate more platforms after initial mount
    const initialPlatforms = [{ x: 0, width: 400 }];
    let curX = initialPlatforms[0].width + 120;
    for (let i = 0; i < 15; i++) {
      const width = 150 + Math.random() * 200;
      initialPlatforms.push({ x: curX, width });
      curX += width + 120 + Math.random() * 100;
    }
    physicsRef.current.platforms = initialPlatforms;
    setPlatforms(initialPlatforms);
  }, []);

  const jump = useCallback(() => {
    if (isPaused || showInstructions) return;
    
    const p = physicsRef.current;
    // Initial jump
    if (p.isGrounded || (p.y >= GROUND_Y && p.y < 15 && p.vy >= 0)) {
      p.vy = JUMP_FORCE;
      p.isGrounded = false;
      setIsGrounded(false);
      jumpCountRef.current = 1;
      onJump();
    } 
    // Multi-jump / Boost: tapping again in air makes you go higher
    else if (jumpCountRef.current < 4) { 
      p.vy = JUMP_FORCE * 0.75; // Add upward force
      jumpCountRef.current += 1;
      onJump();
    }
  }, [isPaused, showInstructions, onJump]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [jump]);

  const update = useCallback(() => {
    if (isPaused || showInstructions) {
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    const p = physicsRef.current;
    p.x += SPEED;
    setGameX(p.x);
    
    const oldY = p.y;
    p.vy += GRAVITY;
    p.y += p.vy;

    const currentAbsX = p.x + PLAYER_X;
    // Check collision with a bit of width for the player (14 units wide)
    const playerWidth = 30; 
    const onPlatform = p.platforms.find(plat => 
      (currentAbsX + playerWidth/2) >= plat.x && 
      (currentAbsX - playerWidth/2) <= plat.x + plat.width
    );
    
    // Snapping logic: Only land if we were above or at ground level in the previous frame
    // and we are now at or below ground level while over a platform.
    if (onPlatform && oldY <= GROUND_Y && p.y >= GROUND_Y) {
      p.y = GROUND_Y;
      p.vy = 0;
      if (!p.isGrounded) {
        p.isGrounded = true;
        setIsGrounded(true);
        jumpCountRef.current = 0; // Reset jump count on landing
      }
    } else if (p.y > GROUND_Y) {
      // We are in the air (falling into a pit or just jumping)
      p.isGrounded = false;
      setIsGrounded(false);
      
      // If we fall too deep, it's a game over
      if (p.y > 250) {
        // Reset physics for next life
        p.y = 0;
        p.vy = 0;
        p.isGrounded = true;
        setIsGrounded(true);
        jumpCountRef.current = 0;
        onFall();
      }
    } else {
      // We are in the air (jumping up)
      p.isGrounded = false;
      setIsGrounded(false);
    }

    setPlayerY(p.y);
    setPlayerVY(p.vy);

    // Generate new platforms
    const last = p.platforms[p.platforms.length - 1];
    if (last && last.x < p.x + 1200) {
      const newPlat = { 
        x: last.x + last.width + 130 + Math.random() * 150, 
        width: 150 + Math.random() * 200 
      };
      p.platforms.push(newPlat);
      setPlatforms([...p.platforms]);
    }
    
    // Keep platforms that are still visible or slightly behind
    if (p.platforms.length > 20) {
      const filtered = p.platforms.filter(plat => plat.x + plat.width > p.x - 400);
      if (filtered.length !== p.platforms.length) {
        p.platforms = filtered;
        setPlatforms(filtered);
      }
    }

    requestRef.current = requestAnimationFrame(update);
  }, [isPaused, showInstructions, onFall]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  return (
    <div 
      ref={gameRef}
      onClick={jump}
      className="relative w-full h-[550px] md:h-[450px] bg-gradient-to-b from-[#87CEEB] via-[#B0E0E6] to-[#E0F7FA] rounded-none md:rounded-[40px] overflow-hidden cursor-pointer border-y-4 md:border-8 border-white/40 shadow-[0_20px_50px_rgba(0,0,0,0.2)]"
    >
      {/* Parallax Clouds */}
      <div className="absolute top-10 left-[10%] text-white text-6xl opacity-40 animate-pulse" style={{ transform: `translateX(${-gameX * 0.2}px)` }}><i className="fas fa-cloud"></i></div>
      <div className="absolute top-24 left-[40%] text-white text-8xl opacity-30" style={{ transform: `translateX(${-gameX * 0.1}px)` }}><i className="fas fa-cloud"></i></div>
      <div className="absolute top-16 left-[70%] text-white text-5xl opacity-20" style={{ transform: `translateX(${-gameX * 0.3}px)` }}><i className="fas fa-cloud"></i></div>
      
      {/* Distant Mountains */}
      <div className="absolute bottom-0 left-0 w-full h-32 opacity-20 pointer-events-none flex items-end" style={{ transform: `translateX(${-gameX * 0.05 % 100}%)` }}>
        {[...Array(10)].map((_, i) => (
          <div key={i} className="w-64 h-24 bg-sky-900 rounded-t-full shrink-0 -ml-12"></div>
        ))}
      </div>

      <div className="absolute top-6 left-8 flex gap-3 z-20">
        {[...Array(3)].map((_, i) => (
          <i key={i} className={`fas fa-heart text-3xl transition-all duration-300 ${i < lives ? 'text-red-500 scale-125 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'text-white/30 opacity-40'}`}></i>
        ))}
      </div>

      {platforms.map((p, i) => (
        <div 
          key={i} 
          className="absolute bottom-0 h-[120px] bg-gradient-to-b from-[#45b7af] to-[#2d8a83] border-t-8 border-[#4ECDC4] shadow-2xl rounded-t-xl" 
          style={{ left: p.x - gameX, width: p.width }}
        >
          <div className="w-full h-full opacity-10 bg-[radial-gradient(circle,white_1px,transparent_1px)] bg-[size:20px_20px]"></div>
          {/* Decorative elements on platforms */}
          <div className="absolute -top-6 left-4 text-green-300 text-xl"><i className="fas fa-seedling"></i></div>
          {p.width > 300 && <div className="absolute -top-8 right-10 text-emerald-400 text-2xl opacity-60"><i className="fas fa-tree"></i></div>}
          <div className="absolute top-4 left-0 w-full h-1 bg-white/10"></div>
        </div>
      ))}

      {/* Player Character - Slime/Creature Design */}
      <div 
        className="absolute left-[50px] transition-all duration-75" 
        style={{ 
          bottom: 120 - playerY, 
          transform: `
            rotate(${playerVY * 2}deg) 
            scaleX(${isGrounded ? 1.15 : 0.85}) 
            scaleY(${isGrounded ? 0.85 : 1.15})
          `,
        }}
      >
        <div className="relative w-16 h-16 bg-gradient-to-t from-[#FF6B6B] to-[#FF8E53] rounded-[50%_50%_45%_45%] border-4 border-[#2F2E41] shadow-2xl flex flex-col items-center justify-center overflow-hidden">
          {/* Eyes */}
          <div className="flex gap-3 mb-1 mt-2">
            <div className="w-3 h-4 bg-white rounded-full flex items-center justify-center">
              <div className="w-1.5 h-2 bg-[#2F2E41] rounded-full animate-bounce"></div>
            </div>
            <div className="w-3 h-4 bg-white rounded-full flex items-center justify-center">
              <div className="w-1.5 h-2 bg-[#2F2E41] rounded-full animate-bounce delay-75"></div>
            </div>
          </div>
          {/* Mouth */}
          <div className={`w-4 h-2 bg-[#2F2E41] rounded-full opacity-80 ${!isGrounded ? 'h-4 w-4 rounded-full' : ''}`}></div>
          
          {/* Shine effect */}
          <div className="absolute top-2 left-3 w-4 h-2 bg-white/40 rounded-full rotate-[-30deg]"></div>
        </div>

        {/* Squishy feet/shadow when grounded */}
        {isGrounded && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-12 h-2 bg-black/20 rounded-full blur-[1px]"></div>
        )}
        
        {/* Jump Particles */}
        {!isGrounded && playerVY < 0 && (
          <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
            <div className="w-3 h-3 bg-white/80 rounded-full animate-ping"></div>
            <div className="w-2 h-2 bg-white/40 rounded-full animate-ping delay-100"></div>
          </div>
        )}
      </div>

      {isPaused && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-md z-30">
          <div className="glass-card p-10 text-center animate-in zoom-in duration-300 border-y-4 md:border-4 border-[#FF6B6B] rounded-none md:rounded-[40px] w-full md:w-auto h-full md:h-auto flex flex-col justify-center">
            <div className="text-[#FF6B6B] text-7xl mb-6 animate-bounce"><i className="fas fa-heart-broken"></i></div>
            <h3 className="text-4xl font-game font-black text-[#FF6B6B] mb-3 uppercase tracking-tight">Yah, Terjatuh!</h3>
            <p className="text-[#2F2E41] font-bold text-xl mb-6">Jangan menyerah! Ayo coba lagi.</p>
          </div>
        </div>
      )}

      {showInstructions && (
        <div className="absolute inset-0 bg-black/70 z-40 overflow-y-auto p-0 md:p-6 flex justify-center items-start md:items-center backdrop-blur-md">
          <div className="bg-white rounded-none md:rounded-[40px] p-6 md:p-10 max-w-none md:max-w-md w-full text-center space-y-6 shadow-2xl border-x-0 md:border-8 border-[#4ECDC4] animate-in zoom-in duration-300 min-h-full md:min-h-0 flex flex-col justify-center">
            <div className="w-20 h-20 bg-[#FFE66D] rounded-3xl flex items-center justify-center text-[#2F2E41] text-4xl mx-auto shadow-lg rotate-3">
              <i className="fas fa-info-circle"></i>
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-game font-black text-[#2F2E41]">Cara Bermain</h3>
              <p className="text-[#2F2E41]/70 font-medium">Lompati jurang untuk bertahan hidup!</p>
            </div>
            <div className="bg-sky-50 p-4 rounded-2xl text-left space-y-3 border-2 border-sky-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#4ECDC4] rounded-lg flex items-center justify-center text-white"><i className="fas fa-mouse-pointer text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Tap/Klik sekali untuk melompat.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#FF6B6B] rounded-lg flex items-center justify-center text-white"><i className="fas fa-rocket text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Tap berkali-kali di udara untuk melompat lebih tinggi!</p>
              </div>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowInstructions(false); }}
              className="w-full bg-[#4ECDC4] hover:bg-[#45b7af] text-white py-4 rounded-2xl font-black text-xl shadow-[0_8px_0_rgb(58,153,146)] transition-all active:shadow-none active:translate-y-[8px]"
            >
              MENGERTI!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Food Drop Game Component (Match-3) ---

interface FoodDropProps {
  onTimerEnd: () => void;
  onSwap: () => void;
  isPaused: boolean;
  timer: number;
  setTimer: React.Dispatch<React.SetStateAction<number>>;
}

interface GridItem {
  id: string;
  type: number; // Index of ITEMS
  isBomb?: 'row' | 'col' | 'area';
  isIce?: boolean;
}

const FoodDrop: React.FC<FoodDropProps> = ({ onTimerEnd, onSwap, isPaused, timer, setTimer }) => {
  const GRID_SIZE = 7;
  const ITEMS = ['🍕', '🍔', '🍦', '☕', '🥩', '🍒', '🍇', '🥚'];
  
  const [grid, setGrid] = useState<GridItem[][]>([]);
  const [selected, setSelected] = useState<{ r: number; c: number } | null>(null);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [score, setScore] = useState(0);
  const [showInstructions, setShowInstructions] = useState(true);

  const findMatches = useCallback((currentGrid: GridItem[][]) => {
    const matches = new Set<string>();

    // Horizontal
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE - 2; c++) {
        const type = currentGrid[r][c].type;
        if (type === currentGrid[r][c + 1].type && type === currentGrid[r][c + 2].type) {
          matches.add(`${r},${c}`);
          matches.add(`${r},${c + 1}`);
          matches.add(`${r},${c + 2}`);
        }
      }
    }

    // Vertical
    for (let c = 0; c < GRID_SIZE; c++) {
      for (let r = 0; r < GRID_SIZE - 2; r++) {
        const type = currentGrid[r][c].type;
        if (type === currentGrid[r + 1][c].type && type === currentGrid[r + 2][c].type) {
          matches.add(`${r},${c}`);
          matches.add(`${r + 1},${c}`);
          matches.add(`${r + 2},${c}`);
        }
      }
    }

    return matches;
  }, []);

  const hasPossibleMoves = useCallback((currentGrid: GridItem[][]) => {
    const tempGrid = currentGrid.map(row => [...row]);
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        // Check horizontal swap
        if (c < GRID_SIZE - 1) {
          if (!tempGrid[r][c].isIce && !tempGrid[r][c + 1].isIce) {
            // Swap
            const temp = tempGrid[r][c];
            tempGrid[r][c] = tempGrid[r][c + 1];
            tempGrid[r][c + 1] = temp;
            
            const matches = findMatches(tempGrid);
            
            // Swap back
            tempGrid[r][c + 1] = tempGrid[r][c];
            tempGrid[r][c] = temp;
            
            if (matches.size > 0) return true;
          }
        }
        
        // Check vertical swap
        if (r < GRID_SIZE - 1) {
          if (!tempGrid[r][c].isIce && !tempGrid[r + 1][c].isIce) {
            // Swap
            const temp = tempGrid[r][c];
            tempGrid[r][c] = tempGrid[r + 1][c];
            tempGrid[r + 1][c] = temp;
            
            const matches = findMatches(tempGrid);
            
            // Swap back
            tempGrid[r + 1][c] = tempGrid[r][c];
            tempGrid[r][c] = temp;
            
            if (matches.size > 0) return true;
          }
        }
      }
    }
    return false;
  }, [findMatches]);

  const createItem = useCallback((forceIce = false): GridItem => ({
    id: Math.random().toString(36).substr(2, 9),
    type: Math.floor(Math.random() * ITEMS.length),
    isBomb: Math.random() < 0.05 ? (Math.random() < 0.3 ? 'area' : Math.random() < 0.5 ? 'row' : 'col') : undefined,
    isIce: forceIce || Math.random() < 0.05
  }), []);

  const initGrid = useCallback(() => {
    let newGrid: GridItem[][] = [];
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 100) {
      attempts++;
      newGrid = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        newGrid[r] = [];
        for (let c = 0; c < GRID_SIZE; c++) {
          let item = createItem();
          // Avoid initial matches
          while (
            (r >= 2 && newGrid[r-1][c].type === item.type && newGrid[r-2][c].type === item.type) ||
            (c >= 2 && newGrid[r][c-1].type === item.type && newGrid[r][c-2].type === item.type)
          ) {
            item = createItem();
          }
          newGrid[r][c] = item;
        }
      }
      if (hasPossibleMoves(newGrid)) {
        valid = true;
      }
    }
    setGrid(newGrid);
  }, [createItem, hasPossibleMoves]);

  useEffect(() => {
    initGrid();
  }, [initGrid]);

  useEffect(() => {
    if (isPaused || timer <= 0 || showInstructions) return;
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          onTimerEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, timer, onTimerEnd, setTimer, showInstructions]);

  const shuffleGrid = async (currentGrid: GridItem[][]) => {
    setIsProcessing(true);
    let newGrid = currentGrid.map(row => [...row]);
    let valid = false;
    let attempts = 0;

    while (!valid && attempts < 100) {
      attempts++;
      // Collect all non-ice items
      const nonIceItems: GridItem[] = [];
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (!newGrid[r][c].isIce) {
            nonIceItems.push(newGrid[r][c]);
          }
        }
      }
      
      // Shuffle them
      for (let i = nonIceItems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [nonIceItems[i], nonIceItems[j]] = [nonIceItems[j], nonIceItems[i]];
      }
      
      // Put them back
      let idx = 0;
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (!newGrid[r][c].isIce) {
            newGrid[r][c] = nonIceItems[idx++];
          }
        }
      }
      
      // Check if it has matches or no moves
      const matches = findMatches(newGrid);
      if (matches.size === 0 && hasPossibleMoves(newGrid)) {
        valid = true;
      }
    }
    
    setGrid(newGrid);
    await new Promise(resolve => setTimeout(resolve, 500));
    setIsProcessing(false);
    alert("Tidak ada langkah lagi! Papan dikocok ulang.");
  };

  const processMatches = async (currentGrid: GridItem[][]) => {
    setIsProcessing(true);
    let matches = findMatches(currentGrid);
    
    if (matches.size === 0) {
      setIsProcessing(false);
      return;
    }

    const newGrid = currentGrid.map(row => [...row]);
    const toRemove = new Set(matches);

    // Apply bomb effects
    matches.forEach(m => {
      const [r, c] = (m as string).split(',').map(Number);
      const item = newGrid[r][c];
      if (item.isBomb === 'row') {
        for (let i = 0; i < GRID_SIZE; i++) toRemove.add(`${r},${i}`);
      } else if (item.isBomb === 'col') {
        for (let i = 0; i < GRID_SIZE; i++) toRemove.add(`${i},${c}`);
      } else if (item.isBomb === 'area') {
        for (let i = r - 1; i <= r + 1; i++) {
          for (let j = c - 1; j <= c + 1; j++) {
            if (i >= 0 && i < GRID_SIZE && j >= 0 && j < GRID_SIZE) toRemove.add(`${i},${j}`);
          }
        }
      }
    });

    setScore(prev => prev + toRemove.size * 10);

    // Break adjacent ice
    toRemove.forEach(m => {
      const [r, c] = (m as string).split(',').map(Number);
      const neighbors = [
        [r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]
      ];
      neighbors.forEach(([nr, nc]) => {
        if (nr >= 0 && nr < GRID_SIZE && nc >= 0 && nc < GRID_SIZE) {
          if (newGrid[nr][nc].isIce) {
            newGrid[nr][nc] = { ...newGrid[nr][nc], isIce: false };
          }
        }
      });
    });

    // Remove items
    toRemove.forEach(m => {
      const [r, c] = (m as string).split(',').map(Number);
      // If the item itself was ice, it just breaks and stays (or we can remove it)
      // Usually, if it's matched, it's removed even if it was ice.
      newGrid[r][c] = { id: '', type: -1 };
    });

    setGrid([...newGrid]);
    await new Promise(resolve => setTimeout(resolve, 300));

    // Drop items
    for (let c = 0; c < GRID_SIZE; c++) {
      let emptyRow = GRID_SIZE - 1;
      for (let r = GRID_SIZE - 1; r >= 0; r--) {
        if (newGrid[r][c].type !== -1) {
          const temp = newGrid[r][c];
          newGrid[r][c] = newGrid[emptyRow][c];
          newGrid[emptyRow][c] = temp;
          emptyRow--;
        }
      }
    }

    setGrid([...newGrid]);
    await new Promise(resolve => setTimeout(resolve, 300));

    // Refill
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (newGrid[r][c].type === -1) {
          newGrid[r][c] = createItem();
        }
      }
    }

    setGrid([...newGrid]);
    await new Promise(resolve => setTimeout(resolve, 300));

    // Recursive check for new matches
    const finalMatches = findMatches(newGrid);
    if (finalMatches.size > 0) {
      processMatches(newGrid);
    } else if (!hasPossibleMoves(newGrid)) {
      shuffleGrid(newGrid);
    } else {
      setIsProcessing(false);
    }
  };

  const triggerSwap = async (r1: number, c1: number, r2: number, c2: number) => {
    if (isProcessing) return;
    
    const item1 = grid[r1][c1];
    const item2 = grid[r2][c2];
    
    if (item1.isIce || item2.isIce) return;

    onSwap();
    const newGrid = grid.map(row => [...row]);
    newGrid[r1][c1] = item2;
    newGrid[r2][c2] = item1;

    const matches = findMatches(newGrid);
    if (matches.size > 0) {
      setGrid(newGrid);
      processMatches(newGrid);
    } else {
      // Swap back if no matches
      setGrid([...newGrid]);
      await new Promise(resolve => setTimeout(resolve, 200));
      newGrid[r1][c1] = item1;
      newGrid[r2][c2] = item2;
      setGrid(newGrid);
    }
  };

  const handlePointerDown = (e: React.PointerEvent, r: number, c: number) => {
    if (isPaused || isProcessing || showInstructions) return;
    if (grid[r][c].isIce) return;
    
    setSelected({ r, c });
    setDragStart({ x: e.clientX, y: e.clientY });
    
    // Capture pointer to receive move events even if pointer leaves the cell
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent, r: number, c: number) => {
    if (!dragStart || !selected || isProcessing) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;
    const threshold = 30; // pixels to trigger swap

    if (Math.abs(dx) > threshold || Math.abs(dy) > threshold) {
      let targetR = selected.r;
      let targetC = selected.c;

      if (Math.abs(dx) > Math.abs(dy)) {
        // Horizontal move
        targetC = dx > 0 ? selected.c + 1 : selected.c - 1;
      } else {
        // Vertical move
        targetR = dy > 0 ? selected.r + 1 : selected.r - 1;
      }

      // Check bounds
      if (targetR >= 0 && targetR < GRID_SIZE && targetC >= 0 && targetC < GRID_SIZE) {
        triggerSwap(selected.r, selected.c, targetR, targetC);
      }

      // Reset drag state after triggering
      setDragStart(null);
      setSelected(null);
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setDragStart(null);
    setSelected(null);
  };

  return (
    <div className="relative w-full max-w-none md:max-w-2xl mx-auto h-[600px] md:h-[700px] bg-gradient-to-br from-sky-100 via-sky-200 to-blue-300 rounded-none md:rounded-[40px] p-3 md:p-6 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border-y-4 md:border-8 border-white/40 overflow-hidden flex flex-col select-none">
      <div className="flex justify-between items-center z-10 mb-4">
        <div className="bg-white/30 backdrop-blur-md px-3 md:px-4 py-1 rounded-full text-white text-xs md:text-base font-bold flex items-center gap-2 border border-white/20">
          <i className="fas fa-clock text-[#FFE66D]"></i> {timer}s
        </div>
        <div className="bg-white/30 backdrop-blur-md px-3 md:px-4 py-1 rounded-full text-white text-xs md:text-base font-bold flex items-center gap-2 border border-white/20">
          <i className="fas fa-star text-[#FFE66D]"></i> {score}
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 md:gap-2 flex-1 content-center touch-none">
        {grid.map((row, r) => 
          row.map((item, c) => (
            <div 
              key={`${r}-${c}`}
              onPointerDown={(e) => handlePointerDown(e, r, c)}
              onPointerMove={(e) => handlePointerMove(e, r, c)}
              onPointerUp={handlePointerUp}
              className={`
                relative aspect-square rounded-lg md:rounded-2xl flex items-center justify-center cursor-pointer transition-all duration-200
                ${selected?.r === r && selected?.c === c ? 'bg-white/40 scale-110 ring-2 md:ring-4 ring-[#FFE66D] shadow-lg' : 'bg-white/10 hover:bg-white/20'}
                ${item.type === -1 ? 'opacity-0 scale-0' : 'opacity-100 scale-100'}
                ${item.isIce ? 'overflow-hidden' : ''}
              `}
            >
              {item.type !== -1 && (
                <div className="relative text-2xl md:text-4xl drop-shadow-md transform transition-transform hover:scale-110 pointer-events-none">
                  {ITEMS[item.type]}
                  {item.isBomb && (
                    <div className="absolute -top-2 -right-2 md:-top-3 md:-right-3 text-[8px] md:text-[10px] bg-white text-[#FF6B6B] rounded-full w-4 h-4 md:w-6 md:h-6 flex items-center justify-center font-bold shadow-md animate-pulse border border-[#FF6B6B]">
                      {item.isBomb === 'area' ? <i className="fas fa-bomb"></i> : 
                       item.isBomb === 'row' ? <i className="fas fa-arrows-alt-h"></i> : 
                       <i className="fas fa-arrows-alt-v"></i>}
                    </div>
                  )}
                </div>
              )}
              {item.isIce && (
                <div className="absolute inset-0 bg-blue-200/60 backdrop-blur-[2px] flex items-center justify-center z-10 border border-white/50 rounded-lg md:rounded-2xl pointer-events-none">
                  <i className="fas fa-snowflake text-white/80 text-sm md:text-xl animate-pulse"></i>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {isPaused && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-md z-30 rounded-none md:rounded-[32px]">
          <div className="glass-card p-10 text-center animate-in zoom-in duration-300 border-y-4 md:border-4 border-[#FFE66D] rounded-none md:rounded-[40px] w-full md:w-auto h-full md:h-auto flex flex-col justify-center">
            <div className="text-[#FFE66D] text-7xl mb-6 animate-bounce"><i className="fas fa-hourglass-end"></i></div>
            <h3 className="text-4xl font-game font-black text-[#FFE66D] mb-3">WAKTU HABIS!</h3>
            <p className="text-[#2F2E41] font-bold text-xl mb-6">Jawab soal untuk tambah waktu!</p>
          </div>
        </div>
      )}

      {showInstructions && (
        <div className="absolute inset-0 bg-black/70 z-40 overflow-y-auto p-0 md:p-6 flex justify-center items-start md:items-center backdrop-blur-md rounded-none md:rounded-[32px]">
          <div className="bg-white rounded-none md:rounded-[40px] p-6 md:p-10 max-w-none md:max-w-md w-full text-center space-y-6 shadow-2xl border-x-0 md:border-8 border-[#4ECDC4] animate-in zoom-in duration-300 min-h-full md:min-h-0 flex flex-col justify-center">
            <div className="w-20 h-20 bg-[#FFE66D] rounded-3xl flex items-center justify-center text-[#2F2E41] text-4xl mx-auto shadow-lg rotate-3">
              <i className="fas fa-cube"></i>
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-game font-black text-[#2F2E41]">Food Match Ice</h3>
              <p className="text-[#2F2E41]/70 font-medium">Pecahkan es untuk membebaskan makanan!</p>
            </div>
            <div className="bg-blue-50 p-4 rounded-2xl text-left space-y-3 border-2 border-blue-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#4ECDC4] rounded-lg flex items-center justify-center text-white"><i className="fas fa-exchange-alt text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Geser makanan untuk membuat baris 3 atau lebih.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-400 rounded-lg flex items-center justify-center text-white"><i className="fas fa-snowflake text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Cocokkan makanan di dekat es untuk memecahkannya!</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#FF6B6B] rounded-lg flex items-center justify-center text-white"><i className="fas fa-bomb text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Gunakan bom untuk ledakan besar!</p>
              </div>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowInstructions(false); }}
              className="w-full bg-[#4ECDC4] hover:bg-[#45b7af] text-white py-4 rounded-2xl font-black text-xl shadow-[0_8px_0_rgb(58,153,146)] transition-all active:shadow-none active:translate-y-[8px]"
            >
              MULAI MAIN!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Food Swap Game Component ---

interface FoodSwapProps {
  onLifeLost: (reason: string) => void;
  onCatch: () => void;
  isPaused: boolean;
  lives: number;
}

const FoodSwap: React.FC<FoodSwapProps> = ({ onLifeLost, onCatch, isPaused, lives }) => {
  const [playerX, setPlayerX] = useState(200);
  const playerXRef = useRef(200);
  const [items, setItems] = useState<{ id: number, x: number, y: number, icon: string, isTrash: boolean, color: string }[]>([]);
  const itemsRef = useRef(items);
  const [isChewing, setIsChewing] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  const containerRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<number>(null);
  const [pauseReason, setPauseReason] = useState("");
  const chewingTimeoutRef = useRef<number | null>(null);

  // Sync refs with state
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  useEffect(() => {
    playerXRef.current = playerX;
  }, [playerX]);

  const PLAYER_WIDTH = 80;
  const ITEM_SPEED = 3.8;
  
  const FOOD_ICONS = ['🍊', '🍋', '🍏', '🍎', '🥭', '🍈', '🥑', '🍇', '🍕', '🥞', '🥙', '🧆', '🥗', '🍔', '🍟'];
  const TRASH_ICONS = ['💣', '🔒', '📀'];

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (isPaused || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let clientX = 0;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
    } else {
      clientX = (e as React.MouseEvent).clientX;
    }
    const x = clientX - rect.left - PLAYER_WIDTH / 2;
    setPlayerX(Math.max(0, Math.min(rect.width - PLAYER_WIDTH, x)));
  };

  const update = useCallback(() => {
    if (isPaused || showInstructions) {
      requestRef.current = requestAnimationFrame(update);
      return;
    }

    let lostLife = false;
    let caughtFood = false;
    let reason = "";

    const currentItems = itemsRef.current;
    const nextItems = currentItems.map(f => ({ ...f, y: f.y + ITEM_SPEED }));

    // Collision detection & Lifecycle
    const filtered = nextItems.filter(f => {
      // Cek apakah tertangkap di area mulut Pou
      const isAlignedX = f.x > playerXRef.current - 20 && f.x < playerXRef.current + PLAYER_WIDTH;
      const isAtCatchHeight = f.y > 340 && f.y < 380;
      const caught = isAlignedX && isAtCatchHeight;
      
      // Cek apakah sudah jatuh melewati batas bawah layar (450px)
      const hitBottom = f.y > 450;

      if (caught) {
        if (f.isTrash) {
           lostLife = true;
           reason = "HUWEE! KAMU MAKAN BENDA BERBAHAYA!";
        } else {
           caughtFood = true;
        }
        return false; // Hapus item jika tertangkap (efek dimakan)
      }

      if (hitBottom) {
        return false; // Hapus item hanya jika sudah benar-benar jatuh ke bawah
      }

      return true; // Biarkan item terus jatuh
    });

    // Spawn logic
    if (Math.random() < 0.04 && filtered.length < 10) {
      const isTrash = Math.random() < 0.4;
      
      filtered.push({
        id: Date.now() + Math.random(),
        x: Math.random() * (containerRef.current?.clientWidth || 400 - 40),
        y: -60, // Mulai dari atas kontainer
        isTrash,
        color: '',
        icon: isTrash 
          ? TRASH_ICONS[Math.floor(Math.random() * TRASH_ICONS.length)]
          : FOOD_ICONS[Math.floor(Math.random() * FOOD_ICONS.length)]
      });
    }

    setItems(filtered);
    itemsRef.current = filtered;

    if (lostLife) {
      setPauseReason(reason);
      onLifeLost(reason);
    }

    if (caughtFood) {
      onCatch();
      setIsChewing(true);
      if (chewingTimeoutRef.current) window.clearTimeout(chewingTimeoutRef.current);
      chewingTimeoutRef.current = window.setTimeout(() => setIsChewing(false), 500);
    }

    requestRef.current = requestAnimationFrame(update);
  }, [isPaused, onLifeLost, onCatch, showInstructions]);

  useEffect(() => {
    requestRef.current = requestAnimationFrame(update);
    return () => {
      if (requestRef.current) cancelAnimationFrame(requestRef.current);
    };
  }, [update]);

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onTouchMove={handleMouseMove}
      className="relative w-full h-[550px] md:h-[450px] bg-white rounded-none md:rounded-[40px] overflow-hidden cursor-crosshair border-y-4 md:border-8 border-white/30 shadow-[0_20px_50px_rgba(0,0,0,0.2)]"
    >
      {/* Moving Clouds */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-10 left-0 opacity-40 animate-clouds" style={{ animationDelay: '0s' }}>
          <i className="fas fa-cloud text-6xl text-blue-100"></i>
        </div>
        <div className="absolute top-32 left-0 opacity-30 animate-clouds" style={{ animationDelay: '-10s', animationDuration: '40s' }}>
          <i className="fas fa-cloud text-8xl text-blue-100"></i>
        </div>
        <div className="absolute top-60 left-0 opacity-50 animate-clouds" style={{ animationDelay: '-20s', animationDuration: '35s' }}>
          <i className="fas fa-cloud text-7xl text-blue-100"></i>
        </div>
      </div>

      <div className="absolute top-6 left-8 flex gap-3 z-20">
        {[...Array(3)].map((_, i) => (
          <i key={i} className={`fas fa-heart text-3xl transition-all duration-300 ${i < lives ? 'text-red-500 scale-125 drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]' : 'text-white/30 opacity-40'}`}></i>
        ))}
      </div>

      {items.map(f => (
        <div 
          key={f.id} 
          className="absolute text-5xl drop-shadow-lg transform transition-transform hover:scale-110 select-none" 
          style={{ left: f.x, top: f.y }}
        >
          {f.icon}
        </div>
      ))}

      <div 
        className={`absolute bottom-8 w-24 h-24 flex flex-col items-center justify-end transform transition-transform ${isChewing ? 'scale-110' : ''}`}
        style={{ left: playerX }}
      >
        {/* Rabbit Ears */}
        <div className="flex gap-6 absolute -top-4">
          <div className="w-4 h-12 bg-gray-300 rounded-full border-2 border-gray-400 animate-twitch origin-bottom relative overflow-hidden">
            <div className="absolute inset-x-1 top-2 bottom-0 bg-gray-200 rounded-full"></div>
          </div>
          <div className="w-4 h-12 bg-gray-300 rounded-full border-2 border-gray-400 animate-twitch origin-bottom relative overflow-hidden" style={{ animationDelay: '0.5s' }}>
            <div className="absolute inset-x-1 top-2 bottom-0 bg-gray-200 rounded-full"></div>
          </div>
        </div>
        
        {/* Rabbit Face */}
        <div className="w-20 h-20 bg-gray-300 rounded-full border-4 border-gray-400 shadow-lg flex flex-col items-center justify-center relative">
          {/* Eyes */}
          <div className="flex gap-4 mb-2">
            <div className="w-2 h-3 bg-gray-800 rounded-full animate-blink"></div>
            <div className="w-2 h-3 bg-gray-800 rounded-full animate-blink"></div>
          </div>
          
          {/* Nose & Mouth */}
          <div className="flex flex-col items-center">
            <div className="w-2 h-1 bg-gray-500 rounded-full mb-0.5"></div>
            <div className={`w-6 h-4 border-b-2 border-gray-400 rounded-full transition-all ${isChewing ? 'h-6 bg-gray-200' : ''}`}></div>
          </div>

          {/* Whiskers */}
          <div className="absolute left-1 top-10 w-4 h-0.5 bg-gray-500 -rotate-12"></div>
          <div className="absolute left-1 top-12 w-4 h-0.5 bg-gray-500"></div>
          <div className="absolute right-1 top-10 w-4 h-0.5 bg-gray-500 rotate-12"></div>
          <div className="absolute right-1 top-12 w-4 h-0.5 bg-gray-500"></div>
        </div>
      </div>

      {isPaused && (
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-md z-30">
          <div className="glass-card p-12 text-center animate-in zoom-in duration-300 border-y-4 md:border-4 border-[#FF6B6B] rounded-none md:rounded-[40px] w-full md:w-auto h-full md:h-auto flex flex-col justify-center">
            <div className="text-[#FF6B6B] text-8xl mb-6">
              <i className="fas fa-dizzy animate-bounce"></i>
            </div>
            <h3 className="text-4xl font-game font-black text-[#FF6B6B] mb-3">{pauseReason}</h3>
            <p className="text-[#2F2E41] text-xl font-bold mb-8">Ayo jawab soal Matematika agar Kelinci bisa makan lagi!</p>
            <div className="w-full h-4 bg-white/30 rounded-full overflow-hidden border-2 border-white/20">
              <div className="w-1/2 h-full bg-[#FF6B6B] animate-pulse"></div>
            </div>
          </div>
        </div>
      )}

      {showInstructions && (
        <div className="absolute inset-0 bg-black/70 z-40 overflow-y-auto p-0 md:p-6 flex justify-center items-start md:items-center backdrop-blur-md">
          <div className="bg-white rounded-none md:rounded-[40px] p-6 md:p-10 max-w-none md:max-w-md w-full text-center space-y-6 shadow-2xl border-x-0 md:border-8 border-[#FF8E53] animate-in zoom-in duration-300 min-h-full md:min-h-0 flex flex-col justify-center">
            <div className="w-20 h-20 bg-[#FFE66D] rounded-3xl flex items-center justify-center text-[#2F2E41] text-4xl mx-auto shadow-lg rotate-3">
              <i className="fas fa-utensils"></i>
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-game font-black text-[#2F2E41]">Food Drop</h3>
              <p className="text-[#2F2E41]/70 font-medium">Bantu Kelinci makan makanan lezat!</p>
            </div>
            <div className="bg-orange-50 p-4 rounded-2xl text-left space-y-3 border-2 border-orange-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-green-500 rounded-lg flex items-center justify-center text-white text-xl">🍎</div>
                <p className="text-sm font-bold text-[#2F2E41]">Tangkap makanan untuk Kelinci.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-500 rounded-lg flex items-center justify-center text-white text-xl">💣</div>
                <p className="text-sm font-bold text-[#2F2E41]">Hindari benda berbahaya!</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#4ECDC4] rounded-lg flex items-center justify-center text-white"><i className="fas fa-arrows-alt-h text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Geser jari/mouse untuk bergerak.</p>
              </div>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowInstructions(false); }}
              className="w-full bg-[#FF8E53] hover:bg-[#ff7a3d] text-white py-4 rounded-2xl font-black text-xl shadow-[0_8px_0_rgb(204,98,41)] transition-all active:shadow-none active:translate-y-[8px]"
            >
              SIAP MAKAN!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Helper Components ---

const TopicCard: React.FC<{ topic: Topic; onClick: () => void; questionCount: number }> = ({ topic, onClick, questionCount }) => {
  const getIcon = (t: Topic) => {
    switch (t) {
      case Topic.POLA_BILANGAN: return 'fa-sort-numeric-up';
      case Topic.PECAHAN_DESIMAL: return 'fa-percent';
      case Topic.KUBUS_BALOK: return 'fa-cube';
      case Topic.RASIO: return 'fa-balance-scale';
      case Topic.PELUANG: return 'fa-dice';
      default: return 'fa-book';
    }
  };

  const getColor = (t: Topic) => {
    switch (t) {
      case Topic.POLA_BILANGAN: return 'bg-[#4ECDC4]';
      case Topic.PECAHAN_DESIMAL: return 'bg-[#FF8E53]';
      case Topic.KUBUS_BALOK: return 'bg-[#45b7af]';
      case Topic.RASIO: return 'bg-[#9b59b6]';
      case Topic.PELUANG: return 'bg-[#FF6B6B]';
      default: return 'bg-gray-500';
    }
  };

  return (
    <button
      onClick={onClick}
      className="group relative overflow-hidden glass-card p-8 transition-all duration-300 hover:-translate-y-3 text-left border-4 border-transparent hover:border-white/50"
    >
      <div className={`w-20 h-20 ${getColor(topic)} text-white rounded-3xl flex items-center justify-center text-4xl mb-6 shadow-xl group-hover:rotate-12 transition-transform`}>
        <i className={`fas ${getIcon(topic)}`}></i>
      </div>
      <div className="flex justify-between items-start mb-3">
        <h3 className="text-3xl font-game font-bold text-[#2F2E41]">{topic}</h3>
        <span className="bg-white/50 px-3 py-1 rounded-xl text-xs font-black text-[#2F2E41]/60 border border-white/20 shadow-sm">
          {questionCount} Soal
        </span>
      </div>
      <p className="text-[#2F2E41]/70 font-medium">Pelajari konsep dan selesaikan tantangan seru!</p>
      <div className="mt-6 flex items-center text-[#4ECDC4] font-bold gap-2">
        <span>Mulai Belajar</span>
        <i className="fas fa-arrow-right group-hover:translate-x-2 transition-transform"></i>
      </div>
      <div className="absolute bottom-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <i className={`fas ${getIcon(topic)} text-6xl`}></i>
      </div>
    </button>
  );
};

const SplashScreen: React.FC<{ onFinish: () => void; onStartGame: () => void }> = ({ onFinish, onStartGame }) => {
  return (
    <div className="fixed inset-0 bg-gradient-to-br from-[#4ECDC4] via-[#45b7af] to-[#6C5CE7] flex flex-col items-center justify-center text-white z-[100] overflow-hidden p-6">
      <div className="absolute top-0 left-0 w-full h-full opacity-20 pointer-events-none">
         {[...Array(20)].map((_, i) => (
           <i key={i} className={`fas fa-calculator absolute text-4xl md:text-6xl animate-pulse`} style={{ top: `${Math.random() * 100}%`, left: `${Math.random() * 100}%`, transform: `rotate(${Math.random() * 360}deg)`, animationDelay: `${Math.random() * 2}s` }}></i>
         ))}
      </div>
      <div className="relative z-10 text-center space-y-8 md:space-y-12 animate-in zoom-in duration-700 w-full max-w-lg">
        <div className="w-24 h-24 md:w-40 md:h-40 bg-white rounded-[30px] md:rounded-[40px] flex items-center justify-center text-[#FF6B6B] text-4xl md:text-7xl shadow-[0_20px_50px_rgba(0,0,0,0.2)] mx-auto mb-4 animate-bounce rotate-6">
          <i className="fas fa-graduation-cap"></i>
        </div>
        <div className="space-y-4">
          <h1 className="text-5xl md:text-8xl font-game font-black tracking-tighter drop-shadow-[0_10px_10px_rgba(0,0,0,0.3)] text-white">MathVenture</h1>
          <p className="text-lg md:text-3xl font-bold text-white/90 max-w-2xl mx-auto drop-shadow-md">Petualangan Belajar Matematika yang Menyenangkan!</p>
        </div>
        <button 
          onClick={onStartGame}
          className="bg-[#FFE66D] hover:bg-[#f7d74d] text-[#2F2E41] px-10 md:px-20 py-4 md:py-8 rounded-[20px] md:rounded-[30px] font-black text-2xl md:text-4xl shadow-[0_8px_0_rgb(212,163,0)] md:shadow-[0_15px_0_rgb(212,163,0)] transition-all hover:scale-110 active:shadow-none active:translate-y-[8px] md:active:translate-y-[15px] border-4 border-black/10 w-full md:w-auto"
        >
          AYO MULAI!
        </button>
      </div>
    </div>
  );
};

// --- Memory Game Component (Rasio) ---

interface MemoryGameProps {
  onTimerEnd: () => void;
  onMatch: () => void;
  isPaused: boolean;
  timer: number;
  setTimer: React.Dispatch<React.SetStateAction<number>>;
}

const MemoryGame: React.FC<MemoryGameProps> = ({ onTimerEnd, onMatch, isPaused, timer, setTimer }) => {
  const FOOD_EMOJIS = ['🍕', '🍔', '🍦', '🍩', '🍎', '🍓', '🍉', '🥕', '🌽', '🥦', '🥑', '🥨'];
  const ANIMAL_EMOJIS = ['🐶', '🐱', '🐦', '🐰', '🐟', '🐌', '🐞', '🐢', '🦁', '🐯', '🐼', '🐨'];
  const CARD_BACKS = ['bg-blue-400', 'bg-purple-400', 'bg-pink-400', 'bg-indigo-400', 'bg-teal-400', 'bg-emerald-400', 'bg-orange-400', 'bg-rose-400'];

  const [cards, setCards] = useState<{ id: number; icon: string; isFlipped: boolean; isMatched: boolean; backColor: string }[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const [level, setLevel] = useState(1);
  const [showInstructions, setShowInstructions] = useState(true);
  const [hasPeeked, setHasPeeked] = useState(false);

  const initGame = useCallback(() => {
    // Difficulty scaling: more pairs as level increases
    const pairsCount = Math.min(12, 4 + Math.floor((level - 1) / 2) * 2);
    const halfPairs = Math.floor(pairsCount / 2);
    
    const selectedFood = [...FOOD_EMOJIS].sort(() => Math.random() - 0.5).slice(0, halfPairs);
    const selectedAnimals = [...ANIMAL_EMOJIS].sort(() => Math.random() - 0.5).slice(0, pairsCount - halfPairs);
    const selectedIcons = [...selectedFood, ...selectedAnimals];
    
    const deck = [...selectedIcons, ...selectedIcons]
      .sort(() => Math.random() - 0.5)
      .map((icon, index) => ({ 
        id: index, 
        icon, 
        isFlipped: false, 
        isMatched: false,
        backColor: CARD_BACKS[index % CARD_BACKS.length]
      }));
    setCards(deck);
    setFlippedIndices([]);
    setHasPeeked(false);
  }, [level]);

  useEffect(() => {
    initGame();
  }, [initGame]);

  useEffect(() => {
    if (!showInstructions && cards.length > 0 && !hasPeeked) {
      setIsChecking(true);
      
      const peek = async () => {
        // Memorize time reduces as level increases
        const peekTime = Math.max(500, 1500 - (level * 100));
        
        // Open one by one
        for (let i = 0; i < cards.length; i++) {
          setCards(prev => prev.map((c, idx) => idx === i ? { ...c, isFlipped: true } : c));
          await new Promise(r => setTimeout(r, 60));
        }
        
        await new Promise(r => setTimeout(r, peekTime)); 
        
        // Close one by one
        for (let i = 0; i < cards.length; i++) {
          setCards(prev => prev.map((c, idx) => idx === i ? { ...c, isFlipped: false } : c));
          await new Promise(r => setTimeout(r, 40));
        }
        
        setIsChecking(false);
        setHasPeeked(true);
      };
      
      peek();
    }
  }, [showInstructions, cards.length, hasPeeked, level]);

  useEffect(() => {
    if (isPaused || timer <= 0 || showInstructions) return;
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          onTimerEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, timer, onTimerEnd, setTimer, showInstructions]);

  const handleCardClick = (index: number) => {
    if (isPaused || isChecking || showInstructions || cards[index].isFlipped || cards[index].isMatched || flippedIndices.length === 2) return;

    const newCards = [...cards];
    newCards[index].isFlipped = true;
    setCards(newCards);

    const newFlipped = [...flippedIndices, index];
    setFlippedIndices(newFlipped);

    if (newFlipped.length === 2) {
      setIsChecking(true);
      const [first, second] = newFlipped;
      
      if (cards[first].icon === cards[second].icon) {
        // Match
        onMatch();
        setTimeout(() => {
          const matchedCards = [...newCards];
          matchedCards[first].isMatched = true;
          matchedCards[second].isMatched = true;
          setCards(matchedCards);
          setFlippedIndices([]);
          setIsChecking(false);
          
          // Check if all matched
          if (matchedCards.every(c => c.isMatched)) {
            setTimer(prev => prev + 20);
            setTimeout(() => {
              setLevel(prev => prev + 1);
            }, 1000);
          }
        }, 500);
      } else {
        // No match
        setTimeout(() => {
          const resetCards = [...newCards];
          resetCards[first].isFlipped = false;
          resetCards[second].isFlipped = false;
          setCards(resetCards);
          setFlippedIndices([]);
          setIsChecking(false);
        }, 1000);
      }
    }
  };

  return (
    <div className="relative w-full min-h-[550px] md:min-h-[600px] bg-gradient-to-br from-sky-100 via-sky-200 to-blue-300 rounded-none md:rounded-[40px] p-4 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.1)] border-y-4 md:border-8 border-white/40 overflow-hidden">
      <div className="absolute inset-0 opacity-10 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(circle,white_1px,transparent_1px)] bg-[size:40px_40px]"></div>
      </div>

      <div className="absolute top-2 md:top-4 left-4 md:left-6 right-4 md:right-6 flex justify-between items-center z-10">
        <div className="bg-white/20 backdrop-blur-md px-3 md:px-5 py-1 md:py-2 rounded-xl md:rounded-2xl text-white text-xs md:text-base font-game font-bold flex items-center gap-2 md:gap-3 border-2 border-white/30 shadow-lg">
          <i className="fas fa-layer-group text-[#FFE66D]"></i> Level {level}
        </div>
        <div className="bg-white/20 backdrop-blur-md px-3 md:px-5 py-1 md:py-2 rounded-xl md:rounded-2xl text-white text-xs md:text-base font-game font-bold flex items-center gap-2 md:gap-3 border-2 border-white/30 shadow-lg">
          <i className="fas fa-clock text-[#FF8E53]"></i> {timer}s
        </div>
      </div>

      <div className={`grid ${cards.length > 16 ? 'grid-cols-6' : 'grid-cols-4'} gap-2 md:gap-4 mt-10 md:mt-12`}>
        {cards.map((card, i) => (
          <div 
            key={card.id}
            onClick={() => handleCardClick(i)}
            className={`
              aspect-square rounded-xl md:rounded-2xl flex items-center justify-center ${cards.length > 16 ? 'text-xl md:text-2xl' : 'text-2xl md:text-4xl'} cursor-pointer transition-all duration-500 transform preserve-3d
              ${card.isFlipped || card.isMatched ? 'rotate-y-180 bg-white shadow-[0_10px_20px_rgba(0,0,0,0.1)]' : `${card.backColor} shadow-[0_5px_0_rgba(0,0,0,0.2)] md:shadow-[0_10px_0_rgba(0,0,0,0.2)] hover:scale-105 hover:brightness-110 border-2 border-white/20`}
            `}
          >
            {(card.isFlipped || card.isMatched) ? (
              <span className="drop-shadow-md animate-in zoom-in duration-300 select-none">{card.icon}</span>
            ) : (
              <i className="fas fa-question text-white/40 text-2xl"></i>
            )}
          </div>
        ))}
      </div>

      {isPaused && (
        <div className="absolute inset-0 bg-[#2F2E41]/80 flex items-center justify-center backdrop-blur-md z-30 rounded-none md:rounded-[40px]">
          <div className="glass-card p-10 text-center border-y-4 md:border-4 border-[#FFE66D] animate-in zoom-in duration-300 rounded-none md:rounded-[40px] w-full md:w-auto h-full md:h-auto flex flex-col justify-center">
            <div className="text-[#FFE66D] text-7xl mb-4"><i className="fas fa-bolt animate-pulse"></i></div>
            <h3 className="text-4xl font-game font-black text-[#FFE66D] mb-3">WAKTU HABIS!</h3>
            <p className="text-[#2F2E41] text-xl font-bold mb-6">Ayo isi ulang energimu dengan menjawab soal!</p>
          </div>
        </div>
      )}

      {showInstructions && (
        <div className="absolute inset-0 bg-black/70 z-40 overflow-y-auto p-0 md:p-6 flex justify-center items-start md:items-center backdrop-blur-md rounded-none md:rounded-[40px]">
          <div className="bg-white rounded-none md:rounded-[40px] p-6 md:p-10 max-w-none md:max-w-md w-full text-center space-y-6 shadow-2xl border-x-0 md:border-8 border-[#6C5CE7] animate-in zoom-in duration-300 min-h-full md:min-h-0 flex flex-col justify-center">
            <div className="w-20 h-20 bg-[#FFE66D] rounded-3xl flex items-center justify-center text-[#2F2E41] text-4xl mx-auto shadow-lg rotate-3">
              <i className="fas fa-brain"></i>
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-game font-black text-[#2F2E41]">Memory Rasio</h3>
              <p className="text-[#2F2E41]/70 font-medium">Temukan pasangan gambar yang sama!</p>
            </div>
            <div className="bg-indigo-50 p-4 rounded-2xl text-left space-y-3 border-2 border-indigo-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#6C5CE7] rounded-lg flex items-center justify-center text-white"><i className="fas fa-eye text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Ingat posisi gambar di balik kartu.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#A29BFE] rounded-lg flex items-center justify-center text-white"><i className="fas fa-check text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Buka 2 kartu yang sama untuk mencocokkannya.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#FF8E53] rounded-lg flex items-center justify-center text-white"><i className="fas fa-clock text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Selesaikan sebelum waktu habis!</p>
              </div>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowInstructions(false); }}
              className="w-full bg-[#6C5CE7] hover:bg-[#5b4bc4] text-white py-4 rounded-2xl font-black text-xl shadow-[0_8px_0_rgb(82,70,175)] transition-all active:shadow-none active:translate-y-[8px]"
            >
              MULAI ASAH OTAK!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Word Search Game Component (Peluang) ---

interface WordSearchProps {
  onTimerEnd: () => void;
  onFound: () => void;
  isPaused: boolean;
  timer: number;
  setTimer: React.Dispatch<React.SetStateAction<number>>;
}

const WordSearch: React.FC<WordSearchProps> = ({ onTimerEnd, onFound, isPaused, timer, setTimer }) => {
  const ALL_WORDS = [
    'PELUANG', 'SAMPEL', 'ACAK', 'DATA', 'RUANG', 'TITIK', 'PASTI', 
    'KEJADIAN', 'MUNGKIN', 'LOGIKA', 'PREDIKSI', 'RASIO', 'PERSEN', 
    'TABEL', 'GRAFIK', 'FREKUENSI', 'HIMPUNAN', 'KOMBINASI', 'PERMUTASI',
    'DISTRIBUSI', 'VARIABEL', 'MODUS', 'MEAN', 'MEDIAN', 'BOLA', 'DADU', 
    'KOIN', 'KARTU', 'HASIL', 'COBA', 'TEORI', 'NILAI', 'HITUNG', 
    'STATISTIK', 'POPULASI', 'HARAPAN', 'KEPASTIAN', 'KEMUNGKINAN',
    'EKSPERIMEN', 'FREKUENSI', 'RELATIF', 'DIAGRAM', 'BATANG', 'LINGKARAN'
  ];
  const [currentWords, setCurrentWords] = useState<string[]>([]);
  const [level, setLevel] = useState(1);
  const GRID_SIZE = 12;
  const [showInstructions, setShowInstructions] = useState(true);
  
  const [grid, setGrid] = useState<string[][]>(Array(12).fill(null).map(() => Array(12).fill('')));
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [selection, setSelection] = useState<{ r: number; c: number }[]>([]);
  const [wordPositions, setWordPositions] = useState<{ word: string; cells: { r: number; c: number }[] }[]>([]);

  const initGrid = useCallback(() => {
    // Start with 5 words, increase by 2 each level
    const wordCount = Math.min(5 + (level - 1) * 2, 15);
    const selectedWords = [...ALL_WORDS].sort(() => Math.random() - 0.5).slice(0, wordCount);
    setCurrentWords(selectedWords);

    const newGrid: string[][] = Array(GRID_SIZE).fill(null).map(() => Array(GRID_SIZE).fill(''));
    const positions: { word: string; cells: { r: number; c: number }[] }[] = [];

    selectedWords.forEach(word => {
      if (word.length > GRID_SIZE) return;
      let placed = false;
      let attempts = 0;
      while (!placed && attempts < 100) {
        attempts++;
        const direction = Math.random() > 0.5 ? 'H' : 'V';
        const row = Math.floor(Math.random() * (direction === 'V' ? GRID_SIZE - word.length : GRID_SIZE));
        const col = Math.floor(Math.random() * (direction === 'H' ? GRID_SIZE - word.length : GRID_SIZE));
        
        let canPlace = true;
        const cells = [];
        for (let i = 0; i < word.length; i++) {
          const r = direction === 'V' ? row + i : row;
          const c = direction === 'H' ? col + i : col;
          if (newGrid[r][c] !== '' && newGrid[r][c] !== word[i]) {
            canPlace = false;
            break;
          }
          cells.push({ r, c });
        }

        if (canPlace) {
          cells.forEach((cell, i) => {
            newGrid[cell.r][cell.c] = word[i];
          });
          positions.push({ word, cells });
          placed = true;
        }
      }
    });

    // Fill remaining
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (newGrid[r][c] === '') {
          newGrid[r][c] = String.fromCharCode(65 + Math.floor(Math.random() * 26));
        }
      }
    }

    setGrid(newGrid);
    setWordPositions(positions);
    setFoundWords([]);
    setSelection([]);
  }, []);

  useEffect(() => {
    initGrid();
  }, [initGrid]);

  useEffect(() => {
    if (isPaused || timer <= 0 || showInstructions) return;
    const interval = setInterval(() => {
      setTimer(prev => {
        if (prev <= 1) {
          onTimerEnd();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isPaused, timer, onTimerEnd, setTimer, showInstructions]);

  const handleCellClick = (r: number, c: number) => {
    if (isPaused || showInstructions) return;

    const newSelection = [...selection];
    const index = newSelection.findIndex(s => s.r === r && s.c === c);
    
    if (index !== -1) {
      newSelection.splice(index, 1);
    } else {
      newSelection.push({ r, c });
    }
    setSelection(newSelection);

    // Check if selection matches any word
    const selectedWord = newSelection
      .map(s => grid[s.r][s.c])
      .join('');
    
    const reversedWord = selectedWord.split('').reverse().join('');

    const found = wordPositions.find(wp => 
      (wp.word === selectedWord || wp.word === reversedWord) && 
      wp.cells.length === newSelection.length &&
      wp.cells.every(cell => newSelection.some(s => s.r === cell.r && s.c === cell.c))
    );

    if (found && !foundWords.includes(found.word)) {
      onFound();
      setFoundWords(prev => [...prev, found.word]);
      setSelection([]);
      if (foundWords.length + 1 === currentWords.length) {
        setTimer(prev => prev + 30);
        setLevel(prev => prev + 1);
        setTimeout(initGrid, 1000);
      }
    }
  };

  return (
    <div className="relative w-full min-h-[550px] md:min-h-[600px] bg-gradient-to-br from-[#4ECDC4] to-[#45b7af] rounded-none md:rounded-[40px] p-4 md:p-8 shadow-[0_20px_50px_rgba(0,0,0,0.3)] border-y-4 md:border-8 border-white/30 overflow-hidden">
      <div className="absolute top-2 md:top-4 left-4 md:left-6 right-4 md:right-6 flex justify-between items-center z-10">
        <div className="flex gap-2 md:gap-3">
          <div className="bg-white/20 backdrop-blur-md px-2 md:px-4 py-1 md:py-2 rounded-xl md:rounded-2xl text-white font-game font-bold flex items-center gap-1 md:gap-2 border-2 border-white/30 shadow-lg text-[10px] md:text-sm">
            <i className="fas fa-layer-group text-[#FFE66D]"></i> Lvl {level}
          </div>
          <div className="bg-white/20 backdrop-blur-md px-2 md:px-4 py-1 md:py-2 rounded-xl md:rounded-2xl text-white font-game font-bold flex items-center gap-1 md:gap-2 border-2 border-white/30 shadow-lg text-[10px] md:text-sm">
            <i className="fas fa-clock text-[#FF8E53]"></i> {timer}s
          </div>
        </div>
        <div className="bg-white/20 backdrop-blur-md px-2 md:px-4 py-1 md:py-2 rounded-xl md:rounded-2xl text-white font-game font-bold flex items-center gap-1 md:gap-2 border-2 border-white/30 shadow-lg text-[10px] md:text-sm">
          <i className="fas fa-check-circle text-[#FFE66D]"></i> {foundWords.length}/{currentWords.length}
        </div>
      </div>

      <div className="grid grid-cols-12 gap-0.5 md:gap-1 mt-10 md:mt-14 bg-white/90 p-2 md:p-3 rounded-[24px] md:rounded-[30px] shadow-2xl border-2 md:border-4 border-white/40">
        {grid.map((row, r) => 
          row.map((char, c) => {
            const isSelected = selection.some(s => s.r === r && s.c === c);
            const isFound = wordPositions.some(wp => foundWords.includes(wp.word) && wp.cells.some(cell => cell.r === r && cell.c === c));
            return (
              <div 
                key={`${r}-${c}`}
                onClick={() => handleCellClick(r, c)}
                className={`
                  aspect-square flex items-center justify-center text-[10px] font-black cursor-pointer transition-all duration-300 rounded-lg
                  ${isSelected ? 'bg-[#FF6B6B] text-white scale-110 z-10 shadow-lg rotate-12' : ''}
                  ${isFound ? 'bg-[#4ECDC4] text-white opacity-40' : 'text-[#2F2E41] hover:bg-sky-100'}
                `}
              >
                {char}
              </div>
            );
          })
        )}
      </div>

      <div className="mt-8 flex flex-wrap gap-2 justify-center max-h-32 overflow-y-auto p-2">
        {currentWords.map(word => (
          <span 
            key={word} 
            className={`px-4 py-1.5 rounded-xl text-xs font-bold shadow-sm transition-all ${foundWords.includes(word) ? 'bg-[#4ECDC4] text-white line-through opacity-50' : 'bg-white text-[#2F2E41] border-2 border-white/20'}`}
          >
            {word}
          </span>
        ))}
      </div>

      {isPaused && (
        <div className="absolute inset-0 bg-[#2F2E41]/80 flex items-center justify-center backdrop-blur-md z-30 rounded-none md:rounded-[40px]">
          <div className="glass-card p-10 text-center border-y-4 md:border-4 border-[#FFE66D] animate-in zoom-in duration-300 rounded-none md:rounded-[40px] w-full md:w-auto h-full md:h-auto flex flex-col justify-center">
            <div className="text-[#FFE66D] text-7xl mb-4"><i className="fas fa-search animate-pulse"></i></div>
            <h3 className="text-4xl font-game font-black text-[#FFE66D] mb-3">WAKTU HABIS!</h3>
            <p className="text-[#2F2E41] text-xl font-bold mb-6">Ayo temukan lebih banyak kata dengan menjawab soal!</p>
          </div>
        </div>
      )}

      {showInstructions && (
        <div className="absolute inset-0 bg-black/70 z-40 overflow-y-auto p-0 md:p-6 flex justify-center items-start md:items-center backdrop-blur-md rounded-none md:rounded-[40px]">
          <div className="bg-white rounded-none md:rounded-[40px] p-6 md:p-10 max-w-none md:max-w-md w-full text-center space-y-6 shadow-2xl border-x-0 md:border-8 border-[#FF6B6B] animate-in zoom-in duration-300 min-h-full md:min-h-0 flex flex-col justify-center">
            <div className="w-20 h-20 bg-[#FFE66D] rounded-3xl flex items-center justify-center text-[#2F2E41] text-4xl mx-auto shadow-lg rotate-3">
              <i className="fas fa-search"></i>
            </div>
            <div className="space-y-2">
              <h3 className="text-3xl font-game font-black text-[#2F2E41]">Cari Kata Peluang</h3>
              <p className="text-[#2F2E41]/70 font-medium">Temukan kata-kata tersembunyi!</p>
            </div>
            <div className="bg-red-50 p-4 rounded-2xl text-left space-y-3 border-2 border-red-100">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#FF6B6B] rounded-lg flex items-center justify-center text-white"><i className="fas fa-font text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Cari kata di kotak huruf.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#4ECDC4] rounded-lg flex items-center justify-center text-white"><i className="fas fa-mouse-pointer text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Klik huruf satu per satu untuk memilih kata.</p>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-[#FFE66D] rounded-lg flex items-center justify-center text-[#2F2E41]"><i className="fas fa-star text-xs"></i></div>
                <p className="text-sm font-bold text-[#2F2E41]">Temukan semua kata sebelum waktu habis!</p>
              </div>
            </div>
            <button 
              onClick={(e) => { e.stopPropagation(); setShowInstructions(false); }}
              className="w-full bg-[#FF6B6B] hover:bg-[#ff5252] text-white py-4 rounded-2xl font-black text-xl shadow-[0_8px_0_rgb(204,85,85)] transition-all active:shadow-none active:translate-y-[8px]"
            >
              MENGERTI!
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main App Component ---

const App: React.FC = () => {
  const [isSplashing, setIsSplashing] = useState(true);
  const [view, setView] = useState<'home' | 'material' | 'quiz' | 'report' | 'admin-login' | 'admin-dashboard' | 'checkout'>('home');
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  const [progress, setProgress] = useState<UserProgress>(() => {
    const saved = localStorage.getItem('mv_progress');
    return saved ? JSON.parse(saved) : { points: 100, completedTopics: [], quizHistory: [] };
  });
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [admin, setAdmin] = useState<AdminUser>({ email: '', isAuthenticated: false });
  
  // FIX: Added adminSection state to track the active section in the admin dashboard
  const [adminSection, setAdminSection] = useState<'material' | 'questions'>('material');
  
  const [isLoaded, setIsLoaded] = useState(false);
  const [userEmail, setUserEmail] = useState('deralistiani023@gmail.com');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [isSyncingPending, setIsSyncingPending] = useState(false);

  const [questions, setQuestions] = useState<Question[]>(() => {
    const saved = localStorage.getItem('mv_questions');
    return saved ? JSON.parse(saved) : INITIAL_QUESTIONS;
  });
  const [materials, setMaterials] = useState<Material[]>(() => {
    const saved = localStorage.getItem('mv_materials');
    if (saved) return JSON.parse(saved);
    return Object.entries(INITIAL_MATERIALS).map(([topic, data]) => ({
      id: `mat-${topic}`,
      topic: topic as Topic,
      title: data.title,
      content: data.content,
      files: [],
      createdAt: new Date().toISOString()
    }));
  });

  const syncPendingData = useCallback(async () => {
    if (isSyncingPending) return;
    
    const pendingMaterials = materials.filter(m => m.id.startsWith('temp-'));
    const pendingQuestions = questions.filter(q => q.id.startsWith('temp-'));
    
    if (pendingMaterials.length === 0 && pendingQuestions.length === 0) return;
    
    setIsSyncingPending(true);
    console.log(`Syncing pending data: ${pendingMaterials.length} materials, ${pendingQuestions.length} questions`);
    
    try {
      // Sync Materials
      for (const mat of pendingMaterials) {
        const { data, error } = await supabase.from('materi').insert([{
          topik_materi: mat.topic,
          judul_materi: mat.title,
          isi_materi: mat.content,
          files: mat.files
        }]).select();
        
        if (!error && data && data.length > 0) {
          const newId = data[0].id.toString();
          setMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, id: newId } : m));
        } else if (error) {
          console.error("Error syncing material:", error);
          if (error.code === 'PGRST204') {
            console.error("Missing 'files' column in 'materi' table. Please run: ALTER TABLE materi ADD COLUMN files JSONB DEFAULT '[]'::jsonb;");
          }
        }
      }
      
      // Sync Questions
      for (const q of pendingQuestions) {
        const { data, error } = await supabase.from('soal').insert([{
          topik_materi: q.topic,
          soal: q.question,
          pilihan_ganda: q.options,
          jawaban_benar: q.correctAnswer,
          hint_pembahasan: q.hint,
          level: q.difficulty
        }]).select();
        
        if (!error && data && data.length > 0) {
          const newId = data[0].id.toString();
          setQuestions(prev => prev.map(item => item.id === q.id ? { ...item, id: newId } : item));
        }
      }
      
      console.log("Pending data sync completed");
    } catch (err) {
      console.error("Error syncing pending data:", err);
    } finally {
      setIsSyncingPending(false);
    }
  }, [materials, questions, isSyncingPending]);

  const fetchFromSupabase = useCallback(async () => {
    if (!navigator.onLine) {
      setSyncError("Anda sedang offline. Menggunakan data lokal.");
      setIsLoaded(true);
      return;
    }

    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
      console.warn("Supabase URL is missing or placeholder. Skipping cloud fetch.");
      setIsLoaded(true);
      return;
    }

    setIsRefreshing(true);
    setSyncError(null);
    try {
      console.log("Fetching data from Supabase...");
      
      // Fetch Materials
      const { data: matData, error: matError } = await supabase.from('materi').select('*');
      if (matError) throw matError;
      
      if (matData) {
        const dbMaterials = matData.map(m => ({
          id: m.id.toString(),
          topic: m.topik_materi as Topic,
          title: m.judul_materi,
          content: m.isi_materi,
          files: m.files || (m.file_url ? [{ name: m.file_name || 'File', type: m.file_type || 'unknown', size: '0', url: m.file_url }] : []),
          createdAt: m.created_at
        }));
        
        setMaterials(prev => {
          // Keep initial materials (mat-) and temp materials (temp-)
          const initialAndTemp = prev.filter(m => m.id.startsWith('mat-') || m.id.startsWith('temp-'));
          // Merge with DB materials, prioritizing DB for same IDs
          const merged = [...dbMaterials];
          initialAndTemp.forEach(local => {
            if (!dbMaterials.some(db => db.id === local.id)) {
              merged.push(local);
            }
          });
          return merged;
        });
      }

      // Fetch Questions
      const { data: qData, error: qError } = await supabase.from('soal').select('*');
      if (qError) throw qError;
      
      if (qData) {
        const dbQuestions = qData.map(q => ({
          id: q.id.toString(),
          topic: q.topik_materi as Topic,
          question: q.soal,
          options: q.pilihan_ganda,
          correctAnswer: q.jawaban_benar,
          hint: q.hint_pembahasan,
          difficulty: q.level as any
        }));

        setQuestions(prev => {
          // Keep initial questions (pola-, etc) and temp questions (temp-)
          const initialPrefixes = ['pola-', 'pecahan-', 'kubus-', 'rasio-', 'peluang-', 'temp-'];
          const initialAndTemp = prev.filter(q => initialPrefixes.some(p => q.id.startsWith(p)));
          
          // Merge with DB questions
          const merged = [...dbQuestions];
          initialAndTemp.forEach(local => {
            if (!dbQuestions.some(db => db.id === local.id)) {
              merged.push(local);
            }
          });
          return merged;
        });
      }
      
      // Fetch Progress
      const { data: progResults, error: progError } = await supabase.from('rapor_kemajuan').select('*').eq('user_email', userEmail).order('updated_at', { ascending: false }).limit(1);
      if (progError) throw progError;
      
      const progData = (progResults && progResults.length > 0) ? progResults[0] : null;
      if (progData) {
        setProgress({
          points: progData.poin,
          completedTopics: (progData.materi_selesai as Topic[]) || [],
          quizHistory: progData.riwayat_kuis || []
        });
      }
      
      setIsLoaded(true);
      console.log("Supabase sync completed successfully");
      
      // After successful fetch, try to sync any pending local data
      syncPendingData();
    } catch (err: any) {
      console.error("Error fetching from Supabase:", err);
      const isNetworkError = err.message?.includes('fetch') || 
                             err.message?.includes('Network') || 
                             err.message?.includes('Gagal mengambil data');
      
      if (isNetworkError) {
        setSyncError("Gagal terhubung ke cloud. Menggunakan data lokal.");
        console.warn("Network error detected during Supabase fetch. Using local data as fallback.");
      } else {
        setSyncError("Gagal sinkronisasi data.");
      }
      
      setIsLoaded(true);
    } finally {
      setIsRefreshing(false);
    }
  }, [userEmail, syncPendingData]);
  
  const [currentQuestionIdx, setCurrentQuestionIdx] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [showHint, setShowHint] = useState(false);
  const [quizFinished, setQuizFinished] = useState(false);
  const [isGameMode, setIsGameMode] = useState(false);
  const [gamePausedForQuestion, setGamePausedForQuestion] = useState(false);
  const [isAnsweringQuestion, setIsAnsweringQuestion] = useState(false);
  const [gameLives, setGameLives] = useState(3);
  const [gameTimer, setGameTimer] = useState(60);
  const MAX_LIVES = 3; 

  const [isGeneratingAI, setIsGeneratingAI] = useState(false);
  const [isGeneratingAIQuestion, setIsGeneratingAIQuestion] = useState(false);
  const [isSavingMaterial, setIsSavingMaterial] = useState(false);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);
  const [aiKeyword, setAiKeyword] = useState('');
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [modalFiles, setModalFiles] = useState<UploadedFile[]>([]);
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [expandedTopics, setExpandedTopics] = useState<Record<string, boolean>>({});
  const isProcessingFailure = useRef(false);

  // Confirmation Modal State
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDanger: boolean;
  }>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {},
    isDanger: false
  });

  const showConfirm = (title: string, message: string, onConfirm: () => void, isDanger: boolean = false) => {
    setConfirmModal({ isOpen: true, title, message, onConfirm, isDanger });
  };

  const uploadFileToSupabase = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `materi/${fileName}`;

      const { data, error } = await supabase.storage
        .from('materi_files')
        .upload(filePath, file);

      if (error) {
        if (error.message.includes('bucket not found')) {
          alert("Gagal mengunggah: Bucket 'materi_files' tidak ditemukan di Supabase Storage.\n\nSilakan buat bucket bernama 'materi_files' di dashboard Supabase Anda dan atur aksesnya menjadi publik.");
        } else {
          console.error("Upload error:", error);
          alert("Gagal mengunggah file: " + error.message);
        }
        return null;
      }

      const { data: { publicUrl } } = supabase.storage
        .from('materi_files')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (err) {
      console.error("Unexpected upload error:", err);
      return null;
    }
  };

  const handleModalFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setIsSavingMaterial(true);
    const uploadedFiles: UploadedFile[] = [];

    for (const file of Array.from(files) as File[]) {
      const url = await uploadFileToSupabase(file);
      if (url) {
        uploadedFiles.push({
          name: file.name,
          type: file.type,
          size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
          url: url
        });
      }
    }

    setModalFiles(prev => [...prev, ...uploadedFiles]);
    setIsSavingMaterial(false);
    if (uploadedFiles.length > 0) playSound('success');
  };

  const removeModalFile = (index: number) => {
    setModalFiles(prev => prev.filter((_, i) => i !== index));
    playSound('wrong');
  };

  const handleDeleteMaterial = async (id: string) => {
    showConfirm(
      "Hapus Materi",
      "Apakah Anda yakin ingin menghapus materi ini? Tindakan ini tidak dapat dibatalkan.",
      async () => {
        const isLocal = id.startsWith('mat-') || id.startsWith('temp-');
        
        if (isLocal) {
          setMaterials(prev => prev.filter(m => m.id !== id));
          playSound('wrong');
          return;
        }

        try {
          // Try numeric first if it looks like a number, otherwise use string
          const isNumeric = !isNaN(Number(id)) && id.trim() !== "";
          let error;
          
          if (isNumeric) {
            const result = await supabase.from('materi').delete().eq('id', Number(id));
            error = result.error;
          } else {
            const result = await supabase.from('materi').delete().eq('id', id);
            error = result.error;
          }

          if (!error) {
            setMaterials(prev => prev.filter(m => m.id !== id));
            playSound('wrong');
          } else {
            console.error("Error deleting material:", error);
            alert(`Gagal menghapus dari database: ${error.message}\n\nSaran: Pastikan RLS DELETE diizinkan di Supabase.`);
          }
        } catch (err: any) {
          console.error("Unexpected error deleting material:", err);
          alert("Terjadi kesalahan: " + err.message);
        }
      },
      true
    );
  };

  const handleDeleteQuestion = async (id: string) => {
    showConfirm(
      "Hapus Soal",
      "Apakah Anda yakin ingin menghapus soal ini? Soal akan hilang dari bank soal.",
      async () => {
        const isLocal = id.startsWith('temp-') || ['pola-', 'pecahan-', 'kubus-', 'rasio-', 'peluang-'].some(p => id.startsWith(p));
        
        if (isLocal) {
          setQuestions(prev => prev.filter(q => q.id !== id));
          playSound('wrong');
          return;
        }

        try {
          const isNumeric = !isNaN(Number(id)) && id.trim() !== "";
          let error;

          if (isNumeric) {
            const result = await supabase.from('soal').delete().eq('id', Number(id));
            error = result.error;
          } else {
            const result = await supabase.from('soal').delete().eq('id', id);
            error = result.error;
          }

          if (!error) {
            setQuestions(prev => prev.filter(q => q.id !== id));
            playSound('wrong');
          } else {
            console.error("Error deleting question:", error);
            alert(`Gagal menghapus soal: ${error.message}`);
          }
        } catch (err: any) {
          console.error("Unexpected error deleting question:", err);
          alert("Terjadi kesalahan: " + err.message);
        }
      },
      true
    );
  };

  const audioContextRef = useRef<AudioContext | null>(null);
  const bgmGainNodeRef = useRef<GainNode | null>(null);

  const initAudio = () => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioContextRef.current;
  };

  const playSound = useCallback(async (type: 'correct' | 'wrong' | 'click' | 'success' | 'hint' | 'jump' | 'life-up' | 'life-down' | 'chew') => {
    if (!soundEnabled) return;
    const ctx = initAudio();
    if (ctx.state === 'suspended') await ctx.resume();

    const playTone = (freq: number, toneType: OscillatorType, duration: number, volume = 0.1) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = toneType;
      osc.frequency.setValueAtTime(freq, ctx.currentTime);
      gain.gain.setValueAtTime(volume, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + duration);
    };

    switch(type) {
      case 'life-up':
        playTone(440, 'sine', 0.1, 0.2);
        setTimeout(() => playTone(880, 'sine', 0.2, 0.2), 100);
        break;
      case 'life-down':
        // Distinct "ugh/damage" sound for trash or falling
        playTone(200, 'sawtooth', 0.15, 0.2);
        setTimeout(() => playTone(120, 'sawtooth', 0.25, 0.2), 100);
        break;
      case 'jump':
        playTone(300, 'square', 0.1, 0.05);
        setTimeout(() => playTone(500, 'square', 0.1, 0.05), 50);
        break;
      case 'correct':
        playTone(523.25, 'sine', 0.2, 0.2); 
        setTimeout(() => playTone(659.25, 'sine', 0.3, 0.2), 100); 
        break;
      case 'wrong':
        playTone(220, 'sawtooth', 0.4, 0.1); 
        playTone(180, 'sawtooth', 0.4, 0.1);
        break;
      case 'click':
        playTone(440, 'sine', 0.1, 0.1);
        break;
      case 'success':
        [523, 659, 783, 1046].forEach((f, i) => {
          setTimeout(() => playTone(f, 'sine', 0.5, 0.15), i * 150);
        });
        break;
      case 'hint':
        playTone(880, 'sine', 0.1, 0.1);
        setTimeout(() => playTone(1100, 'sine', 0.2, 0.1), 80);
        break;
      case 'chew':
        // "Nyam nyam nyam" - three quick bites with slight pitch variation
        [0, 120, 240].forEach((delay, i) => {
          setTimeout(() => {
            playTone(160 - (i * 10), 'square', 0.08, 0.12);
            playTone(110 - (i * 5), 'square', 0.05, 0.08);
          }, delay);
        });
        break;
    }
  }, [soundEnabled]);

  const startBGM = useCallback(() => {
    const ctx = initAudio();
    const mainGain = ctx.createGain();
    mainGain.gain.value = 0.4;
    mainGain.connect(ctx.destination);
    bgmGainNodeRef.current = mainGain;

    const melody = [
      { f: 261.63, d: 200 }, { f: 329.63, d: 200 }, { f: 392.00, d: 200 }, { f: 523.25, d: 400 },
      { f: 440.00, d: 200 }, { f: 349.23, d: 200 }, { f: 261.63, d: 200 }, { f: 392.00, d: 400 },
      { f: 329.63, d: 200 }, { f: 261.63, d: 200 }, { f: 293.66, d: 200 }, { f: 392.00, d: 400 },
      { f: 392.00, d: 200 }, { f: 440.00, d: 200 }, { f: 523.25, d: 400 }, { f: 783.99, d: 800 }
    ];
    let step = 0;

    const scheduler = () => {
      if (!soundEnabled) return;
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'square';
      const item = melody[step % melody.length];
      osc.frequency.value = item.f;
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (item.d / 1000));
      osc.connect(g);
      g.connect(mainGain);
      osc.start();
      osc.stop(ctx.currentTime + (item.d / 1000) + 0.1);
      step++;
      setTimeout(scheduler, item.d);
    };
    scheduler();
  }, [soundEnabled]);

  const toggleSound = () => {
    setSoundEnabled(prev => !prev);
    playSound('click');
  };

  useEffect(() => {
    if (!gamePausedForQuestion) {
      isProcessingFailure.current = false;
    }
  }, [gamePausedForQuestion]);

  const handleStartGame = async () => {
    const ctx = initAudio();
    await ctx.resume();
    startBGM();
    playSound('success');
    setIsSplashing(false);
  };

  const handleSaveMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingMaterial) return;
    
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const title = formData.get('title') as string;
    const topic = formData.get('topic') as Topic;
    const content = formData.get('content') as string;

    setIsSavingMaterial(true);
    try {
      console.log("Saving material process started...");

      if (!title || !content) {
        alert("Judul dan isi materi harus diisi!");
        setIsSavingMaterial(false);
        return;
      }

      console.log("Form data captured:", { title, topic, content });

      const isInitialMaterial = editingMaterial && editingMaterial.id.startsWith('mat-');
      const isUpdatingRealRecord = editingMaterial && !isInitialMaterial;

      let finalMaterial: Material;

      if (isUpdatingRealRecord) {
        console.log("Updating existing Supabase record:", editingMaterial.id);
        const numericId = isNaN(Number(editingMaterial.id)) ? editingMaterial.id : Number(editingMaterial.id);
        
        const firstFile = modalFiles.length > 0 ? modalFiles[0] : null;
        
        const { error } = await supabase.from('materi').update({
          topik_materi: topic,
          judul_materi: title,
          isi_materi: content,
          files: modalFiles,
          // Legacy columns for compatibility
          file_url: firstFile ? firstFile.url : null,
          file_name: firstFile ? firstFile.name : null,
          file_type: firstFile ? firstFile.type : null
        }).eq('id', numericId);

        if (error) throw error;

        finalMaterial = { ...editingMaterial, title, topic, content, files: modalFiles };
        setMaterials(prev => prev.map(m => m.id === editingMaterial.id ? finalMaterial : m));
        console.log("Update successful");
      } else {
        console.log("Inserting new record into Supabase...");
        
        const firstFile = modalFiles.length > 0 ? modalFiles[0] : null;
        
        let insertPayload: any = {
          topik_materi: topic,
          judul_materi: title,
          isi_materi: content,
          files: modalFiles,
          // Legacy columns for compatibility
          file_url: firstFile ? firstFile.url : null,
          file_name: firstFile ? firstFile.name : null,
          file_type: firstFile ? firstFile.type : null
        };

        let { data, error } = await supabase.from('materi').insert([insertPayload]).select();

        // SELF-HEALING: If ID is missing (Error 23502), try to generate one manually
        if (error && error.code === '23502') {
          console.warn("Detected missing auto-increment on 'id' column. Attempting manual ID generation...");
          try {
            const { data: maxData } = await supabase.from('materi').select('id').order('id', { ascending: false }).limit(1);
            const nextId = (maxData && maxData.length > 0) ? (Number(maxData[0].id) + 1) : 1;
            
            console.log("Retrying with manual ID:", nextId);
            const retry = await supabase.from('materi').insert([{
              id: nextId,
              ...insertPayload
            }]).select();
            
            data = retry.data;
            error = retry.error;
          } catch (retryErr) {
            console.error("Manual ID generation failed:", retryErr);
          }
        }

        if (error) {
          console.error("Supabase Insert Error:", error);
          if (error.code === '23502') {
            alert("Gagal menyimpan: Database Supabase Anda belum diatur untuk Auto-Increment pada kolom ID.\n\nSolusi Cepat: Jalankan perintah ini di SQL Editor Supabase:\nALTER TABLE materi ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;");
          } else if (error.code === '42501') {
            alert("Gagal menyimpan: Kebijakan RLS (Row-Level Security) Supabase menolak akses.\n\nSolusi Cepat: Jalankan perintah ini di SQL Editor Supabase untuk mengizinkan akses:\n\nALTER TABLE materi ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"Allow all access\" ON materi FOR ALL USING (true);");
          } else {
            alert("Gagal menyimpan ke database (Supabase), materi akan disimpan sementara di browser ini.");
          }
          finalMaterial = {
            id: 'temp-' + Date.now().toString(),
            topic,
            title,
            content,
            files: modalFiles,
            createdAt: new Date().toISOString()
          };
        } else if (!data || data.length === 0) {
          console.warn("Insert successful but no data returned (possibly RLS). Using local fallback for ID.");
          finalMaterial = {
            id: 'temp-' + Date.now().toString(),
            topic,
            title,
            content,
            files: modalFiles,
            createdAt: new Date().toISOString()
          };
        } else {
          console.log("Insert successful, new record:", data[0]);
          finalMaterial = {
            id: data[0].id.toString(),
            topic,
            title,
            content,
            files: modalFiles,
            createdAt: data[0].created_at || new Date().toISOString()
          };
        }

        if (isInitialMaterial) {
          setMaterials(prev => prev.map(m => m.id === editingMaterial.id ? finalMaterial : m));
        } else {
          setMaterials(prev => [finalMaterial, ...prev]);
        }
      }

      // Close modal and reset state immediately after successful state update
      setIsMaterialModalOpen(false);
      setEditingMaterial(null);
      playSound('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      alert("Materi berhasil disimpan!");
      console.log("Material save process completed successfully");
    } catch (error: any) {
      console.error("Error in handleSaveMaterial:", error);
      const isNetworkError = error.message?.includes('fetch') || 
                             error.message?.includes('Network') || 
                             error.message?.includes('Gagal mengambil data');
      
      if (isNetworkError) {
        const tempId = 'temp-' + Date.now().toString();
        const finalMaterial: Material = {
          id: tempId,
          topic,
          title,
          content,
          files: modalFiles,
          createdAt: new Date().toISOString()
        };
        
        setMaterials(prev => [finalMaterial, ...prev]);
        setIsMaterialModalOpen(false);
        setEditingMaterial(null);
        alert("Kesalahan Jaringan: Gagal menghubungi Supabase. Materi disimpan sementara di browser ini.\n\nTips: Periksa koneksi internet atau konfigurasi API Key Anda.");
      } else if (error.code === 'PGRST204' || (error.message && error.message.includes('files'))) {
        alert("Gagal menyimpan: Kolom 'files' belum ada di tabel 'materi' Supabase Anda.\n\nSolusi Cepat: Jalankan perintah ini di SQL Editor Supabase:\n\nALTER TABLE materi ADD COLUMN files JSONB DEFAULT '[]'::jsonb;");
      } else {
        const errorMsg = error.message || "Terjadi kesalahan yang tidak diketahui. Periksa kebijakan RLS Supabase Anda.";
        alert("Gagal menyimpan materi: " + errorMsg);
      }
    } finally {
      setIsSavingMaterial(false);
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingQuestion) return;
    
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    const topic = formData.get('topic') as Topic;
    const question = formData.get('question') as string;
    const correct = formData.get('correct') as string;
    const opt1 = formData.get('opt1') as string;
    const opt2 = formData.get('opt2') as string;
    const opt3 = formData.get('opt3') as string;
    const hint = formData.get('hint') as string;
    const difficulty = formData.get('difficulty') as any;

    setIsSavingQuestion(true);
    try {
      console.log("Saving question process started...");

      if (!question || !correct || !opt1 || !opt2 || !opt3) {
        alert("Semua kolom pertanyaan dan pilihan harus diisi!");
        setIsSavingQuestion(false);
        return;
      }

      console.log("Data to save:", { topic, question, correct, difficulty });

      const options = [correct, opt1, opt2, opt3];
      const shuffledOptions = [...options].sort(() => Math.random() - 0.5);
      const correctIdx = shuffledOptions.indexOf(correct);

      const isInitialQuestion = editingQuestion && ['pola-', 'pecahan-', 'kubus-', 'rasio-', 'peluang-'].some(p => editingQuestion.id.startsWith(p));
      const isUpdatingRealRecord = editingQuestion && !isInitialQuestion;

      let finalQuestion: Question;

      if (isUpdatingRealRecord) {
        console.log("Updating existing question in Supabase:", editingQuestion.id);
        const numericId = isNaN(Number(editingQuestion.id)) ? editingQuestion.id : Number(editingQuestion.id);
        const { error } = await supabase.from('soal').update({
          topik_materi: topic,
          soal: question,
          pilihan_ganda: shuffledOptions,
          jawaban_benar: correctIdx,
          hint_pembahasan: hint,
          level: difficulty
        }).eq('id', numericId);

        if (error) throw error;

        finalQuestion = {
          ...editingQuestion,
          topic,
          question,
          options: shuffledOptions,
          correctAnswer: correctIdx,
          hint,
          difficulty
        };
        setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? finalQuestion : q));
        console.log("Update successful");
      } else {
        console.log("Inserting new question into Supabase...");
        
        let insertPayload: any = {
          topik_materi: topic,
          soal: question,
          pilihan_ganda: shuffledOptions,
          jawaban_benar: correctIdx,
          hint_pembahasan: hint,
          level: difficulty
        };

        let { data, error } = await supabase.from('soal').insert([insertPayload]).select();

        // SELF-HEALING: If ID is missing (Error 23502), try to generate one manually
        if (error && error.code === '23502') {
          console.warn("Detected missing auto-increment on 'id' column in 'soal'. Attempting manual ID generation...");
          try {
            const { data: maxData } = await supabase.from('soal').select('id').order('id', { ascending: false }).limit(1);
            const nextId = (maxData && maxData.length > 0) ? (Number(maxData[0].id) + 1) : 1;
            
            console.log("Retrying with manual ID for question:", nextId);
            const retry = await supabase.from('soal').insert([{
              id: nextId,
              ...insertPayload
            }]).select();
            
            data = retry.data;
            error = retry.error;
          } catch (retryErr) {
            console.error("Manual ID generation failed for question:", retryErr);
          }
        }

        if (error) {
          console.error("Supabase Question Insert Error:", error);
          if (error.code === '23502') {
            alert("Gagal menyimpan: Database Supabase Anda belum diatur untuk Auto-Increment pada kolom ID.\n\nSolusi Cepat: Jalankan perintah ini di SQL Editor Supabase:\nALTER TABLE soal ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY;");
          } else if (error.code === '42501') {
            alert("Gagal menyimpan: Kebijakan RLS (Row-Level Security) Supabase menolak akses.\n\nSolusi Cepat: Jalankan perintah ini di SQL Editor Supabase untuk mengizinkan akses:\n\nALTER TABLE soal ENABLE ROW LEVEL SECURITY;\nCREATE POLICY \"Allow all access\" ON soal FOR ALL USING (true);");
          } else {
            alert("Gagal menyimpan ke database, soal akan disimpan sementara di browser ini.");
          }
          finalQuestion = {
            id: 'temp-' + Date.now().toString(),
            topic,
            question,
            options: shuffledOptions,
            correctAnswer: correctIdx,
            hint,
            difficulty
          };
        } else if (!data || data.length === 0) {
          console.warn("Insert successful but no data returned (possibly RLS). Using local fallback for ID.");
          finalQuestion = {
            id: 'temp-' + Date.now().toString(),
            topic,
            question,
            options: shuffledOptions,
            correctAnswer: correctIdx,
            hint,
            difficulty
          };
        } else {
          console.log("Insert successful, new record:", data[0]);
          finalQuestion = {
            id: data[0].id.toString(),
            topic,
            question,
            options: shuffledOptions,
            correctAnswer: correctIdx,
            hint,
            difficulty
          };
        }
        
        if (isInitialQuestion) {
          setQuestions(prev => prev.map(q => q.id === editingQuestion.id ? finalQuestion : q));
        } else {
          setQuestions(prev => [finalQuestion, ...prev]);
        }
      }

      setIsQuestionModalOpen(false);
      setEditingQuestion(null);
      playSound('success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      alert("Soal berhasil disimpan!");
      console.log("Question save process completed successfully");
    } catch (error: any) {
      console.error("Error in handleSaveQuestion:", error);
      const isNetworkError = error.message?.includes('fetch') || 
                             error.message?.includes('Network') || 
                             error.message?.includes('Gagal mengambil data');
      
      if (isNetworkError) {
        const tempId = 'temp-' + Date.now().toString();
        const finalQuestion: Question = {
          id: tempId,
          topic,
          question,
          options: [correct, opt1, opt2, opt3],
          correctAnswer: 0, // In temp mode, first is correct
          hint,
          difficulty
        };
        
        setQuestions(prev => [finalQuestion, ...prev]);
        setIsQuestionModalOpen(false);
        setEditingQuestion(null);
        alert("Kesalahan Jaringan: Gagal menghubungi Supabase. Soal disimpan sementara di browser ini.\n\nTips: Periksa koneksi internet atau konfigurasi API Key Anda.");
      } else {
        const errorMsg = error.message || "Terjadi kesalahan yang tidak diketahui. Periksa kebijakan RLS Supabase Anda.";
        alert("Gagal menyimpan soal: " + errorMsg);
      }
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleAIContent = async (topic: Topic) => {
    if (!aiKeyword) {
      alert("Masukkan kata kunci terlebih dahulu!");
      return;
    }
    setIsGeneratingAI(true);
    try {
      const content = await generateAIContent(aiKeyword, topic);
      const contentArea = document.getElementById('material-content') as HTMLTextAreaElement;
      if (contentArea) contentArea.value = content;
      playSound('success');
    } catch (error) {
      console.error(error);
      alert("Gagal membuat materi AI.");
    } finally {
      setIsGeneratingAI(false);
    }
  };

  const handleAIQuestion = async (topic: Topic, difficulty: string) => {
    const material = materials.find(m => m.topic === topic);
    if (!material) {
      alert("Materi untuk topik ini tidak ditemukan. Buat materi terlebih dahulu!");
      return;
    }

    setIsGeneratingAIQuestion(true);
    try {
      const generated = await generateAIQuestions(material.content, topic, 1, difficulty);
      if (generated && generated.length > 0) {
        const q = generated[0];
        const form = document.getElementById('question-form') as HTMLFormElement;
        if (form) {
          (form.elements.namedItem('question') as HTMLTextAreaElement).value = q.question;
          (form.elements.namedItem('correct') as HTMLInputElement).value = q.options[q.correctAnswer];
          
          const wrongOptions = q.options.filter((_, i) => i !== q.correctAnswer);
          (form.elements.namedItem('opt1') as HTMLInputElement).value = wrongOptions[0] || '';
          (form.elements.namedItem('opt2') as HTMLInputElement).value = wrongOptions[1] || '';
          (form.elements.namedItem('opt3') as HTMLInputElement).value = wrongOptions[2] || '';
          (form.elements.namedItem('hint') as HTMLTextAreaElement).value = q.hint;
        }
        playSound('success');
      }
    } catch (error) {
      console.error(error);
      alert("Gagal membuat soal AI.");
    } finally {
      setIsGeneratingAIQuestion(false);
    }
  };

  useEffect(() => {
    fetchFromSupabase();
    
    // Auto-refresh when window regains focus
    const handleFocus = () => {
      console.log("Window focused, refreshing data...");
      fetchFromSupabase();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []); // Remove fetchFromSupabase from dependencies to prevent infinite loop

  useEffect(() => {
    if (bgmGainNodeRef.current) {
      bgmGainNodeRef.current.gain.setTargetAtTime(soundEnabled ? 0.4 : 0, initAudio().currentTime, 0.1);
    }
  }, [soundEnabled]);

  useEffect(() => {
    if (!isLoaded) return;

    const syncProgress = async () => {
      if (!navigator.onLine) {
        setSyncError("Anda sedang offline. Progres disimpan secara lokal.");
        return;
      }

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (!supabaseUrl || supabaseUrl.includes('placeholder')) {
        setSyncError("Konfigurasi Supabase belum lengkap (VITE_SUPABASE_URL).");
        return;
      }

      try {
        const { data: results, error: selectError } = await supabase.from('rapor_kemajuan').select('id').eq('user_email', userEmail).order('updated_at', { ascending: false }).limit(1);
        
        if (selectError) throw selectError;

        const data = (results && results.length > 0) ? results[0] : null;

        const payload = {
          user_email: userEmail,
          poin: progress.points,
          materi_selesai: progress.completedTopics,
          total_soal: progress.quizHistory.reduce((acc, curr) => acc + curr.total, 0),
          jawaban_benar: progress.quizHistory.reduce((acc, curr) => acc + curr.score, 0),
          akurasi_rata_rata: progress.quizHistory.length > 0 
            ? (progress.quizHistory.reduce((acc, curr) => acc + (curr.score/curr.total), 0) / progress.quizHistory.length) * 100 
            : 0,
          riwayat_kuis: progress.quizHistory,
          updated_at: new Date().toISOString()
        };

        let error;
        if (data) {
          const { error: updateError } = await supabase.from('rapor_kemajuan').update(payload).eq('id', data.id);
          error = updateError;
        } else {
          const { error: insertError } = await supabase.from('rapor_kemajuan').insert([payload]);
          error = insertError;
        }

        if (error) {
          console.error("Supabase Progress Sync Error:", error);
          setSyncError("Gagal menyimpan progres ke cloud.");
          if (error.code === '42501') {
            // RLS Error - only alert once to avoid spamming during quiz
            const lastAlert = (window as any)._lastRlsAlert || 0;
            if (Date.now() - lastAlert > 10000) { // Alert at most every 10 seconds
              alert("Gagal sinkronisasi progres: Kebijakan RLS Supabase menolak akses ke tabel 'rapor_kemajuan'.\n\nSilakan jalankan perintah SQL fix yang telah diberikan sebelumnya.");
              (window as any)._lastRlsAlert = Date.now();
            }
          } else if (error.code === 'PGRST204') {
            // Missing column error
            const lastAlert = (window as any)._lastSchemaAlert || 0;
            if (Date.now() - lastAlert > 10000) {
              alert("Gagal sinkronisasi: Kolom 'riwayat_kuis' tidak ditemukan di tabel 'rapor_kemajuan'.\n\nSolusi: Jalankan perintah SQL ini di Supabase:\nALTER TABLE rapor_kemajuan ADD COLUMN riwayat_kuis JSONB DEFAULT '[]'::jsonb;");
              (window as any)._lastSchemaAlert = Date.now();
            }
          }
          throw error;
        }
        setSyncError(null); // Clear error on success
      } catch (err: any) {
        console.error("Failed to sync progress to Supabase:", err);
        
        const isNetworkError = err.message?.includes('fetch') || 
                               err.message?.includes('Network') || 
                               err.name === 'TypeError';
        
        if (isNetworkError) {
          setSyncError("Gagal sinkronisasi: Masalah koneksi ke Supabase (Failed to fetch).");
          // Only alert once to avoid spamming
          const lastAlert = (window as any)._lastFetchAlert || 0;
          if (Date.now() - lastAlert > 60000) { // Alert at most every 1 minute
            console.warn("Network error detected. Possible causes: Incorrect Supabase URL, Ad-blocker, or Project Paused.");
            (window as any)._lastFetchAlert = Date.now();
          }
        } else {
          setSyncError("Gagal sinkronisasi progres.");
        }
      }
    };

    syncProgress();
    localStorage.setItem('mv_progress', JSON.stringify(progress));
  }, [progress, isLoaded, userEmail]);

  useEffect(() => {
    localStorage.setItem('mv_questions', JSON.stringify(questions));
  }, [questions]);

  useEffect(() => {
    localStorage.setItem('mv_materials', JSON.stringify(materials));
  }, [materials]);

  const resetProgress = async () => {
    showConfirm(
      "Reset Progres",
      "Apakah Anda yakin ingin mereset semua progres? Skor akan dihapus dan poin kembali ke 100. Data di cloud juga akan diperbarui.",
      async () => {
        const resetData: UserProgress = { points: 100, completedTopics: [], quizHistory: [] };
        
        // Update local state and storage
        localStorage.setItem('mv_progress', JSON.stringify(resetData));
        setProgress(resetData);
        playSound('wrong');

        // Sync to Supabase immediately
        try {
          console.log("Syncing reset to Supabase for:", userEmail);
          const { data: results, error: selectError } = await supabase.from('rapor_kemajuan').select('id').eq('user_email', userEmail).order('updated_at', { ascending: false }).limit(1);
          
          if (selectError) {
            console.error("Error finding record to reset:", selectError);
            alert("Progres direset secara lokal, tapi gagal mencari data di cloud: " + selectError.message);
            return;
          }

          const existingRecord = (results && results.length > 0) ? results[0] : null;

          const payload = {
            user_email: userEmail,
            poin: 100,
            materi_selesai: [],
            total_soal: 0,
            jawaban_benar: 0,
            akurasi_rata_rata: 0,
            riwayat_kuis: [],
            updated_at: new Date().toISOString()
          };

          let syncError;
          if (existingRecord) {
            console.log("Updating existing progress record:", existingRecord.id);
            const { error } = await supabase.from('rapor_kemajuan').update(payload).eq('id', existingRecord.id);
            syncError = error;
          } else {
            console.log("No existing progress record found, inserting new one.");
            const { error } = await supabase.from('rapor_kemajuan').insert([payload]);
            syncError = error;
          }

          if (syncError) {
            console.error("Error syncing reset to Supabase:", syncError);
            alert("Progres direset secara lokal, tapi gagal sinkron ke cloud: " + syncError.message);
          } else {
            console.log("Progress reset synced to Supabase successfully");
            alert("Progres berhasil direset!");
          }
        } catch (err: any) {
          console.error("Unexpected error syncing reset:", err);
          alert("Terjadi kesalahan saat sinkronisasi reset: " + err.message);
        }
      },
      true
    );
  };

  const renderHome = () => (
    <div className="px-4 md:px-0 space-y-12 animate-in fade-in duration-700 w-full">
      <header className="text-center space-y-8 bg-sky-50 p-8 md:p-12 rounded-[40px] md:rounded-[50px] border-2 border-sky-100 shadow-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-sky-200/20 rounded-full -mr-16 -mt-16 blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-sky-200/20 rounded-full -ml-20 -mb-20 blur-3xl"></div>
        
        <div className="space-y-4 relative z-10">
          <h1 className="text-4xl md:text-7xl font-game font-bold text-[#2F2E41] leading-tight">Halo, Selamat Datang,<br/><span className="text-[#4ECDC4]">Pahlawan Matematika!</span></h1>
          <p className="text-lg md:text-2xl text-[#2F2E41]/70 max-w-3xl mx-auto font-medium">Mari kita mulai petualangan belajar yang seru dan menyenangkan. Pilih misi pertamamu!</p>
        </div>

        <div className="flex justify-center gap-4 relative z-10">
          <button 
            onClick={() => { setView('report'); playSound('click'); }}
            className="bg-[#FFE66D] hover:bg-[#f7d74d] text-[#2F2E41] px-12 py-4 rounded-2xl font-black text-xl shadow-[0_8px_0_rgb(212,163,0)] transition-all hover:scale-105 active:shadow-none active:translate-y-[8px] flex items-center justify-center gap-3 border-4 border-black/5"
          >
            <i className="fas fa-chart-line"></i> Rapor Kemajuan
          </button>
        </div>
      </header>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 w-full">
        {Object.values(Topic).map((t) => (
          <TopicCard 
            key={t} 
            topic={t} 
            questionCount={questions.filter(q => q.topic === t).length}
            onClick={() => { setSelectedTopic(t); setView('material'); playSound('click'); }} 
          />
        ))}
      </div>
    </div>
  );

  const renderMaterial = () => {
    const topicMaterials = materials.filter(m => m.topic === selectedTopic);
    
    if (topicMaterials.length === 0) {
      return (
        <div className="bg-white rounded-3xl p-12 shadow-xl text-center space-y-6 max-w-2xl mx-auto animate-in zoom-in duration-500">
          <div className="w-20 h-20 bg-gray-100 text-gray-400 rounded-full flex items-center justify-center mx-auto text-4xl"><i className="fas fa-book-dead"></i></div>
          <h2 className="text-3xl font-bold text-gray-800">Materi Belum Tersedia</h2>
          <p className="text-gray-500">Guru belum mengunggah materi untuk topik ini. Silakan kembali lagi nanti!</p>
          <button onClick={() => { setView('home'); playSound('click'); }} className="bg-blue-600 text-white px-8 py-3 rounded-xl font-bold">Kembali ke Beranda</button>
        </div>
      );
    }

    return (
      <div className="px-4 md:px-0 w-full max-w-5xl mx-auto space-y-10 animate-in slide-in-from-bottom-8 duration-500">
        <div className="flex items-center justify-between glass-card p-6 border-white/40">
          <div className="flex items-center gap-3">
            <button onClick={() => { setView('home'); playSound('click'); }} className="text-[#2F2E41] font-bold flex items-center gap-2 hover:scale-105 transition-transform bg-white/50 px-4 py-2 rounded-xl">
              <i className="fas fa-arrow-left"></i> Kembali
            </button>
          </div>
          <div className="text-right">
            <span className="bg-[#4ECDC4] text-white px-6 py-2 rounded-full text-lg font-game font-bold shadow-md">{selectedTopic}</span>
            <p className="text-sm text-[#2F2E41]/60 font-medium mt-2">{topicMaterials.length} Materi Tersedia</p>
          </div>
        </div>

        {topicMaterials.map((mat, idx) => (
          <div key={mat.id} className="glass-card p-10 space-y-8 border-white/40">
            <div className="space-y-4">
              <div className="flex justify-between items-start">
                <h2 className="text-2xl md:text-4xl font-game font-black text-[#2F2E41] leading-tight">{mat.title}</h2>
                <span className="bg-[#FFE66D] text-[#2F2E41] px-4 py-1 rounded-lg text-xs font-bold uppercase tracking-widest shadow-sm">Bagian {idx + 1}</span>
              </div>
              <div className="h-2 w-32 bg-[#FF6B6B] rounded-full shadow-inner"></div>
            </div>

            <div className="prose prose-lg max-w-none text-[#2F2E41] leading-relaxed text-lg md:text-2xl whitespace-pre-wrap font-medium bg-white/30 p-8 rounded-3xl border border-white/20">
              {mat.content}
            </div>

            {mat.files && mat.files.length > 0 && (
              <div className="pt-8 border-t-2 border-white/20">
                <h3 className="text-2xl font-game font-bold text-[#2F2E41] mb-6 flex items-center gap-3">
                  <i className="fas fa-paperclip text-[#4ECDC4]"></i> Lampiran Materi ({mat.files.length})
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {mat.files.map((file, fIdx) => (
                    <a 
                      key={fIdx} 
                      href={file.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex items-center gap-5 bg-white/40 hover:bg-white/60 border-2 border-white/20 hover:border-[#4ECDC4] p-5 rounded-2xl transition-all group shadow-sm"
                    >
                      <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center text-[#4ECDC4] shadow-md group-hover:rotate-6 transition-transform">
                        <i className={`fas fa-2xl ${
                          file.type.includes('image') ? 'fa-image' : 
                          file.type.includes('video') ? 'fa-video' : 
                          file.type.includes('audio') ? 'fa-volume-up' : 
                          file.type.includes('pdf') ? 'fa-file-pdf' : 'fa-file-word'
                        }`}></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-[#2F2E41] truncate text-lg">{file.name}</p>
                        <p className="text-sm text-[#2F2E41]/60 font-medium">{file.size}</p>
                      </div>
                      <i className="fas fa-external-link-alt text-[#2F2E41]/30 group-hover:text-[#4ECDC4] transition-colors"></i>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="pt-12 flex justify-center pb-12">
          <button 
            onClick={() => {
              setView('quiz');
              setCurrentQuestionIdx(0);
              setQuizScore(0);
              setQuizFinished(false);
              setIsGameMode(selectedTopic === Topic.POLA_BILANGAN || selectedTopic === Topic.PECAHAN_DESIMAL || selectedTopic === Topic.KUBUS_BALOK || selectedTopic === Topic.RASIO || selectedTopic === Topic.PELUANG);
              setGamePausedForQuestion(false);
              setIsAnsweringQuestion(false);
              setGameLives(3); 
              setGameTimer(60);
              playSound('click');
            }}
            className="bg-[#FFE66D] hover:bg-[#f7d74d] text-[#2F2E41] px-16 py-6 rounded-[30px] font-game font-black text-3xl shadow-[0_12px_0_rgb(212,163,0)] transition-all hover:scale-105 active:shadow-none active:translate-y-[12px] flex items-center gap-4 border-4 border-black/10"
          >
            <i className="fas fa-play-circle text-4xl"></i> Mulai Petualangan
          </button>
        </div>
      </div>
    );
  };

  const finishQuiz = (finalScore: number) => {
    setQuizFinished(true);
    playSound('success');
    
    // Mark topic as completed if score is good (e.g., 80% correct)
    const topicQuestions = questions.filter(q => q.topic === selectedTopic);
    if (finalScore / topicQuestions.length >= 0.8) {
      setProgress(prev => ({
        ...prev,
        completedTopics: prev.completedTopics.includes(selectedTopic!) 
          ? prev.completedTopics 
          : [...prev.completedTopics, selectedTopic!]
      }));
    }
  };

  const handleAnswer = (idx: number) => {
    const topicQuestions = questions.filter(q => q.topic === selectedTopic);
    const currentQ = topicQuestions[currentQuestionIdx];
    const isCorrect = idx === currentQ.correctAnswer;
    const newScore = quizScore + (isCorrect ? 1 : 0);
    
    // Record progress immediately for every attempt
    setProgress(prev => ({
      ...prev,
      points: prev.points + (isCorrect ? 20 : 0),
      quizHistory: [
        ...prev.quizHistory,
        { 
          topic: selectedTopic!, 
          score: isCorrect ? 1 : 0, 
          total: 1, 
          date: new Date().toLocaleDateString() 
        }
      ]
    }));

    if (isCorrect) {
      setQuizScore(newScore);
      playSound('correct');
      if (isGameMode) {
        if (selectedTopic === Topic.KUBUS_BALOK || selectedTopic === Topic.RASIO || selectedTopic === Topic.PELUANG) {
          setGameTimer(prev => prev + 30);
        } else {
          setGameLives(prev => Math.min(prev + 1, MAX_LIVES));
        }
        playSound('life-up');
        setGamePausedForQuestion(false);
        setIsAnsweringQuestion(false);
        setShowHint(false);
        if (currentQuestionIdx + 1 >= topicQuestions.length) finishQuiz(newScore);
        else setCurrentQuestionIdx(prev => prev + 1);
      }
    } else {
      playSound('wrong');
      if (isGameMode) {
        if (currentQuestionIdx + 1 < topicQuestions.length) {
          setCurrentQuestionIdx(prev => prev + 1);
          setShowHint(false);
          // Keep isAnsweringQuestion true to show the next question
        } else {
          setIsAnsweringQuestion(false);
          finishQuiz(newScore);
        }
      }
    }
    if (!isGameMode) {
      if (currentQuestionIdx + 1 < topicQuestions.length) {
        setCurrentQuestionIdx(prev => prev + 1);
        setShowHint(false);
      } else {
        finishQuiz(newScore);
      }
    }
  };

  const renderQuiz = () => {
    const topicQuestions = questions.filter(q => q.topic === selectedTopic);
    const currentQ = topicQuestions[currentQuestionIdx];
    if (!currentQ) return <div className="text-center py-20 font-bold text-gray-400">Belum ada soal untuk topik ini.</div>;

    if (quizFinished) {
      return (
        <div className="glass-card p-16 text-center space-y-10 max-w-3xl mx-auto animate-in zoom-in duration-500 border-white/40">
          <div className="w-32 h-32 bg-[#FFE66D] text-[#2F2E41] rounded-[40px] flex items-center justify-center mx-auto text-6xl shadow-xl rotate-6 animate-bounce">
            <i className="fas fa-trophy"></i>
          </div>
          <div className="space-y-4">
            <h2 className="text-5xl font-game font-black text-[#2F2E41]">Luar Biasa!</h2>
            <p className="text-2xl text-[#2F2E41]/80 font-medium">Kamu berhasil menjawab <strong className="text-[#FF6B6B] text-3xl">{quizScore}</strong> dari {topicQuestions.length} soal.</p>
          </div>
          <div className="flex flex-col sm:flex-row justify-center gap-6">
             <button 
               onClick={() => { setView('home'); playSound('click'); }} 
               className="bg-[#4ECDC4] hover:bg-[#45b7af] text-white px-10 py-4 rounded-2xl font-bold text-xl shadow-lg transition-all hover:scale-105 border-b-4 border-[#3da39b]"
             >
               Kembali ke Beranda
             </button>
             <button 
               onClick={() => { setView('report'); playSound('click'); }} 
               className="bg-[#FFE66D] hover:bg-[#f7d74d] text-[#2F2E41] px-10 py-4 rounded-2xl font-bold text-xl shadow-lg transition-all hover:scale-105 border-b-4 border-[#d4a300]"
             >
               Lihat Rapor Kamu
             </button>
          </div>
        </div>
      );
    }

    const handleFailure = (reason: string) => {
      if (isProcessingFailure.current) return;
      isProcessingFailure.current = true;
      setGamePausedForQuestion(true);
      setIsAnsweringQuestion(false);
      setShowHint(false); // Reset hint when game pauses for failure
      setGameLives(prev => Math.max(0, prev - 1));
      playSound('life-down');
      playSound('wrong');
    };

    return (
      <div className="w-full max-w-5xl mx-auto space-y-4 md:space-y-10">
        <div className="flex justify-between items-center px-4 md:px-0">
          <button onClick={() => { setView('home'); playSound('click'); }} className="text-[#2F2E41] font-bold flex items-center gap-2 hover:scale-105 transition-transform bg-white/50 px-4 py-2 rounded-xl border border-white/20 shadow-sm">
            <i className="fas fa-arrow-left"></i> Berhenti
          </button>
        </div>

        {isGameMode && selectedTopic === Topic.POLA_BILANGAN && (
          <CliffJump lives={gameLives} isPaused={gamePausedForQuestion} onFall={() => handleFailure("YAH, TERJATUH!")} onJump={() => playSound('jump')} />
        )}

        {isGameMode && selectedTopic === Topic.PECAHAN_DESIMAL && (
          <FoodSwap lives={gameLives} isPaused={gamePausedForQuestion} onLifeLost={handleFailure} onCatch={() => playSound('chew')} />
        )}

        {isGameMode && selectedTopic === Topic.KUBUS_BALOK && (
          <FoodDrop timer={gameTimer} setTimer={setGameTimer} isPaused={gamePausedForQuestion} onTimerEnd={() => handleFailure("WAKTU HABIS!")} onSwap={() => playSound('click')} />
        )}

        {isGameMode && selectedTopic === Topic.RASIO && (
          <MemoryGame timer={gameTimer} setTimer={setGameTimer} isPaused={gamePausedForQuestion} onTimerEnd={() => handleFailure("WAKTU HABIS!")} onMatch={() => playSound('success')} />
        )}

        {isGameMode && selectedTopic === Topic.PELUANG && (
          <WordSearch timer={gameTimer} setTimer={setGameTimer} isPaused={gamePausedForQuestion} onTimerEnd={() => handleFailure("WAKTU HABIS!")} onFound={() => playSound('success')} />
        )}

        {isGameMode && gamePausedForQuestion && !isAnsweringQuestion && (
          <div className="glass-card -mx-4 md:mx-0 p-6 md:p-10 text-center space-y-6 md:space-y-8 animate-in slide-in-from-bottom duration-500 rounded-none md:rounded-[40px] border-y-4 md:border-4 border-[#FF8E53]">
            <div className="space-y-3 md:space-y-4">
              <h3 className="text-2xl md:text-4xl font-game font-black text-[#FF8E53]">KESEMPATAN TERAKHIR!</h3>
              <p className="text-base md:text-xl text-[#2F2E41] font-medium">
                {(selectedTopic === Topic.KUBUS_BALOK || selectedTopic === Topic.RASIO || selectedTopic === Topic.PELUANG)
                  ? "Klik tombol di bawah untuk menambah waktu dengan menjawab tantangan matematika!"
                  : "Klik tombol di bawah untuk menambah nyawa dengan menjawab tantangan matematika!"}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row justify-center gap-4 md:gap-6">
              <button 
                onClick={() => { setIsAnsweringQuestion(true); playSound('click'); }} 
                className="bg-[#4ECDC4] hover:bg-[#45b7af] text-white px-8 md:px-12 py-4 md:py-5 rounded-[20px] font-bold text-lg md:text-2xl shadow-xl flex items-center justify-center gap-3 md:gap-4 active:scale-95 transition-all border-b-4 border-[#3da39b]"
              >
                <i className="fas fa-brain text-xl md:text-3xl"></i> 
                {(selectedTopic === Topic.KUBUS_BALOK || selectedTopic === Topic.RASIO || selectedTopic === Topic.PELUANG) ? "Jawab Soal (+30 Detik)" : "Jawab Soal (+1 Nyawa)"}
              </button>
              {((selectedTopic === Topic.KUBUS_BALOK || selectedTopic === Topic.RASIO || selectedTopic === Topic.PELUANG) ? gameTimer > 0 : gameLives > 0) && (
                 <button 
                   onClick={() => { setGamePausedForQuestion(false); playSound('click'); }} 
                   className="bg-[#FFE66D] hover:bg-[#f7d74d] text-[#2F2E41] px-8 md:px-12 py-4 md:py-5 rounded-[20px] font-bold text-lg md:text-2xl shadow-xl active:scale-95 transition-all border-b-4 border-[#d4a300]"
                 >
                  Lanjut Main {(selectedTopic === Topic.KUBUS_BALOK || selectedTopic === Topic.RASIO || selectedTopic === Topic.PELUANG) ? `(${gameTimer}s Sisa)` : `(${gameLives} Sisa)`}
                </button>
              )}
            </div>
          </div>
        )}

        {(!isGameMode || (gamePausedForQuestion && isAnsweringQuestion)) && (
          <div className="glass-card p-6 md:p-10 space-y-6 md:space-y-10 animate-in slide-in-from-top duration-500 border-white/40">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-4">
              <span className="bg-[#4ECDC4] text-white px-5 md:px-6 py-2 rounded-full text-sm md:text-lg font-game font-bold shadow-md">SOAL {currentQuestionIdx + 1} / {topicQuestions.length}</span>
              <div className="flex items-center gap-4 md:gap-6">
                {isGameMode && (
                  <div className="flex items-center bg-white/50 px-4 md:px-5 py-2 rounded-2xl border-2 border-white/20 shadow-sm">
                    <i className="fas fa-heart text-[#FF6B6B] text-xl md:text-2xl mr-2 md:mr-3 animate-pulse"></i>
                    <span className="font-black text-xl md:text-2xl text-[#2F2E41]">{gameLives}</span>
                  </div>
                )}
                <div className="flex items-center bg-white/50 px-4 md:px-5 py-2 rounded-2xl border-2 border-white/20 shadow-sm">
                  <i className="fas fa-clock text-[#FF8E53] text-xl md:text-2xl mr-2 md:mr-3"></i>
                  <span className="font-bold text-sm md:text-base text-[#2F2E41]">Kuis Berjalan</span>
                </div>
              </div>
            </div>
            <div className="bg-white/40 p-6 md:p-10 rounded-[25px] md:rounded-[30px] border-2 border-white/20 shadow-inner">
              <p className="text-xl md:text-4xl font-game font-bold text-[#2F2E41] leading-snug">{currentQ.question}</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {currentQ.options.map((opt, i) => (
                <button 
                  key={i} 
                  onClick={() => handleAnswer(i)} 
                  className="group bg-white/60 hover:bg-white/80 border-4 border-white/20 p-4 md:p-6 rounded-[20px] md:rounded-[25px] text-left font-bold text-lg md:text-2xl text-[#2F2E41] transition-all hover:border-[#4ECDC4] hover:shadow-xl active:scale-95 flex items-center gap-4 md:gap-6"
                >
                  <span className="flex-shrink-0 w-10 h-10 md:w-14 md:h-14 bg-[#4ECDC4] text-white rounded-xl md:rounded-2xl text-center leading-[40px] md:leading-[56px] font-game text-xl md:text-3xl shadow-md group-hover:rotate-12 transition-transform">
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="flex-1">{opt}</span>
                </button>
              ))}
            </div>
            {!showHint ? (
              <button onClick={() => { if (progress.points >= 15) { setShowHint(true); setProgress(p => ({ ...p, points: p.points - 15 })); playSound('hint'); } else { alert("Poin tidak cukup (butuh 15 poin)!"); } }} className="text-orange-500 font-bold flex items-center gap-2 hover:opacity-80 transition-opacity text-sm md:text-base"><i className="fas fa-lightbulb"></i> Gunakan Hint (-15 Poin)</button>
            ) : (
              <div className="bg-orange-50 border-l-8 border-orange-400 p-5 md:p-6 rounded-r-2xl animate-in slide-in-from-left duration-300">
                <span className="font-bold text-orange-700 text-lg md:text-2xl border-b border-orange-200 block pb-2 mb-3 md:mb-4"><i className="fas fa-search-plus mr-2"></i> Langkah Penyelesaian:</span> 
                <div className="whitespace-pre-wrap text-lg md:text-2xl text-gray-800 leading-relaxed font-bold italic">{currentQ.hint}</div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const renderReport = () => {
    const stats = Object.values(Topic).map(t => {
      const history = progress.quizHistory.filter(h => h.topic === t);
      const totalCorrect = history.reduce((sum, h) => sum + h.score, 0);
      const totalPossible = history.reduce((sum, h) => sum + h.total, 0);
      const percentage = totalPossible > 0 ? (totalCorrect / totalPossible) * 100 : 0;
      return { topic: t, totalCorrect, totalPossible, percentage };
    });
    const overallTotalCorrect = stats.reduce((sum, s) => sum + s.totalCorrect, 0);
    const overallTotalPossible = stats.reduce((sum, s) => sum + s.totalPossible, 0);
    const overallPercentage = overallTotalPossible > 0 ? (overallTotalCorrect / overallTotalPossible) * 100 : 0;
    return (
      <div className="px-4 md:px-0 glass-card p-6 md:p-10 w-full max-w-5xl mx-auto animate-in fade-in duration-500 border-white/40">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-10">
          <div>
            <h2 className="text-5xl font-game font-black text-[#2F2E41] drop-shadow-sm">Rapor Kemajuan Belajar</h2>
            <p className="text-xl text-[#2F2E41]/70 font-medium">Pantau kemajuanmu di setiap materi.</p>
          </div>
          <div className="flex gap-4">
             <button onClick={resetProgress} className="bg-red-100 text-red-600 px-6 py-3 rounded-2xl font-bold border-2 border-red-200 hover:bg-red-200 transition-all shadow-sm">Reset Progres</button>
             <button onClick={() => { setView('home'); playSound('click'); }} className="bg-white/50 px-6 py-3 rounded-2xl font-bold border-2 border-white/20 hover:bg-white/80 transition-all shadow-sm">Tutup</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
          <div className="bg-[#4ECDC4] text-white p-8 rounded-[30px] text-center shadow-xl transform hover:scale-105 transition-transform border-b-8 border-[#3da39b]">
            <p className="text-white/80 font-bold mb-2 text-sm uppercase tracking-wider">Akurasi Rata-Rata</p>
            <p className="text-6xl font-game font-black mb-3">{Math.round(overallPercentage)}%</p>
            <div className="w-full bg-black/10 h-3 rounded-full overflow-hidden mt-2 border border-white/20">
              <div className="bg-white h-full shadow-[0_0_10px_rgba(255,255,255,0.5)]" style={{ width: `${overallPercentage}%` }}></div>
            </div>
          </div>
          <div className="bg-[#9b59b6] text-white p-8 rounded-[30px] text-center shadow-xl transform hover:scale-105 transition-transform border-b-8 border-[#8e44ad]">
            <p className="text-white/80 font-bold mb-2 text-sm uppercase tracking-wider">Total Soal</p>
            <p className="text-6xl font-game font-black mb-3">{overallTotalCorrect}<span className="text-3xl opacity-50 font-light">/{overallTotalPossible}</span></p>
            <p className="text-white/80 text-sm font-medium">Soal berhasil dijawab benar</p>
          </div>
          <div className="bg-[#FFE66D] text-[#2F2E41] p-8 rounded-[30px] text-center shadow-xl transform hover:scale-105 transition-transform border-b-8 border-[#d4a300]">
            <p className="text-[#2F2E41]/60 font-bold mb-2 text-sm uppercase tracking-wider">Poin Petualang</p>
            <p className="text-6xl font-game font-black mb-3">{progress.points}</p>
            <p className="text-[#2F2E41]/60 text-sm font-medium">Kumpulkan terus poinnya!</p>
          </div>
        </div>
        <h3 className="text-3xl font-game font-bold text-[#2F2E41] mb-8 flex items-center gap-3"><i className="fas fa-chart-bar text-[#4ECDC4]"></i> Statistik Per Topik</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {stats.map((s, i) => (
            <div key={i} className="bg-white/40 p-6 rounded-3xl border-2 border-white/20 shadow-sm flex flex-col group hover:bg-white/60 transition-all">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <span className="font-game font-bold text-[#2F2E41] text-2xl block group-hover:text-[#4ECDC4] transition-colors">{s.topic}</span>
                  <p className="text-sm text-[#2F2E41]/60 font-medium">{s.totalCorrect} benar dari {s.totalPossible} percobaan</p>
                </div>
                <div className="text-right">
                  <span className="text-3xl font-game font-black text-[#4ECDC4] block">{Math.round(s.percentage)}%</span>
                  <span className="text-[10px] uppercase font-bold text-[#2F2E41]/40 tracking-widest">Akurasi</span>
                </div>
              </div>
              <div className="w-full bg-black/5 h-3 rounded-full overflow-hidden">
                <div className="bg-[#4ECDC4] h-full transition-all duration-1000 ease-out" style={{ width: `${s.percentage}%` }}></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderAdminLogin = () => {
    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      const form = e.target as HTMLFormElement;
      const email = (form.elements.namedItem('email') as HTMLInputElement).value;
      const password = (form.elements.namedItem('password') as HTMLInputElement).value;
      if (email === 'karangsarisdn725@gmail.com' && password === 'belitangtiga') { setAdmin({ email, isAuthenticated: true }); setView('admin-dashboard'); playSound('success'); }
      else { alert("Email atau password salah!"); playSound('wrong'); }
    };
    return (
      <div className="px-4 md:px-8 max-w-md mx-auto bg-white rounded-3xl shadow-xl p-8 mt-12 animate-in zoom-in duration-500">
        <div className="text-center mb-8"><div className="w-20 h-20 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto text-4xl mb-4"><i className="fas fa-user-shield"></i></div><h2 className="text-3xl font-bold text-gray-800">Akses Guru</h2><p className="text-gray-500">Kelola materi dan soal</p></div>
        <form onSubmit={handleLogin} className="space-y-6">
          <input name="email" type="email" placeholder="Email Guru" required className="w-full px-4 py-3 rounded-xl border border-gray-300 outline-none focus:ring-2 focus:ring-indigo-500" />
          <input name="password" type="password" placeholder="Password" required className="w-full px-4 py-3 rounded-xl border border-gray-300 outline-none focus:ring-2 focus:ring-indigo-500" />
          <button className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-xl font-bold text-lg shadow-lg active:scale-95 transition-transform">Masuk Dashboard</button>
        </form>
        <button onClick={() => { setView('home'); playSound('click'); }} className="w-full mt-4 text-gray-400 font-medium hover:underline">Batal</button>
        
        <div className="mt-8 pt-6 border-t border-gray-100">
          <button 
            onClick={async () => {
              const result = await checkSupabaseConnection();
              alert(result.message);
            }}
            className="w-full text-xs text-indigo-400 hover:text-indigo-600 font-bold flex items-center justify-center gap-2"
          >
            <i className="fas fa-network-wired"></i> Cek Koneksi Supabase
          </button>
        </div>
      </div>
    );
  };

  const renderAdminDashboard = () => {
    const renderMaterialManager = () => {
      const handleFileUpload = async (matId: string, e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;

        setIsSavingMaterial(true);
        const uploadedFiles: UploadedFile[] = [];

        for (const file of Array.from(files) as File[]) {
          const url = await uploadFileToSupabase(file);
          if (url) {
            uploadedFiles.push({
              name: file.name,
              type: file.type,
              size: (file.size / 1024 / 1024).toFixed(2) + ' MB',
              url: url
            });
          }
        }

        if (uploadedFiles.length === 0) {
          setIsSavingMaterial(false);
          return;
        }

        // Update local state first
        setMaterials(prev => {
          const updated = prev.map(m => {
            if (m.id === matId) {
              const updatedMat = { ...m, files: [...m.files, ...uploadedFiles] };
              
              // Sync to Supabase if it's a real record
              if (!matId.startsWith('mat-') && !matId.startsWith('temp-')) {
                const numericId = isNaN(Number(matId)) ? matId : Number(matId);
                supabase.from('materi').update({
                  files: updatedMat.files
                }).eq('id', numericId).then(({ error }) => {
                  if (error) {
                    console.error("Error syncing files to Supabase:", error);
                    if (error.code === 'PGRST204') {
                      alert("Gagal sinkronisasi file: Kolom 'files' belum ada di tabel 'materi' Supabase.\n\nSolusi: Jalankan perintah ini di SQL Editor Supabase:\nALTER TABLE materi ADD COLUMN files JSONB DEFAULT '[]'::jsonb;");
                    }
                  } else {
                    console.log("Files synced to Supabase for material:", matId);
                  }
                });
              }
              
              return updatedMat;
            }
            return m;
          });
          return updated;
        });

        setIsSavingMaterial(false);
        playSound('success');
      };

      return (
        <div className="space-y-8">
          <div className="flex justify-between items-center bg-white/40 p-6 rounded-[30px] border-2 border-white/20 shadow-sm">
            <h3 className="text-3xl font-game font-black text-[#2F2E41]">Daftar Materi Pembelajaran</h3>
            <div className="flex gap-4">
              <button 
                onClick={() => { 
                  setIsMaterialModalOpen(true); 
                  setEditingMaterial(null); 
                  setModalFiles([]);
                  playSound('click'); 
                }}
                className="bg-[#6C5CE7] hover:bg-[#5b4bc4] text-white px-8 py-3 rounded-2xl font-bold shadow-lg transition-all hover:scale-105 flex items-center gap-3 border-b-4 border-[#4a3fb4]"
              >
                <i className="fas fa-plus"></i> Tambah Materi
              </button>
            </div>
          </div>

          {isMaterialModalOpen && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
              <div className="glass-card w-full max-w-3xl max-h-[90vh] overflow-y-auto p-10 animate-in zoom-in duration-300 border-white/40">
                <div className="flex justify-between items-center mb-8">
                  <h4 className="text-3xl font-game font-black text-[#2F2E41]">{editingMaterial ? 'Edit Materi' : 'Tambah Materi Baru'}</h4>
                  <button onClick={() => setIsMaterialModalOpen(false)} className="w-12 h-12 bg-white/20 hover:bg-white/40 rounded-2xl text-[#2F2E41] transition-all flex items-center justify-center"><i className="fas fa-times text-2xl"></i></button>
                </div>
                
                <form onSubmit={handleSaveMaterial} className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-[#2F2E41]/70 ml-2">Topik</label>
                      <select name="topic" defaultValue={editingMaterial?.topic || Topic.POLA_BILANGAN} className="w-full px-6 py-4 rounded-2xl border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#6C5CE7] outline-none transition-all font-bold text-[#2F2E41]">
                        {Object.values(Topic).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-[#2F2E41]/70 ml-2">Judul Materi</label>
                      <input name="title" defaultValue={editingMaterial?.title} required placeholder="Contoh: Pengenalan Ruang Sampel" className="w-full px-6 py-4 rounded-2xl border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#6C5CE7] outline-none transition-all font-bold text-[#2F2E41]" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-lg font-bold text-[#2F2E41]/70 ml-2">Isi Materi</label>
                      <div className="flex gap-3">
                        <input 
                          type="text" 
                          placeholder="Keyword AI..." 
                          value={aiKeyword}
                          onChange={(e) => setAiKeyword(e.target.value)}
                          className="px-4 py-2 rounded-xl border-2 border-white/20 bg-white/50 outline-none focus:bg-white focus:border-[#6C5CE7] text-sm font-bold"
                        />
                        <button 
                          type="button"
                          disabled={isGeneratingAI}
                          onClick={() => {
                            const topic = (document.getElementsByName('topic')[0] as HTMLSelectElement).value as Topic;
                            handleAIContent(topic);
                          }}
                          className="bg-[#FFE66D] hover:bg-[#f7d74d] text-[#2F2E41] px-4 py-2 rounded-xl text-sm font-black shadow-md hover:scale-105 transition-all disabled:opacity-50 flex items-center gap-2 border-b-4 border-[#d4a300]"
                        >
                          {isGeneratingAI ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-robot"></i>} Buat dengan AI
                        </button>
                      </div>
                    </div>
                    <textarea 
                      id="material-content"
                      name="content" 
                      defaultValue={editingMaterial?.content} 
                      required 
                      rows={12} 
                      placeholder="Tuliskan isi materi di sini..." 
                      className="w-full px-6 py-4 rounded-[30px] border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#6C5CE7] outline-none transition-all font-medium text-[#2F2E41] resize-none"
                    />
                  </div>

                  {/* Lampiran Section */}
                  <div className="space-y-4 bg-white/40 p-6 rounded-3xl border-2 border-white/20">
                    <div className="flex justify-between items-center">
                      <label className="text-lg font-bold text-[#2F2E41]/70">Lampiran Materi</label>
                      <label className="cursor-pointer bg-[#6C5CE7] hover:bg-[#5b4bc4] text-white px-4 py-2 rounded-xl text-xs font-black transition-all shadow-md">
                        <i className="fas fa-upload mr-2"></i> Upload File
                        <input 
                          type="file" 
                          className="hidden" 
                          multiple 
                          accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.mp3,.wav,.jpg,.jpeg,.png"
                          onChange={handleModalFileUpload}
                        />
                      </label>
                    </div>

                    {modalFiles.length > 0 && (
                      <div className="flex flex-wrap gap-3 mt-4">
                        {modalFiles.map((file, idx) => (
                          <div 
                            key={idx} 
                            onClick={() => window.open(file.url, '_blank')}
                            className="flex items-center gap-3 bg-white/60 border-2 border-white/20 px-3 py-2 rounded-xl group relative cursor-pointer hover:bg-white transition-all"
                          >
                            <div className="w-8 h-8 bg-[#6C5CE7]/10 rounded-lg flex items-center justify-center text-[#6C5CE7]">
                              <i className={`fas ${
                                file.type === 'link' ? 'fa-link' :
                                file.type.includes('image') ? 'fa-image' : 
                                file.type.includes('video') ? 'fa-video' : 
                                file.type.includes('audio') ? 'fa-volume-up' : 
                                file.type.includes('pdf') ? 'fa-file-pdf' : 'fa-file-word'
                              } text-sm`}></i>
                            </div>
                            <div className="max-w-[120px]">
                              <p className="text-[10px] font-black text-[#2F2E41] truncate">{file.name}</p>
                              <p className="text-[8px] font-bold text-[#2F2E41]/40 uppercase">{file.size}</p>
                            </div>
                            <button 
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeModalFile(idx);
                              }}
                              className="w-6 h-6 bg-red-50 text-red-500 rounded-lg hover:bg-red-500 hover:text-white transition-all flex items-center justify-center text-[10px]"
                            >
                              <i className="fas fa-times"></i>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex gap-4 pt-6">
                    <button 
                      type="submit" 
                      disabled={isSavingMaterial}
                      className="flex-1 bg-[#6C5CE7] hover:bg-[#5b4bc4] text-white py-5 rounded-2xl font-black text-xl shadow-xl transition-all hover:scale-[1.02] border-b-6 border-[#4a3fb4] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    >
                      {isSavingMaterial ? <><i className="fas fa-spinner fa-spin"></i> Menyimpan...</> : 'Simpan Materi'}
                    </button>
                    <button type="button" onClick={() => setIsMaterialModalOpen(false)} className="px-10 py-5 rounded-2xl font-black text-xl text-[#2F2E41]/60 hover:bg-white/20 transition-all">Batal</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-6">
            {materials.map(mat => (
              <div key={mat.id} className="bg-white/60 hover:bg-white/80 p-8 rounded-[35px] shadow-lg border-4 border-white/30 flex flex-col gap-6 transition-all group">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-xs font-black bg-[#6C5CE7] text-white px-4 py-1.5 rounded-full uppercase tracking-widest shadow-sm">{mat.topic}</span>
                      <span className="text-xs font-bold text-[#2F2E41]/40"><i className="far fa-calendar-alt mr-2"></i>{new Date(mat.createdAt).toLocaleDateString('id-ID')}</span>
                    </div>
                    <h4 className="text-2xl font-game font-black text-[#2F2E41] mb-2 group-hover:text-[#6C5CE7] transition-colors">{mat.title}</h4>
                    <p className="text-[#2F2E41]/70 font-medium line-clamp-2 leading-relaxed">{mat.content}</p>
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => { 
                        setEditingMaterial(mat); 
                        setModalFiles(mat.files || []);
                        setIsMaterialModalOpen(true); 
                        playSound('click'); 
                      }}
                      className="w-14 h-14 bg-white/50 text-[#6C5CE7] rounded-2xl hover:bg-[#6C5CE7] hover:text-white transition-all shadow-md flex items-center justify-center border-2 border-white/20"
                      title="Edit Materi"
                    >
                      <i className="fas fa-edit text-xl"></i>
                    </button>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteMaterial(mat.id);
                      }}
                      className="w-14 h-14 bg-red-50 text-red-500 rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-md flex items-center justify-center border-2 border-red-100"
                      title="Hapus Materi"
                    >
                      <i className="fas fa-trash text-xl"></i>
                    </button>
                  </div>
                </div>

                <div className="border-t-2 border-white/20 pt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h5 className="text-sm font-black text-[#2F2E41]/40 uppercase tracking-widest flex items-center gap-3">
                      <i className="fas fa-paperclip text-[#6C5CE7]"></i> Lampiran ({mat.files.length})
                    </h5>
                    <div className="flex gap-2">
                      <label className="cursor-pointer bg-white/40 hover:bg-white/60 text-[#2F2E41] px-5 py-2 rounded-xl text-xs font-black transition-all shadow-sm border-2 border-white/20">
                        <i className="fas fa-upload mr-2"></i> Upload File
                        <input 
                          type="file" 
                          className="hidden" 
                          multiple 
                          accept=".pdf,.doc,.docx,.ppt,.pptx,.mp4,.mp3,.wav,.jpg,.jpeg,.png"
                          onChange={(e) => handleFileUpload(mat.id, e)}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {mat.files.map((file, idx) => (
                      <div 
                        key={idx} 
                        onClick={() => window.open(file.url, '_blank')}
                        className="flex items-center gap-4 bg-white/50 border-2 border-white/20 px-4 py-3 rounded-2xl group relative hover:bg-white transition-all shadow-sm cursor-pointer"
                      >
                        <div className="w-10 h-10 bg-[#6C5CE7]/10 rounded-xl flex items-center justify-center text-[#6C5CE7] shadow-inner">
                          <i className={`fas ${
                            file.type === 'link' ? 'fa-link' :
                            file.type.includes('image') ? 'fa-image' : 
                            file.type.includes('video') ? 'fa-video' : 
                            file.type.includes('audio') ? 'fa-volume-up' : 
                            file.type.includes('pdf') ? 'fa-file-pdf' : 'fa-file-word'
                          } text-lg`}></i>
                        </div>
                        <div className="max-w-[150px]">
                          <p className="text-xs font-black text-[#2F2E41] truncate">{file.name}</p>
                          <p className="text-[10px] font-bold text-[#2F2E41]/40 uppercase">{file.size}</p>
                        </div>
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setMaterials(prev => prev.map(m => m.id === mat.id ? { ...m, files: m.files.filter((_, fidx) => fidx !== idx) } : m));
                            playSound('wrong');
                          }}
                          className="absolute -top-2 -right-2 bg-red-500 text-white w-6 h-6 rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    ))}
                    {mat.files.length === 0 && <p className="text-sm text-[#2F2E41]/40 font-bold italic ml-2">Belum ada lampiran file.</p>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    };

    const renderQuestionManager = () => {
      const toggleTopic = (topic: string) => {
        setExpandedTopics(prev => ({ ...prev, [topic]: !prev[topic] }));
      };

      return (
        <div className="space-y-8">
          <div className="flex justify-between items-center bg-white/40 p-6 rounded-[30px] border-2 border-white/20 shadow-sm">
            <h3 className="text-3xl font-game font-black text-[#2F2E41]">Bank Soal Kuis</h3>
            <div className="flex gap-4">
              <button 
                onClick={() => { setIsQuestionModalOpen(true); setEditingQuestion(null); playSound('click'); }}
                className="bg-[#4ECDC4] hover:bg-[#45b7af] text-white px-8 py-3 rounded-2xl font-bold shadow-lg transition-all hover:scale-105 flex items-center gap-3 border-b-4 border-[#3ca09a]"
              >
                <i className="fas fa-plus"></i> Tambah Soal
              </button>
            </div>
          </div>

          {isQuestionModalOpen && (
            <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
              <div className="glass-card w-full max-w-3xl max-h-[90vh] overflow-y-auto p-10 animate-in zoom-in duration-300 border-white/40">
                <div className="flex justify-between items-center mb-8">
                  <h4 className="text-3xl font-game font-black text-[#2F2E41]">{editingQuestion ? 'Edit Soal' : 'Tambah Soal Baru'}</h4>
                  <button onClick={() => setIsQuestionModalOpen(false)} className="w-12 h-12 bg-white/20 hover:bg-white/40 rounded-2xl text-[#2F2E41] transition-all flex items-center justify-center"><i className="fas fa-times text-2xl"></i></button>
                </div>
                
                <form id="question-form" onSubmit={handleSaveQuestion} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-[#2F2E41]/70 ml-2">Topik</label>
                      <select name="topic" defaultValue={editingQuestion?.topic || Topic.POLA_BILANGAN} className="w-full px-6 py-4 rounded-2xl border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#4ECDC4] outline-none transition-all font-bold text-[#2F2E41]">
                        {Object.values(Topic).map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-[#2F2E41]/70 ml-2">Kesulitan</label>
                      <select name="difficulty" defaultValue={editingQuestion?.difficulty || 'Sedang'} className="w-full px-6 py-4 rounded-2xl border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#4ECDC4] outline-none transition-all font-bold text-[#2F2E41]">
                        <option value="Mudah">Mudah</option>
                        <option value="Sedang">Sedang</option>
                        <option value="Sulit">Sulit</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <button 
                      type="button"
                      disabled={isGeneratingAIQuestion}
                      onClick={() => {
                        const form = document.getElementById('question-form') as HTMLFormElement;
                        const topic = (form.elements.namedItem('topic') as HTMLSelectElement).value as Topic;
                        const difficulty = (form.elements.namedItem('difficulty') as HTMLSelectElement).value;
                        handleAIQuestion(topic, difficulty);
                      }}
                      className="bg-[#FFE66D] hover:bg-[#f7d74d] text-[#2F2E41] px-6 py-3 rounded-xl text-sm font-black shadow-md hover:scale-105 transition-all disabled:opacity-50 flex items-center gap-2 border-b-4 border-[#d4a300]"
                    >
                      {isGeneratingAIQuestion ? <i className="fas fa-spinner fa-spin"></i> : <i className="fas fa-robot"></i>} Buat Soal dengan AI
                    </button>
                  </div>

                  <div className="space-y-3">
                    <label className="text-lg font-bold text-[#2F2E41]/70 ml-2">Pertanyaan</label>
                    <textarea name="question" defaultValue={editingQuestion?.question} required rows={4} className="w-full px-6 py-4 rounded-[30px] border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#4ECDC4] outline-none transition-all font-medium text-[#2F2E41] resize-none" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-green-600 ml-2">Jawaban Benar</label>
                      <input name="correct" defaultValue={editingQuestion ? editingQuestion.options[editingQuestion.correctAnswer] : ''} required className="w-full px-6 py-4 rounded-2xl border-4 border-green-100 bg-green-50/50 focus:bg-white focus:border-green-500 outline-none transition-all font-bold text-green-700" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-red-400 ml-2">Opsi Salah 1</label>
                      <input name="opt1" defaultValue={editingQuestion ? editingQuestion.options.filter((_, i) => i !== editingQuestion.correctAnswer)[0] : ''} required className="w-full px-6 py-4 rounded-2xl border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#FF6B6B] outline-none transition-all font-bold text-[#2F2E41]" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-red-400 ml-2">Opsi Salah 2</label>
                      <input name="opt2" defaultValue={editingQuestion ? editingQuestion.options.filter((_, i) => i !== editingQuestion.correctAnswer)[1] : ''} required className="w-full px-6 py-4 rounded-2xl border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#FF6B6B] outline-none transition-all font-bold text-[#2F2E41]" />
                    </div>
                    <div className="space-y-3">
                      <label className="text-lg font-bold text-red-400 ml-2">Opsi Salah 3</label>
                      <input name="opt3" defaultValue={editingQuestion ? editingQuestion.options.filter((_, i) => i !== editingQuestion.correctAnswer)[2] : ''} required className="w-full px-6 py-4 rounded-2xl border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#FF6B6B] outline-none transition-all font-bold text-[#2F2E41]" />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="text-lg font-bold text-[#2F2E41]/70 ml-2">Hint / Pembahasan</label>
                    <textarea name="hint" defaultValue={editingQuestion?.hint} required rows={3} className="w-full px-6 py-4 rounded-[30px] border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#4ECDC4] outline-none transition-all font-medium text-[#2F2E41] resize-none" />
                  </div>

                  <div className="flex gap-4 pt-6">
                    <button 
                      type="submit" 
                      disabled={isSavingQuestion}
                      className="flex-1 bg-[#4ECDC4] hover:bg-[#45b7af] text-white py-5 rounded-2xl font-black text-xl shadow-xl transition-all hover:scale-[1.02] border-b-6 border-[#3ca09a] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
                    >
                      {isSavingQuestion ? <><i className="fas fa-spinner fa-spin"></i> Menyimpan...</> : 'Simpan Soal'}
                    </button>
                    <button type="button" onClick={() => setIsQuestionModalOpen(false)} className="px-10 py-5 rounded-2xl font-black text-xl text-[#2F2E41]/60 hover:bg-white/20 transition-all">Batal</button>
                  </div>
                </form>
              </div>
            </div>
          )}

          <div className="space-y-6 max-h-[700px] overflow-y-auto pr-4 custom-scrollbar">
            {Object.values(Topic).map(topic => {
              const topicQuestions = questions.filter(q => q.topic === topic);
              const isExpanded = expandedTopics[topic];
              
              return (
                <div key={topic} className="border-4 border-white/30 rounded-[35px] overflow-hidden shadow-lg bg-white/60 transition-all">
                  <button 
                    onClick={() => toggleTopic(topic)}
                    className="w-full flex items-center justify-between p-6 bg-white/40 hover:bg-white/60 transition-all"
                  >
                    <div className="flex items-center gap-5">
                      <div className="w-14 h-14 bg-[#4ECDC4]/20 text-[#4ECDC4] rounded-2xl flex items-center justify-center shadow-inner">
                        <i className={`fas ${isExpanded ? 'fa-folder-open' : 'fa-folder'} text-2xl`}></i>
                      </div>
                      <div className="text-left">
                        <h4 className="text-xl font-game font-black text-[#2F2E41]">{topic}</h4>
                        <p className="text-xs text-[#2F2E41]/40 font-black uppercase tracking-widest">{topicQuestions.length} Soal Tersedia</p>
                      </div>
                    </div>
                    <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'} text-[#2F2E41]/30 text-xl`}></i>
                  </button>
                  
                  {isExpanded && (
                    <div className="p-6 space-y-6 bg-white/20 animate-in slide-in-from-top-4 duration-500">
                      {topicQuestions.length === 0 ? (
                        <div className="text-center py-12 text-[#2F2E41]/40 font-bold italic text-lg">Belum ada soal untuk topik ini.</div>
                      ) : (
                        topicQuestions.map(q => (
                          <div key={q.id} className="bg-white/80 p-8 rounded-[30px] border-2 border-white/40 shadow-sm hover:shadow-md transition-all">
                            <div className="flex justify-between items-start mb-4">
                              <div className="flex gap-3">
                                <span className={`px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest shadow-sm ${
                                  q.difficulty === 'Mudah' ? 'bg-green-100 text-green-700' : 
                                  q.difficulty === 'Sedang' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'
                                }`}>{q.difficulty}</span>
                              </div>
                              <div className="flex gap-3">
                                <button 
                                  onClick={() => { setEditingQuestion(q); setIsQuestionModalOpen(true); playSound('click'); }}
                                  className="w-10 h-10 bg-white text-[#6C5CE7] rounded-xl hover:bg-[#6C5CE7] hover:text-white transition-all shadow-sm flex items-center justify-center border border-white/20"
                                >
                                  <i className="fas fa-edit"></i>
                                </button>
                                <button 
                                  onClick={() => handleDeleteQuestion(q.id)}
                                  className="w-10 h-10 bg-white text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all shadow-sm flex items-center justify-center border border-red-100"
                                >
                                  <i className="fas fa-trash"></i>
                                </button>
                              </div>
                            </div>
                            <p className="text-xl font-bold text-[#2F2E41] mb-6 leading-relaxed">{q.question}</p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-6">
                              {q.options.map((opt, i) => (
                                <div key={i} className={`p-4 rounded-2xl text-sm font-bold flex items-center gap-3 transition-all ${i === q.correctAnswer ? 'bg-green-50 border-2 border-green-200 text-green-700 shadow-inner' : 'bg-white/50 border-2 border-white/20 text-[#2F2E41]/60'}`}>
                                  <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${i === q.correctAnswer ? 'bg-green-500 text-white' : 'bg-white text-[#2F2E41]/30'}`}>{String.fromCharCode(65 + i)}</span>
                                  {opt}
                                </div>
                              ))}
                            </div>
                            <div className="bg-[#FFE66D]/20 p-5 rounded-2xl text-sm text-[#2F2E41] font-medium border-l-8 border-[#FFE66D]">
                              <strong className="font-black uppercase tracking-widest text-xs opacity-60 block mb-1">Pembahasan</strong> {q.hint}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    return (
      <div className="flex flex-col lg:flex-row gap-8 animate-in fade-in duration-500 pb-12">
        <aside className="w-full lg:w-64 bg-white rounded-2xl shadow-lg p-6 h-fit sticky top-24 border-t-4 border-indigo-600">
          <div className="mb-6 text-center lg:text-left">
            <h2 className="text-xl font-black text-gray-800">Dashboard Guru</h2>
            <p className="text-xs text-gray-500">Halo, selamat datang!</p>
          </div>
          <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible">
            <button onClick={() => { setAdminSection('material'); playSound('click'); }} className={`whitespace-nowrap w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${adminSection === 'material' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}>
              <i className="fas fa-book-open mr-2"></i> Kelola Materi
            </button>
            <button onClick={() => { setAdminSection('questions'); playSound('click'); }} className={`whitespace-nowrap w-full text-left px-4 py-3 rounded-xl font-bold transition-all ${adminSection === 'questions' ? 'bg-indigo-600 text-white shadow-md' : 'text-gray-500 hover:bg-gray-100'}`}>
              <i className="fas fa-question-circle mr-2"></i> Kelola Soal
            </button>
            <button onClick={() => { setAdmin({ email: '', isAuthenticated: false }); setView('home'); playSound('click'); }} className="whitespace-nowrap w-full text-left px-4 py-3 rounded-xl font-bold text-red-500 hover:bg-red-50 transition-all">
              <i className="fas fa-sign-out-alt mr-2"></i> Keluar
            </button>
          </nav>
        </aside>
        <div className="flex-1 space-y-8">
          {adminSection === 'material' ? renderMaterialManager() : renderQuestionManager()}
        </div>
      </div>
    );
  };

  const renderCheckout = () => {
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [orderStatus, setOrderStatus] = useState<'idle' | 'success' | 'error'>('idle');

    const handleCheckout = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setIsSubmitting(true);
      setOrderStatus('idle');

      const formData = new FormData(e.currentTarget);
      const orderData: Order = {
        customer_name: formData.get('name') as string,
        customer_email: formData.get('email') as string,
        product_name: 'Akses Premium MathVenture',
        amount: 50000,
        status: 'pending'
      };

      try {
        const { error } = await supabase
          .from('orders')
          .insert([orderData]);

        if (error) throw error;
        setOrderStatus('success');
        playSound('success');
      } catch (err) {
        console.error('Error saving order:', err);
        setOrderStatus('error');
        playSound('wrong');
      } finally {
        setIsSubmitting(false);
      }
    };

    if (orderStatus === 'success') {
      return (
        <div className="glass-card p-16 text-center space-y-10 max-w-3xl mx-auto animate-in zoom-in duration-500 border-white/40">
          <div className="w-32 h-32 bg-green-100 text-green-500 rounded-full flex items-center justify-center mx-auto text-6xl shadow-inner border-4 border-green-200">
            <i className="fas fa-check-circle"></i>
          </div>
          <div className="space-y-4">
            <h2 className="text-5xl font-game font-black text-[#2F2E41]">Pesanan Berhasil!</h2>
            <p className="text-2xl text-[#2F2E41]/70 font-medium">Terima kasih telah berlangganan Akses Premium. Kami akan segera memproses pesanan Anda.</p>
          </div>
          <button 
            onClick={() => { setView('home'); playSound('click'); }} 
            className="bg-[#4ECDC4] hover:bg-[#45b7af] text-white px-16 py-6 rounded-[30px] font-game font-black text-3xl shadow-[0_12px_0_rgb(61,163,155)] transition-all hover:scale-105 active:shadow-none active:translate-y-[12px] flex items-center gap-4 border-4 border-black/10 mx-auto"
          >
            KEMBALI KE BERANDA
          </button>
        </div>
      );
    }

    return (
      <div className="px-4 md:px-0 w-full max-w-3xl mx-auto space-y-10 animate-in slide-in-from-bottom-8 duration-500">
        <div className="flex items-center justify-between glass-card p-6 border-white/40">
          <button onClick={() => { setView('home'); playSound('click'); }} className="text-[#2F2E41] font-bold flex items-center gap-2 hover:scale-105 transition-transform bg-white/50 px-4 py-2 rounded-xl">
            <i className="fas fa-arrow-left"></i> Kembali
          </button>
          <h2 className="text-2xl font-game font-bold text-[#2F2E41]">Checkout Premium</h2>
        </div>

        <div className="glass-card p-10 space-y-8 border-white/40">
          <div className="text-center space-y-4">
            <div className="w-20 h-20 bg-[#FFE66D] text-[#2F2E41] rounded-3xl flex items-center justify-center mx-auto text-4xl shadow-lg rotate-3">
              <i className="fas fa-crown"></i>
            </div>
            <h3 className="text-3xl font-game font-black text-[#2F2E41]">Akses Premium MathVenture</h3>
            <p className="text-[#2F2E41]/70 font-medium">Dapatkan semua materi eksklusif dan fitur tanpa batas!</p>
            <div className="text-4xl font-black text-[#4ECDC4]">Rp 50.000</div>
          </div>

          <form onSubmit={handleCheckout} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#2F2E41] ml-2">Nama Lengkap</label>
              <input 
                name="name" 
                type="text" 
                required 
                placeholder="Masukkan nama lengkap Anda"
                className="w-full px-6 py-4 rounded-2xl border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#4ECDC4] outline-none transition-all font-bold text-[#2F2E41]" 
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-bold text-[#2F2E41] ml-2">Email Aktif</label>
              <input 
                name="email" 
                type="email" 
                required 
                placeholder="nama@email.com"
                className="w-full px-6 py-4 rounded-2xl border-4 border-white/20 bg-white/50 focus:bg-white focus:border-[#4ECDC4] outline-none transition-all font-bold text-[#2F2E41]" 
              />
            </div>

            {orderStatus === 'error' && (
              <div className="bg-red-50 text-red-600 p-4 rounded-2xl border-2 border-red-100 font-bold text-center">
                Terjadi kesalahan saat menyimpan pesanan. Silakan coba lagi.
              </div>
            )}

            <button 
              type="submit" 
              disabled={isSubmitting}
              className="w-full bg-[#4ECDC4] hover:bg-[#45b7af] text-white py-6 rounded-[30px] font-game font-black text-2xl shadow-[0_12px_0_rgb(61,163,155)] transition-all hover:scale-[1.02] active:shadow-none active:translate-y-[12px] border-4 border-black/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'MEMPROSES...' : 'BELI SEKARANG'}
            </button>
          </form>
        </div>
      </div>
    );
  };

  const currentView = () => {
    switch (view) {
      case 'home': return renderHome();
      case 'material': return renderMaterial();
      case 'quiz': return renderQuiz();
      case 'report': return renderReport();
      case 'checkout': return renderCheckout();
      case 'admin-login': return renderAdminLogin();
      case 'admin-dashboard': return renderAdminDashboard();
      default: return renderHome();
    }
  };

  if (isSplashing) return <SplashScreen onFinish={() => setIsSplashing(false)} onStartGame={handleStartGame} />;

  return (
    <>
      <Layout 
      isAdmin={admin.isAuthenticated && (view === 'admin-dashboard' || view === 'admin-login')} 
      points={progress.points} 
      soundEnabled={soundEnabled} 
      onToggleSound={toggleSound} 
      onLogout={() => { setAdmin({ email: '', isAuthenticated: false }); setView('home'); playSound('click'); }} 
      onGoHome={() => { setView('home'); playSound('click'); }}
      onAdminLogin={() => { setView('admin-login'); playSound('click'); }}
    >
      {currentView()}
    </Layout>

    {/* Confirmation Modal */}
    {confirmModal.isOpen && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 md:p-6">
        <div className="absolute inset-0 bg-[#2F2E41]/80 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}></div>
        <div className="glass-card w-full max-w-lg p-8 md:p-10 space-y-8 relative z-10 animate-in zoom-in-95 duration-300 border-white/40 shadow-2xl">
          <div className="text-center space-y-4">
            <div className={`w-20 h-20 mx-auto rounded-3xl flex items-center justify-center text-4xl shadow-lg ${confirmModal.isDanger ? 'bg-red-100 text-red-500' : 'bg-sky-100 text-sky-500'}`}>
              <i className={`fas ${confirmModal.isDanger ? 'fa-exclamation-triangle' : 'fa-question-circle'}`}></i>
            </div>
            <h3 className="text-3xl font-game font-black text-[#2F2E41]">{confirmModal.title}</h3>
            <p className="text-lg text-[#2F2E41]/70 font-medium leading-relaxed">{confirmModal.message}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <button 
              onClick={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
              className="flex-1 px-8 py-4 rounded-2xl font-bold text-[#2F2E41]/60 hover:bg-white/20 transition-all text-lg"
            >
              Batal
            </button>
            <button 
              onClick={() => {
                confirmModal.onConfirm();
                setConfirmModal(prev => ({ ...prev, isOpen: false }));
              }}
              className={`flex-1 px-8 py-4 rounded-2xl font-game font-black text-xl text-white shadow-lg transition-all hover:scale-105 active:scale-95 border-b-4 ${confirmModal.isDanger ? 'bg-red-500 hover:bg-red-600 border-red-700' : 'bg-[#4ECDC4] hover:bg-[#45b7af] border-[#3da39b]'}`}
            >
              Ya, Lanjutkan
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
};

export default App;
