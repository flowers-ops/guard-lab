import {
  Group,
  SphereGeometry,
  CapsuleGeometry,
  LatheGeometry,
  Vector2,
  InstancedMesh,
  Matrix4,
  Quaternion,
  Vector3,
  Euler,
  TorusGeometry,
  BufferGeometry,
  Float32BufferAttribute,
  CatmullRomCurve3,
  TubeGeometry,
} from 'three';

function hairShell(female) {
  const positions = [],
    indices = [],
    rows = 18,
    columns = 40;
  for (let row = 0; row <= rows; row++)
    for (let column = 0; column <= columns; column++) {
      const phi = (column / columns) * Math.PI * 2,
        front = Math.max(0, Math.cos(phi));
      const edge =
        1.5 -
        0.36 * front +
        0.38 * Math.max(0, -Math.cos(phi)) +
        (female ? 0.025 * Math.sin(phi * 2) : 0.085 * Math.sin(phi)) * front;
      const theta = (row / rows) * edge;
      const rim = row === rows ? 0.94 : 1;
      positions.push(
        0.187 * Math.sin(phi) * Math.sin(theta) * rim,
        0.211 * Math.cos(theta) * rim + 0.012,
        0.169 * Math.cos(phi) * Math.sin(theta) * rim - 0.007,
      );
      if (row < rows && column < columns) {
        const a = row * (columns + 1) + column,
          b = a + columns + 1;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}
function sweptLock(points, radius, material, parent, mesh, taper = 0.7) {
  const curve = new CatmullRomCurve3(points.map((p) => new Vector3(...p)));
  const segments = 18,
    radial = 8,
    geometry = new TubeGeometry(curve, segments, radius, radial, false);
  const position = geometry.attributes.position;
  for (let i = 0; i <= segments; i++) {
    const center = curve.getPointAt(i / segments),
      scale = 1 - taper * (i / segments) ** 2;
    for (let j = 0; j <= radial; j++) {
      const at = i * (radial + 1) + j;
      position.setXYZ(
        at,
        center.x + (position.getX(at) - center.x) * scale,
        center.y + (position.getY(at) - center.y) * scale,
        center.z + (position.getZ(at) - center.z) * scale,
      );
    }
  }
  geometry.computeVertexNormals();
  return mesh(geometry, material, parent);
}

// Cosmetic only: both roles wear the same uniform and carry the same badge.
export function characterDetails({ head, torso, mat, mesh, box, sphere, sign }) {
  const hair = mat('#352c28', { roughness: 0.92 });
  const ink = mat('#263034', { roughness: 0.95 });
  const ivory = mat('#d6d3bf', { roughness: 0.95 });
  const trim = mat('#657783', { roughness: 0.98 });
  const brass = mat('#c5a574', { roughness: 0.65, metalness: 0.18 });
  const skin = mat('#bc947a', { roughness: 0.95 });
  const maleHair = new Group(),
    femaleHair = new Group(),
    braids = [];
  head.add(maleHair, femaleHair);
  mesh(hairShell(false), hair, maleHair);
  mesh(hairShell(true), hair, femaleHair);
  const ridge = mat('#40342e', { roughness: 0.94 });
  for (let i = 0; i < 5; i++)
    sweptLock(
      [
        [0.042, 0.215 - i * 0.004, -0.014 + i * 0.011],
        [-0.014 - i * 0.008, 0.211 - i * 0.012, 0.063 + i * 0.012],
        [-0.078 - i * 0.009, 0.173 - i * 0.011, 0.09 + i * 0.011],
        [-0.131 - i * 0.003, 0.095 - i * 0.006, 0.091 + i * 0.004],
      ],
      i === 2 ? 0.014 : 0.006,
      i === 2 ? hair : ridge,
      maleHair,
      mesh,
      0.75,
    );
  for (const side of [-1, 1]) {
    sweptLock(
      [
        [side * 0.07, 0.177, 0.104],
        [side * 0.104, 0.136, 0.116],
        [side * 0.143, 0.082, 0.1],
        [side * 0.167, 0.018, 0.051],
      ],
      0.012,
      hair,
      femaleHair,
      mesh,
      0.7,
    );
    for (let i = 0; i < 3; i++)
      sweptLock(
        [
          [side * 0.024, 0.214 - i * 0.008, 0.018 - i * 0.013],
          [side * 0.111, 0.187 - i * 0.012, -0.008 - i * 0.021],
          [side * 0.174, 0.148, -0.061],
        ],
        0.005,
        ridge,
        femaleHair,
        mesh,
      );
    const braid = new Group();
    braid.position.set(side * 0.166, 0.155, -0.09);
    femaleHair.add(braid);
    braids.push({ group: braid, side });
    const base = sphere(0.062, hair, braid, [side * 0.025, 0, 0]);
    base.scale.set(0.88, 1.05, 0.9);
    const tie = mesh(new TorusGeometry(0.048, 0.006, 6, 16), brass, braid, [
      side * 0.029,
      -0.023,
      -0.014,
    ]);
    tie.rotation.x = Math.PI / 2;
    const woven = new InstancedMesh(new SphereGeometry(0.037, 12, 8), hair, 24);
    woven.castShadow = woven.receiveShadow = true;
    braid.add(woven);
    for (let i = 0; i < 12; i++)
      for (let lane = 0; lane < 2; lane++) {
        const phase = i * Math.PI + lane * Math.PI;
        const matrix = new Matrix4().compose(
          new Vector3(
            side * (0.033 + Math.min(i, 5) * 0.011) + Math.cos(phase) * 0.017,
            -0.043 - i * 0.056,
            -Math.min(i, 4) * 0.032,
          ),
          new Quaternion().setFromEuler(new Euler(0, 0, Math.cos(phase) * 0.42)),
          new Vector3(0.79 - i * 0.014, 1.16, 0.8 - i * 0.012),
        );
        woven.setMatrixAt(i * 2 + lane, matrix);
      }
    const band = mesh(new TorusGeometry(0.027, 0.006, 6, 16), brass, braid, [
      side * 0.088,
      -0.702,
      -0.128,
    ]);
    band.rotation.x = Math.PI / 2;
    const tip = sphere(0.036, hair, braid, [side * 0.088, -0.745, -0.127]);
    tip.scale.set(0.78, 1.4, 0.78);
    const ear = sphere(0.032, skin, head, [side * 0.177, -0.014, 0]);
    ear.scale.set(0.64, 1.1, 0.65);
    const eye = sphere(0.018, ink, head, [side * 0.063, 0.025, 0.151]);
    eye.scale.set(0.76, 1.04, 0.35);
    const pupil = sphere(0.0045, ivory, head, [side * 0.063 - 0.003, 0.03, 0.158]);
    pupil.scale.z = 0.4;
    const brow = box(0.046, 0.01, 0.012, hair, head, [side * 0.064, 0.072, 0.143], 0.004);
    brow.rotation.z = -side * 0.09;
  }
  const nose = sphere(0.022, skin, head, [0, -0.024, 0.159]);
  nose.scale.set(0.75, 0.85, 0.85);
  const mouth = new Group();
  mouth.position.set(0, -0.089, 0.139);
  head.add(mouth);
  box(0.048, 0.007, 0.009, ink, mouth, [0, 0, 0], 0.003);
  for (const side of [-1, 1]) {
    const smile = box(0.016, 0.007, 0.009, ink, mouth, [side * 0.025, 0.003, -0.002], 0.003);
    smile.rotation.z = side * 0.32;
    const collar = box(0.091, 0.089, 0.022, trim, torso, [side * 0.053, 0.207, 0.138], 0.014);
    collar.rotation.z = side * 0.46;
    box(0.094, 0.104, 0.012, trim, torso, [side * 0.108, -0.011, 0.153], 0.012);
    box(0.096, 0.024, 0.019, trim, torso, [side * 0.108, 0.041, 0.161], 0.007);
    sphere(0.006, ivory, torso, [side * 0.108, 0.041, 0.172]);
  }
  box(0.038, 0.177, 0.018, ink, torso, [0, 0.074, 0.162], 0.008);
  box(0.043, 0.031, 0.024, ink, torso, [0, 0.181, 0.153], 0.009);
  box(0.062, 0.025, 0.016, brass, torso, [-0.111, 0.12, 0.155], 0.005);
  sign('STAFF', 0.044, 0.014, '#3b423f', torso, [-0.111, 0.12, 0.166]);
  box(0.365, 0.034, 0.287, ink, torso, [0, -0.253, 0], 0.01);
  box(0.046, 0.039, 0.015, brass, torso, [0, -0.253, 0.151], 0.007);
  for (const y of [-0.082, -0.144]) sphere(0.006, ivory, torso, [0, y, 0.158]);
  return { maleHair, femaleHair, braids, mouth, trim, ivory };
}

export function createPlayerRig({ mat, mesh, box, sphere, cylinder, sign, uniform, skin }) {
  const human = new Group(),
    humanBody = new Group();
  humanBody.position.y = 0.75;
  human.add(humanBody);
  const shirt = new LatheGeometry(
    [
      new Vector2(0, -0.27),
      new Vector2(0.82, -0.27),
      new Vector2(0.92, -0.23),
      new Vector2(0.98, -0.02),
      new Vector2(1, 0.17),
      new Vector2(0.82, 0.24),
      new Vector2(0.36, 0.285),
      new Vector2(0, 0.285),
    ],
    32,
  );
  shirt.scale(0.218, 1, 0.155);
  const humanTorso = mesh(shirt, uniform, humanBody, [0, 0.245, 0]);
  cylinder(0.052, 0.057, 0.105, skin, humanBody, [0, 0.568, 0]);
  const humanHead = new Group();
  humanHead.position.set(0, 0.739, 0);
  humanBody.add(humanHead);
  const face = sphere(0.18, skin, humanHead, [0, 0, 0]);
  face.scale.set(0.98, 1.12, 0.87);
  const details = characterDetails({
    head: humanHead,
    torso: humanTorso,
    mat,
    mesh,
    box,
    sphere,
    sign,
  });
  function arm(x) {
    const arm = new Group(),
      elbow = new Group(),
      hand = new Group();
    arm.position.set(x, 0.455, 0);
    humanBody.add(arm);
    sphere(0.075, uniform, arm, [0, -0.025, 0]);
    mesh(new CapsuleGeometry(0.067, 0.146, 5, 16), uniform, arm, [0, -0.135, 0]);
    elbow.position.y = -0.27;
    arm.add(elbow);
    sphere(0.06, uniform, elbow, [0, 0, 0]);
    mesh(new CapsuleGeometry(0.059, 0.141, 5, 16), uniform, elbow, [0, -0.127, 0]);
    cylinder(0.062, 0.062, 0.038, details.trim, elbow, [0, -0.231, 0]);
    hand.position.y = -0.27;
    elbow.add(hand);
    const palm = sphere(0.057, skin, hand, [0, -0.012, 0]);
    palm.scale.set(0.85, 1.2, 0.76);
    sphere(0.024, skin, hand, [Math.sign(x) * -0.046, -0.008, 0.015]);
    return { arm, elbow, hand };
  }
  const humanLeft = arm(-0.252),
    humanRight = arm(0.252);
  const trousers = mat('#252c31', { roughness: 0.98 }),
    shoe = mat('#222829', { roughness: 0.63 });
  box(0.34, 0.14, 0.25, trousers, humanBody, [0, -0.06, -0.005], 0.045);
  const legs = [],
    knees = [],
    feet = [];
  for (const x of [-0.108, 0.108]) {
    const leg = new Group(),
      knee = new Group(),
      foot = new Group();
    leg.position.set(x, 0.75, 0);
    human.add(leg);
    box(0.157, 0.34, 0.172, trousers, leg, [0, -0.17, 0], 0.04);
    knee.position.y = -0.34;
    leg.add(knee);
    sphere(0.073, trousers, knee, [0, 0, 0]);
    box(0.145, 0.35, 0.159, trousers, knee, [0, -0.175, 0], 0.033);
    foot.position.set(0, -0.35, 0);
    knee.add(foot);
    box(0.16, 0.093, 0.252, shoe, foot, [0, -0.005, 0.035], 0.035);
    box(0.164, 0.021, 0.252, trousers, foot, [0, -0.044, 0.035], 0.009);
    box(0.083, 0.008, 0.052, details.trim, foot, [0, 0.043, 0.053], 0.003);
    legs.push(leg);
    knees.push(knee);
    feet.push(foot);
  }
  return {
    human,
    humanBody,
    humanTorso,
    humanHead,
    humanLeft,
    humanRight,
    legs,
    knees,
    feet,
    details,
  };
}
