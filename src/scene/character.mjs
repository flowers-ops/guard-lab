import { Group, SphereGeometry } from 'three';

// Cosmetic details are shared by both roles. Nothing on the uniform discloses
// credentials, inventory or intent. Keep details within the existing body rig.
export function characterDetails({ head, torso, mat, mesh, box, sphere, sign }) {
  const hair = mat('#302a27', { roughness: 0.96 });
  const ink = mat('#242b2d', { roughness: 0.9 });
  const ivory = mat('#d5d6be', { roughness: 0.92 });
  const trim = mat('#829596', { roughness: 0.92 });
  const brass = mat('#c9a36b', { roughness: 0.65, metalness: 0.25 });
  const blush = mat('#bd8670', { roughness: 0.9 });
  const skin = mat('#bc947a', { roughness: 0.95 });
  mesh(
    new SphereGeometry(0.207, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.5),
    hair,
    head,
    [0, 0.04, -0.01],
  );
  const maleHair = new Group(),
    femaleHair = new Group();
  head.add(maleHair, femaleHair);
  const quiff = sphere(0.105, hair, maleHair, [-0.045, 0.182, 0.072]);
  quiff.scale.set(1.25, 0.62, 0.95);
  quiff.rotation.z = -0.18;
  const fringe = sphere(0.083, hair, maleHair, [0.074, 0.117, 0.128]);
  fringe.scale.set(0.8, 0.45, 0.6);
  box(0.33, 0.29, 0.14, hair, femaleHair, [0, -0.005, -0.135], 0.066);
  for (const side of [-1, 1]) {
    const strand = box(0.085, 0.235, 0.115, hair, femaleHair, [side * 0.167, -0.008, -0.013], 0.04);
    strand.rotation.z = side * 0.08;
    const ear = sphere(0.034, skin, head, [side * 0.194, -0.015, 0]);
    ear.scale.set(0.7, 1, 0.65);
    const eye = sphere(0.031, ivory, head, [side * 0.069, 0.023, 0.179]);
    eye.scale.set(0.83, 1.08, 0.47);
    const pupil = sphere(0.014, ink, head, [side * 0.067, 0.024, 0.193]);
    pupil.scale.z = 0.6;
    const brow = box(0.057, 0.013, 0.017, hair, head, [side * 0.07, 0.078, 0.18], 0.005);
    brow.rotation.z = side === -1 ? -0.08 : 0.2;
    const cheek = sphere(0.032, blush, head, [side * 0.118, -0.057, 0.154]);
    cheek.scale.set(1, 0.48, 0.27);
  }
  const bun = sphere(0.077, hair, femaleHair, [0, 0.11, -0.227]);
  bun.scale.set(1, 0.9, 0.85);
  box(0.076, 0.02, 0.05, brass, femaleHair, [0, 0.12, -0.279], 0.009);
  const sweep = sphere(0.085, hair, femaleHair, [-0.075, 0.122, 0.108]);
  sweep.scale.set(1.14, 0.55, 0.7);
  sphere(0.026, skin, head, [0.004, -0.025, 0.199]);
  const mouth = new Group();
  mouth.position.set(0.008, -0.105, 0.167);
  head.add(mouth);
  box(0.064, 0.01, 0.014, ink, mouth, [0, 0, 0], 0.004);
  for (const side of [-1, 1]) {
    const smile = box(0.022, 0.01, 0.014, ink, mouth, [side * 0.034, 0.005, -0.003], 0.004);
    smile.rotation.z = side * 0.4;
    const collar = box(0.09, 0.075, 0.027, ivory, torso, [side * 0.057, 0.213, 0.153], 0.014);
    collar.rotation.z = side * 0.42;
    box(0.095, 0.125, 0.024, trim, torso, [side * 0.122, -0.033, 0.158], 0.018);
    box(0.103, 0.018, 0.027, ivory, torso, [side * 0.122, 0.021, 0.171], 0.007);
  }
  const tie = box(0.039, 0.151, 0.022, brass, torso, [0.01, 0.095, 0.17], 0.012);
  tie.rotation.z = -0.13;
  box(0.044, 0.039, 0.029, brass, torso, [0, 0.182, 0.174], 0.012);
  box(0.065, 0.055, 0.028, ivory, torso, [-0.125, 0.139, 0.164], 0.009);
  sign('STAFF', 0.057, 0.022, '#35464a', torso, [-0.125, 0.139, 0.18]);
  const pen = box(0.013, 0.075, 0.019, brass, torso, [0.14, 0.061, 0.17], 0.004);
  pen.rotation.z = -0.12;
  box(0.407, 0.039, 0.326, ink, torso, [0, -0.252, 0], 0.011);
  box(0.055, 0.047, 0.025, brass, torso, [0, -0.252, 0.174], 0.008);
  for (const y of [-0.105, -0.17]) sphere(0.01, ivory, torso, [0, y, 0.167]);
  return { maleHair, femaleHair, mouth, trim, ivory };
}
