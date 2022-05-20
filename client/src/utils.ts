import * as PixiJS from "pixi.js";
import { signal } from "../../server/src/signal";
import { Keyboard as YandeuKeyboard } from "@yandeu/keyboard";

export interface Animation {
  speed: number;
  frames: [number, number, number, number][];
}

export interface Sprite {
  url: string;
  animations: {
    [animation: number]: Animation;
  };
}

export const playAnimation =
  (
    resources: Record<number, { texture?: PixiJS.Texture }>,
    sprites: { [sprite: number]: Sprite }
  ) =>
  (sprite: number, animation: number): PixiJS.AnimatedSprite => {
    const texture = resources[sprite].texture;
    if (!texture) {
      throw new Error(`Texture for sprite "${sprite}" not found`);
    }
    const { animations } = sprites[sprite];
    const { speed, frames } = animations[animation];
    const view = new PixiJS.AnimatedSprite(
      frames.map(
        ([x, y, w, h]) =>
          new PixiJS.Texture(
            texture.baseTexture,
            new PixiJS.Rectangle(x, y, w, h)
          )
      )
    );
    view.anchor.set(0.5);
    view.animationSpeed = speed;
    view.play();
    return view;
  };

export function keyboard<K extends string>(
  keys: Record<KeyboardEvent["code"], K>,
  listener: (e: { type: "down" | "up"; key: K }) => any = () => {}
) {
  const on = signal(listener);
  const keyboard = new YandeuKeyboard();
  const codes = Object.keys(keys).join(" ");
  keyboard.on.down(codes, (key) => on({ type: "down", key: keys[key] }));
  keyboard.on.up(codes, (key) => on({ type: "up", key: keys[key] }));

  return { keyboard, on };
}
