import * as THREE from 'three';

export type Vec3 = readonly [number, number, number];

/**
 * Collects colored triangles into one non-indexed geometry, so a whole model
 * with many colors costs a single draw call. Colors are hex sRGB strings.
 */
export class MeshBuilder {
  private readonly positions: number[] = [];
  private readonly colors: number[] = [];
  private readonly color = new THREE.Color();

  get triangleCount(): number {
    return this.positions.length / 9;
  }

  tri(a: Vec3, b: Vec3, c: Vec3, color: THREE.ColorRepresentation, shade = 1): this {
    this.color.set(color).multiplyScalar(shade);
    for (const v of [a, b, c]) {
      this.positions.push(v[0], v[1], v[2]);
      this.colors.push(this.color.r, this.color.g, this.color.b);
    }
    return this;
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, color: THREE.ColorRepresentation, shade = 1): this {
    return this.tri(a, b, c, color, shade).tri(a, c, d, color, shade);
  }

  /** Adds a primitive (box, cylinder…) in one color, moved by `matrix`. */
  add(geometry: THREE.BufferGeometry, color: THREE.ColorRepresentation, matrix?: THREE.Matrix4, shade = 1): this {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.getAttribute('position') as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    this.color.set(color).multiplyScalar(shade);
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      if (matrix) v.applyMatrix4(matrix);
      this.positions.push(v.x, v.y, v.z);
      this.colors.push(this.color.r, this.color.g, this.color.b);
    }
    if (source !== geometry) source.dispose();
    geometry.dispose();
    return this;
  }

  /** Adds a geometry that already has vertex colors (from another builder), moved by `matrix`. */
  addColored(geometry: THREE.BufferGeometry, matrix?: THREE.Matrix4): this {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.getAttribute('position') as THREE.BufferAttribute;
    const color = source.getAttribute('color') as THREE.BufferAttribute | undefined;
    const v = new THREE.Vector3();
    for (let i = 0; i < position.count; i++) {
      v.fromBufferAttribute(position, i);
      if (matrix) v.applyMatrix4(matrix);
      this.positions.push(v.x, v.y, v.z);
      this.colors.push(color ? color.getX(i) : 1, color ? color.getY(i) : 1, color ? color.getZ(i) : 1);
    }
    if (source !== geometry) source.dispose();
    return this;
  }

  build(): THREE.BufferGeometry {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    return geometry;
  }
}

const tmpMatrix = new THREE.Matrix4();
const tmpQuat = new THREE.Quaternion();
const tmpEuler = new THREE.Euler();

/** A transform from position, rotation (radians, XYZ) and scale. */
export function placed(
  position: Vec3,
  rotation: Vec3 = [0, 0, 0],
  scale: Vec3 | number = 1,
): THREE.Matrix4 {
  const s = typeof scale === 'number' ? [scale, scale, scale] : scale;
  tmpEuler.set(rotation[0], rotation[1], rotation[2]);
  tmpQuat.setFromEuler(tmpEuler);
  return tmpMatrix
    .clone()
    .compose(new THREE.Vector3(...position), tmpQuat, new THREE.Vector3(s[0], s[1], s[2]));
}

/** A flat-shaded material that uses the geometry's vertex colors. */
export function vertexColorMaterial(): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, side: THREE.DoubleSide });
}
