// Worker has been migrated to Cron-based scheduler (api/src/cron/posting.cron.js)
// This file is kept as a placeholder or can be safely deleted.
// export const initWorker = (io) => { console.log('Worker is disabled.'); };
import { EventEmitter } from 'events';
export const jobEvents = new EventEmitter(); // Keep for backward compatibility of imports
