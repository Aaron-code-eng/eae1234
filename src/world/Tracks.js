/** Closed-loop centerlines. Control points are smoothly interpolated by Track. */

export const TRACKS = [
  {
    id: 'neon',
    name: 'Neon Circuit',
    width: 190,
    checkpoints: 8,
    points: [
      [0, -420], [520, -500], [980, -380], [1180, -120], [980, 120],
      [700, 180], [520, 380], [180, 460], [-260, 400], [-520, 200],
      [-560, -120], [-360, -360],
    ],
  },
  {
    id: 'harbor',
    name: 'Harbor Drift',
    width: 178,
    checkpoints: 10,
    points: [
      [-100, -520], [500, -520], [900, -300], [1000, 0], [760, 240],
      [360, 220], [80, 420], [-420, 480], [-780, 220], [-820, -180], [-560, -460],
    ],
  },
  {
    id: 'speedway',
    name: 'Sunset Speedway',
    width: 225,
    checkpoints: 6,
    points: [
      [-700, -360], [0, -460], [700, -360], [900, -120], [820, 220],
      [400, 400], [-300, 420], [-820, 220], [-960, -80],
    ],
  },
];

export const TRACK_IDS = TRACKS.map((track) => track.id);
export const getTrackDef = (id) => TRACKS.find((track) => track.id === id) ?? TRACKS[0];
