#!/bin/sh
# Vercel build: copy the website files and write assets/firebase-config.js from the
# FIREBASE_CONFIG_JS environment variable (the file is kept out of git, same as for GitHub Pages).
set -e
if [ -z "$FIREBASE_CONFIG_JS" ]; then
  echo "Missing FIREBASE_CONFIG_JS: add it in Vercel > Project > Settings > Environment Variables" >&2
  exit 1
fi
rm -rf _site
mkdir _site
cp -r index.html works.html about.html contact.html assets _site/
printf '%s\n' "$FIREBASE_CONFIG_JS" > _site/assets/firebase-config.js
