import { ClientChannel } from "@geckos.io/client";
import * as PixiJS from "pixi.js";
import { signal } from "../../server/src/signal";
import serializer from "../../server/src/model/schema";
import { Render, Room, Stage } from "./render";
import { playAnimation, Sprite, keyboard } from "./utils";

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

export const coinView = () =>
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

export default class implements Room {
  public readonly pixi: PixiJS.Application;

  public readonly onCreated = signal<Stage<any> | Error>();

  constructor(
    public readonly channel: ClientChannel,
    public readonly options: {
      fps: number;
      width: number;
      height: number;
      map: any;
      sprites: { [n: number]: Sprite };
    }
  ) {
    this.pixi = new PixiJS.Application({
      width: options.width,
      height: options.height,
    });
    this.pixi.loader
      .add("tileimg", options.map.tileset.image.url)
      .add(
        Object.entries(options.sprites).map(([name, { url }]) => ({
          name,
          url,
        }))
      )
      .load((_, resources) => this.create(resources));
  }

  protected createBackground({ baseTexture }: PixiJS.Texture) {
    const {
      map: {
        width: mapW,
        layers,
        tileset: {
          tile: { width: tileW, height: tileH },
          image: { width: imageW },
        },
      },
    } = this.options;
    return layers.map(
      ({ zIndex, tiles }: { zIndex: number; tiles: number[] }) => {
        const layerContainer = new PixiJS.Container();
        layerContainer.zIndex = zIndex;
        return tiles.reduce((c, tileId, i) => {
          if (tileId === 0) return c;

          const pos = tileId - 1;
          const tileX = pos * tileW;
          const tileSprite = new PixiJS.Sprite(
            new PixiJS.Texture(
              baseTexture,
              new PixiJS.Rectangle(
                tileX % imageW,
                Math.floor(tileX / imageW) * tileH,
                tileW,
                tileH
              )
            )
          );
          const mapRealW = mapW * tileW;
          const spriteX = i * tileW;
          tileSprite.position.set(
            spriteX % mapRealW,
            Math.floor(spriteX / mapRealW) * tileH
          );
          c.addChild(tileSprite);

          return c;
        }, layerContainer);
      }
    );
  }

  create(resources: PixiJS.utils.Dict<PixiJS.LoaderResource>) {
    const tiletexture = resources.tileimg.texture;
    if (!tiletexture) return this.onCreated(new Error("Tile image not loaded"));

    document.getElementById("canvas")?.appendChild(this.pixi.view);
    this.pixi.view.style.display = "block";
    this.pixi.view.style.margin = "auto";
    this.pixi.stage.sortableChildren = true;
    this.pixi.stage.addChild(...this.createBackground(tiletexture));
    const foreground = new PixiJS.Container();
    foreground.sortableChildren = true;
    foreground.zIndex = 1;
    this.pixi.stage.addChild(foreground);

    const context = {
      playAnimation: playAnimation(resources, this.options.sprites),
    };
    const stage = new Stage(
      {
        persons: {
          SIDeep: "x y",
          render: personView(context),
        },
        coins: {
          render: coinView(),
        },
      },
      { channel: this.channel, serializer, fps: this.options.fps }
    );
    stage.onAdd((created) =>
      foreground.addChild(...created.map(({ view }) => view))
    );
    stage.onDelete((created) =>
      foreground.removeChild(...created.map(({ view }) => view))
    );

    keyboard({
      KeyW: "w",
      KeyS: "s",
      KeyA: "a",
      KeyD: "d",
    }).on((data) => this.channel.emit("key", data, { reliable: true }));

    this.onCreated(stage);
  }
}
