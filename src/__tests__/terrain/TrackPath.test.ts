import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { TrackPath } from '@/terrain/TrackPath';
import { TRACK_WIDTH_DEFAULT, TRACK_LATERAL_CLAMP } from '@/game/constants';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a simple straight-line TrackPath along the negative Z axis.
 * Total length will be approximately 200 m (the curve arc-length of a
 * straight Catmull-Rom spline through these three points).
 */
function makeStraightPath(): TrackPath {
  return new TrackPath([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -100),
    new THREE.Vector3(0, 0, -200),
  ]);
}

/**
 * Build a path with non-trivial curvature (XZ plane L-shape).
 */
function makeCurvedPath(): TrackPath {
  return new TrackPath([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(50, 0, -50),
    new THREE.Vector3(100, 0, -50),
    new THREE.Vector3(150, 0, 0),
  ]);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TrackPath', () => {
  describe('construction', () => {
    it('creates a path from at least two control points without throwing', () => {
      expect(() => {
        new TrackPath([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, 0, -100),
        ]);
      }).not.toThrow();
    });

    it('throws when fewer than 2 control points are provided', () => {
      expect(() => {
        new TrackPath([new THREE.Vector3(0, 0, 0)]);
      }).toThrow('TrackPath requires at least 2 control points');
    });

    it('throws when zero control points are provided', () => {
      expect(() => new TrackPath([])).toThrow(
        'TrackPath requires at least 2 control points',
      );
    });
  });

  describe('totalLength', () => {
    it('is positive for a normal path', () => {
      const path = makeStraightPath();
      expect(path.totalLength).toBeGreaterThan(0);
    });

    it('is in a reasonable range for a 200 m straight path', () => {
      const path = makeStraightPath();
      // CatmullRom arc-length for a straight 3-point path is ~200 m
      expect(path.totalLength).toBeGreaterThan(150);
      expect(path.totalLength).toBeLessThan(250);
    });

    it('is larger for a longer path', () => {
      const short = new TrackPath([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -50),
      ]);
      const long = new TrackPath([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 0, -500),
      ]);
      expect(long.totalLength).toBeGreaterThan(short.totalLength);
    });
  });

  describe('getPointAtDistance', () => {
    let path: TrackPath;

    beforeEach(() => {
      path = makeStraightPath();
    });

    it('returns a THREE.Vector3', () => {
      const point = path.getPointAtDistance(0);
      expect(point).toBeInstanceOf(THREE.Vector3);
    });

    it('point at distance 0 is near the start control point', () => {
      const point = path.getPointAtDistance(0);
      // Catmull-Rom starts at the first control point
      expect(point.x).toBeCloseTo(0, 1);
      expect(point.z).toBeCloseTo(0, 1);
    });

    it('point at totalLength is near the end control point', () => {
      const point = path.getPointAtDistance(path.totalLength);
      expect(point.x).toBeCloseTo(0, 1);
      expect(point.z).toBeCloseTo(-200, 1);
    });

    it('clamps negative distances to the start', () => {
      const atNeg = path.getPointAtDistance(-99);
      const atZero = path.getPointAtDistance(0);
      expect(atNeg.distanceTo(atZero)).toBeCloseTo(0, 4);
    });

    it('clamps distances beyond totalLength to the end', () => {
      const atOver = path.getPointAtDistance(path.totalLength + 500);
      const atEnd = path.getPointAtDistance(path.totalLength);
      expect(atOver.distanceTo(atEnd)).toBeCloseTo(0, 4);
    });

    it('intermediate points are between start and end on a straight path', () => {
      const mid = path.getPointAtDistance(path.totalLength / 2);
      // On a straight line the midpoint Z should be around -100
      expect(mid.z).toBeLessThan(0);
      expect(mid.z).toBeGreaterThan(-200);
    });
  });

  describe('getTangentAtDistance', () => {
    let path: TrackPath;

    beforeEach(() => {
      path = makeStraightPath();
    });

    it('returns a unit vector (length ≈ 1)', () => {
      const tangent = path.getTangentAtDistance(path.totalLength / 2);
      expect(tangent.length()).toBeCloseTo(1, 5);
    });

    it('is normalised', () => {
      const tangent = path.getTangentAtDistance(0);
      expect(tangent.length()).toBeCloseTo(1, 5);
    });

    it('points roughly in the -Z direction for a straight path along -Z', () => {
      const tangent = path.getTangentAtDistance(path.totalLength / 2);
      // For a path running from z=0 to z=-200, the forward direction is (0,0,-1)
      expect(tangent.z).toBeLessThan(-0.9);
    });
  });

  describe('getSlopeAtDistance', () => {
    it('returns zero slope for a flat horizontal path', () => {
      const path = makeStraightPath();
      const slope = path.getSlopeAtDistance(path.totalLength / 2);
      expect(slope).toBeCloseTo(0, 4);
    });

    it('returns a value in [-1, 1]', () => {
      const path = makeStraightPath();
      const slope = path.getSlopeAtDistance(path.totalLength / 2);
      expect(slope).toBeGreaterThanOrEqual(-1);
      expect(slope).toBeLessThanOrEqual(1);
    });

    it('returns positive slope for an uphill path', () => {
      const uphillPath = new TrackPath([
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0, 50, -100),
        new THREE.Vector3(0, 100, -200),
      ]);
      const slope = uphillPath.getSlopeAtDistance(uphillPath.totalLength / 2);
      expect(slope).toBeGreaterThan(0);
    });

    it('returns negative slope for a downhill path', () => {
      const downhillPath = new TrackPath([
        new THREE.Vector3(0, 100, 0),
        new THREE.Vector3(0, 50, -100),
        new THREE.Vector3(0, 0, -200),
      ]);
      const slope = downhillPath.getSlopeAtDistance(downhillPath.totalLength / 2);
      expect(slope).toBeLessThan(0);
    });
  });

  describe('progressToWorld', () => {
    let path: TrackPath;

    beforeEach(() => {
      path = makeStraightPath();
    });

    it('returns position, heading, and bankAngle', () => {
      const result = path.progressToWorld(0.5, 0);
      expect(result).toHaveProperty('position');
      expect(result).toHaveProperty('heading');
      expect(result).toHaveProperty('bankAngle');
    });

    it('progress 0 with zero lateral is near the track start', () => {
      const { position } = path.progressToWorld(0, 0);
      // Should be near (0, 0, 0)
      expect(position.x).toBeCloseTo(0, 1);
      expect(position.z).toBeCloseTo(0, 1);
    });

    it('progress 1 with zero lateral is near the track end', () => {
      const { position } = path.progressToWorld(1, 0);
      expect(position.x).toBeCloseTo(0, 1);
      expect(position.z).toBeCloseTo(-200, 1);
    });

    it('non-zero lateral offset shifts the position perpendicular to the track', () => {
      const centre = path.progressToWorld(0.5, 0).position;
      const right = path.progressToWorld(0.5, 3).position;
      const left = path.progressToWorld(0.5, -3).position;
      // On a path running along -Z, lateral offset shifts along X
      expect(right.x).not.toBeCloseTo(centre.x, 1);
      expect(left.x).not.toBeCloseTo(centre.x, 1);
      // Left and right should be roughly symmetric
      expect(right.x).toBeCloseTo(-left.x, 1);
    });

    it('heading is a finite number', () => {
      const { heading } = path.progressToWorld(0.5, 0);
      expect(isFinite(heading)).toBe(true);
    });

    it('clamps progress below 0 to 0', () => {
      const neg = path.progressToWorld(-1, 0).position;
      const zero = path.progressToWorld(0, 0).position;
      expect(neg.distanceTo(zero)).toBeCloseTo(0, 4);
    });

    it('clamps progress above 1 to 1', () => {
      const over = path.progressToWorld(2, 0).position;
      const one = path.progressToWorld(1, 0).position;
      expect(over.distanceTo(one)).toBeCloseTo(0, 4);
    });
  });

  describe('getWidthAtDistance', () => {
    it('returns the default track width', () => {
      const path = makeStraightPath();
      expect(path.getWidthAtDistance(0)).toBe(TRACK_WIDTH_DEFAULT);
      expect(path.getWidthAtDistance(100)).toBe(TRACK_WIDTH_DEFAULT);
    });
  });

  describe('lateralClamp', () => {
    it('equals TRACK_LATERAL_CLAMP constant', () => {
      const path = makeStraightPath();
      expect(path.lateralClamp).toBe(TRACK_LATERAL_CLAMP);
    });
  });

  describe('getSampledPoints', () => {
    let path: TrackPath;

    beforeEach(() => {
      path = makeStraightPath();
    });

    it('returns segments + 1 points', () => {
      const points = path.getSampledPoints(10);
      expect(points).toHaveLength(11);
    });

    it('first sampled point is near the start', () => {
      const points = path.getSampledPoints(10);
      expect(points[0]!.z).toBeCloseTo(0, 1);
    });

    it('last sampled point is near the end', () => {
      const points = path.getSampledPoints(10);
      expect(points[10]!.z).toBeCloseTo(-200, 1);
    });
  });

  describe('curved path sanity checks', () => {
    it('does not produce NaN positions', () => {
      const path = makeCurvedPath();
      for (let i = 0; i <= 10; i++) {
        const { position } = path.progressToWorld(i / 10, 0);
        expect(isNaN(position.x)).toBe(false);
        expect(isNaN(position.y)).toBe(false);
        expect(isNaN(position.z)).toBe(false);
      }
    });

    it('does not produce NaN headings', () => {
      const path = makeCurvedPath();
      for (let i = 0; i <= 10; i++) {
        const { heading } = path.progressToWorld(i / 10, 0);
        expect(isNaN(heading)).toBe(false);
      }
    });
  });
});
