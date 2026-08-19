// Dynamically load Phaser, then run the game code
function loadPhaserAndRun(main) {
  if (window.Phaser) return main();
  var script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.js";
  script.onload = main;
  document.head.appendChild(script);
}

loadPhaserAndRun(function () {
  const tileSize = 48;
  const maxWidth = 1280;
  const maxHeight = 800;

  function getResponsiveConfig() {
    const width = Math.min(window.innerWidth, maxWidth);
    const height = Math.min(window.innerHeight, maxHeight);
    return { width, height };
  }

  const { width, height } = getResponsiveConfig();

  const config = {
    type: Phaser.AUTO,
    parent: "game-container",
    width,
    height,
    backgroundColor: "#333",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    scene: {
      preload,
      create,
      update,
    },
    physics: {
      default: "arcade",
      arcade: { debug: false },
    },
  };

  let player;
  let cursors;
  let camera;

  function preload() {
    // Placeholder: load a simple square as player
    this.textures.generate("player", { data: ["3"], pixelWidth: tileSize });
  }

  function create() {
    // Add player sprite in center
    player = this.physics.add.sprite(width / 2, height / 2, "player");
    player.setDisplaySize(tileSize, tileSize);
    player.setCollideWorldBounds(true);

    camera = this.cameras.main;
    camera.startFollow(player, true, 0.1, 0.1);

    // Responsive camera zoom
    let desiredTiles = Math.max(8, Math.min(Math.floor(width / tileSize), 16));
    let zoom = width / (tileSize * desiredTiles);
    camera.setZoom(zoom);

    // Handle window resize
    window.addEventListener("resize", () => {
      const { width: newWidth, height: newHeight } = getResponsiveConfig();
      this.scale.resize(newWidth, newHeight);
      // Recalculate zoom
      desiredTiles = Math.max(8, Math.min(Math.floor(newWidth / tileSize), 16));
      zoom = newWidth / (tileSize * desiredTiles);
      camera.setZoom(zoom);
    });
  }

  function update() {
    // No movement logic yet
  }

  new Phaser.Game(config);
});
