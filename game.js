import * as THREE from 'https://cdn.skypack.dev/three@0.132.2';
import { PointerLockControls } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/controls/PointerLockControls.js';
import { GLTFLoader } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/loaders/GLTFLoader.js';
import { EffectComposer } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/postprocessing/ShaderPass.js';
import { FilmPass } from 'https://cdn.skypack.dev/three@0.132.2/examples/jsm/postprocessing/FilmPass.js';

class Game {
  constructor() {
    // Initialize velocity vectors first
    this.currentVelocity = new THREE.Vector3();
    this.targetVelocity = new THREE.Vector3();

    // Initialize movement flags
    this.moveForward = false;
    this.moveBackward = false; 
    this.moveLeft = false;
    this.moveRight = false;

    // Keep existing constructor setup
    this.setupScreens();
    this.setupThreeJS();
    this.loadTextures();
    this.setupPlayer();
    this.setupEnemy();
    this.setupMeters();
    this.generateLevel();
    this.bindEvents();
    
    // Movement settings
    this.mouseSensitivity = 0.002;
    this.difficulty = 'normal';
    this.moveSpeed = 0.15;
    this.runSpeed = 0.3;
    this.isRunning = false;
    
    // Bobbing settings 
    this.walkBobSpeed = 0.008;
    this.walkBobAmount = 0.15;
    this.runBobSpeed = 0.012;
    this.runBobAmount = 0.25;
    this.bobPhase = 0;
    this.isMoving = false;
    
    // Movement smoothing
    this.movementSmoothing = 0.15;
    this.heightSmoothing = 0.2;
    this.currentHeight = 2;
    this.targetHeight = 2;
    
    // Additional movement variables
    this.acceleration = 0.2;
    this.deceleration = 0.3;
    this.maxVelocity = new THREE.Vector3(1, 1, 1);
    
    // Initialize footstep timing
    this.lastFootstep = 0;
    this.footstepInterval = 500;
    this.runningFootstepInterval = 300;
    
    // Performance settings
    this.chunkLoadDistance = 1;
    this.renderer.setPixelRatio(window.devicePixelRatio || 1);
    
    // Enable shadow mapping
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Camera settings
    this.camera.far = 100;
    
    // Performance monitoring
    this.lastTime = performance.now();
    this.frames = 0;
    this.currentFPS = 60;
    
    // Movement state
    this.movementActive = false;
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
    
    // Overlays
    this.fearOverlay = document.getElementById('fear-overlay');
    this.eerinessOverlay = document.getElementById('eeriness-overlay');
    
    // Save points
    this.savePoints = new Set();
    
    // 3D models
    this.gltfLoader = new GLTFLoader();
    this.typewriterModel = null;

    // Initialize difficulty settings
    this.difficultySettings = {
      veryEasy: {
        enemySpeed: 0.05,
        catchDistance: 2
      },
      easy: {
        enemySpeed: 0.08,
        catchDistance: 2.5
      },
      normal: {
        enemySpeed: 0.12,
        catchDistance: 3
      },
      hard: {
        enemySpeed: 0.15,
        catchDistance: 3.5
      },
      nightmare: {
        enemySpeed: 0.2,
        catchDistance: 4
      }
    };

    // Initialize robust state management for pointer lock
    this.lockState = {
      active: false,
      pending: false,
      error: null
    };

    // Enhanced reset function
    this.resetMovementStates = () => {
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
    };

    // Enhanced lighting setup
    this.setupLighting();
    this.setupPostProcessing();
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
    this.eeriness = 0;
    this.fear = 0;
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
          this.addWall(hallwayGroup, 0, -CELL_SIZE/2, 0);
        }
        if (cell.walls.south) {
          this.addWall(hallwayGroup, 0, CELL_SIZE/2, 0);
        }
        if (cell.walls.east) {
          this.addWall(hallwayGroup, CELL_SIZE/2, 0, Math.PI/2);
        }
        if (cell.walls.west) {
          this.addWall(hallwayGroup, -CELL_SIZE/2, 0, Math.PI/2);
        }

