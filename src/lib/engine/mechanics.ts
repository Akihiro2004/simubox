// Ideal 1D teaching models. SI units throughout; positive is to the right/down the ramp.
import type { MechanicsState } from "../experiments";

export interface MechanicsResult {
  x: number; x2: number; velocity: number; velocity2: number; acceleration: number;
  netForce: number; frictionForce: number; normal: number; momentum: number; momentum2: number;
  kinetic: number; potential: number; impulse: number; impulse2: number; work: number;
  collisionTime: number | null; collided: boolean; period: number | null; angle: number;
}

/** Coulomb friction with equal static/kinetic coefficients; stops exactly, never friction-driven reversal. */
export function slide(mass: number, force: number, resistance: number, velocity: number, t: number) {
  const branch = (v: number) => Math.abs(v) < 1e-10
    ? (Math.abs(force) <= resistance ? 0 : (force - Math.sign(force) * resistance) / mass)
    : (force - Math.sign(v) * resistance) / mass;
  let a = branch(velocity), x = velocity * t + .5 * a * t * t, v = velocity + a * t;
  const stop = a * velocity < 0 ? -velocity / a : Infinity;
  if (stop <= t) {
    const first = velocity * stop + .5 * a * stop * stop;
    a = branch(0);
    const remaining = t - stop;
    x = first + .5 * a * remaining ** 2;
    v = a * remaining;
  }
  const friction = a * mass - force;
  return { x, velocity: v, acceleration: a, friction, force: a * mass };
}

export function mechanicsAt(s: MechanicsState, time = s.durationS): MechanicsResult {
  const t = Math.min(s.durationS, Math.max(0, time));
  const m = s.massKg, m2 = s.mass2Kg, g = s.gravity;
  let x = 0, x2 = 2, v = s.velocity, v2 = s.velocity2, a = 0, net = 0, friction = 0, normal = m * g;
  let potential = 0, impulse = 0, impulse2 = 0, work = 0, angle = 0;
  let collisionTime: number | null = null, period: number | null = null, collided = false;
  if (s.mode === "force" || s.mode === "ramp") {
    angle = s.mode === "ramp" ? s.angleDeg * Math.PI / 180 : 0;
    normal = m * g * Math.cos(angle);
    const applied = s.forceN - s.opposingN + m * g * Math.sin(angle);
    const r = slide(m, applied, s.friction * normal, v, t);
    ({ x, velocity: v, acceleration: a, force: net, friction } = r);
    potential = -m * g * x * Math.sin(angle); // Relative to the starting height.
    work = .5 * m * (v * v - s.velocity ** 2);
    impulse = m * (v - s.velocity);
  } else if (s.mode === "collision") {
    // Cart centres begin at -2 m and +2 m, with 0.6 m combined half-length.
    const gap = 4 - .6, closing = s.velocity - s.velocity2;
    collisionTime = closing > 0 ? gap / closing : null;
    collided = collisionTime !== null && t >= collisionTime;
    if (collided) {
      v = (m * s.velocity + m2 * s.velocity2 - m2 * s.restitution * closing) / (m + m2);
      v2 = (m * s.velocity + m2 * s.velocity2 + m * s.restitution * closing) / (m + m2);
      const hit = collisionTime!;
      x = -2 + s.velocity * hit + v * (t - hit);
      x2 = 2 + s.velocity2 * hit + v2 * (t - hit);
      impulse = m * (v - s.velocity); impulse2 = m2 * (v2 - s.velocity2);
    } else { x = -2 + v * t; x2 = 2 + v2 * t; }
    normal = m * g;
  } else if (s.mode === "impulse") {
    const contact = Math.min(t, s.contactS), force = s.impulseNs / s.contactS;
    v = s.velocity + force * contact / m;
    x = s.velocity * contact + .5 * force / m * contact ** 2 + v * Math.max(0, t - s.contactS);
    net = t < s.contactS ? force : 0; a = net / m;
    impulse = force * contact; work = .5 * m * (v * v - s.velocity ** 2);
  } else if (s.mode === "spring") {
    const omega = Math.sqrt(s.springK / m), initial = s.displacementM;
    x = initial * Math.cos(omega * t) + s.velocity / omega * Math.sin(omega * t);
    v = -initial * omega * Math.sin(omega * t) + s.velocity * Math.cos(omega * t);
    net = -s.springK * x; a = net / m; potential = .5 * s.springK * x * x;
    period = 2 * Math.PI / omega;
    work = .5 * m * (v * v - s.velocity ** 2);
    impulse = m * (v - s.velocity);
  } else {
    // Small-angle pendulum, initial angular velocity zero, amplitude limited to 15 degrees.
    const omega = Math.sqrt(g / s.lengthM), initial = s.pendulumDeg * Math.PI / 180;
    angle = initial * Math.cos(omega * t);
    const angularV = -initial * omega * Math.sin(omega * t);
    x = s.lengthM * Math.sin(angle); v = s.lengthM * angularV;
    a = -g * angle; net = m * a; normal = 0;
    potential = .5 * m * g * s.lengthM * angle * angle; // Consistent small-angle energy.
    period = omega ? 2 * Math.PI / omega : null;
    impulse = m * (v - 0);
  }
  return { x, x2, velocity: v, velocity2: v2, acceleration: a, netForce: net, frictionForce: friction,
    normal, momentum: m * v, momentum2: m2 * v2, kinetic: .5 * m * v * v + (s.mode === "collision" ? .5 * m2 * v2 * v2 : 0),
    potential, impulse, impulse2, work, collisionTime, collided, period, angle };
}

export const MECHANICS_LABELS = { force: "Forces & acceleration", collision: "Colliding carts", impulse: "Impulse & contact time", ramp: "Inclined plane", spring: "Spring & energy", pendulum: "Pendulum" } as const;
export const mechanicsLimit = (mode: MechanicsState["mode"]) => mode === "collision"
  ? "Isolated 1D collision; instantaneous impact; no external horizontal force. Restitution sets energy loss."
  : mode === "pendulum" ? "Small-angle approximation (up to 15°), no air drag. Energy uses the same approximation."
  : mode === "spring" ? "Ideal Hooke spring, no damping. Horizontal motion; spring extension may be positive or negative."
  : mode === "impulse" ? "Constant force during contact, then free motion. No friction; signed impulse changes momentum."
  : "1D motion. Equal static/kinetic friction coefficients; no air drag. Ramp displacement is along the slope.";
