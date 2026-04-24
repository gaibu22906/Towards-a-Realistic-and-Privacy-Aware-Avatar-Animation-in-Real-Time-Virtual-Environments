// Refactored Avatar Animation Setup with WebSocket-driven Animation
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

const canvas = document.querySelector('.webgl');
const scene = new THREE.Scene();
const clock = new THREE.Clock();

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 100);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({ canvas });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.update();

let avatarModel, mixer;
let boneMap = {};
let boneBaseRot = {};
let config = {}, cameraOffsetY = 0;

const loader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

function applyConfig(cfg) {
  config = cfg;
  boneMap = cfg.bones;
  camera.position.set(...Object.values(cfg.camera_position));
  cameraOffsetY = cfg.camera_offsetY;
}

function loadConfig(filePath, callback) {
  fetch(filePath)
    .then(res => res.json())
    .then(callback)
    .catch(console.error);
}

function loadAvatar(modelPath, configPath) {
  loadConfig(configPath, applyConfig);
  loader.load(modelPath, (gltf) => {
    avatarModel = gltf;
    gltf.scene.scale.set(config.scale_factor, config.scale_factor, config.scale_factor);
    scene.add(gltf.scene);

    gltf.scene.traverse(obj => {
      if (!obj.isMesh) return;
      if (boneMap.bone_jaw) boneBaseRot.jaw = scene.getObjectByName(boneMap.bone_jaw)?.rotation.x;
      if (boneMap.bone_eyelid_L) boneBaseRot.blinkL = scene.getObjectByName(boneMap.bone_eyelid_L)?.rotation.x;
      if (boneMap.bone_eyelid_R) boneBaseRot.blinkR = scene.getObjectByName(boneMap.bone_eyelid_R)?.rotation.x;
    });

    const head = scene.getObjectByName(boneMap.bone_head);
    if (head) {
      const focus = head.position;
      controls.target.set(focus.x, focus.y + cameraOffsetY, focus.z);
      controls.update();
    }
  });
}

function setupLighting() {
  const frontLight = new THREE.DirectionalLight('white', 1);
  frontLight.position.set(2, 2, 5);
  scene.add(frontLight);

  const backLight = new THREE.DirectionalLight('white', 1);
  backLight.position.set(2, 2, -5);
  scene.add(backLight);
}

function setBackground(texturePath) {
  scene.background = textureLoader.load(texturePath);
}

function applyWebSocketUpdates() {
  const socket = new WebSocket('ws://127.0.0.1:8765');

  socket.onopen = () => console.log('WebSocket connected');

  socket.onmessage = (event) => {
    const data = JSON.parse(event.data);
    scene.traverse((object) => {
      if (!object.isMesh) return;

      const jaw = scene.getObjectByName(boneMap.bone_jaw);
      if (jaw) jaw.rotation.x = boneBaseRot.jaw + data.gap * config.bones.multipliers.jaw;

      const head = scene.getObjectByName(boneMap.bone_head);
      if (head) {
        head.rotation.z = data.rot * config.bones.multipliers.head_rot + config.bones.offsets.head_rot;
        head.rotation.x = data.nod * config.bones.multipliers.head_nod + config.bones.offsets.head_nod;
        head.rotation.y = data.turn * config.bones.multipliers.head_turn + config.bones.offsets.head_turn;
      }

      const eyeL = scene.getObjectByName(boneMap.bone_eye_L);
      const eyeR = scene.getObjectByName(boneMap.bone_eye_R);
      if (eyeL && eyeR) {
        const axisH = config.bones.axis?.eye_H || 'z';
        const axisV = config.bones.axis?.eye_V || 'x';

        eyeL.rotation[axisH] = data.eye_L_H * config.bones.multipliers.eye_L_H + config.bones.offsets.eye_L_H;
        eyeR.rotation[axisH] = data.eye_R_H * config.bones.multipliers.eye_R_H + config.bones.offsets.eye_R_H;
        eyeL.rotation[axisV] = data.eye_L_V * config.bones.multipliers.eye_L_V + config.bones.offsets.eye_L_V;
        eyeR.rotation[axisV] = data.eye_R_V * config.bones.multipliers.eye_R_V + config.bones.offsets.eye_R_V;
      }

      const blinkL = scene.getObjectByName(boneMap.bone_eyelid_L);
      const blinkR = scene.getObjectByName(boneMap.bone_eyelid_R);
      if (blinkL) blinkL.rotation.x = data.blinkL < 0.27 ? 3.7 : boneBaseRot.blinkL;
      if (blinkR) blinkR.rotation.x = data.blinkR < 0.27 ? 0.5 : boneBaseRot.blinkR;
    });
  };

  socket.onerror = (err) => console.error('WebSocket error:', err);
  socket.onclose = () => console.warn('WebSocket closed');
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (mixer) mixer.update(delta);
  controls.update();
  renderer.render(scene, camera);
}

// Initialize
setupLighting();
setBackground('textures/bg2.png');
loadAvatar('assets/ruby1.gltf', 'configs/ruby1.json');
applyWebSocketUpdates();
animate();
