const assert = require('node:assert/strict');
const { test } = require('node:test');
// Node 26 loads this module with native TypeScript stripping; no build needed.
const { BouquetRotation } = require('./rotation.ts');

const TURN = 2 * Math.PI;
const FRONT_YAW = -0.10;
const PROJECTION = 0.099; // (1 / 1000) * 0.99 / (1 - 0.99)

function near(actual, expected, tolerance = 1e-10) {
  assert.ok(Math.abs(actual - expected) <= tolerance, `expected ${actual} ≈ ${expected}`);
}

function settle(rotation, start, hz = 60) {
  for (let i = 0; i <= 2 * hz; i++) {
    if (!rotation.step(start + i * 1000 / hz)) {
      assert.equal(rotation.moving, false);
      return;
    }
  }
  assert.fail('rotation was still scheduling frames after two seconds');
}

function flick(rotation) {
  rotation.grab(40, 50, 0);
  rotation.move(50, 45, 20, 0.01);
  rotation.move(60, 40, 40, 0.01);
  rotation.release(40);
}

test('initial pose is idle; dragging follows the pointer directly on both axes', () => {
  const rotation = new BouquetRotation();
  assert.equal(rotation.yaw, FRONT_YAW);
  assert.equal(rotation.pitch, 0);
  assert.equal(rotation.moving, false);
  assert.equal(rotation.step(0), false);

  rotation.grab(500, 500, 10);
  rotation.move(1500, 50, 20, 0.02);
  near(rotation.yaw, FRONT_YAW + 20);
  near(rotation.pitch, -9);
  assert.equal(rotation.moving, false);
  assert.equal(rotation.step(24), false);
  rotation.move(500, 500, 30, 0.02);
  assert.equal(rotation.yaw, FRONT_YAW);
  assert.equal(rotation.pitch, 0);
});

test('momentum preserves both flick directions and lands at the projected angles', () => {
  const rotation = new BouquetRotation();
  flick(rotation);
  assert.equal(rotation.moving, true);
  near(rotation.yaw, 0.1);
  near(rotation.pitch, -0.1);

  assert.equal(rotation.step(41), true);
  near((rotation.yaw - 0.1) * 1000, 5, 0.1);
  near((rotation.pitch + 0.1) * 1000, -2.5, 0.1);
  settle(rotation, 41);
  near(rotation.yaw, 0.1 + 5 * PROJECTION);
  near(rotation.pitch, -0.1 - 2.5 * PROJECTION);
  assert.equal(rotation.step(3000), false);
});

test('an isolated last-moment reversal steers the release; older motion is discarded', () => {
  const rotation = new BouquetRotation();
  rotation.grab(0, 0, 0);
  rotation.move(100, 0, 30, 0.01);
  rotation.move(100, 0, 160, 0.01);
  rotation.move(104, 0, 220, 0.01);
  rotation.move(94, 0, 240, 0.01);
  rotation.release(240);

  const releasedYaw = rotation.yaw;
  assert.equal(rotation.step(245), true);
  assert.ok(rotation.yaw < releasedYaw);
  assert.equal(rotation.pitch, 0);
});

test('release caps angular speed without changing a diagonal flick’s direction', () => {
  const rotation = new BouquetRotation();
  rotation.grab(0, 0, 0);
  rotation.move(300, 400, 1, 0.01);
  rotation.release(1);
  const { yaw, pitch } = rotation;
  settle(rotation, 1);
  near(rotation.yaw - yaw, 12 * 0.6 * PROJECTION);
  near(rotation.pitch - pitch, 12 * 0.8 * PROJECTION);
});

test('identical frame timestamps at 60 and 120 Hz give the same momentum and Reset poses', () => {
  for (const startMotion of [flick, (rotation) => {
    rotation.nudge(1.7, -2.3);
    rotation.reset();
    rotation.step(40);
  }]) {
    const slow = new BouquetRotation();
    const fast = new BouquetRotation();
    startMotion(slow);
    startMotion(fast);
    for (let i = 1; i <= 120; i++) {
      const timeMs = 40 + i * 1000 / 60;
      fast.step(timeMs - 1000 / 120);
      fast.step(timeMs);
      slow.step(timeMs);
      // A different refresh rate can snap to rest one frame earlier.
      const tolerance = slow.moving && fast.moving ? 1e-10 : 0.0001;
      near(slow.yaw, fast.yaw, tolerance);
      near(slow.pitch, fast.pitch, tolerance);
    }
    assert.equal(slow.moving, false);
    assert.equal(fast.moving, false);
  }
});

test('zero, same-timestamp and paused releases do not throw', () => {
  const rotation = new BouquetRotation();
  rotation.grab(0, 0, 10);
  rotation.release(20);
  assert.equal(rotation.step(21), false);

  rotation.grab(0, 0, 30);
  rotation.move(10, 0, 30, 0.01);
  rotation.release(30);
  assert.equal(rotation.step(31), false);
  near(rotation.yaw, 0);

  rotation.grab(0, 0, 40);
  rotation.move(20, -15, 60, 0.01);
  const { yaw, pitch } = rotation;
  rotation.release(140);
  assert.equal(rotation.step(141), false);
  assert.equal(rotation.yaw, yaw);
  assert.equal(rotation.pitch, pitch);
});

