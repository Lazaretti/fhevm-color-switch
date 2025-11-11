"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useFhevm } from "@fhevm-sdk";
import { motion } from "framer-motion";
import { useAccount } from "wagmi";
import { RainbowKitCustomConnectButton } from "~~/components/helper/RainbowKitCustomConnectButton";
import { useFHEColorSwitch } from "~~/hooks/useFHEColorSwitch";

// --- Game constants ---
const GAME_COLORS = ["#FF4081", "#448AFF", "#FFC107", "#00E676"];
const GAME_HEIGHT = 650;
const PLAYER_SIZE = 16;
const OBSTACLE_SIZE = 120;
const GRAVITY = 0.12;
const JUMP_VELOCITY = -3;
const START_Y = GAME_HEIGHT / 2;
const CENTER_Y = GAME_HEIGHT / 2;

const getRandomColor = () => GAME_COLORS[Math.floor(Math.random() * GAME_COLORS.length)];

// --- Core Game Area ---
const CoreGameArea = ({
  isGameActive,
  onGameOver,
  currentScore,
  setCurrentScore,
}: {
  isGameActive: boolean;
  onGameOver: (score: number) => void;
  currentScore: React.MutableRefObject<number>;
  setCurrentScore: (score: number) => void;
}) => {
  const playerYRef = useRef(START_Y);
  const playerVelocityRef = useRef(0);
  const obstacleRotationRef = useRef(0);
  const rotationSpeedRef = useRef(36);

  const [playerY, setPlayerY] = useState(START_Y);
  const [playerColor, setPlayerColor] = useState(getRandomColor());
  const [obstacleRotation, setObstacleRotation] = useState(0);
  const [message, setMessage] = useState("Press START to play");

  const gameLoopRef = useRef<number>();
  const lastTimeRef = useRef<number>(0);

  const updateGame = useCallback(
    (timestamp: number) => {
      if (!isGameActive) return;

      const deltaTime = (timestamp - lastTimeRef.current) / 1000;
      lastTimeRef.current = timestamp;

      // Rotate obstacle
      obstacleRotationRef.current = (obstacleRotationRef.current + rotationSpeedRef.current * deltaTime) % 360;
      setObstacleRotation(obstacleRotationRef.current);

      // Update player position
      let newVelocity = playerVelocityRef.current + GRAVITY;
      let newY = playerYRef.current + newVelocity;

      let gameOver = false;

      if (newY < 0) gameOver = true;
      if (newY > GAME_HEIGHT - PLAYER_SIZE) gameOver = true;

      // Collision check
      const distanceToCenter = Math.abs(newY - CENTER_Y);
      const minRadius = OBSTACLE_SIZE - PLAYER_SIZE;
      const maxRadius = OBSTACLE_SIZE + PLAYER_SIZE;

      if (distanceToCenter >= minRadius && distanceToCenter <= maxRadius) {
        const angle = (Math.atan2(newY - CENTER_Y, 0) * 180) / Math.PI;
        let normalizedAngle = (angle - obstacleRotationRef.current + 360) % 360;

        const segmentAngle = 360 / GAME_COLORS.length;
        const segmentIndex = Math.floor(normalizedAngle / segmentAngle);
        const gapAngle = 40;
        const segmentStart = segmentIndex * segmentAngle;
        const segmentEnd = segmentStart + segmentAngle;
        const inGap = normalizedAngle >= segmentStart + gapAngle / 2 && normalizedAngle <= segmentEnd - gapAngle / 2;

        if (!inGap) gameOver = true;
        else {
          currentScore.current += 1;
          setCurrentScore(currentScore.current);
          setPlayerColor(getRandomColor());
          rotationSpeedRef.current += 2;
          newVelocity = JUMP_VELOCITY;
          newY += newVelocity;
        }
      }

      if (gameOver) {
        onGameOver(currentScore.current);
        return;
      }

      playerVelocityRef.current = newVelocity;
      playerYRef.current = newY;
      setPlayerY(newY);

      gameLoopRef.current = requestAnimationFrame(updateGame);
    },
    [isGameActive, onGameOver, currentScore, setCurrentScore],
  );

  const startGameLoop = useCallback(() => {
    if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    lastTimeRef.current = performance.now();
    rotationSpeedRef.current = 36;
    playerYRef.current = START_Y;
    playerVelocityRef.current = 0;
    obstacleRotationRef.current = 0;
    setPlayerY(START_Y);
    setPlayerColor(getRandomColor());
    setObstacleRotation(0);
    gameLoopRef.current = requestAnimationFrame(updateGame);
    setMessage("Playing! Click to jump!");
  }, [updateGame]);

  useEffect(() => {
    if (isGameActive) startGameLoop();
    else if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);

    return () => {
      if (gameLoopRef.current) cancelAnimationFrame(gameLoopRef.current);
    };
  }, [isGameActive, startGameLoop]);

  const handleJump = () => {
    if (!isGameActive) return;
    playerVelocityRef.current = JUMP_VELOCITY;
    currentScore.current += 1;
    setCurrentScore(currentScore.current);
    setPlayerColor(getRandomColor());
    rotationSpeedRef.current += 2;
  };

  return (
    <motion.div
      className="w-full relative mx-auto overflow-hidden rounded-2xl border-4 border-cyan-500 shadow-2xl cursor-pointer bg-gray-900/90"
      style={{ height: GAME_HEIGHT }}
      onClick={handleJump}
    >
      <motion.div
        className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"
        style={{ rotate: obstacleRotation }}
        transition={{ type: "tween", duration: 0.1, ease: "linear" }}
      >
        <svg width={OBSTACLE_SIZE * 2} height={OBSTACLE_SIZE * 2}>
          {GAME_COLORS.map((color, index) => (
            <path
              key={index}
              fill={color}
              d={`
                M ${OBSTACLE_SIZE} ${OBSTACLE_SIZE}
                L ${OBSTACLE_SIZE} 0
                A ${OBSTACLE_SIZE} ${OBSTACLE_SIZE} 0 0 1
                ${OBSTACLE_SIZE * (1 + Math.sin(((index + 1) * Math.PI) / 2))}
                ${OBSTACLE_SIZE * (1 - Math.cos(((index + 1) * Math.PI) / 2))}
                Z
              `}
              transform={`rotate(${index * 90}, ${OBSTACLE_SIZE}, ${OBSTACLE_SIZE})`}
            />
          ))}
          <circle cx={OBSTACLE_SIZE} cy={OBSTACLE_SIZE} r={OBSTACLE_SIZE / 2} fill="#111827" />
        </svg>
      </motion.div>

      <motion.div
        className="absolute left-1/2 transform -translate-x-1/2 rounded-full shadow-lg"
        style={{ width: PLAYER_SIZE, height: PLAYER_SIZE, backgroundColor: playerColor, top: playerY }}
        transition={{ type: "tween", duration: 0.03, ease: "linear" }}
      />

      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 bg-gray-900/80 text-cyan-200 px-4 py-2 rounded-full text-sm font-semibold shadow-xl">
        {message}
      </div>

      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-8xl font-extrabold text-white/10 select-none">
        {currentScore.current}
      </div>
    </motion.div>
  );
};

