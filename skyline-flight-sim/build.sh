#!/bin/bash
set -e
cd "$(dirname "$0")"
N=node_modules/three
OUT=dist/page.html
{
  echo '<meta name="description" content="Browser flight simulator">'
  echo '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow:wght@400;500&family=JetBrains+Mono:wght@400;500&display=swap">'
  cat src/shell.html
  echo '<script>'
  cat $N/build/three.min.js
  for f in shaders/CopyShader shaders/LuminosityHighPassShader shaders/FXAAShader postprocessing/EffectComposer postprocessing/MaskPass postprocessing/RenderPass postprocessing/ShaderPass postprocessing/UnrealBloomPass; do cat $N/examples/js/$f.js; echo; done
  echo 'var SK = {};'
  cat src/terrain.js src/flight.js src/world.js src/models.js src/hud.js src/main.js
  echo '</script>'
} > $OUT
ls -la $OUT
