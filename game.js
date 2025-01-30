import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';

// Color correction shader
const ColorCorrectionShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "powRGB": { value: new THREE.Vector3(1, 1, 1) },
    "mulRGB": { value: new THREE.Vector3(1, 1, 1) },
    "dreamFactor": { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform vec3 powRGB;
    uniform vec3 mulRGB;
    uniform float dreamFactor;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      
      // Dream-like color adjustment
      vec3 color = texel.rgb;
      color = pow(color, powRGB);
      color *= mulRGB;
      
      // Add soft, dreamy glow
      vec2 center = vec2(0.5);
      float dist = length(vUv - center);
      vec3 dreamColor = mix(color, vec3(1.0), dist * 0.2 * dreamFactor);
      
      // Slight color shift for ethereal effect
      dreamColor.r += 0.1 * dreamFactor;
      dreamColor.b += 0.05 * dreamFactor;
      
      gl_FragColor = vec4(dreamColor, texel.a);
    }
  `
};

// Vignette shader
const VignetteShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "offset": { value: 1.0 },
    "darkness": { value: 1.0 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;
    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * 2.0;
      float vigAmt = 1.0 - length(uv);
      vigAmt = pow(vigAmt, offset);
      gl_FragColor = vec4(texel.rgb * vigAmt, texel.a);
    }
  `
};

// Add Chromatic Aberration shader
const ChromaticAberrationShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "amount": { value: 0.005 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float amount;
    varying vec2 vUv;

    void main() {
      vec2 offset = amount * vec2(1.0, 0.0);
      
      vec4 cr = texture2D(tDiffuse, vUv + offset);
      vec4 cg = texture2D(tDiffuse, vUv);
      vec4 cb = texture2D(tDiffuse, vUv - offset);
      
      gl_FragColor = vec4(cr.r, cg.g, cb.b, cg.a);
    }
  `
};

// Add Bloom shader
const BloomShader = {
  uniforms: {
    "tDiffuse": { value: null },
    "bloomStrength": { value: 1.5 },
    "bloomRadius": { value: 0.4 }
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float bloomStrength;
    uniform float bloomRadius;
    varying vec2 vUv;

    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 pixelSize = vec2(bloomRadius / 512.0);
      vec4 bloom = vec4(0.0);
      
      // Simple bloom effect
      for(int i = -3; i <= 3; i++) {
        for(int j = -3; j <= 3; j++) {
          vec2 offset = vec2(float(i), float(j)) * pixelSize;
          bloom += texture2D(tDiffuse, vUv + offset);
        }
      }
      
      bloom /= 49.0; // Average the samples
      color += bloom * bloomStrength;
      
      gl_FragColor = color;
    }
  `
};

class Game {
  constructor() {
    // Initialize core tracking objects and state
    this.movementKeys = {
      KeyW: false,
      KeyS: false,
      KeyA: false,
      KeyD: false,
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false
    };

    this.savePoints = new Set();
    this.lockState = {
      active: false,
      pending: false,
      error: null
    };

    this.isMoving = false;
    this.mouseSensitivity = 0.002;
    this.isSaveMenuOpen = false;
    this.chunkLoadDistance = 2; // How many chunks to load in each direction
    this.collisionWalls = [];

    // Enemy initialization
    this.enemy = null;

    // Initialize core systems
    this.setupScreens();
    this.setupThreeJS();
    this.loadTextures();
    this.setupLighting();
    this.setupPostProcessing();
    
    // Enemy initialization must happen after setupThreeJS
    this.spawnEnemy();
    
    // Initialize stats tracking
    if (!this.statistics) {
      this.statistics = {
        steps: 0,
        jumpscares: 0,
        lastPosition: new THREE.Vector3(),
        stepThreshold: 0.4,
        lastStepTime: 0,
        stepCooldown: 250
      };
    }

    // Movement & control settings
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    this.isRunning = false;
    this.movementActive = false;

    this.walkSpeed = 0.15;
    this.runSpeed = 0.3;
    this.currentVelocity = new THREE.Vector3();
    this.targetVelocity = new THREE.Vector3();
    this.groundHeight = 2;
    this.isGrounded = true;
    this.movementSmoothing = 0.15;
    this.viewBobAmount = 0.15;
    this.viewBobSpeed = 0.008;
    this.bobPhase = 0;

    // Initialize difficulty settings with balanced values
    this.difficultySettings = {
      veryEasy: {
        enemySpeed: 0.05,
        catchDistance: 2,
        spawnDistance: 50  // Enemy spawns further away
      },
      easy: {
        enemySpeed: 0.08,
        catchDistance: 2.5,
        spawnDistance: 40
      },
      normal: {
        enemySpeed: 0.12,
        catchDistance: 3,
        spawnDistance: 30
      },
      hard: {
        enemySpeed: 0.15,
        catchDistance: 3.5,
        spawnDistance: 25
      },
      nightmare: {
        enemySpeed: 0.2,
        catchDistance: 4,
        spawnDistance: 20
      }
    };

    // Setup remaining systems
    this.setupPlayer();
    this.setupMeters();
    this.generateLevel();
    this.bindEvents();
    this.initializeMinimap();
    this.initializeStats();
    this.setupHorrorMessages();
    this.setupTitleHorrorMessages();

    // Load 3D models
    this.gltfLoader = new GLTFLoader();
    this.loadModels();

    // Initialize game state
    this.initialized = false;
    this.active = false;

    this.minimapScale = 2; // Scale factor for minimap visualization
    this.minimapWallColor = '#600'; // Dark red color for maze walls

    // Add pause state tracking
    this.isPaused = false;
  }

  spawnEnemy() {
    if (!this.enemy) {
      const geometry = new THREE.BoxGeometry();
      const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
      this.enemy = new THREE.Mesh(geometry, material);
      this.scene.add(this.enemy);
    }

    // Position enemy away from player spawn
    const spawnDistance = this.difficulty ? 
      this.difficultySettings[this.difficulty].spawnDistance : 
      50;
    
    const angle = Math.random() * Math.PI * 2;
    this.enemy.position.set(
      Math.cos(angle) * spawnDistance,
      2,
      Math.sin(angle) * spawnDistance
    );
  }

  startGame(isMultiplayer = false) {
    // Initialize/reset game properties if undefined
    if (!this.statistics) {
      this.statistics = {
        steps: 0,
        jumpscares: 0,
        lastPosition: new THREE.Vector3(),
        stepThreshold: 0.4, 
        lastStepTime: 0,
        stepCooldown: 250
      };
    }

    // Reset game state
    this.statistics.steps = 0;
    this.statistics.jumpscares = 0;
    
    // Initialize meters if undefined
    if (!this.eeriness) {
      this.eeriness = 0;
    }
    if (!this.fear) {
      this.fear = 0;
    }
    
    // Initialize face transition element
    this.faceTransition = document.querySelector('.face-transition');
    if (this.faceTransition) {
      // Show face transition
      this.faceTransition.classList.add('active');

      // After face animation, switch to difficulty screen  
      setTimeout(() => {
        this.faceTransition.classList.remove('active');
        this.switchScreen('difficulty');
      }, 1500);
    } else {
      // Fallback if transition element not found
      this.switchScreen('difficulty');
    }
  }

