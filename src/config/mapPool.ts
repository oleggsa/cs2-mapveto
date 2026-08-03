export interface MapDef {
  code: string
  name: string
  /** Path under /public, e.g. /maps/ancient.jpg — drop your own images there. */
  image: string
}

// Placeholder pool — edit this to match whatever 7 maps are in the active Premier
// pool right now (it changes over time, so this file is meant to be hand-edited).
export const MAP_POOL: MapDef[] = [
  { code: 'de_ancient', name: 'Ancient', image: '/maps/ancient.jpg' },
  { code: 'de_anubis', name: 'Anubis', image: '/maps/anubis.jpg' },
  { code: 'de_dust2', name: 'Dust II', image: '/maps/dust2.jpg' },
  { code: 'de_inferno', name: 'Inferno', image: '/maps/inferno.jpg' },
  { code: 'de_mirage', name: 'Mirage', image: '/maps/mirage.jpg' },
  { code: 'de_nuke', name: 'Nuke', image: '/maps/nuke.jpg' },
  { code: 'de_vertigo', name: 'Vertigo', image: '/maps/vertigo.jpg' },
]

export const MAP_POOL_CODES = MAP_POOL.map((m) => m.code)

export function mapByCode(code: string): MapDef | undefined {
  return MAP_POOL.find((m) => m.code === code)
}

export const ROUND_SECONDS = 25
