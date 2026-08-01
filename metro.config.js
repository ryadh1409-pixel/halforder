// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// ── Production optimizations ──────────────────────────────────────────────────

// 1. Enable inline requires — defers module evaluation until first use.
//    Speeds up cold start significantly on large bundles.
config.transformer.getTransformOptions = async () => ({
  transform: {
    experimentalImportSupport: false,
    inlineRequires: true,
  },
});

// 2. Minifier: use the default metro minifier with aggressive settings.
config.transformer.minifierConfig = {
  keep_classnames: false,
  keep_fnames: false,
  mangle: { toplevel: false },
  output: {
    ascii_only: true,
    quote_style: 3,
    wrap_iife: true,
  },
  sourceMap: { includeSources: false },
  toplevel: false,
  compress: {
    reduce_funcs: false,
    // Drop all console.* calls from the production bundle
    drop_console: true,
  },
};

module.exports = config;
