import userConfig from '../../config/arena-3d.config.js';
import defaultConfig from '../../config/default.config.js';

/**
 * Deep-merge user config over defaults, validate, and freeze.
 */
function deepMerge(target, source) {
  const result = { ...target };
  for (const key of Object.keys(source)) {
    if (source[key] === undefined) continue;
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === 'object' &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key]);
    } else {
      result[key] = source[key];
    }
  }
  return result;
}

const config = deepMerge(defaultConfig, userConfig);

// Normalize channel URLs to slugs
if (config.arena.channels && config.arena.channels.length) {
  config.arena.channels = config.arena.channels.map(ch => {
    // Extract slug from full URL: https://www.are.na/user/channel-slug → channel-slug
    const match = ch.match(/are\.na\/[^/]+\/([^/?#]+)/);
    return match ? match[1] : ch;
  });
}

// Validate
if (!config.arena.username && (!config.arena.channels || !config.arena.channels.length)) {
  console.warn(
    '[arena-3d] No username or channels configured. Edit config/arena-3d.config.js or run: npm run setup'
  );
}

export default Object.freeze(config);
