import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, PerspectiveCamera, Mesh, PlaneGeometry, MeshBasicMaterial, Sprite } from 'three';
import { ContactShadows } from '../src/scene/contact-shadows.mjs';
import { springExtension } from '../src/scene/motion.mjs';

test('contact shadows exclude transparent labels and particles without revealing hidden objects', () => {
  const scene = new Scene();
  const label = new Mesh(new PlaneGeometry(), new MeshBasicMaterial({ transparent: true }));
  const hidden = label.clone();
  hidden.visible = false;
  const solid = new Mesh(new PlaneGeometry(), new MeshBasicMaterial());
  const particle = new Sprite();
  scene.add(label, hidden, solid, particle);
  const pass = new ContactShadows(scene, new PerspectiveCamera());
  pass._overrideVisibility();
  assert.equal(label.visible, false);
  assert.equal(particle.visible, false);
  assert.equal(solid.visible, true);
  pass._restoreVisibility();
  assert.equal(label.visible, true);
  assert.equal(particle.visible, true);
  assert.equal(hidden.visible, false);
  pass.dispose();
  label.geometry.dispose();
  label.material.dispose();
  solid.geometry.dispose();
  solid.material.dispose();
  particle.material.dispose();
});

test('the spring rebound never exceeds the contact point or retracts behind its mount', () => {
  for (let i = 0; i <= 1000; i++) {
    const value = springExtension(i / 1000);
    assert.ok(value >= 0 && value <= 1);
  }
  assert.equal(springExtension(0), 0);
  assert.equal(springExtension(0.43), 1);
  assert.equal(springExtension(0.8), 0);
  assert.equal(springExtension(1), 0);
});