  setDifficulty(level) {
    this.difficulty = level;
    
    // Show face transition
    this.faceTransition.classList.add('active');

    // After face animation, switch to loading screen
    setTimeout(() => {
      this.faceTransition.classList.remove('active');
      this.switchScreen('loading');

      // Initialize game state
      this.camera.position.set(0, this.groundHeight, 0);
      this.spawnEnemy();
      
      let progress = 0;
      const loadingInterval = setInterval(() => {
        progress += 1;
        if (this.progressBar) {
          this.progressBar.style.width = `${progress}%`;
        }

        if (progress >= 100) {
          clearInterval(loadingInterval);
          
          // Reset meters
          if (this.eerinessBar) this.eerinessBar.style.width = '0%';
          if (this.fearBar) this.fearBar.style.width = '0%';

          // Show face transition before game starts
          this.faceTransition.classList.add('active');
          setTimeout(() => {
            this.faceTransition.classList.remove('active');
            this.switchScreen('game');
            this.active = true;
            this.showClickToContinue();
          }, 1500);
        }
      }, 50);
    }, 1500);
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    // Don't update game state if paused
    if (this.isPaused) return;

    if (this.movementActive) {
      this.updatePlayerPosition();
    }

    // Only update enemy if game is active and difficulty is set
    if (this.enemy && this.difficulty && this.active) {
      const settings = this.difficultySettings[this.difficulty];
      const distanceToPlayer = this.camera.position.distanceTo(this.enemy.position);

      // Update enemy position to move towards player
      const direction = new THREE.Vector3()
        .subVectors(this.camera.position, this.enemy.position)
        .normalize();
      
      this.enemy.position.add(direction.multiplyScalar(settings.enemySpeed));

      // Show horror messages based on distance
      if (distanceToPlayer < settings.catchDistance * 3) {
        this.showHorrorMessage(distanceToPlayer < settings.catchDistance * 1.5);
      }

      // Check for game over
      if (distanceToPlayer < settings.catchDistance) {
        this.triggerJumpscare();
      }

      // Update fear meter based on distance
      const fearLevel = Math.max(0, Math.min(100, 
        100 - (distanceToPlayer / settings.spawnDistance) * 100));
      if (this.fearBar) {
        this.fearBar.style.width = `${fearLevel}%`;
      }
    }

    // Update lighting
    this.updateLighting();

    // Update minimap and stats if game is active
    if (this.screens.game.classList.contains('active')) {
      this.updateMinimap();
      this.updateStats();
    }

    // Animate post-processing effects
    this.animatePostProcessing();

    // Render scene with post-processing
    if (this.composer) {
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    // Update chunks based on player position
    this.updateChunks();
  }

  async loadModels() {
    try {
      // Load only typewriter model
      this.gltfLoader.loadAsync('/underwood_standard_portable_typewriter.glb')
        .then(result => {
          this.typewriterModel = result.scene;

          // Scale and position adjustments
          this.typewriterModel.scale.set(0.5, 0.5, 0.5);

          // Enable shadows
          this.typewriterModel.traverse(child => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
            }
          });
        })
        .catch(error => {
          console.error('Failed to load typewriter model:', error);
        });
    } catch (error) {
      console.error('Failed to load 3D models:', error);
    }
  }

  loadTextures() {
    this.textureLoader = new THREE.TextureLoader();
    this.wallTexture = this.textureLoader.load('DALL·E 2025-01-23 15.33.35 - A seamless, 8-bit pixel art texture for a horror-themed game wall. The wall features cracked, decayed bricks with faint pixelated bloodstains and scra.webp');
    this.doorTexture = this.textureLoader.load('DALL_E_2025-01-23_15.39.29_-_A_seamless_8-bit_pixel_art_wooden_texture_filling_the_screen_for_a_door_asset_in_a_game._The_texture_features_dark__aged_wooden_planks_with_visible_pi-removebg-preview.png');

    // Make textures repeat
    this.wallTexture.wrapS = this.wallTexture.wrapT = THREE.RepeatWrapping;
    this.doorTexture.wrapS = this.doorTexture.wrapT = THREE.RepeatWrapping;
  }

  setupScreens() {
    this.screens = {
      title: document.getElementById('title-screen'),
      loading: document.getElementById('loading-screen'),
      game: document.getElementById('game-screen'),
      gameOver: document.getElementById('game-over-screen'),
      difficulty: document.getElementById('difficulty-screen'),
      multiplayer: document.getElementById('multiplayer-screen') // Add multiplayer screen
    };

    // Validate that all screens exist
    Object.entries(this.screens).forEach(([name, screen]) => {
      if (!screen) {
        console.error(`Screen element '${name}-screen' not found`);
      }
    });

    this.progressBar = document.querySelector('.progress');
    this.jumpscare = document.getElementById('jumpscare');
  }

  setupThreeJS() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    this.renderer = new THREE.WebGLRenderer({
      canvas: document.getElementById('game-canvas'),
      antialias: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);

    // Add lighting
    const ambient = new THREE.AmbientLight(0x404040);
    const point = new THREE.PointLight(0xff0000, 1, 100);
    this.scene.add(ambient, point);
  }

  setupPlayer() {
    try {
      this.controls = new PointerLockControls(this.camera, document.body);
      this.camera.position.y = 2;

      // Enhanced pointer lock error handling
      document.addEventListener('pointerlockchange', () => {
        if (document.pointerLockElement === document.body) {
          this.lockState.active = true;
          this.lockState.pending = false;
          this.lockState.error = null;
          this.screens.game.classList.add('playing');
          this.movementActive = true;
          if (this.clickToContinue) {
            this.clickToContinue.style.display = 'none';
          }
        } else {
          this.lockState.active = false;
          this.lockState.pending = false;
          // Only handle unlock if we're actually in the game
          if (this.screens.game.classList.contains('active') && !this.isSaveMenuOpen) {
            this.screens.game.classList.remove('playing');
            this.movementActive = false;
            this.resetMovementStates();

            if (!this.screens.gameOver.classList.contains('active')) {
              this.showClickToContinue();
            }
          }
        }
      });

      document.addEventListener('pointerlockerror', (event) => {
        this.lockState.error = event;
        this.lockState.pending = false;
        this.lockState.active = false;
        console.error('Pointer lock error:', event);
        // Attempt recovery
        setTimeout(() => {
          this.showClickToContinue();
        }, 100);
      });

      // Safer mouse movement handling
      document.addEventListener('mousemove', (event) => {
        if (!this.lockState.active || !this.movementActive) return;

        try {
          const movementX = event.movementX || 0;
          const movementY = event.movementY || 0;

          if (isFinite(movementX) && isFinite(movementY)) {
            this.controls.moveRight(-movementX * this.mouseSensitivity);
            this.controls.moveForward(-movementY * this.mouseSensitivity);
          }
        } catch (error) {
          console.error('Error handling mouse movement:', error);
        }
      });

      // Handle window blur more gracefully
      window.addEventListener('blur', () => {
        try {
          if (this.lockState.active) {
            this.controls.unlock();
          }
          this.resetMovementStates();
        } catch (error) {
          console.error('Error handling window blur:', error);
        }
      });

    } catch (error) {
      console.error('Error setting up player controls:', error);
    }
  }

  setupEnemy() {
    const geometry = new THREE.BoxGeometry();
    const material = new THREE.MeshPhongMaterial({ color: 0xff0000 });
    this.enemy = new THREE.Mesh(geometry, material);
    this.scene.add(this.enemy);
    this.enemy.position.set(10, 2, 10);
  }

  setupMeters() {
    if (!this.eeriness) {
      this.eeriness = 0;
    }
    if (!this.fear) {
      this.fear = 0;
    }
    this.eerinessBar = document.querySelector('.eeriness .fill');
    this.fearBar = document.querySelector('.scare .fill');
  }

  generateLevel() {
    // Create floor
    const floorGeometry = new THREE.PlaneGeometry(1000, 1000);
    const floorMaterial = new THREE.MeshPhongMaterial({
      color: 0x333333,
      roughness: 0.8,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    this.scene.add(floor);

    // Initialize maze chunks management
    this.chunkSize = 15;
    this.loadedChunks = new Map(); // Store loaded chunks
    this.chunksToLoad = new Set(); // Queue chunks for loading

    // Initialize hallways group
    this.hallways = new THREE.Group();
    this.scene.add(this.hallways);

    // Generate initial chunks around player
    this.updateChunks();
  }

  getChunkKey(chunkX, chunkZ) {
    return `${chunkX},${chunkZ}`;
  }

  updateChunks() {
    const playerChunkX = Math.floor(this.camera.position.x / (this.chunkSize * 10));
    const playerChunkZ = Math.floor(this.camera.position.z / (this.chunkSize * 10));

    // Determine which chunks should be loaded
    for (let dx = -this.chunkLoadDistance; dx <= this.chunkLoadDistance; dx++) {
      for (let dz = -this.chunkLoadDistance; dz <= this.chunkLoadDistance; dz++) {
        const chunkX = playerChunkX + dx;
        const chunkZ = playerChunkZ + dz;
        const chunkKey = this.getChunkKey(chunkX, chunkZ);

        if (!this.loadedChunks.has(chunkKey)) {
          this.chunksToLoad.add(chunkKey);
          this.generateChunk(chunkX, chunkZ);
        }
      }
    }

    // Remove distant chunks
    for (const [key, chunk] of this.loadedChunks) {
      const [cx, cz] = key.split(',').map(Number);
      if (Math.abs(cx - playerChunkX) > this.chunkLoadDistance + 1 ||
          Math.abs(cz - playerChunkZ) > this.chunkLoadDistance + 1) {
        this.hallways.remove(chunk);
        this.loadedChunks.delete(key);
        // Remove collision walls for this chunk
        this.collisionWalls = this.collisionWalls.filter(wall => !chunk.children.includes(wall));
      }
    }
  }

  generateChunk(chunkX, chunkZ) {
    const chunkKey = this.getChunkKey(chunkX, chunkZ);
    if (this.loadedChunks.has(chunkKey)) return;

    const chunkGroup = new THREE.Group();
    const CELL_SIZE = 10;
    const offsetX = chunkX * this.chunkSize * CELL_SIZE;
    const offsetZ = chunkZ * this.chunkSize * CELL_SIZE;

    // Generate maze for this chunk
    const maze = this.generateMazeData(this.chunkSize, this.chunkSize);

    // Create the physical maze structure for this chunk
    for (let x = 0; x < this.chunkSize; x++) {
      for (let z = 0; z < this.chunkSize; z++) {
        const cell = maze[x][z];
        const cellX = offsetX + x * CELL_SIZE;
        const cellZ = offsetZ + z * CELL_SIZE;

        const hallwayGroup = new THREE.Group();

        // Add walls based on maze structure
        if (cell.walls.north) {
          this.addWall(hallwayGroup, 0, -CELL_SIZE / 2, 0);
        }
        if (cell.walls.south) {
          this.addWall(hallwayGroup, 0, CELL_SIZE / 2, 0);
        }
        if (cell.walls.east) {
          this.addWall(hallwayGroup, CELL_SIZE / 2, 0, Math.PI / 2);
        }
        if (cell.walls.west) {
          this.addWall(hallwayGroup, -CELL_SIZE / 2, 0, Math.PI / 2);
        }

        // Add ceiling
        const ceilingGeometry = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
        const ceiling = new THREE.Mesh(ceilingGeometry, new THREE.MeshPhongMaterial({
          map: this.wallTexture,
          side: THREE.DoubleSide
        }));
        ceiling.rotation.x = Math.PI / 2;
        ceiling.position.y = 4;
        hallwayGroup.add(ceiling);

        // Add random doors
        if (Math.random() < 0.3) {
          const validWalls = Object.entries(cell.walls)
            .filter(([_, hasWall]) => hasWall)
            .map(([direction]) => direction);

          if (validWalls.length > 0) {
            const wallDirection = validWalls[Math.floor(Math.random() * validWalls.length)];
            this.addDoor(hallwayGroup, 0, 0, wallDirection, CELL_SIZE);
          }
        }

        hallwayGroup.position.set(cellX, 0, cellZ);
        chunkGroup.add(hallwayGroup);
      }
    }

    // Add save points randomly to the chunk
    if (this.typewriterModel) {
      for (let x = 0; x < this.chunkSize; x++) {
        for (let z = 0; z < this.chunkSize; z++) {
          if (Math.random() < 0.05) { // 5% chance per cell
            const cellX = offsetX + x * CELL_SIZE;
            const cellZ = offsetZ + z * CELL_SIZE;
            this.addSavePoint(chunkGroup, cellX, cellZ);
          }
        }
      }
    }

    this.hallways.add(chunkGroup);
    this.loadedChunks.set(chunkKey, chunkGroup);
  }

  generateMazeData(width, height) {
    const maze = Array(width).fill().map(() =>
      Array(height).fill().map(() => ({
        visited: false,
        walls: { north: true, south: true, east: true, west: true }
      }))
    );

    const stack = [];
    let currentCell = { x: Math.floor(width / 2), z: Math.floor(height / 2) };
    maze[currentCell.x][currentCell.z].visited = true;

    const getUnvisitedNeighbors = (cell) => {
      const neighbors = [];
      const directions = [
        { dx: 0, dz: -1, dir: 'north' },
        { dx: 1, dz: 0, dir: 'east' },
        { dx: 0, dz: 1, dir: 'south' },
        { dx: -1, dz: 0, dir: 'west' }
      ];

      for (const direction of directions) {
        const newX = cell.x + direction.dx;
        const newZ = cell.z + direction.dz;

        if (newX >= 0 && newX < width &&
          newZ >= 0 && newZ < height &&
          !maze[newX][newZ].visited) {
          neighbors.push({
            x: newX,
            z: newZ,
            direction: direction.dir,
            opposite: {
              north: 'south',
              south: 'north',
              east: 'west',
              west: 'east'
            }[direction.dir]
          });
        }
      }
      return neighbors;
    };

    do {
      const neighbors = getUnvisitedNeighbors(currentCell);

      if (neighbors.length > 0) {
        stack.push(currentCell);
        const nextNeighbor = neighbors[Math.floor(Math.random() * neighbors.length)];

        maze[currentCell.x][currentCell.z].walls[nextNeighbor.direction] = false;
        maze[nextNeighbor.x][nextNeighbor.z].walls[nextNeighbor.opposite] = false;

        currentCell = { x: nextNeighbor.x, z: nextNeighbor.z };
        maze[currentCell.x][currentCell.z].visited = true;
      } else if (stack.length > 0) {
        currentCell = stack.pop();
      }
    } while (stack.length > 0);

    return maze;
  }

  addWall(group, x, z, rotation) {
    const wallGeometry = new THREE.BoxGeometry(10, 4, 0.2);
    const wallMaterial = new THREE.MeshPhongMaterial({
      map: this.wallTexture,
      normalScale: new THREE.Vector2(1, 1)
    });

    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    wall.position.set(x, 2, z);
    wall.rotation.y = rotation;

    // Add collision wall
    const collisionWall = new THREE.Mesh(
      wallGeometry,
      new THREE.MeshBasicMaterial({ visible: false })
    );
    collisionWall.position.copy(wall.position);
    collisionWall.rotation.copy(wall.rotation);

    if (!this.collisionWalls) {
      this.collisionWalls = [];
    }
    this.collisionWalls.push(collisionWall);

    group.add(wall);
    group.add(collisionWall);
  }

  addDoor(group, cellX, cellZ, direction, cellSize) {
    const doorGeometry = new THREE.BoxGeometry(2, 3, 0.2);
    const doorMaterial = new THREE.MeshPhongMaterial({
      map: this.doorTexture,
      transparent: false, // Prevent flickering
      side: THREE.DoubleSide,
      alphaTest: 0.5
    });

    const door = new THREE.Mesh(doorGeometry, doorMaterial);

    // Position door based on direction
    switch (direction) {
      case 'north':
        door.position.set(0, 1.5, -cellSize / 2);
        door.rotation.y = 0;
        break;
      case 'south':
        door.position.set(0, 1.5, cellSize / 2);
        door.rotation.y = Math.PI;
        break;
      case 'east':
        door.position.set(cellSize / 2, 1.5, 0);
        door.rotation.y = Math.PI / 2;
        break;
      case 'west':
        door.position.set(-cellSize / 2, 1.5, 0);
        door.rotation.y = -Math.PI / 2;
        break;
    }

    group.add(door);
  }

  addSavePoint(chunkGroup, x, z) {
    const savePointGroup = new THREE.Group();

    // Clone typewriter model for this save point
    const typewriter = this.typewriterModel.clone();

    // Adjust typewriter scale and position
    typewriter.scale.set(0.3, 0.3, 0.3);
    typewriter.position.set(0, 0, 0); // Place typewriter directly on ground

    // Add to group
    savePointGroup.add(typewriter);

    // Position group in world
    savePointGroup.position.set(x, 0, z);

    // Rotate group randomly for variety
    savePointGroup.rotation.y = Math.random() * Math.PI * 2;

    // Add to chunk
    chunkGroup.add(savePointGroup);

    // Track save point location
    this.savePoints.add({
      position: new THREE.Vector3(x, 0, z),
      group: savePointGroup
    });
  }

  bindEvents() {
    // Get button elements
    const startBtn = document.getElementById('start-btn');
    const retryBtn = document.getElementById('retry-btn');
    const difficultyBtns = {
      veryEasy: document.getElementById('veryEasy-btn'),
      easy: document.getElementById('easy-btn'), 
      normal: document.getElementById('normal-btn'),
      hard: document.getElementById('hard-btn'),
      nightmare: document.getElementById('nightmare-btn')
    };

    // Add start button listener with error checking
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        try {
          this.startGame(false);
        } catch (error) {
          console.error('Error starting game:', error);
        }
      });
    }

    // Add retry button listener with error checking
    if (retryBtn) {
      retryBtn.addEventListener('click', () => {
        try {
          this.startGame(false);
        } catch (error) {
          console.error('Error retrying game:', error);
        }
      });
    }

    // Add difficulty button listeners with error checking
    Object.entries(difficultyBtns).forEach(([difficulty, btn]) => {
      if (btn) {
        btn.addEventListener('click', () => {
          try {
            this.setDifficulty(difficulty);
          } catch (error) {
            console.error('Error setting difficulty:', error);
          }
        });
      }
    });

    // Add remaining event listeners
    document.addEventListener('keydown', (event) => this.onKeyDown(event));
    document.addEventListener('keyup', (event) => this.onKeyUp(event));

    window.addEventListener('resize', () => {
      if (this.camera) {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
      }
      if (this.renderer) {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
      }
    });

    // Add interaction key for save points
    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyE') {
        this.checkSavePointInteraction();
      }
    });

    // Add ESC key handler
    document.addEventListener('keydown', (event) => {
      if (event.code === 'Escape') {
        this.togglePause();
      }
    });
  }

  showClickToContinue() {
    if (!this.clickToContinue) {
      this.clickToContinue = document.createElement('div');
      this.clickToContinue.className = 'click-to-continue';
      this.clickToContinue.textContent = 'Click to continue';
      this.screens.game.appendChild(this.clickToContinue);
    }

    this.clickToContinue.style.display = 'block';

    const onClick = async (event) => {
      try {
        event.preventDefault();

        if (!this.lockState.active && this.screens.game.classList.contains('active')) {
          this.lockState.pending = true;
          await this.controls.lock();
        }
      } catch (error) {
        console.error('Error requesting pointer lock:', error);
        this.lockState.error = error;
        this.lockState.pending = false;
      }
    };

    // Remove any existing click listeners first
    this.screens.game.removeEventListener('click', onClick);
    this.screens.game.addEventListener('click', onClick);
  }

  checkSavePointInteraction() {
    if (!this.controls.isLocked || this.isSaveMenuOpen) return;

    const playerPos = this.camera.position;

    // Check each save point
    for (const savePoint of this.savePoints) {
      const distance = playerPos.distanceTo(savePoint.position);

      if (distance < 3) { // Within 3 units
        this.openSaveMenu();
        break;
      }
    }
  }

  openSaveMenu() {
    this.isSaveMenuOpen = true;
    this.controls.unlock();

    // Create save menu if it doesn't exist
    if (!this.saveMenu) {
      this.saveMenu = document.createElement('div');
      this.saveMenu.className = 'save-menu';
      
      let menuHTML = '<div class="save-menu-content">';
      menuHTML += '<h2>Save Progress</h2>';
      menuHTML += '<div class="save-slots">';
      
      // Create slots
      for (let i = 1; i <= 3; i++) {
        menuHTML += '<div class="save-slot" data-slot="' + i + '">';
        menuHTML += '<h3>Slot ' + i + '</h3>';
        menuHTML += '<button class="save-btn">Save</button>';
        menuHTML += '<button class="load-btn">Load</button>';
        menuHTML += '</div>';
      }
      
      menuHTML += '</div>';
      menuHTML += '<button class="close-btn">Close</button>';
      menuHTML += '</div>';

      this.saveMenu.innerHTML = menuHTML;

      document.body.appendChild(this.saveMenu);

      // Add event listeners
      this.saveMenu.querySelector('.close-btn').addEventListener('click', () => {
        this.closeSaveMenu();
      });

      // Add save/load functionality
      this.saveMenu.querySelectorAll('.save-slot').forEach(slot => {
        const slotNum = slot.dataset.slot;

        slot.querySelector('.save-btn').addEventListener('click', () => {
          this.saveGame(slotNum);
        });

        slot.querySelector('.load-btn').addEventListener('click', () => {
          this.loadGame(slotNum);
        });
      });
    }

    this.saveMenu.style.display = 'flex';
  }

  closeSaveMenu() {
    if (this.saveMenu) {
      this.saveMenu.style.display = 'none';
    }
    this.isSaveMenuOpen = false;

    // Add delay before relocking to prevent immediate unlock
    setTimeout(() => {
      if (this.screens.game.classList.contains('active')) {
        this.controls.lock();
      }
    }, 100);
  }

  saveGame(slot) {
    const saveData = {
      playerPosition: this.camera.position.toArray(),
      enemyPosition: this.enemy.position.toArray(),
      difficulty: this.difficulty,
      eeriness: this.eeriness,
      fear: this.fear
    };

    try {
      localStorage.setItem("save_slot_" + slot, JSON.stringify(saveData));
      alert(`Game saved in slot ${slot}`);
    } catch (error) {
      console.error('Error saving game:', error);
      alert('Failed to save game');
    }
  }

  loadGame(slot) {
    try {
      const saveData = localStorage.getItem("save_slot_" + slot);

      if (saveData) {
        const data = JSON.parse(saveData);

        // Restore game state
        this.camera.position.fromArray(data.playerPosition);
        this.enemy.position.fromArray(data.enemyPosition);
        this.difficulty = data.difficulty;
        this.eeriness = data.eeriness;
        this.fear = data.fear;

        this.closeSaveMenu();
        alert(`Game loaded from slot ${slot}`);
      } else {
        alert(`No save data found in slot ${slot}`);
      }
    } catch (error) {
      console.error('Error loading game:', error);
      alert('Failed to load game');
    }
  }

  onKeyDown(event) {
    if (!this.controls.isLocked || !this.movementActive) return;

    if (event.code in this.movementKeys) {
      this.movementKeys[event.code] = true;
      event.preventDefault();
    }

    // Handle sprint key (Shift)
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.isRunning = true;
      if (this.screens.game.classList.contains('active')) {
        this.screens.game.classList.add('running');
      }
    }

    // Update movement flags
    this.moveForward = this.movementKeys.KeyW || this.movementKeys.ArrowUp;
    this.moveBackward = this.movementKeys.KeyS || this.movementKeys.ArrowDown;
    this.moveLeft = this.movementKeys.KeyA || this.movementKeys.ArrowLeft;
    this.moveRight = this.movementKeys.KeyD || this.movementKeys.ArrowRight;
  }

  onKeyUp(event) {
    if (event.code in this.movementKeys) {
      this.movementKeys[event.code] = false;
      event.preventDefault();
    }

    // Handle sprint key release
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.isRunning = false;
      this.screens.game.classList.remove('running');
    }

    // Update movement flags
    this.moveForward = this.movementKeys.KeyW || this.movementKeys.ArrowUp;
    this.moveBackward = this.movementKeys.KeyS || this.movementKeys.ArrowDown;
    this.moveLeft = this.movementKeys.KeyA || this.movementKeys.ArrowLeft;
    this.moveRight = this.movementKeys.KeyD || this.movementKeys.ArrowRight;
  }

  updatePlayerPosition() {
    if (!this.controls.isLocked || !this.movementActive) return;

    const moveVector = new THREE.Vector3();
    const playerDirection = new THREE.Vector3();
    this.camera.getWorldDirection(playerDirection);
    playerDirection.y = 0; // Keep movement horizontal
    playerDirection.normalize();

    // Reset movement flag
    this.isMoving = false;

    // Calculate movement vector based on input
    if (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight) {
      this.isMoving = true;

      if (this.moveForward) {
        moveVector.add(playerDirection);
      }
      if (this.moveBackward) {
        moveVector.sub(playerDirection);
      }

      // Calculate right vector for strafing
      const rightVector = new THREE.Vector3();
      rightVector.crossVectors(playerDirection, new THREE.Vector3(0, 1, 0));

      if (this.moveLeft) {
        moveVector.sub(rightVector);
      }
      if (this.moveRight) {
        moveVector.add(rightVector);
      }

      // Normalize movement vector
      if (moveVector.length() > 0) {
        moveVector.normalize();

        // Apply appropriate speed
        const speed = this.isRunning ? this.runSpeed : this.walkSpeed;
        moveVector.multiplyScalar(speed);

        // Smooth movement transition
        this.targetVelocity.copy(moveVector);
      }
    } else {
      // Decelerate when no movement keys are pressed
      this.targetVelocity.multiplyScalar(0.8);
    }

    // Apply movement smoothing
    this.currentVelocity.lerp(this.targetVelocity, this.movementSmoothing);

    // Head bobbing effect
    if (this.isMoving && this.isGrounded) {
      const bobSpeed = this.isRunning ? this.viewBobSpeed * 1.5 : this.viewBobSpeed;
      const bobAmount = this.isRunning ? this.viewBobAmount * 1.5 : this.viewBobAmount;

      this.bobPhase += bobSpeed;
      const bobOffset = Math.sin(this.bobPhase) * bobAmount;

      // Apply bob to camera height
      this.camera.position.y = this.groundHeight + bobOffset;

      // Handle footstep tracking for statistics
      const stepDistance = this.isRunning ? 0.6 : 0.4;
      const currentTime = performance.now();

      if (currentTime - this.statistics.lastStepTime > this.statistics.stepCooldown) {
        const distanceMoved = this.currentVelocity.length();
        if (distanceMoved > stepDistance) {
          this.statistics.steps++;
          this.statistics.lastStepTime = currentTime;
          this.updateStats();
        }
      }
    } else {
      // Smoothly return to normal height when not moving
      this.camera.position.y = this.groundHeight;
    }

    // Calculate new position
    const newPosition = this.camera.position.clone().add(this.currentVelocity);

    // Collision detection
    let canMove = true;
    const playerRadius = 0.5;

    if (this.collisionWalls) {
      this.collisionWalls.forEach(wall => {
        if (wall.position.distanceTo(newPosition) < playerRadius + 1) {
          const wallBox = new THREE.Box3().setFromObject(wall);
          const playerBox = new THREE.Box3().setFromCenterAndSize(
            newPosition,
            new THREE.Vector3(playerRadius * 2, 4, playerRadius * 2)
          );

          if (wallBox.intersectsBox(playerBox)) {
            canMove = false;
          }
        }
      });
    }

    // Apply movement if no collision
    if (canMove) {
      this.camera.position.add(this.currentVelocity);
    } else {
      // Stop movement on collision
      this.currentVelocity.set(0, 0, 0);
      this.targetVelocity.set(0, 0, 0);
    }
  }

  setupLighting() {
    // Remove previous lights
    this.scene.remove(...this.scene.children.filter(child => child.isLight));

    // Add very dim ambient light for base visibility
    const ambient = new THREE.AmbientLight(0x200000, 0.15);
    this.scene.add(ambient);

    // Add eerie red point light that follows player with larger radius
    this.playerLight = new THREE.PointLight(0xff0000, 1.2, 15);
    this.playerLight.position.set(0, 2, 0);
    this.scene.add(this.playerLight);

    // Add static red spotlights in regular intervals along hallways
    this.staticLights = [];
    for (let i = 0; i < 20; i++) {
      const light = new THREE.SpotLight(0xff0000, 0.8, 20);
      light.position.set(
        Math.random() * 60 - 30,
        4, // Position lights higher
        Math.random() * 60 - 30
      );
      light.target.position.set(
        light.position.x,
        0,
        light.position.z
      );
      light.angle = Math.PI / 4;
      light.penumbra = 0.5;
      light.decay = 2;
      this.staticLights.push(light);
      this.scene.add(light);
      this.scene.add(light.target);
    }

    // Add flickering red point lights with varying intensities
    this.flickeringLights = [];
    for (let i = 0; i < 8; i++) {
      const light = new THREE.PointLight(
        new THREE.Color(0xff0000).multiplyScalar(0.8 + Math.random() * 0.4),
        1,
        12
      );
      light.position.set(
        Math.random() * 40 - 20,
        2,
        Math.random() * 40 - 20
      );
      light.intensity = 0.5 + Math.random() * 0.5;
      this.flickeringLights.push(light);
      this.scene.add(light);
    }

    // Add subtle pulsing hemisphere light for overall ambiance
    this.hemisphereLight = new THREE.HemisphereLight(0xff0000, 0x000000, 0.3);
    this.scene.add(this.hemisphereLight);
  }

  updateLighting() {
    // Update player light position
    this.playerLight.position.copy(this.camera.position);

    // Update flickering lights
    this.flickeringLights.forEach(light => {
      // Create more complex flickering pattern
      const time = performance.now() * 0.001;
      light.intensity = 0.5 +
        Math.sin(time * 2) * 0.2 +
        Math.sin(time * 4.5) * 0.1 +
        Math.cos(time * 3.7) * 0.15;
    });

    // Subtle pulsing of hemisphere light
    const time = performance.now() * 0.0005;
    this.hemisphereLight.intensity = 0.3 + Math.sin(time) * 0.1;

    // Update static lights to create moving shadows
    this.staticLights.forEach((light, index) => {
      const time = performance.now() * 0.001 + index;
      light.intensity = 0.7 + Math.sin(time * 0.5) * 0.3;
    });
  }

  setupPostProcessing() {
    if (!this.renderer) return;

    this.composer = new EffectComposer(this.renderer);

    // Basic render pass
    const renderPass = new RenderPass(this.scene, this.camera);
    this.composer.addPass(renderPass);

    // Dream color correction
    const dreamColorPass = new ShaderPass(ColorCorrectionShader);
    dreamColorPass.uniforms['powRGB'].value = new THREE.Vector3(1.1, 1.0, 1.2);
    dreamColorPass.uniforms['mulRGB'].value = new THREE.Vector3(1.2, 1.0, 1.1);
    dreamColorPass.uniforms['dreamFactor'].value = 0.7;
    this.composer.addPass(dreamColorPass);

    // Chromatic aberration
    const chromaticPass = new ShaderPass(ChromaticAberrationShader);
    chromaticPass.uniforms['amount'].value = 0.003;
    this.composer.addPass(chromaticPass);

    // Bloom effect
    const bloomPass = new ShaderPass(BloomShader);
    bloomPass.uniforms['bloomStrength'].value = 0.8;
    bloomPass.uniforms['bloomRadius'].value = 0.3;
    this.composer.addPass(bloomPass);

    // Film grain effect
    const filmPass = new FilmPass(
      0.25, // noise intensity
      0.015, // scanline intensity
      648,  // scanline count
      false // grayscale
    );
    this.composer.addPass(filmPass);

    // Vignette effect
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms['darkness'].value = 1.5;
    vignettePass.uniforms['offset'].value = 0.8;
    this.composer.addPass(vignettePass);

    // Store passes for animation
    this.dreamColorPass = dreamColorPass;
    this.chromaticPass = chromaticPass;
    this.bloomPass = bloomPass;
  }

  animatePostProcessing() {
    if (!this.composer || !this.dreamColorPass || !this.chromaticPass || !this.bloomPass) return;

    const time = performance.now() * 0.001;

    // Animate dream effect intensity
    this.dreamColorPass.uniforms['dreamFactor'].value = 0.7 + Math.sin(time * 0.5) * 0.3;

    // Animate chromatic aberration
    this.chromaticPass.uniforms['amount'].value = 0.003 + Math.sin(time) * 0.001;

    // Animate bloom
    this.bloomPass.uniforms['bloomStrength'].value = 0.8 + Math.sin(time * 0.7) * 0.2;
  }

  togglePause() {
    if (!this.active) return;

    this.isPaused = !this.isPaused;
    
    if (this.isPaused) {
      // Unlock controls and freeze game state
      this.controls.unlock();
      this.movementActive = false;
      this.resetMovementStates();
      
      // Show pause UI
      if (!this.pauseMenu) {
        this.createPauseMenu();
      }
      this.pauseMenu.style.display = 'flex';
    } else {
      // Hide pause menu and resume game
      if (this.pauseMenu) {
        this.pauseMenu.style.display = 'none';
      }
      // Re-lock controls after short delay
      setTimeout(() => {
        if (!this.isPaused && this.screens.game.classList.contains('active')) {
          this.controls.lock();
          this.movementActive = true;
        }
      }, 100);
    }
  }

  createPauseMenu() {
    this.pauseMenu = document.createElement('div');
    this.pauseMenu.className = 'pause-menu';
    this.pauseMenu.innerHTML = `
      <div class="pause-menu-content">
        <h2>Game Paused</h2>
        <button id="resume-btn">Resume</button>
        <button id="quit-btn">Quit to Menu</button>
      </div>
    `;

    document.body.appendChild(this.pauseMenu);

    // Add button listeners
    document.getElementById('resume-btn').addEventListener('click', () => {
      this.togglePause();
    });

    document.getElementById('quit-btn').addEventListener('click', () => {
      this.isPaused = false;
      this.pauseMenu.style.display = 'none';
      this.switchScreen('title');
      this.resetGame();
    });
  }

  updateMinimap() {
    if (!this.minimapContext) return;

    // Clear minimap with semi-transparent black background
    this.minimapContext.fillStyle = 'rgba(0, 0, 0, 0.9)';
    this.minimapContext.fillRect(0, 0, this.minimap.width, this.minimap.height);

    // Calculate visible area boundaries
    const centerX = this.camera.position.x;
    const centerZ = this.camera.position.z;
    const viewRadius = this.minimap.width / (2 * this.minimapScale);

    // Draw maze grid for reference
    this.minimapContext.strokeStyle = 'rgba(255, 0, 0, 0.2)';
    this.minimapContext.lineWidth = 0.5;
    const gridSize = 10 * this.minimapScale; // Based on CELL_SIZE from generateChunk
    
    for (let x = -viewRadius; x <= viewRadius; x += 10) {
      const mapX = this.minimap.width/2 + x * this.minimapScale;
      this.minimapContext.beginPath();
      this.minimapContext.moveTo(mapX, 0);
      this.minimapContext.lineTo(mapX, this.minimap.height);
      this.minimapContext.stroke();
    }
    
    for (let z = -viewRadius; z <= viewRadius; z += 10) {
      const mapZ = this.minimap.height/2 + z * this.minimapScale;
      this.minimapContext.beginPath();
      this.minimapContext.moveTo(0, mapZ);
      this.minimapContext.lineTo(this.minimap.width, mapZ);
      this.minimapContext.stroke();
    }

    // Draw visible walls with glow effect
    if (this.collisionWalls) {
      // Draw glow
      this.minimapContext.shadowColor = '#ff0000';
      this.minimapContext.shadowBlur = 10;
      this.minimapContext.shadowOffsetX = 0;
      this.minimapContext.shadowOffsetY = 0;
      
      this.minimapContext.fillStyle = '#600';
      this.collisionWalls.forEach(wall => {
        // Check if wall is within minimap view
        const dx = wall.position.x - centerX;
        const dz = wall.position.z - centerZ;
        if (Math.abs(dx) < viewRadius && Math.abs(dz) < viewRadius) {
          // Convert world coordinates to minimap coordinates
          const mapX = this.minimap.width/2 + dx * this.minimapScale;
          const mapZ = this.minimap.height/2 + dz * this.minimapScale;
          
          // Draw wall segment with enhanced visibility
          this.minimapContext.save();
          this.minimapContext.translate(mapX, mapZ);
          this.minimapContext.rotate(wall.rotation.y);
          this.minimapContext.fillRect(-5, -2, 10, 4); // Slightly thicker walls
          this.minimapContext.restore();
        }
      });

      // Reset shadow for other elements
      this.minimapContext.shadowBlur = 0;
    }

    // Draw player (white dot with direction indicator)
    this.minimapContext.fillStyle = '#fff';
    const playerX = this.minimap.width/2;
    const playerZ = this.minimap.height/2;
    
    // Player position dot with glow
    this.minimapContext.shadowColor = '#fff';
    this.minimapContext.shadowBlur = 10;
    this.minimapContext.beginPath();
    this.minimapContext.arc(playerX, playerZ, 3, 0, Math.PI * 2);
    this.minimapContext.fill();

    // Player direction indicator
    this.minimapContext.beginPath();
    this.minimapContext.moveTo(playerX, playerZ);
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    this.minimapContext.lineTo(
      playerX + direction.x * 15,
      playerZ + direction.z * 15
    );
    this.minimapContext.strokeStyle = '#fff';
    this.minimapContext.lineWidth = 2;
    this.minimapContext.stroke();

    // Draw enemy (red dot with glow)
    if (this.enemy) {
      const dx = this.enemy.position.x - centerX;
      const dz = this.enemy.position.z - centerZ;
      if (Math.abs(dx) < viewRadius && Math.abs(dz) < viewRadius) {
        this.minimapContext.shadowColor = '#f00';
        this.minimapContext.shadowBlur = 15;
        this.minimapContext.fillStyle = '#f00';
        const enemyX = this.minimap.width/2 + dx * this.minimapScale;
        const enemyZ = this.minimap.height/2 + dz * this.minimapScale;
        this.minimapContext.beginPath();
        this.minimapContext.arc(enemyX, enemyZ, 4, 0, Math.PI * 2);
        this.minimapContext.fill();
      }
    }

    // Reset shadow
    this.minimapContext.shadowBlur = 0;

    // Draw minimap border with glow
    this.minimapContext.strokeStyle = '#f00';
    this.minimapContext.lineWidth = 2;
    this.minimapContext.shadowColor = '#f00';
    this.minimapContext.shadowBlur = 8;
    this.minimapContext.strokeRect(0, 0, this.minimap.width, this.minimap.height);

    // Draw explored area overlay
    this.minimapContext.fillStyle = 'rgba(255, 0, 0, 0.1)';
    this.minimapContext.fillRect(0, 0, this.minimap.width, this.minimap.height);
  }

  setupHorrorMessages() {
    // Create container for horror messages
    this.horrorMessageContainer = document.createElement('div');
    this.horrorMessageContainer.className = 'horror-message-container';
    document.body.appendChild(this.horrorMessageContainer);

    this.activeMessages = new Set();
    this.lastMessageTime = 0;
    this.messageTimeout = null;
  }

  setupTitleHorrorMessages() {
    const titleScreen = document.getElementById('title-screen');
    const messagesContainer = document.createElement('div');
    messagesContainer.className = 'title-horror-messages';
    titleScreen.appendChild(messagesContainer);

    const spawnTitleMessage = () => {
      if (!titleScreen.classList.contains('active')) return;

      const message = document.createElement('div');
      message.className = 'title-horror-message';
      message.textContent = this.horrorMessages[Math.floor(Math.random() * this.horrorMessages.length)];

      // Random position
      message.style.left = Math.random() * 80 + 10 + '%';
      message.style.top = Math.random() * 80 + 10 + '%';
      message.style.fontSize = (Math.random() * 2 + 2) + 'em';

      messagesContainer.appendChild(message);

      // Remove message after animation
      setTimeout(() => {
        message.remove();
      }, 4000);
    };

    // Start spawning messages
    setInterval(spawnTitleMessage, 3000);
  }

  showHorrorMessage(violent = false) {
    if (this.activeMessages.size >= 3) return;

    const now = performance.now();
    if (now - this.lastMessageTime < 2000) return;

    const message = document.createElement('div');
    message.className = 'horror-message';
    if (violent) message.classList.add('violent');
    
    message.textContent = this.horrorMessages[Math.floor(Math.random() * this.horrorMessages.length)];

    this.horrorMessageContainer.appendChild(message);
    this.activeMessages.add(message);

    // Trigger animation
    requestAnimationFrame(() => {
      message.classList.add('active');
    });

    this.lastMessageTime = now;

    // Remove message after delay
    setTimeout(() => {
      message.classList.remove('active');
      setTimeout(() => {
        message.remove();
        this.activeMessages.delete(message);
      }, 300);
    }, 3000);
  }

  initializeMinimap() {
    this.minimap = document.getElementById('minimap');
    this.minimapContext = this.minimap.getContext('2d');
    
    // Set minimap size
    this.minimap.width = 200;
    this.minimap.height = 200;
  }

  updateStats() {
    if (!this.statsContainer) return;

    // Update steps
    const stepsElement = document.getElementById('steps-stat');
    if (stepsElement) {
      stepsElement.textContent = this.statistics.steps;
    }

    // Update jumpscares
    const jumpscareElement = document.getElementById('jumpscares-stat');
    if (jumpscareElement) {
      jumpscareElement.textContent = this.statistics.jumpscares;
    }

    // Update coordinates
    const coordElement = document.getElementById('coordinates-stat');
    if (coordElement) {
      coordElement.textContent = `X: ${Math.round(this.camera.position.x)}, Z: ${Math.round(this.camera.position.z)}`;
    }
  }

  triggerJumpscare() {
    this.statistics.jumpscares++;
    this.updateStats();
    
    this.jumpscare.classList.remove('hidden');
    
    // Play jumpscare sound if available
    
    setTimeout(() => {
      this.jumpscare.classList.add('hidden');
      this.switchScreen('gameOver');
    }, 1000);
  }

  switchScreen(screenName) {
    // Validate screen name
    if (!this.screens[screenName]) {
      console.error(`Invalid screen name: ${screenName}`);
      return;
    }

    // Remove 'active' class from all screens
    Object.values(this.screens).forEach(screen => {
      if (screen) {
        screen.classList.remove('active');
      }
    });

    // Add 'active' class to target screen
    this.screens[screenName].classList.add('active');

    // Show/hide stats and minimap based on game state
    const statsContainer = document.getElementById('stats-container');
    const minimapContainer = document.getElementById('minimap-container');

    if (screenName === 'game') {
      // Only show stats and minimap in active game
      if (statsContainer) {
        statsContainer.style.display = 'block';
        // Force immediate stats update
        this.updateStats();
      }
      if (minimapContainer) {
        minimapContainer.style.display = 'block';
      }
    } else {
      // Hide stats and minimap for all other screens
      if (statsContainer) statsContainer.style.display = 'none';
      if (minimapContainer) minimapContainer.style.display = 'none';
    }
  }

  resetMovementStates() {
    if (!this.movementKeys) return; // Guard against undefined

    Object.keys(this.movementKeys).forEach(key => {
      this.movementKeys[key] = false;
    });
    this.moveForward = false;
    this.moveBackward = false;
    this.moveLeft = false;
    this.moveRight = false;
    if (this.currentVelocity) {
      this.currentVelocity.set(0, 0, 0);
    }
    if (this.targetVelocity) {
      this.targetVelocity.set(0, 0, 0);
    }
  }

  resetGame() {
    // Reset all game state
    this.active = false;
    this.movementActive = false;
    this.isPaused = false;
    this.resetMovementStates();
    
    // Reset enemy position
    if (this.enemy) {
      this.enemy.position.set(0, 2, 0);
    }
    
    // Reset player position
    this.camera.position.set(0, this.groundHeight, 0);
    
    // Reset statistics
    this.statistics = {
      steps: 0,
      jumpscares: 0,
      lastPosition: new THREE.Vector3(),
      stepThreshold: 0.4,
      lastStepTime: 0,
      stepCooldown: 250
    };
    
    // Reset UI elements
    if (this.eerinessBar) this.eerinessBar.style.width = '0%';
    if (this.fearBar) this.fearBar.style.width = '0%';

    // Add pause state tracking
    this.isPaused = false;
  }

  horrorMessages = [
    "Keep away...",
    "Dreadfet is coming...",
    "Run for your life...",
    "Jafet is the food for Dreadfet...",
    "He's getting closer...",
    "Can't escape yourself...",
    "Your reflection hungers...",
    "The maze claims all...",
    "No way out...",
    "The darkness feeds..."
  ];

  initializeStats() {
    this.statsContainer = document.getElementById('stats-container');
    if (!this.statsContainer) {
      this.statsContainer = document.createElement('div');
      this.statsContainer.id = 'stats-container';
      document.body.appendChild(this.statsContainer);
    }

    // Initialize statistics display
    this.statsContainer.innerHTML = `
      <div class="stat-item">
        <div class="stat-label">Steps Taken</div>
        <div class="stat-value" id="steps-stat">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Jumpscares</div>
        <div class="stat-value" id="jumpscares-stat">0</div>
      </div>
      <div class="stat-item">
        <div class="stat-label">Coordinates</div>
        <div class="stat-value" id="coordinates-stat">X: 0, Z: 0</div>
      </div>
    `;
  }
}

// Initialize game only after DOM is fully loaded
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
    window.game.animate();
  } catch (error) {
    console.error('Error initializing game:', error);
  }
});