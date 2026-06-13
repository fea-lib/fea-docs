// Dynamically load Phaser, then run the game code
function loadPhaserAndRun(main) {
  if (window.Phaser) return main();
  var script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/phaser@3/dist/phaser.js";
  script.onload = main;
  document.head.appendChild(script);
}

loadPhaserAndRun(function () {
  let player;
  let isDragging = false;
  let target = null;
  const moveSpeed = 1; // px per frame

  function preload() {
    this.load.image(
      "player",
      "https://labs.phaser.io/assets/sprites/phaser-dude.png"
    );
  }

  function create() {
    player = this.add
      .sprite(
        this.sys.game.config.width / 2,
        this.sys.game.config.height / 2,
        "player"
      )
      .setScale(2);

    // Use the canvas element for pointer events for better reliability
    const canvas = this.sys.game.canvas;
    let pointerMoveHandler = null;
    let pointerUpHandler = null;

    canvas.addEventListener("pointerdown", (e) => {
      isDragging = true;
      target = { x: e.offsetX, y: e.offsetY };

      pointerMoveHandler = (ev) => {
        if (isDragging) {
          target = { x: ev.offsetX, y: ev.offsetY };
        }
      };
      canvas.addEventListener("pointermove", pointerMoveHandler);

      pointerUpHandler = () => {
        isDragging = false;
        target = null;
        canvas.removeEventListener("pointermove", pointerMoveHandler);
        canvas.removeEventListener("pointerup", pointerUpHandler);
      };
      canvas.addEventListener("pointerup", pointerUpHandler);
    });
  }

  function update() {
    if (isDragging && target) {
      const dx = target.x - player.x;
      const dy = target.y - player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > moveSpeed) {
        player.x += (dx / dist) * moveSpeed;
        player.y += (dy / dist) * moveSpeed;
      } else {
        player.x = target.x;
        player.y = target.y;
      }
    }
  }

  const config = {
    type: Phaser.AUTO,
    width: window.innerWidth,
    height: window.innerHeight,
    backgroundColor: "#87ceeb",
    parent: "game-container",
    scene: {
      preload,
      create,
      update,
    },
  };

  new Phaser.Game(config);
});
