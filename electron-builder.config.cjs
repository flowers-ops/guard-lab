const { existsSync } = require('node:fs');
const path = require('node:path');
const voices = path.join(__dirname, '.voice-runtime');
module.exports = {
  appId: 'lab.guard.desktop',
  productName: 'Guard Lab',
  directories: { output: 'release' },
  files: [
    'dist/**/*',
    'electron/**/*',
    'shared/**/*',
    'package.json',
    'LICENSE',
    'THIRD_PARTY.md',
    'docs/*-LICENSE.md',
  ],
  asar: true,
  icon: 'public/icon.png',
  extraResources:
    process.env.GUARD_LAB_BUNDLE_VOICES === '1' && existsSync(voices)
      ? [
          {
            from: voices,
            to: 'voices',
            filter: ['engine/**/*', 'models/**/*', 'PIPER-LICENSE.md', 'ASSET-HASHES.json'],
          },
        ]
      : [],
  win: { target: ['portable'], signExecutable: false },
  portable: { artifactName: 'Guard-Lab-${version}-${arch}.exe' },
  mac: { target: ['zip'], category: 'public.app-category.games' },
  linux: { target: ['AppImage'], category: 'Game', maintainer: 'Guard Lab contributors' },
  artifactName: 'Guard-Lab-${version}-${os}-${arch}.${ext}',
};
