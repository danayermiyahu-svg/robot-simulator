// File: src/hooks/useGamepads.ts

import { useState, useEffect } from 'react';

export interface GamepadState {
  id: string;
  index: number;
  axes: number[];
  buttons: boolean[];
}

export function useGamepads() {
  const [gamepads, setGamepads] = useState<Record<number, GamepadState>>({});

  useEffect(() => {
    let animationFrameId: number;

    const updateGamepads = () => {
      const connectedGamepads = navigator.getGamepads();
      const activeGamepads: Record<number, GamepadState> = {};

      for (let i = 0; i < connectedGamepads.length; i++) {
        const pad = connectedGamepads[i];
        if (pad) {
          activeGamepads[pad.index] = {
            id: pad.id,
            index: pad.index,
            axes: [...pad.axes],
            buttons: pad.buttons.map(b => b.pressed)
          };
        }
      }

      setGamepads(activeGamepads);
      animationFrameId = requestAnimationFrame(updateGamepads);
    };

    updateGamepads();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return gamepads;
}

export function getGamepadAxes(index: number) {
  const gamepads = navigator.getGamepads();
  if (gamepads[index]) {
    return gamepads[index].axes;
  }
  return null;
}