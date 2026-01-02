#!/usr/bin/env node

/**
 * Generates simple SVG placeholder images for LEGO parts
 * Usage: node generate-part-svgs.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read the part frequency data
const dataPath = path.join(__dirname, 'data/part-frequency.json');
const outputDir = path.join(__dirname, 'part-svgs');

// Ensure output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Read parts data
const parts = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

/**
 * Generate a simple LEGO brick SVG placeholder
 * The design shows a basic rectangular brick with studs on top
 */
function generateBrickSvg(partNum, partName) {
  // Default: 1x2 brick style placeholder
  // We'll use the part name to determine rough stud layout
  let studs = [];
  let brickWidth = 32;
  let brickX = 4;

  // Parse part name to determine approximate stud configuration
  const name = partName.toLowerCase();

  // Determine number of studs based on part name
  let studCount = 2; // default

  if (name.includes('1 x 1') || name.includes('round 1 x 1')) {
    studCount = 1;
  } else if (name.includes('2 x 2')) {
    studCount = 2; // show 2 studs in a row (simplified)
  } else if (name.includes('1 x 2') || name.includes('2 x 1')) {
    studCount = 2;
  } else if (name.includes('1 x 3') || name.includes('2 x 3') || name.includes('3 x')) {
    studCount = 3;
  } else if (name.includes('1 x 4') || name.includes('2 x 4') || name.includes('4 x 4') || name.includes('4 x')) {
    studCount = 4;
  } else if (name.includes('1 x 6') || name.includes('2 x 6') || name.includes('6 x')) {
    studCount = 4; // cap at 4 for visibility
  } else if (name.includes('1 x 8') || name.includes('2 x 8') || name.includes('8 x')) {
    studCount = 4; // cap at 4 for visibility
  } else if (name.includes('pin') || name.includes('axle')) {
    studCount = 0; // technic parts - no studs
  } else if (name.includes('tile')) {
    studCount = 0; // tiles are smooth
  } else if (name.includes('slope')) {
    studCount = 1; // slopes typically have 1-2 studs showing
  } else if (name.includes('liftarm') || name.includes('technic')) {
    studCount = 0; // technic liftarms have holes, not studs
  }

  // Generate stud circles
  if (studCount === 0) {
    // No studs - use a different indicator (small rectangle or line)
    studs = []; // empty for tiles/slopes
  } else if (studCount === 1) {
    studs = [{ cx: 20, cy: 10 }];
  } else if (studCount === 2) {
    studs = [
      { cx: 14, cy: 10 },
      { cx: 26, cy: 10 }
    ];
  } else if (studCount === 3) {
    studs = [
      { cx: 10, cy: 10 },
      { cx: 20, cy: 10 },
      { cx: 30, cy: 10 }
    ];
  } else { // 4 studs
    studs = [
      { cx: 8, cy: 10 },
      { cx: 16, cy: 10 },
      { cx: 24, cy: 10 },
      { cx: 32, cy: 10 }
    ];
  }

  // Generate SVG
  let studSvg = studs.map(s =>
    `  <circle cx="${s.cx}" cy="${s.cy}" r="3" fill="none" stroke="#666" stroke-width="1.5"/>`
  ).join('\n');

  // Special shapes for different part types
  let shapeSvg;

  if (name.includes('pin') || name.includes('axle')) {
    // Technic pin/axle - horizontal cylinder shape
    shapeSvg = `  <rect x="4" y="14" width="32" height="12" fill="none" stroke="#666" stroke-width="2" rx="6"/>
  <line x1="12" y1="14" x2="12" y2="26" stroke="#666" stroke-width="1.5"/>
  <line x1="28" y1="14" x2="28" y2="26" stroke="#666" stroke-width="1.5"/>`;
    studSvg = '';
  } else if (name.includes('liftarm')) {
    // Technic liftarm - elongated with holes
    shapeSvg = `  <rect x="4" y="14" width="32" height="12" fill="none" stroke="#666" stroke-width="2" rx="6"/>
  <circle cx="10" cy="20" r="3" fill="none" stroke="#666" stroke-width="1.5"/>
  <circle cx="20" cy="20" r="3" fill="none" stroke="#666" stroke-width="1.5"/>
  <circle cx="30" cy="20" r="3" fill="none" stroke="#666" stroke-width="1.5"/>`;
    studSvg = '';
  } else if (name.includes('tile') && name.includes('round')) {
    // Round tile - circle shape
    shapeSvg = `  <circle cx="20" cy="22" r="14" fill="none" stroke="#666" stroke-width="2"/>`;
    studSvg = '';
  } else if (name.includes('tile')) {
    // Tile - flat rectangle (no studs)
    shapeSvg = `  <rect x="4" y="14" width="32" height="18" fill="none" stroke="#666" stroke-width="2" rx="1"/>
  <line x1="6" y1="16" x2="34" y2="16" stroke="#666" stroke-width="1" stroke-dasharray="2,2"/>`;
    studSvg = '';
  } else if (name.includes('slope inverted')) {
    // Inverted slope - upside down triangle
    shapeSvg = `  <polygon points="4,12 36,12 36,36 20,36 4,24" fill="none" stroke="#666" stroke-width="2"/>`;
  } else if (name.includes('slope curved')) {
    // Curved slope - with arc
    shapeSvg = `  <path d="M4,36 L4,16 Q20,8 36,16 L36,36 Z" fill="none" stroke="#666" stroke-width="2"/>`;
  } else if (name.includes('slope')) {
    // Regular slope - angled top
    shapeSvg = `  <polygon points="4,12 36,20 36,36 4,36" fill="none" stroke="#666" stroke-width="2"/>`;
  } else if (name.includes('round 1 x 1') || name.includes('brick round')) {
    // Round brick/plate
    shapeSvg = `  <ellipse cx="20" cy="26" rx="14" ry="10" fill="none" stroke="#666" stroke-width="2"/>`;
  } else if (name.includes('wedge')) {
    // Wedge plate - triangular
    shapeSvg = `  <polygon points="4,36 36,36 36,20 20,12" fill="none" stroke="#666" stroke-width="2"/>`;
  } else if (name.includes('corner')) {
    // Corner plate - L-shape
    shapeSvg = `  <path d="M4,12 L20,12 L20,20 L36,20 L36,36 L4,36 Z" fill="none" stroke="#666" stroke-width="2"/>`;
  } else if (name.includes('panel')) {
    // Panel - tall rectangle
    shapeSvg = `  <rect x="8" y="6" width="24" height="30" fill="none" stroke="#666" stroke-width="2" rx="1"/>`;
    studSvg = '';
  } else if (name.includes('frame')) {
    // Frame - hollow rectangle
    shapeSvg = `  <rect x="4" y="10" width="32" height="26" fill="none" stroke="#666" stroke-width="2" rx="2"/>
  <rect x="10" y="16" width="20" height="14" fill="none" stroke="#666" stroke-width="1.5" rx="1"/>`;
    studSvg = '';
  } else if (name.includes('connector') || name.includes('modified')) {
    // Modified brick / connector
    shapeSvg = `  <rect x="4" y="12" width="32" height="24" fill="none" stroke="#666" stroke-width="2" rx="2"/>
  <rect x="14" y="20" width="12" height="8" fill="none" stroke="#666" stroke-width="1.5"/>`;
  } else {
    // Default brick shape
    shapeSvg = `  <rect x="4" y="12" width="32" height="24" fill="none" stroke="#666" stroke-width="2" rx="2"/>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
${studSvg}
${shapeSvg}
</svg>`;
}

// Generate SVGs for all parts
let count = 0;
for (const part of parts) {
  const svg = generateBrickSvg(part.part_num, part.name);
  const filename = `${part.part_num}.svg`;
  const filepath = path.join(outputDir, filename);

  fs.writeFileSync(filepath, svg);
  count++;
  console.log(`Created: ${filename} - ${part.name}`);
}

console.log(`\n✓ Generated ${count} SVG files in ${outputDir}`);
