// Every tunable number of the rules, named. Core only: no DOM, no Three.js.

/** Physics timestep. The page and the headless runner both step by this. */
export const DT = 1 / 120

/** km/h -> m/s is /3.6; m/s -> km/h is *3.6. */
export const KMH = 3.6

export const ROAD_HALF_WIDTH = 6 // metres; the road is 12 m wide

/** Top speed on the road: 216 km/h. */
export const V_MAX_ROAD = 216 / KMH // 60 m/s
/** Top speed on the road while the boost burns: 270 km/h. */
export const V_MAX_BOOST = 270 / KMH // 75 m/s
/** Top speed off the road: 72 km/h. */
export const V_MAX_OFF = 72 / KMH // 20 m/s

export const V_MAX_REVERSE = 12 // m/s
export const ENGINE_A = 12 // m/s^2 at standstill, tapering towards the cap
export const TAPER = 1.05 // engine can push to cap*TAPER, so drag never stalls it short of the cap
export const BRAKE_A = 22 // m/s^2
export const REVERSE_A = 8 // m/s^2
export const DRAG_A = 0.3 // m/s^2 rolling resistance
export const OFFROAD_DECEL = 12 // m/s^2 pulling an over-limit car back down off the road

export const LAT_GRIP_ROAD = 13 // m/s^2 of lateral grip on the road
export const LAT_GRIP_OFF = 7 // m/s^2 of lateral grip off the road
export const STEER_RATE = 2.4 // rad/s of yaw at full lock and full authority
export const STEER_REF_V = 9 // m/s at which full steering authority is reached

// ---- the boost -------------------------------------------------------------
export const BOOST_SECONDS = 3 // a full charge, burnt end to end
export const BOOST_RECHARGE = 10 // seconds from empty back to full, only while not burning
export const BOOST_ENGINE_FACTOR = 4.5 // the engine pushes this much harder while burning

export const PASS_RADIUS = 14 // metres: how close the car must get to a point to pass it
export const LINE_HALF = 7.5 // metres: half-width of the start line crossing test
export const WRONG_WAY_SPEED = 1.5 // m/s backwards along the track before it counts
export const WRONG_WAY_TIME = 0.6 // seconds backwards before the page says WRONG WAY

export const HEADLESS_TIMEOUT = 300 // seconds of sim time before the headless lap gives up

// ---- the race -------------------------------------------------------------
export const RACE_LAPS = 3
export const COUNTDOWN_SECONDS = 3
export const CAR_HALF_LONG = 2.3 // the car as a box: half-length, metres
export const CAR_HALF_WIDE = 0.95 // half-width, metres
export const CONTACT_RESTITUTION = 0.25
export const CONTACT_SCRUB = 0.975 // speed kept after a knock
export const GRID_FIRST_ROW = 9 // metres behind the start line
export const GRID_GAP_LONG = 7
export const GRID_HALF_GAP_LAT = 2.5
export const OVERTAKE_LOOK = 36 // metres of look-ahead for traffic
export const OVERTAKE_OFFSET = 3.2 // how far sideways the pass line aims
export const RACE_TIMEOUT = 600 // seconds of sim time before the headless race gives up
