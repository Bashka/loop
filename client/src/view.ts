import * as PixiJS from "pixi.js";
import { Render } from "./render";
import { playAnimation } from "./utils";

export interface Context {
  playAnimation: (sprite: number, animation: number) => PixiJS.AnimatedSprite;
}

export const personView = ({ playAnimation }: Context) =>
  new Render<{
    id: string;
    sprite: number;
    animation: number;
    x: number;
    y: number;
  }>(
    ({ x, y, sprite, animation }) => {
      const view = new PixiJS.Container();
      view.zIndex = 2;
      view.position.set(x, y);
      view.addChild(playAnimation(sprite, animation));
      return { view, sprite, animation };
    },
    ({ x, y, sprite, animation }, view) => {
      view.view.position.set(x, y);
      if (sprite !== view.sprite) {
        view.sprite = sprite;
        view.view.removeChildren();
        view.view.addChild(playAnimation(sprite, animation));
      }
      if (animation !== view.animation) {
        view.animation = animation;
        view.view.removeChildren();
        view.view.addChild(playAnimation(sprite, animation));
      }
    }
  );

export const coinView = (context: Context) =>
  new Render<{
    id: string;
    x: number;
    y: number;
  }>(
    ({ x, y }) => {
      const view = new PixiJS.Graphics();
      view.zIndex = 1;
      view.beginFill(0xffff00);
      view.drawCircle(0, 0, 3);
      view.endFill();
      view.position.set(x, y);
      return { view };
    },
    ({ x, y }, { view }) => {
      view.position.set(x, y);
    }
  );