// --- Main FHEColorSwitch component ---
export const FHEColorSwitch = () => {
  const { isConnected, chain } = useAccount();
  const activeChain = chain?.id;

  const ethProvider = useMemo(() => (typeof window !== "undefined" ? (window as any).ethereum : undefined), []);

  const initialMockChains = {
    11155111: `https://eth-sepolia.g.alchemy.com/v2/${process.env.NEXT_PUBLIC_ALCHEMY_API_KEY}`,
  };

  const { instance: colorSwitchVM } = useFhevm({
    provider: ethProvider,
    chainId: activeChain,
    enabled: true,
    initialMockChains: initialMockChains,
  });

  const cs = useFHEColorSwitch({ instance: colorSwitchVM, initialMockChains: initialMockChains });

  const currentScore = useRef(0);
  const [maxScore, setMaxScore] = useState(0);
  const [feedbackMsg, setFeedbackMsg] = useState("Ready for FHE?");
  const [isGameActive, setIsGameActive] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  const handleSetCurrentScore = (score: number) => (currentScore.current = score);

  const handleGameOver = (finalScore: number) => {
    setIsGameActive(false);
    setIsGameOver(true);
    setMaxScore(finalScore);
    setFeedbackMsg(`🏆 Game Over! Final Score: ${finalScore}`);
  };

  const handleSubmitScore = async () => {
    if (!cs.canSubmit || cs.isProcessing) return;
    setFeedbackMsg(`Submitting score ${currentScore.current}...`);
    await cs.submitScore(currentScore.current);
    setFeedbackMsg(`✅ Score ${currentScore.current} submitted successfully!`);
  };

  const handleStartGame = () => {
    currentScore.current = 0;
    setMaxScore(0);
    setIsGameOver(false);
    setIsGameActive(true);
    setFeedbackMsg("Game started! Click to jump!");
  };

  const handleDecrypt = async () => {
    if (!cs.canDecryptScores || cs.isDecryptingScores) return;
    setFeedbackMsg("Decrypting scores...");
    await cs.decryptScores?.();
    setFeedbackMsg("Scores decrypted!");
  };

  if (!isConnected) {
    return (
      <div className="h-[100vh] w-full bg-gray-900/50 flex items-center justify-center text-cyan-100">
        <motion.div
          className="h-[380px] w-[540px] bg-cyan-900/20 border border-cyan-400 rounded-2xl p-12 text-center shadow-xl backdrop-blur-md"
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
        >
          <div className="text-5xl mb-6 animate-pulse">🎨</div>
          <h2 className="text-3xl font-extrabold mb-3 tracking-wide text-cyan-300">Connect Wallet</h2>
          <p className="text-cyan-200 mb-6">Access FHEVM Color Switch</p>
          <RainbowKitCustomConnectButton />
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full text-cyan-100 bg-gray-900/50 p-6 md:p-10">
      <div className="max-w-[1200px] mx-auto">
        <header className="flex flex-col md:flex-row items-center justify-between mb-8 border-b border-cyan-700/50 pb-4">
          <h1 className="text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-pink-400 to-cyan-400 drop-shadow-xl mb-4 md:mb-0">
            FHEVM Color Switch
          </h1>
          <RainbowKitCustomConnectButton />
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <motion.div className="lg:col-span-2 bg-gray-800/80 p-6 rounded-3xl shadow-3xl flex flex-col items-center">
            <h2 className="text-3xl font-bold text-pink-400 mb-4">GAME AREA</h2>
            <CoreGameArea
              isGameActive={isGameActive}
              onGameOver={handleGameOver}
              currentScore={currentScore}
              setCurrentScore={handleSetCurrentScore}
            />

            {isGameOver && (
              <motion.button
                onClick={handleSubmitScore}
                disabled={cs.isProcessing}
                className="mt-6 w-full max-w-sm px-8 py-3 rounded-full text-xl font-bold bg-gradient-to-r from-green-500 to-blue-600 text-white hover:from-green-400 hover:to-blue-500 shadow-xl"
              >
                {cs.isProcessing ? "Submitting..." : "📤 Submit Score"}
              </motion.button>
            )}

            <motion.button
              onClick={handleStartGame}
              disabled={isGameActive || cs.isProcessing}
              className="mt-4 w-full max-w-sm px-8 py-3 rounded-full text-xl font-bold bg-gradient-to-r from-pink-500 to-purple-600 text-white shadow-xl"
            >
              {isGameActive ? "PLAYING..." : "🚀 START GAME"}
            </motion.button>
          </motion.div>

          <div className="lg:col-span-1 flex flex-col space-y-8">
            <section className="bg-gradient-to-br from-cyan-900/60 to-blue-900/60 border border-cyan-500 rounded-3xl p-6 shadow-3xl backdrop-blur-md">
              <h2 className="text-2xl font-bold mb-3 text-cyan-300">📊 FHE Scores</h2>
              <div className="flex items-center justify-between mb-4">
                <span className="text-xl font-semibold text-white">High Score:</span>
                <motion.div
                  className="text-5xl font-black text-pink-300"
                  key={maxScore}
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", stiffness: 200 }}
                >
                  {maxScore}
                </motion.div>
              </div>
              <motion.div
                className={`text-sm p-3 rounded-xl font-medium ${
                  cs.isProcessing ? "bg-yellow-900/50 text-yellow-300 animate-pulse" : "bg-green-900/50 text-green-300"
                }`}
                key={feedbackMsg}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
              >
                {feedbackMsg}
              </motion.div>
            </section>

            <section className="bg-gray-800/80 border border-teal-600 rounded-3xl p-6 shadow-3xl backdrop-blur-md flex-grow">
              <div className="flex items-center justify-between mb-4 border-b border-teal-700 pb-3">
                <h3 className="text-[20px] font-bold text-teal-300 mb-1">🔒 Score History</h3>
                <motion.button
                  onClick={handleDecrypt}
                  disabled={!cs.canDecryptScores || cs.isDecryptingScores}
                  className={`px-4 py-1.5 rounded-full font-semibold text-white transition-all duration-300 text-sm ${
                    cs.isDecryptingScores
                      ? "bg-purple-800/80 cursor-wait animate-pulse"
                      : !cs.scoreData?.length
                        ? "bg-gray-600/50 text-gray-400 cursor-not-allowed"
                        : "bg-purple-600 hover:bg-purple-500 transform hover:-translate-y-0.5"
                  }`}
                >
                  {cs.isDecryptingScores ? "Decrypting..." : "🔓 Decrypt & View"}
                </motion.button>
              </div>

              <div
                className={`overflow-y-auto rounded-xl border border-teal-700 divide-y divide-teal-800 shadow-inner ${
                  isGameOver ? "h-[545px]" : "h-[480px]"
                }`}
              >
                {cs.scoreData?.length ? (
                  cs.scoreData.map((item, idx) => {
                    const decrypted = cs.decryptedScores?.[item];
                    const isDecrypted = decrypted !== undefined;
                    return (
                      <div
                        key={item}
                        className={`flex items-center justify-between px-4 py-3 text-base transition-colors ${
                          isDecrypted ? "bg-gray-700/70" : "bg-gray-800/70 hover:bg-gray-700/70"
                        }`}
                      >
                        <div className="text-teal-400 font-mono font-medium">#{idx + 1}</div>
                        {isDecrypted ? (
                          <motion.div
                            className="font-extrabold flex items-center gap-2 text-green-400"
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: idx * 0.05 }}
                          >
                            <span>🏆</span>
                            <span>{Number(decrypted)}</span>
                          </motion.div>
                        ) : (
                          <div className="flex items-center gap-2 text-cyan-500/80">
                            <span>🔒</span>
                            <span className="italic">Encrypted (FHEVM)</span>
                          </div>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <motion.div
                    className="text-teal-600 italic text-center py-12 text-md"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                  >
                    No scores submitted yet. Play the game!
                  </motion.div>
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
