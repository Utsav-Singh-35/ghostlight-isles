/** Every color in the game. Hex values are sRGB, as a designer would pick them. */
export const PALETTE = {
  skyTop: '#050A14',
  horizon: '#0E2230',
  deepWater: '#082532',
  waveCrest: '#1C5560',
  shallowWater: '#1E6466',
  moonlight: '#CFE3FF',
  lantern: '#FFB347',
  spectral: '#5CFFB0',
  bloodMoon: '#C8102E',

  foam: '#BFD6E2',
  star: '#E8F0FF',

  hemisphereSky: '#4A6A9A',
  hemisphereGround: '#0B1A20',

  // Islands: the player's island is alive, haunted islands are ashen.
  homeSand: '#A08A62',
  homeMoss: '#3E6B45',
  homeRock: '#4D5560',
  hauntedSand: '#7A746A',
  hauntedMoss: '#4A4C3E',
  hauntedRock: '#3A3D45',
  palmTrunk: '#6B4E32',
  palmLeaf: '#3F7A4A',
  deadWood: '#4A4038',
  tombstone: '#8A8E96',
  stone: '#5A6068',

  // The ship.
  hullDark: '#3A2618',
  hullTrim: '#8A6A3C',
  hullTar: '#1E1712',
  deck: '#7A5634',
  mast: '#5A4028',
  sailCloth: '#E3D9C2',
  flag: '#141414',
  crewCoatBlue: '#2F4A6A',
  crewCoatRed: '#7A2E2A',
  crewSkin: '#C9A27E',
  crewHat: '#1A1A1A',
} as const;

export type PaletteKey = keyof typeof PALETTE;