test('a large frame pause settles safely rather than restarting or exploding', () => {
  for (const startMotion of [flick, (rotation) => {
    rotation.nudge(1, -1);
    rotation.reset();
    rotation.step(40);
  }]) {
    const rotation = new BouquetRotation();
    startMotion(rotation);
    assert.equal(rotation.step(10_000), false);
    assert.equal(rotation.moving, false);
    assert.ok(Number.isFinite(rotation.yaw) && Number.isFinite(rotation.pitch));
  }
});

test('regrab freezes the last presentation pose and cancellation never flings', () => {
  const rotation = new BouquetRotation();
  flick(rotation);
  rotation.step(90);
  assert.equal(rotation.moving, true);
  const { yaw, pitch } = rotation;

  rotation.grab(99, 123, 100);
  assert.equal(rotation.yaw, yaw);
  assert.equal(rotation.pitch, pitch);
  assert.equal(rotation.step(110), false);
  rotation.move(89, 133, 115, 0.02);
  near(rotation.yaw, yaw - 0.2);
  near(rotation.pitch, pitch + 0.2);
  rotation.release(115, true);
  assert.equal(rotation.step(116), false);
  near(rotation.yaw, yaw - 0.2);
  near(rotation.pitch, pitch + 0.2);
});

test('Reset takes the shortest route independently on each axis after multiple turns', () => {
  const rotation = new BouquetRotation();
  rotation.nudge(4 * TURN - 0.75, -3 * TURN + 0.9);
  const { yaw, pitch } = rotation;
  rotation.reset();
  assert.equal(rotation.yaw, yaw);
  assert.equal(rotation.pitch, pitch);
  assert.equal(rotation.moving, true);
  rotation.step(0);
  rotation.step(20);
  assert.ok(rotation.yaw > yaw);
  assert.ok(rotation.pitch < pitch);
  settle(rotation, 20);
  near(rotation.yaw, FRONT_YAW + 4 * TURN);
  near(rotation.pitch, -3 * TURN);
  rotation.reset();
  assert.equal(rotation.step(3000), false);
  rotation.reset(true);
  assert.equal(rotation.yaw, FRONT_YAW);
  assert.equal(rotation.pitch, 0);
});

test('animated Reset inherits live spring velocity before steering back', () => {
  const rotation = new BouquetRotation();
  flick(rotation);
  rotation.step(50);
  const { yaw, pitch } = rotation;
  rotation.reset();
  assert.equal(rotation.yaw, yaw);
  assert.equal(rotation.pitch, pitch);
  rotation.step(50);
  rotation.step(51);
  assert.ok(rotation.yaw > yaw);
  assert.ok(rotation.pitch < pitch);
  settle(rotation, 51);
  assert.equal(rotation.yaw, FRONT_YAW);
  assert.equal(rotation.pitch, 0);
});

test('reduced motion freezes ongoing momentum and keeps tracking direct', () => {
  const rotation = new BouquetRotation();
  flick(rotation);
  rotation.step(90);
  const { yaw, pitch } = rotation;
  rotation.setReducedMotion(true);
  assert.equal(rotation.step(100), false);
  assert.equal(rotation.yaw, yaw);
  assert.equal(rotation.pitch, pitch);

  rotation.grab(0, 0, 110);
  rotation.move(30, -20, 140, 0.01);
  near(rotation.yaw, yaw + 0.3);
  near(rotation.pitch, pitch - 0.2);
  rotation.release(140);
  assert.equal(rotation.step(155), false);
  rotation.reset();
  assert.equal(rotation.yaw, FRONT_YAW);
  assert.equal(rotation.pitch, 0);
  assert.equal(rotation.step(160), false);

  rotation.setReducedMotion(false);
  flick(rotation);
  assert.equal(rotation.step(60), true);
});

test('enabling reduced motion completes an ongoing Reset immediately', () => {
  const rotation = new BouquetRotation();
  rotation.nudge(1, 1);
  rotation.reset();
  rotation.step(0);
  rotation.step(70);
  assert.equal(rotation.moving, true);
  rotation.setReducedMotion(true);
  assert.equal(rotation.yaw, FRONT_YAW);
  assert.equal(rotation.pitch, 0);
  assert.equal(rotation.step(90), false);
});

test('stop cancels either pending drag or settling; keyboard nudges cancel settling instantly', () => {
  const rotation = new BouquetRotation();
  rotation.grab(0, 0, 10);
  rotation.move(40, 40, 25, 0.01);
  rotation.stop();
  const { yaw, pitch } = rotation;
  rotation.move(50, 50, 28, 0.01);
  rotation.release(30);
  assert.equal(rotation.step(50), false);
  assert.equal(rotation.yaw, yaw);
  assert.equal(rotation.pitch, pitch);

  flick(rotation);
  rotation.step(60);
  const liveYaw = rotation.yaw;
  const livePitch = rotation.pitch;
  rotation.nudge(-0.15, 0.15);
  near(rotation.yaw, liveYaw - 0.15);
  near(rotation.pitch, livePitch + 0.15);
  assert.equal(rotation.step(70), false);

  rotation.reset();
  rotation.step(80);
  rotation.step(90);
  const resettingYaw = rotation.yaw;
  const resettingPitch = rotation.pitch;
  rotation.stop();
  assert.equal(rotation.step(100), false);
  assert.equal(rotation.yaw, resettingYaw);
  assert.equal(rotation.pitch, resettingPitch);
});
