import { CREATURE_CONFIGS } from '../src/state/creatures/voltkin-config.ts';
import { attackFifths } from '../src/state/stats.ts';
for (const [k, c] of Object.entries(CREATURE_CONFIGS)) console.log(k, 'hp', c.hp, 'def', c.def, 'atk', c.atk, 'pen', c.pen, 'strike', attackFifths(c.atk, c.pen));
