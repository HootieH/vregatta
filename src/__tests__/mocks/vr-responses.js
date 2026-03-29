/**
 * Realistic mock VR API responses for testing the classify → normalize pipeline.
 * Shapes are based on actual VR Offshore API patterns referenced in classifier.js and schemas/.
 */

/** Boat state — scriptData with pos, speed, heading, sail, stamina, etc. */
export const mockBoatResponse = {
  scriptData: {
    pos: { lat: 48.8566, lon: -5.3472 },
    speed: 14.2,
    heading: 215,
    twa: -42.7,
    tws: 18.3,
    twd: 257.3,
    sail: 5,
    stamina: 0.87,
    distanceToEnd: 2843.6,
    aground: false,
    lastCalcDate: 1711700000000,
    isRegulated: false,
    bestVmg: 12.1,
    badSail: false,
  },
};

/** Fleet — array of competitor objects with pos, displayName, speed, etc. */
export const mockFleetResponse = [
  {
    id: 'usr_001',
    displayName: 'SailorAlice',
    pos: { lat: 48.92, lon: -5.18 },
    speed: 13.8,
    heading: 210,
    twa: -38,
    tws: 17.9,
    sail: 5,
    rank: 1,
    dtf: 2790,
    dtl: 0,
    country: 'FR',
    playerType: 'real',
  },
  {
    id: 'usr_002',
    displayName: 'CaptainBob',
    pos: { lat: 48.75, lon: -5.41 },
    speed: 12.6,
    heading: 220,
    twa: -45,
    tws: 18.1,
    sail: 1,
    rank: 2,
    dtf: 2860,
    dtl: 70,
    country: 'GB',
    playerType: 'real',
  },
  {
    id: 'usr_003',
    displayName: 'WindChaser',
    pos: { lat: 48.68, lon: -5.55 },
    speed: 11.2,
    heading: 225,
    twa: -50,
    tws: 17.5,
    sail: 2,
    rank: 3,
    dtf: 2920,
    dtl: 130,
    country: 'US',
    playerType: 'bot',
  },
];

/** Race — scriptData with currentLegs array containing race metadata */
export const mockRaceResponse = {
  scriptData: {
    currentLegs: [
      {
        legId: 'vendee-2024-leg1',
        legNum: 1,
        name: 'Vendee Globe 2024',
        polarId: 'imoca60_2023',
        startDate: '2024-11-10T12:00:00Z',
        endDate: '2025-02-15T00:00:00Z',
        playerCount: 154302,
      },
    ],
  },
};

/** Action — Game_AddBoatAction event with heading/sail actions */
export const mockActionResponse = {
  eventKey: 'Game_AddBoatAction',
  scriptData: {
    value: 225,
  },
  type: 'heading',
  value: 225,
  autoTwa: true,
  timestamp: 1711700100000,
};

/** Wind — wind file reference with URL and grid info */
export const mockWindResponse = {
  fileUrl: 'https://static.virtualregatta.com/winds/live/20240329_06.wnd',
  timestamp: 1711695600000,
  gridResolution: 0.25,
};

/** Auth — authentication response (for classify testing) */
export const mockAuthResponse = {
  authToken: 'eyJhbGciOiJIUzI1NiJ9.mock-token',
  userId: 'usr_abc123',
  displayName: 'TestSailor',
  scriptData: {
    sessionId: 'sess_xyz',
  },
};

/** URLs that correspond to each response type */
export const mockUrls = {
  boat: 'https://prod.vro.sparks.virtualregatta.com/LogEventRequest',
  fleet: 'https://prod.vro.sparks.virtualregatta.com/LogEventRequest',
  race: 'https://prod.vro.sparks.virtualregatta.com/LogEventRequest',
  action: 'https://prod.vro.sparks.virtualregatta.com/LogEventRequest',
  wind: 'https://static.virtualregatta.com/winds/live/20240329_06.wnd',
  auth: 'https://prod.vro.sparks.virtualregatta.com/AuthenticationRequest',
};
