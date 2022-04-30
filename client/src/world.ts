import * as PixiJS from "pixi.js";
import { State, View } from "./render";

export interface Animation {
  textures: PixiJS.Texture[];
  speed: number;
}

export function animation({ textures, speed }: Animation) {
  return () => {
    const sprite = new PixiJS.AnimatedSprite(textures);
    sprite.anchor.set(0.5);
    sprite.animationSpeed = speed;
    sprite.play();
    return sprite;
  };
}

export interface Context {
  sprites: {
    [sprite: string]: {
      [name: string]: ReturnType<typeof animation>;
    };
  };
}

export interface PersonState extends State {
  isGhost: number;
  sprite: string;
  animation: string;
  x: number;
  y: number;
}

export class Person extends View<PersonState, PixiJS.Container> {
  static SIDeep = "x y";

  public sprite: string;

  public animation: string;

  constructor(public readonly context: Context, state: PersonState) {
    super(new PixiJS.Container(), state);
    this.sprite = state.sprite;
    this.animation = state.animation;
    this.playAnimation();
  }

  playAnimation() {
    this.view.removeChildren();
    this.view.addChild(this.context.sprites[this.sprite][this.animation]());
  }

  render({ x, y, sprite, animation }: PersonState) {
    this.view.position.set(x, y);
    if (this.sprite !== sprite) {
      this.sprite = sprite;
      this.playAnimation();
    }
    if (this.animation !== animation) {
      this.animation = animation;
      this.playAnimation();
    }
  }
}

export interface CoinState extends State {
  x: number;
  y: number;
}

export class Coin extends View<CoinState, PixiJS.Graphics> {
  static SIDeep = "x y";

  constructor(context: Context, state: CoinState) {
    super(new PixiJS.Graphics(), state);
    this.view.beginFill(0xffff00);
    this.view.drawCircle(0, 0, 3);
    this.view.endFill();
  }

  render({ x, y }: CoinState) {
    this.view.position.set(x, y);
  }
}
