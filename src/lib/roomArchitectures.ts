import * as THREE from 'three';

// Procedural Scarlet Salon Architecture
export function createScarletSalonArchitecture(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'scarletSalonArchitecture';

  const scarletMat = new THREE.MeshStandardMaterial({
    color: 0x3d0f17,
    roughness: 0.85,
    metalness: 0.15,
  });

  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xd4af37,
    roughness: 0.35,
    metalness: 0.75,
  });

  // Back Wall in rich scarlet
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(36, 12), scarletMat);
  backWall.position.set(0, 6, -6.48);
  backWall.receiveShadow = true;
  group.add(backWall);

  // Side walls
  const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(36, 12), scarletMat);
  leftWall.position.set(-9.98, 6, 0);
  leftWall.rotation.y = Math.PI / 2;
  leftWall.receiveShadow = true;
  group.add(leftWall);

  const rightWall = new THREE.Mesh(new THREE.PlaneGeometry(36, 12), scarletMat);
  rightWall.position.set(9.98, 6, 0);
  rightWall.rotation.y = -Math.PI / 2;
  rightWall.receiveShadow = true;
  group.add(rightWall);

  // Classical architectural molding frames on back wall
  for (let i = -3; i <= 3; i++) {
    const molding = new THREE.Mesh(new THREE.BoxGeometry(1.8, 3.6, 0.04), goldMat);
    molding.position.set(i * 2.8, 5.0, -6.44);
    molding.castShadow = true;
    group.add(molding);
  }

  // Classical Columns
  for (const x of [-6.5, 6.5]) {
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.38, 11.5, 24), goldMat);
    column.position.set(x, 5.75, -6.2);
    column.castShadow = true;
    group.add(column);
  }

  return group;
}

// Procedural Concrete Loft Architecture
export function createLoftArchitecture(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'loftArchitecture';

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x27292e,
    roughness: 0.95,
    metalness: 0.1,
  });

  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x121316,
    roughness: 0.5,
    metalness: 0.6,
  });

  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x3d4b60,
    roughness: 0.1,
    metalness: 0.4,
  });

  // Back Wall with huge industrial grid window
  const backWall = new THREE.Mesh(new THREE.PlaneGeometry(36, 12), concreteMat);
  backWall.position.set(0, 6, -6.48);
  backWall.receiveShadow = true;
  group.add(backWall);

  // Industrial Window
  const windowGlass = new THREE.Mesh(new THREE.PlaneGeometry(10.5, 6.5), glassMat);
  windowGlass.position.set(0, 6.0, -6.44);
  group.add(windowGlass);

  // Black Iron Window Grid
  for (let i = -3; i <= 3; i++) {
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.06, 6.5, 0.08), steelMat);
    vBar.position.set(i * 1.5, 6.0, -6.42);
    group.add(vBar);
  }
  for (let j = -2; j <= 2; j++) {
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.06, 0.08), steelMat);
    hBar.position.set(0, 6.0 + j * 1.2, -6.42);
    group.add(hBar);
  }

  // Steel Pillars
  for (const x of [-7.5, 7.5]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 11.5, 0.45), steelMat);
    pillar.position.set(x, 5.75, -6.2);
    pillar.castShadow = true;
    group.add(pillar);
  }

  return group;
}
