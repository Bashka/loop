import geckos from "@geckos.io/client";
import { SnapshotInterpolation } from "@geckos.io/snapshot-interpolation";
import * as PixiJS from "pixi.js";
import serializer from "../../server/src/model/schema";
import { playAnimation, keyboard } from "./utils";
import { Stage } from "./render";
import { personView, coinView } from "./view";

const channel = geckos({ port: 8080 });
channel.onConnect(async (error) => {
  if (error) throw new Error("Connection failed");

  channel.on("init", async ({ options, patch }: any) => {
    const SI = new SnapshotInterpolation(options.fps);
    const pixi = new PixiJS.Application({
      width: options.width,
      height: options.height,
    });
    pixi.loader
      .add("tileimg", options.map.tileset.image.url)
      .add(
        Object.entries(options.sprites).map(([name, { url }]: any) => ({
          name,
          url,
        }))
      )
      .load(async (_, resources) => {
        const context = {
          playAnimation: playAnimation(resources, options.sprites),
        };
        const stage = new Stage(SI, {
          persons: {
            SIDeep: "x y",
            render: personView(context),
          },
          coins: {
            SIDeep: null,
            render: coinView(context),
          },
        });

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

        const foreground = new PixiJS.Container();
        foreground.sortableChildren = true;
        foreground.zIndex = 1;
        pixi.stage.addChild(foreground);
        stage
          .forEarch(({ render }) => {
            render.onAdd((created) =>
              foreground.addChild(...created.map(({ view }) => view))
            );
            render.onDelete((created) =>
              foreground.removeChild(...created.map(({ view }) => view))
            );
          })
          .patch(patch);
        channel.on(
          "patch",
          (patch) => typeof patch === "object" && stage.patch(patch)
        );
        channel.onRaw(
          (buffer) =>
            buffer instanceof ArrayBuffer &&
            SI.snapshot.add(serializer.fromBuffer(buffer))
        );

        keyboard({
          KeyW: "w",
          KeyS: "s",
          KeyA: "a",
          KeyD: "d",
        }).on((data) => channel.emit("key", data, { reliable: true }));

        (function animate() {
          requestAnimationFrame(animate);
          stage.interpolate(
            (serializer.schema.struct as { state: object }).state
          );
        })();
      });
  });
});