        // Add ceiling
        const ceilingGeometry = new THREE.PlaneGeometry(CELL_SIZE, CELL_SIZE);
        const ceiling = new THREE.Mesh(ceilingGeometry, new THREE.MeshPhongMaterial({ 
          map: this.wallTexture,
          side: THREE.DoubleSide
        }));
        ceiling.rotation.x = Math.PI/2;
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
    let currentCell = { x: Math.floor(width/2), z: Math.floor(height/2) };
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
    switch(direction) {
      case 'north':
        door.position.set(0, 1.5, -cellSize/2);
        door.rotation.y = 0;
        break;
      case 'south':
        door.position.set(0, 1.5, cellSize/2);
        door.rotation.y = Math.PI;
        break;
      case 'east':
        door.position.set(cellSize/2, 1.5, 0);
        door.rotation.y = Math.PI/2;
        break;
      case 'west':
        door.position.set(-cellSize/2, 1.5, 0);
        door.rotation.y = -Math.PI/2;
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
    const startBtn = document.getElementById('start-btn');
    const retryBtn = document.getElementById('retry-btn');
    const difficultyBtns = {
      veryEasy: document.getElementById('veryEasy-btn'),
      easy: document.getElementById('easy-btn'),
      normal: document.getElementById('normal-btn'),
      hard: document.getElementById('hard-btn'),
      nightmare: document.getElementById('nightmare-btn')
    };

    if (startBtn) {
      startBtn.addEventListener('click', () => this.startGame());
    }
    
    if (retryBtn) {
      retryBtn.addEventListener('click', () => this.startGame());
    }

    // Add difficulty button listeners with error checking
    Object.entries(difficultyBtns).forEach(([difficulty, btn]) => {
      if (btn) {
        btn.addEventListener('click', () => this.setDifficulty(difficulty));
      }
    });

    document.addEventListener('keydown', (event) => this.onKeyDown(event));
    document.addEventListener('keyup', (event) => this.onKeyUp(event));
    
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    
    // Add interaction key for save points
    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyE') {
        this.checkSavePointInteraction();
      }
    });
  }

  startGame(isMultiplayer = false) {
    this.switchScreen('difficulty');
  }

  setDifficulty(level) {
    this.difficulty = level;
    this.switchScreen('loading');
    
    let progress = 0;
    const loadingInterval = setInterval(() => {
      progress += 1;
      this.progressBar.style.width = `${progress}%`;
      
      if(progress >= 100) {
        clearInterval(loadingInterval);
        this.switchScreen('game');
        this.showClickToContinue();
      }
    }, 50);
  }

  switchScreen(screenName) {
    // Validate screen name
    if (!this.screens[screenName]) {
      console.error(`Invalid screen name: ${screenName}`);
      return;
    }

    // Remove 'active' class from all screens
    Object.values(this.screens).forEach(screen => {
      if (screen) { // Null check
        screen.classList.remove('active');
      }
    });

    // Add 'active' class to target screen
    this.screens[screenName].classList.add('active');
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
      this.saveMenu.innerHTML = `
        <div class="save-menu-content">
          <h2>Save Progress</h2>
          <div class="save-slots">
            ${Array(3).fill(0).map((_, i) => `
              <div class="save-slot" data-slot="${i + 1}">
                <h3>Slot ${i + 1}</h3>
                <button class="save-btn">Save</button>
                <button class="load-btn">Load</button>
              </div>
            `).join('')}
          </div>
          <button class="close-btn">Close</button>
        </div>
      `;
      
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
    
    localStorage.setItem(`save_slot_${slot}`, JSON.stringify(saveData));
    alert(`Game saved in slot ${slot}`);
  }

  loadGame(slot) {
    const saveData = localStorage.getItem(`save_slot_${slot}`);
    
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
  }

  onKeyDown(event) {
    if (this.controls && !this.controls.isLocked || !this.movementActive) return;
    
    // Track key state
    if (event.code in this.movementKeys) {
      this.movementKeys[event.code] = true;
      event.preventDefault();
    }

    // Handle sprint key (Shift)
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') {
      this.isRunning = true;
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
    }

    // Update movement flags
    this.moveForward = this.movementKeys.KeyW || this.movementKeys.ArrowUp;
    this.moveBackward = this.movementKeys.KeyS || this.movementKeys.ArrowDown;
    this.moveLeft = this.movementKeys.KeyA || this.movementKeys.ArrowLeft;
    this.moveRight = this.movementKeys.KeyD || this.movementKeys.ArrowRight;
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
    const composer = new EffectComposer(this.renderer);
    
    // Render pass
    const renderPass = new RenderPass(this.scene, this.camera);
    composer.addPass(renderPass);
    
    // Film grain and scanlines with adjusted values
    const filmPass = new FilmPass(
      0.35,  // noise intensity
      0.025,  // scanline intensity
      648,    // scanline count
      false   // grayscale
    );
    composer.addPass(filmPass);
    
    // Enhanced color correction for red atmosphere
    const effectColor = new ShaderPass(ColorCorrectionShader);
    effectColor.uniforms['powRGB'].value = new THREE.Vector3(1.2, 0.8, 0.8);
    effectColor.uniforms['mulRGB'].value = new THREE.Vector3(1.3, 0.7, 0.7);
    composer.addPass(effectColor);
    
    // Stronger vignette effect
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.uniforms['darkness'].value = 1.8;
    vignettePass.uniforms['offset'].value = 0.95;
    composer.addPass(vignettePass);

    this.composer = composer;
  }

  updatePlayerPosition() {
    if (!this.controls.isLocked || !this.movementActive) return;

    const moveVector = new THREE.Vector3();
    const playerDirection = new THREE.Vector3();
    this.camera.getWorldDirection(playerDirection);

    // Track if player is moving
    const wasMoving = this.isMoving;
    this.isMoving = false;

    if (this.moveForward || this.moveBackward || this.moveLeft || this.moveRight) {
      this.isMoving = true;
    }

    // Calculate movement vector based on camera direction
    if (this.moveForward) moveVector.add(playerDirection);
    if (this.moveBackward) moveVector.sub(playerDirection);
    
    // Calculate right vector
    const rightVector = new THREE.Vector3();
    rightVector.crossVectors(playerDirection, new THREE.Vector3(0, 1, 0)).normalize();
    
    if (this.moveLeft) moveVector.sub(rightVector);
    if (this.moveRight) moveVector.add(rightVector);

    // Normalize and apply movement speed with acceleration
    if (moveVector.length() > 0) {
      moveVector.normalize();
      const currentSpeed = this.isRunning ? this.runSpeed : this.moveSpeed;
      this.targetVelocity.copy(moveVector).multiplyScalar(currentSpeed);
      
      // Apply acceleration
      this.currentVelocity.lerp(this.targetVelocity, this.acceleration);
    } else {
      // Apply deceleration
      this.currentVelocity.lerp(new THREE.Vector3(0, 0, 0), this.deceleration);
    }

    // Calculate new position
    const newPosition = this.camera.position.clone().add(this.currentVelocity);

    // Collision detection
    let canMove = true;
    const playerRadius = 0.5;
    
    this.collisionWalls?.forEach(wall => {
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

    if (canMove) {
      // Update horizontal position
      this.camera.position.add(this.currentVelocity);
      
      // Enhanced head bobbing
      if (this.isMoving) {
        // Determine bobbing parameters based on movement state
        const bobSpeed = this.isRunning ? this.runBobSpeed : this.walkBobSpeed;
        const bobAmount = this.isRunning ? this.runBobAmount : this.walkBobAmount;
        
        // Update bob phase
        this.bobPhase += bobSpeed;
        
        // Calculate vertical bob with slight forward lean
        const verticalBob = Math.sin(this.bobPhase) * bobAmount;
        const forwardLean = this.isRunning ? 0.1 : 0.05; // Subtle forward lean
        
        // Calculate target height with bob and lean
        this.targetHeight = 2 + verticalBob - forwardLean;
        
        // Handle footstep timing
        const currentTime = performance.now();
        const stepInterval = this.isRunning ? this.runningFootstepInterval : this.footstepInterval;
        
        if (currentTime - this.lastFootstep > stepInterval) {
          this.lastFootstep = currentTime;
          // Could add footstep sound here if desired
        }
      } else {
        // Smoothly return to default height when not moving
        this.targetHeight = 2;
      }
      
      // Smooth height transition
      this.currentHeight += (this.targetHeight - this.currentHeight) * this.heightSmoothing;
      this.camera.position.y = this.currentHeight;
    }
  }

  updateEnemy() {
    const settings = this.difficultySettings[this.difficulty];
    
    const direction = new THREE.Vector3();
    direction.subVectors(this.camera.position, this.enemy.position);
    direction.normalize();
    
    this.enemy.position.add(direction.multiplyScalar(settings.enemySpeed));
    
    // Check if enemy caught player
    if(this.enemy.position.distanceTo(this.camera.position) < settings.catchDistance) {
      this.triggerJumpscare();
    }
    
    // Update eeriness based on distance
    const distance = this.enemy.position.distanceTo(this.camera.position);
    this.eeriness = Math.max(0, Math.min(100, 100 - (distance * 2)));
    this.fear = Math.max(0, Math.min(100, 100 - (distance * 4)));
    
    // Update meters
    this.eerinessBar.style.width = `${this.eeriness}%`;
    this.fearBar.style.width = `${this.fear}%`;
    
    // Update overlay effects
    this.fearOverlay.style.opacity = this.fear / 200; // Softer effect
    this.eerinessOverlay.style.opacity = this.eeriness / 200;
  }

  triggerJumpscare() {
    // Immediately stop player movement
    this.movementActive = false;
    this.controls.unlock();
    
    // Show jumpscare immediately
    this.jumpscare.classList.remove('hidden');
    
    // Shorter delay before game over
    setTimeout(() => {
      this.jumpscare.classList.add('hidden');
      this.switchScreen('gameOver');
      this.resetGame();
    }, 500); // Reduced from 1000ms to 500ms for faster response
  }

  resetGame() {
    this.camera.position.set(0, 2, 0);
    this.enemy.position.set(10, 2, 10);
    this.eeriness = 0;
    this.fear = 0;
    this.eerinessBar.style.width = '0%';
    this.fearBar.style.width = '0%';
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    
    // Calculate FPS
    const currentTime = performance.now();
    this.frames++;
    
    if (currentTime > this.lastTime + 1000) {
      this.currentFPS = Math.round((this.frames * 1000) / (currentTime - this.lastTime));
      this.frames = 0;
      this.lastTime = currentTime;
    }
    
    if(this.controls.isLocked) {
      this.updatePlayerPosition();
      this.updateEnemy();
      this.updateLighting();
      
      // Only update chunks every few frames for better performance
      if(this.frames % 3 === 0) {
        this.updateChunks();
      }
    }
    
    // Use composer instead of renderer
    this.composer.render();
  }
}

const ColorCorrectionShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'powRGB': { value: new THREE.Vector3(1.2, 0.8, 0.8) },
    'mulRGB': { value: new THREE.Vector3(1.3, 0.7, 0.7) }
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
    varying vec2 vUv;
    void main() {
      vec4 color = texture2D(tDiffuse, vUv);
      color.rgb = mulRGB * pow(color.rgb, powRGB);
      color.rgb = mix(color.rgb, vec3(color.r * 1.2, color.g * 0.8, color.b * 0.8), 0.3);
      gl_FragColor = color;
    }
  `
};

const VignetteShader = {
  uniforms: {
    'tDiffuse': { value: null },
    'offset': { value: 0.95 },
    'darkness': { value: 1.8 }
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
      vec4 color = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - 0.5) * 2.0;
      float vignet = 1.0 - dot(uv, uv) * offset;
      vignet = pow(vignet, darkness);
      color.rgb = mix(color.rgb, color.rgb * vec3(1.0, 0.8, 0.8), 0.5) * vignet;
      gl_FragColor = color;
    }
  `
};

const game = new Game();
game.animate();