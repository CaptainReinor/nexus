import { z } from 'zod';

// Validation must also work in renderers with a strict Content Security Policy.
z.config({ jitless: true });
export { z };
