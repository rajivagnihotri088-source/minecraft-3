
import * as THREE from
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const $ = id => document.getElementById(id);

try {
  // SCENE
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87ceeb);
  scene.fog = new THREE.Fog(0x87ceeb, 35, 85);

  const camera = new THREE.PerspectiveCamera(
    75, innerWidth / innerHeight, 0.1, 180
  );
  camera.rotation.order = 'YXZ';

  const renderer = new THREE.WebGLRenderer({ antialias: false });
  renderer.setSize(innerWidth, innerHeight);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x647248, 2));

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(20, 40, 15);
  scene.add(sun);

  // BLOCK MATERIALS
  const colors = {
    grass: 0x55ae37,
    dirt: 0x87512f,
    stone: 0x858585,
    wood: 0x79502c,
    leaves: 0x267a2a,
    bedrock: 0x292929,
    coal: 0x30343a,
    iron: 0xd4bba5,
    gold: 0xffd33d,
    diamond: 0x38eee5,
    copper: 0xc87545,
    redstone: 0xb51d26,
    lapis: 0x2454d8
  };

  const materials = {};
  for (const [name, color] of Object.entries(colors)) {
    materials[name] = new THREE.MeshLambertMaterial({ color });
  }

  const cube = new THREE.BoxGeometry(1, 1, 1);
  const blocks = new Map();
  const chunks = new Map();
  const chunkSize = 12;
  const renderDistance = 1;

  const key = (x, y, z) => `${x},${y},${z}`;
  const chunkKey = (cx, cz) => `${cx},${cz}`;

  // DETERMINISTIC RANDOM NUMBERS
  function hash(x, y = 0, z = 0) {
    let n = Math.imul(x | 0, 374761393);
    n = (n + Math.imul(y | 0, 668265263)) | 0;
    n = (n + Math.imul(z | 0, 1442695041)) | 0;
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return (n ^ (n >>> 16)) >>> 0;
  }

  function terrainHeight(x, z) {
    return Math.floor(
      2 +
      Math.sin(x * 0.13) * 1.6 +
      Math.cos(z * 0.16) * 1.4 +
      Math.sin((x + z) * 0.09) * 1.2
    );
  }

  function addBlock(x, y, z, type, owner) {
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);

    const k = key(x, y, z);
    if (blocks.has(k)) return;

    const cx = Math.floor(x / chunkSize);
    const cz = Math.floor(z / chunkSize);
    const chunkId = owner || chunkKey(cx, cz);

    if (!chunks.has(chunkId)) {
      chunks.set(chunkId, new Set());
    }

    const mesh = new THREE.Mesh(cube, materials[type]);
    mesh.position.set(x, y, z);
    mesh.userData = { x, y, z, type, chunkId };

    scene.add(mesh);
    blocks.set(k, mesh);
    chunks.get(chunkId).add(k);
  }

  function removeBlock(mesh) {
    const { x, y, z, chunkId } = mesh.userData;
    scene.remove(mesh);
    blocks.delete(key(x, y, z));

    const set = chunks.get(chunkId);
    if (set) set.delete(key(x, y, z));
  }

  // SEVEN ORE TYPES
  function oreType(x, y, z) {
    const r = hash(x, y, z) % 1000;

    if (y <= -5 && r < 20) return 'diamond';
    if (y <= -3 && r < 55) return 'redstone';
    if (y <= -2 && r < 85) return 'lapis';
    if (r < 120) return 'coal';
    if (r < 155) return 'iron';
    if (r < 180) return 'copper';
    if (y <= 0 && r < 195) return 'gold';

    return 'stone';
  }

  // TREES: TRUNKS AND LEAF CANOPIES
  function makeTree(x, z, owner) {
    const h = terrainHeight(x, z);
    const trunkHeight = 4 + (hash(x, 3, z) % 3);

    for (let y = 1; y <= trunkHeight; y++) {
      addBlock(x, h + y, z, 'wood', owner);
    }

    for (let dy = trunkHeight - 1; dy <= trunkHeight + 2; dy++) {
      const radius = dy === trunkHeight + 2 ? 1 : 2;

      for (let dx = -radius; dx <= radius; dx++) {
        for (let dz = -radius; dz <= radius; dz++) {
          if (Math.abs(dx) === radius &&
              Math.abs(dz) === radius &&
              dy !== trunkHeight + 2) continue;

          if (dx === 0 && dz === 0 && dy <= trunkHeight) continue;

          addBlock(x + dx, h + dy, z + dz, 'leaves', owner);
        }
      }
    }
  }

  // INFINITE CHUNK GENERATION
  function generateChunk(cx, cz) {
    const id = chunkKey(cx, cz);
    if (chunks.has(id)) return;

    chunks.set(id, new Set());

    const startX = cx * chunkSize;
    const startZ = cz * chunkSize;

    for (let lx = 0; lx < chunkSize; lx++) {
      for (let lz = 0; lz < chunkSize; lz++) {
        const x = startX + lx;
        const z = startZ + lz;
        const h = terrainHeight(x, z);

        // Underground, ores and bedrock
        addBlock(x, -9, z, 'bedrock', id);

        for (let y = -8; y < h; y++) {
          let type;

          if (y >= h - 3) {
            type = 'dirt';
          } else {
            type = oreType(x, y, z);
          }

          addBlock(x, y, z, type, id);
        }

        addBlock(x, h, z, 'grass', id);

        // Plenty of trees, deterministically distributed
        if (
          (hash(x, 71, z) % 100) < 5 &&
          (hash(x, 72, z) % 100) > 12
        ) {
          makeTree(x, z, id);
        }
      }
    }
  }

  function unloadChunk(id) {
    const set = chunks.get(id);
    if (!set) return;

    for (const k of set) {
      const mesh = blocks.get(k);
      if (mesh) {
        scene.remove(mesh);
        blocks.delete(k);
      }
    }

    chunks.delete(id);
  }

  function updateChunks() {
    const cx = Math.floor(camera.position.x / chunkSize);
    const cz = Math.floor(camera.position.z / chunkSize);

    // Load the surrounding nine chunks
    for (let dx = -renderDistance; dx <= renderDistance; dx++) {
      for (let dz = -renderDistance; dz <= renderDistance; dz++) {
        generateChunk(cx + dx, cz + dz);
      }
    }

    // Remove distant chunks to limit memory usage
    for (const id of [...chunks.keys()]) {
      const [x, z] = id.split(',').map(Number);

      if (
        Math.abs(x - cx) > renderDistance ||
        Math.abs(z - cz) > renderDistance
      ) {
        unloadChunk(id);
      }
    }
  }

  // PLAYER SPAWNS WITH IRON EQUIPMENT
  const tools = [
    'Iron Pickaxe',
    'Iron Axe',
    'Iron Sword',
    'Iron Shovel',
    'Iron Hoe'
  ];

  const armor = [
    'Iron Helmet',
    'Iron Chestplate',
    'Iron Leggings',
    'Iron Boots'
  ];

  const inventory = {
    grass: 32,
    dirt: 32,
    stone: 16,
    wood: 16,
    leaves: 16,
    coal: 0,
    iron: 0,
    gold: 0,
    diamond: 0,
    copper: 0,
    redstone: 0,
    lapis: 0
  };

  let selectedBlock = 'grass';
  let yaw = 0;
  let pitch = 0;
  let locked = false;
  let velocityY = 0;
  let onGround = false;

  camera.position.set(0, terrainHeight(0, 0) + 2.2, 0);
  updateChunks();

  function updateInventory() {
    $('inventory').textContent =
      'Tools: ' + tools.join(', ') +
      ' | Ores: ' +
      ['coal', 'iron', 'gold', 'diamond', 'copper', 'redstone', 'lapis']
        .map(k => `${k}: ${inventory[k]}`).join(' | ');
  }

  updateInventory();

  // MOUSE LOOK
  $('play').addEventListener('click', async () => {
    try {
      await renderer.domElement.requestPointerLock();
    } catch (err) {
      $('notice').textContent = 'Click PLAY again to start';
    }
  });

  document.addEventListener('pointerlockchange', () => {
    locked = document.pointerLockElement === renderer.domElement;
    $('menu').style.display = locked ? 'none' : 'flex';
    $('hud').style.display = locked ? 'block' : 'none';
  });

  document.addEventListener('mousemove', e => {
    if (!locked) return;

    yaw -= e.movementX * 0.002;
    pitch -= e.movementY * 0.002;
    pitch = Math.max(-1.5, Math.min(1.5, pitch));

    camera.rotation.set(pitch, yaw, 0);
  });

  // KEYBOARD AND HOTBAR
  const keys = {};

  document.addEventListener('keydown', e => {
    keys[e.code] = true;

    if (e.code === 'Space') e.preventDefault();

    const n = Number(e.code.replace('Digit', ''));
    if (n >= 1 && n <= 5) {
      selectBlock(
        ['grass', 'dirt', 'stone', 'wood', 'leaves'][n - 1]
      );
    }
  });

  document.addEventListener('keyup', e => {
    keys[e.code] = false;
  });

  window.addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
  });

  function selectBlock(type) {
    selectedBlock = type;

    document.querySelectorAll('.slot').forEach(s => {
      s.classList.toggle('selected', s.dataset.block === type);
    });
  }

  document.querySelectorAll('.slot').forEach(s => {
    s.addEventListener('click', () => selectBlock(s.dataset.block));
  });

  // BLOCK TARGETING
  const raycaster = new THREE.Raycaster();
  raycaster.far = 6;

  function getTarget() {
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);

    const hits = raycaster.intersectObjects(
      [...blocks.values()], false
    );

    return hits.length ? hits[0] : null;
  }

  document.addEventListener('contextmenu', e => e.preventDefault());

  document.addEventListener('mousedown', e => {
    if (!locked || (e.button !== 0 && e.button !== 2)) return;

    const hit = getTarget();

    if (!hit) {
      $('notice').textContent = 'Aim at a block within 6 blocks';
      return;
    }

    const mesh = hit.object;
    const b = mesh.userData;

    if (e.button === 0) {
      if (b.type === 'bedrock') {
        $('notice').textContent = 'Bedrock cannot be mined!';
        return;
      }

      if (inventory[b.type] !== undefined) {
        inventory[b.type]++;
      }

      removeBlock(mesh);
      updateInventory();
      $('notice').textContent = 'Mined: ' + b.type;
      return;
    }

    if ((inventory[selectedBlock] || 0) <= 0) {
      $('notice').textContent = 'No ' + selectedBlock + ' blocks left!';
      return;
    }

    const normal = hit.face.normal.clone()
      .transformDirection(mesh.matrixWorld);

    const p = mesh.position.clone().add(
      new THREE.Vector3(
        Math.round(normal.x),
        Math.round(normal.y),
        Math.round(normal.z)
      )
    );

    const x = Math.round(p.x);
    const y = Math.round(p.y);
    const z = Math.round(p.z);

    const overlaps =
      Math.abs(x - camera.position.x) < 0.8 &&
      Math.abs(z - camera.position.z) < 0.8 &&
      y + 0.5 > camera.position.y - 1.7 &&
      y - 0.5 < camera.position.y + 0.2;

    if (!overlaps) {
      addBlock(x, y, z, selectedBlock);
      inventory[selectedBlock]--;
      updateInventory();
      $('notice').textContent = 'Placed: ' + selectedBlock;
    }
  });

  // MOVEMENT
  const clock = new THREE.Clock();

  function animate() {
    requestAnimationFrame(animate);

    const dt = Math.min(clock.getDelta(), 0.05);

    if (locked) {
      const forward = new THREE.Vector3(
        -Math.sin(yaw), 0, -Math.cos(yaw)
      );

      const right = new THREE.Vector3(
        Math.cos(yaw), 0, -Math.sin(yaw)
      );

      const move = new THREE.Vector3();

      if (keys.KeyW) move.add(forward);
      if (keys.KeyS) move.sub(forward);
      if (keys.KeyD) move.add(right);
      if (keys.KeyA) move.sub(right);

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(5 * dt);
        camera.position.add(move);
      }

      // Follow the terrain surface
      const h = terrainHeight(
        Math.round(camera.position.x),
        Math.round(camera.position.z)
      );

      const floor = h + 2.2;

      if (keys.Space && onGround) {
        velocityY = 7;
        onGround = false;
      }

      velocityY -= 18 * dt;
      camera.position.y += velocityY * dt;

      if (camera.position.y <= floor) {
        camera.position.y = floor;
        velocityY = 0;
        onGround = true;
      }

      camera.position.y = Math.min(camera.position.y, 40);

      updateChunks();

      const hit = getTarget();
      $('target').textContent = hit
        ? 'Looking at: ' + hit.object.userData.type
        : 'Looking at: None';

      $('position').textContent =
        `Position: ${Math.floor(camera.position.x)}, ` +
        `${Math.floor(camera.position.y)}, ` +
        `${Math.floor(camera.position.z)}`;
    }

    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
  });

  $('loading').style.display = 'none';
  animate();

} catch (error) {
  console.error(error);
  $('loading').style.display = 'none';
  $('error').style.display = 'block';
  $('error').textContent =
    'Game error: ' + error.message +
    '\n\nInternet check karo aur GitHub Pages ko reload karo. ' +
    'Browser Console mein full error dekho.';
}
