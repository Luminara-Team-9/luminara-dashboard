'use client';

import { useEffect } from 'react';
import { init, trackViews } from 'swetrix';

export function SwetrixTracker() {
  useEffect(() => {
    if (!initialized) {
      init('6MZNYXghl1v8', {
        apiURL: 'http://155.230.135.209:5005/log',
      });
      trackViews();
      initialized = true;
    }
  }, []);
  return null;
}
