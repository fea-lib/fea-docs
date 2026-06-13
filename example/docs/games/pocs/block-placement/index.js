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
  const gridWidth = 10;
  const gridHeight = 8;
  let worldTiles = Array.from({ length: gridWidth }, () =>
    Array(gridHeight).fill(0)
  );

  function preload() {
    this.load.image("block", "https://labs.phaser.io/assets/sprites/block.png");
  }

  function create() {
    this.input.on("pointerdown", (pointer) => {
      const tileX = Math.floor(pointer.worldX / tileSize);
      const tileY = Math.floor(pointer.worldY / tileSize);
      if (
        tileX >= 0 &&
        tileX < gridWidth &&
        tileY >= 0 &&
        tileY < gridHeight &&
        worldTiles[tileX][tileY] === 0
      ) {
        worldTiles[tileX][tileY] = 1;
        // Add a block sprite that fills the tile (48x48)
        const block = this.add.sprite(
          tileX * tileSize + tileSize / 2,
          tileY * tileSize + tileSize / 2,
          "block"
        );
        block.displayWidth = tileSize;
        block.displayHeight = tileSize;
      }
    });
    // Draw grid lines for clarity
    for (let x = 0; x <= gridWidth; x++) {
      this.add
        .line(
          0,
          0,
          x * tileSize,
          0,
          x * tileSize,
          gridHeight * tileSize,
          0x888888
        )
        .setOrigin(0);
    }
    for (let y = 0; y <= gridHeight; y++) {
      this.add
        .line(
          0,
          0,
          0,
          y * tileSize,
          gridWidth * tileSize,
          y * tileSize,
          0x888888
        )
        .setOrigin(0);
    }
  }

  const config = {
    type: Phaser.AUTO,
    width: tileSize * gridWidth,
    height: tileSize * gridHeight,
    backgroundColor: "#bada55",
    parent: "game-container",
    scene: {
      preload,
      create,
    },
  };

  new Phaser.Game(config);
});
