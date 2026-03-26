const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Allow importing from shared package at ../shared
config.watchFolders = [
  path.resolve(__dirname, '..', 'shared'),
];

config.resolver.extraNodeModules = {
  '@shared': path.resolve(__dirname, '..', 'shared', 'src'),
};

module.exports = config;
