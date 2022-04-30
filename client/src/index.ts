import geckos from "@geckos.io/client";
import { SnapshotInterpolation } from "@geckos.io/snapshot-interpolation";
import { Snapshot } from "@geckos.io/snapshot-interpolation/lib/types";
import * as PixiJS from "pixi.js";
import { Keyboard } from "@yandeu/keyboard";
import * as Render from "./render";
import { Coin, Person, animation } from "./world";

const channel = geckos({ port: 8080 });
channel.onConnect(async (error) => {
  if (error) throw new Error("Connection failed");

  const stage = {
    persons: new Render.Container(Person),
    coins: new Render.Container(Coin),
  };

  channel.on("init", async ({ state, options }: any) => {
    const SI = new SnapshotInterpolation(options.fps);

    const pixi = new PixiJS.Application({
      width: options.width,
      height: options.height,
    });
    pixi.loader.add("tileimg", options.map.tileset.image.url);
    Object.entries(options.sprites).forEach(([name, { url }]: any) =>
      pixi.loader.add(name, url)
    );
    pixi.loader.load(async (_, resources) => {
      const tiletexture = resources.tileimg.texture;
      if (!tiletexture) throw new Error("Tile image not loaded");

      document.getElementById("canvas")?.appendChild(pixi.view);
      pixi.view.style.display = "block";
      pixi.view.style.margin = "auto";
      pixi.stage.sortableChildren = true;

      const background = options.map.layers.map(
        ({ zIndex, tiles }: { zIndex: number; tiles: number[] }) => {
          const layerContainer = new PixiJS.Container();
          layerContainer.zIndex = zIndex;
          return tiles.reduce((c, tileId, i) => {
            if (tileId === 0) return c;

            const pos = tileId - 1;
            const tileSprite = new PixiJS.Sprite(
              new PixiJS.Texture(
                tiletexture.baseTexture,
                new PixiJS.Rectangle(
                  (pos * options.map.tileset.tile.width) %
                    options.map.tileset.image.width,
                  Math.floor(
                    (pos * options.map.tileset.tile.width) /
                      options.map.tileset.image.width
                  ) * options.map.tileset.tile.height,
                  options.map.tileset.tile.width,
                  options.map.tileset.tile.height
                )
              )
            );
            tileSprite.position.set(
              (i * options.map.tileset.tile.width) %
                (options.map.width * options.map.tileset.tile.width),
              Math.floor(
                (i * options.map.tileset.tile.width) /
                  (options.map.width * options.map.tileset.tile.width)
              ) * options.map.tileset.tile.height
            );
            c.addChild(tileSprite);

            return c;
          }, layerContainer);
        }
      );
      pixi.stage.addChild(...background);

      const context = {
        sprites: Object.entries(options.sprites).reduce(
          (sprites, [spriteName, { animations }]: [string, any]) => ({
            ...sprites,
            [spriteName]: Object.entries(animations).reduce(
              (animations, [animationName, { speed, frames }]: any) => {
                const texture = resources[spriteName].texture;
                if (!texture) {
                  throw new Error(
                    `Texture for sprite "${spriteName}" not found`
                  );
                }
                return {
                  ...animations,
                  [animationName]: animation({
                    textures: frames.map(
                      ([x, y, w, h]: [number, number, number, number]) =>
                        new PixiJS.Texture(
                          texture.baseTexture,
                          new PixiJS.Rectangle(x, y, w, h)
                        )
                    ),
                    speed,
                  }),
                };
              },
              {} as { [k: string]: PixiJS.AnimatedSprite }
            ),
          }),
          {}
        ),
      };

      const coinsContainer = new PixiJS.Container();
      coinsContainer.zIndex = 1;
      pixi.stage.addChild(coinsContainer);
      const personsContainer = new PixiJS.Container();
      personsContainer.zIndex = 2;
      pixi.stage.addChild(personsContainer);
      Object.entries(stage).forEach(([type, list]) => {
        const container = type === "persons" ? personsContainer : coinsContainer;
        list.onCreate.listen((created) =>
          container.addChild(...created.map(({ view }) => view))
        );
        list.onDelete.listen((deleted) => {
          container.removeChild(...deleted.map(({ view }) => view));
        });
      });
      Object.entries(stage).forEach(([type, container]) => {
        if (state[type]) container.init(context, ...state[type]);
      });
      channel.on("create", (snap: any) => {
        Object.entries(snap).forEach(([type, state]) =>
          stage[type as keyof typeof stage].create(context, ...(state as any[]))
        );
      });
      channel.on("delete", (snap: any) => {
        Object.entries(snap).forEach(([type, ids]) =>
          stage[type as keyof typeof stage].delete(...(ids as string[]))
        );
      });
      channel.on("update", (snap) => SI.snapshot.add(snap as Snapshot));

      const keyboard = new Keyboard();
      keyboard.on.down("KeyW KeyS KeyA KeyD", (key) => {
        channel.emit(
          "down",
          { KeyW: "w", KeyS: "s", KeyA: "a", KeyD: "d" }[key],
          {
            reliable: true,
          }
        );
      });
      keyboard.on.up("KeyW KeyS KeyA KeyD", (key) => {
        channel.emit(
          "up",
          { KeyW: "w", KeyS: "s", KeyA: "a", KeyD: "d" }[key],
          {
            reliable: true,
          }
        );
      });

      function animate() {
        requestAnimationFrame(animate);

        Object.entries(stage).forEach(([type, container]) => {
          const snap = SI.calcInterpolation(container.construct.SIDeep, type);
          if (snap) container.render(snap.state as any);
        });
      }
      animate();
    });
  });
});
