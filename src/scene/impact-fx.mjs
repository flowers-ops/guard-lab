import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// A bounded, reusable pool. Bursts never allocate meshes or affect game state.
export class ImpactParticles {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);
    this.dummy = new THREE.Object3D();
    this.clock = 0;
    this.cursor = 0;
    this.stainCursor = 0;
    this.records = Array.from({ length: 64 }, () => ({
      active: false,
      start: new THREE.Vector3(),
      velocity: new THREE.Vector3(),
      age: 0,
      life: 0,
      size: 0,
      blood: false,
    }));
    const geometry = new THREE.SphereGeometry(1, 6, 4);
    this.blood = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshStandardMaterial({
        color: '#68241e',
        roughness: 0.55,
        metalness: 0.08,
      }),
      64,
    );
    this.sparks = new THREE.InstancedMesh(
      geometry,
      new THREE.MeshBasicMaterial({ color: '#ffd4a0' }),
      64,
    );
    this.stains = new THREE.InstancedMesh(
      new THREE.CircleGeometry(1, 9),
      new THREE.MeshBasicMaterial({
        color: '#57201c',
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
      }),
      48,
    );
    for (const mesh of [this.blood, this.sparks, this.stains]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(mesh);
    }
    this.reset();
  }
  reset() {
    this.dummy.scale.setScalar(0);
    this.dummy.updateMatrix();
    for (const mesh of [this.blood, this.sparks, this.stains]) {
      for (let i = 0; i < mesh.count; i++) mesh.setMatrixAt(i, this.dummy.matrix);
      mesh.instanceMatrix.needsUpdate = true;
    }
    this.records.forEach((p) => {
      p.active = false;
    });
    this.cursor = this.stainCursor = 0;
  }
  burst(origin, direction, { blood = false, count = 16, strength = 1 } = {}) {
    for (let k = 0; k < count; k++) {
      const p = this.records[this.cursor++ % this.records.length];
      p.active = true;
      p.blood = blood;
      p.age = 0;
      p.start.copy(origin);
      p.velocity
        .set(Math.sin(k * 13.17) * 0.8, 0.6 + (k % 5) * 0.2, Math.cos(k * 7.43) * 0.8)
        .addScaledVector(direction, blood ? 0.8 : 1.4)
        .multiplyScalar(strength);
      p.life = blood ? 1.1 : 0.45 + (k % 4) * 0.09;
      p.size = blood ? 0.013 + (k % 3) * 0.004 : 0.009;
    }
  }
  update(seconds) {
    const d = this.dummy;
    for (let i = 0; i < this.records.length; i++) {
      const p = this.records[i];
      d.scale.setScalar(0);
      d.updateMatrix();
      this.blood.setMatrixAt(i, d.matrix);
      this.sparks.setMatrixAt(i, d.matrix);
      if (!p.active) continue;
      p.age += seconds;
      d.position.copy(p.start).addScaledVector(p.velocity, p.age);
      d.position.y -= 4.905 * p.age * p.age;
      d.position.x = THREE.MathUtils.clamp(d.position.x, -3.02, 3.02);
      d.position.z = THREE.MathUtils.clamp(d.position.z, -3.45, 3.45);
      if (p.age >= p.life || d.position.y <= 0.018) {
        p.active = false;
        if (p.blood && d.position.y <= 0.018) {
          d.position.y = 0.012;
          d.rotation.set(-Math.PI / 2, 0, i * 2.4);
          d.scale.set(p.size * 2.5, p.size * 1.6, 1);
          d.updateMatrix();
          this.stains.setMatrixAt(this.stainCursor++ % 48, d.matrix);
          this.stains.instanceMatrix.needsUpdate = true;
        }
        continue;
      }
      d.rotation.set(p.age * 5, p.age * 3, 0);
      d.scale.set(p.size, p.size * (p.blood ? 1.5 : 2.5), p.size);
      d.updateMatrix();
      (p.blood ? this.blood : this.sparks).setMatrixAt(i, d.matrix);
    }
    this.blood.instanceMatrix.needsUpdate = this.sparks.instanceMatrix.needsUpdate = true;
  }
  dispose() {
    this.group.removeFromParent();
    for (const mesh of [this.blood, this.sparks, this.stains]) mesh.material.dispose();
    this.blood.geometry.dispose();
    this.stains.geometry.dispose();
  }
}

export function cinematicPass() {
  return new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      impact: { value: 0 },
      flash: { value: 0 },
      tint: { value: new THREE.Vector3(1, 0.78, 0.5) },
    },
    vertexShader:
      'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float impact; uniform float flash; uniform vec3 tint;
      varying vec2 vUv;
      void main(){
        vec2 center=vUv-.5;
        vec2 offset=center*impact*.006;
        vec3 color=texture2D(tDiffuse,vUv).rgb;
        color.r=texture2D(tDiffuse,clamp(vUv+offset,vec2(0.),vec2(1.))).r;
        color.b=texture2D(tDiffuse,clamp(vUv-offset,vec2(0.),vec2(1.))).b;
        color*=1.-smoothstep(.12,.7,dot(center,center))*.14;
        color+=tint*flash*.32;
        gl_FragColor=vec4(color,1.);
      }`,
  });
}
