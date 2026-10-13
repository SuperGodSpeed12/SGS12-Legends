import { Game } from "./core/Game";

const canvas = document.getElementById("game") as HTMLCanvasElement;
const game = new Game(canvas);

let lastTime = 0;
function loop(time: number) {
  const dt = Math.min((time - lastTime) / 1000, 1 / 30);
  lastTime = time;
  game.update(dt);
  game.render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
