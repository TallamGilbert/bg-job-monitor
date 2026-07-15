import { useState, useEffect } from 'react';

export function useElapsedTime(startTime: string | undefined): string {
  const [elapsed, setElapsed] = useState('');

  useEffect(() => {
    if (!startTime) {
      setElapsed('');
      return;
    }

    const update = () => {
      const start = new Date(startTime).getTime();
      const now = Date.now();
      const diff = now - start;
      const seconds = Math.floor(diff / 1000);
      
      if (seconds < 60) {
        setElapsed(`${seconds}s`);
      } else if (seconds < 3600) {
        setElapsed(`${Math.floor(seconds / 60)}m ${seconds % 60}s`);
      } else {
        setElapsed(`${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`);
      }
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  return elapsed;
}
